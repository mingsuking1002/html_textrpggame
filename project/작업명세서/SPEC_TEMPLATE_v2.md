# 📋 SPEC 양식 템플릿 (v2 — Architecture Contract 포함)

> **변경점 (v2):** 기존 양식에 `Architecture Contract` 섹션을 추가하여,  
> 수정/추가/호출하는 함수의 시그니처를 명시하도록 개선.  
> 작성 시 반드시 [`ARCHITECTURE.md`](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/작업명세서/ARCHITECTURE.md)를 참조하세요.

---

```markdown
# 🟡 대기중

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 게임 시작 → 로그인(Auth) → 로비(Lobby) ↔ 강화 → 런 시작 → …
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 → 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `(예: Lobby + Upgrade 화면 라우팅)`

* **Goal (유저 가치):** `(플레이어 관점 1~2문장)`

* **Non-Goals:** `(이번 작업에서 제외할 것)`

* **Scope in Loop:** `(App Loop / Combat Loop / Story Loop 중 어디에 붙는지)`

* **Target Files:**
  - `(생성/수정 파일 경로 목록)`

* **Firestore Reads/Writes:**
  - Reads: `(GameData/..., Users/{uid} ...)`
  - Writes: `(Users/{uid}.currentRun 업데이트, 랭킹 등록 등)`

* **State Model:**
  - `uiState.screen` 전이 조건 (AppState enum 참조)
  - `currentRun` 필드(추가/변경)

---

## 🏗️ Architecture Contract

> `ARCHITECTURE.md` 기준으로 작성합니다.  
> 기존 함수 수정/신규 함수 추가/호출 관계를 명확히 기록합니다.

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `(모듈명)` | `(함수명)` | `(현재 시그니처)` | `(파라미터 추가/반환값 변경/로직 추가 등)` |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `(모듈명)` | `(함수명)` | `(param1, param2) → ReturnType` | export/internal | `(역할 1줄)` |

### 호출 관계 (CALLS)

> 이 기능이 실행되는 흐름에서 어떤 함수를 어떤 순서로 호출하는지 간략히 기술합니다.

```
caller_function()
  → module.called_function_1()
  → module.called_function_2()
    → module.called_function_3()
```

### 삭제/폐기 함수 (DELETE / DEPRECATE)

| 모듈 | 함수명 | 사유 |
|------|--------|------|
| — | — | — |

### ARCHITECTURE.md 업데이트 필요 여부

- [ ] 이 SPEC 완료 후 `ARCHITECTURE.md`에 반영할 변경이 있음
  - 변경 내용: `(간략히)`

---

* **UI Flow:**
  ```
  [화면 구성 + 버튼/입력 + 에러/로딩 상태]
  ```

* **Algorithm (의사코드 3~8줄):**
  ```
  (핵심 로직 의사코드)
  ```

* **Edge Cases:**
  - `(예: 로드 실패, currentRun 꼬임, 중복 클릭, 네트워크 끊김)`

* **Persistence:**
  - Auto-save 시점, 실패 시 UX, 복구 시나리오

* **Testing Checklist (시나리오 5~10개):**
  1. □ (테스트 시나리오 1)
  2. □ (테스트 시나리오 2)
  3. □ ...

* **주의/최적화 포인트:**
  - `(DOM, 로딩 캐시, 보안, 데이터 하드코딩 금지 등)`
```

---

## 양식 사용 가이드

### Architecture Contract 작성 원칙

1. **MODIFY** — 기존 함수의 시그니처가 바뀌거나 주요 로직이 추가되는 경우만 기록
2. **NEW** — 완전히 새로 만드는 함수. `export`인지 `internal`인지 반드시 명시
3. **CALLS** — 해당 기능의 **주요 실행 흐름**만 기록 (모든 유틸리티 호출까지 적을 필요 없음)
4. **DELETE** — 이번 작업으로 제거하거나 폐기(deprecated) 처리하는 함수
5. **파일 저장 후** Codex-Web이 구현 완료(🟢) 시, TD가 `ARCHITECTURE.md`도 함께 업데이트

### 예시 (Phase 6 — 강화 시스템 가정)

```markdown
### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `db-manager.js` | `saveUserMeta` | `(uid, meta) → Promise<void>` | `meta.upgrades` 필드 추가 지원 |
| `app.js` | `boot` | `() → Promise<void>` | `onUpgrade` 핸들러에 실제 로직 연결 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `app.js` | `handleUpgrade` | `(upgradeId) → void` | internal | 강화 구매 처리 + 재화 차감 + 세이브 |
| `ui-renderer.js` | `renderUpgradeShop` | `(upgrades, crystals) → void` | export | 강화 상점 화면 렌더 |

### 호출 관계 (CALLS)

```
handleUpgrade(upgradeId)
  → getState().user.crystals (잔액 확인)
  → setState({ user: { ...updated } })
  → db-manager.saveUserMeta(uid, { crystals, upgrades })
  → ui-renderer.renderUpgradeShop(updatedList, remainingCrystals)
  → ui-renderer.showToast("강화 완료!")
```
```
