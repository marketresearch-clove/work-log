/* ── UI: Toast, Modal, Clock Picker, Reusable builders ───── */

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Modal ─────────────────────────────────────────────────
function openModal(title, bodyHtml, wide = false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const m = document.getElementById('modal');
  m.style.maxWidth = wide ? '760px' : '560px';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ═══════════════════════════════════════════════════════
// ANALOG CLOCK PICKER
// ═══════════════════════════════════════════════════════
const cp = {
  phase: 'hour',   // 'hour' | 'minute'
  hour: 12,        // 1–12
  minute: 0,       // 0–59
  ampm: 'AM',
  targetId: null,  // hidden input id to update
  displayId: null  // .tf-val span id to update
};

const CX = 140, CY = 140, R_NUM = 98, R_HAND = 82, R_DOT = 18;

function openClock(inputId, displayId) {
  cp.targetId  = inputId;
  cp.displayId = displayId;
  cp.phase     = 'hour';

  const existing = document.getElementById(inputId)?.value;
  if (existing && /^\d{2}:\d{2}$/.test(existing)) {
    const [h24, m] = existing.split(':').map(Number);
    cp.ampm   = h24 >= 12 ? 'PM' : 'AM';
    cp.hour   = h24 % 12 || 12;
    cp.minute = m;
  } else {
    cp.hour = 12; cp.minute = 0; cp.ampm = 'AM';
  }

  renderClockFace();
  document.getElementById('clockOverlay').classList.add('open');
}

function closeClock() {
  document.getElementById('clockOverlay').classList.remove('open');
}

function clockOverlayClick(e) {
  if (e.target === document.getElementById('clockOverlay')) confirmClock();
}

function confirmClock() {
  const h24 = (cp.ampm === 'PM' ? (cp.hour % 12) + 12 : cp.hour % 12).toString().padStart(2, '0');
  const mm  = cp.minute.toString().padStart(2, '0');
  const val = `${h24}:${mm}`;
  if (cp.targetId)  { const el = document.getElementById(cp.targetId);  if (el) el.value = val; }
  if (cp.displayId) { const el = document.getElementById(cp.displayId); if (el) { el.textContent = fmtTime12(val); el.classList.remove('empty'); } }
  closeClock();
}

function setAmPm(v) {
  cp.ampm = v;
  document.getElementById('cpAM').classList.toggle('active', v === 'AM');
  document.getElementById('cpPM').classList.toggle('active', v === 'PM');
}

function renderClockFace() {
  const isHour = cp.phase === 'hour';
  document.getElementById('clockHint').textContent = isHour ? 'Select hour' : 'Select minute';
  document.getElementById('cpAM').classList.toggle('active', cp.ampm === 'AM');
  document.getElementById('cpPM').classList.toggle('active', cp.ampm === 'PM');
  document.getElementById('cpHH').classList.toggle('active', isHour);
  document.getElementById('cpMM').classList.toggle('active', !isHour);
  document.getElementById('cpHH').textContent = cp.hour.toString().padStart(2, '0');
  document.getElementById('cpMM').textContent = cp.minute.toString().padStart(2, '0');

  const ticks = document.getElementById('clockTicks');
  const nums  = document.getElementById('clockNumbers');
  ticks.innerHTML = '';
  nums.innerHTML  = '';

  if (isHour) {
    for (let h = 1; h <= 12; h++) {
      const a = ((h % 12) * 30 - 90) * Math.PI / 180;
      const x = CX + R_NUM * Math.cos(a), y = CY + R_NUM * Math.sin(a);
      const sel = h === cp.hour;
      nums.innerHTML += `
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18"
          fill="${sel ? 'var(--accent)' : 'transparent'}" />
        <text x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          fill="${sel ? '#fff' : 'var(--text)'}"
          font-weight="${sel ? '700' : '400'}">${h}</text>`;
    }
    updateHand(cp.hour, 'hour');
  } else {
    for (let m = 0; m < 60; m += 5) {
      const a = (m * 6 - 90) * Math.PI / 180;
      const x = CX + R_NUM * Math.cos(a), y = CY + R_NUM * Math.sin(a);
      const sel = m === cp.minute;
      const lbl = m.toString().padStart(2, '0');
      nums.innerHTML += `
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18"
          fill="${sel ? 'var(--accent)' : 'transparent'}" />
        <text x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          fill="${sel ? '#fff' : 'var(--text)'}"
          font-weight="${sel ? '700' : '400'}">${lbl}</text>`;
    }
    // minute tick marks between labels
    for (let m = 0; m < 60; m++) {
      if (m % 5 === 0) continue;
      const a = (m * 6 - 90) * Math.PI / 180;
      const r1 = 116, r2 = 122;
      ticks.innerHTML += `<line x1="${(CX + r1*Math.cos(a)).toFixed(1)}" y1="${(CY + r1*Math.sin(a)).toFixed(1)}"
        x2="${(CX + r2*Math.cos(a)).toFixed(1)}" y2="${(CY + r2*Math.sin(a)).toFixed(1)}"
        stroke="var(--border)" stroke-width="1"/>`;
    }
    updateHand(cp.minute, 'minute');
  }
}

function updateHand(val, type) {
  const a = type === 'hour'
    ? ((val % 12) * 30 - 90) * Math.PI / 180
    : (val * 6 - 90) * Math.PI / 180;
  const x = CX + R_HAND * Math.cos(a), y = CY + R_HAND * Math.sin(a);
  const hand = document.getElementById('clockHand');
  if (hand) { hand.setAttribute('x2', x.toFixed(1)); hand.setAttribute('y2', y.toFixed(1)); hand.style.opacity = '1'; }
}

function clockHover(e) {
  const svg = document.getElementById('clockSvg');
  const rect = svg.getBoundingClientRect();
  const scaleX = 280 / rect.width, scaleY = 280 / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;
  const angle = Math.atan2(my - CY, mx - CX);
  const dot = document.getElementById('clockHoverDot');

  if (cp.phase === 'hour') {
    const raw = ((angle * 180 / Math.PI + 90) % 360 + 360) % 360;
    let h = Math.round(raw / 30) % 12;
    if (h === 0) h = 12;
    if (h !== cp.hour) { cp.hour = h; renderClockFace(); }
    const a = ((h % 12) * 30 - 90) * Math.PI / 180;
    dot.setAttribute('cx', (CX + R_NUM * Math.cos(a)).toFixed(1));
    dot.setAttribute('cy', (CY + R_NUM * Math.sin(a)).toFixed(1));
  } else {
    const raw = ((angle * 180 / Math.PI + 90) % 360 + 360) % 360;
    const m = Math.round(raw / 6) % 60;
    if (m !== cp.minute) { cp.minute = m; renderClockFace(); }
    const a = (m * 6 - 90) * Math.PI / 180;
    dot.setAttribute('cx', (CX + R_NUM * Math.cos(a)).toFixed(1));
    dot.setAttribute('cy', (CY + R_NUM * Math.sin(a)).toFixed(1));
  }
  dot.style.opacity = '1';
}

function clockMouseLeave() {
  const dot = document.getElementById('clockHoverDot');
  if (dot) dot.style.opacity = '0';
}

function clockClick(e) {
  if (cp.phase === 'hour') {
    cp.phase = 'minute';
  } else {
    confirmClock();
    return;
  }
  renderClockFace();
}

/** Switch back to hour selection when clicking hh display */
function cpClickHH() { cp.phase = 'hour'; renderClockFace(); setTimeout(() => document.getElementById('cpHH').focus(), 0); }
/** Switch to minute selection when clicking mm display */
function cpClickMM() { cp.phase = 'minute'; renderClockFace(); setTimeout(() => document.getElementById('cpMM').focus(), 0); }

/** Keyboard support for HH / MM editable fields */
function cpKeydown(e, type) {
  e.stopPropagation();
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (type === 'hour') { cp.hour = cp.hour % 12 + 1; renderClockFace(); }
    else                 { cp.minute = (cp.minute + 1) % 60; renderClockFace(); }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (type === 'hour') { cp.hour = cp.hour === 1 ? 12 : cp.hour - 1; renderClockFace(); }
    else                 { cp.minute = cp.minute === 0 ? 59 : cp.minute - 1; renderClockFace(); }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  } else if (!/^[\d]$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
  }
}

function cpInput(e, type) {
  const txt = e.target.textContent.replace(/\D/g, '').slice(0, 2);
  const val = parseInt(txt, 10);
  if (type === 'hour') {
    if (val >= 1 && val <= 12) { cp.hour = val; renderClockFace(); }
  } else {
    if (val >= 0 && val <= 59) { cp.minute = val; renderClockFace(); }
  }
}

function cpBlur(e, type) {
  const txt = e.target.textContent.replace(/\D/g, '');
  const val = parseInt(txt, 10);
  if (type === 'hour') {
    if (!isNaN(val) && val >= 1 && val <= 12) cp.hour = val;
    else if (!isNaN(val) && val >= 13) cp.hour = 12;
    else cp.hour = 1;
  } else {
    if (!isNaN(val) && val >= 0 && val <= 59) cp.minute = val;
    else cp.minute = 0;
  }
  renderClockFace();
}

/** Renders a clickable time field (no native time input) */
function timeFieldHtml(inputId, label) {
  return `
    <div class="form-group">
      <label>${label}</label>
      <input type="hidden" id="${inputId}" />
      <div class="time-field" onclick="openClock('${inputId}','${inputId}-disp')">
        <span class="tf-icon">schedule</span>
        <span class="tf-val empty" id="${inputId}-disp">--:-- --</span>
      </div>
    </div>`;
}

// ── Reusable UI builders ──────────────────────────────────

/** Searchable + typeable task combobox */
function taskComboHtml(id, placeholder = 'Search or type a task…') {
  return `
    <div class="combo-wrap" style="position:relative">
      <input type="text" id="${id}" placeholder="${placeholder}" autocomplete="off"
        oninput="filterCombo('${id}')"
        onfocus="showComboList('${id}')"
        onblur="setTimeout(()=>hideComboList('${id}'),180)" />
      <div class="combo-list" id="${id}-list" style="display:none;position:absolute;left:0;right:0;top:100%;background:var(--surface);border:1px solid var(--accent);border-top:none;border-radius:0 0 6px 6px;z-index:200;max-height:220px;overflow-y:auto">
        ${STANDARD_TASKS.map(t => `
          <div class="combo-item" data-val="${t}" onmousedown="pickCombo('${id}','${t.replace(/'/g,"&#39;")}')">
            ${t}
          </div>`).join('')}
      </div>
    </div>`;
}

function filterCombo(id) {
  const q = document.getElementById(id).value.toLowerCase();
  const items = document.querySelectorAll(`#${id}-list .combo-item`);
  items.forEach(el => {
    el.style.display = el.dataset.val.toLowerCase().includes(q) ? '' : 'none';
  });
  showComboList(id);
}
function showComboList(id) {
  const list = document.getElementById(id + '-list');
  if (list) list.style.display = '';
}
function hideComboList(id) {
  const list = document.getElementById(id + '-list');
  if (list) list.style.display = 'none';
}
function pickCombo(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
  hideComboList(id);
}

/** Clickable discipline chip picker */
function discPickerHtml(containerId) {
  return `
    <div class="chip-grid" id="${containerId}" style="margin-top:8px">
      ${DISCIPLINES.map(d => `
        <span class="disc-chip chip ${d.toLowerCase()}"
          data-disc="${d}"
          onclick="toggleDiscChip(this)"
          style="cursor:pointer;opacity:.4;transition:all .15s">
          ${d}
        </span>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">Click to select · click again to deselect</div>`;
}

function toggleDiscChip(el) {
  const on = el.dataset.on === '1';
  el.dataset.on = on ? '0' : '1';
  el.style.opacity = on ? '.4' : '1';
  el.style.transform = on ? '' : 'scale(1.06)';
  el.style.boxShadow = on ? '' : '0 0 0 2px currentColor';
}

function getSelectedDiscs(containerId) {
  return [...document.querySelectorAll(`#${containerId} .disc-chip[data-on="1"]`)]
    .map(el => el.dataset.disc);
}

// ── Setup modal ───────────────────────────────────────────
function showSetup() {
  openModal('Setup Google Sheet', `
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px">
      Enter your Google Spreadsheet ID to connect WorkLogger.<br>
      Make sure you have shared it with the service account:<br>
      <code style="font-size:11px;color:var(--accent)">crm-agent@research-analyst-ai.iam.gserviceaccount.com</code>
    </p>
    <div class="form-group">
      <label>Spreadsheet ID *</label>
      <input type="text" id="setupSheetId" placeholder="Paste spreadsheet ID here…" />
      <span style="font-size:11px;color:var(--muted)">Found in the URL: docs.google.com/spreadsheets/d/<strong>THIS_PART</strong>/edit</span>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitSetup()">Connect</button>
    </div>
  `);
}

async function submitSetup() {
  const id = document.getElementById('setupSheetId').value.trim();
  if (!id) { toast('Please enter a spreadsheet ID', 'error'); return; }
  try {
    const res = await apiPost('/api/setup-id', { spreadsheetId: id });
    toast('Sheet connected successfully!', 'success');
    closeModal();
    if (res.spreadsheetUrl) {
      const link = document.getElementById('sheetLink');
      if (link) { link.href = res.spreadsheetUrl; link.style.display = ''; }
    }
    navigate('dashboard');
  } catch (e) {
    // error already shown via toast
  }
}
