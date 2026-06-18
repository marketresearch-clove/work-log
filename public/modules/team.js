/* ═══════════════════════════════════════════════════════
   TEAM
   ═══════════════════════════════════════════════════════ */

function renderTeam() {
  const el = document.getElementById('page-team');
  const members = state.members;

  // compute stats per member
  const attByMember = {};
  state.attendance.forEach(r => {
    if (!attByMember[r.MemberName]) attByMember[r.MemberName] = { present: 0, total: 0 };
    if (r.DayType !== 'Weekend') {
      attByMember[r.MemberName].total++;
      if (r.Status === 'Present') attByMember[r.MemberName].present++;
    }
  });
  const entriesByMember = {};
  state.worklog.forEach(r => {
    if (r.MemberName) entriesByMember[r.MemberName] = (entriesByMember[r.MemberName] || 0) + 1;
  });

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-primary" onclick="showAddMember()">+ Add Member</button>
    </div>
    <div class="team-grid">
      ${members.map((m, i) => {
        const att = attByMember[m.MemberName] || { present: 0, total: 0 };
        const attRate = att.total > 0 ? Math.round(att.present / att.total * 100) : 0;
        const entries = entriesByMember[m.MemberName] || 0;
        const colors = ['#6c63ff','#00d2ff','#2ecc71','#f39c12','#e74c3c','#9b59b6','#1abc9c','#e67e22'];
        const color = colors[i % colors.length];
        const mJson = encodeURIComponent(JSON.stringify(m));
        const isAdmin = auth.role === 'admin';
        return `
          <div class="team-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
              <div class="team-avatar" style="background:linear-gradient(135deg,${color},${color}99)">${initials(m.MemberName)}</div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-secondary btn-sm" onclick="showEditMember(decodeURIComponent('${mJson}'))" style="font-size:11px;padding:4px 8px">Edit</button>
                ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteMember('${m.MemberID}')" style="font-size:10px;padding:2px 6px">Del</button>` : ''}
              </div>
            </div>
            <div class="team-name">${m.MemberName}</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px">${m.MemberID}</div>
            <div class="team-role">${m.Role}</div>
            <div style="margin-bottom:10px">${m.Discipline ? discChip(m.Discipline) : ''}</div>
            ${statusBadge(m.Status || 'Active')}
            <div class="team-stats" style="margin-top:14px">
              <div class="team-stat-item">
                <span class="team-stat-val" style="color:${attRate >= 90 ? 'var(--green)' : attRate >= 70 ? 'var(--amber)' : 'var(--red)'}">${attRate}%</span>
                <span class="team-stat-lbl">Attendance</span>
              </div>
              <div class="team-stat-item">
                <span class="team-stat-val">${entries}</span>
                <span class="team-stat-lbl">Log Entries</span>
              </div>
              <div class="team-stat-item">
                <span class="team-stat-val">${att.present}</span>
                <span class="team-stat-lbl">Days Present</span>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

async function deleteMember(memberId) {
  await deleteRecord('/api/members/' + memberId, 'team member', async () => {
    state.members = await apiGet('/api/members');
    renderTeam();
  });
}

function showEditMember(mJson) {
  const m = typeof mJson === 'string' ? JSON.parse(mJson) : mJson;
  openModal('Edit Team Member', `
    <div class="form-grid">
      <div class="form-group">
        <label>Full Name *</label>
        <input type="text" id="emName" value="${m.MemberName || ''}" />
      </div>
      <div class="form-group">
        <label>Role *</label>
        <input type="text" id="emRole" value="${m.Role || ''}" />
      </div>
      <div class="form-group">
        <label>Primary Discipline *</label>
        <select id="emDisc">
          <option value="">Select…</option>
          ${DISCIPLINES.map(d => `<option value="${d}"${m.Discipline === d ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="emEmail" value="${m.Email || ''}" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="emStatus">
          <option value="Active"${m.Status === 'Active' ? ' selected' : ''}>Active</option>
          <option value="Inactive"${m.Status === 'Inactive' ? ' selected' : ''}>Inactive</option>
          <option value="On Leave"${m.Status === 'On Leave' ? ' selected' : ''}>On Leave</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="updateMember('${m.MemberID}')">Save Changes</button>
    </div>
  `);
}

async function updateMember(memberId) {
  const name = document.getElementById('emName').value.trim();
  const role = document.getElementById('emRole').value.trim();
  const disc = document.getElementById('emDisc').value;
  if (!name || !role || !disc) { toast('Name, role, and discipline are required', 'error'); return; }
  try {
    await apiPut(`/api/members/${memberId}`, {
      name, role, discipline: disc,
      email: document.getElementById('emEmail').value,
      status: document.getElementById('emStatus').value
    });
    toast('Member updated successfully', 'success');
    closeModal();
    state.members = await apiGet('/api/members');
    renderTeam();
  } catch (e) {
    toast('Failed to update member', 'error');
  }
}

function showAddMember() {
  openModal('Add New Team Member', `
    <div class="form-grid">
      <div class="form-group">
        <label>Full Name *</label>
        <input type="text" id="tmName" placeholder="e.g. John Smith" />
      </div>
      <div class="form-group">
        <label>Role *</label>
        <input type="text" id="tmRole" placeholder="e.g. BIM Engineer" />
      </div>
      <div class="form-group">
        <label>Primary Discipline *</label>
        <select id="tmDisc">
          <option value="">Select…</option>
          ${DISCIPLINES.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="tmEmail" placeholder="name@clovetech.com" />
      </div>
      <div class="form-group">
        <label>Join Date</label>
        <input type="date" id="tmJoin" value="${today()}" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitMember()">Add Member</button>
    </div>
  `);
}

async function submitMember() {
  const name = document.getElementById('tmName').value.trim();
  const role = document.getElementById('tmRole').value.trim();
  const disc = document.getElementById('tmDisc').value;
  if (!name || !role || !disc) { toast('Name, role, and discipline are required', 'error'); return; }
  await apiPost('/api/members', {
    name, role, discipline: disc,
    email: document.getElementById('tmEmail').value,
    joinDate: document.getElementById('tmJoin').value
  });
  toast(`${name} added to the team!`, 'success');
  closeModal();
  state.members = await apiGet('/api/members');
  renderTeam();
}
