// ══════════════════════════════════════════════════════════════════
//  search.js — بحث شامل عبر كل بيانات المحفظة (Ctrl+K)
// ══════════════════════════════════════════════════════════════════
import { DB, UI } from '../state.js';
import { N2, fmt, escapeHtml, getBankColor } from '../core/utils.js';
import { debounce } from '../core/utils.js';

let _overlay = null;
let _input = null;
let _results = null;
let _selectedIndex = -1;
let _currentResults = [];

// ══════════════════ فتح/إغلاق ══════════════════

export function openGlobalSearch() {
  if (_overlay) closeGlobalSearch();

  _overlay = document.createElement('div');
  _overlay.id = 'global-search-overlay';
  _overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(7,12,24,.7);
    z-index: 99998; display: flex; align-items: flex-start; justify-content: center;
    padding: 80px 20px 20px; backdrop-filter: blur(8px);
    animation: fadeUp .15s ease;
  `;
  _overlay.innerHTML = `
    <div style="background:var(--surface);border:.5px solid var(--border);border-radius:16px;
                width:100%;max-width:640px;box-shadow:0 20px 60px rgba(0,0,0,.5);
                overflow:hidden;animation:modalIn .2s ease">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:.5px solid var(--border);background:var(--surface2)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted);flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="global-search-input" type="text" placeholder="ابحث في كل شيء — بنوك، أسهم، معادن، ديون..." 
               autocomplete="off"
               style="flex:1;border:none;background:transparent;outline:none;font-size:15px;
                      font-weight:600;color:var(--text);font-family:var(--font);padding:4px 0">
        <kbd style="background:var(--surface);border:.5px solid var(--border2);border-radius:6px;
                    padding:4px 8px;font-size:10.5px;font-weight:700;color:var(--muted);
                    font-family:monospace;direction:ltr;flex-shrink:0">ESC</kbd>
      </div>
      <div id="global-search-results" style="max-height:60vh;overflow-y:auto;padding:8px"></div>
      <div style="padding:10px 20px;border-top:.5px solid var(--border);background:var(--surface2);
                  font-size:10.5px;color:var(--muted);display:flex;justify-content:space-between">
        <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
        <span id="gs-count"></span>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);

  _input = document.getElementById('global-search-input');
  _results = document.getElementById('global-search-results');

  _input.addEventListener('input', debounce(() => runSearch(_input.value), 120));
  _input.addEventListener('keydown', handleKey);
  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) closeGlobalSearch(); });

  // عرض النتائج الافتراضية
  runSearch('');
  _input.focus();
}

export function closeGlobalSearch() {
  if (_overlay) { _overlay.remove(); _overlay = null; _input = null; _results = null; _currentResults = []; _selectedIndex = -1; }
}

// ══════════════════ منطق البحث ══════════════════

function runSearch(query) {
  const q = (query || '').trim().toLowerCase();
  const items = [];

  // ─── البنوك ───
  DB.banks.filter(b => b.is_active !== false).forEach(b => {
    const text = `${b.name} ${b.bank_code || ''} ${b.account_no || ''} ${b.notes || ''} ${b.type}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: 'بنك', icon: '🏦', color: getBankColor(b.id),
        title: b.name, sub: `${b.bank_code || b.type} • ${fmt(b.balance)} ${b.currency || 'EGP'}`,
        action: () => { navTo('banks', 'bank', b.id); }
      });
    }
  });

  // ─── الأسهم (من العمليات) ───
  const syms = new Set(DB.stockTxns.map(t => t.symbol));
  syms.forEach(sym => {
    const last = [...DB.stockTxns].filter(t => t.symbol === sym).sort((a, b) => b.date > a.date ? 1 : -1)[0];
    const price = DB.stockPrices.find(p => p.symbol === sym);
    const name = last?.name || price?.name || sym;
    const text = `${sym} ${name}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: 'سهم', icon: '📈', color: '#0d9488',
        title: sym, sub: name,
        action: () => { navTo('stocks', 'stock', sym); }
      });
    }
  });

  // ─── المعادن ───
  const metalKeys = new Set();
  DB.metalTxns.forEach(t => {
    const key = t.notes?.trim() ? `${t.metal_type}|${t.notes.trim()}` : t.metal_type;
    if (!metalKeys.has(key)) {
      metalKeys.add(key);
      const text = `${t.metal_type} ${t.notes || ''}`.toLowerCase();
      if (!q || text.includes(q)) {
        items.push({
          type: 'معدن', icon: '🥇', color: '#d97706',
          title: t.metal_type, sub: t.notes || 'معدن',
          action: () => { navTo('metals', 'metal', key); }
        });
      }
    }
  });

  // ─── الشهادات ───
  DB.certs.forEach(c => {
    const text = `${c.name} ${c.bank_name || ''}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: 'شهادة', icon: '📜', color: '#7c3aed',
        title: c.name, sub: `${c.bank_name || '—'} • ${fmt(c.amount)}`,
        action: () => { navTo('certs', 'cert', c.id); }
      });
    }
  });

  // ─── الديون ───
  DB.debts.forEach(d => {
    const text = `${d.name} ${d.party || ''} ${d.notes || ''}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: d.type, icon: '💳', color: d.type === 'دين علي' ? '#e11d48' : '#0d9488',
        title: d.name, sub: `${d.party || '—'} • متبقي ${fmt(d.remaining)}`,
        action: () => { navTo('debts', 'debt', d.id); }
      });
    }
  });

  // ─── العمليات المتكررة ───
  DB.recurring.forEach(r => {
    const text = `${r.name} ${r.type}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: 'متكرر', icon: '🔄', color: '#0891b2',
        title: r.name, sub: `${r.type} • ${fmt(r.amount)}`,
        action: () => { navTo('recurring', 'recurring', r.id); }
      });
    }
  });

  // ─── الأهداف ───
  DB.goals.forEach(g => {
    const text = `${g.name}`.toLowerCase();
    if (!q || text.includes(q)) {
      items.push({
        type: 'هدف', icon: '🎯', color: '#7c3aed',
        title: g.name, sub: `المستهدف: ${fmt(g.target)}`,
        action: () => { navTo('goals', 'goal', g.id); }
      });
    }
  });

  // ─── الحركات البنكية (بحث في الملاحظات فقط) ───
  if (q.length >= 3) {
    DB.bankTxns.slice(0, 200).forEach(t => {
      const notes = (t.notes || '').toLowerCase();
      if (notes.includes(q)) {
        const bank = DB.banks.find(b => b.id === t.bank_id);
        items.push({
          type: 'حركة', icon: '💰', color: bank ? getBankColor(bank.id) : '#888',
          title: (t.notes || '').split('\n')[0].slice(0, 60),
          sub: `${bank?.name || '—'} • ${t.date} • ${t.type}`,
          action: () => { navTo('banks', 'bank_txn', t.id, t.bank_id); }
        });
      }
    });
  }

  _currentResults = items.slice(0, 30);
  _selectedIndex = _currentResults.length > 0 ? 0 : -1;
  renderSearchResults(q);
}

function renderSearchResults(query) {
  const count = document.getElementById('gs-count');
  if (count) count.textContent = _currentResults.length + ' نتيجة';

  if (!_currentResults.length) {
    _results.innerHTML = `
      <div style="padding:48px 20px;text-align:center;color:var(--muted)">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4;margin-bottom:12px">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <div style="font-size:14px;font-weight:700">لا توجد نتائج</div>
        <div style="font-size:11.5px;margin-top:4px">جرب كلمة أخرى أو تحقق من الإملاء</div>
      </div>`;
    return;
  }

  // تجميع حسب النوع
  const groups = {};
  _currentResults.forEach((item, idx) => {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push({ ...item, _idx: idx });
  });

  let html = '';
  Object.entries(groups).forEach(([type, list]) => {
    html += `<div style="padding:8px 12px 4px;font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">${type} (${list.length})</div>`;
    list.forEach(item => {
      const selected = item._idx === _selectedIndex;
      html += `
        <div class="gs-result-item" data-idx="${item._idx}" 
             style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;
                    border-radius:8px;transition:background .12s;
                    background:${selected ? 'var(--blue-l)' : 'transparent'}">
          <span style="font-size:20px;flex-shrink:0;width:32px;text-align:center">${item.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.title)}</div>
            <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.sub)}</div>
          </div>
          <span style="background:${item.color}22;color:${item.color};font-size:9.5px;font-weight:800;padding:3px 8px;border-radius:20px;flex-shrink:0">${escapeHtml(item.type)}</span>
        </div>`;
    });
  });
  _results.innerHTML = html;

  // ربط النقر
  _results.querySelectorAll('.gs-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = +el.dataset.idx;
      const item = _currentResults[idx];
      if (item) { closeGlobalSearch(); item.action(); }
    });
    el.addEventListener('mouseenter', () => {
      _selectedIndex = +el.dataset.idx;
      _results.querySelectorAll('.gs-result-item').forEach(x => x.style.background = 'transparent');
      el.style.background = 'var(--blue-l)';
    });
  });

  // مرّر للعنصر المحدد
  const selected = _results.querySelector('.gs-result-item[data-idx="' + _selectedIndex + '"]');
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function handleKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeGlobalSearch(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _selectedIndex = Math.min(_selectedIndex + 1, _currentResults.length - 1);
    renderSearchResults(_input.value);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    _selectedIndex = Math.max(_selectedIndex - 1, 0);
    renderSearchResults(_input.value);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = _currentResults[_selectedIndex];
    if (item) { closeGlobalSearch(); item.action(); }
    return;
  }
}

// ══════════════════ الانتقال للصفحة + التمييز ══════════════════

function navTo(page, kind, id, bankId) {
  if (typeof window.nav === 'function') window.nav(page);

  setTimeout(() => {
    if (kind === 'bank') {
      if (typeof window.switchBankTab === 'function') window.switchBankTab(id);
    } else if (kind === 'bank_txn') {
      if (bankId && typeof window.switchBankTab === 'function') window.switchBankTab(bankId);
      setTimeout(() => highlightRow(id), 400);
    } else if (kind === 'stock') {
      highlightCardText(id);
    } else if (kind === 'metal') {
      highlightCardText((id.split('|')[0] || '').trim());
    } else if (kind === 'cert' || kind === 'debt' || kind === 'recurring' || kind === 'goal') {
      highlightCardText(id);
    }
  }, 200);
}

function highlightRow(id) {
  const row = document.querySelector(`[data-row-id="${id}"]`);
  if (!row) return;
  row.classList.add('linked-transfer-highlight');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => row.classList.remove('linked-transfer-highlight'), 1500);
}

function highlightCardText(text) {
  if (!text) return;
  const cards = document.querySelectorAll('.info-card, .debt-card');
  for (const card of cards) {
    if (card.textContent.includes(text)) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.boxShadow = '0 0 0 3px var(--blue)';
      setTimeout(() => card.style.boxShadow = '', 1800);
      break;
    }
  }
}
