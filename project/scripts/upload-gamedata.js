/**
 * upload-gamedata.js
 * ──────────────────
 * Firestore REST API를 사용하여 data/gamedata/*.json을 GameData 컬렉션에 업로드
 * 테스트 모드에서 동작 (인증 불필요)
 *
 * 사용법: node scripts/upload-gamedata.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'textgame-edbd2';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const GAMEDATA_DIR = path.join(__dirname, '..', 'data', 'gamedata');

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

async function uploadDocument(collection, docId, data) {
    const url = `${BASE_URL}/${collection}/${docId}`;
    const body = jsonToFirestoreDoc(data);

    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    const files = fs.readdirSync(GAMEDATA_DIR).filter((f) => f.endsWith('.json'));

    console.log(`\n📦 GameData 업로드 시작 (${files.length}개 문서)\n`);
    console.log(`   프로젝트: ${PROJECT_ID}`);
    console.log(`   컬렉션:  GameData`);
    console.log(`   소스:    data/gamedata/\n`);

    let success = 0;
    let failed = 0;

    for (const file of files) {
        const docId = path.basename(file, '.json');
        const filePath = path.join(GAMEDATA_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        try {
            await uploadDocument('GameData', docId, data);
            console.log(`   ✅ GameData/${docId}`);
            success++;
        } catch (err) {
            console.error(`   ❌ GameData/${docId} — ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 결과: ${success} 성공, ${failed} 실패\n`);
}

main().catch(console.error);
