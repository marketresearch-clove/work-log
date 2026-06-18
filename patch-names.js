/**
 * node patch-names.js
 * Patches Members and Projects sheets with correct names from JUNE 2026 ATTENDANCE.xlsx
 */
require('dotenv').config();
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.CREDENTIALS_FILE || 'research-analyst-ai-eba40b0ad0e6.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => { obj[h] = row[j] || ''; });
    return obj;
  });
}

async function updateRow(sheets, sheetName, rowIndex, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  });
}

// ── Correct data from JUNE 2026 ATTENDANCE.xlsx ──────────────────────────────

const MEMBER_PATCHES = [
  { id: 'CLOVE-2052', name: 'Kanuri Sri Teja',                  role: 'BIM Engineer',    discipline: 'Mech',  status: 'Active' },
  { id: 'CLOVE-2958', name: 'Guggilapu Tejaswini',              role: 'BIM Engineer',    discipline: 'Arch',  status: 'Active' },
  { id: 'CLOVE-3198', name: 'Egalapati Sai Phani Kumar',        role: 'BIM Engineer',    discipline: 'Arch',  status: 'Active' },
  { id: 'CLOVE-3065', name: 'Bhogavarapu Dileep Krishna Kumar', role: 'BIM Engineer',    discipline: 'Arch',  status: 'Active' },
  { id: 'CLOVE-3145', name: 'Piriya Rahul',                     role: 'BIM Coordinator', discipline: 'Civil', status: 'Active' },
  { id: 'TRAINEE',    name: 'Indira',                           role: 'BIM Trainee',     discipline: 'Arch',  status: 'Active' },
];

// Project names derived from Excel task context:
// DUB = Dubai projects, ZAZ = Zaza projects
// Disciplines inferred from assigned tasks in Sheet1
const PROJECT_PATCHES = [
  {
    code: 'DUB078',
    name: 'Dubai Project 078',
    client: 'Dubai',
    description: 'MEP / BIM coordination — Mechanical Revit files, ACC model binding, system types & view filters',
    disciplines: 'Mech, Arch',
    status: 'Active',
  },
  {
    code: 'DUB090',
    name: 'Dubai Project 090',
    client: 'Dubai',
    description: '3D upgradation — Civil, Structural and Architectural files review',
    disciplines: 'Arch, Civil, Stru',
    status: 'Active',
  },
  {
    code: 'DUB094',
    name: 'Dubai Project 094',
    client: 'Dubai',
    description: '3D modelling / upgradation',
    disciplines: 'Arch',
    status: 'Active',
  },
  {
    code: 'ZAZ060',
    name: 'ZAZ Project 060',
    client: 'ZAZ',
    description: 'Revit sheet creation & tagging',
    disciplines: 'Arch',
    status: 'Active',
  },
  {
    code: 'ZAZ061',
    name: 'ZAZ Project 061',
    client: 'ZAZ',
    description: '2D & 3D modelling — spreadsheet review',
    disciplines: 'Arch',
    status: 'Active',
  },
  {
    code: 'ZAZ062',
    name: 'ZAZ Project 062',
    client: 'ZAZ',
    description: 'Spreadsheet review, AutoCAD layer changes',
    disciplines: 'Civil',
    status: 'Active',
  },
];

async function run() {
  console.log('\n🔧 Patching Members and Projects sheets…\n');
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // ── Patch Members ─────────────────────────────────────────────────────────
  const memberRows = rowsToObjects(
    (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Members!A:Z' })).data.values
  );
  for (const patch of MEMBER_PATCHES) {
    const existing = memberRows.find(r => r.MemberID === patch.id);
    if (!existing) { console.log(`  ⚠  Member ${patch.id} not found`); continue; }
    await updateRow(sheets, 'Members', existing._rowIndex, [
      patch.id, patch.name, patch.role, patch.discipline,
      existing.Email || '', existing.JoinDate || '2026-01-01', patch.status
    ]);
    console.log(`  ✅ Member ${patch.id} → ${patch.name}`);
  }

  // ── Patch Projects ────────────────────────────────────────────────────────
  const projectRows = rowsToObjects(
    (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Projects!A:Z' })).data.values
  );
  for (const patch of PROJECT_PATCHES) {
    const existing = projectRows.find(r => r.ProjectCode === patch.code);
    if (!existing) { console.log(`  ⚠  Project ${patch.code} not found`); continue; }
    await updateRow(sheets, 'Projects', existing._rowIndex, [
      patch.code, patch.name, patch.client, patch.description,
      patch.disciplines, patch.status, existing.CreatedDate || '2026-06-01', existing.CreatedBy || ''
    ]);
    console.log(`  ✅ Project ${patch.code} → ${patch.name} [${patch.disciplines}]`);
  }

  console.log('\n🎉 Patch complete!\n');
}

run().catch(err => {
  console.error('❌ Patch failed:', err.message);
  process.exit(1);
});
