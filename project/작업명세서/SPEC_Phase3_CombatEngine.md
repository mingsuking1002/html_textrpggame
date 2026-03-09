# 🟡 대기중

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 로비 → 런 시작 → 직업 선택 → 프롤로그 → 스토리/전투 반복 → 엔딩
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 이야기 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 3 — 전투 엔진(룰렛) + 전투 화면 UI`

* **Goal (유저 가치):** 스토리에서 전투 인카운트가 발생하면 전투 화면으로 전환되어, 룰렛을 돌리고 적과 싸워 승패 결과를 경험할 수 있다.

* **Non-Goals:**
  - Auto-save (Phase 4)
  - 엔딩 화면 / 재화 지급 / 랭킹 (Phase 5)
  - 시너지 시스템 고도화 (추후 확장)
  - 룰렛 고급 애니메이션 (기본 결과 표시만)

* **Scope in Loop:** Combat Loop 전체 + App Loop의 `STORY ↔ COMBAT` 전환

* **Target Files:**
  - `public/js/combat-engine.js` — 룰렛 스핀/데미지 계산/승패 판정 (순수 로직, DOM 금지)
  - `public/js/ui-renderer.js` — 전투 화면 렌더 (적 정보, 덱 표시, 룰렛 결과, 전투 로그, HUD)
  - `public/js/app.js` — STORY↔COMBAT 전환 연결 + 전투 종료 후 스토리 복귀
  - `public/js/story-engine.js` — Phase 2의 combat 인카운트 placeholder를 실제 전투 호출로 교체
  - `public/js/game-state.js` — combatState 필드 추가 (현재 적, 전투 턴 등)
  - `public/index.html` — 전투 화면 구조 보강 (적 정보, 덱 그리드, 스핀 버튼, 로그 영역)

* **Firestore Reads/Writes:**
  - Reads: `state.gameData` 캐시 사용 (추가 Firestore 호출 없음)
    - `gameData.monsters` — 적 스탯 참조
    - `gameData.symbols` — 기물 정보 (type, value, icon)
    - `gameData.config` — armorConstant, 기타 밸런스 수치
  - Writes: 없음 (Phase 4에서 Auto-save 추가)

* **State Model:**
  - `uiState.screen` 전이:
    - `STORY` → (combat 인카운트 발생) → `COMBAT`
    - `COMBAT` → (전투 승리) → `STORY` (afterEncounter 노드)
    - `COMBAT` → (전투 패배 + HP 0) → `ENDING_DEATH` (Phase 5에서 처리, 지금은 placeholder)
    - `COMBAT` → (전투 패배 + HP > 0) → `STORY` (afterEncounter 노드)
  - `state.combatState` 추가:
    ```json
    {
      "enemy": { "id": "goblin", "hp": 35, "attack": 8, "defense": 3, ... },
      "currentEnemyHp": 35,
      "turnCount": 0,
      "logs": [],
      "lastSpinResult": null,
      "isPlayerTurn": true
    }
    ```

* **UI Flow:**
  ```
  [screen-combat]
    ┌─────────────────────────────────┐
    │  적 정보: 이름 + HP바 + 아이콘   │
    ├─────────────────────────────────┤
    │  플레이어 HUD: HP / Gold / Stage │
    ├─────────────────────────────────┤
    │  덱(가방) 그리드: 기물 아이콘들    │
    ├─────────────────────────────────┤
    │  [🎰 룰렛 스핀] 버튼            │
    │  스핀 결과: 선택된 기물 + 합산값   │
    ├─────────────────────────────────┤
    │  전투 로그 (스크롤, 상한 500)     │
    └─────────────────────────────────┘

  스핀 → 결과 표시 → 적 공격 → 턴 종료 → 승패 확인 → 반복 or 전투 종료
  ```

* **Algorithm (의사코드):**
  ```
  enterCombat(monsterId):
    enemy = clone(gameData.monsters[monsterId])
    combatState = { enemy, currentEnemyHp: enemy.hp, turnCount: 0, logs: [] }
    setState({ combatState })
    transitionTo(COMBAT)
    renderCombatScreen(combatState, currentRun)

  onSpinClick():
    spinResult = spin(currentRun.deck, gameData.symbols)      // 3~5개 기물 랜덤 선택
    playerDamage = calculateAttackValue(spinResult, symbols)   // attack 타입 합산
    healAmount = calculateHealValue(spinResult, symbols)       // heal 타입 합산
    defenseBonus = calculateDefenseValue(spinResult, symbols)  // defense 타입 합산

    actualDamage = calculateDamage(playerDamage, enemy.defense, config.armorConstant)
    combatState.currentEnemyHp -= actualDamage
    currentRun.hp += healAmount

    if combatState.currentEnemyHp <= 0:
      handleVictory(enemy)  // exp + gold + loot → 스토리 복귀
    else:
      enemyDamage = calculateDamage(enemy.attack, defenseBonus, config.armorConstant)
      currentRun.hp -= enemyDamage
      if currentRun.hp <= 0:
        handleDefeat()      // HP 0 → 사망 엔딩 or 라이프 감소
  ```

* **Edge Cases:**
  - 덱에 기물이 하나도 없는 경우 (전부 "empty") → 스핀 결과 0, 로그 "공격할 기물이 없습니다"
  - 스핀 버튼 중복 클릭 방지 (애니메이션 중 disabled)
  - 적 HP가 정확히 0인 경우 → 승리 처리
  - heal로 maxHp 초과 → maxHp로 cap
  - 전투 중 새로고침 → 전투 데이터 소실 (Phase 4에서 복구)
  - 몬스터 lootTable 드랍 롤에서 덱이 가득 찬 경우 → "가방이 가득 찼습니다" 토스트, 아이템 버림
  - node_dragon_battle처럼 story의 combat 타입 (combatMonster 직접 지정) → 동일 전투 흐름

* **Persistence:**
  - 이 Phase에서는 Auto-save 없음 (Phase 4)
  - 전투 승리 시 currentRun 상태(hp, gold, deck, stage) 메모리에만 업데이트

* **Testing Checklist:**
  1. □ 스토리에서 combat 인카운트 발생 → 전투 화면 전환되는가?
  2. □ 적 이름/HP/아이콘이 정상 렌더되는가?
  3. □ 덱(가방) 기물 아이콘이 그리드에 표시되는가?
  4. □ 스핀 버튼 클릭 → 기물 선택 결과가 표시되는가?
  5. □ 플레이어 공격 → 적 HP 감소가 반영되는가?
  6. □ 적 공격 → 플레이어 HP 감소가 반영되는가?
  7. □ heal 기물 → 플레이어 HP 회복 (maxHp 초과 방지)?
  8. □ 적 HP 0 → 승리 처리 (exp/gold/loot 지급) → 스토리 복귀?
  9. □ 플레이어 HP 0 → 패배 처리 → placeholder 엔딩?
  10. □ 전투 로그가 턴별로 쌓이며, 상한(500) 초과 시 오래된 항목 삭제?

* **주의/최적화 포인트:**
  - `combat-engine.js`는 **순수 로직만** — DOM 접근 절대 금지
  - 전투 결과는 `events[]` 배열로 반환 → UI가 순서대로 소비/렌더
  - 데미지 공식: `Math.max(1, attack - (defense * armorConstant / (defense + armorConstant)))`
  - 룰렛 스핀 기물 선택 개수는 `config`에서 관리 가능하도록 (예: `spinCount: 5`)
  - 골드 보상은 `goldReward[min, max]` 범위에서 랜덤
  - loot 드랍은 `lootTable[].dropRate` 확률 기반 독립 시행
  - innerHTML 금지 — 전투 로그는 `addLog()` 사용
