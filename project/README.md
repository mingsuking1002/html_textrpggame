# PachinkoHero Web RPG

Firebase Hosting 기준 정적 웹 앱입니다. 현재 구현 범위는 `SPEC_Phase1_AuthAndDataLoad`부터 `SPEC_Phase13_QualityAndExtensibility`까지입니다.

## 실행

`project/`를 기준으로 정적 서버 또는 Firebase Hosting 미리보기로 `public/`을 서빙합니다.

- Firebase Hosting: `firebase serve --only hosting`
- 기타 정적 서버: `public/index.html`이 루트가 되도록 실행

## 현재 포함 기능

- Firebase Web SDK(v11 import map) 초기화
- Google Auth 팝업 로그인 / 로그아웃
- `GameData/config`, `classes`, `symbols`, `monsters`, `encounters`, `story`, `endings` 병렬 로드 및 메모리 캐시
- `Users/{uid}` 최초 로그인 문서 생성
- 로비 -> 강화 -> 직업 선택 -> 프롤로그 -> 스토리/전투 반복 -> 엔딩 -> 랭킹/정산 -> 로비 앱 루프
- `Users/{uid}.upgrades`, `crystals` 기반 영구 강화 상점
- 강화 구매 직후 Firestore merge write + 실패 시 in-memory 롤백
- 강화 보너스(시작 HP/골드/가방 용량)가 새 런 생성 시 반영
- 스토리 노드/선택지/조건/효과/상점 처리
- 전투 화면 렌더, 룰렛 스핀 preview/확정/리롤, 순수 전투 엔진, 전투 로그 상한(500), 전리품 드랍
- 타입 기반 시너지(`config.synergies`) 계산 + 전투 로그/토스트 반영
- 전투 라운드 연출: 스핀 슬롯 공개, 데미지/회복 숫자 팝업, 적 HP 바 흔들림
- `Users/{uid}.currentRun` Auto-save
- 저장 트리거: 직업 선택 시작 직후, 스토리 선택지 적용 직후, 상점 구매 직후, 전투 진입 직후, 전투 라운드 종료 직후, 전투 종료 직후, 엔딩 진입 직후
- 로그인 시 활성 런 복구
- 전투 중 저장본은 `currentRun.combatContext` 기반으로 COMBAT 화면까지 복구
- Firestore 저장 실패 시 `localStorage` currentRun 백업 저장, 사용자 로드 실패 시 오프라인 백업 복구 시도
- 엔딩 보상 계산, `currentRun.isActive=false` 런 종료 저장, `totalGoldEarned` / `highestStage` / `crystals` 메타 반영
- 성공 엔딩 시 `Rankings` 컬렉션 등록 및 상위 10위 조회
- BGM/SFX 재생, 전역 볼륨 슬라이더, 음소거 토글 (`localStorage` 유지)
- 이미지 placeholder 36개(.webp), 사운드 placeholder 11개(.wav) 포함
- `firestore.rules`, `.firebaserc`, `node scripts/validate-gamedata.js` 포함
- GameData 확장: 직업 3종, 기물 15종, 몬스터 10종, 인카운트 12종, 스토리 노드 21개, 엔딩 5종

## 남아 있는 운영 이슈

- `node scripts/upload-gamedata.js`는 Firestore REST API 업로드 스크립트이므로 실제 반영에는 네트워크/프로젝트 권한이 필요합니다.
- `firebase deploy --only firestore:rules`로 Firestore Rules를 별도 배포해야 보안 규칙이 반영됩니다.
- 랭킹 조회는 `orderBy("payout", "desc").limit(10)` 쿼리를 사용하므로 Firestore 인덱스가 필요할 수 있습니다.
- 전투/정산/강화 구매 로직은 클라이언트 구현이므로 실서비스에서는 Firestore Rules 또는 서버 검증이 추가되어야 합니다.

## 확인 포인트

- 첫 방문 시 boot 후 auth 화면이 노출되는지 확인
- 로그인 성공 후 GameData 로드가 끝나면 로비 또는 활성 런 화면으로 이동하는지 확인
- 활성 런이 있을 때 로그인 직후 `currentNodeId` 기준으로 복구되는지 확인
- 강화 화면에서 결정 차감/강화 레벨 증가/세이브 롤백이 정상 동작하는지 확인
- 스토리에서 combat 인카운트가 발생하면 전투 화면으로 전환되는지 확인
- 룰렛 스핀 후 preview 결과가 보이고, 리롤/결과 확정/시너지 로그가 정상 동작하는지 확인
- 슬롯 공개/데미지 숫자/HP 바 연출과 500개 로그 상한이 정상 동작하는지 확인
- 전투 승리 후 골드/전리품이 반영되고 `afterEncounter` 또는 `onWin` 노드로 이동하는지 확인
- 전투 라운드 직후와 상점 구매 직후에 Firestore `Users/{uid}.currentRun`이 갱신되는지 확인
- 새로고침 후 전투 진행 중이던 런은 COMBAT 화면과 적 HP 상태까지 복구되는지 확인
- 오프라인 상태 저장 후 재접속 시 localStorage 백업 복구가 동작하는지 확인
- 로비/전투/엔딩에서 BGM 교체, SFX 재생, 볼륨 슬라이더/음소거 토글 유지 여부 확인
- 엔딩 화면에서 정산 후 `Users/{uid}.currentRun.isActive=false`, `totalGoldEarned`, `highestStage`, `crystals`가 갱신되는지 확인
- 성공 엔딩 시 `Rankings` 컬렉션 문서 생성과 상위 10위 표시가 되는지 확인
