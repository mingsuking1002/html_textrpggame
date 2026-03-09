# 🟢 완료

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 로비 → 런 → 스토리/전투 반복 → **엔딩 → 랭킹 → 재화 지급 → 로비**
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 이야기 진행 → 반복 → **엔딩**

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 5 — 엔딩 + 메타 프로그레션 + 랭킹 + 배포`

* **Goal (유저 가치):** 플레이어가 엔딩에 도달하면 결과 화면을 보고, 재화를 받고, 성공 엔딩이면 랭킹에 등록된 뒤 로비로 돌아가 다음 런을 시작할 수 있다.

* **Non-Goals:**
  - 강화(Upgrade) 시스템 (별도 Phase)
  - 시즌 랭킹 (기본 단일 랭킹)
  - 멀티플레이어

* **Scope in Loop:** App Loop의 `SURVIVAL_CHECK → ENDING → RANKING → PAYOUT → LOBBY`

* **Target Files:**
  - `public/js/app.js` — 엔딩 진입 분기 + RANKING + PAYOUT + LOBBY 복귀 흐름
  - `public/js/ui-renderer.js` — 엔딩 화면 렌더 + 랭킹 표시 + 보상 표시
  - `public/js/db-manager.js` — 메타 스탯 업데이트 + 랭킹 등록 + currentRun 초기화
  - `public/js/game-state.js` — 변경 최소 (combatState 정리)
  - `public/index.html` — 엔딩 화면 구조 보강 (엔딩 타입별 UI, 랭킹 리스트, 보상 요약)

* **Firestore Reads/Writes:**
  - Reads:
    - `state.gameData.endings` — 엔딩 정보 (캐시)
    - `Rankings` 컬렉션 — 상위 랭킹 표시용 (선택)
  - Writes:
    - `Users/{uid}.currentRun` → `{ isActive: false }`
    - `Users/{uid}.totalGoldEarned` += 런 획득 골드 × payoutMultiplier
    - `Users/{uid}.highestStage` = max(기존, 현재 stage)
    - `Rankings` 컬렉션 — 성공 엔딩 + isRankable일 때 등록

* **State Model:**
  - `uiState.screen` 전이:
    - `STORY` (ending 노드) → `SURVIVAL_CHECK`
    - `COMBAT` (HP 0) → `SURVIVAL_CHECK`
    - `SURVIVAL_CHECK`:
      - 사망 → `ENDING_DEATH`
      - 성공 → `ENDING_SUCCESS`
    - `ENDING_*` → (확인 버튼) → `RANKING` (isRankable인 경우) 또는 `PAYOUT`
    - `RANKING` → `PAYOUT`
    - `PAYOUT` → `LOBBY`
  - 엔딩 결과 데이터:
    ```json
    {
      "endingId": "ending_dragon_slayer",
      "endingData": { ...GameData/endings 참조 },
      "totalGoldThisRun": 450,
      "payout": 900,
      "stageReached": 5,
      "isRankable": true
    }
    ```

* **UI Flow:**
  ```
  [screen-ending] — ENDING_DEATH
    - 엔딩 아이콘/이미지
    - 엔딩 타이틀: "여정의 끝"
    - 엔딩 텍스트
    - 보상 요약: "획득 골드: 450 × 0.5 = 225"
    - [로비로 돌아가기] 버튼

  [screen-ending] — ENDING_SUCCESS
    - 엔딩 아이콘/이미지
    - 엔딩 타이틀: "용을 무찌른 자"
    - 엔딩 텍스트
    - 보상 요약: "획득 골드: 450 × 2.0 = 900"
    - 보너스 보상: "+500 골드"
    - [랭킹 등록] → 랭킹 화면
    - [로비로 돌아가기] 버튼

  [screen-ending] — RANKING (isRankable인 경우)
    - "랭킹에 등록되었습니다!"
    - 간단한 랭킹 리스트 (상위 10명)
    - [로비로 돌아가기] 버튼

  [screen-ending] — PAYOUT
    - 보상 지급 결과 요약
    - 도달 스테이지, 최고 기록 갱신 여부
    - [로비로 돌아가기] 버튼
  ```

* **Algorithm (의사코드):**
  ```
  enterSurvivalCheck():
    if currentRun.hp <= 0:
      endingId = "ending_death"
    else:
      endingId = storyNode.endingId     // ending 노드에서 결정
    endingData = gameData.endings[endingId]
    payout = currentRun.gold * endingData.payoutMultiplier + (endingData.bonusRewards?.gold || 0)
    renderEnding(endingData, payout)
    transitionTo(endingData.type == "death" ? ENDING_DEATH : ENDING_SUCCESS)

  onEndingConfirm():
    // 메타 업데이트
    user.totalGoldEarned += payout
    user.highestStage = max(user.highestStage, currentRun.stage)
    currentRun.isActive = false
    await saveCurrentRun(uid, currentRun)
    await saveUserMeta(uid, { totalGoldEarned, highestStage })

    if endingData.isRankable:
      await submitRanking({ uid, displayName, endingId, stage, payout, timestamp })
      transitionTo(RANKING)
    else:
      transitionTo(PAYOUT) → LOBBY
  ```

* **Edge Cases:**
  - requiredFlags 불일치 → 기본 사망 엔딩(ending_death)으로 폴백
  - 랭킹 등록 실패 → 토스트 경고만 (보상은 정상 지급)
  - 메타 스탯 저장 실패 → 토스트 + 재시도 버튼
  - 엔딩 도달 후 새로고침 → currentRun.isActive=false로 저장 되었으므로 로비로 이동
  - payoutMultiplier가 0인 경우 → 보상 없음 표시
  - bonusRewards가 없는 엔딩 → 기본 payout만

* **Persistence:**
  - `currentRun.isActive = false` → Firestore에 저장 (런 종료 확정)
  - 메타 스탯은 `Users/{uid}`에 merge write
  - 랭킹은 `Rankings` 컬렉션에 addDoc

* **Testing Checklist:**
  1. □ 스토리 ending 노드 도달 → 엔딩 화면 전환?
  2. □ 전투 HP 0 → 사망 엔딩 화면 표시?
  3. □ 사망 엔딩: payoutMultiplier 0.5 적용된 보상 계산?
  4. □ 성공 엔딩: payoutMultiplier + bonusRewards 정확?
  5. □ 랭킹 등록 (isRankable=true) → Rankings 컬렉션에 문서 생성?
  6. □ 랭킹 등록 후 상위 10명 리스트 표시?
  7. □ "로비로 돌아가기" → 로비 화면 + 메타 정보 업데이트 반영?
  8. □ Firestore에 currentRun.isActive=false 저장 확인?
  9. □ totalGoldEarned, highestStage 업데이트 확인?
  10. □ 엔딩 후 새로고침 → 로비(런 복구 아님) 확인?

* **주의/최적화 포인트:**
  - 엔딩 화면에서 메타 저장 + 랭킹 등록을 **순차 처리** (병렬 시 일부 실패 처리 복잡)
  - innerHTML 금지 — 엔딩 텍스트는 textContent
  - 보상 계산은 순수 함수로 분리 (테스트 가능)
  - 랭킹 쿼리는 `orderBy("payout", "desc").limit(10)` — 인덱스 필요
  - `firebase deploy`로 최종 배포 시 Firestore Rules 업데이트 필요 (테스트 모드 종료)
