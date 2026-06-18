/**
 * node setup-sheets.js
 * Creates / verifies all 7 sheet tabs with clean, linked headers.
 * Safe to re-run — skips sheets that already have headers.
 */
require('dotenv').config();
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.CREDENTIALS_FILE || 'research-analyst-ai-eba40b0ad0e6.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/*
  LINKING KEYS (consistent across all sheets):
  ─────────────────────────────────────────────
  Members   → MemberID  (primary key, format M-<timestamp>)
              MemberName (denormalised for readability)

  Projects  → ProjectCode (primary key, e.g. DUB078)
              ProjectName  (denormalised)

  WorkLog   → links Members via MemberID + MemberName
              links Projects via ProjectCode + ProjectName
              links Discipline from Members.Discipline

  Attendance→ links Members via MemberID + MemberName

  Sessions  → links Members via MemberID + MemberName
              links Projects via ProjectCode + ProjectName

  Issues    → links Members via MemberID + MemberName
              links Projects via ProjectCode (optional)

  Leaves    → links Members via MemberID + MemberName
*/

const TABS = [
  {
    name: 'Members',
    description: 'Master list of team members. MemberID is the primary key used in all other sheets.',
    headers: [
      'MemberID',       // primary key  e.g. M-1749123456789
      'MemberName',     // full name     e.g. Sri Teja
      'Role',           // job title     e.g. Architect / BIM Engineer
      'Discipline',     // Arch / Stru / Mech / Elec / Civil / Plumbing / HVAC
      'Email',          // work email
      'JoinDate',       // YYYY-MM-DD
      'Status'          // Active / Inactive
    ]
  },
  {
    name: 'Projects',
    description: 'Master list of projects. ProjectCode is the primary key used in WorkLog, Sessions, Issues.',
    headers: [
      'ProjectCode',    // primary key   e.g. DUB078
      'ProjectName',    // full name     e.g. Dubai Mall Extension
      'Client',         // client name
      'Description',    // brief description
      'Disciplines',    // comma-separated  e.g. Arch, Stru
      'Status',         // Active / On Hold / Completed
      'CreatedDate',    // YYYY-MM-DD
      'CreatedBy',      // MemberName of who added it
      'Location'        // e.g. Dubai, Abu Dhabi, Site
    ]
  },
  {
    name: 'WorkLog',
    description: 'Daily work entries. Linked to Members (MemberID) and Projects (ProjectCode).',
    headers: [
      'EntryID',        // auto-generated  WL-<timestamp>
      'Date',           // YYYY-MM-DD
      'MemberID',       // FK → Members.MemberID
      'MemberName',     // FK → Members.MemberName  (denormalised)
      'ProjectCode',    // FK → Projects.ProjectCode
      'ProjectName',    // FK → Projects.ProjectName (denormalised)
      'Discipline',     // Arch / Stru / Mech / Elec / Civil / Plumbing / HVAC
      'TaskType',       // from standard task list or custom
      'Description',    // what was actually done
      'AssignedBy',     // MemberName of supervisor (blank = self-directed)
      'StartTime',      // HH:MM (24h)
      'EndTime',        // HH:MM (24h)
      'DurationHours',  // calculated  (EndTime - StartTime)
      'Notes'           // optional
    ]
  },
  {
    name: 'Attendance',
    description: 'Daily attendance records per member. Linked to Members (MemberID).',
    headers: [
      'RecordID',       // auto-generated  AT-<timestamp>
      'Date',           // YYYY-MM-DD
      'MemberID',       // FK → Members.MemberID
      'MemberName',     // FK → Members.MemberName  (denormalised)
      'Status',         // Present / Half-day / Absent / Leave / Weekend
      'InTime',         // HH:MM (24h)  blank if Absent/Leave
      'OutTime',        // HH:MM (24h)  blank if Absent/Leave
      'TotalHours',     // calculated
      'DayType',        // Weekday / Weekend / Holiday
      'Notes',           // optional
      'ClockState',      // active / break / completed
      'BreakStart',      // HH:MM when break began
      'TotalBreakMins'   // accumulated break minutes
    ]
  },
  {
    name: 'Sessions',
    description: 'Work sessions with start/end times per day. Linked to Members and Projects.',
    headers: [
      'SessionID',      // auto-generated  SS-<timestamp>
      'Date',           // YYYY-MM-DD
      'MemberID',       // FK → Members.MemberID
      'MemberName',     // FK → Members.MemberName  (denormalised)
      'ProjectCode',    // FK → Projects.ProjectCode
      'ProjectName',    // FK → Projects.ProjectName (denormalised)
      'Discipline',     // Arch / Stru / Mech / Elec / Civil / Plumbing / HVAC
      'TaskType',       // from standard task list or custom
      'StartTime',      // HH:MM (24h)
      'EndTime',        // HH:MM (24h)
      'DurationMins',   // integer minutes
      'Notes',          // optional
      'AssignedBy'      // member name or custom person who assigned the task
    ]
  },
  {
    name: 'Issues',
    description: 'Idle hours / issue reports. Evidence uploaded to Google Drive. Linked to Members and optionally Projects.',
    headers: [
      'IssueID',        // auto-generated  IS-<timestamp>
      'Date',           // YYYY-MM-DD
      'MemberID',       // FK → Members.MemberID
      'MemberName',     // FK → Members.MemberName  (denormalised)
      'ProjectCode',    // FK → Projects.ProjectCode  (blank = general)
      'IssueType',      // Software Crash / Network / Power Outage / etc.
      'Description',    // what happened
      'EvidenceURL',    // Google Drive file link (auto-uploaded)
      'EvidenceType',   // screenshot / file / text
      'DurationLost',   // hours lost (decimal)
      'Status',         // Open / Resolved
      'ResolvedBy',     // MemberName who resolved
      'ResolvedAt'      // YYYY-MM-DD
    ]
  },
  {
    name: 'Leaves',
    description: 'Leave requests with approval workflow. Linked to Members (MemberID).',
    headers: [
      'LeaveID',        // auto-generated  LV-<timestamp>
      'MemberID',       // FK → Members.MemberID
      'MemberName',     // FK → Members.MemberName  (denormalised)
      'StartDate',      // YYYY-MM-DD
      'EndDate',        // YYYY-MM-DD
      'Days',           // integer day count
      'LeaveType',      // Annual / Sick / Emergency / Unpaid / Compensatory Off / Public Holiday
      'Reason',         // free text
      'Status',         // Pending / Approved / Rejected
      'ApprovedBy',     // MemberName of approver
      'SubmittedAt',    // YYYY-MM-DD submitted
      'Notes'           // optional
    ]
  }
];

async function run() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'your_spreadsheet_id_here') {
    console.error('❌  SPREADSHEET_ID not set in .env'); process.exit(1);
  }

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Get existing sheets
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.map(s => s.properties.title);
  console.log('📋 Existing tabs:', existing.join(', ') || 'none');

  // Create any missing tabs
  const toCreate = TABS.filter(t => !existing.includes(t.name));
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: toCreate.map(t => ({ addSheet: { properties: { title: t.name } } }))
      }
    });
    console.log('✅ Created tabs:', toCreate.map(t => t.name).join(', '));
  }

  // Write or verify headers for each tab
  for (const tab of TABS) {
    const range = `${tab.name}!A1:${String.fromCharCode(65 + tab.headers.length - 1)}1`;
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const curHeaders = (cur.data.values || [[]])[0] || [];

    if (curHeaders.length > 0 && curHeaders[0] === tab.headers[0]) {
      if (curHeaders.length === tab.headers.length) {
        console.log(`⏭  ${tab.name}: headers OK (${curHeaders.length} cols)`);
        continue;
      }
      console.log(`📐 ${tab.name}: updating headers (${curHeaders.length} → ${tab.headers.length} cols)`);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab.name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [tab.headers] }
    });
    console.log(`✅ ${tab.name}: headers written (${tab.headers.length} cols)`);
  }

  // Apply formatting: bold + freeze header row on all tabs
  const metaAfter = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetIds = {};
  metaAfter.data.sheets.forEach(s => { sheetIds[s.properties.title] = s.properties.sheetId; });

  const formatRequests = TABS.flatMap(tab => {
    const sid = sheetIds[tab.name];
    if (sid === undefined) return [];
    return [
      // Bold header row
      {
        repeatCell: {
          range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.16, green: 0.16, blue: 0.22 } } },
          fields: 'userEnteredFormat(textFormat,backgroundColor)'
        }
      },
      // Freeze header row
      {
        updateSheetProperties: {
          properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount'
        }
      }
    ];
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: formatRequests }
  });
  console.log('🎨 Header rows bolded and frozen on all tabs.');

  console.log('\n════════════════════════════════════════');
  console.log('🎉 Sheet setup complete!');
  console.log(`📊 https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  console.log('\n▶ Run: npm start');
  console.log('════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
