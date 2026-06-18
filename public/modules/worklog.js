/* ═══════════════════════════════════════════════════════
   WORK LOG
   ═══════════════════════════════════════════════════════ */

function renderWorklog() {
  const el = document.getElementById('page-worklog');
  const members = state.members.map(m => m.MemberName).filter(Boolean);
  const projects = state.projects.map(p => p.ProjectCode).filter(Boolean);

  const locs = [...new Set(state.projects.map(p => p.Location || '').filter(Boolean))].sort();

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const today = now.toISOString().slice(0,10);

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary" onclick="showAddWorklog()">+ Add Entry</button>
    </div>
    <div class="filters">
      <div class="filter-group" style="flex:1 1 280px">
        <span class="filter-label">Member</span>
        <div style="display:flex;gap:8px">
          <select id="wlFilterMember" style="min-width:120px;flex:1" onchange="applyWLFilter()">
            <option value="">All Members</option>
            ${members.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <div style="position:relative;flex:1;min-width:0">
            <input type="text" id="wlFilterSearch" placeholder="Search name or project…" oninput="debounceSearch()" style="padding-left:30px;width:100%" />
            <span class="mat-icon" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:18px;pointer-events:none">search</span>
          </div>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Project</span>
        <select id="wlFilterProject" style="min-width:120px" onchange="applyWLFilter()">
          <option value="">All Projects</option>
          ${projects.map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Location</span>
        <select id="wlFilterLocation" style="min-width:120px" onchange="applyWLFilter()">
          <option value="">All Locations</option>
          ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Discipline</span>
        <select id="wlFilterDisc" style="min-width:120px" onchange="applyWLFilter()">
          <option value="">All Disciplines</option>
          ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Date From</span>
        <input type="date" id="wlFilterFrom" value="${firstDay}" onchange="applyWLFilter()" />
      </div>
      <div class="filter-group">
        <span class="filter-label">Date To</span>
        <input type="date" id="wlFilterTo" value="${today}" onchange="applyWLFilter()" />
      </div>
    </div>
    <div class="filter-tags" id="wlFilterTags"></div>
    <div id="wlTable"></div>
  `;
  updateFilterTags();
  _wlFull = state.worklog;
  _ps('wl').page = 1;
  _wlRender();
}

function buildWorklogTable(data) {
  if (!data.length) return `<div class="empty-state"><div class="empty-icon">checklist</div><div class="empty-title">No work log entries yet</div><div class="empty-sub">Add your first entry using the button above</div></div>`;
  const isAdmin = auth.role === 'admin';
  return `
    <table>
      <thead><tr>
        <th>Date</th><th>Member</th><th>Project</th><th>Discipline</th>
        <th>Task Type</th><th>Description</th><th>Assigned By</th>
        <th>Start</th><th>End</th><th>Hours</th>
        ${isAdmin ? '<th>Actions</th>' : ''}
      </tr></thead>
      <tbody>
        ${data.map(r => {
          const json = encodeURIComponent(JSON.stringify(r));
          return `<tr>
            <td>${fmtDate(r.Date)}</td>
            <td><strong>${r.MemberName}</strong></td>
            <td><span style="font-size:11px;font-weight:700;color:var(--accent)">${r.ProjectCode}</span></td>
            <td>${r.Discipline ? discChip(r.Discipline) : '—'}</td>
            <td style="font-size:12px">${r.TaskType || '—'}</td>
            <td style="max-width:240px;font-size:12px;color:var(--muted)">${r.Description || '—'}</td>
            <td style="font-size:12px">${r.AssignedBy || '—'}</td>
            <td style="font-size:12px">${fmtTime(r.StartTime)}</td>
            <td style="font-size:12px">${fmtTime(r.EndTime)}</td>
            <td style="font-size:12px;color:var(--accent2)">${fmtDuration(r.DurationHours)}</td>
            ${isAdmin ? `
            <td style="white-space:nowrap">
              <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:10px" onclick="showEditWorklog(decodeURIComponent('${json}'))">Edit</button>
              <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteWorklog('${r.EntryID}')">Del</button>
            </td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

let _searchTimer;

function debounceSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applyWLFilter, 300);
}

async function applyWLFilter() {
  const member = document.getElementById('wlFilterMember').value;
  const project = document.getElementById('wlFilterProject').value;
  const location = document.getElementById('wlFilterLocation').value;
  const disc = document.getElementById('wlFilterDisc').value;
  const search = document.getElementById('wlFilterSearch').value.trim();
  const from = document.getElementById('wlFilterFrom').value;
  const to = document.getElementById('wlFilterTo').value;
  const params = new URLSearchParams();
  if (member) params.set('member', member);
  if (project) params.set('project', project);
  if (disc) params.set('discipline', disc);
  if (search) params.set('search', search);
  if (from) params.set('startDate', from);
  if (to) params.set('endDate', to);
  let data = await apiGet(`/api/worklog?${params}`);
  if (location) {
    const locProjectCodes = state.projects.filter(p => p.Location === location).map(p => p.ProjectCode);
    data = data.filter(r => locProjectCodes.includes(r.ProjectCode));
  }
  _wlFull = data; _ps('wl').page = 1; _wlRender();
  updateFilterTags();
}

function _wlRender() {
  const el = document.getElementById('wlTable');
  if (!el) return;
  const slice = _pagSlice(_wlFull, 'wl');
  el.innerHTML = `<div class="card" style="padding:0"><div class="table-wrap">${buildWorklogTable(slice)}</div></div>` + _pagBar(_wlFull.length, 'wl', '_wlRender');
}

function updateFilterTags() {
  const tags = [
    { id: 'wlFilterMember', label: 'Member' },
    { id: 'wlFilterProject', label: 'Project' },
    { id: 'wlFilterLocation', label: 'Location' },
    { id: 'wlFilterDisc',    label: 'Discipline' },
    { id: 'wlFilterSearch',  label: 'Search' },
    { id: 'wlFilterFrom',    label: 'Date From' },
    { id: 'wlFilterTo',      label: 'Date To' }
  ];
  const container = document.getElementById('wlFilterTags');
  if (!container) return;
  const active = tags.filter(t => document.getElementById(t.id)?.value);
  if (!active.length) { container.innerHTML = ''; return; }
  container.innerHTML = active.map(t =>
    `<span class="filter-tag">${t.label}: ${document.getElementById(t.id).value}<span class="tag-x" onclick="clearFilter('${t.id}')">&times;</span></span>`
  ).join('') + `<button class="filter-tag-clear" onclick="clearAllFilters()">Clear All</button>`;
}

function clearFilter(id) {
  const el = document.getElementById(id);
  if (el) { el.value = ''; applyWLFilter(); }
}

function clearAllFilters() {
  ['wlFilterMember','wlFilterProject','wlFilterLocation','wlFilterDisc','wlFilterSearch','wlFilterFrom','wlFilterTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyWLFilter();
}

function wlAssignedChange(val, customId = 'wlAssignedCustom') {
  const input = document.getElementById(customId);
  if (input) input.style.display = val === '__custom__' ? '' : 'none';
}

function showAddWorklog() {
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');
  const locs = [...new Set(projects.map(p => p.Location || '').filter(Boolean))].sort();
  const myMember = members.find(m => m.MemberName.trim() === (auth.name || '').trim());
  const myVal = myMember ? `${myMember.MemberID}|${myMember.MemberName}` : '';
  openModal('Add Work Log Entry', `
    <div style="display:flex;flex-direction:column;gap:0">

      <!-- Section: Who & When -->
      <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="flex:1;height:1px;background:var(--border)"></span><span class="mat-icon" style="font-size:14px">person</span> Who &amp; When<span style="flex:1;height:1px;background:var(--border)"></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="form-group">
          <label>Date <span style="color:var(--red)">*</span></label>
          <input type="date" id="wlDate" value="${today()}" />
        </div>
        <div class="form-group">
          <label>Member <span style="color:var(--red)">*</span></label>
          <select id="wlMember" onchange="filterProjectsByMember(this.value,'wlProject')">
            <option value="">Select member…</option>
            ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}"${m.MemberID === (myMember?.MemberID||'') ? ' selected' : ''}>${m.MemberName}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Section: What -->
      <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="flex:1;height:1px;background:var(--border)"></span><span class="mat-icon" style="font-size:14px">folder_open</span> What<span style="flex:1;height:1px;background:var(--border)"></span>
      </div>
      <div style="margin-bottom:10px">
        <div class="form-group">
          <label>Project <span style="color:var(--red)">*</span></label>
          <div style="display:flex;gap:6px">
            <select id="wlProject" style="flex:1">
              <option value="">Select project…</option>
              ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}">${p.ProjectCode} – ${p.ProjectName}${p.Location ? ' · ' + p.Location : ''}</option>`).join('')}
            </select>
            <select id="wlFormLocFilter" style="width:110px;font-size:11px" onchange="filterWlProjectsByLoc()">
              <option value="">All Locations</option>
              ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
        <div class="form-group">
          <label>Discipline <span style="color:var(--red)">*</span></label>
          <select id="wlDisc">
            <option value="">Select…</option>
            ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Assigned By</label>
          <select id="wlAssigned" onchange="wlAssignedChange(this.value)">
            <option value="">Self-directed</option>
            ${(state.assignees || []).map(name => `<option value="${name}">${name}</option>`).join('')}
            <option value="__custom__">+ Add person…</option>
          </select>
          <input type="text" id="wlAssignedCustom" placeholder="Enter person name…" style="display:none;margin-top:4px" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label>Task Type <span style="color:var(--red)">*</span> <span style="font-weight:400;color:var(--muted);font-size:11px">(search or type custom)</span></label>
        ${taskComboHtml('wlTask')}
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>Description <span style="color:var(--muted);font-weight:400;font-size:11px">(optional)</span></label>
        <textarea id="wlDesc" placeholder="Additional detail about the work done…" style="height:64px"></textarea>
      </div>

      <!-- Section: Time -->
      <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="flex:1;height:1px;background:var(--border)"></span><span class="mat-icon" style="font-size:14px">timer</span> Time<span style="flex:1;height:1px;background:var(--border)"></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
        ${timeFieldHtml('wlStart', 'Start Time')}
        ${timeFieldHtml('wlEnd', 'End Time')}
      </div>
      <div id="wlDurPreview" style="text-align:center;font-size:12px;color:var(--accent2);min-height:18px;margin-bottom:10px"></div>
      <div class="form-group" style="margin-bottom:0">
        <label>Notes <span style="color:var(--muted);font-weight:400;font-size:11px">(optional)</span></label>
        <input type="text" id="wlNotes" placeholder="e.g. Reviewed with client, pending approval…" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="min-width:120px" onclick="submitWorklog()"><span class="mat-icon">save</span> Save Entry</button>
    </div>
  `);
  // Wire up duration preview
  ['wlStart','wlEnd'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('change', _updateWlDurPreview);
  });
  // Pre-filter projects for selected member
  if (myVal) filterProjectsByMember(myVal, 'wlProject');
}

function _updateWlDurPreview() {
  const s = document.getElementById('wlStart')?.value;
  const e = document.getElementById('wlEnd')?.value;
  const el = document.getElementById('wlDurPreview');
  if (!el) return;
  if (s && e && e > s) {
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    el.innerHTML = `<span class="mat-icon" style="font-size:13px;vertical-align:-2px">timer</span> Duration: ${minsToHHMM(mins)}`;
  } else {
    el.textContent = '';
  }
}

async function submitWorklog() {
  const memberVal = document.getElementById('wlMember').value.split('|');
  const projectVal = document.getElementById('wlProject').value.split('|');
  const body = {
    date: document.getElementById('wlDate').value,
    memberId: memberVal[0], memberName: memberVal[1],
    projectCode: projectVal[0], projectName: projectVal[1],
    discipline: document.getElementById('wlDisc').value,
    taskType: document.getElementById('wlTask').value,
    description: document.getElementById('wlDesc').value,
    assignedBy: (() => { const v = document.getElementById('wlAssigned').value; return v === '__custom__' ? (document.getElementById('wlAssignedCustom')?.value?.trim() || '') : v; })(),
    startTime: document.getElementById('wlStart').value,
    endTime: document.getElementById('wlEnd').value,
    notes: document.getElementById('wlNotes').value
  };
  if (!body.memberName || !body.projectCode || !body.discipline || !body.taskType) {
    toast('Please fill in all required fields', 'error'); return;
  }
  await apiPost('/api/worklog', body);
  toast('Work log entry saved!', 'success');
  closeModal();
  // Dynamic refresh: re-apply current filters instead of full page re-render
  applyWLFilter();
}

function showEditWorklog(wEntry) {
  const e = typeof wEntry === 'string' ? JSON.parse(wEntry) : wEntry;
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');
  const locs = [...new Set(projects.map(p => p.Location || '').filter(Boolean))].sort();
  openModal('Edit Work Log Entry', `
    <div class="form-grid">
      <div class="form-group">
        <label>Date *</label>
        <input type="date" id="weDate" value="${e.Date || today()}" />
      </div>
      <div class="form-group">
        <label>Member *</label>
        <select id="weMember">
          <option value="">Select member…</option>
          ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}"${m.MemberName === e.MemberName ? ' selected' : ''}>${m.MemberName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Project *</label>
        <div style="display:flex;gap:6px">
          <select id="weProject" style="flex:1">
            <option value="">Select project…</option>
            ${projects.map(p => `<option value="${p.ProjectCode}|${p.ProjectName}"${p.ProjectCode === e.ProjectCode ? ' selected' : ''}>${p.ProjectCode} – ${p.ProjectName}${p.Location ? ' · ' + p.Location : ''}</option>`).join('')}
          </select>
          <select id="weFormLocFilter" style="width:110px;font-size:11px" onchange="filterWeProjectsByLoc()">
            <option value="">All Locations</option>
            ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Discipline *</label>
        <select id="weDisc">
          <option value="">Select discipline…</option>
          ${DISCIPLINES.map(d => `<option value="${d}"${d === e.Discipline ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Task Type *</label>
        ${taskComboHtml('weTask')}
      </div>
      <div class="form-group full">
        <label>Description</label>
        <textarea id="weDesc">${e.Description || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Assigned By</label>
        <select id="weAssigned" onchange="wlAssignedChange(this.value, 'weAssignedCustom')">
          <option value="">— Not assigned —</option>
          ${(state.assignees || []).map(name => `<option value="${name}"${name === e.AssignedBy ? ' selected' : ''}>${name}</option>`).join('')}
          ${e.AssignedBy && !(state.assignees || []).includes(e.AssignedBy) ? `<option value="${e.AssignedBy}" selected>${e.AssignedBy}</option>` : ''}
          <option value="__custom__">+ Add person…</option>
        </select>
        <input type="text" id="weAssignedCustom" placeholder="Enter person name…" style="display:none;margin-top:4px" />
      </div>
      <div class="form-group">
        <label>Start Time</label>
        <input type="time" id="weStart" value="${e.StartTime || ''}" />
      </div>
      <div class="form-group">
        <label>End Time</label>
        <input type="time" id="weEnd" value="${e.EndTime || ''}" />
      </div>
      <div class="form-group full">
        <label>Notes</label>
        <input type="text" id="weNotes" value="${e.Notes || ''}" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditWorklog('${e.EntryID}')">Save Changes</button>
    </div>
  `);
}

async function submitEditWorklog(entryId) {
  const memberVal = document.getElementById('weMember').value.split('|');
  const projectVal = document.getElementById('weProject').value.split('|');
  const body = {
    date: document.getElementById('weDate').value,
    memberId: memberVal[0], memberName: memberVal[1],
    projectCode: projectVal[0], projectName: projectVal[1],
    discipline: document.getElementById('weDisc').value,
    taskType: document.getElementById('weTask').value,
    description: document.getElementById('weDesc').value,
    assignedBy: (() => { const v = document.getElementById('weAssigned').value; return v === '__custom__' ? (document.getElementById('weAssignedCustom')?.value?.trim() || '') : v; })(),
    startTime: document.getElementById('weStart').value,
    endTime: document.getElementById('weEnd').value,
    notes: document.getElementById('weNotes').value
  };
  if (!body.memberName || !body.projectCode || !body.discipline || !body.taskType) {
    toast('Please fill in all required fields', 'error'); return;
  }
  await apiPut('/api/worklog/' + entryId, body);
  toast('Work log entry updated!', 'success');
  closeModal();
  applyWLFilter();
}

async function deleteWorklog(entryId) {
  if (!confirm('Delete this work log entry? This cannot be undone.')) return;
  try {
    const res = await apiDelete('/api/worklog/' + entryId);
    toast(res.sessionDeleted ? 'Work log and matching session deleted' : 'Work log entry deleted', 'success');
    await applyWLFilter();
  } catch (e) { /* error shown by apiFetch */ }
}

function filterWeProjectsByLoc() {
  const loc = document.getElementById('weFormLocFilter').value;
  const sel = document.getElementById('weProject');
  if (!sel) return;
  const val = sel.value;
  [...sel.options].forEach((opt, i) => {
    if (i === 0) return;
    if (!loc) { opt.style.display = ''; return; }
    const p = state.projects.find(x => x.ProjectCode === opt.value.split('|')[0]);
    opt.style.display = p && p.Location === loc ? '' : 'none';
  });
  if (loc && val) {
    const opt = [...sel.options].find(o => o.value === val);
    if (opt && opt.style.display === 'none') sel.value = '';
  }
}

function filterWlProjectsByLoc() {
  const loc = document.getElementById('wlFormLocFilter').value;
  const sel = document.getElementById('wlProject');
  if (!sel) return;
  const val = sel.value;
  const allOpts = [...sel.options];
  allOpts.forEach((opt, i) => {
    if (i === 0) return;
    if (!loc) { opt.style.display = ''; return; }
    const projects = state.projects.filter(p => p.Status === 'Active');
    const p = projects.find(x => x.ProjectCode === opt.value.split('|')[0]);
    opt.style.display = p && p.Location === loc ? '' : 'none';
  });
  if (loc && val) {
    const opt = [...sel.options].find(o => o.value === val);
    if (opt && opt.style.display === 'none') sel.value = '';
  }
}
