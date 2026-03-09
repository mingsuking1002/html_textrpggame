# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 게임 시작 → 로그인(Auth) → 로비(Lobby) ↔ 강화 → 런 시작 → 스토리/전투 반복 → 엔딩 → 재화 지급 → 로비 복귀
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정 → 전투 종료
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 이야기 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 1 — Firebase Auth + GameData 로드 + 로비 진입`

* **Goal (유저 가치):** 플레이어가 구글 계정으로 로그인하면, 게임 데이터가 자동 로드되고 로비 화면에 진입하여 "게임 시작" 버튼을 볼 수 있다.

* **Non-Goals:**
  - 전투/스토리 구현 (Phase 3)
  - 강화(Upgrade) 화면 구현
  - Cloud Save / currentRun 복구 (Phase 4)
  - 런 시작 이후 흐름 (직업 선택, 프롤로그 등)

* **Scope in Loop:** App Loop의 `BOOT → AUTH → LOBBY` 구간

* **Target Files:**
  - `public/js/firebase-init.js` — Firebase SDK 초기화 + Google Auth 구현
  - `public/js/db-manager.js` — GameData 7문서 로드/캐싱 + Users 초기 문서 생성
  - `public/js/game-state.js` — state 초기값 설정 (변경 최소)
  - `public/js/ui-renderer.js` — 화면 전환(show/hide) + 로비 HUD + 토스트 알림
  - `public/js/app.js` — boot 흐름 조립 (Auth → GameData 로드 → 화면 전환)
  - `public/index.html` — Firebase SDK CDN 추가 + 로비 UI 요소 보강

* **Firestore Reads/Writes:**
  - Reads:
    - `GameData/config` (1회)
    - `GameData/classes` (1회)
    - `GameData/symbols` (1회)
    - `GameData/monsters` (1회)
    - `GameData/encounters` (1회)
    - `GameData/story` (1회)
    - `GameData/endings` (1회)
    - `Users/{uid}` (로그인 시 1회)
  - Writes:
    - `Users/{uid}` — 최초 로그인 시 초기 문서 생성 (setDoc with merge)

* **State Model:**
  - `uiState.screen` 전이:
    - `BOOT` → (Firebase 초기화 완료) → `AUTH`
    - `AUTH` → (로그인 성공 + GameData 로드 완료) → `LOBBY`
    - 로그아웃 시: `LOBBY` → `AUTH`
  - `state.gameData`: GameData 7문서 캐시 객체
  - `state.user`: `{ uid, displayName, ...Users문서필드 }`

* **UI Flow:**
  ```
  [screen-boot]
    "로딩 중..." 표시 (Firebase 초기화)
         ↓ (자동)
  [screen-auth]
    - "파친코 히어로" 타이틀
    - [구글로 시작하기] 버튼
    - 에러 시: 토스트 알림 "로그인에 실패했습니다. 다시 시도해 주세요."
         ↓ (로그인 성공)
    - "게임 데이터 로딩 중..." 로딩 표시
         ↓ (GameData 로드 완료)
  [screen-lobby]
    - 유저 닉네임 표시
    - 메타 정보 (totalGoldEarned, highestStage)
    - [게임 시작] 버튼 (활성화 상태 — 실제 연결은 Phase 3)
    - [강화(결정)] 버튼 (비활성화 — Phase 미구현)
    - [로그아웃] 버튼
  ```

* **Algorithm (의사코드):**
  ```
  boot():
    initFirebase(config)
    transitionTo(AUTH)
    onAuthChange(user =>
      if user:
        gameData = await loadGameData()          // 7문서 병렬 fetch
        userData = await loadOrCreateUser(uid)   // 없으면 초기 생성
        setState({ gameData, user: userData })
        transitionTo(LOBBY)
      else:
        transitionTo(AUTH)
    )
  ```

* **Edge Cases:**
  - 로그인 팝업 차단된 경우 → 토스트: "팝업이 차단되었습니다"
  - GameData 로드 중 네트워크 끊김 → 토스트 + "다시 시도" 버튼
  - GameData 7문서 중 일부만 로드 실패 → 전체 실패 처리 (부분 로드 금지)
  - Users/{uid} 문서 생성 실패 → 토스트 + "다시 시도" 버튼
  - 이미 로그인된 상태에서 새로고침 → Auth 상태 자동 복구 → 바로 LOBBY
  - Firebase SDK 로드 실패(CDN 오류) → boot 화면에서 에러 메시지

* **Persistence:**
  - 이 Phase에서는 Auto-save 없음 (읽기 전용)
  - Users 초기 문서 생성만 1회 write
  - 새로고침 시: `onAuthStateChanged`로 자동 인증 복구 → GameData 재로드 → LOBBY

* **Testing Checklist:**
  1. □ 첫 방문: boot → auth 화면이 보이는가?
  2. □ 구글 로그인 성공 → "데이터 로딩" → 로비 화면 전환되는가?
  3. □ 로비에 유저 닉네임, 메타 정보가 표시되는가?
  4. □ 로그아웃 클릭 → auth 화면으로 돌아가는가?
  5. □ 새로고침 시 자동 로그인 → 바로 로비로 가는가?
  6. □ 콘솔에서 Firestore `Users/{uid}` 문서가 생성되었는가?
  7. □ 콘솔에서 GameData 7문서가 캐시에 정상 로드되었는가? (console.log 확인)
  8. □ 네트워크 끊김 상태에서 로그인 시 에러 토스트가 뜨는가?
  9. □ 팝업 차단 시 안내 토스트가 뜨는가?
  10. □ Firebase SDK CDN 실패 시 boot 화면에서 에러가 표시되는가?

* **주의/최적화 포인트:**
  - GameData 7문서는 **병렬 로드** (Promise.all) — 순차 로드 금지
  - GameData 캐시 객체는 `Object.freeze()`로 읽기 전용 보장 권장
  - Firebase SDK는 **모듈형(v11+)** CDN 사용 (`https://www.gstatic.com/firebasejs/11.x.x/`)
  - innerHTML 사용 금지 — textContent 또는 DOM API로 렌더
  - 로그인/로드 중 버튼 중복 클릭 방지 (disabled 상태 관리)
  - 에러 메시지는 `ui-renderer.js`의 `showToast()`로 통일
  - Firebase config는 코드에 직접 포함 (웹 앱용 공개 키이므로 보안 이슈 없음)

---

**Firebase Config (확정):**
```js
const firebaseConfig = {
  apiKey: "AIzaSyB2pT-edyhVGzdwmWztACHhblazEAcNSZ8",
  authDomain: "textgame-edbd2.firebaseapp.com",
  projectId: "textgame-edbd2",
  storageBucket: "textgame-edbd2.firebasestorage.app",
  messagingSenderId: "956382788561",
  appId: "1:956382788561:web:736a14cffd56f1fd63fef0",
  measurementId: "G-LGJE65H265"
};
```

**Users 초기 문서 스키마:**
```json
{
  "displayName": "(Google Auth에서 가져옴)",
  "createdAt": "(서버 timestamp)",
  "totalGoldEarned": 0,
  "highestStage": 0,
  "crystals": 0,
  "currentRun": {
    "isActive": false
  }
}
```
