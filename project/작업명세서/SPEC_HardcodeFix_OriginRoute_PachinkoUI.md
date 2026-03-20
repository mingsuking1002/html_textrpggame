# 🟢 완료

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Hardcode Removal + Origin-Based Story Routing + 3×3 Pachinko Roulette UI`
* **Goal (유저 가치):** `① 시작 덱·시작 노드·인카운트 분기를 데이터 주도로 전환하여 밸런스 시트 수정만으로 게임을 조정할 수 있다. ② 출신지마다 서로 다른 프롤로그/시작 스토리 노드를 탈 수 있어 다회차 리플레이 가치가 높아진다. ③ 전투 룰렛을 일본 파칭코 슬롯머신(3×3 릴) 형태로 바꿔 시각적 피드백과 몰입감을 극대화한다.`
* **Non-Goals:** `시너지/데미지 공식 리팩터링, 사운드 BGM 매핑 데이터화, 특수 능력 구현은 이번 작업 범위가 아니다.`
* **Scope in Loop:** `App Loop (출신지→직업 선택 시 시작 노드 결정) · Combat Loop (3×3 슬롯 UI) · Data Pipeline (시트→JSON 덱 레시피/시작노드 합성)`

---

## Part 1: 🔴 STARTING_DECK_RECIPES 하드코딩 제거

### 현재 문제
`story-engine.js:7-21`에 `STARTING_DECK_RECIPES` 상수가 코드에 고정되어 있어, 스프레드시트 `ClassStartingData` 시트의 데이터가 무시된다.

### 변경 사항

#### [MODIFY] [story-engine.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/story-engine.js)

1. `STARTING_DECK_RECIPES` 상수를 **삭제**한다.
2. `buildInitialDeck(classId, bagCapacity)` 함수의 시그니처를 `buildInitialDeck(classId, bagCapacity, classesData)` 로 변경한다.
3. 덱 레시피를 `classesData[classId].startingDeck` 배열에서 읽는다.

```diff
-const STARTING_DECK_RECIPES = Object.freeze({
-  warrior: Object.freeze([['sword', 2], ['mace', 1], ['hammer', 1]]),
-  archer: Object.freeze([['bow', 2], ['crossbow', 2]]),
-  mage: Object.freeze([['staff', 2], ['dagger', 2]]),
-});

-export function buildInitialDeck(classId, bagCapacity) {
-  const recipe = STARTING_DECK_RECIPES[classId];
+export function buildInitialDeck(classId, bagCapacity, classesData = {}) {
+  const classInfo = classesData[classId];
+  const recipe = Array.isArray(classInfo?.startingDeck) ? classInfo.startingDeck : [];
   if (!recipe || recipe.length === 0) {
     throw new Error(`No starting deck recipe for classId: ${classId}`);
   }
   // 이하 동일 (recipe를 순회해 deck 배열 구성)
```

4. `createInitialRun()` 호출부에서 `buildInitialDeck(classId, bagCapacity, gameData.classes)` 로 GameData를 전달한다.

#### [MODIFY] [classes.json](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/data/gamedata/classes.json)

`ClassStartingData` 시트 데이터를 합성하여 `startingDeck` 필드를 추가한다.

```jsonc
{
  "warrior": {
    "name": "전사",
    "icon": "/assets/images/classes/warrior.webp",
    "weapons": ["sword", "mace", "hammer"],
    "startingDeck": [["sword", 2], ["mace", 1], ["hammer", 1]]  // ★ 추가
  },
  "archer": {
    "name": "궁수",
    "icon": "/assets/images/classes/archer.webp",
    "weapons": ["bow", "crossbow", "dagger"],
    "startingDeck": [["bow", 2], ["crossbow", 2]]  // ★ 추가
  },
  "mage": {
    "name": "마법사",
    "icon": "/assets/images/classes/mage.webp",
    "weapons": ["staff", "dagger"],
    "startingDeck": [["staff", 2], ["dagger", 2]]  // ★ 추가
  }
}
```

#### [MODIFY] [app.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/app.js)

`buildClassSelectionModels()` 함수에서 `buildInitialDeck` 호출 시 `gameData.classes`를 전달한다.

---

## Part 2: 🟡 시작 노드 ID(`node_prologue`) 하드코딩 제거 + 출신지별 시작 노드

### 현재 문제
`story-engine.js:218`과 `app.js:1354`에 `'node_prologue'`가 하드코딩되어 있다. 출신지마다 다른 시작 스토리를 타는 것이 불가능하다.

### 변경 사항

#### [MODIFY] [origins.json](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/data/gamedata/origins.json)

출신지 데이터에 `startNodeId` 필드를 추가한다.

```jsonc
{
  "origin_village": {
    "name": "시골 마을",
    "icon": "/assets/images/origins/village.webp",
    "description": "평화로운 마을에서 자란 당신은 선한 성품을 가지고 있다.",
    "baseKarma": 10,
    "startNodeId": "node_prologue_village",  // ★ 출신지별 시작 노드
    "isEnabled": true
  },
  "origin_slum": {
    "name": "빈민굴",
    "icon": "/assets/images/origins/slum.webp",
    "description": "거친 거리에서 살아남은 당신은 생존 본능이 뛰어나다.",
    "baseKarma": -10,
    "startNodeId": "node_prologue_slum",  // ★ 출신지별 시작 노드
    "isEnabled": true
  },
  "origin_noble": {
    "name": "귀족 가문",
    "icon": "/assets/images/origins/noble.webp",
    "description": "유서 깊은 가문에서 태어난 당신은 자부심이 높다.",
    "baseKarma": 5,
    "startNodeId": "node_prologue_noble",  // ★ 출신지별 시작 노드
    "isEnabled": true
  }
}
```

#### [MODIFY] [OriginData 시트](https://docs.google.com/spreadsheets/d/180Zv2x0BNM0NjNx4a2MAFYl46bz-sRTbNln4sOS0wCU)

`start_node_id` 컬럼을 추가한다.

#### [MODIFY] [config.json](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/data/gamedata/config.json)

출신지를 선택하지 않은 경우의 **기본 시작 노드**를 설정 값으로 추가한다.

```diff
 {
   "startHp": 80,
   "startGold": 100,
   "bagCapacity": 20,
+  "defaultStartNodeId": "node_prologue",
```

#### [MODIFY] [story-engine.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/story-engine.js)

`createInitialRun()`에서 `currentNodeId` 결정 로직 변경:

```diff
-    currentNodeId: 'node_prologue',
+    currentNodeId: resolveStartNodeId(options),
```

```javascript
function resolveStartNodeId(options) {
  // 1순위: 출신지 데이터의 startNodeId
  if (options?.originData?.startNodeId) {
    return options.originData.startNodeId;
  }
  // 2순위: config의 defaultStartNodeId
  // 3순위: fallback 'node_prologue'
  return 'node_prologue';
}
```

#### [MODIFY] [app.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/app.js)

`handleClassSelect()`에서 하드코딩된 `'node_prologue'`를 `nextRun.currentNodeId`로 교체:

```diff
-  if (enterStoryNode('node_prologue', nextRun, { screen: AppState.PROLOGUE })) {
+  if (enterStoryNode(nextRun.currentNodeId, nextRun, { screen: AppState.PROLOGUE })) {
```

#### [MODIFY] [story.json](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/data/gamedata/story.json)

출신지별 프롤로그 노드를 데이터로 추가한다 (샘플):

```jsonc
{
  "node_prologue_village": {
    "title": "시골 마을의 아침",
    "text": "평화로운 마을에서 태어난 당신은 어느 날 마을 장로의 부름을 받는다. 바깥 세계로 떠나야 할 때가 왔다.",
    "type": "narrative",
    "choices": [
      { "text": "숲길로 간다", "nextNodeId": "node_forest_entry", "conditions": {}, "effects": { "addFlag": "chose_forest" } },
      { "text": "해안길을 택한다", "nextNodeId": "node_coast_entry", "conditions": {}, "effects": { "addFlag": "chose_coast" } }
    ],
    "onEnter": {}
  },
  "node_prologue_slum": { /* ... 빈민굴 프롤로그 ... */ },
  "node_prologue_noble": { /* ... 귀족 프롤로그 ... */ }
}
```

---

## Part 3: 🟡 인카운트 타입 분기 정리

### 현재 문제
`app.js:1086-1144`에서 인카운트 타입을 `if (encounter.type === 'reward')` → `if (encounter.type === 'combat')` → `if (!['combat','reward'].includes(...))` 로 처리 중. 새 타입 추가 시 불편하고 가독성이 낮다.

### 변경 사항

#### [MODIFY] [app.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/app.js)

if-else 체인을 **switch + default fallback**으로 정리:

```javascript
function handleEncounterTrigger(renderModel, currentRun) {
  const state = getState();
  const encounter = rollEncounter(...);
  if (!encounter) { /* 기존 로직 */ }

  const progressedRun = advanceStage(currentRun, 1);

  switch (encounter.type) {
    case 'reward':
      // 기존 reward 처리 로직 (변경 없음)
      break;

    case 'combat':
      // 기존 combat 처리 로직 (변경 없음)
      break;

    case 'event':
    case 'npc':
    case 'quest':
    default:
      // storyNodeId가 있으면 스토리 노드로 전이, 없으면 에러
      if (!encounter.storyNodeId || !state.gameData?.story?.[encounter.storyNodeId]) {
        failToLobby('스토리형 인카운트가 올바른 스토리 노드를 가리키지 않습니다.');
        return false;
      }
      showToast(encounter.description || encounter.name || '이벤트 발생', 'info');
      return enterStoryNode(encounter.storyNodeId, progressedRun, {
        screen: AppState.STORY,
        returnNodeId: renderModel.afterEncounter || currentRun.currentNodeId || null,
      });
  }
}
```

---

## Part 4: 3×3 파칭코 슬롯 머신 룰렛 UI

### 현재 상태
스핀 결과가 **1행 N열 리스트**(`spin-result-grid`, `repeat(auto-fit, minmax(120px, 1fr))`)로 표시된다.

### 목표
일본 파칭코 슬롯머신 형태의 **3열 × 3행 릴(reel) UI**로 교체한다.
- 3열(릴)이 각각 세로로 스핀하며 기물 아이콘이 돌아간다.
- 3행이 보이고, 가운데 행(payline)이 결과 행이 된다.
- 스핀 시 각 열이 시간차(200ms~400ms 차이)로 멈추며 연출된다.
- **spinCount = 3** (기본값)으로 변경하여 3릴에 1:1 대응한다.

### 변경 사항

#### [MODIFY] [config.json](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/data/gamedata/config.json)

```diff
+  "spinCount": 3,
+  "reelRows": 3,
```

#### [MODIFY] [combat-engine.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/combat-engine.js)

`spin()` 함수는 이미 `options.spinCount`를 받으므로 로직 변경 없음. `config.spinCount`가 3이 되면 자동으로 3개 결과를 생성한다.

**추가**: 3행 표시용 상하 기물(decorative)을 생성하는 헬퍼 함수:

```javascript
export function buildReelDisplay(spinResult, deck, symbolsData, reelRows = 3) {
  // spinResult.entries = [entry0, entry1, entry2] (가운데 행 = 결과)
  // 각 entry마다 위/아래에 랜덤 기물을 배치하여 3×3 매트릭스 생성
  // 반환: { reels: [[top, center, bottom], [top, center, bottom], [top, center, bottom]] }
}
```

#### [MODIFY] [index.html](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/index.html)

`#combat-spin-result` 영역의 구조를 릴 형태로 변경:

```html
<!-- 기존 -->
<!-- <div id="combat-spin-result" class="spin-result-grid"></div> -->

<!-- 신규: 3×3 파칭코 슬롯 -->
<div id="combat-spin-result" class="pachinko-machine">
  <div class="pachinko-payline"></div>
  <div class="pachinko-reels">
    <div class="pachinko-reel" data-reel="0"></div>
    <div class="pachinko-reel" data-reel="1"></div>
    <div class="pachinko-reel" data-reel="2"></div>
  </div>
</div>
```

#### CSS 디자인 (index.html `<style>` 내)

```css
.pachinko-machine {
  position: relative;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border: 3px solid rgba(245, 158, 11, 0.4);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 0 40px rgba(245, 158, 11, 0.1), inset 0 0 60px rgba(0,0,0,0.5);
  overflow: hidden;
}

.pachinko-reels {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.pachinko-reel {
  display: flex;
  flex-direction: column;
  height: calc(120px * 3);  /* 3행 */
  overflow: hidden;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 16px;
  border: 2px solid rgba(148, 163, 184, 0.2);
}

.pachinko-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120px;
  gap: 6px;
}

.pachinko-cell.center {  /* payline — 결과 행 */
  background: rgba(245, 158, 11, 0.08);
  border-top: 1px solid rgba(245, 158, 11, 0.3);
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
}

.pachinko-payline {
  position: absolute;
  top: 50%;
  left: 12px;
  right: 12px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(245,158,11,0.6), transparent);
  z-index: 5;
  pointer-events: none;
}

/* 릴 스핀 애니메이션 */
.pachinko-reel.spinning .pachinko-reel-strip {
  animation: reel-spin 0.15s linear infinite;
}

.pachinko-reel.stopping .pachinko-reel-strip {
  animation: reel-stop 0.4s ease-out forwards;
}

@keyframes reel-spin {
  0% { transform: translateY(0); }
  100% { transform: translateY(-120px); }
}

@keyframes reel-stop {
  0% { transform: translateY(-40px); }
  60% { transform: translateY(8px); }
  100% { transform: translateY(0); }
}
```

#### [MODIFY] [ui-renderer.js](file:///c:/Users/ksh00/Documents/GitHub/html_textrpggame/project/public/js/ui-renderer.js)

**`renderCombatScreen()`**: 스핀 결과를 3×3 릴로 렌더링:

```javascript
function renderReels(spinEntries, symbolsData, deck) {
  const dom = getElements();
  clearChildren(dom.combatSpinResult);
  // 3개 릴 컨테이너 생성
  // 각 릴에 3개 셀(top=랜덤, center=결과, bottom=랜덤) 배치
  // center 셀에 .pachinko-cell.center 클래스
}
```

**`animateSpinSlots()`**: 릴 스핀 애니메이션으로 교체:

```javascript
export async function animateSpinSlots(spinEntries, symbolsData, deck) {
  const dom = getElements();
  const reels = dom.combatSpinResult.querySelectorAll('.pachinko-reel');
  
  // 1. 모든 릴에 spinning 클래스 추가 (동시 시작)
  reels.forEach(reel => reel.classList.add('spinning'));
  
  // 2. 각 릴을 시간차로 정지 (릴0: 600ms, 릴1: 1000ms, 릴2: 1400ms)
  for (let i = 0; i < reels.length; i++) {
    await wait(400 + i * 400);
    reels[i].classList.remove('spinning');
    reels[i].classList.add('stopping');
    // 최종 결과 셀을 실제 결과로 교체
    playSFX('spin');
  }
  
  // 3. 모든 릴 정지 후 라인 하이라이트
  await wait(300);
}
```

---

## 5. Target Files 요약

| 파일 | Part | 작업 |
|------|------|------|
| `public/js/story-engine.js` | 1, 2 | `STARTING_DECK_RECIPES` 삭제, `buildInitialDeck` 시그니처 변경, `createInitialRun` 시작 노드 데이터화 |
| `public/js/app.js` | 2, 3 | 시작 노드를 `nextRun.currentNodeId`로 교체, 인카운트 분기 switch 정리 |
| `public/js/combat-engine.js` | 4 | `buildReelDisplay()` 헬퍼 추가 |
| `public/js/ui-renderer.js` | 4 | 스핀 결과를 3×3 릴로 렌더링, `animateSpinSlots` 릴 애니메이션 |
| `public/index.html` | 4 | `#combat-spin-result` HTML 구조 변경 + CSS 추가 |
| `data/gamedata/classes.json` | 1 | `startingDeck` 필드 추가 |
| `data/gamedata/origins.json` | 2 | `startNodeId` 필드 추가 |
| `data/gamedata/config.json` | 2, 4 | `defaultStartNodeId`, `spinCount: 3`, `reelRows: 3` 추가 |
| `data/gamedata/story.json` | 2 | 출신지별 프롤로그 노드 3개 추가 |

---

## 6. Edge Cases

| 상황 | 처리 |
|------|------|
| `classes[id].startingDeck`가 없는 기존 데이터 | 빈 배열이면 `throw Error` — 파싱 스크립트에서 반드시 합성할 것 |
| 출신지 선택 안 함 (origins 비어있음) | `config.defaultStartNodeId` → `'node_prologue'` fallback |
| `originData.startNodeId`가 story에 없는 노드 | `enterStoryNode` 내부에서 `Missing story node` 에러 → 로비로 복귀 |
| 덱에 기물이 3개 미만 | 릴에 빈 슬롯 표시 (기존 `'empty'` 처리) |
| `config.spinCount` 가 3보다 큰 값 | 릴은 항상 3열. 4번째 이상 결과는 보너스 행으로 표시하거나 숨김 처리 |

---

## 7. Persistence

| 시점 | 저장 항목 |
|------|-----------|
| 직업 선택 직후 | `currentRun.currentNodeId` (출신지별 시작노드) 포함한 전체 런 저장 |
| 이후 | 기존 Auto-save 로직 그대로 |

---

## 8. Testing Checklist

| # | 시나리오 | 검증 방법 |
|---|----------|-----------|
| 1 | 시작 덱이 classes.json의 `startingDeck` 데이터에서 올바르게 구성되는가 | 직업 선택 후 전투 진입 → 가방에 데이터대로 기물이 들어있는지 확인 |
| 2 | classes.json에서 `startingDeck`을 수정하면 게임에 즉시 반영되는가 | JSON 수정 → 업로드 → 새 런 시작 → 변경된 덱 확인 |
| 3 | 출신지별로 서로 다른 프롤로그 노드가 표시되는가 | origin_village → "시골 마을의 아침" / origin_slum → 빈민굴 프롤로그 |
| 4 | 출신지 미선택 시 config.defaultStartNodeId 로 시작하는가 | origins 데이터 비운 후 → 기본 `node_prologue` 진입 확인 |
| 5 | 인카운트 type=npc/quest가 switch default로 정상 처리되는가 | `npc` 타입 인카운트 롤 → storyNodeId 스토리 화면 전이 |
| 6 | 3×3 릴 UI가 정상 렌더되는가 | 전투 진입 → 스핀 버튼 클릭 → 3열 릴이 시간차로 정지 |
| 7 | 릴 애니메이션이 각 열 시간차로 멈추는가 | 스핀 후 릴0 → 릴1 → 릴2 순서로 정지 확인 |
| 8 | payline(가운데 행) 강조가 정상 표시되는가 | 스핀 결과 후 가운데 행에 강조선 표시 |
| 9 | 리롤 시 릴이 다시 스핀하는가 | 결과 확인 후 리롤 → 릴 재스핀 |
| 10 | 새로고침 후 전투 복구 시 마지막 스핀 결과가 3×3으로 표시되는가 | 전투 중 새로고침 → 릴에 이전 결과 표시 |

---

## 9. 주의/최적화 포인트

1. **하위 호환:** `buildInitialDeck`에 3번째 인자가 없으면 기존처럼 동작하도록 방어 코드 작성, 단 `STARTING_DECK_RECIPES` 자체는 삭제한다.
2. **릴 애니메이션:** CSS `transform` + `will-change: transform`으로 GPU 가속. JS 타이머는 `requestAnimationFrame` 활용 권장.
3. **릴 데코 기물:** 상하 행의 기물은 현재 덱에서 랜덤 추출하여 실제감을 높인다. 빈 덱이면 `'?'` 표시.
4. **DOM 최적화:** 릴 셀은 초기 렌더 시 `DocumentFragment`로 한 번에 삽입. 스핀 시에는 `textContent` / `src` 변경만 수행, DOM 구조 재생성 금지.
5. **모바일 대응:** 릴 셀 높이를 `min(120px, 25vw)`로 반응형 처리. 3열 그리드 유지.

---
* **Status:** `🟢 완료`
* **Created:** `2026-03-13`
* **Author:** `PachinkoHero TD`
