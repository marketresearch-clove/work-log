require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Session helpers (stateless HMAC-signed tokens — works with serverless) ────
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET && process.env.NETLIFY === 'true') {
  console.warn('⚠️  SESSION_SECRET not set in Netlify env vars — tokens will break on cold starts. Set a static SESSION_SECRET in your Netlify dashboard.');
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function encodeToken(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function decodeToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (Date.now() > payload.expires) return null;
    return { userId: payload.userId, role: payload.role, name: payload.name };
  } catch { return null; }
}

function createSession(userId, role, name) {
  return encodeToken({ userId, role, name, expires: Date.now() + SESSION_DURATION });
}

function getSession(token) {
  return decodeToken(token);
}

// ─── Google Auth ──────────────────────────────────────────────────────────────
const _googleAuthOpts = (() => {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try { return { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes }; }
    catch (e) { console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message); }
  }
  const keyFile = process.env.CREDENTIALS_FILE || require('path').join(__dirname, 'research-analyst-ai-eba40b0ad0e6.json');
  return { keyFile, scopes };
})();
const auth = new google.auth.GoogleAuth(_googleAuthOpts);

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const ROOT_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '0AM8K3cs4tz4RUk9PVA';

// ─── API client singletons (avoid re-authenticating every request) ────────────
let _sheetsClient = null;
let _driveClient  = null;

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const client = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: client });
  return _sheetsClient;
}

async function getDriveClient() {
  if (_driveClient) return _driveClient;
  const client = await auth.getClient();
  _driveClient = google.drive({ version: 'v3', auth: client });
  return _driveClient;
}

// ─── In-memory sheet cache (30 s TTL, invalidated on every write) ─────────────
const _sheetCache = new Map();
const CACHE_TTL = 30 * 1000;

function getCached(key) {
  const e = _sheetCache.get(key);
  if (!e || Date.now() > e.exp) { _sheetCache.delete(key); return null; }
  return e.data;
}
function setCached(key, data, ttl = CACHE_TTL) {
  _sheetCache.set(key, { data, exp: Date.now() + ttl });
}
function invalidate(...keys) {
  keys.forEach(k => _sheetCache.delete(k));
}

// ─── Sheet-ID map cache (needed by deleteRow; rarely changes) ─────────────────
let _sheetIdMap = null;
let _sheetIdMapExp = 0;

async function getSheetIdMap() {
  if (_sheetIdMap && Date.now() < _sheetIdMapExp) return _sheetIdMap;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  _sheetIdMap = {};
  meta.data.sheets.forEach(s => { _sheetIdMap[s.properties.title] = s.properties.sheetId; });
  _sheetIdMapExp = Date.now() + 10 * 60 * 1000; // 10 minutes
  return _sheetIdMap;
}

// ─── Sheets helpers ───────────────────────────────────────────────────────────
async function getSheetData(sheetName) {
  const cached = getCached(sheetName);
  if (cached) return cached;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName
  });
  const data = res.data.values || [];
  setCached(sheetName, data);
  return data;
}

async function appendRow(sheetName, values) {
  const sheets = await getSheetsClient();
  invalidate(sheetName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function updateRow(sheetName, rowIndex, values) {
  const sheets = await getSheetsClient();
  invalidate(sheetName);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function deleteRow(sheetName, rowIndex) {
  const sheets = await getSheetsClient();
  const sheetIds = await getSheetIdMap();
  const sheetId = sheetIds[sheetName];
  if (sheetId === undefined) throw new Error('Sheet not found: ' + sheetName);
  invalidate(sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex - 1,
            endIndex: rowIndex
          }
        }
      }]
    }
  });
}

// ─── Settings sheet helpers ────────────────────────────────────────────────────
async function getSetting(key) {
  try {
    const rows = await getSheetData('Settings');
    const r = rows.slice(1).find(r => r[0] === key);
    return r ? r[1] : null;
  } catch { return null; }
}

async function setSetting(key, value) {
  const sheets = await getSheetsClient();
  const rows = await getSheetData('Settings');
  const idx = rows.slice(1).findIndex(r => r[0] === key);
  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Settings!A${idx + 2}:B${idx + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value]] }
    });
  } else {
    await appendRow('Settings', [key, value]);
  }
}

// ─── Auth middleware ────────────────────────────────────────────────────────────
const PUBLIC_PATHS = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'GET',  path: '/api/auth/me'    },
  { method: 'GET',  path: '/api/members/names' },
];

function authMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const isPublic = PUBLIC_PATHS.some(p => p.method === req.method && p.path === req.path);
  if (isPublic) return next();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.session = session;
  next();
}
app.use(authMiddleware);

// ─── Public endpoint: member names for login dropdown ─────────────────────────
app.get('/api/members/names', async (req, res) => {
  try {
    const rows = await getSheetData('Members');
    const headers = rows[0] || [];
    const nameIdx = headers.indexOf('MemberName');
    const statusIdx = headers.indexOf('Status');
    const names = rows.slice(1)
      .filter(r => statusIdx < 0 || r[statusIdx] === 'Active')
      .map(r => r[nameIdx])
      .filter(Boolean);
    res.json(names);
  } catch { res.json([]); }
});

// ─── Auth routes ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { type, username, password, memberName, pin } = req.body;

  if (type === 'admin') {
    const admins = [
      { user: process.env.ADMIN_USER || 'admin', pass: process.env.ADMIN_PASSWORD || 'clovetech2026' },
      ...(process.env.ADMIN_USER_2 ? [{ user: process.env.ADMIN_USER_2, pass: process.env.ADMIN_PASSWORD_2 || '' }] : []),
    ];
    if (admins.some(a => a.user === username && a.pass === password)) {
      const token = createSession('admin', 'admin', 'Administrator');
      return res.json({ token, role: 'admin', name: 'Administrator' });
    }
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  if (type === 'member') {
    try {
      const rows = await getSheetData('AccessControl');
      const headers = rows[0] || [];
      const data = rows.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = r[i] || '');
        return obj;
      });
      const member = data.find(r => r.MemberName === memberName);
      if (!member) return res.status(401).json({ error: 'Member not found' });
      if (member.LoginEnabled === 'false' || member.LoginEnabled === '0') {
        return res.status(403).json({ error: 'Access not enabled for this member. Contact admin.' });
      }
      if (!member.PinHash) return res.status(401).json({ error: 'PIN not set. Contact admin to set your PIN.' });
      if (hashPin(pin) !== member.PinHash) return res.status(401).json({ error: 'Invalid PIN' });
      const memberRole = member.Role === 'admin' ? 'admin' : member.Role === 'team_lead' ? 'team_lead' : 'member';
      const token = createSession(member.MemberID, memberRole, member.MemberName);
      return res.json({ token, role: memberRole, name: member.MemberName });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(400).json({ error: 'Invalid login type' });
});

app.post('/api/auth/logout', (req, res) => {
  // Stateless tokens — client clears localStorage; nothing to delete server-side
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ role: session.role, name: session.name, userId: session.userId });
});

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => { obj[h] = row[j] || ''; });
    return obj;
  });
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - sh * 60 - sm;
  if (mins <= 0) return '';
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function nowDate() {
  return new Date().toISOString().split('T')[0];
}

function nowTs() {
  return Date.now().toString();
}

// ─── Drive helpers: project/month/date folder hierarchy ──────────────────────
async function findOrCreateFolder(drive, name, parentId) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

async function getUploadFolder(drive, projectCode, dateStr) {
  const d = new Date(dateStr || nowDate());
  const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const dayStr = dateStr || nowDate();

  const projectFolderId = await findOrCreateFolder(drive, projectCode || 'General', ROOT_FOLDER_ID);
  const monthFolderId = await findOrCreateFolder(drive, monthName, projectFolderId);
  const dateFolderId = await findOrCreateFolder(drive, dayStr, monthFolderId);
  return dateFolderId;
}

// ─── MEMBERS ──────────────────────────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    res.json(rowsToObjects(await getSheetData('Members')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, role, discipline, email, joinDate } = req.body;
    const id = `M-${nowTs()}`;
    await appendRow('Members', [id, name, role, discipline, email || '', joinDate || nowDate(), 'Active']);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/members/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Members'));
    const m = rows.find(r => r.MemberID === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    const { name, role, discipline, email, status } = req.body;
    await updateRow('Members', m._rowIndex, [m.MemberID, name || m.MemberName, role || m.Role, discipline || m.Discipline, email || m.Email, m.JoinDate, status || m.Status]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Members'));
    const m = rows.find(r => r.MemberID === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Members', m._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
app.get('/api/projects', async (req, res) => {
  try {
    res.json(rowsToObjects(await getSheetData('Projects')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { code, name, client, description, disciplines, status, location, createdBy } = req.body;
    const disciplinesStr = Array.isArray(disciplines) ? disciplines.join(', ') : (disciplines || '');
    await appendRow('Projects', [code, name, client || '', description || '', disciplinesStr, status || 'Active', nowDate(), createdBy || '', location || '']);
    const drive = await getDriveClient();
    await findOrCreateFolder(drive, code, ROOT_FOLDER_ID);
    res.json({ success: true, code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:code', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Projects'));
    const p = rows.find(r => r.ProjectCode === req.params.code);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const { name, client, description, disciplines, status, location } = req.body;
    const disciplinesStr = Array.isArray(disciplines) ? disciplines.join(', ') : (disciplines !== undefined ? disciplines : p.Disciplines);
    await updateRow('Projects', p._rowIndex, [
      p.ProjectCode,
      name !== undefined ? name : p.ProjectName,
      client !== undefined ? client : p.Client,
      description !== undefined ? description : p.Description,
      disciplinesStr,
      status || p.Status,
      p.CreatedDate,
      p.CreatedBy,
      location !== undefined ? location : (p.Location || '')
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:code', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Projects'));
    const p = rows.find(r => r.ProjectCode === req.params.code);
    if (!p) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Projects', p._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── WORK LOG ─────────────────────────────────────────────────────────────────
app.get('/api/worklog', async (req, res) => {
  try {
    let data = rowsToObjects(await getSheetData('WorkLog'));
    const { member, project, discipline, date, startDate, endDate, search } = req.query;
    if (member) data = data.filter(r => r.MemberName === member || r.MemberID === member);
    if (project) data = data.filter(r => r.ProjectCode === project);
    if (discipline) data = data.filter(r => r.Discipline === discipline);
    if (date) data = data.filter(r => r.Date === date);
    if (startDate) data = data.filter(r => r.Date >= startDate);
    if (endDate) data = data.filter(r => r.Date <= endDate);
    if (search) { const q = search.toLowerCase(); data = data.filter(r => (r.MemberName || '').toLowerCase().includes(q) || (r.ProjectCode || '').toLowerCase().includes(q)); }
    data.sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/assignees', async (req, res) => {
  try {
    const data = rowsToObjects(await getSheetData('WorkLog'));
    const names = [...new Set(data.map(r => (r.AssignedBy || '').trim()).filter(Boolean))].sort();
    res.json(names);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/worklog', async (req, res) => {
  try {
    const { date, memberId, memberName, projectCode, projectName, discipline, taskType, description, assignedBy, startTime, endTime, notes } = req.body;
    const id = `WL-${nowTs()}`;
    const duration = calcDuration(startTime, endTime);
    await appendRow('WorkLog', [id, date || nowDate(), memberId, memberName, projectCode, projectName || '', discipline, taskType, description || '', assignedBy || '', startTime || '', endTime || '', duration, notes || '']);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/worklog/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('WorkLog'));
    const rec = rows.find(r => r.EntryID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const { date, memberId, memberName, projectCode, projectName, discipline, taskType, description, assignedBy, startTime, endTime, notes } = req.body;
    const duration = calcDuration(startTime !== undefined ? startTime : rec.StartTime, endTime !== undefined ? endTime : rec.EndTime);
    await updateRow('WorkLog', rec._rowIndex, [
      rec.EntryID, date || rec.Date,
      memberId || rec.MemberID, memberName || rec.MemberName,
      projectCode || rec.ProjectCode,
      projectName !== undefined ? projectName : rec.ProjectName,
      discipline !== undefined ? discipline : rec.Discipline,
      taskType !== undefined ? taskType : rec.TaskType,
      description !== undefined ? description : rec.Description,
      assignedBy !== undefined ? assignedBy : rec.AssignedBy,
      startTime !== undefined ? startTime : rec.StartTime,
      endTime !== undefined ? endTime : rec.EndTime,
      duration,
      notes !== undefined ? notes : rec.Notes
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/worklog/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('WorkLog'));
    const rec = rows.find(r => r.EntryID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    await deleteRow('WorkLog', rec._rowIndex);

    // Cascade-delete the matching session (same date, member, project, start time)
    let sessionDeleted = false;
    if (rec.StartTime) {
      const sessRows = rowsToObjects(await getSheetData('Sessions'));
      const match = sessRows.find(s =>
        s.Date === rec.Date &&
        s.MemberName === rec.MemberName &&
        s.ProjectCode === rec.ProjectCode &&
        s.StartTime === rec.StartTime
      );
      if (match) {
        await deleteRow('Sessions', match._rowIndex);
        sessionDeleted = true;
      }
    }

    res.json({ success: true, sessionDeleted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
app.get('/api/attendance', async (req, res) => {
  try {
    let data = rowsToObjects(await getSheetData('Attendance'));
    const { member, month, year, date, startDate, endDate, search } = req.query;
    if (member) data = data.filter(r => r.MemberName === member || r.MemberID === member);
    if (date) data = data.filter(r => r.Date === date);
    if (month && year) data = data.filter(r => {
      const d = new Date(r.Date);
      return d.getMonth() + 1 === parseInt(month) && d.getFullYear() === parseInt(year);
    });
    if (startDate) data = data.filter(r => r.Date >= startDate);
    if (endDate) data = data.filter(r => r.Date <= endDate);
    if (search) { const q = search.toLowerCase(); data = data.filter(r => (r.MemberName || '').toLowerCase().includes(q) || (r.Notes || '').toLowerCase().includes(q) || (r.Status || '').toLowerCase().includes(q)); }
    data.sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/attendance/active', async (req, res) => {
  try {
    const data = rowsToObjects(await getSheetData('Attendance'));
    const today = nowDate();
    res.json(data.filter(r => (r.ClockState === 'active' || r.ClockState === 'break') && r.Date === today));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { date, memberId, memberName, status, inTime, outTime, dayType, notes, clockState, breakStart, totalBreakMins } = req.body;
    const id = `AT-${nowTs()}`;
    const totalHours = calcDuration(inTime, outTime);
    await appendRow('Attendance', [id, date || nowDate(), memberId, memberName, status, inTime || '', outTime || '', totalHours, dayType || 'Weekday', notes || '', clockState || '', breakStart || '', totalBreakMins || '']);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/attendance/:id', async (req, res) => {
  try {
    const rows = rowsToObjects(await getSheetData('Attendance'));
    const rec = rows.find(r => r.RecordID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const privileged = req.session.role === 'admin' || req.session.role === 'team_lead';
    if (!privileged && rec.MemberID !== req.session.userId) {
      return res.status(403).json({ error: 'You can only update your own attendance' });
    }
    const { status, inTime, outTime, notes, clockState, breakStart, totalBreakMins } = req.body;
    const totalHours = calcDuration(inTime || rec.InTime, outTime || rec.OutTime);
    await updateRow('Attendance', rec._rowIndex, [
      rec.RecordID, rec.Date, rec.MemberID, rec.MemberName,
      status !== undefined ? status : rec.Status,
      inTime !== undefined ? inTime : rec.InTime,
      outTime !== undefined ? outTime : rec.OutTime,
      totalHours,
      rec.DayType,
      notes !== undefined ? notes : rec.Notes,
      clockState !== undefined ? clockState : (rec.ClockState || ''),
      breakStart !== undefined ? breakStart : (rec.BreakStart || ''),
      totalBreakMins !== undefined ? totalBreakMins : (rec.TotalBreakMins || '')
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/attendance/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Attendance'));
    const rec = rows.find(r => r.RecordID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Attendance', rec._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
app.get('/api/sessions', async (req, res) => {
  try {
    let data = rowsToObjects(await getSheetData('Sessions'));
    const { member, project, date, startDate, endDate, search } = req.query;
    if (member) data = data.filter(r => r.MemberName === member || r.MemberID === member);
    if (project) data = data.filter(r => r.ProjectCode === project);
    if (date) data = data.filter(r => r.Date === date);
    if (startDate) data = data.filter(r => r.Date >= startDate);
    if (endDate) data = data.filter(r => r.Date <= endDate);
    if (search) { const q = search.toLowerCase(); data = data.filter(r => (r.MemberName || '').toLowerCase().includes(q) || (r.ProjectCode || '').toLowerCase().includes(q) || (r.TaskType || '').toLowerCase().includes(q)); }
    data.sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { date, memberId, memberName, projectCode, projectName, discipline, taskType, startTime, endTime, notes, assignedBy, deadline } = req.body;
    const id = `SS-${nowTs()}`;
    const durationHrs = calcDuration(startTime, endTime);
    const durationMins = durationHrs ? Math.round(parseFloat(durationHrs) * 60) : '';
    await appendRow('Sessions', [id, date || nowDate(), memberId, memberName, projectCode, projectName || '', discipline, taskType, startTime || '', endTime || '', durationMins, notes || '', assignedBy || '', deadline || '']);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Sessions'));
    const rec = rows.find(r => r.SessionID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const { date, memberId, memberName, projectCode, projectName, discipline, taskType, startTime, endTime, notes, assignedBy, deadline } = req.body;
    const durationHrs = calcDuration(startTime || rec.StartTime, endTime || rec.EndTime);
    const durationMins = durationHrs ? Math.round(parseFloat(durationHrs) * 60) : rec.DurationMins;
    await updateRow('Sessions', rec._rowIndex, [
      rec.SessionID, date || rec.Date,
      memberId || rec.MemberID, memberName || rec.MemberName,
      projectCode || rec.ProjectCode,
      projectName !== undefined ? projectName : rec.ProjectName,
      discipline !== undefined ? discipline : rec.Discipline,
      taskType !== undefined ? taskType : rec.TaskType,
      startTime !== undefined ? startTime : rec.StartTime,
      endTime !== undefined ? endTime : rec.EndTime,
      durationMins,
      notes !== undefined ? notes : rec.Notes,
      assignedBy !== undefined ? assignedBy : rec.AssignedBy || '',
      deadline !== undefined ? deadline : rec.Deadline || ''
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Sessions'));
    const rec = rows.find(r => r.SessionID === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Sessions', rec._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ISSUES ───────────────────────────────────────────────────────────────────
app.get('/api/issues', async (req, res) => {
  try {
    let data = rowsToObjects(await getSheetData('Issues'));
    const { member, status, project } = req.query;
    if (member) data = data.filter(r => r.MemberName === member || r.MemberID === member);
    if (status) data = data.filter(r => r.Status === status);
    if (project) data = data.filter(r => r.ProjectCode === project);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/issues', upload.single('evidence'), async (req, res) => {
  try {
    const { date, memberId, memberName, projectCode, issueType, description, durationLost } = req.body;
    const id = `IS-${nowTs()}`;
    let evidenceUrl = '';
    let evidenceType = 'text';

    if (req.file) {
      const drive = await getDriveClient();
      const folderId = await getUploadFolder(drive, projectCode || 'General', date || nowDate());
      const fileStream = Readable.from(req.file.buffer);
      const created = await drive.files.create({
        requestBody: {
          name: `${id}-${req.file.originalname}`,
          parents: [folderId]
        },
        media: { mimeType: req.file.mimetype, body: fileStream },
        fields: 'id, webViewLink',
        supportsAllDrives: true
      });
      // Make file readable by anyone with link
      await drive.permissions.create({
        fileId: created.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true
      });
      evidenceUrl = created.data.webViewLink;
      evidenceType = req.file.mimetype.startsWith('image/') ? 'screenshot' : 'file';
    }

    await appendRow('Issues', [id, date || nowDate(), memberId, memberName, projectCode || '', issueType, description, evidenceUrl, evidenceType, durationLost || '', 'Open', '', '']);
    res.json({ success: true, id, evidenceUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/issues/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Issues'));
    const issue = rows.find(r => r.IssueID === req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    const { status, resolvedBy, issueType, description, durationLost } = req.body;
    await updateRow('Issues', issue._rowIndex, [
      issue.IssueID, issue.Date, issue.MemberID, issue.MemberName, issue.ProjectCode,
      issueType !== undefined ? issueType : issue.IssueType,
      description !== undefined ? description : issue.Description,
      issue.EvidenceURL, issue.EvidenceType,
      durationLost !== undefined ? durationLost : issue.DurationLost,
      status || issue.Status, resolvedBy || issue.ResolvedBy,
      status === 'Resolved' ? nowDate() : issue.ResolvedAt
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/issues/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Issues'));
    const issue = rows.find(r => r.IssueID === req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Issues', issue._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LEAVES ───────────────────────────────────────────────────────────────────
app.get('/api/leaves', async (req, res) => {
  try {
    let data = rowsToObjects(await getSheetData('Leaves'));
    const { member, status, type } = req.query;
    if (member) data = data.filter(r => r.MemberName === member || r.MemberID === member);
    if (status) data = data.filter(r => r.Status === status);
    if (type) data = data.filter(r => r.LeaveType === type);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leaves', async (req, res) => {
  try {
    const { memberId, memberName, startDate, endDate, leaveType, reason } = req.body;
    const id = `LV-${nowTs()}`;
    const days = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1);
    await appendRow('Leaves', [id, memberId, memberName, startDate, endDate, days, leaveType, reason, 'Pending', '', nowDate(), '']);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leaves/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Leaves'));
    const lv = rows.find(r => r.LeaveID === req.params.id);
    if (!lv) return res.status(404).json({ error: 'Not found' });
    const { status, approvedBy, notes, startDate, endDate, leaveType, reason } = req.body;
    await updateRow('Leaves', lv._rowIndex, [
      lv.LeaveID, lv.MemberID, lv.MemberName,
      startDate || lv.StartDate, endDate || lv.EndDate,
      endDate ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate || lv.StartDate)) / (1000*60*60*24)) + 1) : lv.Days,
      leaveType || lv.LeaveType, reason !== undefined ? reason : lv.Reason,
      status || lv.Status, approvedBy || lv.ApprovedBy,
      lv.SubmittedAt, notes !== undefined ? notes : (lv.Notes || '')
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leaves/:id', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const rows = rowsToObjects(await getSheetData('Leaves'));
    const lv = rows.find(r => r.LeaveID === req.params.id);
    if (!lv) return res.status(404).json({ error: 'Not found' });
    await deleteRow('Leaves', lv._rowIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const STAT_SHEETS = ['Members', 'WorkLog', 'Attendance', 'Projects', 'Leaves', 'Issues'];
    const cachedAll = STAT_SHEETS.map(s => getCached(s));
    let rawArrays;
    if (cachedAll.every(Boolean)) {
      rawArrays = cachedAll;
    } else {
      // One batchGet instead of 6 separate reads
      const sheets = await getSheetsClient();
      const batch = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: STAT_SHEETS
      });
      rawArrays = (batch.data.valueRanges || []).map((vr, i) => {
        const data = vr.values || [];
        setCached(STAT_SHEETS[i], data);
        return data;
      });
    }
    const [members, worklog, attendance, projects, leaves, issues] = rawArrays;
    const md = rowsToObjects(members);
    const wl = rowsToObjects(worklog);
    const att = rowsToObjects(attendance);
    const pd = rowsToObjects(projects);
    const ld = rowsToObjects(leaves);
    const isd = rowsToObjects(issues);

    const activeMembers = md.filter(r => r.Status === 'Active').length;

    // Project workload
    const projectWorkload = {};
    wl.forEach(r => { if (r.ProjectCode) projectWorkload[r.ProjectCode] = (projectWorkload[r.ProjectCode] || 0) + 1; });

    // Discipline breakdown
    const disciplineBreakdown = {};
    wl.forEach(r => { if (r.Discipline) disciplineBreakdown[r.Discipline] = (disciplineBreakdown[r.Discipline] || 0) + 1; });

    // Task breakdown
    const taskBreakdown = {};
    wl.forEach(r => { if (r.TaskType) taskBreakdown[r.TaskType] = (taskBreakdown[r.TaskType] || 0) + 1; });

    // Supervisor breakdown
    const supervisorBreakdown = {};
    wl.forEach(r => { if (r.AssignedBy) supervisorBreakdown[r.AssignedBy] = (supervisorBreakdown[r.AssignedBy] || 0) + 1; });

    // This month attendance rate
    const now = new Date();
    const monthAtt = att.filter(r => {
      const d = new Date(r.Date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const presentDays = monthAtt.filter(r => r.Status === 'Present' || r.Status === 'Half-day').length;
    const totalExpected = monthAtt.length;
    const attRate = totalExpected > 0 ? Math.round(presentDays / totalExpected * 100) : 0;

    // Days logged this month
    const daysLogged = [...new Set(monthAtt.filter(r => r.Status === 'Present').map(r => r.Date))].length;

    res.json({
      totalMembers: activeMembers,
      totalProjects: pd.filter(r => r.Status === 'Active').length,
      totalEntries: wl.length,
      daysLogged,
      pendingLeaves: ld.filter(r => r.Status === 'Pending').length,
      openIssues: isd.filter(r => r.Status === 'Open').length,
      attendanceRate: attRate,
      activeProjectCodes: pd.filter(r => r.Status === 'Active').map(r => r.ProjectCode).join(', '),
      projectWorkload: Object.entries(projectWorkload).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      disciplineBreakdown: Object.entries(disciplineBreakdown).map(([discipline, count]) => ({ discipline, count })).sort((a, b) => b.count - a.count),
      taskBreakdown: Object.entries(taskBreakdown).map(([task, count]) => ({ task, count })).sort((a, b) => b.count - a.count),
      supervisorBreakdown: Object.entries(supervisorBreakdown).map(([name, count]) => ({ name, count }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Config / setup endpoints ─────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const id = process.env.SPREADSHEET_ID || '';
  const configured = id && id !== 'your_spreadsheet_id_here';
  res.json({
    configured,
    spreadsheetId: configured ? id : null,
    spreadsheetUrl: configured ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null,
    serviceAccount: 'crm-agent@research-analyst-ai.iam.gserviceaccount.com'
  });
});

app.post('/api/setup-id', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    if (!spreadsheetId || spreadsheetId.length < 20) return res.status(400).json({ error: 'Invalid spreadsheet ID' });

    // Test the connection first
    process.env.SPREADSHEET_ID = spreadsheetId;
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.get({ spreadsheetId });

    // Save to .env
    const envPath = require('path').join(__dirname, '.env');
    let envContent = require('fs').readFileSync(envPath, 'utf8');
    if (envContent.includes('SPREADSHEET_ID=')) {
      envContent = envContent.replace(/SPREADSHEET_ID=.*/, `SPREADSHEET_ID=${spreadsheetId}`);
    } else {
      envContent += `\nSPREADSHEET_ID=${spreadsheetId}`;
    }
    require('fs').writeFileSync(envPath, envContent);

    // Initialize sheets (create missing tabs)
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets.map(s => s.properties.title);
    const TAB_DEFS = [
      { name: 'Members',    headers: ['MemberID','MemberName','Role','Discipline','Email','JoinDate','Status'] },
      { name: 'Projects',   headers: ['ProjectCode','ProjectName','Client','Description','Disciplines','Status','CreatedDate','CreatedBy','Location'] },
      { name: 'WorkLog',    headers: ['EntryID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','Description','AssignedBy','StartTime','EndTime','DurationHours','Notes'] },
      { name: 'Attendance', headers: ['RecordID','Date','MemberID','MemberName','Status','InTime','OutTime','TotalHours','DayType','Notes','ClockState','BreakStart','TotalBreakMins'] },
      { name: 'Sessions',   headers: ['SessionID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','StartTime','EndTime','DurationMins','Notes','AssignedBy','Deadline'] },
      { name: 'Issues',     headers: ['IssueID','Date','MemberID','MemberName','ProjectCode','IssueType','Description','EvidenceURL','EvidenceType','DurationLost','Status','ResolvedBy','ResolvedAt'] },
      { name: 'Leaves',     headers: ['LeaveID','MemberID','MemberName','StartDate','EndDate','Days','LeaveType','Reason','Status','ApprovedBy','SubmittedAt','Notes'] },
      { name: 'Settings',   headers: ['Key', 'Value'] },
      { name: 'AccessControl', headers: ['MemberID', 'MemberName', 'LoginEnabled', 'PinHash', 'Role'] }
    ];
    const toCreate = TAB_DEFS.filter(t => !existing.includes(t.name));
    if (toCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: toCreate.map(t => ({ addSheet: { properties: { title: t.name } } })) }
      });
      _sheetIdMap = null; _sheetIdMapExp = 0; // bust ID map after adding tabs
    }
    // Fetch all header rows in one batchGet, then write only what changed
    const headerBatch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: TAB_DEFS.map(t => `${t.name}!A1:ZZ1`)
    });
    const headerWrites = [];
    (headerBatch.data.valueRanges || []).forEach((vr, i) => {
      const tab = TAB_DEFS[i];
      const curHeaders = (vr.values || [[]])[0] || [];
      if (curHeaders.length > 0) {
        if (curHeaders.length === tab.headers.length && curHeaders[0] === tab.headers[0]) return;
        if (curHeaders[0] !== tab.headers[0]) return;
        console.log(`Migrating ${tab.name} headers (${curHeaders.length} → ${tab.headers.length} cols)`);
      }
      headerWrites.push({ range: `${tab.name}!A1`, values: [tab.headers] });
    });
    if (headerWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data: headerWrites }
      });
      headerWrites.forEach(w => invalidate(w.range.split('!')[0]));
    }

    res.json({ success: true, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
  } catch (e) {
    process.env.SPREADSHEET_ID = 'your_spreadsheet_id_here';
    res.status(400).json({ error: e.message.includes('not found') ? 'Sheet not found — make sure you shared it with the service account' : e.message });
  }
});

// ─── Settings routes ────────────────────────────────────────────────────────────
app.get('/api/settings/disciplines', async (req, res) => {
  try {
    const val = await getSetting('disciplines');
    const defaultDiscs = ['Arch', 'Stru', 'Mech', 'Elec', 'Civil', 'Plumbing', 'HVAC'];
    res.json(val ? JSON.parse(val) : defaultDiscs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/disciplines', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { disciplines } = req.body;
    await setSetting('disciplines', JSON.stringify(disciplines));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/settings/access', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const [acRows, memberRows] = await Promise.all([
      getSheetData('AccessControl'),
      getSheetData('Members')
    ]);
    const headers = acRows[0] || ['MemberID','MemberName','LoginEnabled','PinHash','Role'];
    const acData = acRows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i] !== undefined ? r[i] : '');
      return obj;
    });
    const acIds = new Set(acData.map(r => r.MemberID));
    // Add members not yet in AccessControl as unregistered entries
    const mHeaders = memberRows[0] || [];
    const mIdIdx = mHeaders.indexOf('MemberID');
    const mNameIdx = mHeaders.indexOf('MemberName');
    const mStatusIdx = mHeaders.indexOf('Status');
    memberRows.slice(1).forEach(r => {
      const id = r[mIdIdx];
      if (id && !acIds.has(id) && (!mStatusIdx || r[mStatusIdx] === 'Active')) {
        acData.push({ MemberID: id, MemberName: r[mNameIdx] || id, LoginEnabled: 'false', PinHash: '', Role: 'member', _notRegistered: true });
      }
    });
    res.json(acData.map(({ PinHash, ...rest }) => ({ ...rest, hasPin: !!PinHash })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/access/:memberId', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { loginEnabled, pin, role } = req.body;
    const rows = await getSheetData('AccessControl');
    const headers = rows[0] || [];
    const idIdx = headers.indexOf('MemberID');
    const enabledIdx = headers.indexOf('LoginEnabled');
    const pinIdx = headers.indexOf('PinHash');
    const roleIdx = headers.indexOf('Role');
    const rowIdx = rows.findIndex((r, i) => i > 0 && r[idIdx] === req.params.memberId);

    const sheets = await getSheetsClient();
    if (rowIdx > 0) {
      const existing = [...rows[rowIdx]];
      const maxIdx = Math.max(enabledIdx, pinIdx, roleIdx >= 0 ? roleIdx : 0);
      while (existing.length <= maxIdx) existing.push('');
      if (loginEnabled !== undefined) existing[enabledIdx] = String(loginEnabled);
      if (pin !== undefined) existing[pinIdx] = pin ? hashPin(pin) : '';
      if (role !== undefined && roleIdx >= 0) existing[roleIdx] = role;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `AccessControl!A${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [existing] }
      });
    } else {
      // Member not in AccessControl yet — look up their name and add them
      const memberRows = await getSheetData('Members');
      const mHeaders = memberRows[0] || [];
      const mRow = memberRows.slice(1).find(r => r[mHeaders.indexOf('MemberID')] === req.params.memberId);
      const mName = mRow ? mRow[mHeaders.indexOf('MemberName')] : req.params.memberId;
      await appendRow('AccessControl', [
        req.params.memberId, mName,
        loginEnabled !== undefined ? String(loginEnabled) : 'true',
        pin ? hashPin(pin) : '',
        role || 'member'
      ]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/admin-password', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { currentPassword, newPassword } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || 'clovetech2026';
    if (currentPassword !== adminPass) return res.status(401).json({ error: 'Current password incorrect' });
    process.env.ADMIN_PASSWORD = newPassword;
    res.json({ ok: true, note: 'Password changed for this session. Update .env to persist.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Backup helpers & routes ────────────────────────────────────────────────────
async function runBackup() {
  const drive = await getDriveClient();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const dateStr   = now.toISOString().split('T')[0];
  const filename  = `WorkLogger-${dateStr}.xlsx`;

  // 1. Find or create "Backups" folder inside ROOT_FOLDER_ID
  const backupsRootId  = await findOrCreateFolder(drive, 'Backups', ROOT_FOLDER_ID);
  const monthFolderId  = await findOrCreateFolder(drive, yearMonth, backupsRootId);

  // 2. Export spreadsheet as XLSX
  const exportRes = await drive.files.export(
    { fileId: SPREADSHEET_ID, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(exportRes.data);

  // 3. Upload to month folder
  await drive.files.create({
    requestBody: { name: filename, parents: [monthFolderId] },
    media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Readable.from(buffer) },
    fields: 'id',
    supportsAllDrives: true
  });

  // 4. Store last backup time
  await setSetting('lastBackup', new Date().toISOString());
  console.log(`Backup complete: ${filename}`);
  return { filename, folder: yearMonth };
}

function scheduleDailyBackup() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 5, 0); // just after midnight
  const msUntilMidnight = midnight - now;
  setTimeout(async () => {
    try { await runBackup(); } catch (e) { console.error('Backup failed:', e.message); }
    scheduleDailyBackup(); // reschedule for next day
  }, msUntilMidnight);
  console.log(`Next backup scheduled in ${Math.round(msUntilMidnight/1000/60)} minutes`);
}

app.post('/api/backup/run', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await runBackup();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/backup/list', async (req, res) => {
  try {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const drive = await getDriveClient();
    const q = `name='Backups' and mimeType='application/vnd.google-apps.folder' and '${ROOT_FOLDER_ID}' in parents and trashed=false`;
    const r = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
    if (!r.data.files.length) return res.json({ files: [], lastBackup: null });
    const backupsId = r.data.files[0].id;
    const monthFolders = await drive.files.list({
      q: `'${backupsId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    let files = [];
    for (const folder of monthFolders.data.files) {
      const fr = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id,name,createdTime,size)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true, includeItemsFromAllDrives: true
      });
      files = files.concat(fr.data.files.map(f => ({ ...f, folder: folder.name })));
    }
    files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const lastBackup = await getSetting('lastBackup');
    res.json({ files: files.slice(0, 30), lastBackup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Dev hot-reload (SSE) — local only ──────────────────────────────────────
if (require.main === module) {
  const _sseClients = new Set();
  let _reloadTimer;

  app.get('/__reload', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
  });

  fs.watch(path.join(__dirname, 'public'), { recursive: true }, (event, filename) => {
    if (!filename) return;
    clearTimeout(_reloadTimer);
    _reloadTimer = setTimeout(() => {
      _sseClients.forEach(res => res.write('data: reload\n\n'));
    }, 120);
  });
}

// ─── Static & SPA fallback ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function migrateSheetHeaders() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'your_spreadsheet_id_here') return;
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existing = meta.data.sheets.map(s => s.properties.title);
    const TAB_DEFS2 = [
      { name: 'Members',       headers: ['MemberID','MemberName','Role','Discipline','Email','JoinDate','Status'] },
      { name: 'Projects',      headers: ['ProjectCode','ProjectName','Client','Description','Disciplines','Status','CreatedDate','CreatedBy','Location'] },
      { name: 'WorkLog',       headers: ['EntryID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','Description','AssignedBy','StartTime','EndTime','DurationHours','Notes'] },
      { name: 'Attendance',    headers: ['RecordID','Date','MemberID','MemberName','Status','InTime','OutTime','TotalHours','DayType','Notes','ClockState','BreakStart','TotalBreakMins'] },
      { name: 'Sessions',      headers: ['SessionID','Date','MemberID','MemberName','ProjectCode','ProjectName','Discipline','TaskType','StartTime','EndTime','DurationMins','Notes','AssignedBy','Deadline'] },
      { name: 'Issues',        headers: ['IssueID','Date','MemberID','MemberName','ProjectCode','IssueType','Description','EvidenceURL','EvidenceType','DurationLost','Status','ResolvedBy','ResolvedAt'] },
      { name: 'Leaves',        headers: ['LeaveID','MemberID','MemberName','StartDate','EndDate','Days','LeaveType','Reason','Status','ApprovedBy','SubmittedAt','Notes'] },
      { name: 'AccessControl', headers: ['MemberID','MemberName','LoginEnabled','PinHash','Role'] }
    ];

    const tabsPresent = TAB_DEFS2.filter(t => existing.includes(t.name));

    // Single batchGet: header row for every tab + full AccessControl for Role backfill
    const headerRanges = tabsPresent.map(t => `${t.name}!A1:ZZ1`);
    const acFullRange  = 'AccessControl!A:E';
    const allRanges    = [...headerRanges, acFullRange];

    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: allRanges
    });
    const valueRanges = batch.data.valueRanges || [];

    const writes = [];

    // Header migration
    tabsPresent.forEach((tab, i) => {
      const curHeaders = (valueRanges[i]?.values || [[]])[0] || [];
      if (curHeaders.length === tab.headers.length && curHeaders[0] === tab.headers[0]) return;
      writes.push({ range: `${tab.name}!A1`, values: [tab.headers] });
      console.log(`Migrating ${tab.name} headers (${curHeaders.length} → ${tab.headers.length} cols)`);
    });

    // Role backfill for AccessControl rows with empty Role
    const acRows = (valueRanges[headerRanges.length]?.values) || [];
    if (acRows.length > 1) {
      const roleIdx = acRows[0].indexOf('Role');
      if (roleIdx >= 0) {
        for (let i = 1; i < acRows.length; i++) {
          const row = acRows[i];
          if (!row[roleIdx] || row[roleIdx].trim() === '') {
            while (row.length <= roleIdx) row.push('');
            row[roleIdx] = 'member';
            writes.push({ range: `AccessControl!A${i + 1}`, values: [row] });
          }
        }
      }
    }

    // Single batchUpdate for all header + Role changes
    if (writes.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: writes }
      });
      // Invalidate header caches touched by migration
      writes.forEach(w => {
        const sheetName = w.range.split('!')[0];
        invalidate(sheetName);
      });
      console.log(`Sheet migration applied ${writes.length} update(s)`);
    }
    // Bust the sheet-ID map if new tabs were created
    if (toCreate.length > 0) { _sheetIdMap = null; _sheetIdMapExp = 0; }
  } catch (e) {
    console.log('Header migration skipped:', e.message);
  }
}

// Export for serverless (Netlify / Vercel)
module.exports = app;

// Start server only when run directly (local dev / Railway / Render)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  migrateSheetHeaders().then(() => {
    app.listen(PORT, () => {
      console.log(`✅ WorkLogger running → http://localhost:${PORT}`);
      scheduleDailyBackup();
    });
  });
}
