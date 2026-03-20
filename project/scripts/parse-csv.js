const fs = require('fs');
const path = require('path');
const https = require('https');

const {
  createSheetsSession,
  getSheetValues,
  getSpreadsheetMetadata,
  quoteSheetTitle,
} = require('./google-sheets-client');
const { PROJECT_PH_SHEET_DEFINITIONS } = require('./google-sheets-project-ph-schema');

const DEFAULT_SPREADSHEET_ID = '180Zv2x0BNM0NjNx4a2MAFYl46bz-sRTbNln4sOS0wCU';
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'gamedata');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function printUsageAndExit() {
  console.log(`
Usage:
  node scripts/parse-csv.js --gid-map "<sheet-gids.json>"

Optional:
  --spreadsheet "<spreadsheet-url-or-id>"   default: ${DEFAULT_SPREADSHEET_ID}
  --credentials "<service-account.json>"    read sheet via authenticated API
  --sheet-urls "<sheet-urls.json>"          map of sheet title -> direct CSV URL
  --output-dir "<dir>"                      default: data/gamedata
  --strict                                  exit non-zero on validation errors

Examples:
  node scripts/parse-csv.js --gid-map scripts/project-ph-sheet-gids.json
  node scripts/parse-csv.js --sheet-urls scripts/project-ph-sheet-urls.json
`);
  process.exit(1);
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let index = 0;
  let isQuoted = false;

  while (index < text.length) {
    const char = text[index];

    if (isQuoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        isQuoted = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      isQuoted = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }

    if (char === '\r') {
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows
    .filter((rawRow) => rawRow.some((cell) => String(cell || '').trim() !== ''));
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = String(row[index] || '').trim();
    });
    return entry;
  });
}

function toFiniteNumber(value, fallback = null) {
  if (value === '' || value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === '' || value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toPipeList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function pickField(row, fieldNames, fallback = '') {
  for (const fieldName of fieldNames) {
    const normalizedField = normalizeHeader(fieldName);
    if (Object.prototype.hasOwnProperty.call(row, normalizedField)) {
      return row[normalizedField];
    }
  }

  return fallback;
}

function sortByOrder(rows) {
  return [...rows].sort((left, right) => {
    const leftOrder = toFiniteNumber(
      pickField(left, ['sort_order', 'order', 'index'], Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
    const rightOrder = toFiniteNumber(
      pickField(right, ['sort_order', 'order', 'index'], Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
    return leftOrder - rightOrder;
  });
}

function groupRows(rows, keyFieldNames) {
  return rows.reduce((accumulator, row) => {
    const key = pickField(row, keyFieldNames);
    if (!key) {
      return accumulator;
    }

    if (!accumulator[key]) {
      accumulator[key] = [];
    }

    accumulator[key].push(row);
    return accumulator;
  }, {});
}

function setNestedValue(target, pathSegments, value) {
  let cursor = target;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[pathSegments[pathSegments.length - 1]] = value;
}

function getSpreadsheetId(source) {
  const raw = String(source || DEFAULT_SPREADSHEET_ID).trim();
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || raw;
}

async function fetchText(url) {
  if (typeof fetch === 'function') {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Request failed: ${response.statusCode}`));
        response.resume();
        return;
      }

      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function readJsonInput(input) {
  if (!input) {
    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), input);
  if (fs.existsSync(resolvedPath)) {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  }

  return JSON.parse(input);
}

function buildSheetUrls(args) {
  const directSheetUrls = readJsonInput(args['sheet-urls']);
  if (directSheetUrls && typeof directSheetUrls === 'object') {
    return directSheetUrls;
  }

  const gidMap = readJsonInput(args['gid-map']);
  if (!gidMap || typeof gidMap !== 'object') {
    throw new Error('Missing --gid-map or --sheet-urls input');
  }

  const spreadsheetId = getSpreadsheetId(args.spreadsheet);
  const urlMap = {};

  PROJECT_PH_SHEET_DEFINITIONS.forEach((definition) => {
    const candidateGids = [
      gidMap[definition.title],
      gidMap[definition.key],
      ...(definition.aliases || []).map((alias) => gidMap[alias]),
    ];
    const gid = candidateGids.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');

    if (gid === undefined) {
      return;
    }

    urlMap[definition.title] = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pub?gid=${gid}&single=true&output=csv`;
  });

  return urlMap;
}

function findDefinitionSheetTitle(definition, sheets) {
  const acceptedTitles = [definition.title, definition.key, ...(definition.aliases || [])];
  const matchedSheet = sheets.find((sheet) => acceptedTitles.includes(sheet?.properties?.title));
  return matchedSheet?.properties?.title || null;
}

async function loadSheetRows(sheetUrls) {
  const results = await Promise.all(PROJECT_PH_SHEET_DEFINITIONS.map(async (definition) => {
    const url = sheetUrls[definition.title]
      || sheetUrls[definition.key]
      || (definition.aliases || []).map((alias) => sheetUrls[alias]).find(Boolean);

    if (!url) {
      throw new Error(`Missing CSV URL for sheet: ${definition.title}`);
    }

    const csvText = await fetchText(url);
    return [definition.title, rowsToObjects(parseCsv(csvText))];
  }));

  return Object.fromEntries(results);
}

async function loadSheetRowsFromApi(credentialsPath, spreadsheetSource) {
  const session = await createSheetsSession(credentialsPath);
  const { spreadsheetId, metadata } = await getSpreadsheetMetadata(
    session.accessToken,
    spreadsheetSource || DEFAULT_SPREADSHEET_ID,
  );
  const sheets = Array.isArray(metadata?.sheets) ? metadata.sheets : [];

  const results = await Promise.all(PROJECT_PH_SHEET_DEFINITIONS.map(async (definition) => {
    const sheetTitle = findDefinitionSheetTitle(definition, sheets);
    if (!sheetTitle) {
      throw new Error(`Missing sheet tab for definition: ${definition.title}`);
    }

    const range = `${quoteSheetTitle(sheetTitle)}!A:ZZ`;
    const payload = await getSheetValues(session.accessToken, spreadsheetId, range);
    return [definition.title, rowsToObjects(payload.values || [])];
  }));

  return Object.fromEntries(results);
}

function parseConfigValue(value, type) {
  const normalizedType = String(type || '').trim().toLowerCase();

  if (normalizedType === 'bool' || normalizedType === 'boolean') {
    return toBoolean(value, false);
  }

  if (normalizedType === 'int' || normalizedType === 'integer') {
    return Math.trunc(toFiniteNumber(value, 0));
  }

  if (normalizedType === 'float' || normalizedType === 'double' || normalizedType === 'number') {
    return toFiniteNumber(value, 0);
  }

  return value;
}

function buildConfigJson(sheetRows) {
  const config = {};
  const configRows = sheetRows.ConfigData || [];
  const synergyRows = sortByOrder(sheetRows.ConfigSynergyData || []);
  const upgradeRows = sortByOrder(sheetRows.ConfigUpgradeData || []);
  const bgmRows = sheetRows.ConfigSoundBgmData || [];
  const sfxRows = sheetRows.ConfigSoundSfxData || [];

  configRows.forEach((row) => {
    const group = pickField(row, ['group'], 'core') || 'core';
    const key = pickField(row, ['key']);
    if (!key) {
      return;
    }

    const value = parseConfigValue(pickField(row, ['value']), pickField(row, ['type']));

    if (group === 'core') {
      config[key] = value;
      return;
    }

    if (group === 'defaultVolume') {
      setNestedValue(config, ['sounds', 'defaultVolume', key], value);
      return;
    }

    setNestedValue(config, [group, key], value);
  });

  config.synergies = synergyRows.map((row) => ({
    type: pickField(row, ['type']) || '',
    minCount: toFiniteNumber(pickField(row, ['min_count']), 0),
    bonusPerExtra: toFiniteNumber(pickField(row, ['bonus_per_extra']), 0),
    label: pickField(row, ['label']) || '',
  }));

  config.upgrades = upgradeRows.reduce((accumulator, row) => {
    const upgradeId = pickField(row, ['id']);
    if (!upgradeId) {
      return accumulator;
    }

    const effect = {};
    const effectKey = pickField(row, ['effect_key']);
    const effectValue = toFiniteNumber(pickField(row, ['effect_value']), null);

    if (effectKey && effectValue !== null) {
      effect[effectKey] = effectValue;
    }

    const bonusHp = toFiniteNumber(pickField(row, ['effect_bonus_hp']), null);
    const bonusGold = toFiniteNumber(pickField(row, ['effect_bonus_gold']), null);
    const bonusBagCapacity = toFiniteNumber(pickField(row, ['effect_bonus_bag_capacity']), null);

    if (bonusHp !== null) {
      effect.bonusHp = bonusHp;
    }
    if (bonusGold !== null) {
      effect.bonusGold = bonusGold;
    }
    if (bonusBagCapacity !== null) {
      effect.bonusBagCapacity = bonusBagCapacity;
    }

    accumulator[upgradeId] = {
      name: pickField(row, ['name']) || '',
      description: pickField(row, ['description']) || '',
      cost: toFiniteNumber(pickField(row, ['cost']), 0),
      maxLevel: toFiniteNumber(pickField(row, ['max_level']), 0),
      effect,
      icon: pickField(row, ['icon']) || '',
    };

    return accumulator;
  }, {});

  config.sounds = config.sounds || {};
  config.sounds.bgm = bgmRows.reduce((accumulator, row) => {
    const key = pickField(row, ['track_id', 'key']);
    if (key) {
      accumulator[key] = pickField(row, ['path']) || '';
    }
    return accumulator;
  }, {});
  config.sounds.sfx = sfxRows.reduce((accumulator, row) => {
    const key = pickField(row, ['sfx_id', 'key']);
    if (key) {
      accumulator[key] = pickField(row, ['path']) || '';
    }
    return accumulator;
  }, {});

  return config;
}

function buildClassesJson(sheetRows) {
  const classRows = sheetRows.ClassData || [];
  const weaponGroups = groupRows(sheetRows.ClassWeaponData || [], ['class_id']);
  const startingDeckGroups = groupRows(sheetRows.ClassStartingData || [], ['class_id']);

  return classRows.reduce((accumulator, row) => {
    const classId = pickField(row, ['id']);
    if (!classId) {
      return accumulator;
    }

    accumulator[classId] = {
      name: pickField(row, ['name']) || '',
      icon: pickField(row, ['icon']) || '',
      description: pickField(row, ['description']) || '',
      baseHp: toFiniteNumber(pickField(row, ['base_hp']), 0),
      baseGold: toFiniteNumber(pickField(row, ['base_gold']), 0),
      deckSize: toFiniteNumber(pickField(row, ['deck_size']), 0),
      themeColor: pickField(row, ['theme_color']) || '',
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
      weapons: sortByOrder(weaponGroups[classId] || []).map((weaponRow) => pickField(weaponRow, ['symbol_id'])).filter(Boolean),
      startingDeck: sortByOrder(startingDeckGroups[classId] || []).map((deckRow) => ({
        symbolId: pickField(deckRow, ['symbol_id']) || '',
        count: toFiniteNumber(pickField(deckRow, ['count']), 0),
      })).filter((entry) => entry.symbolId && entry.count > 0),
    };

    return accumulator;
  }, {});
}

function buildOriginsJson(sheetRows) {
  const originRows = sheetRows.OriginData || [];

  return originRows.reduce((accumulator, row) => {
    const originId = pickField(row, ['id']);
    if (!originId) {
      return accumulator;
    }

    accumulator[originId] = {
      name: pickField(row, ['name']) || '',
      icon: pickField(row, ['icon']) || '',
      description: pickField(row, ['description']) || '',
      baseKarma: toFiniteNumber(pickField(row, ['base_karma']), 0),
      startNodeId: pickField(row, ['start_node_id']) || '',
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
    };

    return accumulator;
  }, {});
}

function buildSymbolsJson(sheetRows) {
  const symbolRows = sheetRows.SymbolData || [];

  return symbolRows.reduce((accumulator, row) => {
    const symbolId = pickField(row, ['id']);
    if (!symbolId) {
      return accumulator;
    }

    accumulator[symbolId] = {
      name: pickField(row, ['name']) || '',
      type: pickField(row, ['type']) || '',
      value: toFiniteNumber(pickField(row, ['value']), 0),
      rarity: pickField(row, ['rarity']) || '',
      classTag: pickField(row, ['class_tag']) || '',
      icon: pickField(row, ['icon']) || '',
      description: pickField(row, ['description']) || '',
      tags: toPipeList(pickField(row, ['tags'])),
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
    };

    return accumulator;
  }, {});
}

function buildMonstersJson(sheetRows) {
  const monsterRows = sheetRows.MonsterData || [];
  const lootGroups = groupRows(sheetRows.DropData || [], ['monster_id']);

  return monsterRows.reduce((accumulator, row) => {
    const monsterId = pickField(row, ['id']);
    if (!monsterId) {
      return accumulator;
    }

    accumulator[monsterId] = {
      name: pickField(row, ['name']) || '',
      hp: toFiniteNumber(pickField(row, ['hp']), 0),
      attack: toFiniteNumber(pickField(row, ['attack']), 0),
      defense: toFiniteNumber(pickField(row, ['defense']), 0),
      expReward: toFiniteNumber(pickField(row, ['exp_reward']), 0),
      goldReward: [
        toFiniteNumber(pickField(row, ['gold_min', 'gold_reward_min']), 0),
        toFiniteNumber(pickField(row, ['gold_max', 'gold_reward_max']), 0),
      ],
      icon: pickField(row, ['icon']) || '',
      tier: pickField(row, ['tier']) || '',
      tags: toPipeList(pickField(row, ['tags'])),
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
      lootTable: sortByOrder(lootGroups[monsterId] || []).map((lootRow) => ({
        symbolId: pickField(lootRow, ['symbol_id']) || '',
        dropRate: toFiniteNumber(pickField(lootRow, ['drop_rate']), 0),
      })).filter((entry) => entry.symbolId),
    };

    return accumulator;
  }, {});
}

function buildEncountersJson(sheetRows) {
  const encounterRows = sheetRows.EncounterData || [];
  const monsterGroups = groupRows(sheetRows.EncounterMonsterData || [], ['encounter_id']);
  const rewardRangeGroups = groupRows(sheetRows.EncounterRewardRangeData || [], ['encounter_id']);
  const rewardSymbolGroups = groupRows(sheetRows.EncounterRewardSymbolData || [], ['encounter_id']);

  return encounterRows.reduce((accumulator, row) => {
    const encounterId = pickField(row, ['id']);
    if (!encounterId) {
      return accumulator;
    }

    const entry = {
      name: pickField(row, ['name']) || '',
      type: pickField(row, ['type']) || '',
      description: pickField(row, ['description']) || '',
      weight: toFiniteNumber(pickField(row, ['weight']), 0),
      conditions: {
        minStage: toFiniteNumber(pickField(row, ['condition_min_stage', 'min_stage']), 1),
        maxStage: toFiniteNumber(pickField(row, ['condition_max_stage', 'max_stage']), 99),
        requiredFlags: toPipeList(pickField(row, ['condition_required_flags', 'required_flags'])),
      },
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
    };

    const storyNodeId = pickField(row, ['story_node_id']);
    if (storyNodeId) {
      entry.storyNodeId = storyNodeId;
    }

    const monsters = sortByOrder(monsterGroups[encounterId] || [])
      .map((monsterRow) => pickField(monsterRow, ['monster_id']))
      .filter(Boolean);
    if (monsters.length > 0) {
      entry.monsters = monsters;
    }

    const rewards = {};
    sortByOrder(rewardRangeGroups[encounterId] || []).forEach((rewardRow) => {
      const rewardType = pickField(rewardRow, ['reward_type']);
      if (!rewardType) {
        return;
      }

      rewards[rewardType] = [
        toFiniteNumber(pickField(rewardRow, ['min', 'min_value']), 0),
        toFiniteNumber(pickField(rewardRow, ['max', 'max_value']), 0),
      ];
    });

    const rewardSymbols = sortByOrder(rewardSymbolGroups[encounterId] || [])
      .map((rewardRow) => ({
        symbolId: pickField(rewardRow, ['symbol_id']) || '',
        chance: toFiniteNumber(pickField(rewardRow, ['chance']), 0),
      }))
      .filter((entryRow) => entryRow.symbolId);

    if (rewardSymbols.length > 0) {
      rewards.symbols = rewardSymbols;
    }

    if (Object.keys(rewards).length > 0) {
      entry.rewards = rewards;
    }

    accumulator[encounterId] = entry;
    return accumulator;
  }, {});
}

function appendEffect(target, effectType, value) {
  if (value === '' || value === undefined || value === null) {
    return;
  }

  if (effectType === 'addFlag' || effectType === 'removeFlag') {
    const values = toPipeList(value);
    if (values.length === 0) {
      return;
    }

    if (values.length === 1) {
      target[effectType] = values[0];
      return;
    }

    target[effectType] = values;
    return;
  }

  const numericValue = toFiniteNumber(value, null);
  target[effectType] = numericValue !== null ? numericValue : value;
}

function buildStoryJson(sheetRows) {
  const nodeRows = sheetRows.MainStoryNodeData || [];
  const choiceGroups = groupRows(sheetRows.StoryChoiceData || [], ['node_id']);
  const shopGroups = groupRows(sheetRows.StoryShopItemData || [], ['node_id']);
  const encounterPoolGroups = groupRows(sheetRows.StoryEncounterPoolData || [], ['node_id']);
  const onEnterGroups = groupRows(sheetRows.StoryOnEnterData || [], ['node_id']);

  return nodeRows.reduce((accumulator, row) => {
    const nodeId = pickField(row, ['id']);
    if (!nodeId) {
      return accumulator;
    }

    const entry = {
      title: pickField(row, ['title']) || '',
      text: pickField(row, ['body', 'text']) || '',
      type: pickField(row, ['type']) || 'narrative',
      choices: sortByOrder(choiceGroups[nodeId] || []).map((choiceRow) => {
        const choice = {
          id: pickField(choiceRow, ['choice_id']) || undefined,
          text: pickField(choiceRow, ['choice_text']) || '',
          nextNodeId: pickField(choiceRow, ['next_node_id']) || '',
          conditions: {},
          effects: {},
        };

        const hasFlags = toPipeList(pickField(choiceRow, ['condition_has_flag']));
        if (hasFlags.length > 0) {
          choice.conditions.hasFlag = hasFlags.length === 1 ? hasFlags[0] : hasFlags;
        }

        const minStage = toFiniteNumber(
          pickField(choiceRow, ['condition_min_stage', 'condition_min_skill']),
          null,
        );
        const maxStage = toFiniteNumber(
          pickField(choiceRow, ['condition_max_stage', 'condition_max_skill']),
          null,
        );
        const minKarma = toFiniteNumber(pickField(choiceRow, ['condition_min_karma']), null);
        const maxKarma = toFiniteNumber(pickField(choiceRow, ['condition_max_karma']), null);

        if (minStage !== null) {
          choice.conditions.minStage = minStage;
        }
        if (maxStage !== null) {
          choice.conditions.maxStage = maxStage;
        }
        if (minKarma !== null) {
          choice.conditions.minKarma = minKarma;
        }
        if (maxKarma !== null) {
          choice.conditions.maxKarma = maxKarma;
        }

        appendEffect(choice.effects, 'addFlag', pickField(choiceRow, ['effect_add_flag']));
        appendEffect(choice.effects, 'removeFlag', pickField(choiceRow, ['effect_remove_flag']));
        appendEffect(choice.effects, 'heal', pickField(choiceRow, ['effect_heal']));
        appendEffect(choice.effects, 'addGold', pickField(choiceRow, ['effect_add_gold']));
        appendEffect(choice.effects, 'addKarma', pickField(choiceRow, ['effect_add_karma']));

        const karmaHint = pickField(choiceRow, ['karma_hint']);
        if (karmaHint) {
          choice.karmaHint = karmaHint;
        }

        if (Object.keys(choice.conditions).length === 0) {
          choice.conditions = {};
        }
        if (Object.keys(choice.effects).length === 0) {
          choice.effects = {};
        }
        if (!choice.id) {
          delete choice.id;
        }

        return choice;
      }),
      onEnter: {},
    };

    const afterEncounter = pickField(row, ['after_encounter']);
    const combatMonster = pickField(row, ['combat_monster']);
    const onWin = pickField(row, ['on_win']);
    const onLose = pickField(row, ['on_lose']);
    const endingId = pickField(row, ['ending_id']);

    if (afterEncounter) {
      entry.afterEncounter = afterEncounter;
    }
    if (combatMonster) {
      entry.combatMonster = combatMonster;
    }
    if (onWin) {
      entry.onWin = onWin;
    }
    if (onLose) {
      entry.onLose = onLose;
    }
    if (endingId) {
      entry.endingId = endingId;
    }

    const shopItems = sortByOrder(shopGroups[nodeId] || []).map((shopRow) => ({
      symbolId: pickField(shopRow, ['symbol_id']) || '',
      cost: toFiniteNumber(pickField(shopRow, ['cost']), 0),
      stock: toFiniteNumber(pickField(shopRow, ['stock']), null),
    })).filter((shopItem) => shopItem.symbolId).map((shopItem) => {
      if (shopItem.stock === null) {
        delete shopItem.stock;
      }
      return shopItem;
    });
    if (shopItems.length > 0) {
      entry.shopItems = shopItems;
    }

    const encounterPool = sortByOrder(encounterPoolGroups[nodeId] || [])
      .map((poolRow) => pickField(poolRow, ['encounter_id']))
      .filter(Boolean);
    if (encounterPool.length > 0) {
      entry.encounterPool = encounterPool;
    }

    sortByOrder(onEnterGroups[nodeId] || []).forEach((onEnterRow) => {
      const effectType = pickField(onEnterRow, ['effect_type']);
      if (effectType) {
        appendEffect(entry.onEnter, effectType.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase()), pickField(onEnterRow, ['value']));
        return;
      }

      appendEffect(entry.onEnter, 'addFlag', pickField(onEnterRow, ['add_flag']));
      appendEffect(entry.onEnter, 'heal', pickField(onEnterRow, ['heal']));
      appendEffect(entry.onEnter, 'addGold', pickField(onEnterRow, ['add_gold']));
      appendEffect(entry.onEnter, 'addKarma', pickField(onEnterRow, ['add_karma']));
    });

    accumulator[nodeId] = entry;
    return accumulator;
  }, {});
}

function buildEndingsJson(sheetRows) {
  const endingRows = sheetRows.EndingData || [];
  const requiredFlagGroups = groupRows(sheetRows.EndingRequiredFlagData || [], ['ending_id']);

  return endingRows.reduce((accumulator, row) => {
    const endingId = pickField(row, ['id']);
    if (!endingId) {
      return accumulator;
    }

    const entry = {
      name: pickField(row, ['name']) || '',
      type: pickField(row, ['type']) || '',
      text: pickField(row, ['description', 'text']) || '',
      payoutMultiplier: toFiniteNumber(pickField(row, ['payout_multiplier']), 0),
      isRankable: toBoolean(pickField(row, ['is_rankable']), false),
      bonusRewards: {
        gold: toFiniteNumber(pickField(row, ['bonus_gold']), 0),
      },
      icon: pickField(row, ['icon']) || '',
      isEnabled: toBoolean(pickField(row, ['is_enabled']), true),
      requiredFlags: sortByOrder(requiredFlagGroups[endingId] || [])
        .map((flagRow) => pickField(flagRow, ['flag']))
        .filter(Boolean),
    };

    accumulator[endingId] = entry;
    return accumulator;
  }, {});
}

function validateReferences(datasets) {
  const issues = [];
  const pushIssue = (level, message) => {
    issues.push({ level, message });
    const printer = level === 'error' ? console.error : console.warn;
    printer(`${level.toUpperCase()}: ${message}`);
  };

  const { config, classes, origins, symbols, monsters, encounters, story, endings } = datasets;

  Object.entries(classes).forEach(([classId, classData]) => {
    (classData.weapons || []).forEach((symbolId) => {
      if (!symbols[symbolId]) {
        pushIssue('error', `classes.${classId}.weapons references missing symbol: ${symbolId}`);
      }
    });

    (classData.startingDeck || []).forEach((entry, index) => {
      if (!symbols[entry.symbolId]) {
        pushIssue('error', `classes.${classId}.startingDeck[${index}] references missing symbol: ${entry.symbolId}`);
      }
    });
  });

  if (config?.defaultStartNodeId && !story[config.defaultStartNodeId]) {
    pushIssue('error', `config.defaultStartNodeId references missing story node: ${config.defaultStartNodeId}`);
  }

  Object.entries(origins).forEach(([originId, originData]) => {
    if (originData.startNodeId && !story[originData.startNodeId]) {
      pushIssue('error', `origins.${originId}.startNodeId references missing story node: ${originData.startNodeId}`);
    }
  });

  Object.entries(monsters).forEach(([monsterId, monsterData]) => {
    (monsterData.lootTable || []).forEach((lootEntry, index) => {
      if (!symbols[lootEntry.symbolId]) {
        pushIssue('error', `monsters.${monsterId}.lootTable[${index}] references missing symbol: ${lootEntry.symbolId}`);
      }
    });
  });

  Object.entries(encounters).forEach(([encounterId, encounterData]) => {
    const encounterType = String(encounterData.type || '').toLowerCase();

    (encounterData.monsters || []).forEach((monsterId) => {
      if (!monsters[monsterId]) {
        pushIssue('error', `encounters.${encounterId}.monsters references missing monster: ${monsterId}`);
      }
    });

    if (!['combat', 'reward'].includes(encounterType) && !encounterData.storyNodeId) {
      pushIssue('warning', `encounters.${encounterId} (${encounterType || 'unknown'}) is missing storyNodeId`);
    }

    if (encounterData.storyNodeId && !story[encounterData.storyNodeId]) {
      pushIssue('error', `encounters.${encounterId}.storyNodeId references missing story node: ${encounterData.storyNodeId}`);
    }
  });

  Object.entries(story).forEach(([nodeId, nodeData]) => {
    (nodeData.encounterPool || []).forEach((encounterId) => {
      if (!encounters[encounterId]) {
        pushIssue('error', `story.${nodeId}.encounterPool references missing encounter: ${encounterId}`);
      }
    });

    (nodeData.shopItems || []).forEach((shopItem, index) => {
      if (!symbols[shopItem.symbolId]) {
        pushIssue('error', `story.${nodeId}.shopItems[${index}] references missing symbol: ${shopItem.symbolId}`);
      }
    });

    if (nodeData.endingId && !endings[nodeData.endingId]) {
      pushIssue('error', `story.${nodeId}.endingId references missing ending: ${nodeData.endingId}`);
    }

    if (nodeData.combatMonster && !monsters[nodeData.combatMonster]) {
      pushIssue('error', `story.${nodeId}.combatMonster references missing monster: ${nodeData.combatMonster}`);
    }

    (nodeData.choices || []).forEach((choice, index) => {
      if (choice.nextNodeId && choice.nextNodeId !== '$return' && !story[choice.nextNodeId]) {
        pushIssue('error', `story.${nodeId}.choices[${index}] references missing story node: ${choice.nextNodeId}`);
      }
    });
  });

  return issues;
}

function writeJson(outputDir, fileName, value) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsageAndExit();
  }

  const sheetRows = args.credentials
    ? await loadSheetRowsFromApi(args.credentials, args.spreadsheet)
    : await loadSheetRows(buildSheetUrls(args));
  const outputDir = path.resolve(process.cwd(), args['output-dir'] || DEFAULT_OUTPUT_DIR);

  const datasets = {
    config: buildConfigJson(sheetRows),
    classes: buildClassesJson(sheetRows),
    origins: buildOriginsJson(sheetRows),
    symbols: buildSymbolsJson(sheetRows),
    monsters: buildMonstersJson(sheetRows),
    encounters: buildEncountersJson(sheetRows),
    story: buildStoryJson(sheetRows),
    endings: buildEndingsJson(sheetRows),
  };

  writeJson(outputDir, 'config.json', datasets.config);
  writeJson(outputDir, 'classes.json', datasets.classes);
  writeJson(outputDir, 'origins.json', datasets.origins);
  writeJson(outputDir, 'symbols.json', datasets.symbols);
  writeJson(outputDir, 'monsters.json', datasets.monsters);
  writeJson(outputDir, 'encounters.json', datasets.encounters);
  writeJson(outputDir, 'story.json', datasets.story);
  writeJson(outputDir, 'endings.json', datasets.endings);

  const issues = validateReferences(datasets);
  const hasErrors = issues.some((issue) => issue.level === 'error');

  console.log('\nCSV parse complete.\n');
  console.log(`  output: ${outputDir}`);
  console.log(`  config: ${Object.keys(datasets.config).length}`);
  console.log(`  classes: ${Object.keys(datasets.classes).length}`);
  console.log(`  origins: ${Object.keys(datasets.origins).length}`);
  console.log(`  symbols: ${Object.keys(datasets.symbols).length}`);
  console.log(`  monsters: ${Object.keys(datasets.monsters).length}`);
  console.log(`  encounters: ${Object.keys(datasets.encounters).length}`);
  console.log(`  story: ${Object.keys(datasets.story).length}`);
  console.log(`  endings: ${Object.keys(datasets.endings).length}`);

  if (hasErrors) {
    console.error(`\nReference validation failed with ${issues.filter((issue) => issue.level === 'error').length} error(s).`);
    if (args.strict) {
      process.exitCode = 1;
    }
    return;
  }

  if (issues.length > 0) {
    console.warn(`\nReference validation finished with ${issues.length} warning(s).`);
    return;
  }

  console.log('\nReference validation: OK');
}

main().catch((error) => {
  console.error('\nCSV parse failed');
  console.error(error.message || error);
  process.exit(1);
});
