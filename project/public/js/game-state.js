/**
 * game-state.js
 * ─────────────
 * 게임 상태(state) 단일 스토어 + 구독/발행
 */

export const AppState = Object.freeze({
  BOOT: 'BOOT',
  AUTH: 'AUTH',
  LOBBY: 'LOBBY',
  UPGRADE: 'UPGRADE',
  RUN_START: 'RUN_START',
  CLASS_SELECT: 'CLASS_SELECT',
  PROLOGUE: 'PROLOGUE',
  STORY: 'STORY',
  COMBAT: 'COMBAT',
  SURVIVAL_CHECK: 'SURVIVAL_CHECK',
  ENDING_DEATH: 'ENDING_DEATH',
  ENDING_SUCCESS: 'ENDING_SUCCESS',
  RANKING: 'RANKING',
  PAYOUT: 'PAYOUT',
});

const state = {
  uiState: {
    screen: AppState.BOOT,
    authBusy: false,
    authMessage: '구글 계정으로 로그인해 주세요.',
    bootMessage: '로딩 중...',
  },
  user: null,
  currentRun: null,
  gameData: null,
};

const listeners = [];

export function getState() {
  return state;
}

export function setState(partial) {
  if (partial.uiState) {
    state.uiState = { ...state.uiState, ...partial.uiState };
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'user')) {
    state.user = partial.user;
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'currentRun')) {
    state.currentRun = partial.currentRun;
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'gameData')) {
    state.gameData = partial.gameData;
  }

  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.push(listener);

  return () => {
    const index = listeners.indexOf(listener);

    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}
