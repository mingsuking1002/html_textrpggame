/**
 * combat-engine.js
 * ────────────────
 * 룰렛 기반 전투 엔진 (순수 로직, DOM 접근 금지)
 *
 * Canonical Combat Loop:
 *   전투 시작 → 가방(덱) 기물 체크 → 룰렛 스핀
 *   → 결과값 계산 → 적 공격 → 승패 판정 → 전투 종료
 *
 * 입력: state.player, state.deck, enemy, config, rngSeed
 * 출력: { result, delta, logs, spinDetail }
 */

// TODO: Phase 3에서 구현

/**
 * 룰렛 스핀 실행
 * @param {Array} deck - 가방의 기물 배열
 * @param {object} symbolsData - GameData/symbols
 * @returns {object} spinResult
 */
export function spin(deck, symbolsData) {
    // TODO: 가중치 기반 스핀 로직
}

/**
 * 전투 1라운드 실행
 * @param {object} params - { player, deck, enemy, config }
 * @returns {object} { result: 'win'|'lose', delta, logs, spinDetail }
 */
export function executeCombatRound(params) {
    // TODO: 전투 루프 1회 처리
}

/**
 * 데미지 계산 (순수 함수)
 * @param {number} attack
 * @param {number} defense
 * @param {number} armorConstant - config.armorConstant
 * @returns {number}
 */
export function calculateDamage(attack, defense, armorConstant) {
    // TODO: 데미지 공식
    return Math.max(1, attack - (defense * armorConstant / (defense + armorConstant)));
}
