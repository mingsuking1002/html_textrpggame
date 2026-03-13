/**
 * ui-renderer.js
 * ──────────────
 * DOM 렌더링 담당
 */

import { isMuted, playSFX } from '@ph/sound-manager';

const LOG_LIMIT = 500;
const TOAST_LIMIT = 4;
const TOAST_DURATION_MS = 3800;
const COMBAT_SLOT_REVEAL_MS = 140;
const COMBAT_ANIMATION_STEP_MS = 260;
const BOOT_PROGRESS_REVEAL_MS = 300;

let elements = null;
let uiHandlers = {};
let bootProgressRevealTimer = null;

const SCREEN_IDS = Object.freeze({
  BOOT: 'screen-boot',
  AUTH: 'screen-auth',
  LOBBY: 'screen-lobby',
  UPGRADE: 'screen-upgrade',
  RUN_START: 'screen-class-select',
  ORIGIN_SELECT: 'screen-origin-select',
  CLASS_SELECT: 'screen-class-select',
  PROLOGUE: 'screen-story',
  STORY: 'screen-story',
  COMBAT: 'screen-combat',
  SURVIVAL_CHECK: 'screen-ending',
  ENDING_DEATH: 'screen-ending',
  ENDING_SUCCESS: 'screen-ending',
  RANKING: 'screen-ending',
  PAYOUT: 'screen-ending',
});

function getElements() {
  if (
    elements
    && elements.bootMessage
    && elements.authStatus
    && elements.lobbyDisplayName
    && elements.totalGold
  ) {
    return elements;
  }

  elements = {
    screens: Array.from(document.querySelectorAll('.screen')),
    bootMessage: document.getElementById('boot-message'),
    bootError: document.getElementById('boot-error'),
    bootRetryButton: document.getElementById('btn-boot-retry'),
    bootProgressContainer: document.getElementById('boot-progress-container'),
    bootProgressFill: document.getElementById('boot-progress-fill'),
    bootProgressLabel: document.getElementById('boot-progress-label'),
    authStatus: document.getElementById('auth-status'),
    authRetryButton: document.getElementById('btn-auth-retry'),
    googleLoginButton: document.getElementById('btn-google-login'),
    logoutButton: document.getElementById('btn-logout'),
    startRunButton: document.getElementById('btn-start-run'),
    upgradeButton: document.getElementById('btn-upgrade'),
    lobbyDisplayName: document.getElementById('lobby-display-name'),
    lobbySubtitle: document.getElementById('lobby-subtitle'),
    lobbyNicknameInput: document.getElementById('lobby-nickname-input'),
    lobbyNicknameSaveButton: document.getElementById('btn-save-nickname'),
    lobbyNicknameStatus: document.getElementById('lobby-nickname-status'),
    lobbyRunStatus: document.getElementById('lobby-run-status'),
    totalGold: document.getElementById('meta-total-gold'),
    highestStage: document.getElementById('meta-highest-stage'),
    crystals: document.getElementById('meta-crystals'),
    upgradeCrystals: document.getElementById('upgrade-crystals'),
    upgradeList: document.getElementById('upgrade-list'),
    upgradeEmpty: document.getElementById('upgrade-empty'),
    upgradeBackButton: document.getElementById('btn-upgrade-back'),
    originSelectCopy: document.getElementById('origin-select-copy'),
    originCards: document.getElementById('origin-cards'),
    classSelectCopy: document.getElementById('class-select-copy'),
    classCards: document.getElementById('class-cards'),
    storyKicker: document.getElementById('story-kicker'),
    storyStageBadge: document.getElementById('story-stage-badge'),
    storyTitle: document.getElementById('story-title'),
    storyText: document.getElementById('story-text'),
    storyClassName: document.getElementById('story-class-name'),
    storyHp: document.getElementById('story-hp'),
    storyGold: document.getElementById('story-gold'),
    storyKarma: document.getElementById('story-karma'),
    storyDeck: document.getElementById('story-deck'),
    storyNote: document.getElementById('story-note'),
    storyShop: document.getElementById('story-shop'),
    storyChoices: document.getElementById('story-choices'),
    combatSource: document.getElementById('combat-source'),
    combatEnemyShell: document.getElementById('combat-enemy-shell'),
    combatEnemyName: document.getElementById('combat-enemy-name'),
    combatEnemyIcon: document.getElementById('combat-enemy-icon'),
    combatEnemyHpText: document.getElementById('combat-enemy-hp-text'),
    combatEnemyHpFill: document.getElementById('combat-enemy-hp-fill'),
    combatPlayerShell: document.getElementById('combat-player-shell'),
    combatPlayerHp: document.getElementById('combat-player-hp'),
    combatPlayerGold: document.getElementById('combat-player-gold'),
    combatPlayerStage: document.getElementById('combat-player-stage'),
    combatDeckCount: document.getElementById('combat-deck-count'),
    combatDeckGrid: document.getElementById('combat-deck-grid'),
    combatSpinButton: document.getElementById('btn-combat-spin'),
    combatRerollButton: document.getElementById('btn-combat-reroll'),
    combatSpinStatus: document.getElementById('combat-spin-status'),
    combatRerollStatus: document.getElementById('combat-reroll-status'),
    combatSpinResult: document.getElementById('combat-spin-result'),
    combatLog: document.getElementById('combat-log'),
    soundControls: document.getElementById('sound-controls'),
    soundBgmVolume: document.getElementById('sound-bgm-volume'),
    soundSfxVolume: document.getElementById('sound-sfx-volume'),
    soundBgmValue: document.getElementById('sound-bgm-value'),
    soundSfxValue: document.getElementById('sound-sfx-value'),
    soundMuteButton: document.getElementById('btn-sound-mute'),
    endingKicker: document.getElementById('ending-kicker'),
    endingTitle: document.getElementById('ending-title'),
    endingText: document.getElementById('ending-text'),
    endingIcon: document.getElementById('ending-icon'),
    endingSummary: document.getElementById('ending-summary'),
    endingMeta: document.getElementById('ending-meta'),
    rankingSection: document.getElementById('ranking-section'),
    rankingStatus: document.getElementById('ranking-status'),
    rankingList: document.getElementById('ranking-list'),
    endingPrimaryButton: document.getElementById('btn-ending-primary'),
    endingSecondaryButton: document.getElementById('btn-ending-secondary'),
    toastContainer: document.getElementById('toast-container'),
  };

  return elements;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function formatPercent(value) {
  return `${Math.round((Number.isFinite(Number(value)) ? Number(value) : 0) * 100)}%`;
}

function formatSignedNumber(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (safeValue > 0) {
    return `+${safeValue}`;
  }
  return String(safeValue);
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function createIconFallback(altText, className = 'entity-icon') {
  const safeAltText = typeof altText === 'string' ? altText : '?';
  const label = safeAltText.replace(/\s+/g, '').slice(0, 2) || '?';
  return createTextElement('span', `${className} icon-fallback`, label);
}

function createChip(text, className = 'chip') {
  return createTextElement('span', className, text);
}

function createStatCard(label, value) {
  const card = document.createElement('article');
  card.className = 'ending-stat-card';
  card.append(createTextElement('span', 'ending-stat-label', label));
  card.append(createTextElement('strong', 'ending-stat-value', value));
  return card;
}

function countFilledDeckSlots(deck) {
  return Array.isArray(deck) ? deck.filter((slot) => slot !== 'empty').length : 0;
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function getUpgradeEffectLabel(effect = {}) {
  const parts = [];

  if (Number(effect.bonusHp || 0) > 0) {
    parts.push(`시작 HP +${formatNumber(effect.bonusHp)}`);
  }

  if (Number(effect.bonusGold || 0) > 0) {
    parts.push(`시작 골드 +${formatNumber(effect.bonusGold)}`);
  }

  if (Number(effect.bonusBagCapacity || 0) > 0) {
    parts.push(`가방 용량 +${formatNumber(effect.bonusBagCapacity)}`);
  }

  return parts.join(' · ') || '효과 정보 없음';
}

function extractEventValue(events, eventType) {
  const event = Array.isArray(events)
    ? events.find((entry) => entry?.type === eventType)
    : null;

  if (!event) {
    return 0;
  }

  const match = String(event.message || '').match(/([+-]?\d+)/);
  return Math.abs(Number(match?.[1] || 0));
}

function removeDamageNumbers(container) {
  if (!container) {
    return;
  }

  container.querySelectorAll('.damage-number').forEach((node) => node.remove());
}

function setEnemyHpBar(currentHp, maxHp, options = {}) {
  const dom = getElements();
  const { shake = false } = options;
  const safeCurrentHp = Math.max(0, Number(currentHp || 0));
  const safeMaxHp = Math.max(1, Number(maxHp || 1));
  const hpPercent = Math.max(0, Math.min(100, (safeCurrentHp / safeMaxHp) * 100));

  dom.combatEnemyHpText.textContent = `${formatNumber(safeCurrentHp)} / ${formatNumber(safeMaxHp)}`;
  dom.combatEnemyHpFill.style.width = `${hpPercent}%`;

  if (!shake) {
    dom.combatEnemyShell?.classList.remove('shake');
    return;
  }

  dom.combatEnemyShell?.classList.remove('shake');
  void dom.combatEnemyShell?.offsetWidth;
  dom.combatEnemyShell?.classList.add('shake');
  window.setTimeout(() => {
    dom.combatEnemyShell?.classList.remove('shake');
  }, 220);
}

function updatePlayerHud(playerState) {
  const dom = getElements();

  dom.combatPlayerHp.textContent = `${formatNumber(playerState?.hp)} / ${formatNumber(playerState?.maxHp)}`;
  dom.combatPlayerGold.textContent = formatNumber(playerState?.gold);
  dom.combatPlayerStage.textContent = formatNumber(playerState?.stage);
  dom.combatDeckCount.textContent = `${countFilledDeckSlots(playerState?.deck)} / ${Array.isArray(playerState?.deck) ? playerState.deck.length : 0}`;
}

function createSpinSlot(entry) {
  const slot = document.createElement('article');
  slot.className = 'spin-slot';
  slot.append(createIcon(entry?.icon || '', `${entry?.name || entry?.symbolId || '기물'} 아이콘`, 'entity-icon deck-slot-icon'));
  slot.append(createTextElement('strong', 'deck-slot-name', entry?.name || entry?.symbolId || '알 수 없음'));
  slot.append(createTextElement('span', 'entity-subtle', `${entry?.type || 'item'} · ${formatNumber(entry?.value)}`));
  return slot;
}

function appendSpinSummary(spinDetail) {
  const dom = getElements();

  if (!spinDetail) {
    return;
  }

  const summaryParts = [
    `공격 ${formatNumber(spinDetail?.finalTotals?.attack ?? spinDetail?.attackTotal)}`,
    `방어 ${formatNumber(spinDetail?.finalTotals?.defense ?? spinDetail?.defenseTotal)}`,
    `회복 ${formatNumber(spinDetail?.finalTotals?.heal ?? spinDetail?.healTotal)}`,
  ];

  dom.combatSpinResult.append(createTextElement(
    'p',
    'entity-subtle spin-summary',
    summaryParts.join(' · '),
  ));

  if (Array.isArray(spinDetail?.synergies) && spinDetail.synergies.length > 0) {
    const synergyRow = document.createElement('div');
    synergyRow.className = 'chip-list';
    spinDetail.synergies.forEach((synergy) => {
      synergyRow.append(createChip(`${synergy.label} +${formatNumber(synergy.bonus)}`, 'chip chip-accent'));
    });
    dom.combatSpinResult.append(synergyRow);
  }
}

function renderCombatLogEntries(logs) {
  const dom = getElements();
  const logFragment = document.createDocumentFragment();

  clearChildren(dom.combatLog);
  logs.forEach((message) => {
    logFragment.append(createTextElement('p', 'combat-log-entry', message));
  });

  if (logs.length === 0) {
    logFragment.append(createTextElement('p', 'entity-subtle', '아직 전투 로그가 없습니다.'));
  }

  dom.combatLog.append(logFragment);
  dom.combatLog.scrollTop = dom.combatLog.scrollHeight;
}

function resetBootProgressDom(dom) {
  if (bootProgressRevealTimer) {
    window.clearTimeout(bootProgressRevealTimer);
    bootProgressRevealTimer = null;
  }

  dom.bootProgressContainer.hidden = true;
  dom.bootProgressFill.style.width = '0%';
  dom.bootProgressLabel.textContent = '';
}

export function createIcon(iconPath, altText, className = 'entity-icon') {
  const safeAltText = typeof altText === 'string' ? altText : '?';

  if (!iconPath) {
    return createIconFallback(safeAltText, className);
  }

  const img = document.createElement('img');
  img.className = className;
  img.src = iconPath;
  img.alt = safeAltText;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.replaceWith(createIconFallback(safeAltText, className));
  }, { once: true });
  return img;
}

export function bindUIActions(handlers) {
  const dom = getElements();
  uiHandlers = { ...handlers };

  dom.googleLoginButton.onclick = handlers.onGoogleLogin || null;
  dom.authRetryButton.onclick = handlers.onAuthRetry || null;
  dom.logoutButton.onclick = handlers.onLogout || null;
  dom.startRunButton.onclick = handlers.onStartRun || null;
  dom.upgradeButton.onclick = handlers.onUpgrade || null;
  if (dom.lobbyNicknameSaveButton && dom.lobbyNicknameInput) {
    dom.lobbyNicknameSaveButton.onclick = () => {
      handlers.onNicknameSave?.(dom.lobbyNicknameInput.value);
    };
    dom.lobbyNicknameInput.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onNicknameSave?.(dom.lobbyNicknameInput.value);
      }
    };
  }
  dom.upgradeBackButton.onclick = handlers.onUpgradeBack || null;
  dom.bootRetryButton.onclick = handlers.onBootRetry || null;
  dom.combatSpinButton.onclick = handlers.onCombatSpin || null;
  dom.combatRerollButton.onclick = handlers.onCombatReroll || null;
  dom.endingPrimaryButton.onclick = handlers.onEndingPrimary || null;
  dom.endingSecondaryButton.onclick = handlers.onEndingSecondary || null;
  dom.soundMuteButton.onclick = handlers.onSoundMuteToggle || null;
  dom.soundBgmVolume.oninput = (event) => {
    handlers.onSoundControlChange?.('bgm', Number(event.target.value));
  };
  dom.soundSfxVolume.oninput = (event) => {
    handlers.onSoundControlChange?.('sfx', Number(event.target.value));
  };
}

export function renderScreen(screenId) {
  const dom = getElements();
  const nextId = SCREEN_IDS[screenId] || SCREEN_IDS.AUTH;

  dom.screens.forEach((screen) => {
    const isActive = screen.id === nextId;
    screen.classList.toggle('active', isActive);
    screen.toggleAttribute('aria-hidden', !isActive);
  });
}

export function setBootStatus(message, options = {}) {
  const dom = getElements();
  const { isError = false, showRetry = false } = options;

  dom.bootMessage.textContent = message;
  dom.bootError.hidden = !isError;
  dom.bootRetryButton.hidden = !showRetry;

  if (isError) {
    dom.bootError.textContent = message;
    dom.bootMessage.textContent = '부트스트랩에 실패했습니다.';
  } else {
    dom.bootError.textContent = '';
  }
}

export function setBootProgress(current, total, label) {
  const dom = getElements();
  const safeTotal = Math.max(0, Number(total || 0));
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number(current || 0)));

  if (safeTotal <= 0) {
    resetBootProgressDom(dom);
    return;
  }

  dom.bootProgressFill.style.width = `${safeTotal > 0 ? (safeCurrent / safeTotal) * 100 : 0}%`;
  dom.bootProgressLabel.textContent = `${formatNumber(safeCurrent)} / ${formatNumber(safeTotal)} · ${label || '로딩 중...'}`;

  if (safeCurrent >= safeTotal) {
    if (bootProgressRevealTimer) {
      window.clearTimeout(bootProgressRevealTimer);
      bootProgressRevealTimer = null;
    }
    return;
  }

  if (!dom.bootProgressContainer.hidden || bootProgressRevealTimer) {
    return;
  }

  bootProgressRevealTimer = window.setTimeout(() => {
    dom.bootProgressContainer.hidden = false;
    bootProgressRevealTimer = null;
  }, BOOT_PROGRESS_REVEAL_MS);
}

export function setAuthStatus(options) {
  const dom = getElements();
  const {
    message,
    isBusy = false,
    showRetry = false,
    isError = false,
    loginDisabled = isBusy,
  } = options;

  dom.authStatus.textContent = message;
  dom.authStatus.classList.toggle('error', isError);
  dom.googleLoginButton.disabled = loginDisabled;
  dom.authRetryButton.hidden = !showRetry;
  dom.authRetryButton.disabled = isBusy;
}

export function renderSoundControls(bgmVol, sfxVol, onChange = null) {
  const dom = getElements();

  if (typeof onChange === 'function') {
    uiHandlers.onSoundControlChange = onChange;
  }

  const isEnabled = Number.isFinite(Number(bgmVol)) && Number.isFinite(Number(sfxVol));

  dom.soundControls.hidden = !isEnabled;
  if (!isEnabled) {
    return;
  }

  dom.soundBgmVolume.value = String(Math.max(0, Math.min(1, Number(bgmVol))));
  dom.soundSfxVolume.value = String(Math.max(0, Math.min(1, Number(sfxVol))));
  dom.soundBgmValue.textContent = formatPercent(bgmVol);
  dom.soundSfxValue.textContent = formatPercent(sfxVol);
  dom.soundMuteButton.textContent = isMuted() ? '음소거 해제' : '음소거';
}

export function renderLobby(user, currentRun = null, options = {}) {
  const dom = getElements();
  const isActiveRun = Boolean(currentRun?.isActive);
  const hasUpgradeShop = Boolean(options.hasUpgradeShop);
  const nicknameStatus = options.nicknameStatus
    || '로비와 랭킹에 표시될 이름입니다. 2~16자로 설정해 주세요.';
  const isNicknameSaving = Boolean(options.isNicknameSaving);
  const nicknameValue = typeof options.nicknameValue === 'string'
    ? options.nicknameValue
    : (user?.displayName || '');

  if (!dom.lobbyDisplayName || !dom.totalGold || !dom.highestStage || !dom.crystals) {
    console.warn('[ui-renderer] Lobby DOM is incomplete. Skip render.', dom);
    return;
  }

  dom.lobbyDisplayName.textContent = user?.displayName || '모험가';
  if (dom.lobbyNicknameInput) {
    dom.lobbyNicknameInput.value = nicknameValue;
    dom.lobbyNicknameInput.disabled = isNicknameSaving;
  }
  if (dom.lobbyNicknameSaveButton) {
    dom.lobbyNicknameSaveButton.disabled = isNicknameSaving;
    dom.lobbyNicknameSaveButton.textContent = isNicknameSaving ? '저장 중...' : '닉네임 저장';
  }
  if (dom.lobbyNicknameStatus) {
    dom.lobbyNicknameStatus.textContent = nicknameStatus;
  }
  dom.totalGold.textContent = formatNumber(user?.totalGoldEarned);
  dom.highestStage.textContent = formatNumber(user?.highestStage);
  dom.crystals.textContent = formatNumber(user?.crystals);
  dom.upgradeButton.hidden = !hasUpgradeShop;
  dom.upgradeButton.disabled = !hasUpgradeShop;
  dom.logoutButton.disabled = false;
  dom.startRunButton.disabled = false;
  dom.startRunButton.textContent = isActiveRun ? '런 이어하기' : '게임 시작';

  if (isActiveRun) {
    if (dom.lobbySubtitle) {
      dom.lobbySubtitle.textContent = '이전 런이 감지되었습니다. 이어서 진행하거나 새 결과 정산 후 로비로 돌아올 수 있습니다.';
    }
    if (dom.lobbyRunStatus) {
      dom.lobbyRunStatus.textContent = `현재 위치: ${currentRun.currentNodeId || '알 수 없음'} · Stage ${formatNumber(currentRun.stage)}`;
      dom.lobbyRunStatus.hidden = false;
    }
    return;
  }

  if (dom.lobbySubtitle) {
    dom.lobbySubtitle.textContent = '게임 데이터 로드가 완료되었습니다. 직업을 선택하거나 결정을 사용해 영구 강화를 구매할 수 있습니다.';
  }
  if (dom.lobbyRunStatus) {
    dom.lobbyRunStatus.textContent = '';
    dom.lobbyRunStatus.hidden = true;
  }
}

export function renderOriginSelection(originCards, options = {}) {
  const dom = getElements();
  const { locked = false } = options;
  clearChildren(dom.originCards);

  if (!Array.isArray(originCards) || originCards.length === 0) {
    dom.originSelectCopy.textContent = '표시할 출신지 데이터가 없습니다.';
    return;
  }

  dom.originSelectCopy.textContent = '출신지를 고르면 시작 업보가 정해지고 이후 스토리 선택지의 열림 조건이 달라집니다.';
  const fragment = document.createDocumentFragment();

  originCards.forEach((originCard) => {
    const card = document.createElement('article');
    card.className = 'origin-card';

    const head = document.createElement('div');
    head.className = 'origin-card-head';
    head.append(createIcon(originCard.icon, `${originCard.name} 아이콘`));

    const copy = document.createElement('div');
    copy.className = 'origin-card-copy';
    copy.append(createTextElement('strong', 'entity-name', originCard.name));
    copy.append(createTextElement('span', 'entity-subtle', originCard.description));
    head.append(copy);

    const meta = document.createElement('div');
    meta.className = 'chip-list';
    meta.append(createChip(`시작 업보 ${formatSignedNumber(originCard.baseKarma)}`, 'chip chip-accent'));

    const actionRow = document.createElement('div');
    actionRow.className = 'origin-card-actions';
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'button-primary';
    selectButton.textContent = locked ? '선택 중...' : '선택';
    selectButton.disabled = locked;
    selectButton.addEventListener('click', () => {
      uiHandlers.onOriginSelect?.(originCard.originId);
    });
    actionRow.append(selectButton);

    card.append(head);
    card.append(meta);
    card.append(actionRow);
    fragment.append(card);
  });

  dom.originCards.append(fragment);
}

export function renderUpgradeShop(upgradeDefs, userUpgrades = {}, crystals = 0, options = {}) {
  const dom = getElements();
  const upgradeEntries = Object.entries(upgradeDefs || {});
  const fragment = document.createDocumentFragment();

  dom.upgradeCrystals.textContent = formatNumber(crystals);
  dom.upgradeBackButton.disabled = Boolean(options.isBusy);
  clearChildren(dom.upgradeList);

  if (upgradeEntries.length === 0) {
    dom.upgradeEmpty.hidden = false;
    dom.upgradeList.hidden = true;
    return;
  }

  dom.upgradeEmpty.hidden = true;
  dom.upgradeList.hidden = false;

  upgradeEntries.forEach(([upgradeId, upgrade]) => {
    const currentLevel = Math.max(0, Number(userUpgrades?.[upgradeId] || 0));
    const maxLevel = Math.max(1, Number(upgrade?.maxLevel || 1));
    const isOwned = currentLevel > 0;
    const isMaxLevel = currentLevel >= maxLevel;
    const isPurchasing = options.purchasingId === upgradeId;
    const canAfford = Number(crystals || 0) >= Number(upgrade?.cost || 0);
    const card = document.createElement('article');
    card.className = 'upgrade-card';

    const head = document.createElement('div');
    head.className = 'upgrade-card-head';
    head.append(createIcon(upgrade?.icon || '', `${upgrade?.name || upgradeId} 아이콘`, 'entity-icon'));

    const copy = document.createElement('div');
    copy.className = 'upgrade-card-copy';
    copy.append(createTextElement('strong', 'entity-name', upgrade?.name || upgradeId));
    copy.append(createTextElement('span', 'entity-subtle', upgrade?.description || '설명 없음'));
    copy.append(createTextElement('span', 'entity-subtle', getUpgradeEffectLabel(upgrade?.effect)));
    head.append(copy);

    const meta = document.createElement('div');
    meta.className = 'upgrade-card-meta';
    meta.append(createChip(`비용 ${formatNumber(upgrade?.cost)}💎`, 'chip chip-accent'));
    meta.append(createChip(`Lv ${formatNumber(currentLevel)} / ${formatNumber(maxLevel)}`));

    if (isOwned) {
      meta.append(createChip(isMaxLevel ? '최대 강화' : '보유중', 'chip chip-success'));
    }

    const actionRow = document.createElement('div');
    actionRow.className = 'upgrade-card-actions';

    const purchaseButton = document.createElement('button');
    purchaseButton.type = 'button';
    purchaseButton.className = 'button-primary';
    purchaseButton.textContent = isPurchasing
      ? '구매 중...'
      : (isMaxLevel ? '최대 강화' : '구매');
    purchaseButton.disabled = isPurchasing || isMaxLevel || !canAfford || Boolean(options.isBusy);
    purchaseButton.addEventListener('click', () => {
      uiHandlers.onUpgradePurchase?.(upgradeId);
    });

    actionRow.append(purchaseButton);

    if (!canAfford && !isMaxLevel) {
      actionRow.append(createTextElement('span', 'entity-subtle', '결정이 부족합니다.'));
    } else if (isMaxLevel) {
      actionRow.append(createTextElement('span', 'entity-subtle', '이미 최종 단계입니다.'));
    }

    card.append(head);
    card.append(meta);
    card.append(actionRow);
    fragment.append(card);
  });

  dom.upgradeList.append(fragment);
}

export function renderClassSelection(classCards, options = {}) {
  const dom = getElements();
  const { locked = false, copyText = '시작 직업을 고르면 프롤로그와 스토리 루프가 시작됩니다.' } = options;
  clearChildren(dom.classCards);

  if (!Array.isArray(classCards) || classCards.length === 0) {
    dom.classSelectCopy.textContent = '표시할 직업 데이터가 없습니다.';
    return;
  }

  dom.classSelectCopy.textContent = copyText;
  const fragment = document.createDocumentFragment();

  classCards.forEach((classCard) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'class-card';
    button.disabled = locked;
    button.addEventListener('click', () => {
      uiHandlers.onClassSelect?.(classCard.classId);
    });

    const head = document.createElement('div');
    head.className = 'class-card-head';
    head.append(createIcon(classCard.icon, `${classCard.name} 아이콘`));

    const copy = document.createElement('div');
    copy.className = 'class-card-copy';
    copy.append(createTextElement('strong', 'entity-name', classCard.name));
    copy.append(createTextElement('span', 'entity-subtle', classCard.summary));
    head.append(copy);

    const weaponList = document.createElement('div');
    weaponList.className = 'chip-list';
    classCard.weapons.forEach((weaponName) => {
      weaponList.append(createChip(weaponName));
    });

    button.append(head);
    button.append(weaponList);
    fragment.append(button);
  });

  dom.classCards.append(fragment);
}

export function renderStory(renderModel, context) {
  const dom = getElements();
  const { currentRun, gameData, note = '' } = context;
  const classInfo = gameData?.classes?.[currentRun?.classId];
  const filledDeckSlots = countFilledDeckSlots(currentRun?.deck);
  const totalDeckSlots = Array.isArray(currentRun?.deck) ? currentRun.deck.length : 0;

  dom.storyKicker.textContent = renderModel.type === 'shop' ? 'Shop' : 'Story';
  dom.storyStageBadge.textContent = `Stage ${currentRun?.stage ?? 1}`;
  dom.storyTitle.textContent = renderModel.title || '이야기';
  dom.storyText.textContent = renderModel.text || '';
  dom.storyClassName.textContent = classInfo?.name || '-';
  dom.storyHp.textContent = `${formatNumber(currentRun?.hp)} / ${formatNumber(currentRun?.maxHp)}`;
  dom.storyGold.textContent = formatNumber(currentRun?.gold);
  dom.storyKarma.textContent = formatSignedNumber(currentRun?.karma);
  dom.storyDeck.textContent = `${filledDeckSlots} / ${formatNumber(totalDeckSlots)}`;
  dom.storyNote.textContent = note;
  dom.storyNote.hidden = !note;

  clearChildren(dom.storyChoices);
  clearChildren(dom.storyShop);
  dom.storyShop.hidden = renderModel.type !== 'shop';

  if (renderModel.type === 'shop') {
    const shopFragment = document.createDocumentFragment();

    renderModel.shopItems.forEach((item) => {
      const symbol = gameData?.symbols?.[item.symbolId];
      const card = document.createElement('article');
      card.className = 'shop-card';

      const head = document.createElement('div');
      head.className = 'shop-card-head';
      head.append(createIcon(symbol?.icon || '', `${symbol?.name || item.symbolId} 아이콘`));

      const copy = document.createElement('div');
      copy.className = 'shop-card-copy';
      copy.append(createTextElement('strong', 'entity-name', symbol?.name || item.symbolId));
      copy.append(createTextElement('span', 'entity-subtle', `${symbol?.type || 'item'} · value ${symbol?.value ?? '-'}`));
      head.append(copy);

      const meta = document.createElement('div');
      meta.className = 'shop-card-meta';
      meta.append(createTextElement('span', '', `가격 ${formatNumber(item.cost)}G`));

      const hasEnoughGold = Number(currentRun?.gold || 0) >= Number(item.cost || 0);
      const hasSpace = Array.isArray(currentRun?.deck) && currentRun.deck.includes('empty');
      const reason = !hasEnoughGold ? '골드가 부족합니다.' : (!hasSpace ? '가방이 가득 찼습니다.' : '');

      const buyButton = document.createElement('button');
      buyButton.type = 'button';
      buyButton.className = 'button-secondary';
      buyButton.textContent = '구매';
      buyButton.disabled = !(hasEnoughGold && hasSpace);
      buyButton.addEventListener('click', () => {
        uiHandlers.onShopPurchase?.(item.symbolId);
      });
      meta.append(buyButton);

      card.append(head);
      card.append(meta);
      if (reason) {
        card.append(createTextElement('p', 'entity-subtle', reason));
      }
      shopFragment.append(card);
    });

    dom.storyShop.append(shopFragment);
  }

  if (renderModel.choices.length === 0) {
    dom.storyChoices.append(createTextElement('p', 'entity-subtle', '진행 가능한 선택지가 없습니다.'));
    return;
  }

  const choiceFragment = document.createDocumentFragment();
  renderModel.choices.forEach((choice, index) => {
    const card = document.createElement('article');
    card.className = 'choice-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = choice.text;
    button.disabled = choice.isAvailable === false;
    if (choice.isAvailable !== false) {
      button.addEventListener('click', () => {
        uiHandlers.onStoryChoice?.(index);
      });
    }

    card.append(button);

    if (choice.karmaHint || choice.disabledReason) {
      const meta = document.createElement('div');
      meta.className = 'choice-meta';

      if (choice.karmaHint) {
        const hintClassName = choice.karmaHint.includes('악')
          ? 'chip chip-danger'
          : (choice.karmaHint.includes('선') ? 'chip chip-success' : 'chip');
        meta.append(createChip(choice.karmaHint, hintClassName));
      }

      if (choice.disabledReason) {
        meta.append(createTextElement('span', 'entity-subtle choice-reason', choice.disabledReason));
      }

      card.append(meta);
    }

    choiceFragment.append(card);
  });
  dom.storyChoices.append(choiceFragment);
}

export function updateEnemyHpBar(currentHp, maxHp) {
  setEnemyHpBar(currentHp, maxHp, { shake: true });
}

export function showRerollOption(cost, gold, onReroll) {
  const dom = getElements();
  const safeCost = Math.max(0, Number(cost || 0));
  const safeGold = Math.max(0, Number(gold || 0));
  const canAfford = safeGold >= safeCost;

  dom.combatRerollButton.hidden = false;
  dom.combatRerollButton.disabled = !canAfford;
  dom.combatRerollButton.onclick = onReroll || uiHandlers.onCombatReroll || null;
  dom.combatRerollStatus.hidden = false;
  dom.combatRerollStatus.textContent = canAfford
    ? `리롤 비용 ${formatNumber(safeCost)}G · 현재 골드 ${formatNumber(safeGold)}`
    : `리롤 비용 ${formatNumber(safeCost)}G · 골드가 부족합니다.`;
}

export function renderCombatScreen(combatState, currentRun, gameData) {
  const dom = getElements();
  const enemy = combatState?.enemy || null;
  const currentEnemyHp = Math.max(0, Number(combatState?.currentEnemyHp || 0));
  const enemyMaxHp = Math.max(1, Number(enemy?.hp || 1));
  const lastSpinEntries = Array.isArray(combatState?.lastSpinResult?.entries)
    ? combatState.lastSpinResult.entries
    : [];
  const deckFragment = document.createDocumentFragment();
  const spinFragment = document.createDocumentFragment();

  dom.combatSource.textContent = combatState?.sourceLabel
    ? `${combatState.sourceLabel} 전투`
    : '전투 중';
  dom.combatEnemyName.textContent = enemy?.name || '적 정보 없음';
  clearChildren(dom.combatEnemyIcon);
  dom.combatEnemyIcon.append(createIcon(enemy?.icon || '', `${enemy?.name || '적'} 아이콘`, 'entity-icon combat-enemy-icon'));
  setEnemyHpBar(currentEnemyHp, enemyMaxHp);
  updatePlayerHud(currentRun);

  clearChildren(dom.combatDeckGrid);
  (Array.isArray(currentRun?.deck) ? currentRun.deck : []).forEach((symbolId) => {
    const symbol = symbolId === 'empty' ? null : gameData?.symbols?.[symbolId];
    const slot = document.createElement('article');
    slot.className = `deck-slot ${symbol ? 'filled' : 'empty'}`;

    if (symbol) {
      slot.append(createIcon(symbol.icon || '', `${symbol.name || symbolId} 아이콘`, 'entity-icon deck-slot-icon'));
      slot.append(createTextElement('strong', 'deck-slot-name', symbol.name || symbolId));
      slot.append(createTextElement('span', 'entity-subtle', `${symbol.type} · ${formatNumber(symbol.value)}`));
    } else {
      slot.append(createTextElement('span', 'deck-slot-empty', 'EMPTY'));
    }

    deckFragment.append(slot);
  });
  dom.combatDeckGrid.append(deckFragment);

  clearChildren(dom.combatSpinResult);
  if (lastSpinEntries.length === 0) {
    dom.combatSpinResult.append(createTextElement('p', 'entity-subtle', '아직 스핀 결과가 없습니다.'));
  } else {
    lastSpinEntries.forEach((entry) => {
      spinFragment.append(createSpinSlot(entry));
    });
    dom.combatSpinResult.append(spinFragment);
    appendSpinSummary(combatState.lastSpinResult);
  }

  dom.combatSpinButton.disabled = Boolean(combatState?.isResolving)
    || currentEnemyHp <= 0
    || Number(currentRun?.hp || 0) <= 0;
  dom.combatSpinButton.textContent = combatState?.isAwaitingSpinCommit
    ? '결과 확정'
    : '🎰 룰렛 스핀';
  dom.combatSpinStatus.textContent = combatState?.isResolving
    ? '룰렛이 회전합니다...'
    : (combatState?.isAwaitingSpinCommit
      ? '결과를 확인했습니다. 확정하거나 리롤할 수 있습니다.'
      : '스핀 버튼으로 다음 턴을 진행합니다.');

  if (combatState?.isAwaitingSpinCommit && !combatState?.isResolving) {
    showRerollOption(gameData?.config?.rerollCost, currentRun?.gold, uiHandlers.onCombatReroll);
  } else {
    dom.combatRerollButton.hidden = true;
    dom.combatRerollButton.disabled = true;
    dom.combatRerollStatus.hidden = true;
    dom.combatRerollStatus.textContent = '';
  }

  renderCombatLogEntries(Array.isArray(combatState?.logs) ? combatState.logs.slice(-LOG_LIMIT) : []);
  removeDamageNumbers(dom.combatEnemyShell);
  removeDamageNumbers(dom.combatPlayerShell);
}

export function renderCombat(combatState, currentRun, gameData) {
  renderCombatScreen(combatState, currentRun, gameData);
}

export async function animateSpinSlots(spinEntries, symbolsData) {
  const dom = getElements();
  const entries = Array.isArray(spinEntries) ? spinEntries : [];

  clearChildren(dom.combatSpinResult);

  if (entries.length === 0) {
    dom.combatSpinResult.append(createTextElement('p', 'entity-subtle', '공격할 기물이 없습니다.'));
    return;
  }

  for (const rawEntry of entries) {
    const symbolData = symbolsData?.[rawEntry?.symbolId] || {};
    const normalizedEntry = {
      ...rawEntry,
      name: rawEntry?.name || symbolData.name || rawEntry?.symbolId || '알 수 없음',
      type: rawEntry?.type || symbolData.type || 'item',
      value: Number(rawEntry?.value ?? symbolData.value ?? 0),
      icon: rawEntry?.icon || symbolData.icon || '',
    };
    const slot = createSpinSlot(normalizedEntry);
    slot.classList.add('spin-slot-pending');
    dom.combatSpinResult.append(slot);
    await wait(40);
    slot.classList.remove('spin-slot-pending');
    slot.classList.add('spin-slot-anim');
    await wait(COMBAT_SLOT_REVEAL_MS);
  }
}

export function animateDamageNumber(targetEl, amount, type) {
  if (!targetEl || Number(amount || 0) <= 0) {
    return;
  }

  const safeType = type || 'attack';
  const prefix = safeType === 'heal' ? '+' : '-';
  const badge = createTextElement('span', `damage-number ${safeType}`, `${prefix}${formatNumber(amount)}`);
  targetEl.append(badge);
  window.setTimeout(() => {
    badge.remove();
  }, 820);
}

export async function renderCombatRoundResult(roundResult, combatState, symbolsData) {
  const dom = getElements();
  const spinDetail = roundResult?.spinDetail || null;
  const enemyMaxHp = Math.max(1, Number(combatState?.enemy?.hp || 1));
  const playerHeal = extractEventValue(roundResult?.events, 'player_heal');
  const playerDamage = extractEventValue(roundResult?.events, 'player_attack');
  const enemyDamage = extractEventValue(roundResult?.events, 'enemy_attack');

  dom.combatSpinStatus.textContent = '룰렛이 회전합니다...';
  await animateSpinSlots(spinDetail?.entries || [], symbolsData);
  appendSpinSummary(spinDetail);
  await wait(COMBAT_ANIMATION_STEP_MS);

  if (playerHeal > 0) {
    dom.combatSpinStatus.textContent = '회복 효과가 발동했습니다.';
    playSFX('heal');
    animateDamageNumber(dom.combatPlayerShell, playerHeal, 'heal');
    updatePlayerHud(roundResult?.playerState);
    await wait(COMBAT_ANIMATION_STEP_MS);
  }

  if (playerDamage > 0) {
    dom.combatSpinStatus.textContent = '공격이 적중했습니다.';
    playSFX('hit');
    animateDamageNumber(dom.combatEnemyShell, playerDamage, 'attack');
    updateEnemyHpBar(roundResult?.currentEnemyHp, enemyMaxHp);
    await wait(COMBAT_ANIMATION_STEP_MS);
  } else {
    setEnemyHpBar(roundResult?.currentEnemyHp, enemyMaxHp);
  }

  if (enemyDamage > 0) {
    dom.combatSpinStatus.textContent = '적의 반격을 받았습니다.';
    animateDamageNumber(dom.combatPlayerShell, enemyDamage, 'danger');
    updatePlayerHud(roundResult?.playerState);
    await wait(COMBAT_ANIMATION_STEP_MS);
  }

  if (roundResult?.result === 'win') {
    dom.combatSpinStatus.textContent = '적을 쓰러뜨렸습니다.';
  } else if (roundResult?.result === 'lose') {
    dom.combatSpinStatus.textContent = '플레이어가 쓰러졌습니다.';
  } else {
    dom.combatSpinStatus.textContent = '다음 턴을 준비합니다.';
  }
}

export function renderCombatVictory(rewardSummary, symbolsData) {
  const dom = getElements();
  const fragment = document.createDocumentFragment();
  const addedSymbols = Array.isArray(rewardSummary?.addedSymbols) ? rewardSummary.addedSymbols : [];

  playSFX('victory');
  clearChildren(dom.combatSpinResult);
  dom.combatSpinStatus.textContent = '승리! 전리품을 회수합니다.';

  if (Number(rewardSummary?.gold || 0) > 0) {
    fragment.append(createChip(`골드 +${formatNumber(rewardSummary.gold)}`, 'chip chip-success'));
  }

  addedSymbols.forEach((symbolId) => {
    fragment.append(createChip(
      `획득 ${symbolsData?.[symbolId]?.name || symbolId}`,
      'chip chip-accent',
    ));
  });

  if (Array.isArray(rewardSummary?.skippedSymbols) && rewardSummary.skippedSymbols.length > 0) {
    fragment.append(createChip('일부 전리품 미획득', 'chip'));
  }

  if (fragment.childNodes.length === 0) {
    dom.combatSpinResult.append(createTextElement('p', 'entity-subtle', '전리품은 없지만 승리는 확실합니다.'));
    return;
  }

  dom.combatSpinResult.append(fragment);
}

export function renderCombatDefeat(player) {
  const dom = getElements();

  playSFX('defeat');
  clearChildren(dom.combatSpinResult);
  dom.combatSpinResult.append(createTextElement('p', 'entity-subtle', '패배했습니다. 엔딩 화면으로 이동합니다.'));
  dom.combatSpinStatus.textContent = `남은 체력 ${formatNumber(player?.hp)} / ${formatNumber(player?.maxHp)}`;
}

export function renderEndingView(screenId, endingState, user) {
  const dom = getElements();
  const endingData = endingState?.endingData || {};
  const isProcessing = Boolean(endingState?.isProcessing);

  clearChildren(dom.endingIcon);
  clearChildren(dom.endingSummary);
  clearChildren(dom.endingMeta);
  clearChildren(dom.rankingList);

  dom.endingIcon.append(createIcon(endingData.icon || '', `${endingData.name || '엔딩'} 아이콘`, 'ending-icon'));
  dom.rankingSection.hidden = screenId !== 'RANKING';
  dom.endingPrimaryButton.disabled = isProcessing;
  dom.endingSecondaryButton.disabled = isProcessing;

  if (screenId === 'RANKING') {
    dom.endingKicker.textContent = 'Ranking';
    dom.endingTitle.textContent = '랭킹에 등록되었습니다';
    dom.endingText.textContent = '상위 기록을 확인한 뒤 보상 정산으로 이동합니다.';
    dom.rankingStatus.textContent = endingState?.rankingSubmitted
      ? '랭킹 등록 완료'
      : '랭킹을 불러오지 못했습니다.';
    dom.endingPrimaryButton.hidden = false;
    dom.endingPrimaryButton.textContent = '보상 확인';
    dom.endingSecondaryButton.hidden = true;

    const rankings = Array.isArray(endingState?.rankings) ? endingState.rankings : [];
    if (rankings.length === 0) {
      dom.rankingList.append(createTextElement('p', 'entity-subtle', '표시할 랭킹 데이터가 없습니다.'));
      return;
    }

    const rankingFragment = document.createDocumentFragment();
    rankings.forEach((entry, index) => {
      const row = document.createElement('article');
      row.className = 'ranking-row';
      row.append(createTextElement('strong', 'ranking-rank', `#${index + 1}`));
      row.append(createTextElement('span', 'ranking-name', entry.displayName || '모험가'));
      row.append(createTextElement('span', 'ranking-score', `${formatNumber(entry.payout)}G`));
      rankingFragment.append(row);
    });
    dom.rankingList.append(rankingFragment);
    return;
  }

  if (screenId === 'PAYOUT') {
    dom.endingKicker.textContent = 'Payout';
    dom.endingTitle.textContent = '정산 완료';
    dom.endingText.textContent = '보상과 메타 기록이 반영되었습니다. 로비에서 다음 런을 시작할 수 있습니다.';
    dom.endingPrimaryButton.hidden = false;
    dom.endingPrimaryButton.textContent = '로비로 돌아가기';
    dom.endingSecondaryButton.hidden = true;
  } else {
    dom.endingKicker.textContent = endingData.type === 'death' ? 'Ending Death' : 'Ending Success';
    dom.endingTitle.textContent = endingData.name || '엔딩';
    dom.endingText.textContent = endingData.text || '엔딩 데이터를 확인해 주세요.';
    dom.endingPrimaryButton.hidden = false;
    dom.endingPrimaryButton.textContent = endingState?.isRankable ? '랭킹 등록 및 정산' : '보상 정산';
    dom.endingSecondaryButton.hidden = !endingState?.isRankable;
    dom.endingSecondaryButton.textContent = '랭킹 건너뛰기';
  }

  dom.endingSummary.append(createStatCard(
    '정산 공식',
    `${formatNumber(endingState?.totalGoldThisRun)} x ${Number(endingState?.payoutMultiplier || 0).toFixed(1)} + ${formatNumber(endingState?.bonusGold)} = ${formatNumber(endingState?.payout)}`,
  ));
  dom.endingSummary.append(createStatCard('도달 스테이지', `Stage ${formatNumber(endingState?.stageReached)}`));
  dom.endingSummary.append(createStatCard('획득 결정', `${formatNumber(endingState?.crystalsEarned || 0)}💎`));
  dom.endingMeta.append(createStatCard('누적 골드', `${formatNumber(user?.totalGoldEarned || 0)}G`));
  dom.endingMeta.append(createStatCard('최고 스테이지', `Stage ${formatNumber(user?.highestStage || 0)}`));
  dom.endingMeta.append(createStatCard('보유 결정', `${formatNumber(user?.crystals || 0)}💎`));
}

export function showToast(message, type = 'info') {
  const dom = getElements();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  dom.toastContainer.append(toast);

  while (dom.toastContainer.childElementCount > TOAST_LIMIT) {
    dom.toastContainer.firstElementChild?.remove();
  }

  window.setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION_MS);
}
