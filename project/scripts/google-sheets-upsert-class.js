/**
 * google-sheets-upsert-class.js
 * ─────────────────────────────
 * Project PH 클래스 관련 탭(ClassData / ClassWeaponData / ClassStartingData)에
 * 지정한 직업 1개를 upsert한다.
 *
 * 사용 예:
 * node scripts/google-sheets-upsert-class.js ^
 *   --credentials "C:\path\service-account.json" ^
 *   --spreadsheet "https://docs.google.com/spreadsheets/d/.../edit" ^
 *   --id gunner ^
 *   --name "거너" ^
 *   --weapons "crossbow,dagger" ^
 *   --deck "crossbow:2,dagger:2"
 */

const {
  clearSheetValues,
  createSheetsSession,
  getSheetValues,
  quoteSheetTitle,
  updateSheetValues,
} = require('./google-sheets-client');
const { PROJECT_PH_SHEET_TITLES } = require('./google-sheets-project-ph-schema');

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
  node scripts/google-sheets-upsert-class.js --credentials "<service-account.json>" --spreadsheet "<sheet-url-or-id>" --id "<classId>" --name "<className>" [--weapons "crossbow,dagger"] [--deck "crossbow:2,dagger:2"]
`);
  process.exit(1);
}

function toList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseDeck(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [symbolId, countRaw] = entry.split(':').map((piece) => piece.trim());
      const count = Number(countRaw || 1);
      return {
        symbolId,
        count: Number.isFinite(count) && count > 0 ? count : 1,
        sortOrder: index + 1,
      };
    })
    .filter((entry) => entry.symbolId);
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

async function readWholeSheet(accessToken, spreadsheetId, title) {
  const result = await getSheetValues(accessToken, spreadsheetId, `${quoteSheetTitle(title)}!A:ZZ`);
  return Array.isArray(result.values) ? result.values : [];
}

async function overwriteSheet(accessToken, spreadsheetId, title, rows) {
  const width = Math.max(...rows.map((row) => row.length), 1);
  const endColumn = getColumnLetter(width);
  await clearSheetValues(accessToken, spreadsheetId, `${quoteSheetTitle(title)}!A:ZZ`);
  await updateSheetValues(
    accessToken,
    spreadsheetId,
    `${quoteSheetTitle(title)}!A1:${endColumn}${rows.length}`,
    rows,
    'RAW',
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spreadsheetSource = args.spreadsheet || process.env.PH_SPREADSHEET_URL || process.env.PH_SPREADSHEET_ID;
  const classId = String(args.id || '').trim();
  const className = String(args.name || '').trim();

  if (!spreadsheetSource || !classId || !className) {
    printUsageAndExit();
  }

  const session = await createSheetsSession(args.credentials);
  const weapons = toList(args.weapons || 'crossbow,dagger');
  const deck = parseDeck(args.deck || 'crossbow:2,dagger:2');

  const classesRows = await readWholeSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.classes);
  const classWeaponsRows = await readWholeSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.class_weapons);
  const classDeckRows = await readWholeSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.class_starting_deck);

  const classesHeader = classesRows[0] || ['id', 'name', 'icon', 'description', 'base_hp', 'base_gold', 'deck_size', 'theme_color', 'is_enabled'];
  const classWeaponsHeader = classWeaponsRows[0] || ['class_id', 'symbol_id', 'sort_order'];
  const classDeckHeader = classDeckRows[0] || ['class_id', 'symbol_id', 'count', 'sort_order', 'source'];

  const filteredClasses = classesRows.slice(1).filter((row) => row[0] !== classId);
  const filteredWeapons = classWeaponsRows.slice(1).filter((row) => row[0] !== classId);
  const filteredDeck = classDeckRows.slice(1).filter((row) => row[0] !== classId);

  filteredClasses.push([
    classId,
    className,
    args.icon || '',
    args.description || '더미 직업',
    args.baseHp || '',
    args.baseGold || '',
    args.deckSize || '',
    args.themeColor || '',
    'TRUE',
  ]);

  weapons.forEach((symbolId, index) => {
    filteredWeapons.push([classId, symbolId, index + 1]);
  });

  deck.forEach((entry) => {
    filteredDeck.push([classId, entry.symbolId, entry.count, entry.sortOrder, args.source || 'manual-dummy']);
  });

  await overwriteSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.classes, [classesHeader, ...filteredClasses]);
  await overwriteSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.class_weapons, [classWeaponsHeader, ...filteredWeapons]);
  await overwriteSheet(session.accessToken, spreadsheetSource, PROJECT_PH_SHEET_TITLES.class_starting_deck, [classDeckHeader, ...filteredDeck]);

  console.log('\n✅ Class upsert complete\n');
  console.log(`   classId: ${classId}`);
  console.log(`   name:    ${className}`);
  console.log(`   weapons: ${weapons.join(', ')}`);
  console.log(`   deck:    ${deck.map((entry) => `${entry.symbolId}x${entry.count}`).join(', ')}`);
}

main().catch((error) => {
  console.error('\n❌ Class upsert failed');
  console.error(error.message || error);
  process.exit(1);
});
