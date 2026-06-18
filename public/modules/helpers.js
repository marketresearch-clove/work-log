/* ── Utilities / Helpers ─────────────────────────────────── */

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '—';
  const p = t.split(':');
  if (p.length === 2) return `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}`;
  return t;
}

function fmtTime12(t) {
  if (!t) return '--:--';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr   = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2,'0')} ${ampm}`;
}

function minsToHHMM(mins) {
  const m = parseInt(mins) || 0;
  if (!m) return '—';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fmtDuration(val) {
  if (!val) return '—';
  if (String(val).includes(':')) return val;
  const h = parseFloat(val);
  if (isNaN(h) || h <= 0) return '—';
  const totalMins = Math.round(h * 60);
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function discClass(d) {
  return (d || '').toLowerCase().replace('/', '').replace(' ', '');
}

function discChip(d) {
  const cls = discClass(d);
  return `<span class="chip ${cls}">${d}</span>`;
}

function fmtDeadlineInput(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
  el.value = v;
}

function deadlineToMins(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function deadlineBadge(durationMins, deadline) {
  if (!deadline || !durationMins) return '';
  const limit = deadlineToMins(deadline);
  if (!limit) return '';
  const taken = parseInt(durationMins) || 0;
  return taken <= limit
    ? '<span class="badge badge-ontime">On Time</span>'
    : '<span class="badge badge-delayed">Delayed</span>';
}

function statusBadge(s) {
  const map = {
    Present: 'present', 'Half-day': 'halfday', Absent: 'absent',
    Leave: 'leave', Weekend: 'weekend', Pending: 'pending',
    Approved: 'approved', Rejected: 'rejected', Open: 'open',
    Resolved: 'resolved', Active: 'active', Inactive: 'inactive'
  };
  return `<span class="badge badge-${map[s] || 'pending'}">${s}</span>`;
}

function progressColor(i) {
  const colors = ['#6c63ff','#00d2ff','#2ecc71','#f39c12','#e74c3c','#9b59b6','#1abc9c','#e67e22'];
  return colors[i % colors.length];
}

/* ── Filter projects by selected member ─────────────────────
   memberValue: "MemberID|MemberName" from a <select>
   projectSelectId: id of the <select> to filter
   Can be called from any form's member onchange.          */
function filterProjectsByMember(memberValue, projectSelectId) {
  const sel = document.getElementById(projectSelectId);
  if (!sel) return;
  const memberName = memberValue.split('|')[1];
  const currentVal = sel.value;

  // Build set of project codes this member has worked on
  const memberProjects = new Set();
  if (memberName) {
    (state.worklog || []).forEach(r => {
      if (r.MemberName === memberName && r.ProjectCode) memberProjects.add(r.ProjectCode);
    });
    (state.sessions || []).forEach(r => {
      if (r.MemberName === memberName && r.ProjectCode) memberProjects.add(r.ProjectCode);
    });
  }

  // If member has no history, show all active projects
  const projects = state.projects.filter(p => p.Status === 'Active');

  [...sel.options].forEach((opt, i) => {
    if (i === 0 || opt.value === '__new__') return;
    const code = opt.value.split('|')[0];
    if (!memberName) {
      opt.style.display = '';
    } else if (memberProjects.size > 0) {
      opt.style.display = memberProjects.has(code) ? '' : 'none';
    } else {
      // No history — show all active projects
      const p = projects.find(x => x.ProjectCode === code);
      opt.style.display = p ? '' : 'none';
    }
  });

  // Reset selection if current value is now hidden
  if (currentVal) {
    const opt = [...sel.options].find(o => o.value === currentVal);
    if (opt && opt.style.display === 'none') sel.value = '';
  }
}

/* ── Admin delete confirmation ─────────────────────────────── */
async function deleteRecord(apiPath, label, refreshFn) {
  if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
  try {
    await apiDelete(apiPath);
    toast(`${label} deleted`, 'success');
    if (refreshFn) await refreshFn();
  } catch (e) { /* error shown by apiFetch */ }
}
