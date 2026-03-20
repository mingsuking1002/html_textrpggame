/**
 * google-sheets-export-gamedata.js
 * ────────────────────────────────
 * 현재 Project PH GameData(JSON + 일부 코드 기반 메타)를 Google Sheets 표 형태로 내보낸다.
 */

const fs = require('fs');
const path = require('path');

const {
  batchUpdateSpreadsheet,
  clearSheetValues,
  createSheetsSession,
  getSpreadsheetMetadata,
  quoteSheetTitle,
  updateSheetValues,
} = require('./google-sheets-client');
const { PROJECT_PH_SHEET_DEFINITIONS } = require('./google-sheets-project-ph-schema');

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'gamedata');

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
사용법:
  node scripts/google-sheets-export-gamedata.js --credentials "<service-account.json>" --spreadsheet "<sheet-url-or-id>"

또는 환경 변수:
  PH_GOOGLE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS
  PH_SPREADSHEET_URL / PH_SPREADSHEET_ID
`);
  process.exit(1);
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
}

function toPipeList(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }
  return value.join('|');
}

function normalizeFlagValue(value) {
  if (Array.isArray(value)) {
    return value.join('|');
  }
  return value || '';
}

function toBoolString(value, fallback = true) {
  return value === undefined ? (fallback ? 'TRUE' : 'FALSE') : (value ? 'TRUE' : 'FALSE');
}

function buildChoiceId(index) {
  return `choice_${index + 1}`;
}

function normalizeStartingDeckEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      symbolId: entry[0] || '',
      count: entry[1] ?? '',
    };
  }

  return {
    symbolId: entry?.symbolId || '',
    count: entry?.count ?? '',
  };
}

function getColumnLetter(index) {
  let dividend = index;
  let columnName = '';

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName || 'A';
}

function findExistingSheet(definition, sheets) {
  const acceptedTitles = [definition.title, ...(definition.aliases || [])];
  return sheets.find((sheet) => acceptedTitles.includes(sheet?.properties?.title));
}

function buildHeaderNoteRequests(definitions, sheets) {
  const requests = [];

  definitions.forEach((definition) => {
    const matchedSheet = findExistingSheet(definition, sheets);
    const sheetId = matchedSheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      return;
    }

    definition.headers.forEach((header, index) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: index,
            endColumnIndex: index + 1,
          },
          cell: {
            note: definition.headerNotes?.[index] || `${header} 컬럼 설명`,
          },
          fields: 'note',
        },
      });
    });
  });

  return requests;
}

function buildSheetRows() {
  const classes = readJson('classes.json');
  const config = readJson('config.json');
  const origins = readJson('origins.json');
  const symbols = readJson('symbols.json');
  const monsters = readJson('monsters.json');
  const encounters = readJson('encounters.json');
  const story = readJson('story.json');
  const endings = readJson('endings.json');

  return {
    classes: Object.entries(classes).map(([id, data]) => [
      id,
      data.name || '',
      data.icon || '',
      data.description || '',
      data.baseHp ?? '',
      data.baseGold ?? '',
      data.deckSize ?? '',
      data.themeColor || '',
      toBoolString(data.isEnabled, true),
    ]),
    class_weapons: Object.entries(classes).flatMap(([classId, data]) => (
      (data.weapons || []).map((symbolId, index) => [classId, symbolId, index + 1])
    )),
    class_starting_deck: Object.entries(classes).flatMap(([classId, data]) => (
      (data.startingDeck || []).map((row, index) => {
        const normalizedRow = normalizeStartingDeckEntry(row);
        return [classId, normalizedRow.symbolId, normalizedRow.count, index + 1, 'classes.json'];
      })
    )),
    origins: Object.entries(origins).map(([id, data]) => [
      id,
      data.name || '',
      data.icon || '',
      data.description || '',
      data.baseKarma ?? '',
      data.startNodeId || '',
      toBoolString(data.isEnabled, true),
    ]),
    symbols: Object.entries(symbols).map(([id, data]) => [
      id,
      data.name || '',
      data.type || '',
      data.value ?? '',
      data.rarity ?? '',
      data.classTag || '',
      data.icon || '',
      data.description || '',
      toPipeList(data.tags),
      toBoolString(data.isEnabled, true),
    ]),
    monsters: Object.entries(monsters).map(([id, data]) => [
      id,
      data.name || '',
      data.hp ?? '',
      data.attack ?? '',
      data.defense ?? '',
      data.expReward ?? '',
      Array.isArray(data.goldReward) ? data.goldReward[0] ?? '' : '',
      Array.isArray(data.goldReward) ? data.goldReward[1] ?? '' : '',
      data.icon || '',
      data.tier ?? '',
      toPipeList(data.tags),
      toBoolString(data.isEnabled, true),
    ]),
    monster_loot: Object.entries(monsters).flatMap(([monsterId, data]) => (
      (data.lootTable || []).map((loot, index) => [monsterId, loot.symbolId || '', loot.dropRate ?? '', index + 1])
    )),
    encounters: Object.entries(encounters).map(([id, data]) => [
      id,
      data.name || '',
      data.type || '',
      data.description || '',
      data.storyNodeId || '',
      data.weight ?? '',
      data.conditions?.minStage ?? '',
      data.conditions?.maxStage ?? '',
      toPipeList(data.conditions?.requiredFlags),
      toBoolString(data.isEnabled, true),
    ]),
    encounter_monsters: Object.entries(encounters).flatMap(([encounterId, data]) => (
      (data.monsters || []).map((monsterId, index) => [encounterId, monsterId, index + 1])
    )),
    encounter_reward_ranges: Object.entries(encounters).flatMap(([encounterId, data]) => {
      const rows = [];
      for (const rewardType of ['gold', 'heal']) {
        const range = data.rewards?.[rewardType];
        if (Array.isArray(range)) {
          rows.push([encounterId, rewardType, range[0] ?? '', range[1] ?? '']);
        }
      }
      return rows;
    }),
    encounter_reward_symbols: Object.entries(encounters).flatMap(([encounterId, data]) => (
      (data.rewards?.symbols || []).map((reward, index) => [encounterId, reward.symbolId || '', reward.chance ?? '', index + 1])
    )),
    story_nodes: Object.entries(story).map(([id, node]) => [
      id,
      node.type || '',
      node.title || '',
      node.text || '',
      node.afterEncounter || '',
      node.combatMonster || '',
      node.onWin || '',
      node.onLose || '',
      node.endingId || '',
      toBoolString(node.isEnabled, true),
    ]),
    story_choices: Object.entries(story).flatMap(([nodeId, node]) => (
      (node.choices || []).map((choice, index) => [
        nodeId,
        choice.id || buildChoiceId(index),
        choice.text || '',
        choice.nextNodeId || '',
        normalizeFlagValue(choice.conditions?.hasFlag),
        choice.conditions?.minStage ?? '',
        choice.conditions?.maxStage ?? '',
        normalizeFlagValue(choice.effects?.addFlag),
        normalizeFlagValue(choice.effects?.removeFlag),
        choice.effects?.heal ?? '',
        choice.effects?.addGold ?? '',
        index + 1,
        choice.conditions?.minKarma ?? '',
        choice.conditions?.maxKarma ?? '',
        choice.effects?.addKarma ?? '',
        choice.karmaHint || '',
      ])
    )),
    story_shop_items: Object.entries(story).flatMap(([nodeId, node]) => (
      (node.shopItems || []).map((item, index) => [
        nodeId,
        item.symbolId || '',
        item.cost ?? '',
        item.stock ?? '',
        index + 1,
      ])
    )),
    story_encounter_pool: Object.entries(story).flatMap(([nodeId, node]) => (
      (node.encounterPool || []).map((encounterId, index) => [nodeId, encounterId, index + 1])
    )),
    story_on_enter: Object.entries(story)
      .filter(([, node]) => node.onEnter && Object.keys(node.onEnter).length > 0)
      .map(([nodeId, node]) => [
        nodeId,
        normalizeFlagValue(node.onEnter.addFlag),
        node.onEnter.heal ?? '',
        node.onEnter.addGold ?? '',
      ]),
    endings: Object.entries(endings).map(([id, ending]) => [
      id,
      ending.name || '',
      ending.type || '',
      ending.text || '',
      ending.payoutMultiplier ?? '',
      toBoolString(ending.isRankable, false),
      ending.bonusRewards?.gold ?? '',
      ending.icon || '',
      toBoolString(ending.isEnabled, true),
    ]),
    ending_required_flags: Object.entries(endings).flatMap(([endingId, ending]) => (
      (ending.requiredFlags || []).map((flag, index) => [endingId, flag, index + 1])
    )),
    config: [
      ['core', 'startHp', config.startHp ?? '', 'number', '초기 HP'],
      ['core', 'startGold', config.startGold ?? '', 'number', '초기 골드'],
      ['core', 'bagCapacity', config.bagCapacity ?? '', 'number', '기본 가방 칸 수'],
      ['core', 'defaultStartNodeId', config.defaultStartNodeId ?? '', 'string', '출신지 미지정 시 시작 노드'],
      ['core', 'spinCount', config.spinCount ?? '', 'number', '전투 스핀 결과 개수'],
      ['core', 'reelRows', config.reelRows ?? '', 'number', '파칭코 릴 세로 행 수'],
      ['core', 'rerollCost', config.rerollCost ?? '', 'number', '전투 리롤 비용'],
      ['core', 'armorConstant', config.armorConstant ?? '', 'number', '방어 상수'],
      ['karma', 'initialKarma', config.karma?.initialKarma ?? '', 'number', '출신지 미선택 시 기본 업보'],
      ['karma', 'minKarma', config.karma?.minKarma ?? '', 'number', '업보 최소값'],
      ['karma', 'maxKarma', config.karma?.maxKarma ?? '', 'number', '업보 최대값'],
      ['crystalRewards', 'base', config.crystalRewards?.base ?? '', 'number', '기본 결정 보상'],
      ['crystalRewards', 'perStage', config.crystalRewards?.perStage ?? '', 'number', '스테이지당 결정'],
      ['crystalRewards', 'successBonus', config.crystalRewards?.successBonus ?? '', 'number', '성공 엔딩 보너스'],
      ['crystalRewards', 'rankableBonus', config.crystalRewards?.rankableBonus ?? '', 'number', '랭킹 엔딩 보너스'],
      ['defaultVolume', 'bgm', config.sounds?.defaultVolume?.bgm ?? '', 'number', '기본 BGM 볼륨'],
      ['defaultVolume', 'sfx', config.sounds?.defaultVolume?.sfx ?? '', 'number', '기본 SFX 볼륨'],
    ],
    config_synergies: (config.synergies || []).map((synergy, index) => [
      index + 1,
      synergy.type || '',
      synergy.minCount ?? '',
      synergy.bonusPerExtra ?? '',
      synergy.label || '',
    ]),
    config_sound_bgm: Object.entries(config.sounds?.bgm || {}).map(([trackId, trackPath]) => [trackId, trackPath || '']),
    config_sound_sfx: Object.entries(config.sounds?.sfx || {}).map(([sfxId, sfxPath]) => [sfxId, sfxPath || '']),
    config_upgrades: Object.entries(config.upgrades || {}).map(([id, upgrade]) => {
      const [effectKey, effectValue] = Object.entries(upgrade.effect || {})[0] || ['', ''];
      return [
        id,
        upgrade.name || '',
        upgrade.description || '',
        upgrade.cost ?? '',
        upgrade.maxLevel ?? '',
        effectKey,
        effectValue,
        upgrade.icon || '',
      ];
    }),
  };
}

async function ensureSchema(accessToken, spreadsheetId, metadata) {
  const sheets = Array.isArray(metadata?.sheets) ? metadata.sheets : [];
  const existingTitles = new Set(sheets.map((sheet) => sheet?.properties?.title).filter(Boolean));
  const requests = [];

  for (const definition of PROJECT_PH_SHEET_DEFINITIONS) {
    if (existingTitles.has(definition.title)) {
      continue;
    }

    const matchedSheet = findExistingSheet(definition, sheets);
    if (matchedSheet?.properties?.sheetId && matchedSheet?.properties?.title) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: matchedSheet.properties.sheetId,
            title: definition.title,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          fields: 'title,gridProperties.frozenRowCount',
        },
      });
      existingTitles.delete(matchedSheet.properties.title);
      existingTitles.add(definition.title);
      continue;
    }

    requests.push({
      addSheet: {
        properties: {
          title: definition.title,
          gridProperties: {
            rowCount: 1000,
            columnCount: Math.max(definition.headers.length + 2, 12),
            frozenRowCount: 1,
          },
        },
      },
    });
  }

  if (requests.length > 0) {
    await batchUpdateSpreadsheet(accessToken, spreadsheetId, requests);
  }

  return requests.length;
}

async function overwriteSheet(accessToken, spreadsheetId, definition, rows) {
  const endColumn = getColumnLetter(definition.headers.length);
  const clearRange = `${quoteSheetTitle(definition.title)}!A:ZZ`;
  const writeRange = `${quoteSheetTitle(definition.title)}!A1:${endColumn}${Math.max(rows.length + 1, 1)}`;

  await clearSheetValues(accessToken, spreadsheetId, clearRange);
  await updateSheetValues(accessToken, spreadsheetId, writeRange, [definition.headers, ...rows], 'RAW');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spreadsheetSource = args.spreadsheet || process.env.PH_SPREADSHEET_URL || process.env.PH_SPREADSHEET_ID;
  if (!spreadsheetSource) {
    printUsageAndExit();
  }

  const session = await createSheetsSession(args.credentials);
  const { spreadsheetId, metadata } = await getSpreadsheetMetadata(session.accessToken, spreadsheetSource);
  const addedSheetCount = await ensureSchema(session.accessToken, spreadsheetId, metadata);
  const rowsBySheet = buildSheetRows();

  for (const definition of PROJECT_PH_SHEET_DEFINITIONS) {
    await overwriteSheet(
      session.accessToken,
      spreadsheetId,
      definition,
      rowsBySheet[definition.key] || [],
    );
  }

  const refreshedMetadata = await getSpreadsheetMetadata(session.accessToken, spreadsheetId);
  const headerNoteRequests = buildHeaderNoteRequests(
    PROJECT_PH_SHEET_DEFINITIONS,
    refreshedMetadata.metadata?.sheets || [],
  );
  if (headerNoteRequests.length > 0) {
    await batchUpdateSpreadsheet(session.accessToken, spreadsheetId, headerNoteRequests);
  }

  console.log('\n📤 Project PH GameData exported to Google Sheets\n');
  console.log(`   서비스 계정: ${session.clientEmail}`);
  console.log(`   시트 ID:      ${spreadsheetId}`);
  console.log(`   신규 탭 수:   ${addedSheetCount}`);
  console.log(`   동기화 탭 수: ${PROJECT_PH_SHEET_DEFINITIONS.length}\n`);

  PROJECT_PH_SHEET_DEFINITIONS.forEach((definition) => {
    console.log(`   - ${definition.title}: ${(rowsBySheet[definition.key] || []).length} row(s)`);
  });
}

main().catch((error) => {
  console.error('\n❌ Google Sheets GameData export failed');
  console.error(error.message || error);
  process.exit(1);
});
