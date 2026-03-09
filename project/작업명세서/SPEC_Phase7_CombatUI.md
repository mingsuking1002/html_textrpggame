# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 게임 시작 → 로그인(Auth) → 로비(Lobby) ↔ 강화 → 런 시작 → 스토리/전투 반복 → 엔딩 → 재화 지급 → 로비 복귀
> - **전투 루프**: 가방 기물 체크 → **룰렛 스핀** → **결과 계산** → **적 공격** → **승패 판정** → 전투 종료
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 → 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 7 — 전투 UI/연출 시스템`

* **Goal (유저 가치):** 전투 시 룰렛 스핀 애니메이션, 데미지/힐 연출, 턴별 결과 표시가 시각적으로 보여 플레이어가 전투의 긴장감과 재미를 느낀다.

* **Non-Goals:**
  - 3D/캔버스 기반 고급 애니메이션
  - 사운드/BGM 연동 (별도 Phase)
  - 시너지 시스템 시각화 (Phase 미정)
  - combat-engine.js 로직 변경 (순수 엔진 그대로 유지)

* **Scope in Loop:** Combat Loop 전체 (가방 체크 → 스핀 → 결과 → 적 공격 → 승패)

* **Target Files:**
  - `public/js/ui-renderer.js` — 전투 렌더 함수 대폭 확장
  - `public/js/app.js` — 전투 흐름 핸들러(스핀 버튼 → 라운드 실행 → 결과 표시 → 승패)
  - `public/index.html` — 전투 화면 HTML 보강 (스핀 결과 슬롯, 데미지 표시 등)
  - `public/index.html` — CSS에 전투 애니메이션 키프레임 추가

* **Firestore Reads/Writes:**
  - Reads: 없음 (이미 캐시된 GameData 사용)
  - Writes:
    - `Users/{uid}.currentRun` — 라운드 종료 시 Auto-save (기존 로직 유지)

* **State Model:**
  - `uiState.screen` = `COMBAT` → 전투 화면
  - `state.combatState`: 기존 `createCombatState`로 생성, 라운드마다 갱신
  - 전투 종료 시:
    - 승리: `STORY`로 복귀 (기존 로직)
    - 패배(HP 0): `ENDING_DEATH` (기존 로직)

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `app.js` | `handleDirectCombatNode` | `(renderModel, currentRun) → void` | 전투 화면 진입 시 `renderCombatScreen()` 호출 추가 |
| `app.js` | `handleEncounterTrigger` | `(renderModel, currentRun) → void` | combat 인카운트 시 `renderCombatScreen()` 호출 추가 |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `ui-renderer.js` | `renderCombatScreen` | `(combatState, player, symbolsData) → void` | export | 전투 화면 전체 초기 렌더 |
| `ui-renderer.js` | `renderCombatRoundResult` | `(roundResult, combatState, symbolsData) → Promise<void>` | export | 라운드 결과 연출 (스핀→데미지→적 HP) |
| `ui-renderer.js` | `renderCombatVictory` | `(rewardSummary, symbolsData) → void` | export | 승리 연출 + 보상 표시 |
| `ui-renderer.js` | `renderCombatDefeat` | `(player) → void` | export | 패배 연출 |
| `ui-renderer.js` | `animateSpinSlots` | `(spinEntries, symbolsData) → Promise<void>` | internal | 스핀 슬롯 순차 공개 애니메이션 |
| `ui-renderer.js` | `animateDamageNumber` | `(targetEl, amount, type) → void` | internal | 데미지/힐 숫자 팝업 애니메이션 |
| `ui-renderer.js` | `updateEnemyHpBar` | `(currentHp, maxHp) → void` | internal | 적 HP 바 갱신 + 흔들림 효과 |
| `app.js` | `handleCombatSpin` | `() → Promise<void>` | internal | 스핀 버튼 핸들러 (라운드 실행 → 연출 → 결과 판정) |

### 호출 관계 (CALLS)

```
handleCombatSpin()
  → getState().combatState, currentRun
  → combat-engine.executeCombatRound(params)
  → ui-renderer.renderCombatRoundResult(roundResult, combatState, symbolsData)
    → animateSpinSlots(spinEntries)           // 스핀 슬롯 순차 공개
    → animateDamageNumber(enemyEl, dmg, 'attack')  // 적에게 데미지
    → updateEnemyHpBar(newHp, maxHp)           // HP 바 갱신
    → animateDamageNumber(playerEl, dmg, 'danger') // 적 반격 데미지
  → if 적 사망:
    → combat-engine.applyMonsterRewards()
    → ui-renderer.renderCombatVictory(rewards)
    → db-manager.saveCurrentRun()
    → enterStoryNode(onWin)
  → if 플레이어 사망:
    → ui-renderer.renderCombatDefeat(player)
    → handleEndingNode(ending_death)
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] 이 SPEC 완료 후 `ARCHITECTURE.md`에 반영할 변경이 있음
  - `ui-renderer.js`에 전투 관련 함수 6개 추가
  - `app.js`에 `handleCombatSpin` 추가

---

* **UI Flow:**
  ```
  [screen-combat] (COMBAT 상태 진입)
    ┌─ 적 정보 ─────────────────────────┐
    │ [아이콘] 슬라임  HP 20/20          │
    │ ████████████████████ (HP 바)       │
    └────────────────────────────────────┘

    ┌─ 플레이어 HUD ─────────────────────┐
    │ HP: 80/80  |  골드: 100  |  Stage 1 │
    └────────────────────────────────────┘

    ┌─ 덱(Deck) ──────────┐  ┌─ 룰렛(Roulette) ──────┐
    │ [검] [방패] [포션]   │  │ [🎰 룰렛 스핀] 버튼   │
    │ [비어있음] ...       │  │                        │
    └─────────────────────┘  │ 스핀 결과:              │
                              │ [검][검][포션] → 공격!  │
                              │ → 플레이어 데미지: 12   │
                              │ → 적 반격: 5            │
                              └────────────────────────┘

    ┌─ Battle Log ──────────────────────────┐
    │ ▶ 검×2 + 포션 → 12 데미지!            │
    │ ▶ 슬라임의 반격! 5 피해               │
    │ ▶ 슬라임 처치! 골드 +12, 포션 드롭    │
    └────────────────────────────────────────┘
  ```

* **Algorithm (의사코드):**
  ```
  handleCombatSpin():
    disable spinButton
    roundResult = executeCombatRound({ player, deck, enemy, ... })
    await renderCombatRoundResult(roundResult)  // 애니메이션 대기
    update combatState (enemyHp, player hp/gold)
    if enemy dead: applyRewards → victory → save → return to story
    if player dead: defeat → ending_death
    else: enable spinButton (다음 턴 대기)
  ```

* **Edge Cases:**
  - 스핀 중 중복 클릭 → 버튼 disabled 상태로 방지
  - 덱이 비어있는 경우(empty 슬롯만) → 공격력 0으로 계산 (엔진 처리)
  - 전투 중 새로고침 → combatState가 없으므로 currentRun 기반 복구 (Phase 4 기존 로직)
  - 적 HP가 0 미만으로 내려가는 경우 → 0으로 클램핑 + 사망 처리

* **Persistence:**
  - 매 라운드 종료 시 Auto-save: `saveCurrentRun(uid, currentRun)`
  - 전투 승리 시: 보상 적용 후 세이브
  - 실패 시: 토스트 알림 (기존 로직)

* **Testing Checklist:**
  1. □ 전투 진입 시 적 정보(이름/HP)가 표시되는가?
  2. □ 스핀 버튼 클릭 → 스핀 슬롯에 기물 순차 공개 애니메이션이 재생되는가?
  3. □ 스핀 결과에 따른 데미지가 숫자로 팝업되는가?
  4. □ 적 HP 바가 실시간 갱신되는가?
  5. □ 적 반격 데미지가 플레이어 HUD에 반영되는가?
  6. □ 적 사망 시 승리 연출 + 보상 표시 후 스토리로 복귀하는가?
  7. □ 플레이어 사망 시 패배 연출 → 엔딩 화면 전환되는가?
  8. □ 스핀 중 버튼이 비활성화되어 중복 클릭이 불가능한가?
  9. □ 전투 로그(Battle Log)에 각 턴 결과가 기록되는가?
  10. □ 전투 중 새로고침 후 전투가 복구되는가?

* **주의/최적화 포인트:**
  - combat-engine.js는 **순수 로직 모듈** — DOM 접근 절대 금지 유지
  - 애니메이션은 CSS 키프레임 + JS setTimeout/requestAnimationFrame 조합
  - 스핀 슬롯 애니메이션은 `Promise` 기반으로 순차 실행 보장
  - innerHTML 사용 금지 — textContent + DOM API
  - 로그 누적 상한 500 유지 (기존 `LOG_LIMIT`)
  - HP 바 transition은 CSS `transition: width 180ms ease` (기존 스타일 활용)

---

**CSS 키프레임 추가 예시:**
```css
@keyframes slot-reveal {
  0% { transform: rotateX(90deg); opacity: 0; }
  100% { transform: rotateX(0deg); opacity: 1; }
}

@keyframes damage-pop {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-40px) scale(1.3); opacity: 0; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.spin-slot-anim { animation: slot-reveal 300ms ease forwards; }
.damage-number { animation: damage-pop 800ms ease forwards; position: absolute; font-weight: 800; }
.damage-number.attack { color: var(--danger); }
.damage-number.heal { color: var(--success); }
.shake { animation: shake 200ms ease; }
```

**HTML 보강 — 스핀 결과 슬롯 영역:**
```html
<!-- #combat-spin-result 내부에 동적 생성 -->
<div class="spin-slot spin-slot-anim">
  <img class="deck-slot-icon" src="/assets/images/items/sword.webp" alt="검">
  <span class="deck-slot-name">낡은 검</span>
</div>
```
