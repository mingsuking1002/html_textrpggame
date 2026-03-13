/**
 * sound-manager.js
 * ─────────────────
 * 사운드 UI 상태는 유지하되 실제 오디오 재생은 비활성화한 임시 스텁
 */

const STORAGE_KEYS = Object.freeze({
  bgm: 'ph:volume:bgm',
  sfx: 'ph:volume:sfx',
  muted: 'ph:volume:muted',
});

const DEFAULT_VOLUMES = Object.freeze({
  bgm: 0.5,
  sfx: 0.7,
});

const state = {
  config: null,
  currentTrackId: null,
  isInitialized: false,
  bgmVolume: DEFAULT_VOLUMES.bgm,
  sfxVolume: DEFAULT_VOLUMES.sfx,
  muted: false,
};

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
    clampVolume(defaults.bgm, DEFAULT_VOLUMES.bgm),
  );
  state.sfxVolume = clampVolume(
    storage?.getItem(STORAGE_KEYS.sfx),
    clampVolume(defaults.sfx, DEFAULT_VOLUMES.sfx),
  );
  state.muted = storage?.getItem(STORAGE_KEYS.muted) === 'true';
}

export function initSoundManager(soundConfig = null) {
  state.config = soundConfig && typeof soundConfig === 'object' ? soundConfig : null;
  state.currentTrackId = null;
  state.isInitialized = true;
  loadVolumeSettings();
}

export async function playBGM(trackId) {
  if (!state.isInitialized) {
    return;
  }

  state.currentTrackId = trackId || null;
}

export function stopBGM() {
  state.currentTrackId = null;
}

export function playSFX() {
  // Intentionally disabled while sound assets are being replaced.
}

export function setVolume(type, level) {
  const safeType = type === 'sfx' ? 'sfx' : 'bgm';
  const nextLevel = clampVolume(level, DEFAULT_VOLUMES[safeType]);

  if (safeType === 'bgm') {
    state.bgmVolume = nextLevel;
  } else {
    state.sfxVolume = nextLevel;
  }

  persistVolume(safeType, nextLevel);
}

export function getVolume(type) {
  return type === 'sfx' ? state.sfxVolume : state.bgmVolume;
}

export function setMuted(nextMuted) {
  state.muted = Boolean(nextMuted);
  persistMute();
}

export function isMuted() {
  return state.muted;
}
