import { google } from 'googleapis';

const REQUIRED_COLUMNS = ['Event Title', 'Location', 'Date', 'Start Time', 'End Time', 'description', 'Message ID'];

function columnLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export class EventSheet {
  constructor({ credentialsJson, spreadsheetId, sheetName }) {
    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName || 'Sheet1';
    this.headerMap = null;
    this.sheetId = null;
  }

  async init() {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets.find(s => s.properties.title === this.sheetName);
    if (!sheet) throw new Error(`Sheet tab "${this.sheetName}" not found in spreadsheet`);
    this.sheetId = sheet.properties.sheetId;

    const headerRes = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!1:1`,
    });
    const headers = headerRes.data.values?.[0] || [];
    this.headerMap = {};
    headers.forEach((h, i) => { this.headerMap[h.trim()] = i; });

    const missing = REQUIRED_COLUMNS.filter(c => !(c in this.headerMap));
    if (missing.length) {
      throw new Error(
        `Sheet is missing required column(s): ${missing.join(', ')}. ` +
        `Add these headers to row 1 of the "${this.sheetName}" tab.`
      );
    }
  }

  rowFromEvent(event) {
    const width = Math.max(...Object.values(this.headerMap)) + 1;
    const row = new Array(width).fill('');
    row[this.headerMap['Event Title']] = event.title;
    row[this.headerMap['Location']] = event.location;
    row[this.headerMap['Date']] = event.date;
    row[this.headerMap['Start Time']] = event.startTime;
    row[this.headerMap['End Time']] = event.endTime;
    row[this.headerMap['description']] = event.description;
    row[this.headerMap['Message ID']] = event.messageId;
    if ('RSVP ?' in this.headerMap) row[this.headerMap['RSVP ?']] = event.rsvpUrl || '';
    if ('Posted At' in this.headerMap) row[this.headerMap['Posted At']] = event.postedAt || '';
    return row;
  }

  async appendEvent(event) {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [this.rowFromEvent(event)] },
    });
  }

  async findRowNumberByMessageId(messageId) {
    const idCol = this.headerMap['Message ID'];
    const range = `${this.sheetName}!${columnLetter(idCol)}2:${columnLetter(idCol)}`;
    const res = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range });
    const rows = res.data.values || [];
    const offset = rows.findIndex(r => r[0] === messageId);
    return offset === -1 ? null : offset + 2; // +2: 1-indexed, header is row 1
  }

  async updateEventByMessageId(messageId, event) {
    const rowNumber = await this.findRowNumberByMessageId(messageId);
    if (rowNumber === null) return false;

    const width = Math.max(...Object.values(this.headerMap)) + 1;
    const range = `${this.sheetName}!A${rowNumber}:${columnLetter(width - 1)}${rowNumber}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [this.rowFromEvent(event)] },
    });
    return true;
  }

  async deleteEventByMessageId(messageId) {
    const rowNumber = await this.findRowNumberByMessageId(messageId);
    if (rowNumber === null) return false;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: this.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        }],
      },
    });
    return true;
  }
}
