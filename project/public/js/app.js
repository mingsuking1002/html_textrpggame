/**
 * app.js
 * ──────
 * 메인 컨트롤러 — 모듈 조립 + 상태 전이 + 이벤트 바인딩
 */

import { loadGameData, loadUserData } from './db-manager.js';
import { getState, setState, subscribe, AppState } from './game-state.js';
import { initFirebase, logOut, onAuthChange, signIn } from './firebase-init.js';
import {
  bindUIActions,
  renderLobby,
  renderScreen,
  setAuthStatus,
  setBootStatus,
  showToast,
} from './ui-renderer.js';

let authUnsubscribe = null;
let activeAuthTaskId = 0;
let retryAuthLoad = null;

function transitionTo(nextScreen) {
  setState({
    uiState: {
      screen: nextScreen,
    },
  });
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

async function restoreAuthenticatedSession(authUser) {
  const taskId = ++activeAuthTaskId;
  retryAuthLoad = () => {
    void restoreAuthenticatedSession(authUser);
  };

  transitionTo(AppState.AUTH);
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
    const [gameData, user] = await Promise.all([
      loadGameData(),
      loadUserData(authUser),
    ]);

    if (taskId !== activeAuthTaskId) {
      return;
    }

    retryAuthLoad = null;
    setState({
      gameData,
      user,
      currentRun: user.currentRun || { isActive: false },
      uiState: {
        authBusy: false,
        authMessage: '로비 진입 완료',
      },
    });
    renderLobby(user);
    transitionTo(AppState.LOBBY);
    showToast('로비에 입장했습니다.', 'success');
  } catch (error) {
    if (taskId !== activeAuthTaskId) {
      return;
    }

    console.error('[app] Failed to restore authenticated session', error);
    transitionTo(AppState.AUTH);
    setState({
      user: null,
      currentRun: null,
      gameData: null,
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
  setState({
    user: null,
    currentRun: null,
    gameData: null,
    uiState: {
      authBusy: false,
      authMessage: '구글 계정으로 로그인해 주세요.',
    },
  });
  transitionTo(AppState.AUTH);
  setAuthStatus({
    message: '구글 계정으로 로그인해 주세요.',
    isBusy: false,
    showRetry: false,
    loginDisabled: false,
  });
}

async function boot() {
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
      showToast('런 시작 연결은 Phase 3에서 구현됩니다.', 'info');
    },
    onUpgrade: () => {
      showToast('강화 화면은 아직 비활성화 상태입니다.', 'info');
    },
    onBootRetry: () => {
      window.location.reload();
    },
    onReturnLobby: () => {
      transitionTo(AppState.LOBBY);
    },
  });

  transitionTo(AppState.BOOT);
  setBootStatus('Firebase 초기화 중...');

  try {
    initFirebase();
  } catch (error) {
    console.error('[app] Firebase initialization failed', error);
    setBootStatus('Firebase 초기화에 실패했습니다. 다시 시도해 주세요.', {
      isError: true,
      showRetry: true,
    });
    return;
  }

  setBootStatus('인증 상태를 확인하는 중...');
  transitionTo(AppState.AUTH);
  setAuthStatus({
    message: '구글 계정으로 로그인해 주세요.',
    isBusy: false,
    showRetry: false,
    loginDisabled: false,
  });

  authUnsubscribe?.();
  authUnsubscribe = onAuthChange((authUser) => {
    if (authUser) {
      void restoreAuthenticatedSession(authUser);
      return;
    }

    handleSignedOut();
  });
}

subscribe((state) => {
  renderScreen(state.uiState.screen);

  if (state.uiState.screen === AppState.LOBBY && state.user) {
    renderLobby(state.user);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const { uiState } = getState();
  renderScreen(uiState.screen);
  void boot();
});
