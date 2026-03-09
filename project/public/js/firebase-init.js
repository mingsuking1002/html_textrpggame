/**
 * firebase-init.js
 * ────────────────
 * Firebase SDK 초기화 및 Auth(구글 로그인/로그아웃) 로직
 */

import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB2pT-edyhVGzdwmWztACHhblazEAcNSZ8',
  authDomain: 'textgame-edbd2.firebaseapp.com',
  projectId: 'textgame-edbd2',
  storageBucket: 'textgame-edbd2.firebasestorage.app',
  messagingSenderId: '956382788561',
  appId: '1:956382788561:web:736a14cffd56f1fd63fef0',
  measurementId: 'G-LGJE65H265',
};

let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let googleProvider = null;

export function initFirebase() {
  if (firebaseApp) {
    return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
  }

  firebaseApp = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  firestoreDb = getFirestore(firebaseApp);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });

  return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
}

export async function signIn() {
  const { auth } = initFirebase();
  return signInWithPopup(auth, googleProvider);
}

export async function logOut() {
  const { auth } = initFirebase();
  return signOut(auth);
}

export function onAuthChange(callback) {
  const { auth } = initFirebase();
  return onAuthStateChanged(auth, callback);
}

export function getFirestoreDb() {
  return initFirebase().db;
}

export function getAuthInstance() {
  return initFirebase().auth;
}
