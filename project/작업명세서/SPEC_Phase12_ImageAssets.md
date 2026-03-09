# 🟡 대기중

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 12 — 이미지 에셋 플레이스홀더`

* **Goal (유저 가치):** 모든 아이콘 참조(기물/몬스터/직업/UI)에 실제 표시 가능한 이미지가 존재하여, 깨진 이미지 없이 게임을 플레이할 수 있다.

* **Non-Goals:**
  - 정식 그래픽 제작 (이번은 "식별 가능한 플레이스홀더"로 충분)
  - 애니메이션 스프라이트

* **Scope in Loop:** 전체 (모든 화면에서 아이콘 사용)

* **Target Files:**
  - `public/assets/images/items/` — 기물 아이콘 (15종)
  - `public/assets/images/monsters/` — 몬스터 아이콘 (10종)
  - `public/assets/images/classes/` — 직업 아이콘 (3종)
  - `public/assets/images/ui/` — 엔딩/강화 아이콘 (8종)
  - `public/js/ui-renderer.js` — 이미지 로드 실패 시 fallback 텍스트 처리 보강

* **Firestore Reads/Writes:** 없음

* **State Model:** 변경 없음

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `ui-renderer.js` | `createIcon` | `(iconPath, altText) → Element` | `onerror` 핸들러 추가: 로드 실패 시 텍스트 fallback 표시 |

### 신규 추가 함수 (NEW)

해당 없음 (이미지 파일 추가 + 기존 함수 보강)

---

* **필요한 이미지 파일 목록:**

| 경로 | 파일 수 | 설명 |
|------|---------|------|
| `items/` | sword, shield, potion, mace, hammer, bow, crossbow, dagger, spear, staff, helmet, armor, herb, elixir, gold_coin (15종) | 기물 아이콘 |
| `monsters/` | slime, goblin, skeleton, orc_warrior, dragon, wolf, bandit, dark_mage, golem, lich (10종) | 몬스터 아이콘 |
| `classes/` | warrior, archer, mage (3종) | 직업 아이콘 |
| `ui/` | ending_death, ending_dragon, ending_merchant, ending_cave, ending_lich, upgrade_hp, upgrade_gold, upgrade_bag (8종) | UI 아이콘 |

**총 36개 .webp 파일 필요**

* **Testing Checklist:**
  1. □ 모든 화면에서 깨진 이미지(alt 텍스트만 표시)가 없는가?
  2. □ 이미지 로드 실패 시 텍스트 fallback이 표시되는가?
  3. □ 직업 선택/상점/전투/엔딩 화면에서 아이콘이 정상 렌더되는가?
