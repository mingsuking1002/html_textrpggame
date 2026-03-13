/**
 * upload-gamedata.js
 * ──────────────────
 * Firestore REST API를 사용하여 data/gamedata/*.json을 GameData 컬렉션에 업로드
 * 관리자 권한이 있는 서비스 계정 OAuth 토큰이 필요함
 *
 * 사용법: node scripts/upload-gamedata.js --credentials "<service-account.json>"
 */

const fs = require('fs');
const path = require('path');

const { createSheetsSession } = require('./google-sheets-client');

const PROJECT_ID = 'textgame-edbd2';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const GAMEDATA_DIR = path.join(__dirname, '..', 'data', 'gamedata');
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const GAME_DATA_DOC_IDS = Object.freeze([
    'config',
    'classes',
    'origins',
    'symbols',
    'monsters',
    'encounters',
    'story',
    'endings',
]);

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
  node scripts/upload-gamedata.js --credentials "<service-account.json>"

또는 환경 변수:
  PH_GOOGLE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS
`);
    process.exit(1);
}

// ─── JSON → Firestore Value 변환 ───

function toFirestoreValue(val) {
    if (val === null || val === undefined) {
        return { nullValue: null };
    }
    if (typeof val === 'string') {
        return { stringValue: val };
    }
    if (typeof val === 'boolean') {
        return { booleanValue: val };
    }
    if (typeof val === 'number') {
        if (Number.isInteger(val)) {
            return { integerValue: String(val) };
        }
        return { doubleValue: val };
    }
    if (Array.isArray(val)) {
        return {
            arrayValue: {
                values: val.map(toFirestoreValue),
            },
        };
    }
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) {
            fields[k] = toFirestoreValue(v);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}

function jsonToFirestoreDoc(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
        fields[k] = toFirestoreValue(v);
    }
    return { fields };
}

// ─── 업로드 함수 ───

async function uploadDocument(collection, docId, data, accessToken) {
    const url = `${BASE_URL}/${collection}/${docId}`;
    const body = jsonToFirestoreDoc(data);
    const headers = {
        'Content-Type': 'application/json',
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to upload ${collection}/${docId}: ${res.status} ${errText}`);
    }

    return res.json();
}

// ─── 메인 ───

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsageAndExit();
    }

    const credentialsPath = args.credentials
        || process.env.PH_GOOGLE_SERVICE_ACCOUNT
        || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
        printUsageAndExit();
    }

    const session = await createSheetsSession(credentialsPath, FIRESTORE_SCOPE);
    const availableFiles = new Set(
        fs.readdirSync(GAMEDATA_DIR).filter((fileName) => fileName.endsWith('.json')),
    );
    const files = [
        ...GAME_DATA_DOC_IDS
            .map((docId) => `${docId}.json`)
            .filter((fileName) => availableFiles.has(fileName)),
        ...Array.from(availableFiles)
            .filter((fileName) => !GAME_DATA_DOC_IDS.includes(path.basename(fileName, '.json')))
            .sort(),
    ];

    console.log(`\n📦 GameData 업로드 시작 (${files.length}개 문서)\n`);
    console.log(`   서비스 계정: ${session.clientEmail}`);
    console.log(`   프로젝트: ${PROJECT_ID}`);
    console.log(`   컬렉션:  GameData`);
    console.log(`   소스:    data/gamedata/\n`);

    let success = 0;
    let failed = 0;
    const failureMessages = [];

    for (const file of files) {
        const docId = path.basename(file, '.json');
        const filePath = path.join(GAMEDATA_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        try {
            await uploadDocument('GameData', docId, data, session.accessToken);
            console.log(`   ✅ GameData/${docId}`);
            success++;
        } catch (err) {
            console.error(`   ❌ GameData/${docId} — ${err.message}`);
            failed++;
            failureMessages.push(err.message || String(err));
        }
    }

    console.log(`\n📊 결과: ${success} 성공, ${failed} 실패\n`);

    if (failed > 0) {
        const hasOnlyPermissionErrors = failureMessages.every((message) => (
            message.includes('PERMISSION_DENIED')
            || message.includes('Missing or insufficient permissions')
        ));

        if (hasOnlyPermissionErrors) {
            console.error(
                '권한 오류: 현재 서비스 계정에는 Firestore GameData 쓰기 IAM 권한이 없습니다. '
                + 'Firestore Rules도 /GameData write 를 false 로 막고 있으므로 관리자 권한 계정으로 실행해야 합니다.',
            );
        }

        process.exitCode = 1;
    }
}

main().catch(console.error);
