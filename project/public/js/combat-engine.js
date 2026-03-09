/**
 * combat-engine.js
 * ────────────────
 * 룰렛 기반 전투 엔진 (순수 로직, DOM 접근 금지)
 */

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomIntInRange(min, max, randomFn = Math.random) {
  const lower = Math.min(toFiniteNumber(min, 0), toFiniteNumber(max, 0));
  const upper = Math.max(toFiniteNumber(min, 0), toFiniteNumber(max, 0));
  return Math.floor(randomFn() * (upper - lower + 1)) + lower;
}

function getFilledDeck(deck) {
  return Array.isArray(deck) ? deck.filter((symbolId) => symbolId && symbolId !== 'empty') : [];
}

function buildSpinEntry(symbolId, symbolsData) {
  const symbol = symbolsData?.[symbolId] || {};

  return {
    symbolId,
    name: symbol.name || symbolId,
    type: symbol.type || 'empty',
    value: Math.max(0, toFiniteNumber(symbol.value, 0)),
    icon: symbol.icon || '',
  };
}

function createEvent(type, message, extra = {}) {
  return {
    type,
    message,
    ...extra,
  };
}

function addSymbolToDeck(deck, symbolId) {
  const nextDeck = Array.isArray(deck) ? [...deck] : [];
  const emptyIndex = nextDeck.indexOf('empty');

  if (emptyIndex < 0) {
    return {
      deck: nextDeck,
      added: false,
      slotIndex: -1,
    };
  }

  nextDeck[emptyIndex] = symbolId;

  return {
    deck: nextDeck,
    added: true,
    slotIndex: emptyIndex,
  };
}

function applyMonsterRewards(enemy, playerState, randomFn = Math.random) {
  const nextPlayer = {
    ...cloneData(playerState),
    deck: Array.isArray(playerState?.deck) ? [...playerState.deck] : [],
  };
  const rewardSummary = {
    gold: 0,
    addedSymbols: [],
    skippedSymbols: [],
    exp: Math.max(0, toFiniteNumber(enemy?.expReward, 0)),
  };
  const events = [];

  if (Array.isArray(enemy?.goldReward) && enemy.goldReward.length >= 2) {
    rewardSummary.gold = randomIntInRange(enemy.goldReward[0], enemy.goldReward[1], randomFn);
    nextPlayer.gold = Math.max(0, toFiniteNumber(nextPlayer.gold, 0) + rewardSummary.gold);
    events.push(createEvent('reward_gold', `골드 +${rewardSummary.gold}`));
  }

  const lootTable = Array.isArray(enemy?.lootTable) ? enemy.lootTable : [];

  lootTable.forEach((lootEntry) => {
    const symbolId = lootEntry?.symbolId;
    const dropRate = Math.max(0, Math.min(1, toFiniteNumber(lootEntry?.dropRate, 0)));

    if (!symbolId || randomFn() > dropRate) {
      return;
    }

    const addResult = addSymbolToDeck(nextPlayer.deck, symbolId);

    if (addResult.added) {
      nextPlayer.deck = addResult.deck;
      rewardSummary.addedSymbols.push(symbolId);
      events.push(createEvent('reward_loot', `${symbolId} 획득`));
      return;
    }

    rewardSummary.skippedSymbols.push(symbolId);
    events.push(createEvent('reward_loot_skipped', `${symbolId} 드랍 실패: 가방이 가득 찼습니다.`));
  });

  return {
    nextPlayer,
    rewardSummary,
    events,
  };
}

export function buildCombatEnemy(monstersData, monsterId) {
  const monster = monstersData?.[monsterId];

  if (!monster) {
    throw new Error(`Missing monster data: ${monsterId}`);
  }

  return {
    id: monsterId,
    ...cloneData(monster),
    hp: Math.max(1, toFiniteNumber(monster.hp, 1)),
    attack: Math.max(0, toFiniteNumber(monster.attack, 0)),
    defense: Math.max(0, toFiniteNumber(monster.defense, 0)),
  };
}

export function createCombatState(enemy, options = {}) {
  const enemySnapshot = cloneData(enemy);
  const restoredLogs = Array.isArray(options.logs) ? options.logs.slice(-500) : [];

  return {
    enemy: enemySnapshot,
    currentEnemyHp: clamp(
      toFiniteNumber(options.currentEnemyHp, enemySnapshot.hp),
      0,
      Math.max(1, toFiniteNumber(enemySnapshot.hp, 1)),
    ),
    turnCount: Math.max(0, toFiniteNumber(options.turnCount, 0)),
    logs: restoredLogs,
    lastSpinResult: options.lastSpinResult ? cloneData(options.lastSpinResult) : null,
    isPlayerTurn: true,
    isResolving: Boolean(options.isResolving),
    resumeNodeId: options.resumeNodeId || null,
    restoreNodeId: options.restoreNodeId || options.resumeNodeId || null,
    victoryNodeId: options.victoryNodeId || null,
    defeatNodeId: options.defeatNodeId || null,
    sourceLabel: options.sourceLabel || enemySnapshot.name || enemySnapshot.id,
  };
}

/**
 * 룰렛 스핀 실행
 * @param {Array} deck - 가방의 기물 배열
 * @param {object} symbolsData - GameData/symbols
 * @param {object} options - { spinCount, randomFn }
 * @returns {object} spinResult
 */
export function spin(deck, symbolsData, options = {}) {
  const filledDeck = getFilledDeck(deck);
  const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
  const desiredSpinCount = Math.max(1, toFiniteNumber(options.spinCount, 5));

  if (filledDeck.length === 0) {
    return {
      entries: [],
      symbolIds: [],
      spinCount: 0,
      totalValue: 0,
      attackTotal: 0,
      healTotal: 0,
      defenseTotal: 0,
    };
  }

  const entries = [];

  for (let index = 0; index < desiredSpinCount; index += 1) {
    const pickIndex = Math.floor(randomFn() * filledDeck.length);
    entries.push(buildSpinEntry(filledDeck[pickIndex], symbolsData));
  }

  return entries.reduce((accumulator, entry) => {
    accumulator.entries.push(entry);
    accumulator.symbolIds.push(entry.symbolId);
    accumulator.totalValue += entry.value;

    if (entry.type === 'attack') {
      accumulator.attackTotal += entry.value;
    }

    if (entry.type === 'heal') {
      accumulator.healTotal += entry.value;
    }

    if (entry.type === 'defense') {
      accumulator.defenseTotal += entry.value;
    }

    return accumulator;
  }, {
    entries: [],
    symbolIds: [],
    spinCount: entries.length,
    totalValue: 0,
    attackTotal: 0,
    healTotal: 0,
    defenseTotal: 0,
  });
}

/**
 * 데미지 계산 (순수 함수)
 * @param {number} attack
 * @param {number} defense
 * @param {number} armorConstant - config.armorConstant
 * @returns {number}
 */
export function calculateDamage(attack, defense, armorConstant) {
  const safeAttack = Math.max(0, toFiniteNumber(attack, 0));
  const safeDefense = Math.max(0, toFiniteNumber(defense, 0));
  const safeArmorConstant = Math.max(0, toFiniteNumber(armorConstant, 15));

  if (safeAttack <= 0) {
    return 0;
  }

  if (safeDefense <= 0 || safeArmorConstant <= 0) {
    return Math.max(1, Math.round(safeAttack));
  }

  const mitigatedDamage = safeAttack - ((safeDefense * safeArmorConstant) / (safeDefense + safeArmorConstant));
  return Math.max(1, Math.round(mitigatedDamage));
}

/**
 * 전투 1라운드 실행
 * @param {object} params - { player, deck, enemy, currentEnemyHp, config, symbolsData, randomFn }
 * @returns {object}
 */
export function executeCombatRound(params = {}) {
  const randomFn = typeof params.randomFn === 'function' ? params.randomFn : Math.random;
  const playerState = cloneData(params.player || {});
  const enemy = cloneData(params.enemy || {});
  const armorConstant = toFiniteNumber(params?.config?.armorConstant, 15);
  const spinDetail = spin(
    params.deck || playerState.deck || [],
    params.symbolsData || {},
    {
      spinCount: params?.config?.spinCount,
      randomFn,
    },
  );
  const currentEnemyHp = Math.max(0, toFiniteNumber(params.currentEnemyHp, enemy.hp));
  const events = [];

  const symbolSummary = spinDetail.entries.map((entry) => `${entry.name}(${entry.value})`).join(', ');

  if (spinDetail.entries.length === 0) {
    events.push(createEvent('spin_empty', '공격할 기물이 없습니다.'));
  } else {
    events.push(createEvent(
      'spin_result',
      `룰렛 결과: ${symbolSummary} | 공격 ${spinDetail.attackTotal} · 방어 ${spinDetail.defenseTotal} · 회복 ${spinDetail.healTotal}`,
      { spinDetail },
    ));
  }

  const nextPlayer = {
    ...playerState,
    hp: Math.max(0, toFiniteNumber(playerState.hp, 0)),
    maxHp: Math.max(0, toFiniteNumber(playerState.maxHp, playerState.hp)),
    gold: Math.max(0, toFiniteNumber(playerState.gold, 0)),
    deck: Array.isArray(playerState.deck) ? [...playerState.deck] : [],
  };

  const healedHp = clamp(nextPlayer.hp + spinDetail.healTotal, 0, Math.max(nextPlayer.maxHp, 0));
  const actualHeal = Math.max(0, healedHp - nextPlayer.hp);
  if (actualHeal > 0) {
    nextPlayer.hp = healedHp;
    events.push(createEvent('player_heal', `플레이어 회복 +${actualHeal}`));
  }

  const playerDamage = calculateDamage(spinDetail.attackTotal, enemy.defense, armorConstant);
  const nextEnemyHp = Math.max(0, currentEnemyHp - playerDamage);

  if (playerDamage > 0) {
    events.push(createEvent('player_attack', `${enemy.name || enemy.id || '적'}에게 ${playerDamage} 피해`));
  } else {
    events.push(createEvent('player_attack', '유효한 공격이 발생하지 않았습니다.'));
  }

  if (nextEnemyHp <= 0) {
    events.push(createEvent('combat_win', `${enemy.name || enemy.id || '적'}을(를) 처치했습니다.`));

    const rewardResult = applyMonsterRewards(enemy, nextPlayer, randomFn);
    rewardResult.events.forEach((event) => {
      events.push(event);
    });

    return {
      result: 'win',
      playerState: rewardResult.nextPlayer,
      currentEnemyHp: 0,
      spinDetail,
      events,
      rewardSummary: rewardResult.rewardSummary,
    };
  }

  const enemyDamage = calculateDamage(enemy.attack, spinDetail.defenseTotal, armorConstant);
  nextPlayer.hp = clamp(nextPlayer.hp - enemyDamage, 0, Math.max(nextPlayer.maxHp, 0));
  events.push(createEvent('enemy_attack', `${enemy.name || enemy.id || '적'}의 반격 ${enemyDamage} 피해`));

  if (nextPlayer.hp <= 0) {
    events.push(createEvent('combat_lose', '플레이어가 쓰러졌습니다.'));

    return {
      result: 'lose',
      playerState: nextPlayer,
      currentEnemyHp: nextEnemyHp,
      spinDetail,
      events,
      rewardSummary: {
        gold: 0,
        addedSymbols: [],
        skippedSymbols: [],
        exp: 0,
      },
    };
  }

  events.push(createEvent(
    'combat_continue',
    `턴 종료 | 플레이어 HP ${nextPlayer.hp}/${nextPlayer.maxHp} · 적 HP ${nextEnemyHp}/${enemy.hp}`,
  ));

  return {
    result: 'ongoing',
    playerState: nextPlayer,
    currentEnemyHp: nextEnemyHp,
    spinDetail,
    events,
    rewardSummary: {
      gold: 0,
      addedSymbols: [],
      skippedSymbols: [],
      exp: 0,
    },
  };
}
