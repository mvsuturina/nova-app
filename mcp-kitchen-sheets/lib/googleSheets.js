const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function isConfigured() {
  return Boolean(SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

let sheetsClientPromise = null;

async function getSheetsClient() {
  if (!isConfigured()) {
    throw new Error('GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON не заданы в .env');
  }
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      return google.sheets({ version: 'v4', auth });
    })();
  }
  return sheetsClientPromise;
}

function colLetter(index) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA ...
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Читает лист целиком. Некоторые листы этой таблицы начинаются с 1-2 строк
// заголовка/подзаголовка (одна ячейка в строке) и только потом идёт настоящая
// строка колонок — поэтому не берём rows[0] как заголовки, а ищем первую строку
// с 2+ заполненными ячейками. Каждая строка данных → объект {заголовок: значение}
// плюс служебное _row — номер строки в самом листе, 1-indexed, для update_row.
async function readSheet(tab) {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:ZZ`,
  });

  const rows = data.values || [];
  if (rows.length === 0) return { headers: [], rows: [] };

  let headerIdx = 0;
  while (headerIdx < rows.length && (rows[headerIdx]?.length ?? 0) <= 1) headerIdx++;
  if (headerIdx >= rows.length) return { headers: [], rows: [] };

  const headers = rows[headerIdx];
  const items = rows.slice(headerIdx + 1).map((row, i) => {
    const obj = { _row: headerIdx + 2 + i };
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  });

  return { headers, rows: items };
}

async function findRow(tab, column, value) {
  const { rows } = await readSheet(tab);
  return rows.filter(r => String(r[column] ?? '').trim().toLowerCase() === String(value).trim().toLowerCase());
}

// valuesObj — {заголовок: значение}. Порядок колонок берётся из текущих заголовков листа.
async function appendRow(tab, valuesObj) {
  const sheets = await getSheetsClient();
  const { headers } = await readSheet(tab);
  const row = headers.map(h => valuesObj[h] ?? '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function updateRow(tab, rowNumber, valuesObj) {
  const sheets = await getSheetsClient();
  const { headers } = await readSheet(tab);

  const requests = Object.entries(valuesObj)
    .map(([header, value]) => {
      const colIdx = headers.indexOf(header);
      if (colIdx === -1) return null;
      return { range: `${tab}!${colLetter(colIdx)}${rowNumber}`, values: [[value]] };
    })
    .filter(Boolean);

  if (!requests.length) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: requests },
  });
}

module.exports = { isConfigured, readSheet, findRow, appendRow, updateRow };
