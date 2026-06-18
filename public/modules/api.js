/* ── API helpers ─────────────────────────────────────────── */

const API = '';

async function apiFetch(path, opts = {}) {
  try {
    opts.headers = opts.headers || {};
    const token = (typeof auth !== 'undefined' && auth.token)
      ? auth.token
      : (localStorage.getItem('wl_token') || '');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, opts);
    if (res.status === 401) {
      if (typeof authClearSession === 'function') authClearSession();
      if (typeof showLoginOverlay === 'function') showLoginOverlay();
      throw new Error('Session expired — please sign in again');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  } catch (e) {
    if (typeof toast === 'function') toast(e.message, 'error');
    throw e;
  }
}

function apiGet(path) { return apiFetch(path); }

function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function apiPostForm(path, formData) {
  return apiFetch(path, { method: 'POST', body: formData });
}

function apiPut(path, body) {
  return apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}
