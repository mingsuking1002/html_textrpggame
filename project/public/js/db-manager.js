/**
 * db-manager.js
 * ─────────────
 * Firestore 데이터 로드/세이브 관리
 */

import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from './firebase-init.js';

const GAME_DATA_DOC_IDS = Object.freeze([
  'config',
  'classes',
  'symbols',
  'monsters',
  'encounters',
  'story',
  'endings',
]);

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
    currentRun: {
      isActive: false,
    },
  };
}

export async function loadGameData() {
  if (gameDataCache) {
    return gameDataCache;
  }

  if (gameDataPromise) {
    return gameDataPromise;
  }

  const db = getFirestoreDb();

  gameDataPromise = Promise.all(
    GAME_DATA_DOC_IDS.map(async (docId) => {
      const snapshot = await getDoc(doc(db, 'GameData', docId));

      if (!snapshot.exists()) {
        throw new Error(`Missing GameData/${docId}`);
      }

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

  return gameDataPromise;
}

export async function loadUserData(authSource, authProfile = null) {
  const authUser = normalizeAuthSource(authSource, authProfile);
  const db = getFirestoreDb();
  const userRef = doc(db, 'Users', authUser.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    // TODO: Firestore Rules / server validation must restrict write access to auth.uid only.
    await setDoc(userRef, buildInitialUserDoc(authUser), { merge: true });
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
  };
}

export async function saveCurrentRun(uid, currentRun) {
  const db = getFirestoreDb();
  const userRef = doc(db, 'Users', uid);

  await setDoc(
    userRef,
    {
      currentRun: cloneData(currentRun),
    },
    { merge: true },
  );
}

export async function submitRanking(rankingEntry) {
  const db = getFirestoreDb();
  return addDoc(collection(db, 'Rankings'), cloneData(rankingEntry));
}
