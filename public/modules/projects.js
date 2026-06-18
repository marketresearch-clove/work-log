/* ═══════════════════════════════════════════════════════
   PROJECTS
   ═══════════════════════════════════════════════════════ */

function getLocations() {
  return [...new Set(state.projects.map(p => p.Location || '').filter(Boolean))].sort();
}

function renderProjects() {
  const el = document.getElementById('page-projects');
  const projects = state.projects;
  const locs = getLocations();

  // count entries per project
  const entryCount = {};
  state.worklog.forEach(r => {
    if (r.ProjectCode) entryCount[r.ProjectCode] = (entryCount[r.ProjectCode] || 0) + 1;
  });

  el.innerHTML = `
    <div class="projects-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="search-wrap" style="max-width:400px;flex:1">
        <input type="text" id="projSearch" placeholder="Search projects…" style="width:260px" oninput="filterProjects()" />
      </div>
      <div class="filter-selects" style="display:flex;gap:10px">
        <select id="projLocFilter" style="font-size:13px" onchange="filterProjects()">
          <option value="">All Locations</option>
          ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
        <select id="projStatusFilter" style="font-size:13px" onchange="filterProjects()">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
        </select>
      </div>
    </div>
    <div id="projectGrid"></div>
  `;
  buildProjectSections(projects, entryCount);
}

function buildProjectCards(projects, entryCount = {}) {
  if (!projects.length) return `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">folder_open</div><div class="empty-title">No projects yet</div><div class="empty-sub">Add your first project using the button above</div></div>`;
  const isAdmin = auth.role === 'admin';
  return projects.map(p => {
    const discs = (p.Disciplines || '').split(',').map(d => d.trim()).filter(Boolean);
    const count = entryCount[p.ProjectCode] || 0;
    return `
      <div class="project-card" onclick="showProjectDetail('${p.ProjectCode}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div class="project-code">${p.ProjectCode}</div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-secondary" style="padding:2px 10px;font-size:11px" onclick="event.stopPropagation();showEditProject('${p.ProjectCode}')">Edit</button>
            ${isAdmin ? `<button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:11px" onclick="event.stopPropagation();deleteProject('${p.ProjectCode}')">Del</button>` : ''}
          </div>
        </div>
        <div class="project-name">${p.ProjectName}</div>
        <div class="project-client">${p.Client || 'No client specified'}</div>
        ${p.Location ? `<div class="project-location" style="display:flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:13px">location_on</span>${p.Location}</div>` : ''}
        <div class="project-discs">
          ${discs.map(d => discChip(d)).join('') || '<span style="font-size:12px;color:var(--muted)">No discipline set</span>'}
        </div>
        <div class="project-footer">
          ${statusBadge(p.Status || 'Active')}
          <span class="project-stat">${count} work entries</span>
        </div>
      </div>`;
  }).join('');
}

async function deleteProject(code) {
  await deleteRecord('/api/projects/' + code, 'project', async () => {
    state.projects = await apiGet('/api/projects');
    renderProjects();
  });
}

function filterProjects() {
  const q = document.getElementById('projSearch').value.toLowerCase();
  const st = document.getElementById('projStatusFilter').value;
  const loc = document.getElementById('projLocFilter').value;
  const filtered = state.projects.filter(p => {
    const matchQ = !q || p.ProjectCode.toLowerCase().includes(q) || p.ProjectName.toLowerCase().includes(q) || (p.Client || '').toLowerCase().includes(q);
    const matchSt = !st || p.Status === st;
    const matchLoc = !loc || (p.Location || '') === loc;
    return matchQ && matchSt && matchLoc;
  });
  const entryCount = {};
  state.worklog.forEach(r => { if (r.ProjectCode) entryCount[r.ProjectCode] = (entryCount[r.ProjectCode] || 0) + 1; });
  buildProjectSections(filtered, entryCount);
}

function buildProjectSections(projects, entryCount = {}) {
  const el = document.getElementById('projectGrid');
  if (!projects.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">folder_open</div><div class="empty-title">No matching projects</div><div class="empty-sub">Try adjusting your filters</div></div>';
    return;
  }
  const groups = {};
  projects.forEach(p => {
    const loc = p.Location || 'Unspecified';
    if (!groups[loc]) groups[loc] = [];
    groups[loc].push(p);
  });
  const sortedLocs = Object.keys(groups).sort((a, b) => a === 'Unspecified' ? 1 : b === 'Unspecified' ? -1 : a.localeCompare(b));
  el.innerHTML = sortedLocs.map(loc => `
    <div class="project-group">
      <div class="project-group-header">
        <span class="project-group-title" style="display:inline-flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:15px">location_on</span>${loc}</span>
        <span class="project-group-count">${groups[loc].length} project${groups[loc].length > 1 ? 's' : ''}</span>
      </div>
      <div class="project-grid">${buildProjectCards(groups[loc], entryCount)}</div>
    </div>
  `).join('');
}

async function showProjectDetail(code) {
  const project = state.projects.find(p => p.ProjectCode === code);
  if (!project) return;
  const wl = await apiGet(`/api/worklog?project=${code}`);
  const sessions = await apiGet(`/api/sessions?project=${code}`);
  const discs = (project.Disciplines || '').split(',').map(d => d.trim()).filter(Boolean);

  const taskBreak = {};
  wl.forEach(r => { if (r.TaskType) taskBreak[r.TaskType] = (taskBreak[r.TaskType] || 0) + 1; });
  const memberBreak = {};
  wl.forEach(r => { if (r.MemberName) memberBreak[r.MemberName] = (memberBreak[r.MemberName] || 0) + 1; });

  openModal(`${code} – ${project.ProjectName}`, `
    <div style="margin-bottom:16px">
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">${project.Description || 'No description'}</p>
      ${project.Location ? `<p style="font-size:12px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:14px">location_on</span>${project.Location}</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${discs.map(d => discChip(d)).join('')}
        ${statusBadge(project.Status || 'Active')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Work Log Entries</div>
          <div style="font-size:24px;font-weight:700">${wl.length}</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Sessions Logged</div>
          <div style="font-size:24px;font-weight:700">${sessions.length}</div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Task Breakdown</div>
      <div class="chip-grid" style="margin-bottom:14px">
        ${Object.entries(taskBreak).map(([t, c]) => `<span class="chip accent">${t} <strong style="opacity:.7">${c}</strong></span>`).join('') || '<span style="color:var(--muted);font-size:13px">No entries</span>'}
      </div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Members Involved</div>
      <div class="chip-grid">
        ${Object.entries(memberBreak).map(([n, c]) => `<span class="chip">${n} <strong style="opacity:.7">${c}</strong></span>`).join('') || '<span style="color:var(--muted);font-size:13px">No entries</span>'}
      </div>
    </div>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Recent Work Log</div>
    <div style="overflow-x:auto;max-height:200px;overflow-y:auto">
      ${wl.length ? `<table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr>${['Date','Member','Task','Hours'].map(h => `<th style="text-align:left;padding:6px;color:var(--muted);font-size:10px;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
        <tbody>${wl.slice(-20).reverse().map(r => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px">${fmtDate(r.Date)}</td>
          <td style="padding:6px">${r.MemberName}</td>
          <td style="padding:6px">${r.TaskType}</td>
          <td style="padding:6px;color:var(--accent2)">${fmtDuration(r.DurationHours)}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<span style="color:var(--muted);font-size:13px">No work log entries</span>'}
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-secondary" onclick="closeModal();showEditProject('${code}')"><span class="mat-icon">edit</span> Edit Project</button>
      <button class="btn btn-primary" onclick="closeModal();showAddWorklog()">+ Add Work Entry</button>
    </div>
  `, true);
}

function showAddProject() {
  openModal('New Project', `
    <div class="form-grid">
      <div class="form-group">
        <label>Project Code *</label>
        <input type="text" id="pCode" placeholder="e.g. DUB078" style="text-transform:uppercase" />
      </div>
      <div class="form-group">
        <label>Project Name *</label>
        <input type="text" id="pName" placeholder="e.g. Dubai Mall Extension" />
      </div>
      <div class="form-group">
        <label>Client</label>
        <input type="text" id="pClient" placeholder="Client name…" />
      </div>
      <div class="form-group">
        <label>Location</label>
        <input type="text" id="pLocation" placeholder="e.g. Dubai, Abu Dhabi, Site…" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="pStatus">
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Description</label>
        <textarea id="pDesc" placeholder="Project description…"></textarea>
      </div>
      <div class="form-group full">
        <label>Disciplines — click to select</label>
        ${discPickerHtml('projDiscPicker')}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitProject()">Create Project</button>
    </div>
  `);
}

async function submitProject() {
  const discs = getSelectedDiscs('projDiscPicker');
  const code = document.getElementById('pCode').value.toUpperCase().trim();
  const name = document.getElementById('pName').value.trim();
  if (!code || !name) { toast('Project code and name are required', 'error'); return; }
  await apiPost('/api/projects', {
    code, name,
    client: document.getElementById('pClient').value,
    location: document.getElementById('pLocation').value,
    description: document.getElementById('pDesc').value,
    status: document.getElementById('pStatus').value,
    disciplines: discs
  });
  toast(`Project ${code} created! Drive folder is being set up.`, 'success');
  closeModal();
  state.projects = await apiGet('/api/projects');
  renderProjects();
}

function showEditProject(code) {
  const p = state.projects.find(x => x.ProjectCode === code);
  if (!p) return;
  openModal(`Edit Project — ${code}`, `
    <div class="form-grid">
      <div class="form-group">
        <label>Project Code</label>
        <div style="padding:8px 0;font-weight:700;color:var(--accent)">${code}</div>
      </div>
      <div class="form-group">
        <label>Project Name *</label>
        <input type="text" id="peName" value="${p.ProjectName}" />
      </div>
      <div class="form-group">
        <label>Client</label>
        <input type="text" id="peClient" value="${p.Client || ''}" />
      </div>
      <div class="form-group">
        <label>Location</label>
        <input type="text" id="peLocation" value="${p.Location || ''}" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="peStatus">
          <option value="Active" ${p.Status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="On Hold" ${p.Status === 'On Hold' ? 'selected' : ''}>On Hold</option>
          <option value="Completed" ${p.Status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Description</label>
        <textarea id="peDesc">${p.Description || ''}</textarea>
      </div>
      <div class="form-group full">
        <label>Disciplines — click to select</label>
        ${discPickerHtml('projEditDiscPicker')}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditProject('${code}')">Save Changes</button>
    </div>
  `);
  setTimeout(() => {
    (p.Disciplines || '').split(',').map(d => d.trim()).filter(Boolean).forEach(d => {
      const chip = document.querySelector(`#projEditDiscPicker .disc-chip[data-disc="${d}"]`);
      if (chip && chip.dataset.on !== '1') toggleDiscChip(chip);
    });
  }, 0);
}

async function submitEditProject(code) {
  const discs = getSelectedDiscs('projEditDiscPicker');
  const name = document.getElementById('peName').value.trim();
  if (!name) { toast('Project name is required', 'error'); return; }
  await apiPut('/api/projects/' + code, {
    name,
    client: document.getElementById('peClient').value,
    location: document.getElementById('peLocation').value,
    description: document.getElementById('peDesc').value,
    status: document.getElementById('peStatus').value,
    disciplines: discs
  });
  toast('Project updated!', 'success');
  closeModal();
  state.projects = await apiGet('/api/projects');
  renderProjects();
}
