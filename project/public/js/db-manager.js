/**
 * db-manager.js
 * ─────────────
 * Firestore 데이터 로드/세이브 관리
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirestoreDb } from '@ph/firebase-init';

const GAME_DATA_DOC_IDS = Object.freeze([
  'config',
  'classes',
  'origins',
  'symbols',
  'monsters',
  'encounters',
  'story',
  'endings',
]);
export const GAME_DATA_DOC_COUNT = GAME_DATA_DOC_IDS.length;
const LOCAL_BACKUP_PREFIX = 'ph:current-run:';

let gameDataCache = null;
let gameDataPromise = null;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  Object.values(value).forEach((entry) => {
    deepFreeze(entry);
  });

  return value;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getLocalBackupKey(uid) {
  return `${LOCAL_BACKUP_PREFIX}${uid}`;
}

function mirrorLocalBackup(uid, currentRun) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(getLocalBackupKey(uid), JSON.stringify({
      savedAt: new Date().toISOString(),
      currentRun: cloneData(currentRun),
    }));
  } catch (error) {
    console.warn('[db-manager] Failed to mirror local backup', error);
  }
}

function normalizeUpgradeMap(upgrades) {
  if (!upgrades || typeof upgrades !== 'object' || Array.isArray(upgrades)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(upgrades)
      .map(([upgradeId, level]) => [upgradeId, Math.max(0, Number(level) || 0)])
      .filter(([, level]) => level > 0),
  );
}

function normalizeAuthSource(authSource, authProfile = null) {
  if (typeof authSource === 'string') {
    return {
      uid: authSource,
      displayName: authProfile?.displayName || '모험가',
      email: authProfile?.email || null,
      photoURL: authProfile?.photoURL || null,
    };
  }

  return {
    uid: authSource.uid,
    displayName: authSource.displayName || '모험가',
    email: authSource.email || null,
    photoURL: authSource.photoURL || null,
  };
}

function buildInitialUserDoc(authProfile) {
  return {
    displayName: authProfile.displayName,
    createdAt: serverTimestamp(),
    totalGoldEarned: 0,
    highestStage: 0,
    crystals: 0,
    upgrades: {},
    currentRun: {
      isActive: false,
    },
  };
}

function buildUserFallback(authProfile) {
  return {
    displayName: authProfile.displayName,
    createdAt: null,
    totalGoldEarned: 0,
    highestStage: 0,
    crystals: 0,
    upgrades: {},
    currentRun: {
      isActive: false,
    },
  };
}

function createGameDataLoadPromise(onProgress = null) {
  const db = getFirestoreDb();
  let loadedCount = 0;

  return Promise.all(
    GAME_DATA_DOC_IDS.map(async (docId) => {
      const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      const snapshot = await getDoc(doc(db, 'GameData', docId));

      if (!snapshot.exists()) {
        throw new Error(`Missing GameData/${docId}`);
      }

      loadedCount += 1;
      const durationMs = (
        (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now()
      ) - startedAt;
      onProgress?.(loadedCount, GAME_DATA_DOC_COUNT, docId, {
        durationMs,
        fromCache: Boolean(snapshot.metadata?.fromCache),
      });
      return [docId, snapshot.data()];
    }),
  )
    .then((entries) => {
      const loadedData = Object.fromEntries(entries);
      gameDataCache = deepFreeze(loadedData);
      console.log('[db-manager] GameData cache ready', gameDataCache);
      return gameDataCache;
    })
    .catch((error) => {
      gameDataCache = null;
      throw error;
    })
    .finally(() => {
      gameDataPromise = null;
    });
}

export async function loadGameData() {
  if (gameDataCache) {
    return gameDataCache;
  }

  if (gameDataPromise) {
    return gameDataPromise;
  }

  gameDataPromise = createGameDataLoadPromise();
  return gameDataPromise;
}

export async function loadGameDataWithProgress(onProgress) {
  if (gameDataCache) {
    GAME_DATA_DOC_IDS.forEach((docId, index) => {
      onProgress?.(index + 1, GAME_DATA_DOC_COUNT, docId, {
        durationMs: 0,
        fromCache: true,
        replayed: true,
        cached: true,
      });
    });
    return gameDataCache;
  }

  if (gameDataPromise) {
    return gameDataPromise;
  }

  gameDataPromise = createGameDataLoadPromise(onProgress);
  return gameDataPromise;
}

export async function loadUserData(authSource, authProfile = null, onTrace = null) {
  const authUser = normalizeAuthSource(authSource, authProfile);
  const db = getFirestoreDb();
  const userRef = doc(db, 'Users', authUser.uid);
  const readStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const snapshot = await getDoc(userRef);
  onTrace?.('read', {
    durationMs: (
      (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now()
    ) - readStartedAt,
    fromCache: Boolean(snapshot.metadata?.fromCache),
    exists: snapshot.exists(),
  });

  if (!snapshot.exists()) {
    // TODO: Firestore Rules / server validation must restrict write access to auth.uid only.
    const createStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    await setDoc(userRef, buildInitialUserDoc(authUser), { merge: true });
    onTrace?.('bootstrap-create', {
      durationMs: (
        (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now()
      ) - createStartedAt,
      created: true,
    });
    return {
      uid: authUser.uid,
      email: authUser.email,
      photoURL: authUser.photoURL,
      ...buildUserFallback(authUser),
      displayName: authUser.displayName,
    };
  }

  const userDoc = snapshot.data();

  return {
    uid: authUser.uid,
    email: authUser.email,
    photoURL: authUser.photoURL,
    ...cloneData(userDoc),
    displayName: userDoc.displayName || authUser.displayName,
    totalGoldEarned: Math.max(0, Number(userDoc.totalGoldEarned) || 0),
    highestStage: Math.max(0, Number(userDoc.highestStage) || 0),
    crystals: Math.max(0, Number(userDoc.crystals) || 0),
    upgrades: normalizeUpgradeMap(userDoc.upgrades),
    currentRun: cloneData(userDoc.currentRun || { isActive: false }),
  };
}

export async function saveCurrentRun(uid, currentRun) {
  const db = getFirestoreDb();
  const userRef = doc(db, 'Users', uid);
  const runSnapshot = cloneData(currentRun);

  try {
    // TODO: Firestore Rules / server validation must restrict write access to auth.uid only.
    await setDoc(
      userRef,
      {
        currentRun: runSnapshot,
      },
      { merge: true },
    );
    mirrorLocalBackup(uid, runSnapshot);
  } catch (error) {
    mirrorLocalBackup(uid, runSnapshot);
    error.localBackupSaved = true;
    throw error;
  }
}

export async function saveUserMeta(uid, meta = {}) {
  const db = getFirestoreDb();
  const userRef = doc(db, 'Users', uid);

  // TODO: Firestore Rules / server validation must restrict write access to auth.uid only.
  await setDoc(userRef, cloneData(meta), { merge: true });
}

export async function submitRanking(rankingEntry) {
  const db = getFirestoreDb();
  return addDoc(collection(db, 'Rankings'), {
    ...cloneData(rankingEntry),
    createdAt: serverTimestamp(),
  });
}

export async function loadTopRankings(maxEntries = 10) {
  const db = getFirestoreDb();
  const rankingQuery = query(
    collection(db, 'Rankings'),
    orderBy('payout', 'desc'),
    limit(maxEntries),
  );
  const snapshot = await getDocs(rankingQuery);

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...cloneData(documentSnapshot.data()),
  }));
}
