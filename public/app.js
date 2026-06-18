/* ═══════════════════════════════════════════════════════
   Clovetech WorkLogger — Main Entry Point
   All modules are loaded via <script> tags in index.html
   ═══════════════════════════════════════════════════════ */

// ── Sidebar ───────────────────────────────────────────────
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ── Navigation ────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard', worklog: 'Work Log', sessions: 'Sessions',
  attendance: 'Attendance', projects: 'Projects', leaves: 'Leaves',
  issues: 'Issues', team: 'Team', settings: 'Settings'
};

function navigate(page) {
  state.page = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  const btn = document.getElementById('primaryActionBtn');
  if (['projects','leaves','issues'].includes(page)) {
    btn.style.display = '';
    btn.textContent = { projects: '+ New Project', leaves: '+ Request Leave', issues: '+ Report Issue' }[page];
    btn.onclick = () => ({ projects: showAddProject, leaves: showAddLeave, issues: showAddIssue })[page]();
  } else {
    btn.style.display = 'none';
  }
  renderPage(page);
}

async function renderPage(page) {
  const el = document.getElementById(`page-${page}`);
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  await loadPageData(page);
  switch (page) {
    case 'dashboard':   renderDashboard();  break;
    case 'worklog':     renderWorklog();    break;
    case 'sessions':    renderSessions();   break;
    case 'attendance':  renderAttendance(); break;
    case 'projects':    renderProjects();   break;
    case 'leaves':      renderLeaves();     break;
    case 'issues':      renderIssues();     break;
    case 'team':        renderTeam();       break;
    case 'settings':    renderSettings();   break;
  }
}

async function loadPageData(page) {
  try {
    switch (page) {
      case 'dashboard':
        [state.stats, state.members, state.projects, state.worklog] = await Promise.all([
          apiGet('/api/stats'), apiGet('/api/members'), apiGet('/api/projects'), apiGet('/api/worklog')
        ]);
        break;
      case 'worklog':
        const _wlNow = new Date();
        const _wlFirstDay = new Date(_wlNow.getFullYear(), _wlNow.getMonth(), 1).toISOString().slice(0,10);
        const _wlToday = _wlNow.toISOString().slice(0,10);
        [state.members, state.projects, state.worklog] = await Promise.all([
          apiGet('/api/members'), apiGet('/api/projects'),
          apiGet(`/api/worklog?startDate=${_wlFirstDay}&endDate=${_wlToday}`)
        ]);
        state.assignees = await apiGet('/api/assignees').catch(() => state.assignees || []);
        break;
      case 'attendance':
        [state.members, state.projects, state.attendance, state.sessions] = await Promise.all([
          apiGet('/api/members'),
          apiGet('/api/projects'),
          apiGet(`/api/attendance?month=${state.attMonth}&year=${state.attYear}`),
          apiGet('/api/sessions')
        ]);
        state.assignees = await apiGet('/api/assignees').catch(() => state.assignees || []);
        break;
      case 'projects':
        [state.projects, state.worklog] = await Promise.all([
          apiGet('/api/projects'), apiGet('/api/worklog')
        ]);
        break;
      case 'leaves':
        [state.members, state.leaves] = await Promise.all([
          apiGet('/api/members'), apiGet('/api/leaves')
        ]);
        break;
      case 'issues':
        [state.members, state.projects, state.issues] = await Promise.all([
          apiGet('/api/members'), apiGet('/api/projects'), apiGet('/api/issues')
        ]);
        break;
      case 'team':
        [state.members, state.attendance, state.worklog] = await Promise.all([
          apiGet('/api/members'), apiGet('/api/attendance'), apiGet('/api/worklog')
        ]);
        break;
      case 'settings':
        break;
    }
  } catch (e) { /* errors already shown via toast */ }
}

// ── Init ──────────────────────────────────────────────────
async function checkAuthThenLoad() {
  if (!auth.token) { showLoginOverlay(); return; }
  try {
    const me = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + auth.token }
    }).then(r => r.json());
    if (me.error) { authClearSession(); showLoginOverlay(); return; }
    auth.role = me.role; auth.name = me.name;
    hideLoginOverlay();
    // Check config
    apiGet('/api/config').then(cfg => {
      const dot = document.getElementById('statusDot');
      const link = document.getElementById('sheetLink');
      const setupBtn = document.getElementById('setupBtn');
      const isAdmin = auth.role === 'admin';
      if (cfg && cfg.configured && cfg.spreadsheetUrl) {
        dot.style.background = 'var(--green)';
        dot.classList.add('connected');
        if (link && isAdmin) { link.href = cfg.spreadsheetUrl; link.style.display = ''; }
        if (setupBtn) setupBtn.style.display = 'none';
      } else {
        dot.style.background = 'var(--red)';
        dot.classList.remove('connected');
        if (link) link.style.display = 'none';
        if (setupBtn) setupBtn.style.display = isAdmin ? '' : 'none';
      }
    }).catch(() => {
      const dot = document.getElementById('statusDot');
      if (dot) { dot.style.background = 'var(--red)'; dot.classList.remove('connected'); }
    });
    navigate('dashboard');
  } catch { showLoginOverlay(); }
}

function init() {
  const now = new Date();
  document.getElementById('dateBadge').textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('footer-month').textContent = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      navigate(el.dataset.page);
      closeSidebar();
    });
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.getElementById('menuBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const open = sidebar.classList.toggle('open');
    overlay.classList.toggle('open', open);
  });

  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // Check auth before loading any page
  checkAuthThenLoad();
}

document.addEventListener('DOMContentLoaded', init);
