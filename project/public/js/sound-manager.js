/**
 * sound-manager.js
 * ─────────────────
 * HTMLAudio 기반 사운드 매니저
 */

const STORAGE_KEYS = Object.freeze({
  bgm: 'ph:volume:bgm',
  sfx: 'ph:volume:sfx',
  muted: 'ph:volume:muted',
});

const state = {
  config: null,
  currentTrackId: null,
  currentBgmAudio: null,
  isInitialized: false,
  isUnlocked: false,
  bgmVolume: 0.5,
  sfxVolume: 0.7,
  muted: false,
};

let unlockBound = false;
let visibilityBound = false;

function clampVolume(level, fallback) {
  const parsed = Number(level);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function getEffectiveVolume(type) {
  if (state.muted) {
    return 0;
  }
  return type === 'bgm' ? state.bgmVolume : state.sfxVolume;
}

function persistVolume(type, value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEYS[type], String(value));
}

function persistMute() {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEYS.muted, String(state.muted));
}

export function loadVolumeSettings() {
  const storage = getStorage();
  const defaults = state.config?.defaultVolume || {};

  state.bgmVolume = clampVolume(
    storage?.getItem(STORAGE_KEYS.bgm),
    clampVolume(defaults.bgm, 0.5),
  );
  state.sfxVolume = clampVolume(
    storage?.getItem(STORAGE_KEYS.sfx),
    clampVolume(defaults.sfx, 0.7),
  );
  state.muted = storage?.getItem(STORAGE_KEYS.muted) === 'true';
}

function bindUnlockListeners() {
  if (unlockBound || typeof document === 'undefined') {
    return;
  }

  const unlock = () => {
    state.isUnlocked = true;
    if (state.currentTrackId) {
      void playBGM(state.currentTrackId);
    }
  };

  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, unlock, { passive: true });
  });
  unlockBound = true;
}

function bindVisibilityListener() {
  if (visibilityBound || typeof document === 'undefined') {
    return;
  }

  document.addEventListener('visibilitychange', () => {
    if (!state.currentBgmAudio) {
      return;
    }

    if (document.hidden) {
      state.currentBgmAudio.pause();
      return;
    }

    if (state.currentTrackId) {
      void playBGM(state.currentTrackId);
    }
  });
  visibilityBound = true;
}

function fadeOutAudio(audio) {
  if (!audio) {
    return;
  }

  const startVolume = audio.volume;
  const stepCount = 5;
  const intervalMs = 90;
  let remaining = stepCount;

  const timer = window.setInterval(() => {
    remaining -= 1;
    audio.volume = Math.max(0, startVolume * (remaining / stepCount));

    if (remaining <= 0) {
      window.clearInterval(timer);
      audio.pause();
      audio.currentTime = 0;
    }
  }, intervalMs);
}

function createAudio(path, options = {}) {
  if (!path) {
    return null;
  }

  const audio = new Audio(path);
  audio.loop = Boolean(options.loop);
  audio.preload = options.loop ? 'auto' : 'metadata';
  return audio;
}

function applyBgmVolume() {
  if (state.currentBgmAudio) {
    state.currentBgmAudio.volume = getEffectiveVolume('bgm');
  }
}

export function initSoundManager(soundConfig = null) {
  state.config = soundConfig && typeof soundConfig === 'object' ? soundConfig : null;
  state.isInitialized = true;
  loadVolumeSettings();
  bindUnlockListeners();
  bindVisibilityListener();
  applyBgmVolume();
}

export async function playBGM(trackId) {
  const trackPath = state.config?.bgm?.[trackId];

  state.currentTrackId = trackId || null;

  if (!state.isInitialized || !trackPath) {
    return;
  }

  if (
    state.currentBgmAudio
    && state.currentTrackId === trackId
    && state.currentBgmAudio.dataset.trackId === trackId
  ) {
    applyBgmVolume();
    if (state.isUnlocked && document.visibilityState === 'visible') {
      try {
        await state.currentBgmAudio.play();
      } catch (error) {
        console.warn('[sound-manager] Failed to resume BGM', error);
      }
    }
    return;
  }

  const nextAudio = createAudio(trackPath, { loop: true });
  if (!nextAudio) {
    return;
  }

  nextAudio.dataset.trackId = trackId;
  nextAudio.volume = getEffectiveVolume('bgm');
  nextAudio.addEventListener('error', () => {
    console.warn(`[sound-manager] Failed to load BGM: ${trackId}`);
  }, { once: true });

  const previousAudio = state.currentBgmAudio;
  state.currentBgmAudio = nextAudio;

  if (previousAudio && previousAudio !== nextAudio) {
    fadeOutAudio(previousAudio);
  }

  if (!state.isUnlocked || (typeof document !== 'undefined' && document.hidden)) {
    return;
  }

  try {
    await nextAudio.play();
  } catch (error) {
    console.warn('[sound-manager] Failed to play BGM', error);
  }
}

export function stopBGM() {
  if (!state.currentBgmAudio) {
    state.currentTrackId = null;
    return;
  }

  state.currentTrackId = null;
  state.currentBgmAudio.pause();
  state.currentBgmAudio.currentTime = 0;
}

export function playSFX(sfxId) {
  const sfxPath = state.config?.sfx?.[sfxId];

  if (!state.isInitialized || !sfxPath || !state.isUnlocked) {
    return;
  }

  const audio = createAudio(sfxPath, { loop: false });
  if (!audio) {
    return;
  }

  audio.volume = getEffectiveVolume('sfx');
  audio.addEventListener('error', () => {
    console.warn(`[sound-manager] Failed to load SFX: ${sfxId}`);
  }, { once: true });

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((error) => {
      console.warn('[sound-manager] Failed to play SFX', error);
    });
  }
}

export function setVolume(type, level) {
  const safeType = type === 'sfx' ? 'sfx' : 'bgm';
  const nextLevel = clampVolume(level, safeType === 'bgm' ? 0.5 : 0.7);

  if (safeType === 'bgm') {
    state.bgmVolume = nextLevel;
  } else {
    state.sfxVolume = nextLevel;
  }

  persistVolume(safeType, nextLevel);
  applyBgmVolume();
}

export function getVolume(type) {
  return type === 'sfx' ? state.sfxVolume : state.bgmVolume;
}

export function setMuted(nextMuted) {
  state.muted = Boolean(nextMuted);
  persistMute();
  applyBgmVolume();
}

export function isMuted() {
  return state.muted;
}
