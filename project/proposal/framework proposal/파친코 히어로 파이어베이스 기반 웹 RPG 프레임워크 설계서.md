
본 문서는 단일 HTML 파일로 구성되었던 '친코 히어로(가제)'의 프로토타입 코드를 클라우드 데이터 기반(Data-Driven)의 상용 웹 게임 구조로 분리하고 확장하기 위한 마스터플랜입니다.

## 1. 아키텍처 개요 (Architecture Overview)

- **프론트엔드:** HTML5, TailwindCSS, Vanilla JavaScript (ES6 Modules)
    
- **백엔드 & 호스팅:** Firebase (Auth, Firestore, Hosting)
    
- **에셋 파이프라인:** 초기 프로토타입은 이모지(Emoji)를 활용하고, 이후 정식 그래픽(WebP 등)을 `public/assets` 폴더에 배치하여 Firebase Hosting의 글로벌 CDN으로 초고속 서빙한다.
    
- **핵심 목표:** 1. 게임의 밸런스 데이터(무기 데미지, 적 체력 등) 및 이미지 경로를 하드코딩하지 않고 DB에서 실시간으로 불러온다.
    
    2. 유저의 진행 상황(덱, 골드, 스테이지)을 클라우드에 실시간 저장하여 이탈 방지 및 크로스 플랫폼 플레이를 지원한다.

## 2. Firestore 데이터베이스 스키마 (Database Schema)

파이어베이스의 NoSQL 데이터베이스인 Firestore를 활용하여 데이터를 두 개의 큰 기둥으로 나눕니다.

### 2.1. `GameData` 컬렉션 (게임 밸런스 데이터 - 읽기 전용)

게임 실행 시 한 번만 로드하여 메모리에 캐싱합니다. (아이콘은 이미지 경로로 관리)

- **문서: `config`** (전역 설정)
    
    ```
    {
      "startHp": 80,
      "startGold": 100,
      "bagCapacity": 20,
      "rerollCost": 25,
      "armorConstant": 15
    }
    ```
    
- **문서: `classes`** (직업 정보)
    
    ```
    {
      "warrior": { "name": "전사", "icon": "/assets/images/classes/warrior.webp", "weapons": ["sword", "mace", "hammer"] },
      "archer": { "name": "궁수", "icon": "/assets/images/classes/archer.webp", "weapons": ["bow", "crossbow"] }
    }
    ```
    
- **문서: `symbols`** (기존 SYMBOL_DB 대체 - 아이템 데이터)
    
    ```
    {
      "sword": { "name": "낡은 검", "type": "attack", "value": 4, "rarity": 1, "classTag": "sword", "icon": "/assets/images/items/sword.webp" },
      "potion": { "name": "포션", "type": "heal", "value": 2, "rarity": 2, "classTag": "potion", "icon": "/assets/images/items/potion.webp" }
    }
    ```
    

### 2.2. `Users` 컬렉션 (유저 세이브 데이터 - 읽기/쓰기)

유저의 고유 UID를 문서 ID로 사용합니다. (예: `Users/uid_12345`)

- **문서: `{uid}`** (유저 프로필 및 현재 세이브)
    
    ```
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
        "deck": ["empty", "empty", "empty", "empty", "sword", "shield", "potion"]
      }
    }
    ```
    

### 2.3. 데이터 관리 파이프라인 (Google Sheets ➔ AI ➔ Firestore)

기획(밸런스) 데이터를 일일이 코드로 치는 것은 비효율적이므로, **구글 스프레드시트와 AI를 결합한 파이프라인**을 구축합니다.

1. **기획 및 밸런싱:** 구글 스프레드시트에 아이템 이름, 데미지, 이미지 파일 경로(`/assets/...`), 타입 등을 엑셀 표 형태로 정리합니다.
    
2. **AI 변환 요청 (프롬프트 예시):**
    
    > "다음은 우리 게임의 아이템 밸런스 테이블(구글 시트 복사본)이야. 이 데이터를 내가 Firestore `GameData/symbols` 문서에 그대로 복사해 넣을 수 있도록, Key(영어 ID)를 기준으로 하는 JSON 객체 형태로 변환해 줘."
    
3. **DB 업데이트:** AI가 만들어준 JSON 텍스트를 복사하여 Firestore 콘솔에 그대로 붙여넣습니다. 코드를 단 한 줄도 수정하지 않고 게임 밸런스 및 이미지 교체 패치가 완료됩니다.
    

## 3. 프로젝트 폴더 구조 및 에셋 관리 (Directory & Assets)

Git 버전 관리와 Firebase Hosting 배포를 원활하게 하기 위해 아래와 같은 폴더 구조를 사용합니다.

```
my-rpg-game/                👈 Git으로 버전 관리하는 최상위 폴더
│
├── public/                 👈 Firebase Hosting으로 전 세계에 배포될 폴더
│   ├── index.html
│   ├── assets/             👈 게임 내 이미지 및 사운드 등 에셋 보관
│   │   ├── images/
│   │   │   ├── items/      (sword.webp, potion.webp 등)
│   │   │   ├── monsters/   (slime.webp 등)
│   │   │   └── ui/
│   │   └── sounds/
│   └── js/                 👈 프론트엔드 모듈 스크립트
│       ├── app.js
│       └── ...
│
├── .gitignore              👈 Git 업로드에서 제외할 파일 목록 (.firebase 등)
└── firebase.json           👈 Firebase 프로젝트 설정 파일
```

## 4. 프론트엔드 모듈 분할 구조 (Module Structure)

기존의 방대한 코드를 역할에 따라 여러 개의 `.js` 파일로 쪼개어 유지보수성을 극대화합니다.

|   |   |
|---|---|
|**파일명**|**주요 역할 및 포함될 함수**|
|`index.html`|UI 레이아웃, 모달 창, Firebase 및 스크립트 로드|
|`js/firebase-init.js`|Firebase SDK 초기화, 구글 로그인/로그아웃 로직 (`signInWithPopup`)|
|`js/db-manager.js`|Firestore 데이터 Fetch (GameData 로드), 세이브/로드 (CurrentRun 업데이트)|
|`js/game-state.js`|현재 게임의 상태 변수(`state`) 관리, 데이터 업데이트 전파|
|`js/combat-engine.js`|룰렛 회전(`spin`), 시너지 계산, 웨이트(Weight/Sticky) 확률 로직, 데미지 공식|
|`js/ui-renderer.js`|체력바 업데이트, `<img src="...">` 기반 이미지 렌더링, 모달 처리, 그리드 렌더링|
|`js/app.js`|메인 컨트롤러. 위 모듈들을 조립하여 게임 시작 및 이벤트 리스너 등록|

## 5. 단계별 개발 로드맵 (Development Roadmap)

AI(Vibe Coding)를 활용하여 가장 빠르고 안전하게 개발하기 위한 순서입니다. 각 페이즈마다 AI에게 명확한 프롬프트를 주어 코드를 생성합니다.

### 🔴 Phase 1: 로그인 및 클라우드 연동 기초

1. 프로젝트 폴더(위 3번 구조)를 생성하고 Firebase SDK(v11+) 추가.
    
2. `firebase-init.js` 작성: 화면 중앙에 '구글로 시작하기' 버튼 생성 및 Auth 연동.
    
3. 로그인 성공 시, Firestore의 `Users` 컬렉션에 해당 유저의 문서가 없으면 초기 데이터를 생성하는 로직 구현.
    

### 🟠 Phase 2: 데이터 주도형(Data-Driven) 구조 세팅 (시트 활용)

1. 구글 스프레드시트를 열고 게임의 아이템(`symbols`), 직업(`classes`), 설정(`config`) 표를 작성 (이모지 대신 `/assets/...` 이미지 경로 기입).
    
2. 표를 복사해 AI에게 건네주고 **"Firestore에 붙여넣을 JSON 형식으로 바꿔줘"**라고 지시.
    
3. AI가 뽑아준 JSON을 Firestore 콘솔에 붙여넣어 `GameData` 컬렉션을 완성.
    
4. `db-manager.js` 작성: 로그인 직후 `GameData`를 다운로드하여 게임 내 전역 변수로 저장하고, 완료 시 '게임 시작' 버튼을 활성화.
    

### 🟡 Phase 3: 게임 엔진 및 UI 이식 (가장 큰 작업)

1. 기존 프로토타입 코드에서 UI 레이아웃(`index.html`)을 그대로 가져옴.
    
2. `combat-engine.js`에 기존의 룰렛 로직(`getWeightedSymbolFromDeck`, `spin`, `calculateAndVisualize`) 이식.
    
3. **UI 렌더링 수정:** 기존 이모지 텍스트 출력 방식에서, JSON에서 받아온 `icon` 경로를 활용해 `<img src="...">` 태그를 생성하는 방식으로 업데이트.
    

### 🟢 Phase 4: 클라우드 세이브/로드 구현 (Persistence)

1. 전투가 끝날 때마다(적 처치 시), 또는 보상 획득 직후 `state.player`와 `state.deck` 정보를 `Users/{uid}` 문서의 `currentRun` 필드에 자동 저장(Auto-save).
    
2. 유저가 새로고침하거나 폰에서 접속했을 때, `currentRun.isActive`가 `true`라면 직업 선택 창을 띄우지 않고 바로 해당 스테이지와 덱 정보를 로드하여 화면을 복구.
    

### 🔵 Phase 5: 게임오버 및 메타 프로그레션

1. 유저 체력이 0이 되면 `currentRun.isActive`를 `false`로 변경.
    
2. 게임오버 시 이번 런에서 얻은 데이터(도달 스테이지 등)를 기반으로 `Users/{uid}`의 영구 스탯(`totalGoldEarned` 등)을 업데이트.
    
3. `firebase deploy` 명령어로 최종 버전을 호스팅에 배포.