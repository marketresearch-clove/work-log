/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */

const _dashCharts = {};

function computeDashData() {
  const member  = document.getElementById('dfMember')?.value  || '';
  const project = document.getElementById('dfProject')?.value || '';
  const location = document.getElementById('dfLocation')?.value || '';
  const from    = document.getElementById('dfFrom')?.value    || '';
  const to      = document.getElementById('dfTo')?.value      || '';

  let wl = state.worklog || [];
  if (member)  wl = wl.filter(r => r.MemberName === member);
  if (project) wl = wl.filter(r => r.ProjectCode === project);
  if (location) {
    const locCodes = state.projects.filter(p => p.Location === location).map(p => p.ProjectCode);
    wl = wl.filter(r => locCodes.includes(r.ProjectCode));
  }
  if (from)    wl = wl.filter(r => r.Date >= from);
  if (to)      wl = wl.filter(r => r.Date <= to);

  const proj = {}, disc = {}, task = {}, sup = {};
  wl.forEach(r => {
    if (r.ProjectCode) proj[r.ProjectCode] = (proj[r.ProjectCode] || 0) + 1;
    if (r.Discipline)  disc[r.Discipline]  = (disc[r.Discipline]  || 0) + 1;
    if (r.TaskType)    task[r.TaskType]    = (task[r.TaskType]    || 0) + 1;
    if (r.AssignedBy)  sup[r.AssignedBy]   = (sup[r.AssignedBy]   || 0) + 1;
  });

  const sort = obj => Object.entries(obj).sort((a,b) => b[1]-a[1]);
  return {
    topProjects:  sort(proj).slice(0,6),
    discBreakdown: sort(disc),
    taskBreakdown: sort(task).slice(0,8),
    supBreakdown:  sort(sup),
    total: wl.length
  };
}

function refreshDashCharts() {
  const { topProjects, discBreakdown, taskBreakdown, supBreakdown, total } = computeDashData();
  const COLORS = ['#6c63ff','#00d2ff','#2ecc71','#f39c12','#e74c3c','#9b59b6','#1abc9c','#e67e22'];

  const chartCfg = {
    proj: {
      id: 'chartProj', type: 'bar',
      labels: topProjects.map(([c]) => c),
      data:   topProjects.map(([,n]) => n),
      bg: topProjects.map((_,i) => COLORS[i % COLORS.length]),
      opts: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} entries` } } },
        scales: {
          x: { grid: { color: 'rgba(45,45,74,.6)' }, ticks: { color: '#8888aa', font: { size: 11 } }, border: { color: 'transparent' } },
          y: { grid: { display: false }, ticks: { color: '#e8e8f0', font: { size: 12, weight: '600' } }, border: { color: 'transparent' } }
        }
      }
    },
    task: {
      id: 'chartTask', type: 'bar',
      labels: taskBreakdown.map(([t]) => t.length > 26 ? t.slice(0,26)+'…' : t),
      data:   taskBreakdown.map(([,n]) => n),
      bg: 'rgba(108,99,255,.75)',
      border: '#6c63ff',
      opts: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} entries` } } },
        scales: {
          x: { grid: { color: 'rgba(45,45,74,.6)' }, ticks: { color: '#8888aa', font: { size: 11 } }, border: { color: 'transparent' } },
          y: { grid: { display: false }, ticks: { color: '#e8e8f0', font: { size: 11 } }, border: { color: 'transparent' } }
        }
      }
    },
    sup: {
      id: 'chartSup', type: 'bar',
      labels: supBreakdown.map(([n]) => n),
      data:   supBreakdown.map(([,c]) => c),
      bg: supBreakdown.map((_,i) => COLORS[i % COLORS.length]),
      opts: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} entries` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#e8e8f0', font: { size: 11, weight: '600' } }, border: { color: 'transparent' } },
          y: { grid: { color: 'rgba(45,45,74,.6)' }, ticks: { color: '#8888aa', font: { size: 11 } }, border: { color: 'transparent' } }
        }
      }
    }
  };

  Object.entries(chartCfg).forEach(([key, cfg]) => {
    if (_dashCharts[key]) _dashCharts[key].destroy();
    const canvas = document.getElementById(cfg.id);
    if (!canvas || !cfg.labels.length) return;
    _dashCharts[key] = new Chart(canvas, {
      type: cfg.type,
      data: {
        labels: cfg.labels,
        datasets: [{ data: cfg.data, backgroundColor: cfg.bg, borderColor: cfg.border || 'transparent', borderWidth: cfg.border ? 1 : 0, borderRadius: 6, borderSkipped: false }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, ...cfg.opts }
    });
  });

  // Discipline doughnut
  if (_dashCharts.disc) _dashCharts.disc.destroy();
  const dcCtx = document.getElementById('chartDisc');
  if (dcCtx && discBreakdown.length) {
    _dashCharts.disc = new Chart(dcCtx, {
      type: 'doughnut',
      data: {
        labels: discBreakdown.map(([d]) => d),
        datasets: [{ data: discBreakdown.map(([,n]) => n), backgroundColor: discBreakdown.map(([d]) => DISC_COLORS[d] || '#6c63ff'), borderColor: '#1a1a2e', borderWidth: 3, hoverOffset: 10 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        animation: { duration: 400 },
        plugins: { legend: { display: true, position: 'right', labels: { color: '#e8e8f0', font: { size: 11 }, boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} entries` } } }
      }
    });
  }

  // Update filtered count badge
  const badge = document.getElementById('dashFilteredBadge');
  if (badge) badge.textContent = `${total} entries`;
}

function clearDashFilters() {
  ['dfMember','dfProject','dfLocation','dfFrom','dfTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  refreshDashCharts();
}

function renderDashboard() {
  const s   = state.stats || {};
  const el  = document.getElementById('page-dashboard');
  const members  = state.members.map(m => m.MemberName).filter(Boolean);
  const projects = state.projects.map(p => p.ProjectCode).filter(Boolean);
  const locs = [...new Set(state.projects.map(p => p.Location || '').filter(Boolean))].sort();

  el.innerHTML = `
    <!-- KPI row -->
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label">Team Members</div>
        <div class="kpi-value" style="color:var(--accent)">${s.totalMembers || 0}</div>
        <div class="kpi-sub">active this month</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Work Entries</div>
        <div class="kpi-value" style="color:var(--accent2)">${s.totalEntries || 0}</div>
        <div class="kpi-sub">total logged</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Projects</div>
        <div class="kpi-value" style="color:var(--green)">${s.totalProjects || 0}</div>
        <div class="kpi-sub">running</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Attendance Rate</div>
        <div class="kpi-value" style="color:${(s.attendanceRate||0)>=80?'var(--green)':(s.attendanceRate||0)>=60?'var(--amber)':'var(--red)'}">${s.attendanceRate || 0}%</div>
        <div class="kpi-sub">this month</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pending Leaves</div>
        <div class="kpi-value" style="color:${(s.pendingLeaves||0)>0?'var(--amber)':'var(--muted)'}">${s.pendingLeaves || 0}</div>
        <div class="kpi-sub">awaiting approval</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Open Issues</div>
        <div class="kpi-value" style="color:${(s.openIssues||0)>0?'var(--red)':'var(--muted)'}">${s.openIssues || 0}</div>
        <div class="kpi-sub">need resolution</div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="card" style="padding:14px 20px;margin-bottom:20px">
      <div class="dash-filter-wrap" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:130px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Member</div>
          <select id="dfMember" onchange="refreshDashCharts()" style="width:100%">
            <option value="">All Members</option>
            ${members.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;min-width:130px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Project</div>
          <select id="dfProject" onchange="refreshDashCharts()" style="width:100%">
            <option value="">All Projects</option>
            ${projects.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;min-width:130px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Location</div>
          <select id="dfLocation" onchange="refreshDashCharts()" style="width:100%">
            <option value="">All Locations</option>
            ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Date From</div>
          <input type="date" id="dfFrom" onchange="refreshDashCharts()" />
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Date To</div>
          <input type="date" id="dfTo" onchange="refreshDashCharts()" />
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;padding-bottom:1px">
          <span id="dashFilteredBadge" style="font-size:12px;color:var(--accent2);background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.25);border-radius:20px;padding:4px 10px"></span>
          <button class="btn btn-secondary btn-sm" onclick="clearDashFilters()">Clear</button>
        </div>
      </div>
    </div>

    <!-- Row 1: Project Workload + Discipline -->
    <div class="dash-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">Project Workload</span></div>
        <div style="position:relative;height:220px"><canvas id="chartProj"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Discipline Breakdown</span></div>
        <div style="position:relative;height:220px"><canvas id="chartDisc"></canvas></div>
      </div>
    </div>

    <!-- Row 2: Task Breakdown + Assigned By -->
    <div class="dash-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">Task Breakdown</span></div>
        <div style="position:relative;height:240px"><canvas id="chartTask"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Assigned By</span></div>
        <div style="position:relative;height:240px"><canvas id="chartSup"></canvas></div>
      </div>
    </div>

    ${(s.openIssues || 0) > 0 ? `
    <div class="card" style="border-left:3px solid var(--red)">
      <div class="card-header">
        <span class="card-title" style="color:var(--red);display:inline-flex;align-items:center;gap:4px"><span class="mat-icon" style="font-size:14px">warning</span> Open Issues</span>
        <button class="btn btn-sm btn-secondary" onclick="navigate('issues')">View All</button>
      </div>
      <p style="font-size:13px;color:var(--muted)">${s.openIssues} issue${s.openIssues > 1 ? 's' : ''} pending resolution.</p>
    </div>` : ''}
  `;

  // Draw after DOM is ready
  setTimeout(refreshDashCharts, 0);
}
