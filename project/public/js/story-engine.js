/**
 * story-engine.js
 * ───────────────
 * 스토리 노드/선택지 엔진 (데이터 기반, 하드코딩 금지)
 *
 * Canonical Story Loop:
 *   메인 진행 → 선택지 분기 → 랜덤 인카운트 → 상황 형성 → 진행 → 반복 → 엔딩
 *
 * 입력: currentNodeId, storyDb, encounterDb
 * 출력: { renderModel: { title, text, choices[] }, nextState }
 */

// TODO: Phase 3 이후 구현

/**
 * 스토리 노드 로드 및 렌더 모델 생성
 * @param {string} nodeId
 * @param {object} storyData - GameData/story
 * @returns {object} renderModel
 */
export function loadNode(nodeId, storyData) {
    // TODO: 노드 데이터 → renderModel 변환
}

/**
 * 선택지 적용 (조건 판정 + 효과 적용)
 * @param {object} choice - 선택된 choices[] 항목
 * @param {object} playerState
 * @returns {object} { nextNodeId, updatedState }
 */
export function applyChoice(choice, playerState) {
    // TODO: 조건(conditions) 검증 + 효과(effects) 적용
}

/**
 * 랜덤 인카운트 뽑기 (가중치 기반)
 * @param {Array} encounterPool - encounter ID 배열
 * @param {object} encountersData - GameData/encounters
 * @param {object} playerState
 * @returns {object|null} 선택된 encounter
 */
export function rollEncounter(encounterPool, encountersData, playerState) {
    // TODO: 가중치 + 조건 기반 인카운트 선택
}

/**
 * 엔딩 조건 판정
 * @param {object} endingsData - GameData/endings
 * @param {object} playerState
 * @returns {string|null} 도달한 endingId 또는 null
 */
export function checkEnding(endingsData, playerState) {
    // TODO: 플래그 기반 엔딩 판정
}
