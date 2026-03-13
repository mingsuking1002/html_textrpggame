# 🟢 완료

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Karma(업보) System · Origin(출신지) Selection · Encounter Expansion · Story Branch Visualization`
* **Goal (유저 가치):** `선택에 따른 업보(Karma)가 이후 선택지를 열거나 막아 다회차 플레이의 리플레이 가치를 높인다. 출신지 선택으로 플레이어의 출발점을 다양화한다. 비전투 인카운트(NPC 대화, 구출, 잡일 퀘스트 등)를 추가해 런 경험을 풍성하게 한다.`
* **Non-Goals:** `출신지별 특수 능력 전투/스토리 로직 (추후 구현). UI 애니메이션 고도화. 밸런스 수치 튜닝 (데이터팀 관할).`
* **Scope in Loop:** `App Loop (ORIGIN_SELECT 상태 추가) · Story Loop (karma 조건/효과 · 인카운트 타입 확장 · 다분기 연결점) · Data Pipeline (CSV 파싱 → JSON → Firestore 업로드)`

---

## ★ 참조 스프레드시트 (원본 데이터 — 변경은 CODEX가 한다)

- 편집: <https://docs.google.com/spreadsheets/d/180Zv2x0BNM0NjNx4a2MAFYl46bz-sRTbNln4sOS0wCU/edit?usp=sharing>
- CSV: <https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9Apqx_YFREFxBV2g7U5eayb4HHeV63nr9CzMoZgvYjIxY7fz3NdsVPilKnE0cwc7Wxgdw9RoRvfVZ/pub?output=csv>

---

## 1. 현재 스프레드시트 시트 구조 (22개 탭 확인 완료)

| # | 시트명 | 역할 | 비고 |
|---|--------|------|------|
| 1 | `ClassData` | 직업 기본 정보 | `id, name, icon, description, base_hp, base_gold, deck_size, theme_color, is_enabled` |
| 2 | `ClassStartingData` | 직업별 시작 기물(레시피) | `class_id, symbol_id, count` |
| 3 | `ClassWeaponData` | 직업별 허용 무기 목록 | `class_id, symbol_id` |
| 4 | `SymbolData` | 기물(아이템/무기) 정의 | `id, name, type, value, rarity, class_tag, icon` |
| 5 | `MonsterData` | 몬스터 스탯 | `id, name, hp, attack, defense, exp_reward, gold_reward_min, gold_reward_max, icon, tier, tags` |
| 6 | `DropData` | 몬스터별 드롭 테이블 | `monster_id, symbol_id, drop_rate` |
| 7 | `ConfigData` | 글로벌 설정 키-값 | `group, key, value, type, note` |
| 8 | `ConfigSynergyData` | 시너지 정의 | `type, min_count, bonus_per_extra, label` |
| 9 | `ConfigUpgradeData` | 강화 정의 | `id, name, description, cost, max_level, effect_bonus_hp, effect_bonus_gold, effect_bonus_bag_capacity, icon` |
| 10 | `EncounterData` | 인카운트 정의 | `id, name, type, description, story_node_id, weight, condition_min_stage, condition_max_stage, condition_required_flags` |
| 11 | `EncounterMonsterData` | 전투형 인카운트 몬스터 | `encounter_id, monster_id` |
| 12 | `EncounterRewardRangeData` | 보상형 인카운트 골드/힐 범위 | `encounter_id, reward_type, min, max` |
| 13 | `EncounterRewardSymbolData` | 보상형 인카운트 기물 드롭 | `encounter_id, symbol_id, chance` |
| 14 | `MainStoryNodeData` | 메인 스토리 노드 | `id, type, title, body, after_encounter, combat_monster, on_win, on_lose, ending_id, is_enabled` |
| 15 | `StoryChoiceData` | 스토리 선택지 | `node_id, choice_id, choice_text, next_node_id, condition_has_flag, condition_min_skill, condition_max_skill, effect_add_flag, effect_remove_flag, effect_heal, effect_add_gold, sort_order` |
| 16 | `StoryShopItemData` | 상점 노드 상품 | `node_id, symbol_id, cost, sort_order` |
| 17 | `StoryEncounterPoolData` | 노드별 인카운트 풀 | `node_id, encounter_id` |
| 18 | `StoryOnEnterData` | 노드 진입 시 효과 | `node_id, effect_type, value` |
| 19 | `EndingData` | 엔딩 정의 | `id, name, type, text, payout_multiplier, is_rankable, bonus_gold, icon` |
| 20 | `EndingRequiredFlagData` | 엔딩별 필요 플래그 | `ending_id, flag` |
| 21 | `ConfigSoundBgmData` | BGM 경로 | `key, path` |
| 22 | `ConfigSoundSfxData` | SFX 경로 | `key, path` |

---

## 2. 신규 컬럼/시트 추가 사항 (★ CODEX가 스프레드시트에 반영)

### 2-A. 신규 시트: `OriginData` (출신지)

| 컬럼명 | 타입 | 설명 | 예시 |
|--------|------|------|------|
| `id` | string | 출신지 고유 ID | `origin_village`, `origin_slum`, `origin_noble` |
| `name` | string | 출신지 표시명 | `시골 마을`, `빈민굴`, `귀족 가문` |
| `icon` | string | 아이콘 경로 | `/assets/images/origins/village.webp` |
| `description` | string | 출신지 설명 | `평화로운 마을에서 자란 당신은...` |
| `base_karma` | number | 시작 업보 수치 | `0`, `-10`, `20` |
| `is_enabled` | boolean | 활성화 여부 | `TRUE` |

> **정규화 포인트:** 추후 출신지별 특수 능력이 추가되면, `OriginAbilityData` 시트를 별도로 만들어 `origin_id`로 참조하는 1:N 구조로 확장한다. 현재는 컬럼을 넣지 않는다.

### 2-B. `StoryChoiceData` 컬럼 추가 (업보 관련)

기존 컬럼은 그대로 유지하며, 다음 **4개 컬럼을 끝에 추가**한다.

| 추가 컬럼명 | 타입 | 설명 | 예시 |
|-------------|------|------|------|
| `condition_min_karma` | number (nullable) | 이 선택지가 보이려면 필요한 최소 업보 | `10` (비어있으면 조건 없음) |
| `condition_max_karma` | number (nullable) | 이 선택지가 보이려면 필요한 최대 업보 | `50` (비어있으면 조건 없음) |
| `effect_add_karma` | number (nullable) | 선택 시 업보 증감값 | `5`, `-10` |
| `karma_hint` | string (nullable) | UI에 표시할 선택지 힌트 태그 | `선행`, `악행`, `중립` |

### 2-C. `EncounterData` 컬럼 확인 (기존 구조로 충분)

기존 `type` 컬럼이 `combat`, `event`, `reward`를 이미 지원하고 있음을 확인했다.
신규 인카운트 타입으로 `npc`, `quest`를 추가한다.

| 추가/변경 | 설명 |
|-----------|------|
| `type` 허용값 확장 | 기존: `combat`, `event`, `reward` → 추가: `npc`, `quest` |
| `npc` 타입 | `storyNodeId`로 연결된 NPC 대화 노드를 로드. 전투 없음. |
| `quest` 타입 | `storyNodeId`로 연결된 퀘스트 노드를 로드. 보상/결과 노드 포함 가능. |

> **확장성 포인트:** 새로운 인카운트 타입이 추가되더라도 `type` + `storyNodeId` 패턴으로 일관되게 처리하므로 코드 변경 없이 데이터 추가만으로 대응 가능하도록 설계한다.

### 2-D. `ConfigData`에 업보 관련 설정 행 추가

| group | key | value | type | note |
|-------|-----|-------|------|------|
| `karma` | `initialKarma` | `0` | `int` | `출신지가 없을 경우 기본 업보` |
| `karma` | `minKarma` | `-100` | `int` | `업보 하한` |
| `karma` | `maxKarma` | `100` | `int` | `업보 상한` |

---

## 3. Firestore 데이터 구조 변경

### 3-A. 신규 문서: `GameData/origins`

```jsonc
// data/gamedata/origins.json
{
  "origin_village": {
    "name": "시골 마을",
    "icon": "/assets/images/origins/village.webp",
    "description": "평화로운 마을에서 자란 당신은 선한 성품을 가지고 있다.",
    "baseKarma": 10,
    "isEnabled": true
  },
  "origin_slum": {
    "name": "빈민굴",
    "icon": "/assets/images/origins/slum.webp",
    "description": "거친 거리에서 살아남은 당신은 생존 본능이 뛰어나다.",
    "baseKarma": -10,
    "isEnabled": true
  },
  "origin_noble": {
    "name": "귀족 가문",
    "icon": "/assets/images/origins/noble.webp",
    "description": "유서 깊은 가문에서 태어난 당신은 자부심이 높다.",
    "baseKarma": 5,
    "isEnabled": true
  }
}
```

### 3-B. `GameData/story` — 선택지에 karma 조건/효과 추가

기존 `choices[]` 항목에 다음 필드를 추가한다 (nullable — 빈 값이면 조건 없음).

```jsonc
{
  "text": "도적을 풀어준다",
  "nextNodeId": "node_bandit_free",
  "conditions": {
    "hasFlag": [],
    "minKarma": 10,        // ★ 추가
    "maxKarma": null        // ★ 추가 (null이면 상한 없음)
  },
  "effects": {
    "addKarma": 5,          // ★ 추가
    "addFlag": "freed_bandit"
  },
  "karmaHint": "선행"       // ★ 추가 (UI 태그용)
}
```

### 3-C. `Users/{uid}` — currentRun 확장

```jsonc
{
  "currentRun": {
    "isActive": true,
    "classId": "warrior",
    "originId": "origin_village",    // ★ 추가
    "karma": 15,                      // ★ 추가
    "stage": 3,
    "hp": 60,
    "maxHp": 80,
    "gold": 120,
    "deck": ["sword", "mace", "empty", ...],
    "flags": ["chose_forest"],
    "currentNodeId": "node_forest_clearing",
    "encounterHistory": [],
    "blockedReason": null,
    "combatContext": null
  }
}
```

---

## 4. Target Files (수정/추가 대상)

### 4-1. 데이터 계층

| 파일 | 작업 |
|------|------|
| `data/gamedata/origins.json` | ★ **[NEW]** 출신지 데이터 파일 생성 |
| `data/gamedata/story.json` | 선택지에 `minKarma`, `maxKarma`, `addKarma`, `karmaHint` 반영 |
| `data/gamedata/encounters.json` | 신규 `npc`/`quest` 타입 인카운트 샘플 데이터 추가 |
| `data/gamedata/config.json` | `karma` 그룹 설정값 추가 (`initialKarma`, `minKarma`, `maxKarma`) |

### 4-2. 스크립트 계층

| 파일 | 작업 |
|------|------|
| `scripts/upload-gamedata.js` | `GAME_DATA_DOC_IDS`에 `origins` 추가. 기존 로직은 이미 `data/gamedata/*.json`을 순회하므로 파일명만 추가하면 자동 업로드 |
| `scripts/parse-csv.js` | ★ **[NEW]** CSV multi-sheet → JSON 변환 스크립트 작성. 아래 §5 참조 |

### 4-3. 프론트엔드 모듈 계층

| 파일 | 작업 |
|------|------|
| `public/js/game-state.js` | `AppState` enum에 `ORIGIN_SELECT` 추가 |
| `public/js/db-manager.js` | `GAME_DATA_DOC_IDS`에 `'origins'` 추가 (8개 문서로 확장). `GAME_DATA_DOC_COUNT` 자동 갱신 |
| `public/js/story-engine.js` | ① `createInactiveRunState` / `normalizeRunState`에 `karma: 0`, `originId: null` 프로퍼티 추가  ② `meetsConditions()`에 `minKarma`, `maxKarma` 조건 필터 추가  ③ `applyEffects()`에 `addKarma` / `setKarma` 처리 추가 (clamp 적용: config.karma.minKarma ~ maxKarma)  ④ `createInitialRun()`에 `originId`, 초기 `karma` 반영  ⑤ `loadNode()`에서 choice의 `karmaHint` 필드를 pass-through |
| `public/js/ui-renderer.js` | ① 출신지 선택 화면(`screen-origin-select`) 렌더 함수 추가  ② 스토리 선택지 UI에 `karmaHint` 태그 표시  ③ 업보 비충족 선택지 비활성화(disabled + 이유 표시)  ④ 상단 상태바에 현재 업보 수치 표시 |
| `public/js/app.js` | ① `ORIGIN_SELECT` 상태 핸들링 (로비→출신지→직업 선택 흐름)  ② 인카운트 타입 `npc`/`quest` 분기 처리 (기존 `event` 로직과 동일하게 `storyNodeId`로 전이) |
| `public/index.html` | `<section id="screen-origin-select">` 추가 |

---

## 5. CSV 파싱 스크립트 설계 (`scripts/parse-csv.js`)

### 5-1. 목적

스프레드시트에서 **시트별 CSV를 다운로드**하고, 정규화된 테이블을 **7+1개 JSON 파일**로 합성한다.

### 5-2. 파싱 규칙

```
[입력] 22개 시트 CSV → [출력] 8개 JSON 파일

매핑 (정규화 합성):
────────────────────────────────────────────────────────
출력 JSON           ← 입력 시트(들)
────────────────────────────────────────────────────────
config.json         ← ConfigData + ConfigSynergyData + ConfigUpgradeData
                     + ConfigSoundBgmData + ConfigSoundSfxData
classes.json        ← ClassData + ClassStartingData + ClassWeaponData
symbols.json        ← SymbolData
monsters.json       ← MonsterData + DropData
encounters.json     ← EncounterData + EncounterMonsterData
                     + EncounterRewardRangeData + EncounterRewardSymbolData
story.json          ← MainStoryNodeData + StoryChoiceData
                     + StoryShopItemData + StoryEncounterPoolData
                     + StoryOnEnterData
endings.json        ← EndingData + EndingRequiredFlagData
origins.json        ← OriginData (★ NEW)
────────────────────────────────────────────────────────
```

### 5-3. 핵심 의사코드

```
1. gid 매핑으로 각 시트별 CSV URL 생성
   → https://docs.google.com/.../pub?gid=<GID>&single=true&output=csv
2. 각 시트 CSV를 fetch → 행 배열로 파싱
3. 1:N 관계 시트를 FK(외래키) 기준으로 groupBy
   예: DropData를 monster_id 기준으로 묶어 monsters.json의 lootTable[]에 삽입
4. 타입 변환: ConfigData의 type 컬럼("int","float","bool","string") → JSON 타입 캐스팅
5. 출력: data/gamedata/*.json에 저장
6. 검증: 참조 무결성 체크 (§5-5 데이터 참조 관계)
```

### 5-4. 참조 무결성 검증 (파싱 시 에러 출력)

```
classes.weapons[]         → symbols 키
monsters.lootTable[].symbolId → symbols 키
encounters.monsters[]     → monsters 키
encounters.storyNodeId    → story 키 (type=event/npc/quest일 때)
story.encounterPool[]     → encounters 키
story.shopItems[].symbolId → symbols 키
story.endingId            → endings 키
story.combatMonster       → monsters 키
story.choices[].nextNodeId → story 키 (또는 "$return")
endings.requiredFlags     → (경고만, 강제 아님)
origins (신규)            → (독립, 외래키 없음)
```

---

## 6. State Model 변경사항

### 6-1. AppState enum (game-state.js)

```diff
 export const AppState = Object.freeze({
   BOOT: 'BOOT',
   AUTH: 'AUTH',
   LOBBY: 'LOBBY',
   UPGRADE: 'UPGRADE',
   RUN_START: 'RUN_START',
+  ORIGIN_SELECT: 'ORIGIN_SELECT',
   CLASS_SELECT: 'CLASS_SELECT',
   PROLOGUE: 'PROLOGUE',
   STORY: 'STORY',
   COMBAT: 'COMBAT',
   SURVIVAL_CHECK: 'SURVIVAL_CHECK',
   ENDING_DEATH: 'ENDING_DEATH',
   ENDING_SUCCESS: 'ENDING_SUCCESS',
   RANKING: 'RANKING',
   PAYOUT: 'PAYOUT',
 });
```

### 6-2. currentRun 확장 (story-engine.js)

```diff
 export function createInactiveRunState(overrides = {}) {
   return {
     isActive: false,
     classId: null,
+    originId: null,
+    karma: 0,
     stage: 1,
     hp: 0,
     maxHp: 0,
     gold: 0,
     deck: [],
     flags: [],
     currentNodeId: null,
     encounterHistory: [],
     blockedReason: null,
     combatContext: null,
     ...cloneJsonCompatible(overrides),
   };
 }
```

### 6-3. meetsConditions 확장

```diff
 export function meetsConditions(conditions = {}, playerState) {
   const runState = normalizeRunState(playerState);
   // ... 기존 flag/stage 조건 ...

+  if (conditions.minKarma !== undefined && conditions.minKarma !== null
+      && runState.karma < Number(conditions.minKarma)) {
+    return false;
+  }
+
+  if (conditions.maxKarma !== undefined && conditions.maxKarma !== null
+      && runState.karma > Number(conditions.maxKarma)) {
+    return false;
+  }

   return true;
 }
```

### 6-4. applyEffects 확장

```diff
 export function applyEffects(effects = {}, playerState) {
   const nextState = normalizeRunState(playerState);
   // ... 기존 flag/gold/hp 처리 ...

+  const karmaDelta = toFiniteNumber(effects.addKarma, 0);
+  if (karmaDelta !== 0) {
+    nextState.karma = clamp(
+      nextState.karma + karmaDelta,
+      -100,  // config.karma.minKarma (런타임에서 가져올 것)
+      100    // config.karma.maxKarma
+    );
+  }
+
+  if (effects.setKarma !== undefined) {
+    nextState.karma = clamp(toFiniteNumber(effects.setKarma, 0), -100, 100);
+  }

   return nextState;
 }
```

---

## 7. UI Flow

```
로비(LOBBY)
  → [출발하기 버튼]
  → 출신지 선택(ORIGIN_SELECT)  ★ NEW
     - 출신지 카드 목록 (아이콘 + 이름 + 설명 + 시작 업보 표시)
     - [선택] 버튼 클릭
  → 직업 선택(CLASS_SELECT)
  → 프롤로그(PROLOGUE)
  → 스토리(STORY)
     - 상단 상태바: HP / Gold / ★Karma 수치
     - 선택지 목록:
       - 업보 조건 미달 → 비활성화 + "업보 N 이상 필요" 툴팁
       - 업보 증감 안내 → karmaHint 태그(선행/악행/중립) 표시
```

---

## 8. Algorithm (인카운트 타입 분기 — app.js)

```javascript
// 기존 인카운트 처리 로직에서 type 분기를 확장
function handleEncounterResult(encounter, playerState) {
  switch (encounter.type) {
    case 'combat':
      // 기존 전투 진입 로직 (combatMonster 선택 → COMBAT 전이)
      break;
    case 'event':
    case 'npc':            // ★ 추가
    case 'quest':          // ★ 추가
      // storyNodeId가 가리키는 스토리 노드로 전이
      // encounter → pushReturnNode → loadNode(storyNodeId) → presentStoryNode
      break;
    case 'reward':
      // 기존 보상 처리 로직
      break;
    default:
      // 알 수 없는 타입 → event와 동일하게 처리 (확장성)
      break;
  }
}
```

---

## 9. Edge Cases

| 상황 | 처리 |
|------|------|
| 기존 세이브에 `karma`/`originId` 없음 | `normalizeRunState`에서 기본값 `karma: 0`, `originId: null` 적용. 로비 복구 시 문제 없음 |
| `OriginData` 시트 비어있음 | 출신지 선택 화면에서 "출신지 데이터가 없습니다" 토스트 → CLASS_SELECT로 건너뜀 |
| 조건 불충족 선택지 | UI에서 비활성화(disabled). 클릭 불가. `meetsConditions` false면 `applyChoice` throw하므로 이중 방어 |
| 인카운트 `storyNodeId` 누락 | `type`이 `event`/`npc`/`quest`인데 `storyNodeId`가 없으면 해당 인카운트를 후보에서 제외, 콘솔 경고 |
| 파싱 스크립트 참조 무결성 실패 | 에러 로그 출력 + 경고. 파일은 생성하되, 배포 전 수동 확인 유도 |
| `karma` 상한/하한 넘침 | `clamp(karma, config.minKarma, config.maxKarma)`로 항상 범위 제한 |

---

## 10. Persistence (저장/복구)

| 시점 | 저장 항목 |
|------|-----------|
| 출신지 선택 직후 | `currentRun.originId`, `currentRun.karma` → Auto-save |
| 스토리 선택지 선택 직후 | `currentRun.karma` (변경분 포함) → 기존 Auto-save와 동일 시점 |
| 새로고침/재접속 | `normalizeRunState`에서 `karma`/`originId` 복구. 기존 로직으로 `currentRun.isActive=true`면 런 화면 복구 |

---

## 11. Testing Checklist (10개)

| # | 시나리오 | 검증 방법 |
|---|----------|-----------|
| 1 | 출신지별 시작 업보가 올바르게 적용되는가 | 각 출신지 선택 후 `currentRun.karma` === `origins[id].baseKarma` 확인 |
| 2 | 업보 조건 선택지 활성화/비활성화 | `minKarma=10` 선택지가 `karma=5`일 때 disabled, `karma=15`일 때 enabled |
| 3 | 업보 증감이 반영되고 UI에 표시됨 | 선택 후 `karma` 변화 + 상태바 수치 갱신 |
| 4 | 업보 상한/하한 clamp 동작 | `karma`가 100 이상 또는 -100 이하로 넘지 않음 |
| 5 | 비전투 인카운트(npc/quest)가 전투 없이 스토리 노드로 전이 | `type=npc` 인카운트 롤 → `storyNodeId` 로드 → 스토리 화면 렌더 |
| 6 | 기존 세이브(karma 없음) 로드 시 크래시 없이 기본값 적용 | 이전 버전 세이브를 가진 유저가 로그인해도 정상 작동 |
| 7 | 새로고침 후 출신지/업보 복구 | 런 중 새로고침 → `originId`/`karma` 유지 |
| 8 | CSV 파싱 스크립트가 22개 시트를 8개 JSON으로 올바르게 합성 | `node scripts/parse-csv.js` → 생성된 JSON과 기존 JSON 구조 비교 |
| 9 | 참조 무결성 검증 실패 시 적절한 에러 메시지 | 존재하지 않는 `monster_id`를 넣고 파싱 → 콘솔에 경고 출력 확인 |
| 10 | 스토리 분기 트리가 데이터 기반으로 동작(하드코딩 없음) | 스프레드시트에서 새 노드/선택지 추가 → 파싱 → 업로드 → 게임에 즉시 반영 |

---

## 12. 주의/최적화 포인트

1. **데이터 주도 원칙 엄수:** 업보 조건/효과/인카운트 타입을 if-else 하드코딩으로 처리하는 것을 **절대 금지**한다. 반드시 데이터 필드 해석으로만 처리할 것.
2. **정규화 일관성:** 스프레드시트의 1:N 관계(예: `DropData` → `MonsterData.lootTable[]`)는 파싱 스크립트에서 합성하며, JSON 측에서는 중첩 배열로 비정규화한다.
3. **하위 호환:** `normalizeRunState`에서 신규 필드(`karma`, `originId`)가 undefined일 때 기본값을 반환하여, 기존 세이브 데이터를 깨뜨리지 않는다.
4. **GameData 로드 카운트:** `GAME_DATA_DOC_IDS`에 `origins`가 추가되므로 `GAME_DATA_DOC_COUNT`가 자동으로 8이 된다. 부트 프로그레스 바도 자동 반영.
5. **DOM 성능:** 출신지 선택 화면은 카드 3~5개 수준이므로 `DocumentFragment`로 한 번에 append.
6. **XSS 방어:** `description`, `karmaHint` 등 사용자향 텍스트는 `textContent`로 삽입. `innerHTML` 사용 금지.
7. **확장성:** 인카운트의 신규 `type`이 추가되더라도 `storyNodeId` 패턴을 유지하면 코드 변경 없이 대응 가능하도록 default 분기를 마련한다.

---
* **Status:** `🟢 완료`
* **Created:** `2026-03-13`
* **Author:** `PachinkoHero TD`
