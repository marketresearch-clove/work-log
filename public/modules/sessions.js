/* ═══════════════════════════════════════════════════════
   SESSIONS (unified page — redirects to attendance)
   ═══════════════════════════════════════════════════════ */

function renderSessions() {
  // sessions is merged → redirect
  navigate('attendance');
}

function renderAttendance_unified() {
  const el = document.getElementById('page-sessions');
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');

  const todaySessions = state.sessions.filter(s => s.Date === state.sessionDate);

  el.innerHTML = `
    <div class="dash-grid">
      <div>
        <div class="session-form-card">
          <div class="card-title" style="margin-bottom:16px">Log Work Session</div>
          <div class="form-grid">
            <div class="form-group">
              <label>Date *</label>
              <input type="date" id="ssDate" value="${state.sessionDate}" onchange="state.sessionDate=this.value;reloadSessionList()" />
            </div>
            <div class="form-group">
              <label>Member *</label>
              <select id="ssMember" onchange="filterProjectsByMember(this.value,'ssProject')">
                <option value="">Select member…</option>
                ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Project *</label>
              <select id="ssProject" onchange="fillDiscFromProject(this.value)">
                <option value="">Select project…</option>
                ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}|${p.Disciplines}">${p.ProjectCode} – ${p.ProjectName}</option>`).join('')}
                <option value="__new__">+ Create New Project…</option>
              </select>
            </div>
            <div class="form-group">
              <label>Discipline *</label>
              <select id="ssDisc">
                <option value="">Select discipline…</option>
                ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Task * <span style="font-weight:400;color:var(--muted)">(search or type custom)</span></label>
              ${taskComboHtml('ssTask')}
            </div>
            <div class="form-group">
              <label>Start Time *</label>
              <input type="time" id="ssStart" />
            </div>
            <div class="form-group">
              <label>End Time *</label>
              <input type="time" id="ssEnd" />
            </div>
            <div class="form-group">
              <label>Assigned By</label>
              <input type="text" id="ssAssignedBy" placeholder="Name of assigner…" />
            </div>
            <div class="form-group">
              <label>Deadline <span style="font-weight:400;color:var(--muted)">(hrs given — HH:MM)</span></label>
              <input type="text" id="ssDeadline" placeholder="e.g. 03:00" maxlength="5" oninput="fmtDeadlineInput(this)" />
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <input type="text" id="ssNotes" placeholder="Optional notes…" />
            </div>
          </div>
          <div class="form-actions" style="margin-top:16px;padding-top:12px">
            <button class="btn btn-primary" onclick="submitSession()">Log Session</button>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Sessions on <span id="sessionDateLabel">${fmtDate(state.sessionDate)}</span></span>
          </div>
          <div class="session-list" id="sessionListEl">
            ${buildSessionList(todaySessions)}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;padding:0">
      <div class="card-header" style="padding:16px 20px">
        <span class="card-title">All Sessions</span>
        <div style="display:flex;gap:10px">
          <select id="ssFilterMember" style="font-size:13px" onchange="filterSessions()">
            <option value="">All Members</option>
            ${state.members.map(m => `<option value="${m.MemberName}">${m.MemberName}</option>`).join('')}
          </select>
          <select id="ssFilterProject" style="font-size:13px" onchange="filterSessions()">
            <option value="">All Projects</option>
            ${projects.map(p => `<option value="${p.ProjectCode}">${p.ProjectCode}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap" id="sessionsAllTable">
        ${buildSessionsTableSimple(state.sessions)}
      </div>
    </div>
  `;
}

function buildSessionList(sessions) {
  if (!sessions.length) return '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">No sessions logged for this date</div>';
  return sessions.map(s => {
    const dur = minsToHHMM(s.DurationMins);
    return `
      <div class="session-item">
        <span class="session-time">${fmtTime(s.StartTime)}</span>
        <span class="session-divider">→</span>
        <span class="session-time">${fmtTime(s.EndTime)}</span>
        <div class="session-info">
          <div class="session-project">${s.ProjectCode} ${s.Discipline ? discChip(s.Discipline) : ''}</div>
          <div class="session-task">${s.TaskType}</div>
          <div style="font-size:11px;color:var(--muted)">${s.MemberName}${s.AssignedBy ? ` · by ${s.AssignedBy}` : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="session-duration">${dur}</span>
          ${s.Deadline ? `<span style="font-size:10px;color:var(--muted)">given ${s.Deadline}</span>${deadlineBadge(s.DurationMins, s.Deadline)}` : ''}
        </div>
      </div>`;
  }).join('');
}

// Simple sessions table used by the sessions page (no card wrap)
function buildSessionsTableSimple(data) {
  if (!data.length) return '<div class="empty-state"><div class="empty-icon">timer</div><div class="empty-title">No sessions logged yet</div></div>';
  const isAdmin = auth.role === 'admin';
  return `
    <table>
      <thead><tr>
        <th>Date</th><th>Member</th><th>Project</th><th>Discipline</th>
        <th>Task</th><th>Assigned By</th><th>Start</th><th>End</th><th>Given</th><th>Taken</th><th>Status</th>
        ${isAdmin ? '<th>Actions</th>' : ''}
      </tr></thead>
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
    </table>`;
}

function fillDiscFromProject(val) {
  if (val === '__new__') { showAddProject(); return; }
  const parts = val.split('|');
  const discs = (parts[2] || '').split(',').map(d => d.trim()).filter(Boolean);
  if (discs.length === 1) {
    const sel = document.getElementById('ssDisc');
    if (sel) sel.value = discs[0];
  }
}

async function reloadSessionList() {
  const sessions = await apiGet(`/api/sessions?date=${state.sessionDate}`);
  document.getElementById('sessionListEl').innerHTML = buildSessionList(sessions);
  document.getElementById('sessionDateLabel').textContent = fmtDate(state.sessionDate);
}

async function filterSessions() {
  const member = document.getElementById('ssFilterMember').value;
  const project = document.getElementById('ssFilterProject').value;
  const params = new URLSearchParams();
  if (member) params.set('member', member);
  if (project) params.set('project', project);
  const data = await apiGet(`/api/sessions?${params}`);
  document.getElementById('sessionsAllTable').innerHTML = buildSessionsTableSimple(data);
}

async function submitSession() {
  const memberVal = document.getElementById('ssMember').value.split('|');
  const projectVal = document.getElementById('ssProject').value.split('|');
  if (projectVal[0] === '__new__') return;
  const body = {
    date: document.getElementById('ssDate').value,
    memberId: memberVal[0], memberName: memberVal[1],
    projectCode: projectVal[0], projectName: projectVal[1],
    discipline: document.getElementById('ssDisc').value,
    taskType: document.getElementById('ssTask').value,
    startTime: document.getElementById('ssStart').value,
    endTime: document.getElementById('ssEnd').value,
    assignedBy: document.getElementById('ssAssignedBy').value,
    deadline: document.getElementById('ssDeadline').value,
    notes: document.getElementById('ssNotes').value
  };
  if (!body.memberName || !body.projectCode || !body.taskType || !body.startTime || !body.endTime) {
    toast('Please fill in all required fields', 'error'); return;
  }
  await apiPost('/api/sessions', body);
  toast('Session logged!', 'success');
  reloadSessionList();
  const allSessions = await apiGet('/api/sessions');
  document.getElementById('sessionsAllTable').innerHTML = buildSessionsTableSimple(allSessions);
}

function showAddSession() { document.getElementById('ssStart').focus(); }
