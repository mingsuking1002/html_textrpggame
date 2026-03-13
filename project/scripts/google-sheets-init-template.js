/**
 * google-sheets-init-template.js
 * ──────────────────────────────
 * Project PH용 Google Sheets 탭/헤더 템플릿을 생성한다.
 *
 * 동작 원칙:
 * - 기본 비어 있는 `시트1`은 첫 템플릿 탭으로 재사용
 * - 이미 있는 탭은 삭제하지 않음
 * - 헤더가 비어 있는 탭에만 기본 헤더를 씀
 *
 * 사용 예:
 * node scripts/google-sheets-init-template.js ^
 *   --credentials "C:\Users\ksh00\Downloads\clean-resource-340311-7c018cda7733.json" ^
 *   --spreadsheet "https://docs.google.com/spreadsheets/d/180Zv2x0BNM0NjNx4a2MAFYl46bz-sRTbNln4sOS0wCU/edit?usp=sharing"
 */

const {
  batchUpdateSpreadsheet,
  createSheetsSession,
  getSheetValues,
  getSpreadsheetMetadata,
  quoteSheetTitle,
  updateSheetValues,
} = require('./google-sheets-client');
const { PROJECT_PH_SHEET_DEFINITIONS } = require('./google-sheets-project-ph-schema');

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
  node scripts/google-sheets-init-template.js --credentials "<service-account.json>" --spreadsheet "<sheet-url-or-id>"

또는 환경 변수:
  PH_GOOGLE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS
  PH_SPREADSHEET_URL / PH_SPREADSHEET_ID
`);
  process.exit(1);
}

function isDefaultSheetTitle(title) {
  return ['Sheet1', '시트1', 'Sheet', '시트'].includes(String(title || '').trim());
}

function findExistingSheet(definition, sheets) {
  const acceptedTitles = [definition.title, ...(definition.aliases || [])];
  return sheets.find((sheet) => acceptedTitles.includes(sheet?.properties?.title));
}

async function detectExistingHeaders(accessToken, spreadsheetId, sheetTitle) {
  const range = `${quoteSheetTitle(sheetTitle)}!1:1`;
  const result = await getSheetValues(accessToken, spreadsheetId, range);
  const [headerRow] = Array.isArray(result.values) ? result.values : [];
  return Array.isArray(headerRow) ? headerRow : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spreadsheetSource = args.spreadsheet || process.env.PH_SPREADSHEET_URL || process.env.PH_SPREADSHEET_ID;

  if (!spreadsheetSource) {
    printUsageAndExit();
  }

  const session = await createSheetsSession(args.credentials);
  const { spreadsheetId, metadata } = await getSpreadsheetMetadata(session.accessToken, spreadsheetSource);
  const sheets = Array.isArray(metadata?.sheets) ? metadata.sheets : [];
  const existingTitles = new Set(sheets.map((sheet) => sheet?.properties?.title).filter(Boolean));
  const requests = [];
  const createdTitles = [];
  const reusedTitles = [];

  const firstTemplate = PROJECT_PH_SHEET_DEFINITIONS[0];
  const firstSheet = sheets[0]?.properties || null;
  if (
    firstSheet
    && sheets.length === 1
    && isDefaultSheetTitle(firstSheet.title)
    && !existingTitles.has(firstTemplate.title)
  ) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: firstSheet.sheetId,
          title: firstTemplate.title,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'title,gridProperties.frozenRowCount',
      },
    });
    existingTitles.delete(firstSheet.title);
    existingTitles.add(firstTemplate.title);
    reusedTitles.push(`${firstSheet.title} → ${firstTemplate.title}`);
  }

  for (const template of PROJECT_PH_SHEET_DEFINITIONS) {
    if (existingTitles.has(template.title)) {
      continue;
    }

    const matchedSheet = findExistingSheet(template, sheets);
    if (matchedSheet?.properties?.sheetId && matchedSheet?.properties?.title) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: matchedSheet.properties.sheetId,
            title: template.title,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          fields: 'title,gridProperties.frozenRowCount',
        },
      });
      existingTitles.delete(matchedSheet.properties.title);
      existingTitles.add(template.title);
      reusedTitles.push(`${matchedSheet.properties.title} → ${template.title}`);
      continue;
    }

    requests.push({
      addSheet: {
        properties: {
          title: template.title,
          gridProperties: {
            rowCount: 1000,
            columnCount: Math.max(template.headers.length + 2, 12),
            frozenRowCount: 1,
          },
        },
      },
    });
    existingTitles.add(template.title);
    createdTitles.push(template.title);
  }

  if (requests.length > 0) {
    await batchUpdateSpreadsheet(session.accessToken, spreadsheetId, requests);
  }

  const headerWrites = [];
  for (const template of PROJECT_PH_SHEET_DEFINITIONS) {
    const currentHeaders = await detectExistingHeaders(session.accessToken, spreadsheetId, template.title);
    if (currentHeaders.length === 0) {
      const range = `${quoteSheetTitle(template.title)}!A1:${String.fromCharCode(64 + template.headers.length)}1`;
      await updateSheetValues(session.accessToken, spreadsheetId, range, [template.headers], 'RAW');
      headerWrites.push(template.title);
    }
  }

  console.log('\n🧩 Google Sheets template init complete\n');
  console.log(`   서비스 계정: ${session.clientEmail}`);
  console.log(`   시트 ID:      ${spreadsheetId}`);
  console.log(`   제목:         ${metadata?.properties?.title || '(제목 없음)'}`);
  console.log(`   생성 탭 수:   ${createdTitles.length}`);
  console.log(`   헤더 입력 수: ${headerWrites.length}\n`);

  if (reusedTitles.length > 0) {
    console.log(`   재사용 탭:    ${reusedTitles.join(', ')}`);
  }
  if (createdTitles.length > 0) {
    console.log(`   생성 탭:      ${createdTitles.join(', ')}`);
  }
  if (headerWrites.length > 0) {
    console.log(`   헤더 작성:    ${headerWrites.join(', ')}`);
  }
  if (createdTitles.length === 0 && headerWrites.length === 0) {
    console.log('   변경 없음: 이미 템플릿 탭/헤더가 준비되어 있습니다.');
  }
}

main().catch((error) => {
  console.error('\n❌ Google Sheets template init failed');
  console.error(error.message || error);
  process.exit(1);
});
