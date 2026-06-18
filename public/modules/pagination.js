/* ── Pagination ─────────────────────────────────────────── */

const _pag = {};

function _ps(k) { if (!_pag[k]) _pag[k] = { page: 1, per: 20 }; return _pag[k]; }

function _pagSlice(data, k) { const s = _ps(k); return s.per === 0 ? data : data.slice((s.page-1)*s.per, s.page*s.per); }

function _pagBar(total, k, fn) {
  if (!total) return '';
  const s  = _ps(k);
  const tp = s.per === 0 ? 1 : Math.ceil(total / s.per);
  const from = s.per === 0 ? 1 : Math.min((s.page-1)*s.per + 1, total);
  const to   = s.per === 0 ? total : Math.min(s.page * s.per, total);
  return `<div class="pag-bar">
    <span class="pag-info">${from}&#8211;${to} of ${total}</span>
    <div class="pag-nav">
      <button class="pag-btn" ${s.page<=1?'disabled':''} onclick="_pgGo('${k}','${fn}',-1)">&#8249; Prev</button>
      <span class="pag-pg">${s.page} / ${tp}</span>
      <button class="pag-btn" ${s.page>=tp?'disabled':''} onclick="_pgGo('${k}','${fn}',1)">Next &#8250;</button>
    </div>
    <label class="pag-per-label">Per page
      <select class="pag-per" onchange="_pgSet('${k}','${fn}',this.value)">
        ${[20,30,50,100,0].map(n=>`<option value="${n}"${s.per===n?' selected':''}>${n===0?'ALL':n}</option>`).join('')}
      </select>
    </label>
  </div>`;
}

function _pgGo(k, fn, d) { const s=_ps(k); s.page=Math.max(1,s.page+parseInt(d)); window[fn]&&window[fn](); }
function _pgSet(k, fn, v) { const s=_ps(k); s.per=parseInt(v); s.page=1; window[fn]&&window[fn](); }

// Paginated data caches
let _wlFull = [], _attFull = [], _sessFull = [], _leavesFull = [], _issuesFull = [];
