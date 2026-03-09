/**
 * app.js
 * ──────
 * 메인 컨트롤러 — 모듈 조립 + 상태 전이 + 이벤트 바인딩
 */

import {
  GAME_DATA_DOC_COUNT,
  loadGameDataWithProgress,
  loadTopRankings,
  loadUserData,
  saveCurrentRun,
  saveUserMeta,
  submitRanking,
} from './db-manager.js';
import { AppState, getState, setState, subscribe } from './game-state.js';
import { initFirebase, logOut, onAuthChange, signIn } from './firebase-init.js';
import {
  addSymbolToDeck,
  advanceStage,
  applyChoice,
  applyEffects,
  applyRewardEncounter,
  buildInitialDeck,
  calculateEndingOutcome,
  createInactiveRunState,
  createInitialRun,
  loadNode,
  normalizeRunState,
  pushReturnNode,
  rollEncounter,
} from './story-engine.js';
import {
  buildCombatEnemy,
  createCombatState,
  executeCombatRound,
  spin,
} from './combat-engine.js';
import {
  bindUIActions,
  renderClassSelection,
  renderCombatDefeat,
  renderCombatRoundResult,
  renderCombatScreen,
  renderCombatVictory,
  renderEndingView,
  renderLobby,
  renderSoundControls,
  renderUpgradeShop,
  renderScreen,
  renderStory,
  setAuthStatus,
  setBootProgress,
  setBootStatus,
  showToast,
} from './ui-renderer.js?v=20260309-nickguard-1';
import {
  getVolume,
  initSoundManager,
  isMuted,
  playBGM,
  playSFX,
  setMuted,
  setVolume,
  stopBGM,
} from './sound-manager.js';

if (typeof window !== 'undefined') {
  window.__PH_BOOT_DIAG__ = {
    ...(window.__PH_BOOT_DIAG__ || {}),
    appModuleLoaded: true,
    appModuleLoadedAt: Date.now(),
  };
}

const AUTO_SAVE_DELAY_MS = 300;
const COMBAT_BLOCKED_REASON = 'combat_in_progress';
const LOG_LIMIT = 500;
const COMBAT_RESULT_SETTLE_DELAY_MS = 650;
const LOCAL_BACKUP_PREFIX = 'ph:current-run:';
const PERF_LOG_PREFIX = '[perf]';
const PERF_HISTORY_LIMIT = 10;
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 16;

let authUnsubscribe = null;
let activeAuthTaskId = 0;
let retryAuthLoad = null;
let activeStoryView = null;
let classSelectLocked = false;
let queuedAutoSaveTimer = null;
let queuedAutoSaveResolvers = [];
let queuedAutoSaveRun = null;
let activeUpgradePurchaseId = null;
let activeNicknameSave = false;

function getPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function formatPerfDuration(durationMs) {
  return `${Number(durationMs || 0).toFixed(1)}ms`;
}

function getNavigationMetrics() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null;
  }

  const [entry] = performance.getEntriesByType('navigation');
  if (!entry) {
    return null;
  }

  const roundMetric = (value) => Number(Number(value || 0).toFixed(1));

  return {
    type: entry.type || 'navigate',
    domInteractiveMs: roundMetric(entry.domInteractive),
    domContentLoadedMs: roundMetric(entry.domContentLoadedEventEnd),
    loadEventMs: roundMetric(entry.loadEventEnd),
    transferSize: Number(entry.transferSize || 0),
    encodedBodySize: Number(entry.encodedBodySize || 0),
    decodedBodySize: Number(entry.decodedBodySize || 0),
  };
}

function storePerfReport(report) {
  if (typeof window === 'undefined') {
    return;
  }

  window.__PH_PERF_LAST__ = report;
  const existingHistory = Array.isArray(window.__PH_PERF_HISTORY__)
    ? window.__PH_PERF_HISTORY__
    : [];
  window.__PH_PERF_HISTORY__ = [
    ...existingHistory.slice(-(PERF_HISTORY_LIMIT - 1)),
    report,
  ];
}

function createPerfSession(label, context = {}) {
  const startedAt = getPerfNow();
  const steps = [];
  const activeSteps = new Map();
  let flushed = false;

  const sanitizeMeta = (meta = {}) => Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined),
  );

  const pushStep = (stepName, durationMs, status, meta = {}) => {
    steps.push({
      step: stepName,
      ms: Number(Number(durationMs || 0).toFixed(1)),
      status,
      ...sanitizeMeta(meta),
    });
  };

  return {
    startStep(stepName, meta = {}) {
      if (flushed) {
        return;
      }

      activeSteps.set(stepName, {
        startedAt: getPerfNow(),
        meta: sanitizeMeta(meta),
      });
    },
    endStep(stepName, meta = {}) {
      if (flushed) {
        return 0;
      }

      const activeStep = activeSteps.get(stepName);
      if (!activeStep) {
        return 0;
      }

      activeSteps.delete(stepName);
      const durationMs = getPerfNow() - activeStep.startedAt;
      pushStep(stepName, durationMs, 'done', {
        ...activeStep.meta,
        ...sanitizeMeta(meta),
      });
      return durationMs;
    },
    recordStep(stepName, durationMs = 0, meta = {}) {
      if (flushed) {
        return;
      }

      pushStep(stepName, durationMs, 'recorded', meta);
    },
    recordPoint(stepName, meta = {}) {
      if (flushed) {
        return;
      }

      pushStep(stepName, 0, 'point', meta);
    },
    setContext(key, value) {
      if (value === undefined) {
        return;
      }

      context[key] = value;
    },
    flush(status = 'success', extra = {}) {
      if (flushed) {
        return null;
      }

      flushed = true;
      const endedAt = getPerfNow();
      activeSteps.forEach((activeStep, stepName) => {
        pushStep(stepName, endedAt - activeStep.startedAt, 'open', activeStep.meta);
      });
      activeSteps.clear();

      const report = {
        label,
        status,
        totalMs: Number((endedAt - startedAt).toFixed(1)),
        context: sanitizeMeta({
          ...context,
          ...extra,
        }),
        navigation: getNavigationMetrics(),
        steps,
        createdAt: new Date().toISOString(),
      };

      storePerfReport(report);
      console.groupCollapsed(
        `${PERF_LOG_PREFIX} ${label} ${status} ${formatPerfDuration(report.totalMs)}`,
      );
      if (report.navigation) {
        console.log(`${PERF_LOG_PREFIX} navigation`, report.navigation);
      }
      console.table(report.steps);
      if (Object.keys(report.context).length > 0) {
        console.log(`${PERF_LOG_PREFIX} context`, report.context);
      }
      console.log(`${PERF_LOG_PREFIX} window.__PH_PERF_LAST__`, report);
      console.groupEnd();
      return report;
    },
  };
}

function getLocalBackupKey(uid) {
  return `${LOCAL_BACKUP_PREFIX}${uid}`;
}

function saveLocalBackup(uid, data) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(getLocalBackupKey(uid), JSON.stringify({
      savedAt: new Date().toISOString(),
      currentRun: cloneJsonCompatible(data),
    }));
  } catch (error) {
    console.warn('[app] Failed to save local backup', error);
  }
}

function loadLocalBackup(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLocalBackupKey(uid));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed?.currentRun ? normalizeRunState(parsed.currentRun) : null;
  } catch (error) {
    console.warn('[app] Failed to load local backup', error);
    return null;
  }
}

function clearLocalBackup(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(getLocalBackupKey(uid));
}

function getBgmTrackForScreen(screen) {
  if ([AppState.ENDING_DEATH, AppState.ENDING_SUCCESS, AppState.RANKING, AppState.PAYOUT, AppState.SURVIVAL_CHECK].includes(screen)) {
    return 'ending';
  }

  if (screen === AppState.COMBAT) {
    return 'battle';
  }

  if ([AppState.LOBBY, AppState.UPGRADE, AppState.CLASS_SELECT, AppState.PROLOGUE, AppState.STORY].includes(screen)) {
    return 'lobby';
  }

  return 'title';
}

function syncSoundControls() {
  const sounds = getState().gameData?.config?.sounds;
  if (!sounds) {
    renderSoundControls(null, null);
    return;
  }

  renderSoundControls(getVolume('bgm'), getVolume('sfx'));
}

function updateBootProgressState(current, total, label) {
  setState({
    uiState: {
      bootProgress: {
        current,
        total,
        label,
      },
    },
  });
  setBootProgress(current, total, label);
}

function resetBootProgressState() {
  updateBootProgressState(0, 0, '');
}

function transitionTo(nextScreen) {
  setState({
    uiState: {
      screen: nextScreen,
    },
  });

  void playBGM(getBgmTrackForScreen(nextScreen));
}

function normalizeNickname(value) {
  return Array.from(String(value || '').trim().replace(/\s+/g, ' '))
    .slice(0, NICKNAME_MAX_LENGTH)
    .join('');
}

function renderLobbyState() {
  const state = getState();
  renderLobby(state.user, state.currentRun, {
    hasUpgradeShop: hasUpgradeShop(),
    isNicknameSaving: activeNicknameSave,
  });
}

function formatRewardToast(encounter, rewardSummary, symbolsData) {
  const parts = [encounter.name || '보상 획득'];

  if (rewardSummary.gold > 0) {
    parts.push(`골드 +${rewardSummary.gold}`);
  }

  if (rewardSummary.heal > 0) {
    parts.push(`체력 +${rewardSummary.heal}`);
  }

  if (rewardSummary.addedSymbols.length > 0) {
    const names = rewardSummary.addedSymbols.map(
      (symbolId) => symbolsData?.[symbolId]?.name || symbolId,
    );
    parts.push(`획득 ${names.join(', ')}`);
  }

  return parts.join(' · ');
}

function formatCombatRewards(rewardSummary, symbolsData) {
  const parts = [];

  if (rewardSummary.gold > 0) {
    parts.push(`골드 +${rewardSummary.gold}`);
  }

  if (rewardSummary.addedSymbols.length > 0) {
    const names = rewardSummary.addedSymbols.map(
      (symbolId) => symbolsData?.[symbolId]?.name || symbolId,
    );
    parts.push(`획득 ${names.join(', ')}`);
  }

  return parts.join(' · ');
}

function getLoginErrorMessage(error) {
  const code = error?.code || '';

  if (code === 'auth/popup-blocked') {
    return '팝업이 차단되었습니다. 브라우저 설정을 확인해 주세요.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return '로그인이 취소되었습니다.';
  }

  if (code === 'auth/cancelled-popup-request') {
    return '이미 로그인 창이 열려 있습니다.';
  }

  return '로그인에 실패했습니다. 다시 시도해 주세요.';
}

function getLoadErrorMessage(error) {
  const code = error?.code || '';

  if (String(error?.message || '').startsWith('Missing GameData/')) {
    return 'GameData 문서 구성이 올바르지 않습니다. 필수 문서를 확인해 주세요.';
  }

  if (code.includes('unavailable') || code.includes('network')) {
    return '게임 데이터 로딩에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
  }

  return '유저 데이터 또는 게임 데이터를 불러오지 못했습니다. 다시 시도해 주세요.';
}

function getStoryNote(renderModel) {
  if (renderModel.type === 'shop') {
    return '아이템 구매 직후 자동 저장됩니다. 떠나기를 선택하면 원래 이야기로 복귀합니다.';
  }

  return '';
}

function buildClassSelectionModels(gameData) {
  return Object.entries(gameData?.classes || {}).map(([classId, classInfo]) => {
    const deck = buildInitialDeck(classId, gameData?.config?.bagCapacity ?? 20);
    const symbolCounts = deck
      .filter((symbolId) => symbolId !== 'empty')
      .reduce((accumulator, symbolId) => {
        accumulator[symbolId] = (accumulator[symbolId] || 0) + 1;
        return accumulator;
      }, {});

    const weaponLabels = Object.entries(symbolCounts).map(([symbolId, count]) => {
      const weaponName = gameData?.symbols?.[symbolId]?.name || symbolId;
      return `${weaponName} x${count}`;
    });

    return {
      classId,
      name: classInfo.name || classId,
      icon: classInfo.icon || '',
      weapons: weaponLabels,
      summary: `시작 덱 ${weaponLabels.join(' · ')}`,
    };
  });
}

function cloneJsonCompatible(value) {
  return JSON.parse(JSON.stringify(value));
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function getUpgradeDefinitions() {
  const upgrades = getState().gameData?.config?.upgrades;
  return upgrades && typeof upgrades === 'object' ? upgrades : {};
}

function hasUpgradeShop() {
  return Object.keys(getUpgradeDefinitions()).length > 0;
}

function buildCombatContext(monsterId, combatState) {
  if (!monsterId || !combatState) {
    return null;
  }

  return {
    monsterId,
    currentEnemyHp: Math.max(0, Number(combatState.currentEnemyHp || 0)),
    turnCount: Math.max(0, Number(combatState.turnCount || 0)),
    logs: Array.isArray(combatState.logs) ? combatState.logs.slice(-LOG_LIMIT) : [],
    lastSpinResult: combatState.lastSpinResult ? cloneJsonCompatible(combatState.lastSpinResult) : null,
    isAwaitingSpinCommit: Boolean(combatState.isAwaitingSpinCommit),
    resumeNodeId: combatState.resumeNodeId || null,
    restoreNodeId: combatState.restoreNodeId || combatState.resumeNodeId || null,
    victoryNodeId: combatState.victoryNodeId || null,
    defeatNodeId: combatState.defeatNodeId || null,
    sourceLabel: combatState.sourceLabel || null,
  };
}

function renderUpgradeState() {
  const state = getState();
  renderUpgradeShop(
    getUpgradeDefinitions(),
    state.user?.upgrades,
    state.user?.crystals,
    {
      purchasingId: activeUpgradePurchaseId,
      isBusy: Boolean(activeUpgradePurchaseId),
    },
  );
}

function calculateCrystalReward(endingResult, config) {
  const crystalRewardConfig = config?.crystalRewards || {};
  const base = Math.max(0, Number(crystalRewardConfig.base || 0));
  const perStage = Math.max(0, Number(crystalRewardConfig.perStage || 0));
  const successBonus = Math.max(0, Number(crystalRewardConfig.successBonus || 0));
  const rankableBonus = Math.max(0, Number(crystalRewardConfig.rankableBonus || 0));
  const isSuccess = endingResult?.endingData?.type === 'success';
  const isRankable = Boolean(endingResult?.isRankable);

  return base
    + (Math.max(1, Number(endingResult?.stageReached || 1)) * perStage)
    + (isSuccess ? successBonus : 0)
    + (isRankable ? rankableBonus : 0);
}

function createLogBuffer(existingLogs = [], events = []) {
  return [...existingLogs, ...events.map((event) => event.message)].slice(-LOG_LIMIT);
}

function cancelQueuedAutoSave() {
  if (queuedAutoSaveTimer) {
    window.clearTimeout(queuedAutoSaveTimer);
    queuedAutoSaveTimer = null;
  }

  queuedAutoSaveRun = null;
  queuedAutoSaveResolvers.forEach((resolve) => resolve(false));
  queuedAutoSaveResolvers = [];
}

async function persistRun(runSnapshot, options = {}) {
  const { showSuccessToast = true, successMessage = '💾 저장 완료', errorMessage = '⚠️ 저장에 실패했습니다. 네트워크를 확인해 주세요.' } = options;
  const user = getState().user;

  if (!user?.uid) {
    return false;
  }

  try {
    await saveCurrentRun(user.uid, runSnapshot);
    saveLocalBackup(user.uid, runSnapshot);
    if (showSuccessToast) {
      showToast(successMessage, 'success');
    }
    return true;
  } catch (error) {
    console.error('[app] Failed to save current run', error);
    saveLocalBackup(user.uid, runSnapshot);
    if (error?.localBackupSaved) {
      showToast('오프라인 백업에 저장했습니다. 네트워크 복구 후 다시 동기화됩니다.', 'info');
    }
    showToast(errorMessage, 'error');
    return false;
  }
}

async function flushQueuedAutoSave() {
  if (!queuedAutoSaveRun) {
    return false;
  }

  if (queuedAutoSaveTimer) {
    window.clearTimeout(queuedAutoSaveTimer);
    queuedAutoSaveTimer = null;
  }

  const runSnapshot = queuedAutoSaveRun;
  queuedAutoSaveRun = null;
  const resolvers = queuedAutoSaveResolvers;
  queuedAutoSaveResolvers = [];
  const result = await persistRun(runSnapshot);
  resolvers.forEach((resolve) => resolve(result));
  return result;
}

function queueAutoSave(reason, runOverride = null) {
  const runSnapshot = normalizeRunState(runOverride ?? getState().currentRun);
  queuedAutoSaveRun = runSnapshot;

  return new Promise((resolve) => {
    queuedAutoSaveResolvers.push(resolve);

    if (queuedAutoSaveTimer) {
      window.clearTimeout(queuedAutoSaveTimer);
    }

    queuedAutoSaveTimer = window.setTimeout(() => {
      console.log('[app] Auto-save', reason);
      void flushQueuedAutoSave();
    }, AUTO_SAVE_DELAY_MS);
  });
}

function clearTransientViews() {
  activeStoryView = null;
  setState({
    combatState: null,
    endingState: null,
  });
}

function deactivateCurrentRun(overrides = {}) {
  const nextRun = {
    ...normalizeRunState(getState().currentRun),
    ...createInactiveRunState(),
    ...overrides,
  };

  clearTransientViews();
  setState({ currentRun: nextRun });
  return nextRun;
}

function failToLobby(message, error = null) {
  if (error) {
    console.error('[app] Story flow failed', error);
  }

  deactivateCurrentRun();
  transitionTo(AppState.LOBBY);
  renderLobbyState();
  showToast(message, 'error');
}

function presentStoryNode(renderModel, currentRun, screen) {
  const state = getState();
  activeStoryView = {
    screen,
    renderModel,
  };

  setState({
    currentRun,
    combatState: null,
    endingState: null,
  });
  transitionTo(screen);
  renderStory(renderModel, {
    currentRun,
    gameData: state.gameData,
    note: getStoryNote(renderModel),
  });
}

function pickEncounterMonsterId(encounter) {
  const monsters = Array.isArray(encounter?.monsters) ? encounter.monsters : [];

  if (monsters.length === 0) {
    return null;
  }

  const pickIndex = Math.floor(Math.random() * monsters.length);
  return monsters[pickIndex];
}

function renderCurrentCombatScreen() {
  const state = getState();

  if (state.combatState && state.currentRun) {
    renderCombatScreen(state.combatState, state.currentRun, state.gameData);
  }
}

function renderCurrentEndingScreen() {
  const state = getState();

  if (state.endingState) {
    renderEndingView(state.uiState.screen, state.endingState, state.user);
  }
}

async function handleNicknameSave(rawNickname) {
  if (activeNicknameSave) {
    return;
  }

  const state = getState();
  const user = state.user;
  if (!user?.uid) {
    showToast('로그인 후 이용할 수 있습니다.', 'info');
    return;
  }

  const nextNickname = normalizeNickname(rawNickname);
  const currentNickname = normalizeNickname(user.displayName || '모험가');

  if (Array.from(nextNickname).length < NICKNAME_MIN_LENGTH) {
    showToast('닉네임은 2자 이상 입력해 주세요.', 'info');
    renderLobby(user, state.currentRun, {
      hasUpgradeShop: hasUpgradeShop(),
      isNicknameSaving: false,
      nicknameValue: rawNickname,
      nicknameStatus: '닉네임은 2~16자로 입력해 주세요.',
    });
    return;
  }

  if (nextNickname === currentNickname) {
    showToast('이미 사용 중인 닉네임입니다.', 'info');
    renderLobby(user, state.currentRun, {
      hasUpgradeShop: hasUpgradeShop(),
      isNicknameSaving: false,
      nicknameValue: nextNickname,
      nicknameStatus: '현재 사용 중인 닉네임입니다.',
    });
    return;
  }

  const previousUser = cloneJsonCompatible(user);
  const nextUser = {
    ...user,
    displayName: nextNickname,
  };

  activeNicknameSave = true;
  setState({ user: nextUser });
  renderLobby(nextUser, state.currentRun, {
    hasUpgradeShop: hasUpgradeShop(),
    isNicknameSaving: true,
    nicknameValue: nextNickname,
    nicknameStatus: '닉네임을 저장하는 중입니다...',
  });

  try {
    await saveUserMeta(user.uid, {
      displayName: nextNickname,
    });
    showToast('닉네임을 저장했습니다.', 'success');
  } catch (error) {
    console.error('[app] Failed to save nickname', error);
    setState({ user: previousUser });
    renderLobby(previousUser, state.currentRun, {
      hasUpgradeShop: hasUpgradeShop(),
      isNicknameSaving: false,
      nicknameValue: nextNickname,
      nicknameStatus: '닉네임 저장에 실패했습니다. 다시 시도해 주세요.',
    });
    showToast('닉네임 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    activeNicknameSave = false;
    if (getState().uiState.screen === AppState.LOBBY) {
      renderLobbyState();
    }
  }
}

function handleUpgrade() {
  if (!getState().user) {
    showToast('로그인 후 이용할 수 있습니다.', 'info');
    return;
  }

  if (!hasUpgradeShop()) {
    showToast('강화 데이터가 아직 준비되지 않았습니다.', 'info');
    return;
  }

  activeUpgradePurchaseId = null;
  transitionTo(AppState.UPGRADE);
  renderUpgradeState();
}

function handleUpgradeBack() {
  if (activeUpgradePurchaseId) {
    return;
  }

  transitionTo(AppState.LOBBY);
  renderLobbyState();
}

async function handleUpgradePurchase(upgradeId) {
  if (activeUpgradePurchaseId) {
    return;
  }

  const state = getState();
  const upgrade = getUpgradeDefinitions()[upgradeId];
  const user = state.user;

  if (!user?.uid || !upgrade) {
    showToast('강화 데이터를 찾지 못했습니다.', 'error');
    return;
  }

  const currentLevel = Math.max(0, Number(user.upgrades?.[upgradeId] || 0));
  const maxLevel = Math.max(1, Number(upgrade.maxLevel || 1));
  const cost = Math.max(0, Number(upgrade.cost || 0));

  if (currentLevel >= maxLevel) {
    showToast('이미 최대 강화 단계입니다.', 'info');
    return;
  }

  if (Number(user.crystals || 0) < cost) {
    showToast('결정이 부족합니다.', 'info');
    return;
  }

  const previousUser = cloneJsonCompatible(user);
  const nextUpgrades = {
    ...(user.upgrades || {}),
    [upgradeId]: currentLevel + 1,
  };
  const nextUser = {
    ...user,
    crystals: Number(user.crystals || 0) - cost,
    upgrades: nextUpgrades,
  };

  activeUpgradePurchaseId = upgradeId;
  setState({ user: nextUser });
  renderUpgradeState();

  try {
    await saveUserMeta(user.uid, {
      crystals: nextUser.crystals,
      upgrades: nextUser.upgrades,
    });
    playSFX('purchase');
    showToast(`${upgrade.name || upgradeId} 강화 완료`, 'success');
  } catch (error) {
    console.error('[app] Failed to save upgrade purchase', error);
    setState({ user: previousUser });
    showToast('강화 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    activeUpgradePurchaseId = null;
    if (getState().uiState.screen === AppState.UPGRADE) {
      renderUpgradeState();
    } else {
      renderLobbyState();
    }
  }
}

function startCombat(monsterId, baseRun, options = {}) {
  const state = getState();
  const monstersData = state.gameData?.monsters;

  if (!monsterId || !monstersData?.[monsterId]) {
    failToLobby('전투 몬스터 데이터를 찾지 못했습니다.');
    return false;
  }

  const enemy = buildCombatEnemy(monstersData, monsterId);
  const restoreNodeId = options.restoreNodeId || options.resumeNodeId || normalizeRunState(baseRun).currentNodeId;
  const combatState = createCombatState(enemy, {
    resumeNodeId: options.resumeNodeId || restoreNodeId,
    restoreNodeId,
    victoryNodeId: options.victoryNodeId || null,
    defeatNodeId: options.defeatNodeId || 'node_ending_death',
    sourceLabel: options.sourceLabel || enemy.name,
  });
  const combatRun = {
    ...normalizeRunState(baseRun),
    currentNodeId: restoreNodeId,
    blockedReason: COMBAT_BLOCKED_REASON,
    isActive: true,
    combatContext: buildCombatContext(monsterId, combatState),
  };

  activeStoryView = null;
  setState({
    currentRun: combatRun,
    combatState,
    endingState: null,
  });
  transitionTo(AppState.COMBAT);
  renderCombatScreen(combatState, combatRun, state.gameData);
  void persistRun(combatRun, {
    showSuccessToast: false,
    errorMessage: '전투 상태 저장에 실패했습니다. 네트워크를 확인해 주세요.',
  });
  return true;
}

function handleEndingNode(renderModel, currentRun) {
  const state = getState();
  const endingResult = calculateEndingOutcome(
    renderModel.endingId,
    state.gameData?.endings,
    currentRun,
  );

  if (!endingResult.endingId) {
    failToLobby('엔딩 데이터를 찾지 못했습니다.');
    return false;
  }

  const nextRun = {
    ...normalizeRunState(currentRun),
    currentNodeId: renderModel.nodeId,
    blockedReason: null,
    isActive: true,
  };
  const nextEndingState = {
    ...endingResult,
    crystalsEarned: calculateCrystalReward(endingResult, state.gameData?.config),
    isProcessing: false,
    isFinalized: false,
    rankingSubmitted: false,
    rankings: [],
  };

  activeStoryView = null;
  setState({
    currentRun: nextRun,
    combatState: null,
    endingState: nextEndingState,
  });
  void persistRun(nextRun, {
    showSuccessToast: false,
    errorMessage: '엔딩 상태 저장에 실패했습니다. 네트워크를 확인해 주세요.',
  });
  transitionTo(endingResult.endingData.type === 'death' ? AppState.ENDING_DEATH : AppState.ENDING_SUCCESS);
  renderEndingView(
    endingResult.endingData.type === 'death' ? AppState.ENDING_DEATH : AppState.ENDING_SUCCESS,
    nextEndingState,
    state.user,
  );
  return true;
}

function handleDirectCombatNode(renderModel, currentRun, options = {}) {
  const restoreNodeId = options.restoreNodeId || options.previousNodeId || currentRun.currentNodeId;

  return startCombat(renderModel.combatMonster, currentRun, {
    sourceLabel: renderModel.title || renderModel.combatMonster,
    victoryNodeId: renderModel.onWin,
    defeatNodeId: renderModel.onLose || 'node_ending_death',
    restoreNodeId,
  });
}

function enterStoryNode(nodeId, baseRun, options = {}) {
  const state = getState();
  const storyData = state.gameData?.story;

  if (!storyData) {
    failToLobby('스토리 데이터가 준비되지 않았습니다.');
    return false;
  }

  let nextRun = normalizeRunState(baseRun);
  const previousNodeId = nextRun.currentNodeId;

  if (options.returnNodeId) {
    nextRun = pushReturnNode(nextRun, options.returnNodeId);
  }

  let initialRenderModel;
  try {
    initialRenderModel = loadNode(nodeId, storyData, nextRun);
  } catch (error) {
    failToLobby('스토리 노드를 불러오지 못했습니다. 로비로 돌아갑니다.', error);
    return false;
  }

  if (!options.skipOnEnter) {
    nextRun = applyEffects(initialRenderModel.onEnter, nextRun);
  }
  nextRun.currentNodeId = nodeId;
  nextRun.blockedReason = null;

  let renderModel;
  try {
    renderModel = loadNode(nodeId, storyData, nextRun);
  } catch (error) {
    failToLobby('스토리 노드를 다시 구성하지 못했습니다. 로비로 돌아갑니다.', error);
    return false;
  }

  if (renderModel.type === 'encounter_trigger') {
    return handleEncounterTrigger(renderModel, nextRun);
  }

  if (renderModel.type === 'combat') {
    return handleDirectCombatNode(renderModel, nextRun, {
      restoreNodeId: options.restoreNodeId || previousNodeId,
      previousNodeId,
    });
  }

  if (renderModel.type === 'ending') {
    return handleEndingNode(renderModel, nextRun);
  }

  presentStoryNode(renderModel, nextRun, options.screen || AppState.STORY);
  return true;
}

function handleEncounterTrigger(renderModel, currentRun) {
  const state = getState();
  const encounter = rollEncounter(renderModel.encounterPool, state.gameData?.encounters, currentRun);

  if (!encounter) {
    if (!renderModel.afterEncounter) {
      failToLobby('진행 가능한 인카운트가 없고 다음 노드도 없습니다.');
      return false;
    }

    return enterStoryNode(renderModel.afterEncounter, currentRun, { screen: AppState.STORY });
  }

  const progressedRun = advanceStage(currentRun, 1);

  if (encounter.type === 'reward') {
    const { updatedState, rewardSummary } = applyRewardEncounter(
      encounter,
      progressedRun,
    );
    showToast(formatRewardToast(encounter, rewardSummary, state.gameData?.symbols), 'success');

    if (rewardSummary.skippedSymbols.length > 0) {
      showToast('가방이 가득 차 일부 보상을 획득하지 못했습니다.', 'info');
    }

    if (!renderModel.afterEncounter) {
      failToLobby('보상 인카운트 이후 이동할 노드가 없습니다.');
      return false;
    }

    return enterStoryNode(renderModel.afterEncounter, updatedState, { screen: AppState.STORY });
  }

  if (encounter.type === 'combat') {
    const monsterId = pickEncounterMonsterId(encounter);

    if (!monsterId) {
      failToLobby('전투 인카운트의 몬스터 목록이 비어 있습니다.');
      return false;
    }

    return startCombat(monsterId, progressedRun, {
      sourceLabel: encounter.name || monsterId,
      resumeNodeId: renderModel.afterEncounter,
      restoreNodeId: renderModel.afterEncounter,
    });
  }

  if (encounter.type === 'event') {
    const targetNode = state.gameData?.story?.[encounter.storyNodeId];

    if (!targetNode) {
      failToLobby('이벤트 인카운트가 올바른 스토리 노드를 가리키지 않습니다.');
      return false;
    }

    const returnNodeId = targetNode.type === 'shop'
      ? (renderModel.afterEncounter || currentRun.currentNodeId)
      : null;

    showToast(encounter.description || encounter.name || '이벤트가 발생했습니다.', 'info');
    return enterStoryNode(encounter.storyNodeId, progressedRun, {
      screen: AppState.STORY,
      returnNodeId,
    });
  }

  failToLobby('알 수 없는 인카운트 타입입니다.');
  return false;
}

function resolveRestoreNodeId(run, storyData) {
  const currentNodeId = run.currentNodeId;
  const currentNode = storyData?.[currentNodeId];

  if (!currentNodeId || !currentNode) {
    return null;
  }

  if (currentNode.type !== 'combat') {
    return currentNodeId;
  }

  const parentEntry = Object.entries(storyData || {}).find(([, candidate]) => (
    Array.isArray(candidate?.choices)
      && candidate.choices.some((choice) => choice.nextNodeId === currentNodeId)
  ));

  return parentEntry?.[0] || null;
}

function restoreCombatFromRun(currentRun) {
  const state = getState();
  const combatContext = currentRun?.combatContext;

  if (!combatContext?.monsterId) {
    return false;
  }

  try {
    const enemy = buildCombatEnemy(state.gameData?.monsters, combatContext.monsterId);
    const restoredCombatState = createCombatState(enemy, combatContext);
    const restoredRun = {
      ...normalizeRunState(currentRun),
      blockedReason: COMBAT_BLOCKED_REASON,
      combatContext: buildCombatContext(combatContext.monsterId, restoredCombatState),
    };

    activeStoryView = null;
    setState({
      currentRun: restoredRun,
      combatState: restoredCombatState,
      endingState: null,
    });
    transitionTo(AppState.COMBAT);
    renderCombatScreen(restoredCombatState, restoredRun, state.gameData);
    showToast('전투 중이던 런을 복구했습니다.', 'info');
    return true;
  } catch (error) {
    console.error('[app] Failed to restore combat state', error);
    return false;
  }
}

function restoreActiveRun(currentRun) {
  const state = getState();
  const storyData = state.gameData?.story;
  const restoredRun = normalizeRunState(currentRun);

  if (
    restoredRun.blockedReason === COMBAT_BLOCKED_REASON
    && restoredRun.combatContext?.monsterId
    && restoreCombatFromRun(restoredRun)
  ) {
    return true;
  }

  const restoreNodeId = resolveRestoreNodeId(restoredRun, storyData);

  if (!restoreNodeId) {
    failToLobby('복구할 런 위치를 찾지 못했습니다. 로비로 돌아갑니다.');
    return false;
  }

  const safeRun = {
    ...restoredRun,
    currentNodeId: restoreNodeId,
    blockedReason: null,
    combatContext: null,
  };

  setState({ currentRun: safeRun });
  return enterStoryNode(restoreNodeId, safeRun, {
    screen: AppState.STORY,
    skipOnEnter: true,
  });
}

function handleStartRun() {
  const state = getState();
  const currentRun = normalizeRunState(state.currentRun);

  if (!state.gameData) {
    showToast('게임 데이터가 아직 준비되지 않았습니다.', 'error');
    return;
  }

  if (currentRun.isActive) {
    showToast('이전 런이 감지되었습니다. 이어서 진행합니다.', 'info');
    restoreActiveRun(currentRun);
    return;
  }

  classSelectLocked = false;
  renderClassSelection(buildClassSelectionModels(state.gameData), { locked: false });
  transitionTo(AppState.CLASS_SELECT);
}

function handleClassSelect(classId) {
  if (classSelectLocked) {
    return;
  }

  const state = getState();
  if (!state.gameData?.classes?.[classId]) {
    showToast('선택한 직업 데이터를 찾지 못했습니다.', 'error');
    return;
  }

  classSelectLocked = true;
  playSFX('click');
  renderClassSelection(buildClassSelectionModels(state.gameData), { locked: true });

  const nextRun = createInitialRun(classId, state.gameData.config, state.user?.upgrades);
  setState({ currentRun: nextRun });
  if (enterStoryNode('node_prologue', nextRun, { screen: AppState.PROLOGUE })) {
    void queueAutoSave('run-start', getState().currentRun);
  }
}

function handleStoryChoice(choiceIndex) {
  const state = getState();
  const currentRun = normalizeRunState(state.currentRun);
  const renderModel = activeStoryView?.renderModel;
  const choice = renderModel?.choices?.[choiceIndex];

  if (!choice) {
    showToast('선택지를 처리하지 못했습니다.', 'error');
    return;
  }

  playSFX('click');

  let nextNodeId;
  let updatedState;

  try {
    ({ nextNodeId, updatedState } = applyChoice(choice, currentRun));
  } catch (error) {
    failToLobby('선택지 적용에 실패했습니다. 로비로 돌아갑니다.', error);
    return;
  }

  if (!nextNodeId) {
    failToLobby('다음 노드를 찾지 못했습니다.');
    return;
  }

  const targetNode = state.gameData?.story?.[nextNodeId];
  if (!targetNode) {
    failToLobby('대상 스토리 노드가 존재하지 않습니다.');
    return;
  }

  const entered = enterStoryNode(nextNodeId, updatedState, {
    screen: AppState.STORY,
    returnNodeId: targetNode.type === 'shop' ? currentRun.currentNodeId : null,
    restoreNodeId: currentRun.currentNodeId,
  });

  if (entered) {
    void queueAutoSave('story-choice', getState().currentRun);
  }
}

function handleShopPurchase(symbolId) {
  const state = getState();
  const currentRun = normalizeRunState(state.currentRun);
  const renderModel = activeStoryView?.renderModel;
  const shopItem = renderModel?.shopItems?.find((item) => item.symbolId === symbolId);
  const symbolData = state.gameData?.symbols?.[symbolId];

  if (!shopItem || renderModel?.type !== 'shop') {
    showToast('구매 가능한 상점 아이템이 아닙니다.', 'error');
    return;
  }

  if (currentRun.gold < Number(shopItem.cost || 0)) {
    showToast('골드가 부족합니다.', 'info');
    return;
  }

  const spendGoldRun = {
    ...currentRun,
    gold: currentRun.gold - Number(shopItem.cost || 0),
  };

  const addResult = addSymbolToDeck(spendGoldRun, symbolId);
  if (!addResult.added) {
    showToast('가방이 가득 찼습니다.', 'info');
    return;
  }

  const refreshedRun = addResult.updatedState;
  let refreshedRenderModel;

  try {
    refreshedRenderModel = loadNode(renderModel.nodeId, state.gameData?.story, refreshedRun);
  } catch (error) {
    failToLobby('상점 상태를 갱신하지 못했습니다. 로비로 돌아갑니다.', error);
    return;
  }

  activeStoryView = {
    screen: AppState.STORY,
    renderModel: refreshedRenderModel,
  };

  setState({ currentRun: refreshedRun });
  renderStory(refreshedRenderModel, {
    currentRun: refreshedRun,
    gameData: state.gameData,
    note: getStoryNote(refreshedRenderModel),
  });
  playSFX('purchase');
  showToast(`${symbolData?.name || symbolId}을(를) 구매했습니다.`, 'success');
  void queueAutoSave('shop-purchase', refreshedRun);
}

function createCombatSpinPreview(currentRun, gameData) {
  return spin(currentRun.deck, gameData?.symbols, {
    spinCount: gameData?.config?.spinCount,
    synergyDefs: gameData?.config?.synergies,
  });
}

async function resolveCombatRound(currentRun, combatState, spinDetail) {
  const state = getState();
  const resolvingState = {
    ...combatState,
    isResolving: true,
  };

  setState({ combatState: resolvingState });
  renderCombatScreen(resolvingState, currentRun, state.gameData);

  const roundResult = executeCombatRound({
    player: currentRun,
    deck: currentRun.deck,
    enemy: combatState.enemy,
    currentEnemyHp: combatState.currentEnemyHp,
    config: state.gameData?.config,
    symbolsData: state.gameData?.symbols,
    spinDetail,
  });

  if (Array.isArray(roundResult.synergies) && roundResult.synergies.length > 0) {
    showToast(
      `시너지 발동: ${roundResult.synergies.map((synergy) => synergy.label).join(', ')}`,
      'info',
    );
  }

  await renderCombatRoundResult(roundResult, resolvingState, state.gameData?.symbols);
  const nextRun = {
    ...normalizeRunState(roundResult.playerState),
    currentNodeId: currentRun.currentNodeId,
    blockedReason: currentRun.blockedReason,
  };
  const nextCombatState = {
    ...combatState,
    currentEnemyHp: roundResult.currentEnemyHp,
    turnCount: combatState.turnCount + 1,
    lastSpinResult: roundResult.spinDetail,
    logs: createLogBuffer(combatState.logs, roundResult.events),
    isAwaitingSpinCommit: false,
    isResolving: false,
  };
  nextRun.combatContext = buildCombatContext(combatState.enemy?.id, nextCombatState);

  setState({
    currentRun: nextRun,
    combatState: nextCombatState,
  });
  renderCurrentCombatScreen();

  if (roundResult.result === 'ongoing') {
    await persistRun(nextRun, {
      showSuccessToast: false,
      errorMessage: '전투 진행 저장에 실패했습니다. 네트워크를 확인해 주세요.',
    });
    return;
  }

  const rewardSummary = roundResult.rewardSummary || {
    gold: 0,
    addedSymbols: [],
    skippedSymbols: [],
    exp: 0,
  };
  const destinationNodeId = roundResult.result === 'win'
    ? (combatState.victoryNodeId || combatState.resumeNodeId)
    : (combatState.defeatNodeId || 'node_ending_death');
  const completedRun = {
    ...normalizeRunState(nextRun),
    currentNodeId: destinationNodeId || combatState.resumeNodeId || nextRun.currentNodeId,
    blockedReason: null,
    isActive: true,
    combatContext: null,
  };

  if (rewardSummary.skippedSymbols.length > 0) {
    showToast('가방이 가득 차 일부 전리품을 획득하지 못했습니다.', 'info');
  }

  if (roundResult.result === 'win') {
    const rewardText = formatCombatRewards(rewardSummary, state.gameData?.symbols);
    if (rewardText) {
      showToast(`승리 보상 · ${rewardText}`, 'success');
    } else {
      showToast('전투 승리', 'success');
    }
    renderCombatVictory(rewardSummary, state.gameData?.symbols);
  } else {
    showToast('전투에서 쓰러졌습니다.', 'error');
    renderCombatDefeat(nextRun);
  }

  await wait(COMBAT_RESULT_SETTLE_DELAY_MS);
  setState({
    currentRun: completedRun,
    combatState: null,
  });
  cancelQueuedAutoSave();
  await persistRun(completedRun, {
    showSuccessToast: false,
    errorMessage: '전투 종료 상태 저장에 실패했습니다. 네트워크를 확인해 주세요.',
  });

  if (!destinationNodeId) {
    failToLobby('전투 이후 이동할 노드가 없습니다.');
    return;
  }

  enterStoryNode(destinationNodeId, completedRun, {
    screen: roundResult.result === 'win' ? AppState.STORY : AppState.SURVIVAL_CHECK,
  });
}

async function handleCombatReroll() {
  const state = getState();
  const combatState = state.combatState;
  const currentRun = normalizeRunState(state.currentRun);
  const rerollCost = Math.max(0, Number(state.gameData?.config?.rerollCost || 0));

  if (!combatState || combatState.isResolving || !combatState.isAwaitingSpinCommit) {
    return;
  }

  if (currentRun.gold < rerollCost) {
    showToast('골드가 부족합니다.', 'info');
    return;
  }

  playSFX('spin');
  const nextRun = {
    ...currentRun,
    gold: currentRun.gold - rerollCost,
  };
  const nextCombatState = {
    ...combatState,
    lastSpinResult: createCombatSpinPreview(nextRun, state.gameData),
    isAwaitingSpinCommit: true,
    isResolving: false,
  };
  nextRun.combatContext = buildCombatContext(combatState.enemy?.id, nextCombatState);

  setState({
    currentRun: nextRun,
    combatState: nextCombatState,
  });
  renderCurrentCombatScreen();
  showToast(`리롤 완료 · ${rerollCost}G 사용`, 'success');
  await persistRun(nextRun, {
    showSuccessToast: false,
    errorMessage: '리롤 상태 저장에 실패했습니다. 네트워크를 확인해 주세요.',
  });
}

async function handleCombatSpin() {
  const state = getState();
  const combatState = state.combatState;
  const currentRun = normalizeRunState(state.currentRun);

  if (!combatState || combatState.isResolving) {
    return;
  }

  if (combatState.isAwaitingSpinCommit && combatState.lastSpinResult) {
    await resolveCombatRound(currentRun, combatState, combatState.lastSpinResult);
    return;
  }

  playSFX('spin');
  const previewSpinResult = createCombatSpinPreview(currentRun, state.gameData);
  const previewCombatState = {
    ...combatState,
    lastSpinResult: previewSpinResult,
    isAwaitingSpinCommit: true,
    isResolving: false,
  };
  const previewRun = {
    ...currentRun,
    combatContext: buildCombatContext(combatState.enemy?.id, previewCombatState),
  };

  setState({
    currentRun: previewRun,
    combatState: previewCombatState,
  });
  renderCurrentCombatScreen();
  showToast('결과를 확인하고 확정하거나 리롤할 수 있습니다.', 'info');
}

async function finalizeEnding(options = {}) {
  const { submitRank = false } = options;
  const state = getState();
  const endingState = state.endingState;

  if (!endingState || endingState.isProcessing) {
    return;
  }

  cancelQueuedAutoSave();

  const processingState = {
    ...endingState,
    isProcessing: true,
  };

  setState({ endingState: processingState });
  renderCurrentEndingScreen();

  const finalizedRun = {
    ...normalizeRunState(state.currentRun),
    isActive: false,
    blockedReason: null,
    encounterHistory: [],
  };
  const updatedUser = {
    ...state.user,
    totalGoldEarned: Number(state.user?.totalGoldEarned || 0) + Number(endingState.payout || 0),
    highestStage: Math.max(Number(state.user?.highestStage || 0), Number(endingState.stageReached || 0)),
    crystals: Number(state.user?.crystals || 0) + Number(endingState.crystalsEarned || 0),
  };

  const runSaved = await persistRun(finalizedRun, {
    showSuccessToast: false,
    errorMessage: '메타 저장 전에 런 종료 상태를 저장하지 못했습니다. 다시 시도해 주세요.',
  });

  if (!runSaved) {
    setState({
      endingState: {
        ...processingState,
        isProcessing: false,
      },
    });
    renderCurrentEndingScreen();
    return;
  }

  try {
    await saveUserMeta(updatedUser.uid, {
      totalGoldEarned: updatedUser.totalGoldEarned,
      highestStage: updatedUser.highestStage,
      crystals: updatedUser.crystals,
    });
  } catch (error) {
    console.error('[app] Failed to save user meta', error);
    showToast('메타 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
    setState({
      endingState: {
        ...processingState,
        isProcessing: false,
      },
      currentRun: finalizedRun,
    });
    renderCurrentEndingScreen();
    return;
  }

  const nextEndingState = {
    ...processingState,
    isProcessing: false,
    isFinalized: true,
  };

  setState({
    user: updatedUser,
    currentRun: finalizedRun,
    endingState: nextEndingState,
  });

  if (submitRank && endingState.isRankable) {
    try {
      await submitRanking({
        uid: updatedUser.uid,
        displayName: updatedUser.displayName || '모험가',
        endingId: endingState.endingId,
        stage: endingState.stageReached,
        payout: endingState.payout,
      });
      nextEndingState.rankingSubmitted = true;
    } catch (error) {
      console.error('[app] Failed to submit ranking', error);
      showToast('랭킹 등록에 실패했습니다. 보상은 정상 지급됩니다.', 'error');
      nextEndingState.rankingSubmitted = false;
    }

    if (nextEndingState.rankingSubmitted) {
      try {
        nextEndingState.rankings = await loadTopRankings();
      } catch (error) {
        console.error('[app] Failed to load rankings', error);
        showToast('랭킹 목록을 불러오지 못했습니다.', 'error');
        nextEndingState.rankings = [];
      }

      setState({ endingState: nextEndingState });
      transitionTo(AppState.RANKING);
      renderEndingView(AppState.RANKING, nextEndingState, updatedUser);
      showToast('원정 결과가 정산되었습니다.', 'success');
      return;
    }
  }

  setState({ endingState: nextEndingState });
  transitionTo(AppState.PAYOUT);
  renderEndingView(AppState.PAYOUT, nextEndingState, updatedUser);
  showToast('원정 결과가 정산되었습니다.', 'success');
}

async function handleEndingPrimary() {
  const state = getState();

  if (state.uiState.screen === AppState.ENDING_DEATH || state.uiState.screen === AppState.ENDING_SUCCESS) {
    await finalizeEnding({ submitRank: Boolean(state.endingState?.isRankable) });
    return;
  }

  if (state.uiState.screen === AppState.RANKING) {
    transitionTo(AppState.PAYOUT);
    renderEndingView(AppState.PAYOUT, state.endingState, state.user);
    return;
  }

  if (state.uiState.screen === AppState.PAYOUT) {
    setState({
      endingState: null,
      combatState: null,
    });
    transitionTo(AppState.LOBBY);
    renderLobbyState();
  }
}

async function handleEndingSecondary() {
  const state = getState();

  if (state.uiState.screen === AppState.ENDING_SUCCESS && state.endingState?.isRankable) {
    await finalizeEnding({ submitRank: false });
  }
}

async function loadAllDataParallel(authUser, perfSession = null) {
  const progressTotal = GAME_DATA_DOC_COUNT + 1;
  const loadedDocs = new Set();
  let isUserLoaded = false;
  let userLoadError = null;
  const gameDataSources = {
    memoryCacheDocs: 0,
    firestoreCacheDocs: 0,
    serverDocs: 0,
  };

  const updateProgress = (label) => {
    const current = loadedDocs.size + (isUserLoaded ? 1 : 0);
    updateBootProgressState(current, progressTotal, label);
  };

  updateProgress('데이터 로드를 시작합니다.');
  perfSession?.startStep('load-game-data');
  perfSession?.startStep('load-user-data');

  const gameDataPromise = loadGameDataWithProgress((current, total, docId, meta = {}) => {
    loadedDocs.add(docId);
    const source = meta.replayed || meta.cached
      ? 'memory-cache'
      : meta.fromCache
        ? 'firestore-cache'
        : 'server';
    if (source === 'memory-cache') {
      gameDataSources.memoryCacheDocs += 1;
    } else if (source === 'firestore-cache') {
      gameDataSources.firestoreCacheDocs += 1;
    } else {
      gameDataSources.serverDocs += 1;
    }
    perfSession?.recordStep(`GameData/${docId}`, Number(meta.durationMs || 0), {
      source,
    });
    updateProgress(`GameData/${docId} 로드 완료 (${current}/${total})`);
  })
    .then((gameData) => {
      perfSession?.endStep('load-game-data', {
        docs: GAME_DATA_DOC_COUNT,
        serverDocs: gameDataSources.serverDocs,
        firestoreCacheDocs: gameDataSources.firestoreCacheDocs,
        memoryCacheDocs: gameDataSources.memoryCacheDocs,
      });
      return gameData;
    })
    .catch((error) => {
      perfSession?.endStep('load-game-data', {
        failed: true,
        error: error?.code || error?.message || 'unknown',
      });
      throw error;
    });

  const userPromise = loadUserData(authUser, null, (phase, meta = {}) => {
    perfSession?.recordStep(`Users/${authUser.uid}:${phase}`, Number(meta.durationMs || 0), {
      source: meta.created
        ? 'firestore-write'
        : meta.fromCache
          ? 'firestore-cache'
          : 'server',
      exists: meta.exists,
      created: meta.created,
    });
  })
    .then((user) => {
      isUserLoaded = true;
      updateProgress('유저 데이터 로드 완료');
      perfSession?.endStep('load-user-data', {
        source: 'firestore',
      });
      return user;
    })
    .catch((error) => {
      userLoadError = error;
      perfSession?.endStep('load-user-data', {
        failed: true,
        error: error?.code || error?.message || 'unknown',
      });
      return null;
    });

  const [gameData, loadedUser] = await Promise.all([gameDataPromise, userPromise]);

  if (loadedUser) {
    clearLocalBackup(authUser.uid);
    updateBootProgressState(progressTotal, progressTotal, '데이터 로드 완료');
    return { gameData, user: loadedUser };
  }

  const backupRun = loadLocalBackup(authUser.uid);

  if (!backupRun) {
    throw userLoadError;
  }

  isUserLoaded = true;
  updateBootProgressState(progressTotal, progressTotal, '오프라인 백업 복구 완료');
  perfSession?.recordPoint('user-data-fallback', {
    source: 'local-backup',
    stage: Number(backupRun.stage || 0),
    nodeId: backupRun.currentNodeId || null,
  });
  perfSession?.setContext('usedLocalBackup', true);
  showToast('Firestore 로드에 실패해 오프라인 백업에서 복구했습니다.', 'info');

  return {
    gameData,
    user: {
      uid: authUser.uid,
      email: authUser.email || null,
      photoURL: authUser.photoURL || null,
      displayName: authUser.displayName || '모험가',
      createdAt: null,
      totalGoldEarned: 0,
      highestStage: Math.max(0, Number(backupRun.stage || 0)),
      crystals: 0,
      upgrades: {},
      currentRun: backupRun,
    },
  };
}

async function restoreAuthenticatedSession(authUser, inheritedPerfSession = null) {
  const taskId = ++activeAuthTaskId;
  const perfSession = inheritedPerfSession || createPerfSession('auth-restore', {
    uid: authUser.uid,
    email: authUser.email || null,
  });
  perfSession.startStep('session-restore');
  perfSession.recordPoint('auth-user-detected', {
    uid: authUser.uid,
  });
  retryAuthLoad = () => {
    void restoreAuthenticatedSession(authUser);
  };

  transitionTo(AppState.BOOT);
  setBootStatus('로그인 확인 완료. 데이터를 동기화하는 중...');
  updateBootProgressState(0, GAME_DATA_DOC_COUNT + 1, '불러오는 중...');
  setState({
    uiState: {
      authBusy: true,
      authMessage: '게임 데이터 로딩 중...',
    },
  });
  setAuthStatus({
    message: '게임 데이터 로딩 중...',
    isBusy: true,
    showRetry: false,
    loginDisabled: true,
  });

  try {
    const { gameData, user } = await loadAllDataParallel(authUser, perfSession);

    if (taskId !== activeAuthTaskId) {
      perfSession.flush('cancelled', {
        reason: 'stale-auth-task',
      });
      return;
    }

    perfSession.startStep('sound-init');
    initSoundManager(gameData?.config?.sounds || null);
    syncSoundControls();
    perfSession.endStep('sound-init');

    if (taskId !== activeAuthTaskId) {
      perfSession.flush('cancelled', {
        reason: 'stale-auth-task',
      });
      return;
    }

    retryAuthLoad = null;
    const restoredRun = normalizeRunState(user.currentRun);
    perfSession.startStep('state-hydration');
    setState({
      gameData,
      user,
      currentRun: restoredRun,
      combatState: null,
      endingState: null,
      uiState: {
        authBusy: false,
        authMessage: '로비 진입 완료',
      },
    });
    resetBootProgressState();
    perfSession.endStep('state-hydration', {
      activeRun: restoredRun.isActive,
    });

    if (restoredRun.isActive) {
      perfSession.startStep('active-run-restore');
      showToast('이전 런이 감지되었습니다. 이어서 진행합니다.', 'info');
      const restored = restoreActiveRun(restoredRun);
      perfSession.endStep('active-run-restore', {
        restored,
        nodeId: restoredRun.currentNodeId || null,
        hasCombatContext: Boolean(restoredRun.combatContext),
      });
      if (!restored) {
        perfSession.startStep('lobby-fallback');
        transitionTo(AppState.LOBBY);
        renderLobbyState();
        perfSession.endStep('lobby-fallback');
      }
      perfSession.endStep('session-restore', {
        activeRun: true,
      });
      perfSession.flush('success', {
        finalScreen: getState().uiState.screen,
        activeRun: true,
      });
      return;
    }

    perfSession.startStep('lobby-entry');
    renderLobbyState();
    transitionTo(AppState.LOBBY);
    perfSession.endStep('lobby-entry');
    perfSession.endStep('session-restore', {
      activeRun: false,
    });
    perfSession.flush('success', {
      finalScreen: AppState.LOBBY,
      activeRun: false,
    });
    showToast('로비에 입장했습니다.', 'success');
  } catch (error) {
    if (taskId !== activeAuthTaskId) {
      perfSession.flush('cancelled', {
        reason: 'stale-auth-task',
      });
      return;
    }

    console.error('[app] Failed to restore authenticated session', error);
    resetBootProgressState();
    transitionTo(AppState.AUTH);
    setState({
      user: null,
      currentRun: null,
      gameData: null,
      combatState: null,
      endingState: null,
      uiState: {
        authBusy: false,
        authMessage: getLoadErrorMessage(error),
      },
    });
    setAuthStatus({
      message: getLoadErrorMessage(error),
      isBusy: false,
      showRetry: true,
      isError: true,
      loginDisabled: true,
    });
    perfSession.flush('error', {
      error: error?.code || error?.message || 'unknown',
      finalScreen: AppState.AUTH,
    });
    showToast(getLoadErrorMessage(error), 'error');
  }
}

async function handleGoogleLogin() {
  setState({
    uiState: {
      authBusy: true,
      authMessage: '구글 로그인 창을 여는 중...',
    },
  });
  setAuthStatus({
    message: '구글 로그인 창을 여는 중...',
    isBusy: true,
    showRetry: false,
    loginDisabled: true,
  });

  try {
    await signIn();
  } catch (error) {
    console.error('[app] Google sign-in failed', error);
    setState({
      uiState: {
        authBusy: false,
        authMessage: getLoginErrorMessage(error),
      },
    });
    setAuthStatus({
      message: getLoginErrorMessage(error),
      isBusy: false,
      showRetry: false,
      isError: true,
      loginDisabled: false,
    });
    showToast(getLoginErrorMessage(error), 'error');
  }
}

async function handleLogout() {
  cancelQueuedAutoSave();

  try {
    await logOut();
    showToast('로그아웃했습니다.', 'info');
  } catch (error) {
    console.error('[app] Logout failed', error);
    showToast('로그아웃에 실패했습니다. 다시 시도해 주세요.', 'error');
  }
}

function handleSignedOut() {
  retryAuthLoad = null;
  activeAuthTaskId += 1;
  classSelectLocked = false;
  activeUpgradePurchaseId = null;
  activeNicknameSave = false;
  cancelQueuedAutoSave();
  clearTransientViews();
  setState({
    user: null,
    currentRun: null,
    gameData: null,
    uiState: {
      authBusy: false,
      authMessage: '구글 계정으로 로그인해 주세요.',
    },
  });
  stopBGM();
  initSoundManager(null);
  resetBootProgressState();
  renderSoundControls(null, null);
  transitionTo(AppState.AUTH);
  setAuthStatus({
    message: '구글 계정으로 로그인해 주세요.',
    isBusy: false,
    showRetry: false,
    loginDisabled: false,
  });
}

async function boot() {
  if (typeof window !== 'undefined' && window.__PH_BOOT_DIAG__) {
    window.__PH_BOOT_DIAG__.bootStarted = true;
    window.__PH_BOOT_DIAG__.bootStartedAt = Date.now();
  }
  const bootPerfSession = createPerfSession('cold-boot', {
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
  });
  let didResolveInitialAuthState = false;
  let handoffPerfSession = bootPerfSession;
  bindUIActions({
    onGoogleLogin: () => {
      void handleGoogleLogin();
    },
    onAuthRetry: () => {
      if (retryAuthLoad) {
        retryAuthLoad();
      }
    },
    onLogout: () => {
      void handleLogout();
    },
    onStartRun: () => {
      handleStartRun();
    },
    onUpgrade: () => {
      handleUpgrade();
    },
    onNicknameSave: (nickname) => {
      void handleNicknameSave(nickname);
    },
    onUpgradeBack: () => {
      handleUpgradeBack();
    },
    onUpgradePurchase: (upgradeId) => {
      void handleUpgradePurchase(upgradeId);
    },
    onBootRetry: () => {
      window.location.reload();
    },
    onClassSelect: (classId) => {
      handleClassSelect(classId);
    },
    onStoryChoice: (choiceIndex) => {
      handleStoryChoice(choiceIndex);
    },
    onShopPurchase: (symbolId) => {
      handleShopPurchase(symbolId);
    },
    onCombatSpin: () => {
      void handleCombatSpin();
    },
    onCombatReroll: () => {
      void handleCombatReroll();
    },
    onEndingPrimary: () => {
      void handleEndingPrimary();
    },
    onEndingSecondary: () => {
      void handleEndingSecondary();
    },
    onSoundControlChange: (type, level) => {
      setVolume(type, level);
      if (isMuted() && Number(level) > 0) {
        setMuted(false);
      }
      syncSoundControls();
    },
    onSoundMuteToggle: () => {
      setMuted(!isMuted());
      syncSoundControls();
    },
  });

  transitionTo(AppState.BOOT);
  setBootStatus('Firebase 초기화 중...');
  resetBootProgressState();
  initSoundManager(null);
  renderSoundControls(null, null);

  try {
    bootPerfSession.startStep('firebase-init');
    initFirebase();
    bootPerfSession.endStep('firebase-init');
  } catch (error) {
    bootPerfSession.endStep('firebase-init', {
      failed: true,
      error: error?.code || error?.message || 'unknown',
    });
    bootPerfSession.flush('error', {
      finalScreen: AppState.BOOT,
    });
    console.error('[app] Firebase initialization failed', error);
    setBootStatus('Firebase 초기화에 실패했습니다. 다시 시도해 주세요.', {
      isError: true,
      showRetry: true,
    });
    return;
  }

  setBootStatus('인증 상태를 확인하는 중...');
  resetBootProgressState();
  transitionTo(AppState.AUTH);
  setAuthStatus({
    message: '구글 계정으로 로그인해 주세요.',
    isBusy: false,
    showRetry: false,
    loginDisabled: false,
  });

  authUnsubscribe?.();
  bootPerfSession.startStep('initial-auth-state');
  authUnsubscribe = onAuthChange((authUser) => {
    if (!didResolveInitialAuthState) {
      didResolveInitialAuthState = true;
      bootPerfSession.endStep('initial-auth-state', {
        authenticated: Boolean(authUser),
      });
    }

    if (authUser) {
      const inheritedPerfSession = handoffPerfSession;
      handoffPerfSession = null;
      void restoreAuthenticatedSession(authUser, inheritedPerfSession);
      return;
    }

    handoffPerfSession?.flush('signed-out', {
      finalScreen: AppState.AUTH,
      authenticated: false,
    });
    handoffPerfSession = null;
    handleSignedOut();
  });
}

subscribe((state) => {
  renderScreen(state.uiState.screen);

  if (state.uiState.screen === AppState.LOBBY && state.user) {
    renderLobbyState();
  }

  if (state.uiState.screen === AppState.UPGRADE && state.user) {
    renderUpgradeState();
  }

  if (state.uiState.screen === AppState.COMBAT && state.currentRun && state.combatState) {
    renderCurrentCombatScreen();
  }

  if (
    [
      AppState.ENDING_DEATH,
      AppState.ENDING_SUCCESS,
      AppState.RANKING,
      AppState.PAYOUT,
    ].includes(state.uiState.screen)
    && state.endingState
  ) {
    renderCurrentEndingScreen();
  }
});

function startAppBootstrap() {
  const { uiState } = getState();
  renderScreen(uiState.screen);
  void boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAppBootstrap, { once: true });
} else {
  startAppBootstrap();
}
