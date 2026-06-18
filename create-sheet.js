/**
 * Run once: node create-sheet.js
 * Creates the Google Sheet, sets up all tabs with headers,
 * and shares it with your email so you can view it in the browser.
 */
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.CREDENTIALS_FILE || 'research-analyst-ai-eba40b0ad0e6.json',
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]
});

const SHARE_EMAIL = 'builddesign.3d@clovetech.com'; // your email to view the sheet

const SHEETS = [
  { name: 'Members',    headers: ['ID','Name','Role','Discipline','Email','JoinDate','Status'] },
  { name: 'Projects',   headers: ['Code','Name','Client','Description','Disciplines','Status','CreatedDate','CreatedBy'] },
  { name: 'WorkLog',    headers: ['EntryID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','Description','AssignedBy','StartTime','EndTime','DurationHours','Notes'] },
  { name: 'Attendance', headers: ['RecordID','Date','MemberID','MemberName','Status','InTime','OutTime','TotalHours','DayType','Notes'] },
  { name: 'Sessions',   headers: ['SessionID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','StartTime','EndTime','DurationMins','Notes'] },
  { name: 'Issues',     headers: ['IssueID','Date','MemberID','MemberName','ProjectCode','IssueType','Description','EvidenceURL','EvidenceType','DurationLost','Status','ResolvedBy','ResolvedAt'] },
  { name: 'Leaves',     headers: ['LeaveID','MemberID','MemberName','StartDate','EndDate','Days','LeaveType','Reason','Status','ApprovedBy','SubmittedAt','Notes'] }
];

async function run() {
  console.log('🔑 Authenticating with Google…');
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive  = google.drive({ version: 'v3', auth: client });

  // 1. Create the spreadsheet
  console.log('📄 Creating Google Spreadsheet…');
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Clovetech Work Logger' },
      sheets: SHEETS.map((s, i) => ({
        properties: { sheetId: i, title: s.name, index: i }
      }))
    }
  });

  const spreadsheetId  = created.data.spreadsheetId;
  const spreadsheetUrl = created.data.spreadsheetUrl;
  console.log(`✅ Created: ${spreadsheetUrl}`);

  // 2. Write headers to each sheet
  console.log('📝 Writing headers…');
  const data = SHEETS.map((s, i) => ({
    range: `${s.name}!A1`,
    values: [s.headers]
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data }
  });
  console.log('✅ Headers written to all sheets.');

  // 3. Share with your email so you can open it in browser
  console.log(`📧 Sharing with ${SHARE_EMAIL}…`);
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: 'writer', type: 'user', emailAddress: SHARE_EMAIL },
      sendNotificationEmail: false
    });
    console.log('✅ Shared successfully.');
  } catch (e) {
    console.warn('⚠️  Could not share automatically:', e.message);
    console.warn('   Open the Sheet URL above and share manually if needed.');
  }

  // 4. Save SPREADSHEET_ID into .env
  console.log('💾 Saving SPREADSHEET_ID to .env…');
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/SPREADSHEET_ID=.*/, `SPREADSHEET_ID=${spreadsheetId}`);
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env updated.');

  console.log('\n════════════════════════════════════════');
  console.log('🎉 All done! Your Spreadsheet details:');
  console.log(`   ID  : ${spreadsheetId}`);
  console.log(`   URL : ${spreadsheetUrl}`);
  console.log('\n▶ Now restart the server: npm start');
  console.log('════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
