/* ── Auth module ─────────────────────────────────────────── */

// Auth state
const auth = {
  token: localStorage.getItem('wl_token') || '',
  role:  localStorage.getItem('wl_role')  || '',
  name:  localStorage.getItem('wl_name')  || ''
};

function authSaveSession(token, role, name) {
  auth.token = token; auth.role = role; auth.name = name;
  localStorage.setItem('wl_token', token);
  localStorage.setItem('wl_role',  role);
  localStorage.setItem('wl_name',  name);
}

function authClearSession() {
  auth.token = ''; auth.role = ''; auth.name = '';
  localStorage.removeItem('wl_token');
  localStorage.removeItem('wl_role');
  localStorage.removeItem('wl_name');
}

async function authInit() {
  if (!auth.token) { showLoginOverlay(); return; }
  try {
    const me = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + auth.token }
    }).then(r => r.json());
    if (me.error) { authClearSession(); showLoginOverlay(); return; }
    auth.role = me.role; auth.name = me.name;
    hideLoginOverlay();
  } catch { showLoginOverlay(); }
}

function showLoginOverlay() {
  document.getElementById('loginOverlay').classList.add('visible');
  populateLoginMembers();
}

function hideLoginOverlay() {
  document.getElementById('loginOverlay').classList.remove('visible');
  const chip = document.getElementById('userNameChip');
  if (chip) chip.textContent = auth.name;
  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.textContent = auth.name ? auth.name[0].toUpperCase() : 'A';
  const isPrivileged = auth.role === 'admin' || auth.role === 'team_lead';
  const settingsNav = document.getElementById('settingsNavItem');
  if (settingsNav) settingsNav.style.display = isPrivileged ? '' : 'none';
  const setupBtn = document.getElementById('setupBtn');
  if (setupBtn) setupBtn.style.display = auth.role === 'admin' ? '' : 'none';
}

async function submitLogin() {
  const activeTab = document.querySelector('.login-tab-btn.active');
  const loginType = activeTab ? activeTab.dataset.type : 'admin';
  let body;
  if (loginType === 'admin') {
    body = {
      type: 'admin',
      username: document.getElementById('loginUser').value,
      password: document.getElementById('loginPass').value
    };
  } else {
    body = {
      type: 'member',
      memberName: document.getElementById('loginMemberName').value,
      pin: document.getElementById('loginPin').value
    };
  }
  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());
    if (res.error) { showLoginError(res.error); return; }
    authSaveSession(res.token, res.role, res.name);
    hideLoginOverlay();
    if (typeof navigate === 'function') navigate('dashboard');
  } catch (e) {
    showLoginError('Connection error');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.token }
    });
  } catch {}
  authClearSession();
  location.reload();
}

function togglePwVis(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.querySelector('.eye-icon').style.display     = isHidden ? 'none' : '';
  btn.querySelector('.eye-off-icon').style.display = isHidden ? '' : 'none';
}

function switchLoginTab(type, el) {
  document.querySelectorAll('.login-tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('loginAdminForm').style.display = type === 'admin' ? '' : 'none';
  document.getElementById('loginMemberForm').style.display = type === 'member' ? '' : 'none';
  document.getElementById('loginError').style.display = 'none';
}

// Populate member name dropdown on login overlay load
async function populateLoginMembers() {
  try {
    const members = await fetch('/api/members/names').then(r => r.json()).catch(() => []);
    const sel = document.getElementById('loginMemberName');
    if (sel && members.length) {
      sel.innerHTML = '<option value="">Select your name…</option>' +
        members.map(m => `<option value="${m}">${m}</option>`).join('');
    }
  } catch {}
}
