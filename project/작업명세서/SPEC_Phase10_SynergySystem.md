# 🟡 대기중

---

> **플로우 요약 (설계서 기준)**
> - **전투 루프**: 가방 체크 → 룰렛 스핀 → **기물 개수(및 시너지)에 따른 결과값 계산** → 적 공격 → 승패 판정

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 10 — 시너지 시스템`

* **Goal (유저 가치):** 룰렛 스핀에서 같은 타입/태그의 기물이 여러 개 나오면 보너스 데미지/회복이 적용되어, 덱 빌딩의 전략적 재미가 생긴다.

* **Non-Goals:**
  - 3개 이상 복잡한 조합 시너지 (이번은 "같은 타입 N개" 기본 시너지만)
  - 시너지 시각 이펙트 (연출은 Phase 7 기반 토스트/로그로 표시)

* **Scope in Loop:** Combat Loop — 결과값 계산 단계

* **Target Files:**
  - `data/gamedata/config.json` — `synergies` 정의 추가
  - `public/js/combat-engine.js` — 시너지 계산 로직 추가
  - `public/js/ui-renderer.js` — 시너지 발동 표시
  - `public/js/app.js` — 시너지 결과를 로그/토스트로 전달

* **Firestore Reads/Writes:**
  - Reads: `GameData/config.synergies` (기존 로드에 포함)
  - Writes: 없음

* **State Model:**
  - `executeCombatRound` 반환값에 `synergies[]` 필드 추가

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `combat-engine.js` | `executeCombatRound` | `(params) → RoundResult` | 스핀 결과 분석 → 시너지 보너스 계산 → 최종 데미지에 반영 |
| `combat-engine.js` | `spin` | `(deck, symbolsData, options?) → SpinResult` | 반환값에 타입별 카운트 포함 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `combat-engine.js` | `calculateSynergies` | `(spinEntries, synergyDefs) → SynergyResult[]` | export | 스핀 결과 → 발동된 시너지 목록 + 보너스 값 |

### 호출 관계 (CALLS)

```
executeCombatRound(params)
  → spin(deck, symbolsData)
  → calculateSynergies(spinEntries, config.synergies)
  → totalAttack += synergy bonuses
  → calculateDamage(totalAttack, defense, armorConstant)
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] `combat-engine.js`에 `calculateSynergies` 추가

---

* **Algorithm (의사코드):**
  ```
  calculateSynergies(spinEntries, synergyDefs):
    typeCounts = count spinEntries by type (attack, defense, heal)
    activeSynergies = []
    for each synergyDef in synergyDefs:
      if typeCounts[synergyDef.type] >= synergyDef.minCount:
        bonus = synergyDef.bonusPerExtra * (count - synergyDef.minCount + 1)
        activeSynergies.push({ ...synergyDef, bonus })
    return activeSynergies
  ```

* **Edge Cases:**
  - 시너지 정의가 config에 없는 경우(하위 호환) → 시너지 없이 기존 동작
  - 스핀 결과가 모두 다른 타입 → 시너지 미발동
  - 한 번에 여러 시너지 동시 발동 가능

* **Testing Checklist:**
  1. □ attack 타입 2개 이상 스핀 시 공격 시너지 보너스 적용?
  2. □ heal 타입 2개 이상 스핀 시 회복 시너지 보너스 적용?
  3. □ 시너지 발동 시 전투 로그에 "시너지 발동!" 메시지 표시?
  4. □ config.synergies 없을 때 기존 동작 유지?
  5. □ 시너지 보너스가 최종 데미지에 정확히 반영?

---

**config.json 추가 필드:**
```json
{
  "synergies": [
    { "type": "attack", "minCount": 2, "bonusPerExtra": 3, "label": "공격 시너지" },
    { "type": "defense", "minCount": 2, "bonusPerExtra": 2, "label": "방어 시너지" },
    { "type": "heal", "minCount": 2, "bonusPerExtra": 2, "label": "회복 시너지" }
  ]
}
```
