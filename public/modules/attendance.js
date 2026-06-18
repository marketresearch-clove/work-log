/* ═══════════════════════════════════════════════════════
   ATTENDANCE (unified — called by navigate)
   ═══════════════════════════════════════════════════════ */

let _activeSessions = [];
let _activeSessTimer = null;
let _dayDetailAtt = [], _dayDetailSess = [], _dayDetailDate = '';
let _logSearchTimer;

function debounceLogSearch() {
  clearTimeout(_logSearchTimer);
  _logSearchTimer = setTimeout(filterLogsTab, 300);
}

const _clock = { state: 'idle', recordId: null, inTime: null, outTime: null, breakStart: null, totalBreakMs: 0, interval: null, breaks: [] };

function renderAttendance() {
  stopActiveSessTimer();
  renderAttendanceUnified();
}

function renderAttendanceUnified() {
  const el = document.getElementById('page-attendance');
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');

  el.innerHTML = `
    <div class="page-tabs" id="attMainTabs">
      <button class="page-tab active" onclick="switchMainAttTab('markday',this)"><span class="mat-icon">table_chart</span> Mark Day</button>
      <button class="page-tab" onclick="switchMainAttTab('calendar',this)"><span class="mat-icon">calendar_month</span> Calendar</button>
      <button class="page-tab" onclick="switchMainAttTab('logs',this)"><span class="mat-icon">folder_open</span> Logs</button>
      <button class="page-tab" onclick="switchMainAttTab('issue',this)"><span class="mat-icon">warning</span> Report Issue</button>
    </div>

    <!-- ── TAB: MARK DAY ─────────────────────── -->
    <div id="attTab-markday">

      <!-- ── Who & When bar ── -->
      <div class="card" style="margin-bottom:16px;background:var(--surface);border-color:var(--accent);border-width:1px">
        <div class="md-who-when" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group md-member-wrap" style="flex:2;min-width:180px">
            <label style="color:var(--accent);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Member</label>
            <select id="mdMember" onchange="reloadDayView()" style="font-size:14px;font-weight:500">
              <option value="">Select member…</option>
              ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
            </select>
          </div>
          <div class="form-group md-date-wrap" style="flex:1;min-width:160px">
            <label style="color:var(--accent);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Date</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="date" id="mdDate" value="${state.sessionDate}" onchange="state.sessionDate=this.value;reloadDayView()" style="flex:1;font-size:14px" />
              <button class="btn btn-secondary" style="padding:8px 12px;white-space:nowrap;font-size:12px" onclick="document.getElementById('mdDate').value=today();state.sessionDate=today();reloadDayView()">Today</button>
            </div>
          </div>
          <div style="padding-bottom:1px">
            <button class="btn btn-primary" style="padding:9px 20px" onclick="reloadDayView()"><span class="mat-icon">refresh</span> Load</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" id="mdGrid">

        <!-- ── Attendance block ── -->
        <div class="card" style="display:flex;flex-direction:column;gap:0;padding:14px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span class="mat-icon" style="font-size:22px;color:var(--accent)">event_available</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">Attendance</div>
              <div style="font-size:11px;color:var(--muted)">Mark status and clock time</div>
            </div>
          </div>

          <!-- Status buttons -->
          <div class="att-status-4col" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
            <button class="att-status-btn" id="mdS-P" onclick="selectAttStatus('P')" style="padding:10px 4px;font-size:11px">
              <span class="mat-icon" style="font-size:22px;margin-bottom:5px">check_circle</span>Present
            </button>
            <button class="att-status-btn" id="mdS-H" onclick="selectAttStatus('H')" style="padding:10px 4px;font-size:11px">
              <span class="mat-icon" style="font-size:22px;margin-bottom:5px">schedule</span>Half-day
            </button>
            <button class="att-status-btn" id="mdS-A" onclick="selectAttStatus('A')" style="padding:10px 4px;font-size:11px">
              <span class="mat-icon" style="font-size:22px;margin-bottom:5px">cancel</span>Absent
            </button>
            <button class="att-status-btn" id="mdS-L" onclick="selectAttStatus('L')" style="padding:10px 4px;font-size:11px">
              <span class="mat-icon" style="font-size:22px;margin-bottom:5px">beach_access</span>Leave
            </button>
          </div>

          <!-- Clock interface -->
          <div id="mdClockInterface" style="display:none;margin-bottom:16px">
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center;margin-bottom:12px">
              <div style="font-size:42px;font-weight:700;font-family:monospace;color:var(--accent);letter-spacing:3px;line-height:1" id="mdTimerDisplay">00:00:00</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px">elapsed work time</div>
              <div style="display:flex;justify-content:center;gap:24px;margin-top:10px">
                <div style="text-align:center">
                  <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Clock In</div>
                  <div style="font-size:14px;font-weight:700;color:var(--green)" id="mdClockInDisplay">--:--</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Clock Out</div>
                  <div style="font-size:14px;font-weight:700;color:var(--text)" id="mdClockOutDisplay">--:--</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Idle</div>
                  <div style="font-size:14px;font-weight:700;color:var(--amber)" id="mdIdleDisplay">0m</div>
                </div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-success" id="mdClockInBtn" onclick="clockIn()" style="padding:10px;font-size:13px;justify-content:center"><span class="mat-icon">timer</span> Clock In</button>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="mdBreakRow">
                <button class="btn btn-warning" id="mdBreakBtn" onclick="startBreak()" style="display:none;padding:10px;font-size:13px;justify-content:center"><span class="mat-icon">coffee</span> Break</button>
                <button class="btn btn-info" id="mdBreakEndBtn" onclick="endBreak()" style="display:none;padding:10px;font-size:13px;justify-content:center"><span class="mat-icon">play_arrow</span> Resume</button>
                <button class="btn btn-danger" id="mdClockOutBtn" onclick="clockOut()" style="display:none;padding:10px;font-size:13px;justify-content:center"><span class="mat-icon">stop_circle</span> Clock Out</button>
              </div>
            </div>
            <div id="mdBreakLog" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
          </div>

          <!-- Manual time row -->
          <div id="mdTimeRow" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            ${timeFieldHtml('mdIn',  'In Time')}
            ${timeFieldHtml('mdOut', 'Out Time')}
          </div>
          <input type="hidden" id="mdTotalBreakMins" />
          <div class="form-group" style="margin-bottom:10px">
            <label>Notes <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <input type="text" id="mdAttNotes" placeholder="e.g. Left early for appointment…" />
          </div>
          <button class="btn btn-primary" style="width:100%;padding:8px;font-size:13px;font-weight:600;margin-top:auto;justify-content:center" onclick="submitMarkDay()"><span class="mat-icon">save</span> Save Attendance</button>
        </div>

        <!-- ── Sessions block ── -->
        <div class="card" style="display:flex;flex-direction:column;gap:0;padding:14px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span class="mat-icon" style="font-size:22px;color:var(--accent)">timer</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">Log Work Session</div>
              <div style="font-size:11px;color:var(--muted)">Record what was worked on</div>
            </div>
          </div>

          <div class="md-session-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group">
              <label>Member <span style="color:var(--red)">*</span></label>
              <select id="mdSessionMember" onchange="filterProjectsByMember(this.value,'mdProject')">
                <option value="">Select member…</option>
                ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Project <span style="color:var(--red)">*</span></label>
              <div style="display:flex;gap:4px">
                <select id="mdProject" onchange="mdFillDisc(this.value)" style="flex:1">
                  <option value="">Select project…</option>
                  ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}|${p.Disciplines}">${p.ProjectCode} – ${p.ProjectName}${p.Location ? ' · ' + p.Location : ''}</option>`).join('')}
                  <option value="__new__">+ New Project…</option>
                </select>
                <select id="mdFormLocFilter" style="width:100px;font-size:11px" onchange="filterMdProjectsByLoc()">
                  <option value="">All Locations</option>
                  ${projects.filter(p => p.Location).map(p => p.Location).filter((v,i,a) => a.indexOf(v)===i).sort().map(l => `<option value="${l}">${l}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="md-session-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group">
              <label>Discipline <span style="color:var(--red)">*</span></label>
              <select id="mdDisc">
                <option value="">Select…</option>
                ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Task <span style="color:var(--red)">*</span></label>
              ${taskComboHtml('mdTask')}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group">
              <label>Assigned By</label>
              <select id="mdAssigned" onchange="mdAssignedChange(this.value)">
                <option value="">Self-directed</option>
                ${(state.assignees || []).map(name => `<option value="${name}">${name}</option>`).join('')}
                <option value="__custom__">+ Add person…</option>
              </select>
              <input type="text" id="mdAssignedCustom" placeholder="Enter person name…" style="display:none;margin-top:4px" />
            </div>
            <div class="form-group">
              <label>Deadline <span style="font-weight:400;color:var(--muted)">(hrs given — HH:MM)</span></label>
              <input type="text" id="mdDeadline" placeholder="e.g. 03:00" maxlength="5" oninput="fmtDeadlineInput(this)" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
            ${timeFieldHtml('mdSStart', 'Start Time *')}
            ${timeFieldHtml('mdSEnd',   'End Time *')}
          </div>
          <div id="mdSessionDurPreview" style="text-align:center;font-size:11px;color:var(--accent2);min-height:16px;margin-bottom:6px"></div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Notes <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <input type="text" id="mdSNotes" placeholder="e.g. Completed structural review…" />
          </div>
          <button class="btn btn-primary" style="width:100%;padding:8px;font-size:13px;font-weight:600;margin-top:auto;justify-content:center" onclick="submitDaySession()"><span class="mat-icon">add_circle</span> Add Session</button>
        </div>
      </div>

      <!-- Day timeline -->
      <div class="card" style="margin-top:16px" id="dayTimelineCard">
        <div class="card-header">
          <span class="card-title">Sessions — <span id="dayTimelineDate">${fmtDate(state.sessionDate)}</span></span>
          <span id="dayTotalLabel" style="font-size:12px;color:var(--accent2)"></span>
        </div>
        <div class="day-timeline" id="dayTimeline">
          <div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">Select a member and date then click Load</div>
        </div>
        <div id="daySessionsLog"></div>
      </div>

      <!-- Active Clock Sessions -->
      <div class="card" style="margin-top:16px" id="activeSessionsCard">
        <div class="card-header">
          <span class="card-title">Active Clock Sessions</span>
          <span id="activeSessionCount" style="font-size:12px;color:var(--muted)"></span>
        </div>
        <div id="activeSessionsBody">
          <div style="color:var(--muted);font-size:13px;padding:10px 0">No active sessions</div>
        </div>
      </div>
    </div>

    <!-- ── TAB: CALENDAR ─────────────────────── -->
    <div id="attTab-calendar" style="display:none">
      ${buildCalendarTab()}
    </div>

    <!-- ── TAB: LOGS ─────────────────────────── -->
    <div id="attTab-logs" style="display:none" id="attLogsTab">
      ${buildLogsTab()}
    </div>

    <!-- ── TAB: ISSUE ─────────────────────────── -->
    <div id="attTab-issue" style="display:none">
      ${buildIssueReportForm(members)}
    </div>
  `;

  // init attendance status selection
  window._mdStatus = '';
  // init log tab pagination caches
  _attFull  = state.attendance || [];
  _sessFull = state.sessions   || [];
  _ps('att').page  = 1;
  _ps('sess').page = 1;
  _attRender();
  _sessRender();
  loadActiveSessions();
  startActiveSessTimer();
  // Auto-select current logged-in user so clock restores without manual selection
  if (auth.name) {
    const aname = auth.name.trim();
    const sel = document.getElementById('mdMember');
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.value.split('|')[1]?.trim() === aname);
      if (opt) { sel.value = opt.value; reloadDayView(); }
    }
    const sel2 = document.getElementById('mdSessionMember');
    if (sel2) {
      const opt2 = Array.from(sel2.options).find(o => o.value.split('|')[1]?.trim() === aname);
      if (opt2) sel2.value = opt2.value;
    }
  }
}

function selectAttStatus(code) {
  window._mdStatus = code;
  ['P','H','A','L'].forEach(c => {
    const btn = document.getElementById('mdS-' + c);
    if (btn) { btn.className = 'att-status-btn' + (c === code ? ` sel-${c}` : ''); }
  });
  const hideTime = code === 'A' || code === 'L';
  const timeRow = document.getElementById('mdTimeRow');
  if (timeRow) timeRow.style.display = hideTime ? 'none' : '';
  const clockIf = document.getElementById('mdClockInterface');
  if (clockIf) clockIf.style.display = code === 'P' ? '' : 'none';
  if (code === 'P' && _clock.state === 'idle') stopClockTimer();
}

function stopClockTimer() {
  if (_clock.interval) { clearInterval(_clock.interval); _clock.interval = null; }
}

function updateTimerDisplay() {
  if (_clock.state === 'idle') return;
  const now = new Date();
  const elapsed = now - _clock.inTime - _clock.totalBreakMs;
  const secs = Math.floor(elapsed / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const disp = document.getElementById('mdTimerDisplay');
  if (disp) disp.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const totalIdle = Math.round(_clock.totalBreakMs / 60000);
  const idleDisp = document.getElementById('mdIdleDisplay');
  if (idleDisp) idleDisp.textContent = totalIdle + 'm';
}

function startClockTimer() {
  stopClockTimer();
  _clock.interval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

async function clockIn() {
  _clock.state = 'running';
  _clock.inTime = new Date();
  _clock.totalBreakMs = 0;
  _clock.breaks = [];
  const pad2 = n => String(n).padStart(2,'0');
  const inStr = `${pad2(_clock.inTime.getHours())}:${pad2(_clock.inTime.getMinutes())}`;
  const memberVal = (document.getElementById('mdMember')?.value || '').split('|');
  const date = document.getElementById('mdDate')?.value || state.sessionDate;
  const inDisp = document.getElementById('mdClockInDisplay');
  if (inDisp) inDisp.textContent = fmtTime12(inStr);
  document.getElementById('mdClockInBtn').style.display = 'none';
  document.getElementById('mdBreakBtn').style.display = '';
  document.getElementById('mdClockOutBtn').style.display = '';
  startClockTimer();
  try {
    const res = await apiPost('/api/attendance', {
      date, memberId: memberVal[0], memberName: memberVal[1],
      status: 'Present', inTime: inStr, outTime: '',
      dayType: 'Weekday', notes: '',
      clockState: 'active', breakStart: '', totalBreakMins: '0'
    });
    _clock.recordId = res.id;
    loadActiveSessions();
  } catch (e) {
    toast('Failed to save clock-in: ' + e.message, 'error');
  }
  toast('Clocked in at ' + fmtTime12(inStr), 'success');
}

async function startBreak() {
  _clock.state = 'break';
  _clock.breakStart = new Date();
  stopClockTimer();
  document.getElementById('mdBreakBtn').style.display = 'none';
  document.getElementById('mdBreakEndBtn').style.display = '';
  const pad2 = n => String(n).padStart(2,'0');
  const brkStr = `${pad2(_clock.breakStart.getHours())}:${pad2(_clock.breakStart.getMinutes())}`;
  if (_clock.recordId) {
    try {
      await apiPut('/api/attendance/' + _clock.recordId, { clockState: 'break', breakStart: brkStr });
      loadActiveSessions();
    } catch (e) { toast('Break saved failed: ' + e.message, 'error'); }
  }
  toast('Break started', 'info');
}

async function endBreak() {
  const breakEnd = new Date();
  const dur = breakEnd - _clock.breakStart;
  _clock.totalBreakMs += dur;
  _clock.breaks.push({ start: _clock.breakStart, end: breakEnd, duration: dur });
  _clock.state = 'running';
  _clock.breakStart = null;
  document.getElementById('mdBreakEndBtn').style.display = 'none';
  document.getElementById('mdBreakBtn').style.display = '';
  startClockTimer();
  const totalIdle = Math.round(_clock.totalBreakMs / 60000);
  if (_clock.recordId) {
    try {
      await apiPut('/api/attendance/' + _clock.recordId, { clockState: 'active', breakStart: '', totalBreakMins: String(totalIdle) });
      loadActiveSessions();
    } catch (e) { toast('Resume save failed: ' + e.message, 'error'); }
  }
  toast(`Break ended (${totalIdle}m total idle)`, 'info');
  renderBreakLog();
  renderBreaksTimeline();
}

function renderBreakLog() {
  const el = document.getElementById('mdBreakLog');
  if (!el) return;
  if (!_clock.breaks.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Break Log</div>' +
    _clock.breaks.map((b, i) => {
      const mins = Math.round(b.duration / 60000);
      return `<div style="padding:2px 0">Break ${i+1}: ${b.start.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} → ${b.end.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} (${mins}m)</div>`;
    }).join('');
}

async function clockOut() {
  if (_clock.state === 'break') {
    await endBreak();
  }
  _clock.state = 'stopped';
  _clock.outTime = new Date();
  stopClockTimer();
  const pad2 = n => String(n).padStart(2,'0');
  const outStr = `${pad2(_clock.outTime.getHours())}:${pad2(_clock.outTime.getMinutes())}`;
  const outDisp = document.getElementById('mdClockOutDisplay');
  if (outDisp) outDisp.textContent = fmtTime12(outStr);
  document.getElementById('mdBreakBtn').style.display = 'none';
  document.getElementById('mdBreakEndBtn').style.display = 'none';
  document.getElementById('mdClockOutBtn').style.display = 'none';
  const totalIdle = Math.round(_clock.totalBreakMs / 60000);
  document.getElementById('mdTotalBreakMins').value = totalIdle;
  const notes = document.getElementById('mdAttNotes');
  const breaksStr = _clock.breaks.map((b, i) => {
    const mins = Math.round(b.duration / 60000);
    return `Break ${i+1}: ${b.start.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}-${b.end.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} (${mins}m)`;
  }).join('; ');
  const existingNotes = notes.value.trim();
  notes.value = existingNotes ? existingNotes + ' | ' + breaksStr : breaksStr;
  if (_clock.recordId) {
    try {
      await apiPut('/api/attendance/' + _clock.recordId, {
        clockState: 'completed', outTime: outStr,
        totalBreakMins: String(totalIdle),
        notes: notes.value
      });
      loadActiveSessions();
    } catch (e) {
      toast('Failed to save clock-out: ' + e.message, 'error');
    }
  }
  toast('Clocked out! Save to record attendance.', 'success');
}

function resetClock() {
  stopClockTimer();
  _clock.state = 'idle';
  _clock.recordId = null;
  _clock.inTime = null;
  _clock.outTime = null;
  _clock.breakStart = null;
  _clock.totalBreakMs = 0;
  _clock.breaks = [];
  const ids = ['mdClockInBtn','mdBreakBtn','mdBreakEndBtn','mdClockOutBtn'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = id === 'mdClockInBtn' ? '' : 'none'; });
  ['mdTimerDisplay','mdClockInDisplay','mdClockOutDisplay'].forEach(id => {
    const el = document.getElementById(id);
    if (el && id !== 'mdTimerDisplay') el.textContent = '--:--';
    if (el && id === 'mdTimerDisplay') el.textContent = '00:00:00';
  });
  const idleDisp = document.getElementById('mdIdleDisplay');
  if (idleDisp) idleDisp.textContent = '0m';
  const bkLog = document.getElementById('mdBreakLog');
  if (bkLog) bkLog.innerHTML = '';
}

// ═══ ACTIVE SESSIONS ═══════════════════════════════════

function startActiveSessTimer() {
  stopActiveSessTimer();
  loadActiveSessions();
  _activeSessTimer = setInterval(loadActiveSessions, 5000);
}

function stopActiveSessTimer() {
  if (_activeSessTimer) { clearInterval(_activeSessTimer); _activeSessTimer = null; }
}

async function loadActiveSessions() {
  try {
    _activeSessions = await apiGet('/api/attendance/active');
  } catch (e) {
    _activeSessions = [];
  }
  renderActiveSessions();
}

function renderActiveSessions() {
  const body = document.getElementById('activeSessionsBody');
  const cnt = document.getElementById('activeSessionCount');
  if (!body) return;
  if (!_activeSessions || !_activeSessions.length) {
    body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px 0">No active sessions</div>';
    if (cnt) cnt.textContent = '(0)';
    return;
  }
  if (cnt) cnt.textContent = `(${_activeSessions.length})`;
  const now = new Date();
  body.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px">' +
  _activeSessions.map(s => {
    const inP = s.InTime ? s.InTime.split(':') : ['0','0'];
    const inD = new Date();
    inD.setHours(parseInt(inP[0]) || 0, parseInt(inP[1]) || 0, 0);
    const tBreak = (parseInt(s.TotalBreakMins) || 0) * 60000;
    const elapsed = now - inD - tBreak;
    const secs = Math.floor(Math.max(0, elapsed) / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2,'0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2,'0');
    const ss = String(secs % 60).padStart(2,'0');
    const isBreak = s.ClockState === 'break';
    let badge = isBreak
      ? '<span style="background:var(--amber);color:#000;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:3px"><span class="mat-icon" style="font-size:12px;color:#000">coffee</span> Break</span>'
      : '<span style="background:var(--green);color:#000;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:3px"><span class="mat-icon" style="font-size:12px;color:#000">radio_button_checked</span> Active</span>';
    let brkInfo = '';
    if (isBreak && s.BreakStart) {
      const bp = s.BreakStart.split(':');
      const bd = new Date();
      bd.setHours(parseInt(bp[0]) || 0, parseInt(bp[1]) || 0, 0);
      const bElapsed = Math.floor((now - bd) / 60000);
      brkInfo = `<span style="color:var(--muted);font-size:10px;margin-left:4px">(${bElapsed}m)</span>`;
    }
    return `<div class="active-sess-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <div><strong>${s.MemberName}</strong> <span style="color:var(--muted);font-size:11px">in ${fmtTime12(s.InTime)}</span></div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-family:monospace;font-size:18px;font-weight:700;color:var(--accent2)">${hh}:${mm}:${ss}</span>
        ${badge}${brkInfo}
      </div>
    </div>`;
  }).join('') + '</div>';
}

async function restoreClockState() {
  const memberVal = (document.getElementById('mdMember')?.value || '').split('|');
  const date = document.getElementById('mdDate')?.value || state.sessionDate;
  if (!memberVal[1] || !date) return;
  const todayStr = new Date().toISOString().slice(0,10);
  if (date !== todayStr) return;
  const active = await apiGet(`/api/attendance?member=${encodeURIComponent(memberVal[1])}&date=${date}`);
  const myActive = active.find(r => r.ClockState === 'active' || r.ClockState === 'break');
  if (!myActive) return;
  const inP = (myActive.InTime || '00:00').split(':');
  const inD = new Date();
  inD.setHours(parseInt(inP[0]) || 0, parseInt(inP[1]) || 0, 0);
  _clock.state = myActive.ClockState === 'break' ? 'break' : 'running';
  _clock.recordId = myActive.RecordID;
  _clock.inTime = inD;
  _clock.totalBreakMs = (parseInt(myActive.TotalBreakMins) || 0) * 60000;
  _clock.breaks = parseBreakLog(myActive.Notes || '');
  document.getElementById('mdClockInDisplay').textContent = fmtTime12(myActive.InTime || '00:00');
  document.getElementById('mdClockInBtn').style.display = 'none';
  document.getElementById('mdBreakBtn').style.display = _clock.state === 'break' ? 'none' : '';
  document.getElementById('mdBreakEndBtn').style.display = _clock.state === 'break' ? '' : 'none';
  document.getElementById('mdClockOutBtn').style.display = '';
  document.getElementById('mdIn').value = myActive.InTime || '';
  document.getElementById('mdAttNotes').value = myActive.Notes || '';
  if (_clock.state === 'break') {
    const bp = (myActive.BreakStart || '00:00').split(':');
    const bd = new Date();
    bd.setHours(parseInt(bp[0]) || 0, parseInt(bp[1]) || 0, 0);
    _clock.breakStart = bd;
  }
  const totalIdle = Math.round(_clock.totalBreakMs / 60000);
  const idleDisp = document.getElementById('mdIdleDisplay');
  if (idleDisp) idleDisp.textContent = totalIdle + 'm';
  renderBreakLog();
  startClockTimer();
  renderBreaksTimeline();
}

function parseBreakLog(notes) {
  const breaks = [];
  if (!notes) return breaks;
  const regex = /Break (\d+): (\d+:\d+ [AP]M)-(\d+:\d+ [AP]M) \((\d+)m\)/g;
  let match;
  while ((match = regex.exec(notes)) !== null) {
    const start = parseTime12(match[2]);
    const end = parseTime12(match[3]);
    if (start && end) {
      const dur = parseInt(match[4]) * 60000;
      breaks.push({ start, end, duration: dur });
    }
  }
  return breaks;
}

function parseTime12(str) {
  if (!str) return null;
  const m = str.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function renderBreaksTimeline() {
  const container = document.getElementById('dayTimeline');
  if (!container || !_clock.breaks.length) return;
  const sorted = [..._clock.breaks];
  const html = sorted.map((b, i) => {
    const mins = Math.round(b.duration / 60000);
    const st = b.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const et = b.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `<div class="timeline-item">
      <div class="timeline-time" style="color:var(--amber)">${st}</div>
      <div class="timeline-dot" style="background:var(--amber)"></div>
      <div class="timeline-card" style="border-color:rgba(255,193,7,0.3)">
        <div class="timeline-card-header">
          <span style="font-size:12px;font-weight:600;color:var(--amber);display:inline-flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:14px">coffee</span> Break ${i+1}</span>
          <span class="timeline-dur">${mins}m</span>
        </div>
        <div class="timeline-meta">${st} → ${et}</div>
      </div>
    </div>`;
  }).join('');
  container.insertAdjacentHTML('beforeend', html);
}

function mdFillDisc(val) {
  if (val === '__new__') { showAddProject(); return; }
  const parts = val.split('|');
  const discs = (parts[2] || '').split(',').map(d => d.trim()).filter(Boolean);
  if (discs.length === 1) {
    const sel = document.getElementById('mdDisc');
    if (sel) sel.value = discs[0];
  }
}

async function submitMarkDay() {
  const memberVal = (document.getElementById('mdMember')?.value || '').split('|');
  const date = document.getElementById('mdDate')?.value;
  if (!memberVal[1] || !date) { toast('Select a member and date first', 'error'); return; }
  if (!window._mdStatus) { toast('Select an attendance status', 'error'); return; }
  const statusMap = { P: 'Present', H: 'Half-day', A: 'Absent', L: 'Leave' };
  let inTime = document.getElementById('mdIn')?.value || '';
  let outTime = document.getElementById('mdOut')?.value || '';
  let notes = document.getElementById('mdAttNotes')?.value || '';
  const pad2 = n => String(n).padStart(2,'0');
  if (window._mdStatus === 'P' && _clock.inTime) {
    inTime = `${pad2(_clock.inTime.getHours())}:${pad2(_clock.inTime.getMinutes())}`;
    if (_clock.outTime) outTime = `${pad2(_clock.outTime.getHours())}:${pad2(_clock.outTime.getMinutes())}`;
  }
  const payload = {
    date, memberId: memberVal[0], memberName: memberVal[1],
    status: statusMap[window._mdStatus],
    inTime, outTime,
    dayType: 'Weekday',
    notes
  };
  if (_clock.recordId) {
    payload.clockState = 'completed';
    payload.breakStart = '';
    payload.totalBreakMins = String(Math.round(_clock.totalBreakMs / 60000));
    await apiPut('/api/attendance/' + _clock.recordId, payload);
  } else {
    await apiPost('/api/attendance', payload);
  }
  toast('Attendance saved!', 'success');
  const [att, sess] = await Promise.all([apiGet('/api/attendance'), apiGet('/api/sessions')]);
  _attFull = att; _sessFull = sess;
  _ps('att').page = 1; _ps('sess').page = 1;
  _attRender(); _sessRender();
}

function mdAssignedChange(val) {
  const input = document.getElementById('mdAssignedCustom');
  if (input) input.style.display = val === '__custom__' ? '' : 'none';
}

async function submitDaySession() {
  const memberVal = (document.getElementById('mdSessionMember')?.value || '').split('|');
  const projectVal = (document.getElementById('mdProject')?.value || '').split('|');
  const date = document.getElementById('mdDate')?.value;
  const task = document.getElementById('mdTask')?.value;
  const disc = document.getElementById('mdDisc')?.value;
  const start = document.getElementById('mdSStart')?.value;
  const end   = document.getElementById('mdSEnd')?.value;

  let assignedBy = document.getElementById('mdAssigned')?.value || '';
  if (assignedBy === '__custom__') {
    assignedBy = document.getElementById('mdAssignedCustom')?.value?.trim() || '';
  }

  if (!memberVal[1]) { toast('Select a member first', 'error'); return; }
  if (!projectVal[0] || projectVal[0] === '__new__') { toast('Select a project', 'error'); return; }
  if (!task || !disc || !start || !end) { toast('Fill in all session fields', 'error'); return; }

  await apiPost('/api/sessions', {
    date, memberId: memberVal[0], memberName: memberVal[1],
    projectCode: projectVal[0], projectName: projectVal[1],
    discipline: disc, taskType: task, startTime: start, endTime: end,
    assignedBy,
    deadline: document.getElementById('mdDeadline')?.value || '',
    notes: document.getElementById('mdSNotes')?.value || ''
  });
  toast('Session logged!', 'success');

  // clear session fields (keep member selected for quick multi-session entry)
  ['mdProject','mdDisc','mdTask','mdAssigned','mdAssignedCustom','mdDeadline','mdSNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const customEl = document.getElementById('mdAssignedCustom');
  if (customEl) customEl.style.display = 'none';
  ['mdSStart','mdSEnd'].forEach(id => {
    const hi = document.getElementById(id);
    const di = document.getElementById(id + '-disp');
    if (hi) hi.value = '';
    if (di) { di.textContent = '--:-- --'; di.classList.add('empty'); }
  });
  await reloadDayView();
  // Also refresh logs tab
  const [att, sess] = await Promise.all([apiGet('/api/attendance'), apiGet('/api/sessions')]);
  _attFull = att; _sessFull = sess;
  _ps('att').page = 1; _ps('sess').page = 1;
  _attRender(); _sessRender();
}

async function reloadDayView() {
  const memberVal = (document.getElementById('mdMember')?.value || '').split('|');
  const date = document.getElementById('mdDate')?.value || state.sessionDate;
  state.sessionDate = date;
  const label = document.getElementById('dayTimelineDate');
  if (label) label.textContent = fmtDate(date);
  resetClock();
  if (!memberVal[1]) return;

  const sessions = await apiGet(`/api/sessions?member=${encodeURIComponent(memberVal[1])}&date=${date}`);
  renderDayTimeline(sessions);
  await restoreClockState();
  if (_clock.state !== 'idle') {
    selectAttStatus('P');
  }
  loadActiveSessions();
}

function renderDayTimeline(sessions) {
  const container = document.getElementById('dayTimeline');
  const logTable  = document.getElementById('daySessionsLog');
  const totalLabel = document.getElementById('dayTotalLabel');
  if (!container) return;

  if (!sessions.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px">No sessions logged for this day yet</div>';
    if (logTable) logTable.innerHTML = '';
    if (totalLabel) totalLabel.textContent = '';
    return;
  }

  const sorted = [...sessions].sort((a, b) => a.StartTime.localeCompare(b.StartTime));
  let totalMins = 0;
  sorted.forEach(s => { totalMins += parseInt(s.DurationMins) || 0; });

  if (totalLabel) totalLabel.textContent = `Total: ${minsToHHMM(totalMins)}`;

  container.innerHTML = sorted.map(s => {
    const hrs = minsToHHMM(s.DurationMins);
    return `
      <div class="timeline-item">
        <div class="timeline-time">${s.StartTime || '--'}</div>
        <div class="timeline-dot" style="background:${DISC_COLORS[s.Discipline] || 'var(--accent)'}"></div>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <span class="timeline-proj">${s.ProjectCode}</span>
            ${s.Discipline ? discChip(s.Discipline) : ''}
            <span class="timeline-dur">${hrs}</span>
          </div>
          <div class="timeline-task">${s.TaskType}</div>
          <div class="timeline-meta">${s.StartTime} → ${s.EndTime}${s.Notes ? ' · ' + s.Notes : ''}</div>
        </div>
      </div>`;
  }).join('') + (totalMins > 0 ? `
    <div class="day-total">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--accent);fill:none;stroke-width:2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Day total: <strong>${minsToHHMM(totalMins)}</strong>
      <span style="color:var(--muted);font-size:12px">(${sorted.length} session${sorted.length > 1 ? 's' : ''})</span>
    </div>` : '');

  // Full session log table below the timeline
  if (logTable) {
    const isAdmin = auth.role === 'admin' || auth.role === 'team_lead';
    logTable.innerHTML = `
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);letter-spacing:.5px;margin-bottom:8px">Full Log</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Project</th><th>Discipline</th><th>Task</th>
            <th>Start</th><th>End</th><th>Duration</th><th>Notes</th>
            ${isAdmin ? '<th>Actions</th>' : ''}
          </tr></thead>
          <tbody>
            ${sorted.map(s => {
              const json = encodeURIComponent(JSON.stringify(s));
              return `<tr>
                <td><span style="font-size:11px;font-weight:700;color:var(--accent)">${s.ProjectCode}</span></td>
                <td>${s.Discipline ? discChip(s.Discipline) : '—'}</td>
                <td style="font-size:12px">${s.TaskType}</td>
                <td style="font-size:12px">${fmtTime12(s.StartTime)}</td>
                <td style="font-size:12px">${fmtTime12(s.EndTime)}</td>
                <td style="color:var(--accent2)">${minsToHHMM(s.DurationMins)}</td>
                <td style="font-size:12px;color:var(--muted)">${s.Notes || '—'}</td>
                ${isAdmin ? `<td style="white-space:nowrap">
                  <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditSession(decodeURIComponent('${json}'))">Edit</button>
                  <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteDaySession('${s.SessionID}')">Del</button>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>`;
  }
}

function switchMainAttTab(tab, btn) {
  document.querySelectorAll('#attMainTabs .page-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['markday','calendar','logs','issue'].forEach(t => {
    const el = document.getElementById('attTab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
}

function buildCalendarTab() {
  const year = state.attYear, month = state.attMonth;
  const daysInMonth = new Date(year, month, 0).getDate();
  const members = state.members.filter(m => m.Status === 'Active');
  const attIndex = {};
  state.attendance.forEach(r => { attIndex[`${r.MemberName}|${r.Date}`] = r; });
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const dayHeaders = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.toLocaleString('en-US', { weekday: 'short' });
    const isWE = dt.getDay() === 0 || dt.getDay() === 6;
    dayHeaders.push({ d, dow, isWE, dateStr: `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}` });
  }

  return `
    <div class="att-controls">
      <button onclick="changeAttMonth(-1)">‹ Prev</button>
      <span class="att-month-label">${monthName}</span>
      <button onclick="changeAttMonth(1)">Next ›</button>
      <button class="btn btn-sm btn-secondary" onclick="exportAttendance()">Export CSV</button>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="att-table">
        <thead><tr>
          <th class="member-col">Member</th>
          ${dayHeaders.map(h => `<th style="${h.isWE ? 'opacity:.4' : ''};cursor:pointer" title="Click to view ${h.dateStr}" onclick="showDayDetail('${h.dateStr}')">
            <div>${h.dow}</div><div style="font-size:11px;font-weight:400">${h.d}</div>
          </th>`).join('')}
          <th>P</th><th>A</th><th>H</th><th>L</th>
        </tr></thead>
        <tbody>
          ${members.map(m => {
            let pC=0, aC=0, hC=0, lC=0;
            const cells = dayHeaders.map(h => {
              const rec = attIndex[`${m.MemberName}|${h.dateStr}`];
              let code = '', cls = 'none';
              if (h.isWE) { cls = 'WE'; code = 'WE'; }
              else if (rec) {
                const st = rec.Status;
                if (st === 'Present')  { cls = 'P'; code = 'P'; pC++; }
                else if (st === 'Half-day') { cls = 'H'; code = 'H'; hC++; }
                else if (st === 'Absent')   { cls = 'A'; code = 'A'; aC++; }
                else if (st === 'Leave')    { cls = 'L'; code = 'L'; lC++; }
              }
              return `<td><div class="att-cell ${cls}" onclick="showDayDetail('${h.dateStr}','${m.MemberName}')" title="View ${m.MemberName} on ${h.dateStr}">${code}</div></td>`;
            }).join('');
            return `<tr>
              <td class="member-col">
                <div style="font-weight:500">${m.MemberName}</div>
                <div style="font-size:10px;color:var(--muted)">${m.Role}</div>
              </td>
              ${cells}
              <td><span style="color:var(--green);font-weight:600">${pC}</span></td>
              <td><span style="color:var(--red);font-weight:600">${aC}</span></td>
              <td><span style="color:var(--amber);font-weight:600">${hC}</span></td>
              <td><span style="color:var(--purple);font-weight:600">${lC}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="att-legend">
      <div class="att-legend-item"><div class="att-legend-dot" style="background:rgba(46,204,113,.4)"></div>P = Present</div>
      <div class="att-legend-item"><div class="att-legend-dot" style="background:rgba(243,156,18,.4)"></div>H = Half-day</div>
      <div class="att-legend-item"><div class="att-legend-dot" style="background:rgba(231,76,60,.4)"></div>A = Absent</div>
      <div class="att-legend-item"><div class="att-legend-dot" style="background:rgba(155,89,182,.4)"></div>L = Leave</div>
      <div class="att-legend-item"><div class="att-legend-dot" style="background:rgba(136,136,170,.15);border:1px solid rgba(136,136,170,.3)"></div>WE = Weekend</div>
    </div>`;
}

function buildLogsTab() {
  const members = state.members.map(m => m.MemberName).filter(Boolean);
  const _logNow = new Date();
  const _logFirstDay = new Date(_logNow.getFullYear(), _logNow.getMonth(), 1).toISOString().slice(0,10);
  const _logToday = _logNow.toISOString().slice(0,10);

  return `
    <div class="logs-filter-bar" style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:flex-end">
      <div class="filter-group" style="flex:1 1 280px">
        <span class="filter-label">Member</span>
        <div style="display:flex;gap:8px">
          <select id="logFilterMember" style="font-size:13px;flex:1;min-width:100px" onchange="filterLogsTab()">
            <option value="">All Members</option>
            ${members.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <div style="position:relative;flex:1;min-width:0">
            <input type="text" id="logFilterSearch" placeholder="Search member or project…" oninput="debounceLogSearch()" style="padding-left:30px;width:100%;font-size:13px" />
            <span class="mat-icon" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:18px;pointer-events:none">search</span>
          </div>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">From</span>
        <input type="date" id="logFilterFrom" value="${_logFirstDay}" style="font-size:13px" onchange="filterLogsTab()" />
      </div>
      <div class="filter-group">
        <span class="filter-label">To</span>
        <input type="date" id="logFilterTo"   value="${_logToday}"   style="font-size:13px" onchange="filterLogsTab()" />
      </div>
      <div class="page-tabs" style="margin-bottom:0">
        <button class="page-tab active" onclick="switchLogsSubTab('att',this)">Attendance</button>
        <button class="page-tab" onclick="switchLogsSubTab('sessions',this)">Sessions</button>
      </div>
    </div>
    <div id="logsSubAtt"></div>
    <div id="logsSubSessions" style="display:none"></div>`;
}

function switchLogsSubTab(tab, btn) {
  document.querySelectorAll('#attTab-logs .page-tabs .page-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('logsSubAtt').style.display      = tab === 'att'      ? '' : 'none';
  document.getElementById('logsSubSessions').style.display = tab === 'sessions' ? '' : 'none';
}

async function filterLogsTab() {
  const member = document.getElementById('logFilterMember')?.value;
  const from   = document.getElementById('logFilterFrom')?.value;
  const to     = document.getElementById('logFilterTo')?.value;
  const search = document.getElementById('logFilterSearch')?.value.trim();
  const _lNow = new Date();
  const _lFirst = new Date(_lNow.getFullYear(), _lNow.getMonth(), 1).toISOString().slice(0,10);
  const _lToday = _lNow.toISOString().slice(0,10);
  const effectiveFrom = from || _lFirst;
  const effectiveTo   = to   || _lToday;
  const ap = new URLSearchParams(), sp = new URLSearchParams();
  if (member) { ap.set('member', member); sp.set('member', member); }
  if (search) { ap.set('search', search); sp.set('search', search); }
  ap.set('startDate', effectiveFrom);
  ap.set('endDate', effectiveTo);
  sp.set('startDate', effectiveFrom);
  sp.set('endDate', effectiveTo);
  const [att, sess] = await Promise.all([apiGet(`/api/attendance?${ap}`), apiGet(`/api/sessions?${sp}`)]);
  _attFull = att;  _ps('att').page  = 1; _attRender();
  _sessFull = sess; _ps('sess').page = 1; _sessRender();
}

function _attRender() {
  const el = document.getElementById('logsSubAtt');
  if (!el) return;
  el.innerHTML = buildAttTable(_pagSlice(_attFull, 'att')) + _pagBar(_attFull.length, 'att', '_attRender');
}

function _sessRender() {
  const el = document.getElementById('logsSubSessions');
  if (!el) return;
  el.innerHTML = buildSessionsTable(_pagSlice(_sessFull, 'sess')) + _pagBar(_sessFull.length, 'sess', '_sessRender');
}

function buildAttTable(data) {
  if (!data.length) return '<div class="empty-state"><div class="empty-icon">checklist</div><div class="empty-title">No attendance records</div></div>';
  const isAdmin = auth.role === 'admin';

  // Build session index: "MemberName|Date" → {earliest start, latest end, total mins}
  const sessIdx = {};
  (state.sessions || []).forEach(s => {
    const key = `${s.MemberName}|${s.Date}`;
    if (!sessIdx[key]) sessIdx[key] = { start: '', end: '', mins: 0 };
    const entry = sessIdx[key];
    if (s.StartTime && (!entry.start || s.StartTime < entry.start)) entry.start = s.StartTime;
    if (s.EndTime   && (!entry.end   || s.EndTime   > entry.end))   entry.end   = s.EndTime;
    entry.mins += parseInt(s.DurationMins) || 0;
  });

  return `<div class="card" style="padding:0"><div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Member</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Notes</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
    <tbody>
      ${data.map(r => {
        const sess = sessIdx[`${r.MemberName}|${r.Date}`] || {};
        const inT  = r.InTime  || sess.start || '';
        const outT = r.OutTime || sess.end   || '';
        const hrs  = r.TotalHours ? fmtDuration(r.TotalHours)
                   : sess.mins    ? minsToHHMM(sess.mins)
                   : '—';
        const json = encodeURIComponent(JSON.stringify(r));
        return `<tr>
          <td>${fmtDate(r.Date)}</td>
          <td><strong>${r.MemberName}</strong></td>
          <td>${statusBadge(r.Status)}</td>
          <td>${inT  ? fmtTime12(inT)  : '<span style="color:var(--border)">—</span>'}</td>
          <td>${outT ? fmtTime12(outT) : '<span style="color:var(--border)">—</span>'}</td>
          <td style="color:var(--accent2)">${hrs}</td>
          <td style="font-size:12px;color:var(--muted)">${r.Notes || '—'}</td>
          ${isAdmin ? `
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditAttendance(decodeURIComponent('${json}'))">Edit</button>
            <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteAttendance('${r.RecordID}')">Del</button>
          </td>` : ''}
        </tr>`;
      }).join('')}
    </tbody>
  </table></div></div>`;
}

// buildSessionsTable — card-wrapped version used by logs tab
function buildSessionsTable(data) {
  if (!data.length) return '<div class="empty-state"><div class="empty-icon">timer</div><div class="empty-title">No sessions logged yet</div></div>';
  const isAdmin = auth.role === 'admin';
  return `<div class="card" style="padding:0"><div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Member</th><th>Project</th><th>Discipline</th><th>Task</th><th>Assigned By</th><th>Start</th><th>End</th><th>Given</th><th>Taken</th><th>Status</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
    <tbody>
      ${data.map(s => {
        const json = encodeURIComponent(JSON.stringify(s));
        return `<tr>
          <td>${fmtDate(s.Date)}</td>
          <td>${s.MemberName}</td>
          <td><span style="font-size:11px;font-weight:700;color:var(--accent)">${s.ProjectCode}</span></td>
          <td>${s.Discipline ? discChip(s.Discipline) : '—'}</td>
          <td style="font-size:12px">${s.TaskType}</td>
          <td style="font-size:12px;color:var(--muted)">${s.AssignedBy || '—'}</td>
          <td style="font-size:12px">${fmtTime12(s.StartTime)}</td>
          <td style="font-size:12px">${fmtTime12(s.EndTime)}</td>
          <td style="font-size:12px;color:var(--muted)">${s.Deadline || '—'}</td>
          <td style="color:var(--accent2)">${minsToHHMM(s.DurationMins)}</td>
          <td>${deadlineBadge(s.DurationMins, s.Deadline)}</td>
          ${isAdmin ? `
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditSession(decodeURIComponent('${json}'))">Edit</button>
            <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteSession('${s.SessionID}')">Del</button>
          </td>` : ''}
        </tr>`;
      }).join('')}
    </tbody>
  </table></div></div>`;
}

function buildIssueReportForm(members) {
  const projects = state.projects.filter(p => p.Status === 'Active');
  const locs = [...new Set(projects.map(p => p.Location || '').filter(Boolean))].sort();
  return `
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">Report Idle / Issue Hours</div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:16px">Use this to log any work stoppage — software issues, network outages, waiting on files, etc. Attach a screenshot or describe in text.</p>
      <div class="form-grid">
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="issDate" value="${today()}" />
        </div>
        <div class="form-group">
          <label>Member *</label>
          <select id="issMember">
            <option value="">Select member…</option>
            ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Project (if applicable)</label>
          <div style="display:flex;gap:6px">
            <select id="issProject" style="flex:1">
              <option value="">— General / No project —</option>
              ${projects.map(p => `<option value="${p.ProjectCode}">${p.ProjectCode} – ${p.ProjectName}${p.Location ? ' · ' + p.Location : ''}</option>`).join('')}
            </select>
            <select id="issFormLocFilter" style="width:120px;font-size:11px" onchange="filterIssProjectsByLoc()">
              <option value="">All Locations</option>
              ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Issue Type *</label>
          <select id="issType">
            <option value="">Select type…</option>
            ${ISSUE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Duration Lost (hours)</label>
          <input type="number" id="issDuration" min="0.25" step="0.25" placeholder="e.g. 1.5" />
        </div>
        <div class="form-group"></div>
        <div class="form-group full">
          <label>Description *</label>
          <textarea id="issDesc" placeholder="Explain what happened and how it impacted your work…"></textarea>
        </div>
        <div class="form-group full">
          <label>Evidence (Screenshot or File)</label>
          <input type="file" id="issEvidence" accept="image/*,.pdf,.doc,.docx" />
          <span class="file-note">Uploads go to Google Drive → Project folder → Month → Date. Max 20MB.</span>
        </div>
      </div>
      <div class="form-actions" style="margin-top:16px;padding-top:12px">
        <button class="btn btn-primary" onclick="submitIssueFromAtt()">Submit Report</button>
      </div>
    </div>`;
}

async function submitIssueFromAtt() {
  const memberVal = document.getElementById('issMember').value.split('|');
  const fd = new FormData();
  fd.append('date', document.getElementById('issDate').value);
  fd.append('memberId', memberVal[0]);
  fd.append('memberName', memberVal[1] || '');
  fd.append('projectCode', document.getElementById('issProject').value);
  fd.append('issueType', document.getElementById('issType').value);
  fd.append('description', document.getElementById('issDesc').value);
  fd.append('durationLost', document.getElementById('issDuration').value);
  const file = document.getElementById('issEvidence').files[0];
  if (file) fd.append('evidence', file);
  if (!memberVal[1] || !fd.get('issueType') || !fd.get('description')) {
    toast('Please fill in required fields', 'error'); return;
  }
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const res = await apiPostForm('/api/issues', fd);
    toast('Issue report submitted!', 'success');
    document.getElementById('issDesc').value = '';
    document.getElementById('issDuration').value = '';
    document.getElementById('issEvidence').value = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Report';
  }
}

// Legacy switchAttTab (kept for any old references in HTML)
function switchAttTab(tab, btn) {
  document.querySelectorAll('.page-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const calEl = document.getElementById('attTabCalendar');
  const markEl = document.getElementById('attTabMark');
  const issEl = document.getElementById('attTabIssues');
  if (calEl) calEl.style.display = tab === 'calendar' ? '' : 'none';
  if (markEl) markEl.style.display = tab === 'mark' ? '' : 'none';
  if (issEl) issEl.style.display = tab === 'issues' ? '' : 'none';
}

async function changeAttMonth(delta) {
  state.attMonth += delta;
  if (state.attMonth > 12) { state.attMonth = 1; state.attYear++; }
  if (state.attMonth < 1)  { state.attMonth = 12; state.attYear--; }
  state.attendance = await apiGet(`/api/attendance?month=${state.attMonth}&year=${state.attYear}`);
  const calTab = document.getElementById('attTab-calendar');
  if (calTab) calTab.innerHTML = buildCalendarTab();
}

function quickMarkAtt(memberId, memberName, dateStr, currentCls) {
  const isWeekend = currentCls === 'WE';
  openModal(`Mark Attendance — ${memberName}`, `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${fmtDate(dateStr)}${isWeekend ? ' <span style="color:var(--muted);font-size:11px">(Weekend)</span>' : ''}</p>
    <div class="form-grid">
      <div class="form-group">
        <label>Status</label>
        <select id="qmStatus">
          <option value="Present">Present</option>
          <option value="Half-day">Half-day</option>
          <option value="Absent">Absent</option>
          <option value="Leave">Leave</option>
          <option value="Weekend" ${isWeekend ? 'selected' : ''}>Weekend</option>
        </select>
      </div>
      <div class="form-group">
        <label>Day Type</label>
        <select id="qmDayType">
          <option value="Weekday" ${!isWeekend ? 'selected' : ''}>Weekday</option>
          <option value="Weekend" ${isWeekend ? 'selected' : ''}>Weekend</option>
          <option value="Holiday">Holiday</option>
        </select>
      </div>
      ${timeFieldHtml('qmIn',  'In Time')}
      ${timeFieldHtml('qmOut', 'Out Time')}
      <div class="form-group full">
        <label>Notes</label><input type="text" id="qmNotes" placeholder="Optional…" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitQuickAtt('${memberId}','${memberName}','${dateStr}')">Save</button>
    </div>
  `);
}

async function submitQuickAtt(memberId, memberName, dateStr) {
  const body = {
    date: dateStr, memberId, memberName,
    status: document.getElementById('qmStatus').value,
    inTime: document.getElementById('qmIn')?.value || '',
    outTime: document.getElementById('qmOut')?.value || '',
    dayType: document.getElementById('qmDayType').value,
    notes: document.getElementById('qmNotes').value
  };
  await apiPost('/api/attendance', body);
  toast('Attendance marked!', 'success');
  closeModal();
  state.attendance = await apiGet(`/api/attendance?month=${state.attMonth}&year=${state.attYear}`);
  const calTab = document.getElementById('attTab-calendar');
  if (calTab) calTab.innerHTML = buildCalendarTab();
}

async function submitAttendance() {
  const memberVal = document.getElementById('attMember').value.split('|');
  const body = {
    date: document.getElementById('attDate').value,
    memberId: memberVal[0], memberName: memberVal[1],
    status: document.getElementById('attStatus').value,
    inTime: document.getElementById('attIn').value,
    outTime: document.getElementById('attOut').value,
    dayType: document.getElementById('attDayType').value,
    notes: document.getElementById('attNotes').value
  };
  if (!body.memberName || !body.date) { toast('Please select a member and date', 'error'); return; }
  await apiPost('/api/attendance', body);
  toast('Attendance marked!', 'success');
}

function exportAttendance() {
  const rows = [['Member', 'Date', 'Status', 'In Time', 'Out Time', 'Hours']];
  state.attendance.forEach(r => {
    rows.push([r.MemberName, r.Date, r.Status, r.InTime, r.OutTime, r.TotalHours]);
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `attendance-${state.attYear}-${state.attMonth}.csv`;
  a.click();
}

function filterMdProjectsByLoc() {
  const loc = document.getElementById('mdFormLocFilter').value;
  const sel = document.getElementById('mdProject');
  if (!sel) return;
  const val = sel.value;
  [...sel.options].forEach((opt, i) => {
    if (i === 0 || opt.value === '__new__') return;
    if (!loc) { opt.style.display = ''; return; }
    const projects = state.projects.filter(p => p.Status === 'Active');
    const code = opt.value.split('|')[0];
    const p = projects.find(x => x.ProjectCode === code);
    opt.style.display = p && p.Location === loc ? '' : 'none';
  });
  if (loc && val) {
    const opt = [...sel.options].find(o => o.value === val);
    if (opt && opt.style.display === 'none') sel.value = '';
  }
}

function showEditAttendance(rec) {
  const r = typeof rec === 'string' ? JSON.parse(rec) : rec;
  openModal('Edit Attendance Record', `
    <div class="form-grid">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="aeDate" value="${r.Date}" />
      </div>
      <div class="form-group">
        <label>Member</label>
        <input type="text" id="aeMember" value="${r.MemberName}" readonly style="background:var(--surface)" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="aeStatus">
          <option value="Present" ${r.Status === 'Present' ? 'selected' : ''}>Present</option>
          <option value="Half-day" ${r.Status === 'Half-day' ? 'selected' : ''}>Half-day</option>
          <option value="Absent" ${r.Status === 'Absent' ? 'selected' : ''}>Absent</option>
          <option value="Leave" ${r.Status === 'Leave' ? 'selected' : ''}>Leave</option>
        </select>
      </div>
      <div class="form-group">
        <label>In Time</label>
        <input type="time" id="aeIn" value="${r.InTime || ''}" />
      </div>
      <div class="form-group">
        <label>Out Time</label>
        <input type="time" id="aeOut" value="${r.OutTime || ''}" />
      </div>
      <div class="form-group full">
        <label>Notes</label>
        <input type="text" id="aeNotes" value="${r.Notes || ''}" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditAttendance('${r.RecordID}')">Save Changes</button>
    </div>
  `);
}

async function submitEditAttendance(recordId) {
  const body = {
    date: document.getElementById('aeDate').value,
    status: document.getElementById('aeStatus').value,
    inTime: document.getElementById('aeIn').value,
    outTime: document.getElementById('aeOut').value,
    notes: document.getElementById('aeNotes').value
  };
  await apiPut('/api/attendance/' + recordId, body);
  toast('Attendance updated!', 'success');
  closeModal();
  filterLogsTab();
}

async function deleteAttendance(recordId) {
  await deleteRecord('/api/attendance/' + recordId, 'attendance record', filterLogsTab);
}

function showEditSession(sess) {
  const s = typeof sess === 'string' ? JSON.parse(sess) : sess;
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');
  openModal('Edit Session', `
    <div class="form-grid">
      <div class="form-group">
        <label>Date *</label>
        <input type="date" id="seDate" value="${s.Date}" />
      </div>
      <div class="form-group">
        <label>Member *</label>
        <select id="seMember">
          <option value="">Select…</option>
          ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}"${m.MemberName === s.MemberName ? ' selected' : ''}>${m.MemberName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Project *</label>
        <select id="seProject">
          <option value="">Select…</option>
          ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}"${p.ProjectCode === s.ProjectCode ? ' selected' : ''}>${p.ProjectCode} – ${p.ProjectName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Discipline *</label>
        <select id="seDisc">
          ${DISCIPLINES.map(d => `<option value="${d}"${d === s.Discipline ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Task *</label>
        ${taskComboHtml('seTask')}
      </div>
      <div class="form-group">
        <label>Start Time *</label>
        <input type="time" id="seStart" value="${s.StartTime || ''}" />
      </div>
      <div class="form-group">
        <label>End Time *</label>
        <input type="time" id="seEnd" value="${s.EndTime || ''}" />
      </div>
      <div class="form-group">
        <label>Assigned By</label>
        <input type="text" id="seAssignedBy" value="${s.AssignedBy || ''}" placeholder="Name of assigner…" />
      </div>
      <div class="form-group">
        <label>Deadline <span style="font-weight:400;color:var(--muted)">(hrs given — HH:MM)</span></label>
        <input type="text" id="seDeadline" value="${s.Deadline || ''}" placeholder="e.g. 03:00" maxlength="5" oninput="fmtDeadlineInput(this)" />
      </div>
      <div class="form-group full">
        <label>Notes</label>
        <input type="text" id="seNotes" value="${s.Notes || ''}" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditSession('${s.SessionID}')">Save Changes</button>
    </div>
  `);
}

async function submitEditSession(sessionId) {
  const memberVal = document.getElementById('seMember').value.split('|');
  const projectVal = document.getElementById('seProject').value.split('|');
  const body = {
    date: document.getElementById('seDate').value,
    memberId: memberVal[0], memberName: memberVal[1],
    projectCode: projectVal[0], projectName: projectVal[1],
    discipline: document.getElementById('seDisc').value,
    taskType: document.getElementById('seTask').value,
    startTime: document.getElementById('seStart').value,
    endTime: document.getElementById('seEnd').value,
    assignedBy: document.getElementById('seAssignedBy').value,
    deadline: document.getElementById('seDeadline').value,
    notes: document.getElementById('seNotes').value
  };
  if (!body.memberName || !body.projectCode || !body.taskType || !body.startTime || !body.endTime) {
    toast('Fill in all required fields', 'error'); return;
  }
  await apiPut('/api/sessions/' + sessionId, body);
  toast('Session updated!', 'success');
  closeModal();
  filterLogsTab();
}

async function deleteSession(sessionId) {
  await deleteRecord('/api/sessions/' + sessionId, 'session', filterLogsTab);
}

async function deleteDaySession(sessionId) {
  await deleteRecord('/api/sessions/' + sessionId, 'session', reloadDayView);
}

/* ── Day Detail Modal (calendar date header click) ─────── */

async function showDayDetail(dateStr, preFilterMember = '') {
  const [att, sess] = await Promise.all([
    apiGet(`/api/attendance?date=${dateStr}`),
    apiGet(`/api/sessions?date=${dateStr}`)
  ]);
  _dayDetailAtt  = att;
  _dayDetailSess = sess;
  _dayDetailDate = dateStr;
  openModal(fmtDate(dateStr) + ' — Day Detail', _buildDayDetailHtml(preFilterMember, ''), true);
}

function _buildDayDetailHtml(filterMember, filterStatus) {
  const members = state.members.filter(m => m.Status === 'Active');
  let att  = _dayDetailAtt;
  let sess = _dayDetailSess;
  if (filterMember) { att = att.filter(r => r.MemberName === filterMember); sess = sess.filter(s => s.MemberName === filterMember); }
  if (filterStatus) { att = att.filter(r => r.Status === filterStatus); }

  // Build employee-wise cards
  const allNames = [...new Set([...att.map(r => r.MemberName), ...sess.map(s => s.MemberName)])].sort();

  const employeeCards = allNames.length
    ? allNames.map(name => {
        const attRec  = att.find(r => r.MemberName === name);
        const mySess  = sess.filter(s => s.MemberName === name);
        const totalMins = mySess.reduce((sum, s) => sum + (parseInt(s.DurationMins) || 0), 0);

        const attBar = attRec ? `
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:${mySess.length ? '10px' : '0'}">
            ${statusBadge(attRec.Status)}
            ${attRec.InTime  ? `<span style="font-size:12px;color:var(--muted)">In: <strong style="color:var(--text)">${fmtTime12(attRec.InTime)}</strong></span>` : ''}
            ${attRec.OutTime ? `<span style="font-size:12px;color:var(--muted)">Out: <strong style="color:var(--text)">${fmtTime12(attRec.OutTime)}</strong></span>` : ''}
            ${attRec.TotalHours ? `<span style="font-size:12px;color:var(--accent2)">${fmtDuration(attRec.TotalHours)} total</span>` : ''}
            ${attRec.Notes ? `<span style="font-size:11px;color:var(--muted);font-style:italic">${attRec.Notes}</span>` : ''}
            <span style="margin-left:auto;display:flex;gap:4px">
              <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditAttendance(decodeURIComponent('${encodeURIComponent(JSON.stringify(attRec))}'))">Edit</button>
              <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteAttendance('${attRec.RecordID}')">Del</button>
            </span>
          </div>` : `<div style="display:flex;align-items:center;gap:10px;margin-bottom:${mySess.length ? '10px' : '0'}">
            <span style="font-size:12px;color:var(--muted)">No attendance record</span>
            <button class="btn btn-sm btn-secondary" style="padding:3px 10px;font-size:11px" onclick="quickMarkAtt('${state.members.find(mb=>mb.MemberName===name)?.MemberID||''}','${name}','${_dayDetailDate}','none')">Mark Attendance</button>
          </div>`;

        const sessTable = mySess.length ? `
          <div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">
            Sessions · ${mySess.length} log${mySess.length>1?'s':''} · <span style="color:var(--accent2)">${minsToHHMM(totalMins)}</span>
          </div>
          <div class="table-wrap"><table style="font-size:12px">
            <thead><tr style="font-size:10px"><th>Project</th><th>Disc</th><th>Task</th><th>Assigned By</th><th>Start</th><th>End</th><th>Given</th><th>Taken</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${mySess.map(s => {
                const sj = encodeURIComponent(JSON.stringify(s));
                return `<tr>
                  <td><span style="font-weight:700;color:var(--accent)">${s.ProjectCode}</span><br><span style="color:var(--muted);font-size:10px">${s.ProjectName||''}</span></td>
                  <td>${s.Discipline ? discChip(s.Discipline) : '—'}</td>
                  <td style="max-width:160px">${s.TaskType||'—'}</td>
                  <td style="color:var(--muted)">${s.AssignedBy||'—'}</td>
                  <td>${fmtTime12(s.StartTime)}</td>
                  <td>${fmtTime12(s.EndTime)}</td>
                  <td style="color:var(--muted)">${s.Deadline || '—'}</td>
                  <td style="color:var(--accent2);white-space:nowrap">${minsToHHMM(s.DurationMins)}</td>
                  <td>${deadlineBadge(s.DurationMins, s.Deadline)}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditSession(decodeURIComponent('${sj}'))">Edit</button>
                    <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteDayDetailSession('${s.SessionID}')">Del</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>` : `<div style="font-size:12px;color:var(--muted)">No sessions logged</div>`;

        return `
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;background:var(--surface)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div>
                <span style="font-weight:600;font-size:14px">${name}</span>
                <span style="font-size:11px;color:var(--muted);margin-left:8px">${state.members.find(m=>m.MemberName===name)?.Role||''}</span>
              </div>
              <button class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:11px" onclick="addSessionFromDay('${_dayDetailDate}','${name}')">+ Session</button>
            </div>
            ${attBar}
            ${sessTable}
          </div>`;
      }).join('')
    : `<div style="text-align:center;color:var(--muted);padding:32px;font-size:13px">No records found for this date</div>`;

  return `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
      <select id="ddFilterMember" style="font-size:13px" onchange="refreshDayDetail()">
        <option value="">All Members</option>
        ${members.map(m => `<option value="${m.MemberName}"${filterMember===m.MemberName?' selected':''}>${m.MemberName}</option>`).join('')}
      </select>
      <select id="ddFilterStatus" style="font-size:13px" onchange="refreshDayDetail()">
        <option value="">All Statuses</option>
        <option value="Present"${filterStatus==='Present'?' selected':''}>Present</option>
        <option value="Half-day"${filterStatus==='Half-day'?' selected':''}>Half-day</option>
        <option value="Absent"${filterStatus==='Absent'?' selected':''}>Absent</option>
        <option value="Leave"${filterStatus==='Leave'?' selected':''}>Leave</option>
      </select>
      <div style="flex:1"></div>
      <span style="font-size:12px;color:var(--muted)">${allNames.length} member${allNames.length!==1?'s':''} · ${sess.length} session${sess.length!==1?'s':''}</span>
      <button class="btn btn-primary btn-sm" style="padding:6px 14px;font-size:12px" onclick="addSessionFromDay('${_dayDetailDate}')">+ Add Session</button>
    </div>
    ${employeeCards}`;
}

function refreshDayDetail() {
  const member = document.getElementById('ddFilterMember')?.value || '';
  const status = document.getElementById('ddFilterStatus')?.value || '';
  document.getElementById('modalBody').innerHTML = _buildDayDetailHtml(member, status);
}

async function deleteDayDetailSession(sessionId) {
  if (!confirm('Delete this session?')) return;
  await apiDelete('/api/sessions/' + sessionId);
  toast('Session deleted', 'success');
  const [att, sess] = await Promise.all([
    apiGet(`/api/attendance?date=${_dayDetailDate}`),
    apiGet(`/api/sessions?date=${_dayDetailDate}`)
  ]);
  _dayDetailAtt  = att;
  _dayDetailSess = sess;
  const member = document.getElementById('ddFilterMember')?.value || '';
  const status = document.getElementById('ddFilterStatus')?.value || '';
  document.getElementById('modalBody').innerHTML = _buildDayDetailHtml(member, status);
}

function addSessionFromDay(dateStr, presetMemberName = '') {
  const members  = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');
  openModal('Add Session — ' + fmtDate(dateStr), `
    <div class="form-grid">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="asDate" value="${dateStr}" style="background:var(--surface)" readonly />
      </div>
      <div class="form-group">
        <label>Member *</label>
        <select id="asMember">
          <option value="">Select member…</option>
          ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}"${m.MemberName===presetMemberName?' selected':''}>${m.MemberName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Project *</label>
        <select id="asProject">
          <option value="">Select project…</option>
          ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}">${p.ProjectCode} – ${p.ProjectName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Discipline *</label>
        <select id="asDisc">
          <option value="">Select discipline…</option>
          ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Task *</label>
        ${taskComboHtml('asTask')}
      </div>
      <div class="form-group">
        <label>Start Time *</label>
        <input type="time" id="asStart" />
      </div>
      <div class="form-group">
        <label>End Time *</label>
        <input type="time" id="asEnd" />
      </div>
      <div class="form-group full">
        <label>Notes</label>
        <input type="text" id="asNotes" placeholder="Optional…" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="showDayDetail('${dateStr}')">← Back</button>
      <button class="btn btn-primary" onclick="submitDayDetailSession('${dateStr}')">Save Session</button>
    </div>
  `, true);
}

async function submitDayDetailSession(dateStr) {
  const memberVal  = document.getElementById('asMember').value.split('|');
  const projectVal = document.getElementById('asProject').value.split('|');
  const body = {
    date:        dateStr,
    memberId:    memberVal[0],
    memberName:  memberVal[1],
    projectCode: projectVal[0],
    projectName: projectVal[1],
    discipline:  document.getElementById('asDisc').value,
    taskType:    document.getElementById('asTask').value,
    startTime:   document.getElementById('asStart').value,
    endTime:     document.getElementById('asEnd').value,
    notes:       document.getElementById('asNotes').value
  };
  if (!body.memberName || !body.projectCode || !body.taskType || !body.startTime || !body.endTime) {
    toast('Fill in all required fields', 'error'); return;
  }
  await apiPost('/api/sessions', body);
  toast('Session added!', 'success');
  await showDayDetail(dateStr);
}

function filterIssProjectsByLoc() {
  const loc = document.getElementById('issFormLocFilter').value;
  const sel = document.getElementById('issProject');
  if (!sel) return;
  const val = sel.value;
  [...sel.options].forEach((opt, i) => {
    if (i === 0) return;
    if (!loc) { opt.style.display = ''; return; }
    const projects = state.projects.filter(p => p.Status === 'Active');
    const p = projects.find(x => x.ProjectCode === opt.value);
    opt.style.display = p && p.Location === loc ? '' : 'none';
  });
  if (loc && val) {
    const opt = [...sel.options].find(o => o.value === val);
    if (opt && opt.style.display === 'none') sel.value = '';
  }
}
