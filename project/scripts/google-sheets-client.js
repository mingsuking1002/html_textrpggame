/**
 * google-sheets-client.js
 * ───────────────────────
 * 서비스 계정 JSON 키를 사용해 Google Sheets API를 호출하는 경량 헬퍼
 *
 * 사용처:
 * - 시트 메타데이터 조회
 * - 값 읽기 / 쓰기
 * - 향후 CSV/JSON 변환 스크립트의 공통 인증 계층
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf8');

  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function extractSpreadsheetId(source) {
  if (!source) {
    throw new Error('Spreadsheet id or URL is required.');
  }

  const trimmed = String(source).trim();
  const matched = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return matched ? matched[1] : trimmed;
}

function quoteSheetTitle(sheetTitle) {
  return `'${String(sheetTitle || '').replace(/'/g, "''")}'`;
}

function resolveCredentialsPath(inputPath) {
  const candidate = inputPath
    || process.env.PH_GOOGLE_SERVICE_ACCOUNT
    || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!candidate) {
    throw new Error(
      'Service account key path is required. Pass --credentials or set PH_GOOGLE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }

  return path.resolve(candidate);
}

function loadServiceAccount(inputPath) {
  const credentialsPath = resolveCredentialsPath(inputPath);
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(`Invalid service account key: ${credentialsPath}`);
  }

  return {
    credentialsPath,
    credentials,
  };
}

function createJwtAssertion(credentials, scope = GOOGLE_SHEETS_SCOPE) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: credentials.client_email,
    scope,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), credentials.private_key);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function fetchAccessToken(credentials, scope = GOOGLE_SHEETS_SCOPE) {
  const assertion = createJwtAssertion(credentials, scope);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google OAuth token: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  if (!json.access_token) {
    throw new Error('Google OAuth token response did not include access_token.');
  }

  return json.access_token;
}

async function sheetsApiRequest(accessToken, endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${GOOGLE_SHEETS_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API request failed: ${response.status} ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function createSheetsSession(credentialsPath, scope = GOOGLE_SHEETS_SCOPE) {
  const { credentials, credentialsPath: resolvedPath } = loadServiceAccount(credentialsPath);
  const accessToken = await fetchAccessToken(credentials, scope);

  return {
    accessToken,
    credentialsPath: resolvedPath,
    clientEmail: credentials.client_email,
  };
}

async function getSpreadsheetMetadata(accessToken, spreadsheetSource) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetSource);
  const fields = [
    'spreadsheetId',
    'properties(title,locale,timeZone)',
    'sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))',
  ].join(',');

  const metadata = await sheetsApiRequest(
    accessToken,
    `/${spreadsheetId}?fields=${encodeURIComponent(fields)}`,
  );

  return {
    spreadsheetId,
    metadata,
  };
}

async function getSheetValues(accessToken, spreadsheetSource, range) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetSource);
  const safeRange = encodeURIComponent(range);
  return sheetsApiRequest(
    accessToken,
    `/${spreadsheetId}/values/${safeRange}?majorDimension=ROWS`,
  );
}

async function clearSheetValues(accessToken, spreadsheetSource, range) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetSource);
  const safeRange = encodeURIComponent(range);
  return sheetsApiRequest(
    accessToken,
    `/${spreadsheetId}/values/${safeRange}:clear`,
    {
      method: 'POST',
      body: {},
    },
  );
}

async function batchUpdateSpreadsheet(accessToken, spreadsheetSource, requests) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetSource);
  return sheetsApiRequest(
    accessToken,
    `/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      body: {
        requests,
      },
    },
  );
}

async function updateSheetValues(accessToken, spreadsheetSource, range, values, valueInputOption = 'USER_ENTERED') {
  const spreadsheetId = extractSpreadsheetId(spreadsheetSource);
  const safeRange = encodeURIComponent(range);

  return sheetsApiRequest(
    accessToken,
    `/${spreadsheetId}/values/${safeRange}?valueInputOption=${encodeURIComponent(valueInputOption)}`,
    {
      method: 'PUT',
      body: {
        range,
        majorDimension: 'ROWS',
        values,
      },
    },
  );
}

module.exports = {
  batchUpdateSpreadsheet,
  clearSheetValues,
  GOOGLE_SHEETS_SCOPE,
  createSheetsSession,
  extractSpreadsheetId,
  getSheetValues,
  getSpreadsheetMetadata,
  quoteSheetTitle,
  resolveCredentialsPath,
  updateSheetValues,
};
