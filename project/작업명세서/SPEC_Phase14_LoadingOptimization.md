# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: **게임 시작(BOOT)** → 로그인(AUTH) → GameData 로드 → 로비(LOBBY) → …

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 14 — 로딩 최적화 + 체감 개선`

* **Goal (유저 가치):** 게임 시작부터 로비 진입까지 체감 로딩 시간을 최소화하고, 로딩 중 진행 상태를 보여주어 "멈춘 것 아닌가?" 불안감을 제거한다.

* **Non-Goals:**
  - Vite/Webpack 번들링 도입 (별도 판단 필요)
  - 서버 사이드 렌더링
  - CDN 에셋 최적화 (이미지 압축/lazy-load는 별도)

* **Scope in Loop:** App Loop의 `BOOT → AUTH → LOBBY` 구간

* **Target Files:**
  - `public/js/db-manager.js` — Firestore 캐시 활성화 + GameData/UserData 병렬 로드
  - `public/js/app.js` — 로딩 진행률 표시 + 데이터 로드 파이프라인 최적화
  - `public/js/ui-renderer.js` — 프로그레스 바 렌더
  - `public/index.html` — 프로그레스 바 HTML/CSS 추가

* **Firestore Reads/Writes:**
  - Reads: 기존과 동일 (7문서 + Users 1문서)
  - Writes: 없음

* **State Model:**
  - `uiState.bootProgress`: `{ current: number, total: number, label: string }` 추가

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `db-manager.js` | `loadGameData` | `() → Promise<GameDataCache>` | 1) Firestore 로컬 캐시 활성화 2) 문서별 로드 완료 콜백 추가 |
| `app.js` | `restoreAuthenticatedSession` | `(authUser) → Promise<void>` | GameData + UserData 병렬 로드 + 진행률 업데이트 |
| `firebase-init.js` | `initFirebase` | `() → { app, auth, db }` | Firestore persistence 활성화 옵션 추가 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `db-manager.js` | `loadGameDataWithProgress` | `(onProgress) → Promise<GameDataCache>` | export | 문서별 로드 완료 시 콜백 호출 |
| `ui-renderer.js` | `setBootProgress` | `(current, total, label) → void` | export | 프로그레스 바 + 라벨 갱신 |
| `app.js` | `loadAllDataParallel` | `(authUser) → Promise<{gameData, user}>` | internal | GameData + UserData 동시 로드 |

### 호출 관계 (CALLS)

```
restoreAuthenticatedSession(authUser)
  → loadAllDataParallel(authUser)
    → Promise.all([
         loadGameDataWithProgress(onProgress),  // 7문서 병렬 + 진행률
         loadUserData(authUser)                  // 동시에 유저 데이터
       ])
    → onProgress 콜백마다:
       → setBootProgress(current, total, "config 로드 완료...")
  → 로드 완료 → transitionTo(LOBBY)
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] `db-manager.js`에 `loadGameDataWithProgress` 추가
- [x] `ui-renderer.js`에 `setBootProgress` 추가
- [x] `app.js`에 `loadAllDataParallel` 추가

---

## 🔧 최적화 항목 상세

### 1. Firestore 로컬 캐시 활성화 (가장 큰 효과)

```js
// firebase-init.js
import { enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

export function initFirebase() {
  // ... 기존 초기화 ...
  firestoreDb = getFirestore(firebaseApp);

  // 캐시 활성화 (재방문 시 로컬에서 즉시 로드)
  enableMultiTabIndexedDbPersistence(firestoreDb).catch((err) => {
    console.warn('[firebase-init] Persistence not available:', err.code);
  });
}
```

**효과:** 첫 방문 후 재방문 시 GameData가 IndexedDB에서 즉시 로드 → **3~5초 → 0.5초 이하**

### 2. GameData + UserData 병렬 로드

현재: `GameData 로드 (3~5초)` → `UserData 로드 (1~2초)` = **순차 5~7초**
변경: `GameData + UserData 동시 로드` = **병렬 3~5초** (최대 2초 단축)

```js
async function loadAllDataParallel(authUser) {
  const [gameData, user] = await Promise.all([
    loadGameDataWithProgress((current, total, docId) => {
      setBootProgress(current, total, `${docId} 로드 완료`);
    }),
    loadUserData(authUser),
  ]);
  return { gameData, user };
}
```

### 3. 문서별 진행률 표시

```js
export async function loadGameDataWithProgress(onProgress) {
  const db = getFirestoreDb();
  const total = GAME_DATA_DOC_IDS.length; // 7
  let loaded = 0;

  const entries = await Promise.all(
    GAME_DATA_DOC_IDS.map(async (docId) => {
      const snapshot = await getDoc(doc(db, 'GameData', docId));
      if (!snapshot.exists()) throw new Error(`Missing GameData/${docId}`);
      loaded++;
      onProgress?.(loaded, total, docId);
      return [docId, snapshot.data()];
    }),
  );

  gameDataCache = deepFreeze(Object.fromEntries(entries));
  return gameDataCache;
}
```

### 4. 프로그레스 바 UI

```html
<!-- index.html boot 섹션에 추가 -->
<div id="boot-progress-container" class="progress-container" hidden>
  <div class="progress-bar">
    <div id="boot-progress-fill" class="progress-fill"></div>
  </div>
  <p id="boot-progress-label" class="status-text">0 / 8</p>
</div>
```

```css
.progress-container { margin: 20px 0; }
.progress-bar {
  width: 100%; height: 8px; border-radius: 999px;
  background: rgba(51, 65, 85, 0.8);
  overflow: hidden;
}
.progress-fill {
  height: 100%; width: 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  transition: width 200ms ease;
}
```

---

* **Edge Cases:**
  - `enableMultiTabIndexedDbPersistence` 실패 (시크릿 모드 등) → 무시하고 온라인만 사용
  - GameData 로드 성공 + UserData 실패 → localStorage 백업 복구 (Phase 13 기존 로직)
  - 프로그레스 표시 중 네트워크 끊김 → 진행률 멈춤 + 에러 토스트
  - 이미 캐시된 경우 → 프로그레스가 순식간에 완료 (UI 깜빡임 방지: 300ms 미만이면 프로그레스 숨김)

* **Persistence:**
  - Firestore IndexedDB 캐시 = 자동 관리 (별도 코드 불필요)
  - 볼륨 설정 = localStorage (Phase 11 기존)

* **Testing Checklist:**
  1. □ 첫 방문 시 프로그레스 바가 1/8 → 8/8까지 갱신되는가?
  2. □ 재방문 시 로딩이 현저히 빨라지는가? (캐시 효과)
  3. □ 시크릿 모드에서 캐시 실패해도 정상 동작하는가?
  4. □ GameData + UserData가 병렬 로드되는가? (콘솔 타이밍 확인)
  5. □ 프로그레스 라벨에 현재 로딩 중인 항목이 표시되는가?
  6. □ 로딩 300ms 미만 완료 시 프로그레스 바가 깜빡이지 않는가?
  7. □ 네트워크 끊김 + 캐시 있음 → 캐시에서 로드 성공?
  8. □ 로비 진입 후 "로딩 중..." 상태가 남아있지 않는가?

* **주의/최적화 포인트:**
  - `enableMultiTabIndexedDbPersistence`는 `getFirestore()` 직후 1회만 호출
  - 캐시 활성화 후에도 온라인 시 Firestore는 백그라운드에서 최신 데이터 동기화
  - 프로그레스 바 transition은 `200ms ease`로 부드럽게
  - 번들링(Vite) 도입은 별도 판단 — CDN import 대비 2~3초 추가 단축 가능하나 빌드 파이프라인 필요

---

**기대 효과 요약:**

| 시나리오 | 현재 | 최적화 후 |
|----------|------|-----------|
| 첫 방문 | 5~8초 | 3~5초 (병렬 로드) |
| 재방문 | 5~8초 | **0.5~1초** (캐시) |
| 체감 | 빈 화면 대기 | 프로그레스 바 + 항목별 표시 |
