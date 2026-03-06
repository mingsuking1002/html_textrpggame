
- 작성일: 2026-03-06  
- 문서 목적: **단일 HTML 프로토타입**을 **Firebase(Auth/Firestore/Hosting) + Data‑Driven** 구조로 분리/확장하기 위한 프레임워크 마스터 기획서  
- 프론트엔드: HTML5 + TailwindCSS + Vanilla JS (ES Modules)  
- 백엔드/호스팅: Firebase (Auth, Firestore, Hosting)

---

## 1. 프레임워크 한 줄 정의

**룰렛 스핀 기반 전투 결과**와 **선택지 기반 스토리 진행**을 “런(run)” 단위로 묶고, 런의 결과(사망/클리어)를 **계정 재화/랭킹**으로 환류시키는 **웹 RPG 프레임워크**.

---

## 2. 핵심 원칙(변경 금지)

### 2.1 캐노니컬 플로우(Flow)가 곧 제품 규격
- App / Combat / Story의 3개 플로우는 **기획·개발·QA의 단일 기준**이다.
- 구현/문서/테스트는 항상 이 플로우를 기준으로 작성한다.

### 2.2 Data‑Driven(하드코딩 금지)
- 밸런스 수치(데미지/HP/확률)와 에셋 경로(icon)는 **코드에 하드코딩하지 않고 GameData에서 로드**한다.
- 기획 데이터는 “시트 → JSON → Firestore”로 업데이트하며, **코드 수정 없이 패치 가능**해야 한다.

### 2.3 Cloud Save(이탈/복구 내성)
- 유저 진행(덱/골드/스테이지)은 `Users/{uid}`에 저장한다.
- 런 진행은 `currentRun.isActive` 플래그로 판단한다.

---

## 3. 전체 플로우(통합본 v1)

### 3.1 App Flow (메타/화면 전환 루프)

1) 게임 시작  
2) 로그인  
3) 로비  
4) 강화(결정) 가능 → 완료 후 로비 복귀  
5) 게임 시작(런 시작)  
6) 직업 및 캐릭터 선택  
7) 프롤로그 스토리 연출  
8) 메인 스토리와 랜덤 인카운트 진행  
9) 전장 및 전투  
10) 엔딩까지 생존?
- No → 죽음 엔딩(계정 재화 지급) → 로비
- Yes → 엔딩(분기마다 다름) → 랭킹 등록 → 계정 재화 지급 → 로비

### 3.2 Combat Flow (전투 루프)

1) 전투 시작  
2) 가방의 기물 체크  
3) 룰렛 스핀  
4) 기물 개수에 따른 결과값 계산  
5) 적 공격  
6) 전투 승패?
- 패배 → 플레이어 라이프 감소 + 경험치 획득 (0이되면 패배) → 전투 종료
- 승리 → 경험치 획득 + 보상 획득 → 전투 종료

### 3.3 Story Flow (스토리 루프)

1) 메인 스토리 진행  
2) 선택지에 따른 분기 형성  
3) 메인과 관련 적은 랜덤 인카운트 등장  
4) 메인, 랜덤 인카운트 선택지에 의한 상황 형성  
5) 메인 스토리 선택지 + 상황에 따른 이야기 진행  
6) 반복  
7) 엔딩

---

## 4. 통합 다이어그램(Mermaid)

> 아래 블록을 문서/노션/README에 붙여 넣으면 전체 흐름을 한 장으로 볼 수 있다.

```mermaid
flowchart LR
  A[게임 시작] --> B[로그인] --> C[로비]
  C --> D[강화(결정) 가능] --> C
  C --> E[게임 시작(런)]
  E --> F[직업 및 캐릭터 선택]
  F --> G[프롤로그 스토리 연출]
  G --> H[메인 스토리와 랜덤 인카운트 진행]
  H --> I[전장 및 전투]
  I --> J{엔딩까지 생존?}
  J -- no --> K[죽음 엔딩\n(계정 재화 지급)] --> C
  J -- yes --> L[엔딩\n(분기마다 다름)] --> M[랭킹 등록] --> N[계정 재화 지급] --> C

  subgraph COMBAT[전투 루프]
    I1[전투 시작] --> I2[가방의 기물 체크] --> I3[룰렛 스핀]
    I3 --> I4[기물 개수에 따른 결과값 계산] --> I5[적 공격]
    I5 --> I6{전투 승패?}
    I6 -- 패배 --> I7[플레이어 라이프 감소\n경험치 획득\n(0이되면 패배)] --> I8[전투 종료]
    I6 -- 승리 --> I9[경험치 획득\n보상획득] --> I8
  end

  subgraph STORY[스토리 루프]
    S1[메인 스토리 진행] --> S2[선택지에 따른\n분기 형성]
    S2 --> S3[메인과 관련 적은\n랜덤 인카운트 등장]
    S3 --> S4[메인, 랜덤 인카운트\n선택지에 의한 상황 형성]
    S4 --> S5[메인 스토리 선택지 +\n상황에 따른 이야기 진행]
    S5 -->|반복| S2
    S5 --> S6[엔딩]
  end

  H -. 스토리 진행 .-> S1
  I -. 전투 상세 .-> I1
  I8 -. 전투 종료 후 복귀 .-> H
  S6 -. 엔딩 합류 .-> J
```

---

## 5. 시스템 아키텍처(프레임워크 구조)

### 5.1 레이어 구성
- **UI Layer (Renderer)**  
  - 화면/패널/모달/룰렛 애니메이션/전투 로그 출력
- **App Controller**  
  - App Flow 상태 전이(로비↔강화↔런) 및 라우팅
- **Game State Store**  
  - 단일 `state` 관리 + 구독(subscribe) 방식으로 UI 업데이트 트리거
- **Combat Engine**  
  - 룰렛 스핀, 결과값 계산, 데미지/보상/승패 판정(순수 로직)
- **Story Engine**  
  - 스토리 노드 로드, 선택지 적용, 인카운트/전투 트리거
- **DB Manager**  
  - GameData 로드/캐싱, Users 세이브/로드, 랭킹 저장
- **Firebase Init(Auth)**  
  - 로그인/로그아웃, uid 획득

### 5.2 모듈 분할(권장 파일)
- `public/index.html` : UI 레이아웃, 스크립트 로드
- `public/js/firebase-init.js` : Firebase 초기화, Auth
- `public/js/db-manager.js` : Firestore 로드/세이브
- `public/js/game-state.js` : state 관리/전파
- `public/js/combat-engine.js` : 전투 규칙/룰렛
- `public/js/story-engine.js` : 스토리 노드/선택지
- `public/js/ui-renderer.js` : DOM 렌더
- `public/js/app.js` : 메인 컨트롤러(초기 부팅 및 이벤트 등록)

---

## 6. Firestore 데이터 설계

### 6.1 컬렉션 2기둥
1) **GameData**: 읽기 전용(밸런스/콘텐츠), 실행 시 1회 로드 후 캐싱  
2) **Users**: 유저 세이브(읽기/쓰기), 문서 ID = uid

### 6.2 GameData 문서(v1)
#### `GameData/config`
```json
{
  "startHp": 80,
  "startGold": 100,
  "bagCapacity": 20,
  "rerollCost": 25,
  "armorConstant": 15
}
```

#### `GameData/classes`
```json
{
  "warrior": { "name": "전사", "icon": "/assets/images/classes/warrior.webp", "weapons": ["sword","mace","hammer"] },
  "archer": { "name": "궁수", "icon": "/assets/images/classes/archer.webp", "weapons": ["bow","crossbow"] }
}
```

#### `GameData/symbols`
```json
{
  "sword":  { "name": "낡은 검", "type": "attack", "value": 4, "rarity": 1, "classTag": "sword",  "icon": "/assets/images/items/sword.webp" },
  "potion": { "name": "포션",  "type": "heal",   "value": 2, "rarity": 2, "classTag": "potion", "icon": "/assets/images/items/potion.webp" }
}
```

> v1 확장(동일 규칙):  
> `GameData/monsters`, `GameData/encounters`, `GameData/story`, `GameData/endings`

### 6.3 Users 문서(v1)
`Users/{uid}`
```json
{
  "displayName": "모험가_77",
  "createdAt": "2026-03-05T10:00:00Z",
  "totalGoldEarned": 1500,
  "highestStage": 5,
  "currentRun": {
    "isActive": true,
    "classId": "warrior",
    "stage": 1,
    "hp": 80,
    "maxHp": 80,
    "gold": 100,
    "deck": ["empty","empty","empty","empty","sword","shield","potion"]
  }
}
```

---

## 7. 데이터 운영 파이프라인(시트 → AI → Firestore)
- 기획/밸런싱을 Google Sheets에서 표로 관리(아이템명/ID/타입/수치/아이콘 경로 등)
- 시트 내용을 AI에 전달해 Firestore에 붙여넣을 **JSON 객체**로 변환
- Firestore 콘솔에 붙여넣어 즉시 패치(코드 수정 없이 반영)

---

## 8. 상태 머신(State Machine) 매핑

### 8.1 App State Enum(권장)
- `BOOT`, `AUTH`, `LOBBY`, `UPGRADE`
- `RUN_START`, `CLASS_SELECT`, `PROLOGUE`
- `STORY`, `COMBAT`
- `SURVIVAL_CHECK`
- `ENDING_DEATH`, `ENDING_SUCCESS`
- `RANKING`, `PAYOUT`

### 8.2 런 전환 규칙(플로우 준수)
- `LOBBY ↔ UPGRADE`는 언제든 왕복 가능
- 런 시작 시 `CLASS_SELECT → PROLOGUE → STORY`
- 스토리에서 인카운트 발생 시 `STORY → COMBAT → STORY` 반복
- 엔딩 조건 만족 시 `SURVIVAL_CHECK`로 이동하여 성공/사망 분기

---

## 9. 전투 엔진(Combat Engine) 규격

### 9.1 입력/출력 계약
**입력**
- `state.player`(hp/maxHp/gold/stage 등)
- `state.deck`(가방의 기물)
- `enemy`(monster 데이터)
- `config`(GameData/config)
- `rngSeed`

**출력**
- `result`: `"win" | "lose"`
- `delta`: hp/gold/exp/deck 변화
- `logs`: UI에 출력할 텍스트/이벤트 목록
- (선택) `spinDetail`: 룰렛 결과(심볼 리스트/합산 등)

### 9.2 Combat Flow 준수
- 전투는 “체크 → 스핀 → 계산 → 적 공격 → 승패” 순서로 처리한다.
- 승리 시 보상/경험치를 지급하고 종료한다.
- 패배 시 라이프 감소를 반영하며, 0이면 런 사망 엔딩 흐름으로 연결한다.

---

## 10. 스토리 엔진(Story Engine) 규격

### 10.1 입력/출력 계약
**입력**
- `currentNodeId`
- `storyDb`(GameData/story)
- `encounterDb`(GameData/encounters)

**출력**
- `renderModel`: { title, text, choices[] }
- 선택 적용 후 다음 상태:
  - 스토리 계속 → `STORY`
  - 전투 트리거 → `COMBAT`
  - 엔딩 노드 → `SURVIVAL_CHECK`

### 10.2 Story Flow 준수
- “메인 진행 → 선택지 → 랜덤 인카운트 → 상황 형성 → 진행”을 반복한다.
- 엔딩에 도달하면 App Flow의 엔딩 처리로 합류한다.

---

## 11. 저장/로드(Cloud Save) 정책

### 11.1 저장 대상
- `Users/{uid}.currentRun` : 런 진행
- `Users/{uid}.totalGoldEarned`, `highestStage` : 계정 메타

### 11.2 자동 저장 트리거(권장)
- 전투 종료 시점(승리/패배) 또는 보상 획득 직후에 `currentRun`을 업데이트

### 11.3 복구 규칙
- 로그인 후 `Users/{uid}`를 로드한다.
- `currentRun.isActive == true`이면 런 진행을 복원하고, 적절한 화면으로 복귀한다.

---

## 12. 랭킹/보상 지급(엔딩 루프)
- 사망 엔딩: 계정 재화 지급 후 로비 복귀
- 성공 엔딩: 엔딩(분기) → 랭킹 등록 → 계정 재화 지급 → 로비 복귀

권장 랭킹 저장(예: `Rankings` 컬렉션)
- displayName, endingId, stage, timestamp, (선택) seed

---

## 13. UI/화면 구성(최소 세트)
- 로그인 화면: “구글로 시작하기”
- 로비: 강화 진입, 런 시작, 유저 메타 표시
- 직업/캐릭터 선택: `GameData/classes` 기반 카드
- 프롤로그/스토리 화면: 본문 + 선택지 버튼
- 전투 화면: 덱(가방의 기물) 표시 + 룰렛 결과 + 로그
- 엔딩/보상: 엔딩 텍스트 + 랭킹(성공 시) + 지급 결과

---

## 14. 개발 로드맵(Phase)

### Phase 1: 로그인 + Users 초기 생성
- Firebase SDK 추가
- Auth 연동, `Users/{uid}` 없으면 초기 생성

### Phase 2: Data‑Driven(GameData) 로드
- Firestore에 `GameData/config/classes/symbols` 구축
- 로그인 직후 GameData 로드/캐싱 후 런 시작 버튼 활성화

### Phase 3: 전투 엔진 + UI 이식
- `combat-engine.js`로 룰렛/계산 로직 구현
- 아이콘 경로 기반 `<img>` 렌더 전환

### Phase 4: Cloud Save/Load
- 전투 종료/보상 직후 autosave
- `isActive` 기반 복구

### Phase 5: 게임오버/메타/배포
- 사망 시 isActive false
- 메타 스탯 업데이트
- Firebase Hosting 배포

---

## 15. 완료 기준(Definition of Done)

### 15.1 App Flow DoD
- 로그인 → 로비(강화 왕복) → 런 → 엔딩/사망 → 보상 → 로비 복귀가 1바퀴 돈다.

### 15.2 Combat Flow DoD
- 전투 1회가 “체크 → 스핀 → 계산 → 적 공격 → 승패 → 종료”로 동작한다.

### 15.3 Story Flow DoD
- 선택지 기반으로 진행이 반복되며, 전투 진입/복귀가 연결된다.
- 엔딩 도달 시 엔딩 처리로 합류한다.

### 15.4 Data‑Driven DoD
- config/classes/symbols 변경이 코드 수정 없이 게임에 반영된다.

### 15.5 Save/Load DoD
- 전투 종료/보상 직후 저장이 동작한다.
- 새로고침 후 로그인하면 런이 복구된다.

---

## 부록 A. 권장 디렉터리 구조
```text
my-rpg-game/
├── public/
│   ├── index.html
│   ├── assets/
│   │   ├── images/
│   │   │   ├── items/
│   │   │   ├── monsters/
│   │   │   └── ui/
│   │   └── sounds/
│   └── js/
│       ├── app.js
│       ├── firebase-init.js
│       ├── db-manager.js
│       ├── game-state.js
│       ├── combat-engine.js
│       ├── story-engine.js
│       └── ui-renderer.js
├── firebase.json
└── .gitignore
```
