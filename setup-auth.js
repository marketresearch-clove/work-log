require('dotenv').config();
const { google } = require('googleapis');
const crypto = require('crypto');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.CREDENTIALS_FILE || 'research-analyst-ai-eba40b0ad0e6.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

async function run() {
  const sheets = await google.sheets({ version: 'v4', auth: await auth.getClient() });

  // 1. Check what tabs exist
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.map(s => s.properties.title);
  console.log('Existing tabs:', existing);

  // 2. Create Settings tab
  if (!existing.includes('Settings')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'Settings' } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: 'Settings!A1',
      valueInputOption: 'RAW', requestBody: { values: [['Key', 'Value']] }
    });
    console.log('Created Settings tab');
  }

  // 3. Create AccessControl tab
  if (!existing.includes('AccessControl')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'AccessControl' } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: 'AccessControl!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [['MemberID', 'MemberName', 'LoginEnabled', 'PinHash']] }
    });
    console.log('Created AccessControl tab');
  }

  // 4. Set default disciplines
  const discs = ['Arch', 'Stru', 'Mech', 'Elec', 'Civil', 'Plumbing', 'HVAC'];
  const settingRows = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID, range: 'Settings!A:B'
  }).then(r => r.data.values || []);
  const discExists = settingRows.slice(1).some(r => r[0] === 'disciplines');
  if (!discExists) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: 'Settings!A:B',
      valueInputOption: 'RAW',
      requestBody: { values: [['disciplines', JSON.stringify(discs)]] }
    });
    console.log('Set default disciplines');
  }

  // 5. Populate AccessControl with existing members (if empty)
  const acRows = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID, range: 'AccessControl'
  }).then(r => r.data.values || []);

  if (acRows.length <= 1) {
    const memberRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: 'Members'
    }).then(r => r.data.values || []);
    const mHeaders = memberRows[0] || [];
    const idIdx = mHeaders.indexOf('MemberID');
    const nameIdx = mHeaders.indexOf('MemberName');
    const statusIdx = mHeaders.indexOf('Status');

    if (idIdx >= 0 && nameIdx >= 0) {
      const members = memberRows.slice(1)
        .filter(r => !statusIdx || r[statusIdx] === 'Active')
        .map(r => [r[idIdx], r[nameIdx], 'false', '']);

      if (members.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID, range: 'AccessControl!A2',
          valueInputOption: 'RAW',
          requestBody: { values: members }
        });
        console.log(`Added ${members.length} members to AccessControl`);
      }
    }
  } else {
    console.log('AccessControl already has data, skipping');
  }

  console.log('\nDone! Restart the server for changes to take effect.');
  console.log(`Admin login: ${process.env.ADMIN_USER || 'subharam.v@clovetech.com'}`);
  console.log('Members can be enabled for login via Settings > Access Control page.\n');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
