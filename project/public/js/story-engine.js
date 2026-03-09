/**
 * story-engine.js
 * ───────────────
 * 스토리 노드/선택지 엔진 (데이터 기반, 순수 로직 중심)
 */

const STARTING_DECK_RECIPES = Object.freeze({
  warrior: Object.freeze([
    ['sword', 2],
    ['mace', 1],
    ['hammer', 1],
  ]),
  archer: Object.freeze([
    ['bow', 2],
    ['crossbow', 2],
  ]),
  mage: Object.freeze([
    ['staff', 2],
    ['dagger', 2],
  ]),
});

function cloneJsonCompatible(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomIntInRange(min, max, randomFn = Math.random) {
  const lower = Math.min(toFiniteNumber(min, 0), toFiniteNumber(max, 0));
  const upper = Math.max(toFiniteNumber(min, 0), toFiniteNumber(max, 0));
  return Math.floor(randomFn() * (upper - lower + 1)) + lower;
}

function normalizeCombatContext(combatContext = null) {
  if (!combatContext || typeof combatContext !== 'object') {
    return null;
  }

  return {
    monsterId: combatContext.monsterId || null,
    currentEnemyHp: Math.max(0, toFiniteNumber(combatContext.currentEnemyHp, 0)),
    turnCount: Math.max(0, toFiniteNumber(combatContext.turnCount, 0)),
    logs: Array.isArray(combatContext.logs) ? combatContext.logs.slice(-500) : [],
    lastSpinResult: combatContext.lastSpinResult ? cloneJsonCompatible(combatContext.lastSpinResult) : null,
    resumeNodeId: combatContext.resumeNodeId || null,
    restoreNodeId: combatContext.restoreNodeId || combatContext.resumeNodeId || null,
    victoryNodeId: combatContext.victoryNodeId || null,
    defeatNodeId: combatContext.defeatNodeId || null,
    sourceLabel: combatContext.sourceLabel || null,
  };
}

function calculateUpgradeBonuses(config = {}, userUpgrades = {}) {
  const upgradeDefs = config?.upgrades && typeof config.upgrades === 'object'
    ? config.upgrades
    : {};
  const ownedUpgrades = userUpgrades && typeof userUpgrades === 'object'
    ? userUpgrades
    : {};
  const bonuses = {
    bonusHp: 0,
    bonusGold: 0,
    bonusBagCapacity: 0,
  };

  Object.entries(ownedUpgrades).forEach(([upgradeId, rawLevel]) => {
    const upgradeDef = upgradeDefs[upgradeId];
    if (!upgradeDef) {
      return;
    }

    const maxLevel = Math.max(0, toFiniteNumber(upgradeDef.maxLevel, 1));
    const ownedLevel = Math.max(0, toFiniteNumber(rawLevel, 0));
    const appliedLevel = maxLevel > 0 ? Math.min(ownedLevel, maxLevel) : ownedLevel;
    const effect = upgradeDef.effect || {};

    bonuses.bonusHp += Math.max(0, toFiniteNumber(effect.bonusHp, 0)) * appliedLevel;
    bonuses.bonusGold += Math.max(0, toFiniteNumber(effect.bonusGold, 0)) * appliedLevel;
    bonuses.bonusBagCapacity += Math.max(0, toFiniteNumber(effect.bonusBagCapacity, 0)) * appliedLevel;
  });

  return bonuses;
}

export function createInactiveRunState(overrides = {}) {
  return {
    isActive: false,
    classId: null,
    stage: 1,
    hp: 0,
    maxHp: 0,
    gold: 0,
    deck: [],
    flags: [],
    currentNodeId: null,
    encounterHistory: [],
    blockedReason: null,
    combatContext: null,
    ...cloneJsonCompatible(overrides),
  };
}

export function normalizeRunState(playerState = null) {
  if (!playerState) {
    return createInactiveRunState();
  }

  const hp = toFiniteNumber(playerState.hp, 0);
  const maxHp = toFiniteNumber(playerState.maxHp, hp);

  return {
    isActive: Boolean(playerState.isActive),
    classId: playerState.classId || null,
    stage: Math.max(1, toFiniteNumber(playerState.stage, 1)),
    hp,
    maxHp: Math.max(0, maxHp),
    gold: Math.max(0, toFiniteNumber(playerState.gold, 0)),
    deck: Array.isArray(playerState.deck) ? [...playerState.deck] : [],
    flags: Array.isArray(playerState.flags) ? [...playerState.flags] : [],
    currentNodeId: playerState.currentNodeId || null,
    encounterHistory: Array.isArray(playerState.encounterHistory) ? [...playerState.encounterHistory] : [],
    blockedReason: playerState.blockedReason || null,
    combatContext: normalizeCombatContext(playerState.combatContext),
  };
}

export function buildInitialDeck(classId, bagCapacity) {
  const recipe = STARTING_DECK_RECIPES[classId];

  if (!recipe) {
    throw new Error(`Unsupported classId: ${classId}`);
  }

  const deck = [];

  recipe.forEach(([symbolId, count]) => {
    for (let index = 0; index < count; index += 1) {
      deck.push(symbolId);
    }
  });

  while (deck.length < bagCapacity) {
    deck.push('empty');
  }

  return deck.slice(0, bagCapacity);
}

export function createInitialRun(classId, config, userUpgrades = {}) {
  const upgradeBonuses = calculateUpgradeBonuses(config, userUpgrades);
  const normalizedConfig = {
    startHp: Math.max(0, toFiniteNumber(config?.startHp, 0)) + upgradeBonuses.bonusHp,
    startGold: Math.max(0, toFiniteNumber(config?.startGold, 0)) + upgradeBonuses.bonusGold,
    bagCapacity: Math.max(1, toFiniteNumber(config?.bagCapacity, 20) + upgradeBonuses.bonusBagCapacity),
  };

  return {
    isActive: true,
    classId,
    stage: 1,
    hp: normalizedConfig.startHp,
    maxHp: normalizedConfig.startHp,
    gold: normalizedConfig.startGold,
    deck: buildInitialDeck(classId, normalizedConfig.bagCapacity),
    flags: [],
    currentNodeId: 'node_prologue',
    encounterHistory: [],
    blockedReason: null,
    combatContext: null,
  };
}

export function countFilledDeckSlots(playerState) {
  return normalizeRunState(playerState).deck.filter((slot) => slot !== 'empty').length;
}

export function hasEmptyDeckSlot(playerState) {
  return normalizeRunState(playerState).deck.includes('empty');
}

export function pushReturnNode(playerState, nodeId) {
  const nextState = normalizeRunState(playerState);

  if (!nodeId) {
    return nextState;
  }

  nextState.encounterHistory.push(nodeId);
  return nextState;
}

export function meetsConditions(conditions = {}, playerState) {
  const runState = normalizeRunState(playerState);
  const flags = new Set(runState.flags);
  const hasFlags = toArray(conditions.hasFlag);
  const requiredFlags = toArray(conditions.requiredFlags);

  if (hasFlags.some((flag) => !flags.has(flag))) {
    return false;
  }

  if (requiredFlags.some((flag) => !flags.has(flag))) {
    return false;
  }

  if (conditions.minStage !== undefined && runState.stage < toFiniteNumber(conditions.minStage, 1)) {
    return false;
  }

  if (conditions.maxStage !== undefined && runState.stage > toFiniteNumber(conditions.maxStage, runState.stage)) {
    return false;
  }

  return true;
}

export function applyEffects(effects = {}, playerState) {
  const nextState = normalizeRunState(playerState);
  const flags = new Set(nextState.flags);

  toArray(effects.addFlag).forEach((flag) => {
    flags.add(flag);
  });

  toArray(effects.removeFlag).forEach((flag) => {
    flags.delete(flag);
  });

  nextState.flags = [...flags];

  const goldDelta = toFiniteNumber(effects.addGold, 0);
  if (goldDelta !== 0) {
    nextState.gold = Math.max(0, nextState.gold + goldDelta);
  }

  const hpDelta = toFiniteNumber(effects.addHp, 0) + toFiniteNumber(effects.heal, 0);
  if (hpDelta !== 0) {
    nextState.hp = clamp(nextState.hp + hpDelta, 0, Math.max(nextState.maxHp, 0));
  }

  if (effects.setStage !== undefined) {
    nextState.stage = Math.max(1, toFiniteNumber(effects.setStage, nextState.stage));
  }

  const stageDelta = toFiniteNumber(effects.addStage, 0);
  if (stageDelta !== 0) {
    nextState.stage = Math.max(1, nextState.stage + stageDelta);
  }

  return nextState;
}

export function advanceStage(playerState, amount = 1) {
  return applyEffects({ addStage: amount }, playerState);
}

export function loadNode(nodeId, storyData, playerState) {
  const node = storyData?.[nodeId];

  if (!node) {
    throw new Error(`Missing story node: ${nodeId}`);
  }

  const runState = normalizeRunState(playerState);
  const choices = Array.isArray(node.choices)
    ? node.choices.filter((choice) => {
      if (!meetsConditions(choice.conditions, runState)) {
        return false;
      }

      if (choice.nextNodeId === '$return') {
        return runState.encounterHistory.length > 0;
      }

      return Boolean(storyData?.[choice.nextNodeId]);
    }).map((choice) => cloneJsonCompatible(choice))
    : [];

  return {
    nodeId,
    type: node.type || 'narrative',
    title: node.title || '',
    text: node.text || '',
    choices,
    shopItems: Array.isArray(node.shopItems) ? cloneJsonCompatible(node.shopItems) : [],
    encounterPool: Array.isArray(node.encounterPool) ? [...node.encounterPool] : [],
    afterEncounter: node.afterEncounter || null,
    combatMonster: node.combatMonster || null,
    onWin: node.onWin || null,
    onLose: node.onLose || null,
    endingId: node.endingId || null,
    onEnter: cloneJsonCompatible(node.onEnter || {}),
  };
}

export function applyChoice(choice, playerState) {
  const runState = normalizeRunState(playerState);

  if (!meetsConditions(choice?.conditions, runState)) {
    throw new Error('Choice conditions are not satisfied');
  }

  const updatedState = applyEffects(choice?.effects, runState);
  let nextNodeId = choice?.nextNodeId || null;

  if (nextNodeId === '$return') {
    nextNodeId = updatedState.encounterHistory.pop() || null;
  }

  return {
    nextNodeId,
    updatedState,
  };
}

export function addSymbolToDeck(playerState, symbolId) {
  const nextState = normalizeRunState(playerState);
  const emptyIndex = nextState.deck.indexOf('empty');

  if (emptyIndex < 0) {
    return {
      updatedState: nextState,
      added: false,
      slotIndex: -1,
    };
  }

  nextState.deck[emptyIndex] = symbolId;

  return {
    updatedState: nextState,
    added: true,
    slotIndex: emptyIndex,
  };
}

export function applyRewardEncounter(encounter, playerState, randomFn = Math.random) {
  const nextState = normalizeRunState(playerState);
  const rewards = encounter?.rewards || {};
  const summary = {
    gold: 0,
    heal: 0,
    addedSymbols: [],
    skippedSymbols: [],
  };

  if (Array.isArray(rewards.gold) && rewards.gold.length >= 2) {
    const goldReward = randomIntInRange(rewards.gold[0], rewards.gold[1], randomFn);
    nextState.gold += goldReward;
    summary.gold = goldReward;
  }

  if (Array.isArray(rewards.heal) && rewards.heal.length >= 2) {
    const healAmount = randomIntInRange(rewards.heal[0], rewards.heal[1], randomFn);
    const healedHp = clamp(nextState.hp + healAmount, 0, Math.max(nextState.maxHp, 0));
    summary.heal = Math.max(0, healedHp - nextState.hp);
    nextState.hp = healedHp;
  }

  toArray(rewards.symbols).forEach((entry) => {
    const dropChance = toFiniteNumber(entry?.chance, 0);

    if (!entry?.symbolId || randomFn() > dropChance) {
      return;
    }

    const addResult = addSymbolToDeck(nextState, entry.symbolId);
    if (addResult.added) {
      nextState.deck = addResult.updatedState.deck;
      summary.addedSymbols.push(entry.symbolId);
      return;
    }

    summary.skippedSymbols.push(entry.symbolId);
  });

  return {
    updatedState: nextState,
    rewardSummary: summary,
  };
}

export function rollEncounter(encounterPool, encountersData, playerState, randomFn = Math.random) {
  const candidates = toArray(encounterPool)
    .map((encounterId) => {
      const encounter = encountersData?.[encounterId];
      return encounter ? { encounterId, encounter } : null;
    })
    .filter(Boolean)
    .filter(({ encounter }) => meetsConditions(encounter.conditions, playerState));

  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce(
    (sum, { encounter }) => sum + Math.max(0, toFiniteNumber(encounter.weight, 0)),
    0,
  );

  if (totalWeight <= 0) {
    const fallback = candidates[0];
    return {
      encounterId: fallback.encounterId,
      ...cloneJsonCompatible(fallback.encounter),
    };
  }

  let roll = randomFn() * totalWeight;

  for (const candidate of candidates) {
    roll -= Math.max(0, toFiniteNumber(candidate.encounter.weight, 0));
    if (roll <= 0) {
      return {
        encounterId: candidate.encounterId,
        ...cloneJsonCompatible(candidate.encounter),
      };
    }
  }

  const fallback = candidates[candidates.length - 1];
  return {
    encounterId: fallback.encounterId,
    ...cloneJsonCompatible(fallback.encounter),
  };
}

export function checkEnding(endingsData, playerState) {
  const runState = normalizeRunState(playerState);

  for (const [endingId, ending] of Object.entries(endingsData || {})) {
    if (ending?.type === 'death' && runState.hp <= 0) {
      return endingId;
    }

    const requiredFlags = toArray(ending?.requiredFlags);
    if (requiredFlags.length > 0 && meetsConditions({ requiredFlags }, runState)) {
      return endingId;
    }
  }

  return null;
}

export function resolveEndingId(requestedEndingId, endingsData, playerState, fallbackId = 'ending_death') {
  const runState = normalizeRunState(playerState);

  if (requestedEndingId && endingsData?.[requestedEndingId]) {
    const requestedEnding = endingsData[requestedEndingId];
    const requiredFlags = toArray(requestedEnding.requiredFlags);

    if (requiredFlags.length === 0 || meetsConditions({ requiredFlags }, runState)) {
      return requestedEndingId;
    }
  }

  const discoveredEndingId = checkEnding(endingsData, runState);
  if (discoveredEndingId && endingsData?.[discoveredEndingId]) {
    return discoveredEndingId;
  }

  return endingsData?.[fallbackId] ? fallbackId : Object.keys(endingsData || {})[0] || null;
}

export function calculateEndingOutcome(endingId, endingsData, playerState) {
  const runState = normalizeRunState(playerState);
  const safeEndingId = resolveEndingId(endingId, endingsData, runState);
  const endingData = cloneJsonCompatible(endingsData?.[safeEndingId] || {});
  const payoutMultiplier = toFiniteNumber(endingData.payoutMultiplier, 0);
  const bonusGold = toFiniteNumber(endingData?.bonusRewards?.gold, 0);
  const totalGoldThisRun = Math.max(0, toFiniteNumber(runState.gold, 0));
  const payout = Math.max(0, Math.round((totalGoldThisRun * payoutMultiplier) + bonusGold));

  return {
    endingId: safeEndingId,
    endingData,
    totalGoldThisRun,
    payoutMultiplier,
    bonusGold,
    payout,
    stageReached: Math.max(1, toFiniteNumber(runState.stage, 1)),
    isRankable: Boolean(endingData.isRankable),
  };
}
