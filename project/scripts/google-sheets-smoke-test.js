/**
 * google-sheets-smoke-test.js
 * ───────────────────────────
 * 서비스 계정 키 + 시트 링크로 실제 접근 가능 여부를 확인하는 비파괴 테스트.
 *
 * 사용 예:
 * node scripts/google-sheets-smoke-test.js ^
 *   --credentials "C:\Users\ksh00\Downloads\clean-resource-340311-7c018cda7733.json" ^
 *   --spreadsheet "https://docs.google.com/spreadsheets/d/180Zv2x0BNM0NjNx4a2MAFYl46bz-sRTbNln4sOS0wCU/edit?usp=sharing"
 *
 * 선택 옵션:
 * --range "'Sheet1'!A1:F10"
 */

const {
  createSheetsSession,
  getSheetValues,
  getSpreadsheetMetadata,
  quoteSheetTitle,
} = require('./google-sheets-client');

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
  node scripts/google-sheets-smoke-test.js --credentials "<service-account.json>" --spreadsheet "<sheet-url-or-id>" [--range "'Sheet1'!A1:F10"]

또는 환경 변수:
  PH_GOOGLE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS
  PH_SPREADSHEET_URL / PH_SPREADSHEET_ID
`);
  process.exit(1);
}

function truncateCell(value, maxLength = 40) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function printPreview(values) {
  if (!Array.isArray(values) || values.length === 0) {
    console.log('   (빈 시트)');
    return;
  }

  const previewRows = values.slice(0, 5).map((row) => (
    Array.isArray(row) ? row.map((cell) => truncateCell(cell)) : [truncateCell(row)]
  ));
  console.table(previewRows);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credentialsPath = args.credentials;
  const spreadsheetSource = args.spreadsheet || process.env.PH_SPREADSHEET_URL || process.env.PH_SPREADSHEET_ID;

  if (!spreadsheetSource) {
    printUsageAndExit();
  }

  const session = await createSheetsSession(credentialsPath);
  const { spreadsheetId, metadata } = await getSpreadsheetMetadata(session.accessToken, spreadsheetSource);
  const sheets = Array.isArray(metadata?.sheets) ? metadata.sheets : [];

  console.log('\n📄 Google Sheets smoke test\n');
  console.log(`   서비스 계정: ${session.clientEmail}`);
  console.log(`   키 파일:      ${session.credentialsPath}`);
  console.log(`   시트 ID:      ${spreadsheetId}`);
  console.log(`   제목:         ${metadata?.properties?.title || '(제목 없음)'}`);
  console.log(`   탭 수:        ${sheets.length}\n`);

  if (sheets.length === 0) {
    console.log('시트 탭이 없습니다.');
    return;
  }

  if (args.range) {
    const rangePayload = await getSheetValues(session.accessToken, spreadsheetId, args.range);
    console.log(`▶ 범위 미리보기: ${rangePayload.range || args.range}`);
    printPreview(rangePayload.values);
    return;
  }

  for (const sheet of sheets.slice(0, 3)) {
    const title = sheet?.properties?.title || 'Sheet1';
    const range = `${quoteSheetTitle(title)}!A1:F10`;
    const rangePayload = await getSheetValues(session.accessToken, spreadsheetId, range);
    console.log(`▶ ${title} (${rangePayload.range || range})`);
    printPreview(rangePayload.values);
    console.log('');
  }
}

main().catch((error) => {
  console.error('\n❌ Google Sheets smoke test failed');
  console.error(error.message || error);
  process.exit(1);
});
