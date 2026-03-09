# 🟡 대기중

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: … → 스토리/전투 반복 → 엔딩 → **재화(결정) 지급** → 로비 복귀
> - **전투 루프**: 가방 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 → 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 9 — 리롤 메커닉 + 결정 경제 데이터 보완`

* **Goal (유저 가치):** 전투 중 룰렛 결과가 마음에 들지 않을 때 골드를 소비하여 다시 돌릴 수 있고, 엔딩 정산에서 결정을 획득하여 강화에 사용할 수 있는 경제 순환이 완성된다.

* **Non-Goals:**
  - 리롤 횟수 무한/제한 시스템 (이번은 "가능 여부"만)
  - 결정 구매(현금 결제) 시스템

* **Scope in Loop:** Combat Loop (리롤) + App Loop 엔딩 정산 (결정)

* **Target Files:**
  - `public/js/app.js` — `handleCombatSpin`에 리롤 옵션 추가
  - `public/js/ui-renderer.js` — 리롤 버튼 렌더 + 비용 표시
  - `public/index.html` — 리롤 버튼 HTML 추가
  - `data/gamedata/config.json` — `crystalRewards` 필드 추가

* **Firestore Reads/Writes:**
  - Reads: `GameData/config` (rerollCost, crystalRewards)
  - Writes: `Users/{uid}.currentRun` (리롤 후 골드 차감 Auto-save)

* **State Model:**
  - `combatState.lastSpinResult`: 리롤 시 이전 스핀 결과 덮어쓰기
  - `currentRun.gold`: 리롤 비용 차감

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `app.js` | `handleCombatSpin` | `() → Promise<void>` | 리롤 모드 파라미터 추가: 스핀 후 "리롤" 버튼 표시 → 재스핀 시 골드 차감 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `app.js` | `handleCombatReroll` | `() → Promise<void>` | internal | 리롤 실행 (골드 차감 → 재스핀 → UI 갱신) |
| `ui-renderer.js` | `showRerollOption` | `(cost, gold, onReroll) → void` | export | 리롤 버튼 + 비용 표시 |

### 호출 관계 (CALLS)

```
handleCombatSpin() → 스핀 결과 표시
  → showRerollOption(config.rerollCost, player.gold, handleCombatReroll)

handleCombatReroll()
  → player.gold -= config.rerollCost
  → combat-engine.spin(deck, symbolsData) // 재스핀만
  → renderCombatRoundResult(newResult)     // 결과 갱신
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] `app.js`에 `handleCombatReroll` 추가, `ui-renderer.js`에 `showRerollOption` 추가

---

* **Algorithm (의사코드):**
  ```
  handleCombatReroll():
    if player.gold < config.rerollCost: toast("골드 부족"); return
    player.gold -= config.rerollCost
    newSpin = spin(deck, symbolsData)
    update combatState with newSpin
    re-render spin result (데미지 재계산은 확정 버튼 클릭 시)
  ```

* **Edge Cases:**
  - 골드 0에서 리롤 시도 → 버튼 비활성화
  - 리롤 후 다시 리롤 가능 (골드 허용 범위 내)
  - 리롤 중 새로고침 → 리롤 전 상태로 복구 (세이브 시점 고려)

* **Testing Checklist:**
  1. □ 스핀 후 리롤 버튼이 표시되는가?
  2. □ 리롤 클릭 시 골드 차감 + 새 스핀 결과 표시?
  3. □ 골드 부족 시 리롤 버튼 비활성화?
  4. □ config.crystalRewards 데이터 추가 후 엔딩 정산에서 결정 수치 정상?

---

**config.json 추가 필드:**
```json
{
  "rerollCost": 25,
  "crystalRewards": {
    "base": 5,
    "perStage": 2,
    "successBonus": 10,
    "rankableBonus": 5
  }
}
```
