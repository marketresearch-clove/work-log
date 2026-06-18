/**
 * node import-excel.js
 * Imports JUNE 2026 ATTENDANCE.xlsx → Google Sheets
 */
require('dotenv').config();
const XLSX   = require('xlsx');
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.CREDENTIALS_FILE || 'research-analyst-ai-eba40b0ad0e6.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ── Helpers ──────────────────────────────────────────────────────────────────

function excelDateToISO(serial) {
  // Excel serial to YYYY-MM-DD (UTC)
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().split('T')[0];
}

function parseTime(val) {
  // val can be:
  //   0.11875  → Excel time fraction → 02:51
  //   2.54     → HH.MM notation     → 02:54
  //   11.29    → HH.MM notation     → 11:29
  if (val === '' || val === null || val === undefined) return '';
  const num = parseFloat(val);
  if (isNaN(num)) return '';
  if (num < 1) {
    // Excel fraction of day
    const totalMins = Math.round(num * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  } else {
    // HH.MM where decimal = minutes (not fraction of hour)
    const h = Math.floor(num);
    const m = Math.round((num - h) * 100);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - sh * 60 - sm;
  if (mins <= 0) return '';
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function normaliseProjectCode(raw) {
  // Extract first project code from strings like "ZAZ061 & DUB078" or "DUB090  + DUB078"
  if (!raw) return '';
  return raw.trim().split(/[&+,\/]/)[0].trim().replace(/\s+/g, '').toUpperCase();
}

function mapTaskType(desc) {
  const d = (desc || '').toUpperCase();
  if (d.includes('ACC') || d.includes('BINDING'))                    return 'ACC Model Binding';
  if (d.includes('SYSTEM TYPE') || d.includes('VIEW FILTER'))        return 'System Types & View Filters';
  if (d.includes('LAYER') || d.includes('AUTOCAD'))                  return 'AutoCAD Layer Changes';
  if (d.includes('REVIT') && (d.includes('SHEET') || d.includes('TAG'))) return 'Revit Sheet Creation & Tagging';
  if (d.includes('FILE CONTROL') || d.includes('CONSOLIDAT'))       return 'File Control / Consolidation';
  if (d.includes('3D') || d.includes('UPGRAD') || d.includes('MODEL')) return '3D Modelling / Upgradation';
  if (d.includes('SPREAD') || d.includes('2D') || d.includes('REVIEW')) return '2D File Review / Spreadsheet';
  return desc; // keep original if no match
}

function mapDiscipline(desc, empName) {
  const d = (desc || '').toUpperCase();
  if (d.includes('(MECH)') || d.includes('MECH ')) return 'Mech';
  if (d.includes('CIVIL'))                          return 'Civil';
  if (d.includes('STRU'))                           return 'Stru';
  if (d.includes('ELEC'))                           return 'Elec';
  if (d.includes('PLUMB'))                          return 'Plumbing';
  if (d.includes('HVAC'))                           return 'HVAC';
  // default by employee known discipline
  const name = (empName || '').toUpperCase();
  if (name.includes('SRI TEJA'))   return 'Mech';
  if (name.includes('TEJASWINI'))  return 'Arch';
  if (name.includes('PHANI'))      return 'Arch';
  if (name.includes('DILEEP'))     return 'Arch';
  if (name.includes('RAHUL'))      return 'Civil';
  if (name.includes('INDIRA'))     return 'Arch';
  return 'Arch';
}

// ── Master member data ────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 'CLOVE-2052', name: 'Kanuri Sri Teja',                  shortName: 'K SRI TEJA',   role: 'BIM Engineer',         discipline: 'Mech'  },
  { id: 'CLOVE-2958', name: 'Guggilapu Tejaswini',              shortName: 'TEJASWINI',    role: 'BIM Engineer',         discipline: 'Arch'  },
  { id: 'CLOVE-3198', name: 'Egalapati Sai Phani Kumar',        shortName: 'PHANI',        role: 'BIM Engineer',         discipline: 'Arch'  },
  { id: 'CLOVE-3065', name: 'Bhogavarapu Dileep Krishna Kumar', shortName: 'DILEEP',       role: 'BIM Engineer',         discipline: 'Arch'  },
  { id: 'CLOVE-3145', name: 'Piriya Rahul',                     shortName: 'RAHUL',        role: 'BIM Coordinator',      discipline: 'Civil' },
  { id: 'TRAINEE',    name: 'Indira',                           shortName: 'INDIRA',       role: 'BIM Trainee',          discipline: 'Arch'  }
];

// Map employee ID → member record
const memberById   = {};
const memberByName = {};
MEMBERS.forEach(m => {
  memberById[m.id.toUpperCase()]     = m;
  memberByName[m.name.toUpperCase()] = m;
});

function resolveMember(empId, empName) {
  const m = memberById[(empId || '').toUpperCase()] ||
            memberByName[(empName || '').toUpperCase()] ||
            MEMBERS.find(x => (empName || '').toUpperCase().includes(x.shortName));
  return m || { id: empId || 'UNKNOWN', name: empName || 'Unknown', discipline: 'Arch' };
}

// ── Read Excel ────────────────────────────────────────────────────────────────
const wb   = XLSX.readFile('JUNE 2026 ATTENDANCE.xlsx');
const attSheet = XLSX.utils.sheet_to_json(wb.Sheets['JUNE 2026'], { header: 1, defval: '' });
const wlSheet  = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'],    { header: 1, defval: '' });

// ── Build data arrays ─────────────────────────────────────────────────────────

// 1. MEMBERS rows
const membersRows = MEMBERS.map(m => [
  m.id, m.name, m.role, m.discipline, '', '2026-01-01', 'Active'
]);

// 2. PROJECTS — collect unique codes from worklog
const projectSet = {};
wlSheet.slice(1).forEach(r => {
  if (!r[0]) return;
  const raw = String(r[3] || '');
  // split on & + , /
  raw.split(/[&+,\/]/).forEach(part => {
    const code = part.trim().replace(/\s+/g,'').toUpperCase();
    if (code && /^[A-Z]{2,4}\d{2,4}/.test(code)) projectSet[code] = true;
  });
});
const projectRows = Object.keys(projectSet).sort().map(code => [
  code, code, '', '', '', 'Active', '2026-06-01', ''
]);

// 3. ATTENDANCE — from the JUNE 2026 calendar sheet
// Header row: [No., Member Name, M1, T2, W3, T4, F5, S6, S7, M8 ...]
// Day columns start at index 2
const attHeader = attSheet[0]; // ["No.","Member Name","M1","T2",...]
const ATT_STATUS_MAP = {
  'P': 'Present', 'P/2': 'Half-day', 'W': 'Weekend',
  'A': 'Absent', 'L': 'Leave', '': ''
};
const attendanceRows = [];

attSheet.slice(1).forEach(row => {
  if (!row[1]) return;
  const shortName = String(row[1]).toUpperCase();
  const member = MEMBERS.find(m => shortName.includes(m.shortName)) || { id: 'UNKNOWN', name: row[1] };

  // columns 2..31 = days 1..30 of June 2026
  for (let col = 2; col <= 31; col++) {
    const dayNum = col - 1; // 1-based day
    const cellVal = String(row[col] || '').trim();
    if (!cellVal) continue; // blank = no data yet

    const dateStr = `2026-06-${String(dayNum).padStart(2,'0')}`;
    const dayOfWeek = new Date(dateStr).getDay(); // 0=Sun,6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    let status = ATT_STATUS_MAP[cellVal] || cellVal;
    if (cellVal === 'W') status = 'Weekend';
    else if (cellVal === 'P') status = 'Present';
    else if (cellVal === 'P/2') status = 'Half-day';
    else if (cellVal === 'A') status = 'Absent';
    else if (cellVal === 'L') status = 'Leave';

    const recId = `AT-${dateStr.replace(/-/g,'')}-${member.id}`;
    attendanceRows.push([
      recId, dateStr, member.id, member.name,
      status, '', '', '', isWeekend ? 'Weekend' : 'Weekday', ''
    ]);
  }
});

// 4. WORKLOG + SESSIONS — from Sheet1
const worklogRows  = [];
const sessionsRows = [];

wlSheet.slice(1).forEach((r, idx) => {
  if (!r[0] || !r[1]) return;

  const dateSerial = parseFloat(r[0]);
  if (isNaN(dateSerial)) return;

  const dateStr   = excelDateToISO(dateSerial);
  const empId     = String(r[2] || '').trim();
  const empName   = String(r[1] || '').trim();
  const projectRaw = String(r[3] || '').trim();
  const taskRaw   = String(r[4] || '').trim();
  const assignedBy = String(r[5] || '').trim();
  const inRaw     = r[6];
  const outRaw    = r[7];

  const member    = resolveMember(empId, empName);
  const projCode  = normaliseProjectCode(projectRaw);
  const taskType  = mapTaskType(taskRaw);
  const discipline = mapDiscipline(taskRaw, empName);
  const startTime = parseTime(inRaw);
  const endTime   = parseTime(outRaw);
  const duration  = calcDuration(startTime, endTime);

  const entryId = `WL-${dateStr.replace(/-/g,'')}-${String(idx).padStart(3,'0')}`;
  worklogRows.push([
    entryId, dateStr, member.id, member.name,
    projCode, projectRaw, discipline, taskType,
    taskRaw, assignedBy,
    startTime, endTime, duration, ''
  ]);

  // Also add a Session row if we have valid times
  if (startTime && endTime) {
    const durationMins = duration ? Math.round(parseFloat(duration) * 60) : '';
    const sessId = `SS-${dateStr.replace(/-/g,'')}-${String(idx).padStart(3,'0')}`;
    sessionsRows.push([
      sessId, dateStr, member.id, member.name,
      projCode, projectRaw, discipline, taskType,
      startTime, endTime, durationMins, ''
    ]);
  }
});

// ── Write to Google Sheets ────────────────────────────────────────────────────
async function writeSheet(sheets, sheetName, rows, startRow = 2) {
  if (!rows.length) { console.log(`  ⏭  ${sheetName}: no rows to write`); return; }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${startRow}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });
  console.log(`  ✅ ${sheetName}: ${rows.length} rows imported`);
}

async function clearDataRows(sheets, sheetName) {
  // Clear from row 2 downward (preserve header)
  try {
    const cur = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A2:Z`
    });
    if (cur.data.values && cur.data.values.length > 0) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A2:Z`
      });
      console.log(`  🗑  ${sheetName}: cleared existing data`);
    }
  } catch (e) { /* sheet may be empty */ }
}

async function run() {
  console.log('\n🚀 Starting import from JUNE 2026 ATTENDANCE.xlsx\n');
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Clear and reimport each sheet
  for (const [name, rows] of [
    ['Members',    membersRows],
    ['Projects',   projectRows],
    ['WorkLog',    worklogRows],
    ['Attendance', attendanceRows],
    ['Sessions',   sessionsRows]
  ]) {
    await clearDataRows(sheets, name);
    await writeSheet(sheets, name, rows);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 Import complete!');
  console.log(`   Members:    ${membersRows.length} records`);
  console.log(`   Projects:   ${projectRows.length} records`);
  console.log(`   WorkLog:    ${worklogRows.length} records`);
  console.log(`   Attendance: ${attendanceRows.length} records`);
  console.log(`   Sessions:   ${sessionsRows.length} records`);
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  console.log('════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌ Import failed:', err.message);
  process.exit(1);
});
