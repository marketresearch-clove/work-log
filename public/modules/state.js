/* ── State ─────────────────────────────────────────────── */

function today() {
  return new Date().toISOString().split('T')[0];
}

const state = {
  page: 'dashboard',
  members: [], projects: [], worklog: [], attendance: [],
  sessions: [], issues: [], leaves: [], stats: null,
  attMonth: new Date().getMonth() + 1,
  attYear: new Date().getFullYear(),
  sessionDate: today()
};
