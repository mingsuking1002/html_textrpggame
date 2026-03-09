/**
 * ui-renderer.js
 * ──────────────
 * DOM 렌더링 담당
 */

const LOG_LIMIT = 500;
const TOAST_LIMIT = 4;
const TOAST_DURATION_MS = 3800;

let elements = null;

const SCREEN_IDS = Object.freeze({
  BOOT: 'screen-boot',
  AUTH: 'screen-auth',
  LOBBY: 'screen-lobby',
  UPGRADE: 'screen-lobby',
  RUN_START: 'screen-class-select',
  CLASS_SELECT: 'screen-class-select',
  PROLOGUE: 'screen-story',
  STORY: 'screen-story',
  COMBAT: 'screen-combat',
  SURVIVAL_CHECK: 'screen-combat',
  ENDING_DEATH: 'screen-ending',
  ENDING_SUCCESS: 'screen-ending',
  RANKING: 'screen-ending',
  PAYOUT: 'screen-ending',
});

function getElements() {
  if (elements) {
    return elements;
  }

  elements = {
    screens: Array.from(document.querySelectorAll('.screen')),
    bootMessage: document.getElementById('boot-message'),
    bootError: document.getElementById('boot-error'),
    bootRetryButton: document.getElementById('btn-boot-retry'),
    authStatus: document.getElementById('auth-status'),
    authRetryButton: document.getElementById('btn-auth-retry'),
    googleLoginButton: document.getElementById('btn-google-login'),
    logoutButton: document.getElementById('btn-logout'),
    startRunButton: document.getElementById('btn-start-run'),
    upgradeButton: document.getElementById('btn-upgrade'),
    returnLobbyButton: document.getElementById('btn-return-lobby'),
    lobbyDisplayName: document.getElementById('lobby-display-name'),
    lobbyUserId: document.getElementById('lobby-user-id'),
    totalGold: document.getElementById('meta-total-gold'),
    highestStage: document.getElementById('meta-highest-stage'),
    crystals: document.getElementById('meta-crystals'),
    toastContainer: document.getElementById('toast-container'),
    combatHud: document.getElementById('combat-hud'),
    combatLog: document.getElementById('combat-log'),
  };

  return elements;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function bindUIActions(handlers) {
  const dom = getElements();

  dom.googleLoginButton.onclick = handlers.onGoogleLogin || null;
  dom.authRetryButton.onclick = handlers.onAuthRetry || null;
  dom.logoutButton.onclick = handlers.onLogout || null;
  dom.startRunButton.onclick = handlers.onStartRun || null;
  dom.upgradeButton.onclick = handlers.onUpgrade || null;
  dom.bootRetryButton.onclick = handlers.onBootRetry || null;
  dom.returnLobbyButton.onclick = handlers.onReturnLobby || null;
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

export function renderLobby(user) {
  const dom = getElements();

  dom.lobbyDisplayName.textContent = user?.displayName || '이름 없음';
  dom.lobbyUserId.textContent = user?.uid || '-';
  dom.totalGold.textContent = formatNumber(user?.totalGoldEarned);
  dom.highestStage.textContent = formatNumber(user?.highestStage);
  dom.crystals.textContent = formatNumber(user?.crystals);
  dom.startRunButton.disabled = false;
  dom.upgradeButton.disabled = true;
  dom.logoutButton.disabled = false;
}

export function updateHUD(player) {
  const dom = getElements();

  if (!player) {
    dom.combatHud.textContent = '';
    return;
  }

  dom.combatHud.textContent = `HP ${player.hp ?? 0} / ${player.maxHp ?? 0} | Gold ${player.gold ?? 0}`;
}

export function addLog(message) {
  const dom = getElements();
  const entry = document.createElement('p');
  entry.textContent = message;
  dom.combatLog.append(entry);

  while (dom.combatLog.childElementCount > LOG_LIMIT) {
    dom.combatLog.firstElementChild?.remove();
  }
}

export function createIcon(iconPath, altText) {
  const img = document.createElement('img');
  img.src = iconPath;
  img.alt = altText;
  return img;
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
