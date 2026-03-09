# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 게임 시작 → 로그인(Auth) → 로비(Lobby) ↔ **강화(결정)** → 런 시작 → 스토리/전투 반복 → 엔딩 → 재화 지급 → 로비 복귀
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 → 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 6 — 강화(Upgrade) 시스템`

* **Goal (유저 가치):** 플레이어가 런 종료 후 얻은 결정(crystals)으로 영구 강화를 구매하여 다음 런에서 더 강한 상태로 시작할 수 있다.

* **Non-Goals:**
  - 강화 UI의 고급 애니메이션/이펙트
  - 강화 해제/환불 기능
  - 강화 레벨 상한 해제 (1단계만 구현)

* **Scope in Loop:** App Loop의 `LOBBY ↔ UPGRADE` 구간

* **Target Files:**
  - `data/gamedata/config.json` — 강화 정의 데이터 추가
  - `public/js/db-manager.js` — 강화 상태 세이브/로드
  - `public/js/game-state.js` — state에 upgrades 필드 추가
  - `public/js/ui-renderer.js` — 강화 상점 화면 렌더
  - `public/js/story-engine.js` — 런 생성 시 강화 보너스 적용
  - `public/js/app.js` — 강화 화면 전환 + 구매 핸들러
  - `public/index.html` — `screen-upgrade` 섹션 추가

* **Firestore Reads/Writes:**
  - Reads:
    - `GameData/config` (강화 정의 포함, 기존 로드에 포함)
    - `Users/{uid}` (upgrades 필드)
  - Writes:
    - `Users/{uid}.upgrades` — 강화 구매 시 업데이트
    - `Users/{uid}.crystals` — 결정 차감

* **State Model:**
  - `uiState.screen` 전이:
    - `LOBBY` → (강화 버튼 클릭) → `UPGRADE`
    - `UPGRADE` → (뒤로가기 클릭) → `LOBBY`
  - `state.user.upgrades`: `{ upgradeId: level }` 맵
  - `state.user.crystals`: 보유 결정 수

---

## 🏗️ Architecture Contract

> `ARCHITECTURE.md` 참조

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `app.js` | `boot` | `() → Promise<void>` | `onUpgrade` 핸들러에 실제 `handleUpgrade()` 연결 |
| `app.js` | `renderLobbyState` | `() → void` | 로비에서 crystals 표시 + 강화 버튼 활성화 |
| `ui-renderer.js` | `renderLobby` | `(user, currentRun?) → void` | crystals 수치 표시 영역 추가 |
| `story-engine.js` | `createInitialRun` | `(classId, config) → RunState` | config.upgrades 보너스(HP/골드/덱용량) 적용 |
| `db-manager.js` | `saveUserMeta` | `(uid, meta) → Promise<void>` | `meta.upgrades` 필드 저장 지원 (기존 merge 방식이므로 변경 없음, 호출만 확인) |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `ui-renderer.js` | `renderUpgradeShop` | `(upgradeDefs, userUpgrades, crystals) → void` | export | 강화 상점 화면 렌더 |
| `app.js` | `handleUpgrade` | `() → void` | internal | LOBBY→UPGRADE 전환 |
| `app.js` | `handleUpgradePurchase` | `(upgradeId) → Promise<void>` | internal | 강화 구매(결정 차감 + 세이브 + UI 갱신) |
| `app.js` | `handleUpgradeBack` | `() → void` | internal | UPGRADE→LOBBY 복귀 |

### 호출 관계 (CALLS)

```
handleUpgrade()
  → transitionTo(UPGRADE)
  → ui-renderer.renderUpgradeShop(config.upgrades, user.upgrades, user.crystals)

handleUpgradePurchase(upgradeId)
  → getState().user (잔액 확인)
  → setState({ user: { crystals: decreased, upgrades: { ...updated } } })
  → db-manager.saveUserMeta(uid, { crystals, upgrades })
  → ui-renderer.renderUpgradeShop(updated)
  → ui-renderer.showToast("강화 완료!")

createInitialRun(classId, config)  // 수정
  → 기존 로직 + config.upgrades에서 유저 보유 강화 조회
  → startHp += upgrade_hp_bonus, startGold += upgrade_gold_bonus 등
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] 이 SPEC 완료 후 `ARCHITECTURE.md`에 반영할 변경이 있음
  - `ui-renderer.js`에 `renderUpgradeShop` 추가
  - `app.js`에 `handleUpgrade`, `handleUpgradePurchase`, `handleUpgradeBack` 추가

---

* **UI Flow:**
  ```
  [screen-lobby]
    - 결정(💎) 수량 표시
    - [강화] 버튼 (활성화)
         ↓ (클릭)
  [screen-upgrade]
    - 타이틀: "강화 상점"
    - 강화 카드 리스트 (각 카드):
      - 강화 이름 + 아이콘
      - 효과 설명 (예: "+10 HP")
      - 비용 (결정 N개)
      - [구매] 버튼 (결정 부족 시 비활성화)
      - 이미 보유 시: "보유중" 뱃지
    - [돌아가기] 버튼
    - 에러 시: showToast("결정이 부족합니다")
  ```

* **Algorithm (의사코드):**
  ```
  handleUpgradePurchase(upgradeId):
    upgrade = config.upgrades[upgradeId]
    if user.crystals < upgrade.cost: toast("결정 부족"); return
    user.crystals -= upgrade.cost
    user.upgrades[upgradeId] = (user.upgrades[upgradeId] || 0) + 1
    await saveUserMeta(uid, { crystals, upgrades })
    re-render upgrade shop
  ```

* **Edge Cases:**
  - 결정 0인 상태에서 강화 화면 진입 → 모든 구매 버튼 비활성화
  - 중복 클릭 방지 → 구매 중 버튼 disabled
  - 세이브 실패 → 롤백(in-memory 복구) + 토스트 "저장 실패"
  - config에 upgrades 필드가 없는 경우(하위 호환) → 강화 버튼 숨김

* **Persistence:**
  - 강화 구매 직후 Auto-save: `saveUserMeta(uid, { crystals, upgrades })`
  - 실패 시: in-memory user 복구 + 토스트 알림

* **Testing Checklist:**
  1. □ 로비에서 강화 버튼 클릭 시 강화 화면으로 전환되는가?
  2. □ 강화 카드에 이름/설명/비용이 정상 표시되는가?
  3. □ 결정 충분 시 구매 → 결정 차감 + "보유중" 표시로 변경되는가?
  4. □ 결정 부족 시 구매 버튼이 비활성화되는가?
  5. □ 구매 후 세이브가 Firestore에 반영되는가? (콘솔 확인)
  6. □ 새로고침 후 강화 상태가 유지되는가?
  7. □ 강화 보유 상태에서 런 시작 시 HP/골드 보너스가 적용되는가?
  8. □ 돌아가기 버튼으로 로비 복귀되는가?
  9. □ 세이브 실패 시 롤백 + 토스트가 뜨는가?

* **주의/최적화 포인트:**
  - 강화 정의는 `config.upgrades`에 데이터로 관리 (하드코딩 금지)
  - innerHTML 사용 금지 — textContent + DOM API
  - 구매 중 중복 클릭 방지 (disabled 상태 관리)
  - `createInitialRun`에서 강화 보너스 적용 시, 보너스 수치는 config에서 읽기

---

**config.json 확장 (upgrades 필드 추가):**
```json
{
  "startHp": 80,
  "startGold": 100,
  "bagCapacity": 20,
  "rerollCost": 25,
  "armorConstant": 15,
  "upgrades": {
    "upgrade_hp": {
      "name": "생명력 강화",
      "description": "시작 HP +20",
      "cost": 50,
      "maxLevel": 3,
      "effect": { "bonusHp": 20 },
      "icon": "/assets/images/ui/upgrade_hp.webp"
    },
    "upgrade_gold": {
      "name": "보물 사냥꾼",
      "description": "시작 골드 +30",
      "cost": 30,
      "maxLevel": 3,
      "effect": { "bonusGold": 30 },
      "icon": "/assets/images/ui/upgrade_gold.webp"
    },
    "upgrade_bag": {
      "name": "큰 가방",
      "description": "가방 용량 +5",
      "cost": 80,
      "maxLevel": 2,
      "effect": { "bonusBagCapacity": 5 },
      "icon": "/assets/images/ui/upgrade_bag.webp"
    }
  }
}
```

**Users 문서 확장:**
```json
{
  "crystals": 150,
  "upgrades": {
    "upgrade_hp": 1,
    "upgrade_gold": 0
  }
}
```
