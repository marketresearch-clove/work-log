/* ═══════════════════════════════════════════════════════
   ISSUES
   ═══════════════════════════════════════════════════════ */

function renderIssues() {
  const el = document.getElementById('page-issues');
  const open = state.issues.filter(i => i.Status === 'Open');
  const resolved = state.issues.filter(i => i.Status === 'Resolved');
  const locs = [...new Set(state.projects.map(p => p.Location || '').filter(Boolean))].sort();

  el.innerHTML = `
    <div class="is-filter-bar" style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <select id="isFilterMember" style="font-size:13px" onchange="filterIssues()">
        <option value="">All Members</option>
        ${state.members.map(m => `<option value="${m.MemberName}">${m.MemberName}</option>`).join('')}
      </select>
      <select id="isFilterStatus" style="font-size:13px" onchange="filterIssues()">
        <option value="">All Status</option>
        <option value="Open">Open</option>
        <option value="Resolved">Resolved</option>
      </select>
      <select id="isFilterProject" style="font-size:13px" onchange="filterIssues()">
        <option value="">All Projects</option>
        ${state.projects.map(p => `<option value="${p.ProjectCode}">${p.ProjectCode}</option>`).join('')}
      </select>
      <select id="isFilterLocation" style="font-size:13px" onchange="filterIssues()">
        <option value="">All Locations</option>
        ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
      </select>
    </div>

    ${open.length > 0 ? `
      <div class="section-title">Open Issues (${open.length})</div>
      <div class="issue-list" style="margin-bottom:20px" id="issueOpen">
        ${buildIssueItems(open)}
      </div>` : '<div style="color:var(--green);font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:16px">check_circle</span> No open issues</div>'}

    <div class="section-title">All Issues</div>
    <div id="issueAll"></div>
  `;
  _issuesFull = state.issues; _ps('issues').page = 1; _issuesRender();
}

function buildIssueItems(issues) {
  if (!issues.length) return `<div class="empty-state"><div class="empty-icon">task_alt</div><div class="empty-title">No issues logged</div></div>`;
  const isAdmin = auth.role === 'admin';
  return issues.map(i => `
    <div class="issue-card ${i.Status === 'Resolved' ? 'resolved' : ''}">
      <div class="issue-header">
        <div>
          <div class="issue-type">${i.IssueType}</div>
          <div class="issue-meta">${i.MemberName} · ${fmtDate(i.Date)} ${i.ProjectCode ? `· ${i.ProjectCode}` : ''} ${i.DurationLost ? `· ${i.DurationLost}h lost` : ''}</div>
        </div>
        ${statusBadge(i.Status)}
      </div>
      <div class="issue-desc">${i.Description}</div>
      <div class="issue-footer">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${i.EvidenceURL ? `<a href="${i.EvidenceURL}" target="_blank" class="evidence-link"><span class="mat-icon" style="font-size:14px">attach_file</span> View Evidence (${i.EvidenceType})</a>` : ''}
        ${i.Status === 'Open' ? `<button class="btn btn-sm btn-success" onclick="resolveIssue('${i.IssueID}')">Mark Resolved</button>` : `<span style="font-size:12px;color:var(--muted)">Resolved ${i.ResolvedAt ? 'on ' + fmtDate(i.ResolvedAt) : ''}</span>`}
        ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteIssue('${i.IssueID}')">Delete</button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

async function deleteIssue(issueId) {
  await deleteRecord('/api/issues/' + issueId, 'issue', async () => {
    state.issues = await apiGet('/api/issues');
    _issuesFull = state.issues;
    _ps('issues').page = 1;
    _issuesRender();
    const open = state.issues.filter(i => i.Status === 'Open');
    const openEl = document.getElementById('issueOpen');
    if (openEl) openEl.innerHTML = buildIssueItems(open);
  });
}

async function filterIssues() {
  const params = new URLSearchParams();
  const m = document.getElementById('isFilterMember').value;
  const s = document.getElementById('isFilterStatus').value;
  const p = document.getElementById('isFilterProject').value;
  const loc = document.getElementById('isFilterLocation').value;
  if (m) params.set('member', m);
  if (s) params.set('status', s);
  if (p) params.set('project', p);
  let data = await apiGet(`/api/issues?${params}`);
  if (loc) {
    const locProjectCodes = state.projects.filter(pr => pr.Location === loc).map(pr => pr.ProjectCode);
    data = data.filter(r => !r.ProjectCode || locProjectCodes.includes(r.ProjectCode));
  }
  _issuesFull = data; _ps('issues').page = 1; _issuesRender();
}

function _issuesRender() {
  const el = document.getElementById('issueAll');
  if (!el) return;
  const slice = _pagSlice(_issuesFull, 'issues');
  el.innerHTML = `<div class="issue-list">${buildIssueItems(slice)}</div>` + _pagBar(_issuesFull.length, 'issues', '_issuesRender');
}

async function resolveIssue(id) {
  const resolvedBy = prompt('Resolved by whom? (Enter name)');
  if (resolvedBy === null) return;
  await apiPut(`/api/issues/${id}`, { status: 'Resolved', resolvedBy });
  toast('Issue marked as resolved!', 'success');
  // Dynamic refresh: update state and re-render data only
  state.issues = await apiGet('/api/issues');
  _issuesFull = state.issues;
  _ps('issues').page = 1;
  _issuesRender();
  // Also refresh open issues section
  const open = state.issues.filter(i => i.Status === 'Open');
  const openEl = document.getElementById('issueOpen');
  if (openEl) openEl.innerHTML = buildIssueItems(open);
}

function showAddIssue() {
  const members = state.members.filter(m => m.Status === 'Active');
  const projects = state.projects.filter(p => p.Status === 'Active');
  const locs = [...new Set(projects.map(p => p.Location || '').filter(Boolean))].sort();
  openModal('Report Issue / Idle Hours', `
    <div class="form-grid">
      <div class="form-group">
        <label>Date *</label>
        <input type="date" id="niDate" value="${today()}" />
      </div>
      <div class="form-group">
        <label>Member *</label>
        <select id="niMember">
          <option value="">Select member…</option>
          ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Project</label>
        <div style="display:flex;gap:6px">
          <select id="niProject" style="flex:1">
            <option value="">— General —</option>
            ${projects.map(p => `<option value="${p.ProjectCode}">${p.ProjectCode} – ${p.ProjectName}${p.Location ? ' · ' + p.Location : ''}</option>`).join('')}
          </select>
          <select id="niFormLocFilter" style="width:110px;font-size:11px" onchange="filterNiProjectsByLoc()">
            <option value="">All Locations</option>
            ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Issue Type *</label>
        <select id="niType">
          <option value="">Select…</option>
          ${ISSUE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Duration Lost (hours)</label>
        <input type="number" id="niDuration" min="0.25" step="0.25" placeholder="e.g. 2.0" />
      </div>
      <div class="form-group"></div>
      <div class="form-group full">
        <label>Description *</label>
        <textarea id="niDesc" placeholder="What happened and how it impacted work…"></textarea>
      </div>
      <div class="form-group full">
        <label>Evidence (Screenshot / File)</label>
        <input type="file" id="niEvidence" accept="image/*,.pdf,.doc,.docx" />
        <span class="file-note">Stored in Google Drive → Project → Month → Date. Max 20MB.</span>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="issueSubmitBtn" onclick="submitNewIssue()">Submit Report</button>
    </div>
  `);
}

async function submitNewIssue() {
  const memberVal = document.getElementById('niMember').value.split('|');
  const fd = new FormData();
  fd.append('date', document.getElementById('niDate').value);
  fd.append('memberId', memberVal[0]);
  fd.append('memberName', memberVal[1] || '');
  fd.append('projectCode', document.getElementById('niProject').value);
  fd.append('issueType', document.getElementById('niType').value);
  fd.append('description', document.getElementById('niDesc').value);
  fd.append('durationLost', document.getElementById('niDuration').value);
  const file = document.getElementById('niEvidence').files[0];
  if (file) fd.append('evidence', file);
  if (!memberVal[1] || !fd.get('issueType') || !fd.get('description')) {
    toast('Please fill in all required fields', 'error'); return;
  }
  const btn = document.getElementById('issueSubmitBtn');
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    await apiPostForm('/api/issues', fd);
    toast('Issue report submitted!', 'success');
    closeModal();
    // Dynamic refresh: update state and re-render data only
    state.issues = await apiGet('/api/issues');
    _issuesFull = state.issues;
    _ps('issues').page = 1;
    _issuesRender();
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Report';
  }
}

function filterNiProjectsByLoc() {
  const loc = document.getElementById('niFormLocFilter').value;
  const sel = document.getElementById('niProject');
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
