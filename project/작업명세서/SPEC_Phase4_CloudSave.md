# 🟡 대기중

---

> **플로우 요약 (설계서 기준)**
> - **앱 루프**: 로비 → 런 → 스토리/전투 반복 → 엔딩 → 재화 지급 → 로비
> - **전투 루프**: 가방 기물 체크 → 룰렛 스핀 → 결과 계산 → 적 공격 → 승패 판정
> - **스토리 루프**: 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 이야기 진행 → 반복 → 엔딩

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 4 — Cloud Save + 런 복구`

* **Goal (유저 가치):** 플레이어가 전투/보상/선택지 직후 자동 저장되어 새로고침이나 기기 변경 시에도 런 진행이 복구된다.

* **Non-Goals:**
  - 엔딩 화면 / 재화 지급 / 랭킹 (Phase 5)
  - localStorage 임시 백업 (선택적 확장)

* **Scope in Loop:** App Loop 전체 (저장/복구), Combat Loop/Story Loop의 저장 트리거

* **Target Files:**
  - `public/js/db-manager.js` — `saveCurrentRun()` 호출 시점 정리 + `saveUserMeta()` 추가
  - `public/js/app.js` — Auto-save 트리거 삽입 + 로그인 시 런 복구 로직
  - `public/js/game-state.js` — 변경 없음 (currentRun 구조는 Phase 2에서 확정)
  - `public/js/ui-renderer.js` — 저장 인디케이터(토스트) + 복구 안내 UI

* **Firestore Reads/Writes:**
  - Reads:
    - `Users/{uid}` — 로그인 시 1회 (이미 구현됨)
  - Writes:
    - `Users/{uid}.currentRun` — Auto-save (전투 종료, 보상 획득, 선택지 적용 직후)
    - `Users/{uid}` 메타 필드 — 런 종료 시 (totalGoldEarned, highestStage 갱신)

* **State Model:**
  - 런 복구 흐름 (로그인 직후):
    - `Users/{uid}.currentRun.isActive == true` → `currentNodeId`에 해당하는 화면으로 복구
    - `isActive == false` → `LOBBY`
  - Auto-save 트리거 시점:
    1. 전투 종료 직후 (승리/패배 불문)
    2. 보상 획득 직후 (인카운트 reward, loot 드랍)
    3. 스토리 선택지 적용 직후
    4. 상점 구매 직후

* **UI Flow:**
  ```
  Auto-save 발생 시:
    → 우하단 토스트: "💾 저장 완료" (success, 2초)
    → 실패 시: "⚠️ 저장에 실패했습니다. 네트워크를 확인해 주세요." (error)

  런 복구 시 (로그인 직후):
    → "이전 런이 감지되었습니다. 이어서 진행합니다." 토스트
    → currentRun.currentNodeId 기반으로 적절한 화면 복구:
      - story 노드 → STORY
      - combat 진행 중 → STORY (afterEncounter, 전투 상태 복구는 복잡하므로 스토리로 복귀)
  ```

* **Algorithm (의사코드):**
  ```
  autoSave():
    try:
      await saveCurrentRun(uid, currentRun)
      showToast("저장 완료", "success")
    catch:
      showToast("저장 실패. 네트워크 확인 필요", "error")

  onAuthReady(user):
    userData = await loadUserData(user)
    if userData.currentRun.isActive:
      setState({ currentRun: userData.currentRun })
      showToast("이전 런 복구 중...")
      renderStoryNode(currentRun.currentNodeId)
      transitionTo(STORY)
    else:
      transitionTo(LOBBY)
  ```

* **Edge Cases:**
  - Auto-save 실패 시 → 토스트 경고만 (게임 중단하지 않음), 다음 트리거에서 재시도
  - 연속 Auto-save 요청 (빠른 선택지 클릭) → debounce 300ms
  - 새로고침 중 Firestore write 미완료 → 마지막 성공 저장본으로 복구
  - currentRun.currentNodeId가 스토리 데이터에 없는 경우 → 에러 토스트 + 런 초기화 + 로비
  - 전투 중 새로고침 → 전투 상태는 복구하지 않고 afterEncounter 노드로 복구 (전투 재시작 아님)

* **Persistence:**
  - 저장 대상: `Users/{uid}.currentRun` 전체 (isActive, classId, stage, hp, gold, deck, flags, currentNodeId, encounterHistory)
  - 실패 시: 토스트 경고 + 콘솔 에러 로그
  - (선택적 확장) localStorage에 마지막 성공 저장 시점 기록

* **Testing Checklist:**
  1. □ 전투 종료 후 Auto-save 토스트 → Firestore에 currentRun 업데이트 확인?
  2. □ 스토리 선택지 적용 후 Auto-save 동작?
  3. □ 상점 구매 후 Auto-save 동작?
  4. □ 새로고침 → 로그인 → 이전 런이 있으면 스토리 화면 복구?
  5. □ 복구 후 currentRun 상태(hp, gold, deck, flags 등) 정확?
  6. □ isActive=false 상태에서 새로고침 → 로비로 이동?
  7. □ 네트워크 끊김 상태에서 Auto-save 실패 → 에러 토스트?
  8. □ 빠른 연속 선택지 클릭 → debounce로 중복 저장 방지?

* **주의/최적화 포인트:**
  - Auto-save는 **debounce** 적용 (300ms) — 연속 호출 방지
  - `setDoc({ merge: true })` 사용 — 전체 문서 덮어쓰기 방지
  - 전투 도중 복구: 전투 재개가 아닌 afterEncounter로 복귀 (복잡도 관리)
  - 저장 실패를 이유로 게임 플레이를 차단하지 않는다 (UX 우선)
