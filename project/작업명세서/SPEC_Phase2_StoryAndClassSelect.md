# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 로비 → 런 시작 → 직업 선택 → 프롤로그 → 스토리/전투 반복 → 엔딩
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 이야기 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 2 — 스토리 엔진 + 직업 선택 + 런 시작 흐름`

* **Goal (유저 가치):** 플레이어가 로비에서 "게임 시작"을 누르면 직업을 선택하고, 프롤로그를 거쳐 스토리 화면에 진입하여 선택지를 통해 이야기를 진행할 수 있다.

* **Non-Goals:**
  - 전투(Combat) 화면/로직 구현 (Phase 3)
  - Auto-save / 런 복구 (Phase 4)
  - 엔딩 화면 / 재화 지급 / 랭킹 (Phase 5)
  - 인카운트의 combat 타입 실제 전투 돌입 (Phase 3에서 연결)

* **Scope in Loop:** App Loop의 `LOBBY → CLASS_SELECT → PROLOGUE → STORY` + Story Loop 전체

* **Target Files:**
  - `public/js/story-engine.js` — 스토리 노드 로드/선택지 적용/인카운트 롤/엔딩 판정
  - `public/js/ui-renderer.js` — 직업 선택 카드 렌더 + 스토리 화면 렌더 + 상점 UI
  - `public/js/app.js` — 런 시작 흐름 연결 (LOBBY→CLASS_SELECT→PROLOGUE→STORY)
  - `public/js/game-state.js` — currentRun 필드 확장 (classId, stage, hp, gold, deck, flags, currentNodeId)
  - `public/index.html` — 직업 선택 카드 영역 보강 + 스토리 화면 구조 보강

* **Firestore Reads/Writes:**
  - Reads: `state.gameData` 캐시 사용 (추가 Firestore 호출 없음)
    - `gameData.classes` — 직업 카드 렌더
    - `gameData.symbols` — 초기 무기 정보
    - `gameData.story` — 스토리 노드 로드
    - `gameData.encounters` — 인카운트 롤
    - `gameData.config` — startHp, startGold, bagCapacity
  - Writes: 없음 (Phase 4에서 Auto-save 추가)

* **State Model:**
  - `uiState.screen` 전이:
    - `LOBBY` → (게임 시작 클릭) → `CLASS_SELECT`
    - `CLASS_SELECT` → (직업 선택) → `PROLOGUE`
    - `PROLOGUE` → (프롤로그 완료/스킵) → `STORY`
    - `STORY` → (선택지 선택) → `STORY` (다음 노드)
    - `STORY` → (encounter_trigger) → `STORY` (reward/event 타입) 또는 placeholder (combat 타입)
    - `STORY` → (ending 노드 도달) → placeholder (Phase 5)
  - `currentRun` 확장 필드:
    ```json
    {
      "isActive": true,
      "classId": "warrior",
      "stage": 1,
      "hp": 80,
      "maxHp": 80,
      "gold": 100,
      "deck": ["sword", "mace", "empty", ...],
      "flags": [],
      "currentNodeId": "node_prologue",
      "encounterHistory": []
    }
    ```

* **UI Flow:**
  ```
  [screen-lobby]
    [게임 시작] 클릭
         ↓
  [screen-class-select]
    - GameData/classes에서 직업 카드 렌더 (이미지 + 이름 + 무기 목록)
    - 각 카드 클릭 → 직업 선택 확정
         ↓
  [screen-story] (프롤로그)
    - node_prologue 노드 표시 (title + text)
    - 선택지 버튼들 표시
         ↓ (선택)
  [screen-story] (스토리 진행)
    - narrative: title + text + choices 표시
    - encounter_trigger: 인카운트 롤 → reward(보상 지급 후 afterEncounter) / event(storyNodeId로 이동) / combat(placeholder 토스트)
    - shop: 아이템 구매 UI (골드 차감 + 덱에 추가) + "떠난다" 선택지
    - ending: placeholder (Phase 5 연결 대기)
  ```

* **Algorithm (의사코드):**
  ```
  onStartRun():
    cards = gameData.classes
    renderClassCards(cards)
    transitionTo(CLASS_SELECT)

  onClassSelected(classId):
    weapons = gameData.classes[classId].weapons
    deck = buildInitialDeck(weapons, config.bagCapacity)
    currentRun = { isActive:true, classId, stage:1, hp:config.startHp, ... , currentNodeId:"node_prologue", flags:[] }
    setState({ currentRun })
    transitionTo(PROLOGUE)
    renderStoryNode("node_prologue")

  onChoiceSelected(choice):
    applyEffects(choice.effects, currentRun)       // addFlag, removeFlag, addGold, addHp 등
    if meetsConditions(choice.conditions, currentRun):
      nextNode = story[choice.nextNodeId]
      if nextNode.type == "encounter_trigger":
        encounter = rollEncounter(nextNode.encounterPool, encounters, currentRun)
        handleEncounter(encounter) → afterEncounter 노드로 이동
      else:
        renderStoryNode(choice.nextNodeId)
  ```

* **Edge Cases:**
  - `$return` nextNodeId → 이전 노드로 복귀 (스택 또는 encounterHistory 참조)
  - 직업 선택 시 카드 중복 클릭 방지 (첫 클릭만 처리)
  - 골드 부족한 상점 아이템 → 버튼 disabled + "골드가 부족합니다" 표시
  - 덱이 가득 찬 상태에서 아이템 획득 시 → "가방이 가득 찼습니다" 토스트
  - encounter_trigger에 풀이 비어있거나 조건 만족하는 인카운트가 없는 경우 → afterEncounter로 직행
  - story 노드에 없는 nextNodeId 참조 → 에러 토스트 + 로비 복귀
  - encounter의 combat 타입은 Phase 3까지 placeholder → 토스트 "전투 기능은 곧 추가됩니다" + afterEncounter로 진행

* **Persistence:**
  - 이 Phase에서는 Auto-save 없음 (Phase 4에서 구현)
  - 새로고침 시 currentRun 데이터 소실됨 (Phase 4에서 복구 구현)

* **Testing Checklist:**
  1. □ 로비 "게임 시작" → 직업 선택 화면이 뜨는가?
  2. □ 직업 카드에 이미지/이름/무기 목록이 정상 렌더되는가?
  3. □ 직업 선택 후 프롤로그(node_prologue)가 표시되는가?
  4. □ 프롤로그 선택지 클릭 → 다음 노드로 이동하는가?
  5. □ narrative 노드: title/text/choices 정확히 표시되는가?
  6. □ encounter_trigger 노드: 인카운트 롤 → reward 타입 보상 지급이 작동하는가?
  7. □ shop 노드: 골드 차감 + 덱에 아이템 추가가 작동하는가?
  8. □ shop에서 골드 부족 시 구매 버튼 비활성화되는가?
  9. □ 선택지의 conditions(hasFlag 등) 미충족 시 해당 선택지가 숨겨지는가?
  10. □ effects(addFlag, addGold, addHp) 적용 후 상태 반영되는가?

* **주의/최적화 포인트:**
  - innerHTML 사용 금지 — 선택지 버튼/카드는 DOM API로 생성
  - 직업 카드 이미지는 `<img src="...">` (GameData icon 경로 사용)
  - 스토리 노드 전환 시 이전 DOM 정리(removeChild) 필수
  - encounter 롤은 가중치 기반 (`weight` 합산 → 랜덤) — `story-engine.js` 순수 함수
  - `$return` 처리를 위한 노드 스택 또는 returnNodeId 관리 필요
  - combat 인카운트는 이번 Phase에서 **skip 처리** (afterEncounter로 직행 + 토스트 알림)
