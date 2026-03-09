# PachinkoHero Web RPG

Firebase Hosting 기준 정적 웹 앱입니다. 현재 구현 범위는 `SPEC_Phase1_AuthAndDataLoad`의 `BOOT -> AUTH -> LOBBY` 구간입니다.

## 실행

`project/`를 기준으로 정적 서버 또는 Firebase Hosting 미리보기로 `public/`을 서빙합니다.

- Firebase Hosting: `firebase serve --only hosting`
- 기타 정적 서버: `public/index.html`이 루트가 되도록 실행

## Phase 1 포함 기능

- Firebase Web SDK(v11 import map) 초기화
- Google Auth 팝업 로그인 / 로그아웃
- `GameData/config`, `classes`, `symbols`, `monsters`, `encounters`, `story`, `endings` 병렬 로드 및 메모리 캐시
- `Users/{uid}` 최초 로그인 문서 생성
- 새로고침 시 `onAuthStateChanged` 기반 인증 복구 후 자동 로비 진입
- 로딩 실패, 팝업 차단, 재시도 토스트/상태 메시지

## 확인 포인트

- 첫 방문 시 boot 후 auth 화면이 노출되는지 확인
- 로그인 성공 후 auth 상태 문구가 `게임 데이터 로딩 중...`으로 바뀌는지 확인
- 로비에서 닉네임, UID, `totalGoldEarned`, `highestStage`, `crystals`가 보이는지 확인
- 로그아웃 후 auth 화면으로 돌아오는지 확인
- Firestore에 `Users/{uid}` 문서가 없을 때 초기 스키마가 생성되는지 확인
- 브라우저 콘솔에 `[db-manager] GameData cache ready` 로그가 출력되는지 확인
