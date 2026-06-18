/* ═══════════════════════════════════════════════════════
   LEAVES
   ═══════════════════════════════════════════════════════ */

function renderLeaves() {
  const el = document.getElementById('page-leaves');
  const pending = state.leaves.filter(l => l.Status === 'Pending');
  const others = state.leaves.filter(l => l.Status !== 'Pending');

  el.innerHTML = `
    <div class="lv-filter-bar" style="display:flex;gap:10px;margin-bottom:16px">
      <select id="lvFilterMember" style="font-size:13px" onchange="filterLeaves()">
        <option value="">All Members</option>
        ${state.members.map(m => `<option value="${m.MemberName}">${m.MemberName}</option>`).join('')}
      </select>
      <select id="lvFilterStatus" style="font-size:13px" onchange="filterLeaves()">
        <option value="">All Status</option>
        <option value="Pending">Pending</option>
        <option value="Approved">Approved</option>
        <option value="Rejected">Rejected</option>
      </select>
      <select id="lvFilterType" style="font-size:13px" onchange="filterLeaves()">
        <option value="">All Types</option>
        ${LEAVE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>

    ${pending.length > 0 ? `
      <div class="section-title">Pending Approval (${pending.length})</div>
      <div class="leave-list" style="margin-bottom:20px" id="leavePending">
        ${buildLeaveItems(pending, true)}
      </div>` : ''}

    <div class="section-title">All Leave Requests</div>
    <div id="leaveAll"></div>
  `;
  _leavesFull = state.leaves; _ps('leaves').page = 1; _leavesRender();
}

function buildLeaveItems(leaves, showActions) {
  if (!leaves.length) return `<div class="empty-state"><div class="empty-icon">beach_access</div><div class="empty-title">No leave requests</div></div>`;
  const isAdmin = auth.role === 'admin';
  return leaves.map(l => `
    <div class="leave-item">
      <div class="leave-avatar">${initials(l.MemberName)}</div>
      <div class="leave-info">
        <div class="leave-name">${l.MemberName}</div>
        <div class="leave-dates">${fmtDate(l.StartDate)} → ${fmtDate(l.EndDate)} (${l.Days} day${l.Days > 1 ? 's' : ''})</div>
        <div class="leave-type-tag">${l.LeaveType}</div>
        ${l.Reason ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">${l.Reason}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
      ${statusBadge(l.Status)}
      ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteLeave('${l.LeaveID}')" style="font-size:10px;padding:2px 6px">Del</button>` : ''}
      </div>
      ${showActions && l.Status === 'Pending' ? `
        <div class="leave-actions">
          <button class="btn btn-sm btn-success" onclick="resolveLeave('${l.LeaveID}','Approved')">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="resolveLeave('${l.LeaveID}','Rejected')">Reject</button>
        </div>` : ''}
    </div>`).join('');
}

async function deleteLeave(leaveId) {
  await deleteRecord('/api/leaves/' + leaveId, 'leave request', async () => {
    state.leaves = await apiGet('/api/leaves');
    _leavesFull = state.leaves;
    _ps('leaves').page = 1;
    _leavesRender();
  });
}

async function filterLeaves() {
  const member = document.getElementById('lvFilterMember').value;
  const status = document.getElementById('lvFilterStatus').value;
  const type = document.getElementById('lvFilterType').value;
  const params = new URLSearchParams();
  if (member) params.set('member', member);
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const data = await apiGet(`/api/leaves?${params}`);
  _leavesFull = data; _ps('leaves').page = 1; _leavesRender();
}

function _leavesRender() {
  const el = document.getElementById('leaveAll');
  if (!el) return;
  const slice = _pagSlice(_leavesFull, 'leaves');
  el.innerHTML = `<div class="leave-list">${buildLeaveItems(slice, false)}</div>` + _pagBar(_leavesFull.length, 'leaves', '_leavesRender');
}

async function resolveLeave(id, status) {
  const approvedBy = prompt(`${status} by whom? (Enter name)`);
  if (approvedBy === null) return;
  await apiPut(`/api/leaves/${id}`, { status, approvedBy });
  toast(`Leave ${status.toLowerCase()}!`, 'success');
  // Dynamic refresh: update state and re-render data only
  state.leaves = await apiGet('/api/leaves');
  _leavesFull = state.leaves;
  _ps('leaves').page = 1;
  _leavesRender();
  // Also refresh pending section
  const pending = state.leaves.filter(l => l.Status === 'Pending');
  const pendingEl = document.getElementById('leavePending');
  if (pendingEl) pendingEl.innerHTML = buildLeaveItems(pending, true);
}

function showAddLeave() {
  const members = state.members.filter(m => m.Status === 'Active');
  openModal('Request Leave', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Member *</label>
        <select id="lvMember">
          <option value="">Select member…</option>
          ${members.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Leave Type *</label>
        <select id="lvType">
          ${LEAVE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"></div>
      <div class="form-group">
        <label>Start Date *</label>
        <input type="date" id="lvStart" value="${today()}" />
      </div>
      <div class="form-group">
        <label>End Date *</label>
        <input type="date" id="lvEnd" value="${today()}" />
      </div>
      <div class="form-group full">
        <label>Reason</label>
        <textarea id="lvReason" placeholder="Reason for leave…"></textarea>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitLeave()">Submit Request</button>
    </div>
  `);
}

async function submitLeave() {
  const memberVal = document.getElementById('lvMember').value.split('|');
  const body = {
    memberId: memberVal[0], memberName: memberVal[1],
    leaveType: document.getElementById('lvType').value,
    startDate: document.getElementById('lvStart').value,
    endDate: document.getElementById('lvEnd').value,
    reason: document.getElementById('lvReason').value
  };
  if (!body.memberName || !body.startDate || !body.endDate) { toast('Fill in all required fields', 'error'); return; }
  await apiPost('/api/leaves', body);
  toast('Leave request submitted!', 'success');
  closeModal();
  // Dynamic refresh: update state and re-render data only
  state.leaves = await apiGet('/api/leaves');
  _leavesFull = state.leaves;
  _ps('leaves').page = 1;
  _leavesRender();
}
