# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 게임 시작 → 로그인(Auth) → 로비(Lobby) ↔ 강화 → 런 시작 → 스토리/전투 반복 → 엔딩 → 재화 지급 → 로비 복귀
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 → 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 8 — GameData 콘텐츠 확충`

* **Goal (유저 가치):** 플레이어가 최소 30분 이상 플레이할 수 있는 분량의 스토리, 몬스터, 기물, 인카운트, 엔딩 데이터가 실제로 존재하여 게임이 "핵심 루프를 체험할 수 있는 데모" 수준이 된다.

* **Non-Goals:**
  - 밸런스 최종 조정 (이번은 "데이터 존재"가 목표)
  - 이미지 에셋 제작 (아이콘 경로만 정의, 실제 이미지는 별도)
  - 코드 변경 (JSON 데이터만 추가/수정)

* **Scope in Loop:** 전체 루프 (스토리/전투/엔딩 데이터 기반)

* **Target Files:**
  - `data/gamedata/symbols.json` — 기물 확충 (7종 → 15종+)
  - `data/gamedata/monsters.json` — 몬스터 확충 (5종 → 10종+)
  - `data/gamedata/encounters.json` — 인카운트 확충 (6종 → 12종+)
  - `data/gamedata/story.json` — 스토리 노드 확충 (11노드 → 20노드+, 빠진 노드 보완)
  - `data/gamedata/endings.json` — 엔딩 추가 (3종 → 5종+)
  - `data/gamedata/classes.json` — 직업 추가 검토 (2종 → 3종)
  - `data/gamedata/config.json` — 필요 시 밸런스 상수 추가

* **Firestore Reads/Writes:**
  - Reads: 기존과 동일 (GameData 7문서 로드)
  - Writes: 없음 (데이터 파일 수정 → `node scripts/upload-gamedata.js` 실행)

* **State Model:**
  - 변경 없음 (데이터 전용 작업)

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| — | — | — | 코드 변경 없음. JSON 데이터만 추가. |

### 신규 추가 함수 (NEW)

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| — | — | — | — | 코드 변경 없음 |

### 호출 관계 (CALLS)

해당 없음 (데이터 전용 작업)

### ARCHITECTURE.md 업데이트 필요 여부

- [ ] 코드 변경 없으므로 ARCHITECTURE.md 업데이트 불필요

---

* **UI Flow:**
  해당 없음 (데이터 전용)

* **Algorithm:**
  해당 없음 (데이터 전용)

---

## 📊 현재 데이터 현황 및 확충 목표

### symbols.json (기물/아이템)

**현재 7종:** sword, shield, potion, mace, hammer, bow, crossbow

**확충 목표 (+8종, 총 15종):**

| ID | name | type | value | rarity | classTag | 설명 |
|----|------|------|-------|--------|----------|------|
| `dagger` | 단검 | attack | 3 | 1 | dagger | 빠른 약공격 |
| `spear` | 창 | attack | 6 | 2 | spear | 중거리 공격 |
| `staff` | 마법 지팡이 | attack | 7 | 2 | staff | 마법사용 무기 |
| `helmet` | 철 투구 | defense | 4 | 2 | helmet | 중방어 |
| `armor` | 가죽 갑옷 | defense | 6 | 3 | armor | 강방어 |
| `herb` | 약초 | heal | 3 | 1 | herb | 약한 회복 |
| `elixir` | 엘릭서 | heal | 8 | 3 | elixir | 강력한 회복 |
| `gold_coin` | 금화 | gold | 15 | 2 | gold | 즉시 골드 획득 |

### monsters.json (몬스터)

**현재 5종:** slime, goblin, skeleton, orc_warrior, dragon

**확충 목표 (+5종, 총 10종):**

| ID | name | hp | attack | defense | tier | tags |
|----|------|----|--------|---------|------|------|
| `wolf` | 야생 늑대 | 25 | 7 | 3 | 1 | normal |
| `bandit` | 산적 | 40 | 9 | 4 | 1 | normal |
| `dark_mage` | 어둠의 마법사 | 50 | 15 | 4 | 2 | elite |
| `golem` | 돌 골렘 | 80 | 12 | 12 | 2 | elite |
| `lich` | 리치 | 120 | 22 | 10 | 3 | boss |

### encounters.json (인카운트)

**현재 6종:** forest_ambush, skeleton_tomb, orc_camp, merchant, treasure, healing_spring

**확충 목표 (+6종, 총 12종):**

| ID | type | 등장 조건 | 설명 |
|----|------|-----------|------|
| `enc_wolf_pack` | combat | stage 1~3 | 늑대 무리 조우 |
| `enc_bandit_road` | combat | stage 2~4 | 산적 습격 |
| `enc_dark_mage` | combat | stage 3~5 | 어둠의 마법사 |
| `enc_golem_ruins` | combat | stage 4~6 | 골렘 유적 |
| `enc_mystic_chest` | reward | stage 2~99 | 보물(herb/elixir 드롭) |
| `enc_wandering_smith` | event | stage 2~99 | 떠돌이 대장장이(무기 구매) |

### story.json (스토리 노드)

**현재 11노드 — 빠진 노드 2개:**
- `node_village_return` ❌ (node_forest_clearing에서 참조하나 정의 없음)
- `node_cave_entry` ❌ (node_coast_entry에서 참조하나 정의 없음)

**확충 목표 (+9노드, 총 20노드):**

| ID | type | 설명 |
|----|------|------|
| `node_village_return` | narrative | ❌ 빠진 노드 보완 — 마을 귀환 후 회복 + 재출발 분기 |
| `node_cave_entry` | encounter_trigger | ❌ 빠진 노드 보완 — 동굴 탐험 인카운트 |
| `node_cave_depths` | narrative | 동굴 깊은 곳 — 리치 발견 분기 |
| `node_lich_battle` | combat | 리치 전투 |
| `node_ending_cave_explorer` | ending | 동굴 관련 엔딩 |
| `node_smithy` | shop | 떠돌이 대장장이 상점 |
| `node_crossroads` | narrative | 중반 교차로 (숲/해안 합류점) |
| `node_final_choice` | narrative | 최종 선택 (드래곤 or 리치) |
| `node_lich_ending` | ending | 리치 처치 엔딩 |

### endings.json (엔딩)

**현재 3종:** death, dragon_slayer, merchant_king

**확충 목표 (+2종, 총 5종):**

| ID | name | type | payoutMultiplier | 조건 |
|----|------|------|------------------|------|
| `ending_cave_explorer` | 동굴 탐험가 | success | 1.3 | explored_cave 플래그 |
| `ending_lich_slayer` | 리치 사냥꾼 | success | 1.8 | defeated_lich 플래그 |

### classes.json (직업)

**현재 2종:** warrior, archer

**확충 목표 (+1종, 총 3종):**

| ID | name | weapons | 설명 |
|----|------|---------|------|
| `mage` | 마법사 | staff, dagger | 마법 중심, 초반 약하나 후반 강함 |

> ⚠ mage 추가 시 `story-engine.js`의 `STARTING_DECK_RECIPES`에 mage 항목도 추가 필요

---

## 📐 데이터 참조 무결성 체크리스트 (§5-5 준수)

구현 시 아래 참조 관계가 깨지지 않는지 반드시 확인:

- [ ] `classes.weapons[]` → `symbols` 키 존재
- [ ] `monsters.lootTable[].symbolId` → `symbols` 키 존재
- [ ] `encounters.monsters[]` → `monsters` 키 존재
- [ ] `encounters.storyNodeId` → `story` 키 존재
- [ ] `story.encounterPool[]` → `encounters` 키 존재
- [ ] `story.shopItems[].symbolId` → `symbols` 키 존재
- [ ] `story.endingId` → `endings` 키 존재
- [ ] `story.combatMonster` → `monsters` 키 존재
- [ ] `story.choices[].nextNodeId` → `story` 키 존재 (or `$return`)

---

* **Edge Cases:**
  - 참조 키가 존재하지 않는 경우 → 런타임 에러 → 무결성 검증 필수
  - 빠진 노드(node_village_return, node_cave_entry) 보완 필수
  - mage 직업 추가 시 story-engine.js STARTING_DECK_RECIPES 동시 수정 필요

* **Persistence:**
  - 데이터 파일 수정 후 `node scripts/upload-gamedata.js` 실행으로 Firestore 반영

* **Testing Checklist:**
  1. □ `node scripts/upload-gamedata.js` 실행 시 에러 없이 7문서 업로드 되는가?
  2. □ 게임 시작 → GameData 로드 시 새 데이터가 정상 캐싱되는가? (콘솔)
  3. □ 숲 경로 → 깊은 숲 → 드래곤 전투까지 플레이 가능한가?
  4. □ 해안 경로 → 동굴 → 리치 전투까지 플레이 가능한가?
  5. □ 모든 상점(merchant, smithy)에서 새 기물 구매 가능한가?
  6. □ 마법사 직업 선택 → 초기 덱(dagger, staff)이 정상인가?
  7. □ 모든 엔딩(5종)에 도달 가능한 경로가 존재하는가?
  8. □ 참조 무결성 체크리스트 전체 통과?
  9. □ 빠진 노드 2개(village_return, cave_entry)가 정상 동작하는가?

* **주의/최적화 포인트:**
  - 데이터 하드코딩 금지 — 모든 수치는 JSON에서 관리
  - mage 직업 추가 시 **코드 1곳만 수정 필요**: `story-engine.js` `STARTING_DECK_RECIPES`
  - JSON 파일 수정 후 반드시 `upload-gamedata.js` 실행
  - 기존 데이터 구조(필드명/타입)를 변경하지 않고 항목만 추가
