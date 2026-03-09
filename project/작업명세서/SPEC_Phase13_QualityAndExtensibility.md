# 🟡 대기중

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 13 — 품질/확장성 (보안 + 검증 + 백업 + 배포)`

* **Goal (유저 가치):** 데이터 주도 설계가 하드코딩 없이 실제로 동작하는지 검증되고, 보안/안정성/배포 기반이 완성되어 운영 준비가 된다.

* **Non-Goals:**
  - Cloud Functions 서버 사이드 검증 (클라이언트 Firestore Rules까지만)
  - CI/CD 파이프라인 구축
  - 모니터링/알람 시스템

* **Scope in Loop:** 인프라 (코드 로직 변경 최소)

* **Target Files:**
  - `firestore.rules` — **[NEW]** Firestore 보안 규칙
  - `scripts/validate-gamedata.js` — **[NEW]** JSON 참조 무결성 검증 스크립트
  - `public/js/app.js` — localStorage 백업/복구 로직
  - `firebase.json` — **[NEW]** Firebase Hosting 설정
  - `.firebaserc` — **[NEW]** Firebase 프로젝트 연결

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `app.js` | `restoreAuthenticatedSession` | `(authUser) → Promise<void>` | Firestore 로드 실패 시 localStorage 백업에서 복구 시도 |
| `db-manager.js` | `saveCurrentRun` | `(uid, currentRun) → Promise<void>` | 저장 성공 시 localStorage 미러링, 실패 시 localStorage만 저장 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `app.js` | `saveLocalBackup` | `(uid, data) → void` | internal | localStorage에 세이브 백업 |
| `app.js` | `loadLocalBackup` | `(uid) → object\|null` | internal | localStorage에서 백업 로드 |
| `app.js` | `clearLocalBackup` | `(uid) → void` | internal | 정상 로드 후 백업 삭제 |

### 호출 관계 (CALLS)

```
saveCurrentRun(uid, currentRun)
  → Firestore 저장 성공: saveLocalBackup(uid, currentRun)
  → Firestore 저장 실패: saveLocalBackup(uid, currentRun) + showToast("오프라인 백업 저장됨")

restoreAuthenticatedSession(authUser)
  → Firestore 로드 시도
  → 실패 시: loadLocalBackup(uid) → 복구 + showToast("오프라인 백업에서 복구됨")
  → 성공 시: clearLocalBackup(uid)
```

### 신규 파일 (NEW FILES)

#### `firestore.rules`
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // GameData: 모든 사용자 읽기 가능, 쓰기 금지
    match /GameData/{docId} {
      allow read: if true;
      allow write: if false;
    }
    // Users: 본인 문서만 읽기/쓰기
    match /Users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Rankings: 인증된 사용자만 생성, 수정/삭제 금지
    match /Rankings/{docId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
```

#### `scripts/validate-gamedata.js`
검증 항목 (§5-5 참조 관계):
1. `classes.weapons[]` → `symbols` 키 존재
2. `monsters.lootTable[].symbolId` → `symbols` 키 존재
3. `encounters.monsters[]` → `monsters` 키 존재
4. `encounters.storyNodeId` → `story` 키 존재
5. `story.encounterPool[]` → `encounters` 키 존재
6. `story.shopItems[].symbolId` → `symbols` 키 존재
7. `story.endingId` → `endings` 키 존재
8. `story.combatMonster` → `monsters` 키 존재
9. `story.choices[].nextNodeId` → `story` 키 존재 (or `$return`)

실행: `node scripts/validate-gamedata.js`
출력: 통과/실패 + 구체적 오류 메시지

#### `firebase.json`
```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] `app.js`에 `saveLocalBackup`, `loadLocalBackup`, `clearLocalBackup` 추가

---

* **Testing Checklist:**

  **Firestore Rules:**
  1. □ 비로그인 상태에서 Users 문서 접근 차단?
  2. □ 로그인 상태에서 본인 Users 문서만 읽기/쓰기 가능?
  3. □ GameData 문서 쓰기 차단?
  4. □ Rankings 생성은 가능, 수정/삭제 차단?

  **데이터 무결성 검증:**
  5. □ `node scripts/validate-gamedata.js` 실행 → 모든 참조 통과?
  6. □ 의도적으로 잘못된 참조 삽입 → 에러 감지?

  **localStorage 백업:**
  7. □ 네트워크 끊김 상태에서 전투 → localStorage 백업 저장?
  8. □ 네트워크 복구 후 재접속 → 백업에서 복구 + 토스트?
  9. □ 정상 로드 시 백업 삭제?

  **Firebase Hosting:**
  10. □ `firebase deploy` 성공?
  11. □ 배포 URL에서 게임 정상 로드?

* **주의/최적화 포인트:**
  - localStorage 용량 제한(~5MB) → currentRun만 저장 (GameData는 저장 금지)
  - `validate-gamedata.js`는 CI/CD 연동 가능하도록 exit code 반환
  - Firestore Rules 배포: `firebase deploy --only firestore:rules`
  - Hosting 배포: `firebase deploy --only hosting`
