/* ── Settings page ───────────────────────────────────────── */

async function renderSettings() {
  const el = document.getElementById('page-settings');
  const isAdmin = auth.role === 'admin';
  el.innerHTML = `
    <div class="settings-wrap">
      <div class="page-tabs" id="settingsTabs">
        <button class="page-tab active" onclick="switchSettingsTab('disciplines',this)">Disciplines</button>
        ${isAdmin ? `<button class="page-tab" onclick="switchSettingsTab('access',this)">Access Control</button>` : ''}
        <button class="page-tab" onclick="switchSettingsTab('backup',this)">Backup</button>
        ${isAdmin ? `<button class="page-tab" onclick="switchSettingsTab('security',this)">Security</button>` : ''}
      </div>
      <div id="stab-disciplines"></div>
      ${isAdmin ? `<div id="stab-access" style="display:none"></div>` : ''}
      <div id="stab-backup" style="display:none"></div>
      ${isAdmin ? `<div id="stab-security" style="display:none"></div>` : ''}
    </div>
  `;
  loadSettingsTab('disciplines');
}

async function switchSettingsTab(tab, btn) {
  document.querySelectorAll('#settingsTabs .page-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['disciplines','access','backup','security'].forEach(t => {
    const el = document.getElementById(`stab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  loadSettingsTab(tab);
}

async function loadSettingsTab(tab) {
  const el = document.getElementById(`stab-${tab}`);
  if (!el) return;
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  if (tab === 'disciplines') {
    try {
      const discs = await apiGet('/api/settings/disciplines');
      el.innerHTML = `
        <div class="card" style="margin-top:16px;max-width:560px">
          <div class="card-title">Manage Disciplines</div>
          <div class="card-sub" style="margin-bottom:16px">Disciplines used for work log and session tagging</div>
          <div id="discList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
            ${discs.map((d,i) => `
              <div class="disc-row" id="disc-row-${i}">
                <input type="text" value="${d}" id="disc-val-${i}" style="flex:1" />
                <button class="btn btn-sm btn-danger" onclick="removeDisc(${i})">Remove</button>
              </div>`).join('')}
          </div>
          <button class="btn btn-secondary" style="margin-bottom:16px" onclick="addDiscRow()">+ Add Discipline</button>
          <div class="form-actions">
            <button class="btn btn-primary" onclick="saveDiscs()">Save Disciplines</button>
          </div>
        </div>`;
      window._discCount = discs.length;
      window._discs = [...discs];
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load disciplines</div></div>`;
    }
  }

  if (tab === 'access') {
    try {
      const data = await apiGet('/api/settings/access');
      const registered   = (data || []).filter(m => !m._notRegistered);
      const unregistered = (data || []).filter(m =>  m._notRegistered);
      el.innerHTML = `
        <!-- Add Member form -->
        <div class="card" style="margin-top:16px;max-width:600px">
          <div class="card-title" style="margin-bottom:12px">Add Member to Access Control</div>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;flex-wrap:wrap">
            <div class="form-group" style="margin:0">
              <label>Member</label>
              <select id="acAddMember" style="font-size:13px">
                <option value="">Select member…</option>
                ${unregistered.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName}</option>`).join('')}
                ${registered.map(m => `<option value="${m.MemberID}|${m.MemberName}">${m.MemberName} (existing)</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label>Role</label>
              <select id="acAddRole" style="font-size:13px">
                <option value="member">Member</option>
                <option value="team_lead">Team Lead</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button class="btn btn-primary" style="white-space:nowrap;padding:8px 16px" onclick="addMemberToAccess()">+ Add</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;align-items:end">
            <div class="form-group" style="margin:0">
              <label>PIN (4 digits, optional)</label>
              <input type="password" id="acAddPin" maxlength="4" placeholder="e.g. 1234" style="letter-spacing:4px;text-align:center" />
            </div>
            <div class="form-group" style="margin:0">
              <label>Login Enabled</label>
              <label class="toggle-wrap" style="margin-top:8px">
                <input type="checkbox" id="acAddEnabled" checked />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Existing members table -->
        <div class="card" style="margin-top:16px">
          <div class="card-title" style="margin-bottom:4px">Access Control — ${registered.length} member${registered.length!==1?'s':''}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Enable login, manage PINs, and assign roles</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Member</th><th>Role</th><th>Login</th><th>PIN</th><th>Actions</th></tr></thead>
            <tbody>
              ${registered.length ? registered.map(m => `
                <tr>
                  <td><strong>${m.MemberName}</strong><br><span style="font-size:11px;color:var(--muted)">${m.MemberID}</span></td>
                  <td>
                    <select style="font-size:12px;padding:3px 6px" onchange="setMemberRole('${m.MemberID}', this.value)">
                      <option value="member" ${(!m.Role || m.Role === 'member') ? 'selected' : ''}>Member</option>
                      <option value="team_lead" ${m.Role === 'team_lead' ? 'selected' : ''}>Team Lead</option>
                      <option value="admin" ${m.Role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                  </td>
                  <td>
                    <label class="toggle-wrap">
                      <input type="checkbox" ${m.LoginEnabled === 'true' || m.LoginEnabled === '1' ? 'checked' : ''}
                        onchange="toggleMemberAccess('${m.MemberID}', this.checked)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td>${m.hasPin ? '<span class="badge badge-approved">PIN Set</span>' : '<span class="badge badge-pending">No PIN</span>'}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="setMemberPin('${m.MemberID}','${m.MemberName.replace(/'/g,"\\'")}')">Set PIN</button>
                  </td>
                </tr>`).join('')
              : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No members registered yet — use the form above</td></tr>'}
            </tbody>
          </table></div>
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load access control</div></div>`;
    }
  }

  if (tab === 'backup') {
    try {
      const data = await apiGet('/api/backup/list');
      const lastBackup = data.lastBackup ? new Date(data.lastBackup).toLocaleString() : 'Never';
      const files = data.files || [];
      el.innerHTML = `
        <div class="settings-grid-two" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div class="card">
            <div class="card-title">Backup Status</div>
            <div style="margin:16px 0">
              <div style="font-size:13px;color:var(--muted)">Last backup</div>
              <div style="font-size:16px;font-weight:600;margin-top:4px" id="lastBackupLabel">${lastBackup}</div>
            </div>
            <button class="btn btn-primary" id="runBackupBtn" onclick="runBackupNow()">
              &#x2601; Run Backup Now
            </button>
            <div style="font-size:11px;color:var(--muted);margin-top:8px">Daily auto-backup runs at midnight</div>
          </div>
          <div class="card">
            <div class="card-title">Storage Location</div>
            <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-top:8px">
              Shared Drive &rarr; <strong>Backups/</strong> &rarr; <strong>YYYY-MM/</strong><br>
              Format: <code style="background:var(--surface);padding:2px 6px;border-radius:4px;font-size:11px">WorkLogger-YYYY-MM-DD.xlsx</code>
            </div>
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-title">Backup History</div>
          ${files.length === 0 ? '<div class="empty-state"><div class="empty-icon">&#x1F4BE;</div><div class="empty-title">No backups yet</div></div>' : `
          <div class="table-wrap"><table>
            <thead><tr><th>Filename</th><th>Month</th><th>Date</th><th>Size</th></tr></thead>
            <tbody>
              ${files.map(f => `<tr>
                <td style="font-size:12px">${f.name}</td>
                <td><span class="badge badge-active">${f.folder || '—'}</span></td>
                <td style="font-size:12px">${new Date(f.createdTime).toLocaleString()}</td>
                <td style="font-size:12px">${f.size ? (parseInt(f.size)/1024).toFixed(1) + ' KB' : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load backup info</div></div>`;
    }
  }

  if (tab === 'security') {
    el.innerHTML = `
      <div class="card" style="margin-top:16px;max-width:440px">
        <div class="card-title">Change Admin Password</div>
        <div class="form-grid" style="margin-top:16px">
          <div class="form-group full">
            <label>Current Password</label>
            <input type="password" id="secCurrent" placeholder="Current password" />
          </div>
          <div class="form-group full">
            <label>New Password</label>
            <input type="password" id="secNew" placeholder="New password" />
          </div>
          <div class="form-group full">
            <label>Confirm New Password</label>
            <input type="password" id="secConfirm" placeholder="Confirm new password" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="changeAdminPassword()">Update Password</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">
          Note: Password change applies to the current server session. Update .env to persist across restarts.
        </div>
      </div>`;
  }
}

// ── Settings actions ──────────────────────────────────────

function addDiscRow() {
  const list = document.getElementById('discList');
  const i = window._discCount++;
  const row = document.createElement('div');
  row.className = 'disc-row';
  row.id = `disc-row-${i}`;
  row.innerHTML = `<input type="text" id="disc-val-${i}" style="flex:1" placeholder="New discipline…" />
    <button class="btn btn-sm btn-danger" onclick="removeDisc(${i})">Remove</button>`;
  list.appendChild(row);
}

function removeDisc(i) {
  const row = document.getElementById(`disc-row-${i}`);
  if (row) row.remove();
}

async function saveDiscs() {
  const rows = document.querySelectorAll('#discList .disc-row');
  const disciplines = [...rows].map(r => r.querySelector('input')?.value.trim()).filter(Boolean);
  if (!disciplines.length) { toast('At least one discipline required', 'error'); return; }
  try {
    await apiPut('/api/settings/disciplines', { disciplines });
    toast('Disciplines saved!', 'success');
  } catch (e) { /* error shown by apiFetch */ }
}

async function addMemberToAccess() {
  const memberVal = document.getElementById('acAddMember').value;
  const role      = document.getElementById('acAddRole').value;
  const pin       = document.getElementById('acAddPin').value.trim();
  const enabled   = document.getElementById('acAddEnabled').checked;
  if (!memberVal) { toast('Select a member', 'error'); return; }
  if (pin && !/^\d{4}$/.test(pin)) { toast('PIN must be exactly 4 digits', 'error'); return; }
  const memberId = memberVal.split('|')[0];
  try {
    await apiPut(`/api/settings/access/${memberId}`, { role, loginEnabled: enabled, ...(pin ? { pin } : {}) });
    const roleLabel = { member: 'Member', team_lead: 'Team Lead', admin: 'Admin' }[role] || role;
    toast(`Member added as ${roleLabel}`, 'success');
    loadSettingsTab('access');
  } catch (e) { /* error shown by apiFetch */ }
}

async function toggleMemberAccess(memberId, enabled) {
  try {
    await apiPut(`/api/settings/access/${memberId}`, { loginEnabled: enabled });
    toast(`Access ${enabled ? 'enabled' : 'disabled'}`, 'success');
  } catch (e) { /* error shown by apiFetch */ }
}

async function setMemberRole(memberId, role) {
  const labels = { member: 'Member', team_lead: 'Team Lead', admin: 'Admin' };
  try {
    await apiPut(`/api/settings/access/${memberId}`, { role });
    toast(`Role set to ${labels[role] || role}`, 'success');
  } catch (e) { /* error shown by apiFetch */ }
}

function setMemberPin(memberId, memberName) {
  openModal(`Set PIN for ${memberName}`, `
    <div class="form-group" style="margin-bottom:16px">
      <label>4-digit PIN</label>
      <input type="password" id="pinInput" maxlength="4" placeholder="e.g. 1234"
        style="font-size:24px;letter-spacing:8px;text-align:center;max-width:160px" />
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveMemberPin('${memberId}')">Set PIN</button>
    </div>
  `);
}

async function saveMemberPin(memberId) {
  const pin = document.getElementById('pinInput').value.trim();
  if (!/^\d{4}$/.test(pin)) { toast('PIN must be exactly 4 digits', 'error'); return; }
  try {
    await apiPut(`/api/settings/access/${memberId}`, { pin });
    toast('PIN set successfully!', 'success');
    closeModal();
    loadSettingsTab('access');
  } catch (e) { /* error shown by apiFetch */ }
}

async function runBackupNow() {
  const btn = document.getElementById('runBackupBtn');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Backing up…';
  try {
    const res = await apiPost('/api/backup/run', {});
    toast(`Backup complete: ${res.filename}`, 'success');
    loadSettingsTab('backup');
  } catch (e) {
    /* error shown by apiFetch */
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '&#x2601; Run Backup Now'; }
  }
}

async function changeAdminPassword() {
  const current = document.getElementById('secCurrent').value;
  const newPwd = document.getElementById('secNew').value;
  const confirm = document.getElementById('secConfirm').value;
  if (!current || !newPwd) { toast('Fill in all fields', 'error'); return; }
  if (newPwd !== confirm) { toast('Passwords do not match', 'error'); return; }
  if (newPwd.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  try {
    await apiPut('/api/settings/admin-password', { currentPassword: current, newPassword: newPwd });
    toast('Password updated!', 'success');
    document.getElementById('secCurrent').value = '';
    document.getElementById('secNew').value = '';
    document.getElementById('secConfirm').value = '';
  } catch (e) { /* error shown by apiFetch */ }
}
