// ══════════════════════════════════════════════════════════════════
//  modals.js — إدارة كل النوافذ المنبثقة + المعاينات
// ══════════════════════════════════════════════════════════════════
import { DB, UI, APP_SETTINGS, conn } from '../state.js';
import { N2, fmt, fmtN, today, toEGP, getRate, baseCur, getBankColor, BANK_PALETTE, escapeHtml } from '../core/utils.js';
import { previewBox, populateSelect } from './shared.js';
import { getHoldings, getMetalHoldings, calcAccruedInterest, calcNextPayoutDate, getCertPayoutSchedule } from '../domain/calc.js';
import { populateMetalTypeSelect, populateCurrencySelect } from '../core/settings.js';

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  initModal(id);
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

export function initModal(id) {
  const t = today();
  const setV = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
  const clrPrev = (elId) => { const el = document.getElementById(elId); if (el) el.innerHTML = ''; };

  if (id === 'modal-dep') {
    populateSelect('ed-bank');
    setV('ed-date', t); setV('ed-amount', ''); setV('ed-notes', '');
    document.getElementById('ed-txn-id').value = '';
    clrPrev('dep-preview');
  }
  if (id === 'modal-wit') {
    populateSelect('ew-bank');
    setV('ew-date', t); setV('ew-amount', ''); setV('ew-notes', '');
    document.getElementById('ew-txn-id').value = '';
    clrPrev('wit-preview');
  }
  if (id === 'modal-transfer') {
    populateSelect('etr-from'); populateSelect('etr-to');
    setV('etr-date', t); setV('etr-amount', ''); setV('etr-notes', ''); setV('etr-fee', '0');
    clrPrev('transfer-preview');
  }
  if (id === 'modal-buy') {
    populateSelect('ebuy-bank'); setV('ebuy-date', t);
    if (!document.getElementById('ebuy-id').value) {
      setV('ebuy-sym', ''); setV('ebuy-name', ''); setV('ebuy-qty', '');
      setV('ebuy-price', ''); setV('ebuy-comm', '0.5'); setV('ebuy-comm-fixed', '0');
      setV('ebuy-notes-field', ''); clrPrev('buy-preview');
    }
  }
  if (id === 'modal-sell') {
    populateSelect('esell-bank'); setV('esell-date', t);
    populateSellSyms();
    setV('esell-qty', ''); setV('esell-price', '');
    setV('esell-comm', '0.5'); setV('esell-comm-fixed', '0'); setV('esell-notes', '');
    clrPrev('sell-preview');
    document.getElementById('esell-id').value = '';
  }
  if (id === 'modal-metal-buy') {
    populateSelect('emb-bank'); setV('emb-date', t);
    if (!document.getElementById('emb-id').value) {
      populateMetalTypeSelect();
      setV('emb-metal-custom', '');
      document.getElementById('emb-metal-custom')?.classList.add('hidden');
      populateCurrencySelect('emb-currency');
      const mc = document.getElementById('emb-currency');
      if (mc) mc.value = baseCur();
      setV('emb-notes', ''); setV('emb-weight', ''); setV('emb-price', '');
      setV('emb-manuf', '0'); setV('emb-fixed', '0'); clrPrev('metal-buy-preview');
    }
  }
  if (id === 'modal-metal-sell') {
    populateSelect('ems-bank'); setV('ems-date', t);
    populateMetalSellTypes();
    setV('ems-weight', ''); setV('ems-price', ''); setV('ems-cashback', '0');
    clrPrev('metal-sell-preview');
    document.getElementById('ems-id').value = '';
  }
  if (id === 'modal-cert-add') {
    populateSelect('ecert-bank'); setV('ecert-date', t);
    if (!document.getElementById('ecert-id').value) {
      setV('ecert-name', ''); setV('ecert-bank-name', ''); setV('ecert-amount', ''); setV('ecert-rate', '');
      clrPrev('cert-preview');
      populateCurrencySelect('ecert-currency');
      const cSel = document.getElementById('ecert-currency');
      if (cSel) cSel.value = baseCur();
      document.getElementById('modal-cert-title').textContent = 'شهادة ادخارية جديدة';
    }
  }
  if (id === 'modal-cert-break') {
    populateSelect('ecb-bank'); setV('ecb-date', t); setV('ecb-fee', '0'); setV('ecb-notes', '');
    const sel = document.getElementById('ecb-cert');
    if (sel) sel.innerHTML = DB.certs.map(c => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.bank_name || '')} | ${fmt(c.amount)}</option>`).join('');
    clrPrev('cert-break-preview');
  }
  if (id === 'modal-cert-payout') {
    populateSelect('ecp-bank'); setV('ecp-date', t); setV('ecp-amount', '');
    document.getElementById('ecp-cert-id').value = '';
    const infoEl = document.getElementById('ecp-info');
    if (infoEl) infoEl.innerHTML = '';
  }
  if (id === 'modal-dividend') {
    populateSelect('ediv-bank', '<option value="">— لا يوجد —</option>');
    setV('ediv-date', t); setV('ediv-sym', ''); setV('ediv-amount', ''); setV('ediv-notes', ''); setV('ediv-shares', '');
    document.getElementById('ediv-id').value = '';
    const cr = document.querySelector('input[name="ediv-mode"][value="cash"]');
    if (cr) cr.checked = true;
    setDividendMode('cash');
  }
  if (id === 'modal-debt-add') {
    populateSelect('edebt-bank', '<option value="">— لا يوجد —</option>');
    setV('edebt-start', t); setV('edebt-due', '');
    if (!document.getElementById('edebt-id').value) {
      setV('edebt-name', ''); setV('edebt-party', ''); setV('edebt-rate', '0');
      setV('edebt-amount', ''); setV('edebt-remaining', ''); setV('edebt-notes', '');
      document.getElementById('modal-debt-title').textContent = 'إضافة دين / التزام';
    }
  }
  if (id === 'modal-debt-pay') {
    populateSelect('edp-bank', '<option value="">— لا يوجد —</option>');
    setV('edp-date', t); setV('edp-amount', ''); setV('edp-notes', '');
    const ds = document.getElementById('edp-debt');
    if (ds) ds.innerHTML = DB.debts.map(d => `<option value="${d.id}">${escapeHtml(d.name)} | متبقي: ${fmt(d.remaining)}</option>`).join('');
  }
  if (id === 'modal-recurring-add') {
    populateSelect('erec-bank', '<option value="">— اختياري —</option>');
    setV('erec-start', t);
    if (!document.getElementById('erec-id').value) {
      setV('erec-name', ''); setV('erec-amount', '');
      document.getElementById('modal-rec-title').textContent = 'عملية متكررة جديدة';
    }
  }
  if (id === 'modal-goal-add') {
    setV('egoal-name', ''); setV('egoal-target', '');
    const cat = document.getElementById('egoal-cat');
    if (cat) cat.selectedIndex = 0;
  }
  if (id === 'modal-add-bank') {
    if (!document.getElementById('eb-id').value) {
      setV('eb-name', ''); setV('eb-code', '');
      populateCurrencySelect('eb-currency');
      const cSel = document.getElementById('eb-currency');
      if (cSel) cSel.value = baseCur();
      setV('eb-account', ''); setV('eb-min', '0'); setV('eb-opening', '0'); setV('eb-notes', '');
      const used = DB.banks.map(b => b.color).filter(Boolean);
      const next = BANK_PALETTE.find(c => !used.includes(c)) || BANK_PALETTE[DB.banks.length % BANK_PALETTE.length];
      const colorEl = document.getElementById('eb-color');
      if (colorEl) colorEl.value = next;
      const activeEl = document.getElementById('eb-active');
      if (activeEl) activeEl.checked = true;
      document.getElementById('modal-add-bank-title').textContent = 'حساب بنكي جديد';
    }
    const swatches = document.getElementById('bank-color-swatches');
    if (swatches && !swatches.children.length) {
      BANK_PALETTE.forEach(c => {
        const s = document.createElement('div');
        s.style = `width:22px;height:22px;border-radius:4px;background:${c};cursor:pointer;border:2px solid transparent;transition:.15s;flex-shrink:0`;
        s.onclick = () => {
          document.getElementById('eb-color').value = c;
          document.querySelectorAll('#bank-color-swatches div').forEach(x => x.style.borderColor = 'transparent');
          s.style.borderColor = 'rgba(255,255,255,0.8)';
        };
        s.onmouseover = () => s.style.transform = 'scale(1.2)';
        s.onmouseleave = () => s.style.transform = '';
        swatches.appendChild(s);
      });
    }
  }
}

export function populateSellSyms() {
  const h = getHoldings();
  const names = { EGX: 'مصر', TADAWUL: 'السعودية', ADX: 'الإمارات', NYSE: 'NYSE', NASDAQ: 'NASDAQ', CRYPTO: 'كريبتو' };
  const el = document.getElementById('esell-sym');
  if (!el) return;
  el.innerHTML = Object.entries(h).map(([s, v]) => {
    const mkt = v.market || 'EGX', cur = v.currency || 'EGP';
    return `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${names[mkt] || mkt}) — ${escapeHtml(v.name)} | الكمية: ${fmtN(v.qty, 4)} | متوسط: ${fmtN(v.avgPrice, 4)} ${cur}</option>`;
  }).join('') || '<option value="">لا توجد حيازات</option>';
  el.onchange = () => updateSellPreview();
}

export function populateMetalSellTypes() {
  const mh = getMetalHoldings();
  const entries = Object.entries(mh).filter(([, v]) => v.weight > 0.001);
  const el = document.getElementById('ems-type');
  if (!el) return;
  el.innerHTML = entries.length
    ? entries.map(([key, v]) => {
        const bt = (v.metal_type || key.split('|')[0]).trim();
        const label = v.title ? `${bt} — ${v.title}` : bt;
        return `<option value="${escapeHtml(key)}">${escapeHtml(label)} | ${fmtN(v.weight, 3)} جم | متوسط: ${fmtN(v.avgPrice, 2)} ${baseCur()}/جم</option>`;
      }).join('')
    : '<option value="">لا توجد معادن مملوكة</option>';
}

export function quickDep(bankId) {
  populateSelect('ed-bank');
  document.getElementById('ed-bank').value = bankId;
  document.getElementById('ed-date').value = today();
  document.getElementById('ed-amount').value = '';
  document.getElementById('dep-preview').innerHTML = '';
  openModal('modal-dep');
}

export function quickWit(bankId) {
  populateSelect('ew-bank');
  document.getElementById('ew-bank').value = bankId;
  document.getElementById('ew-date').value = today();
  document.getElementById('ew-amount').value = '';
  document.getElementById('wit-preview').innerHTML = '';
  openModal('modal-wit');
}

export function quickSellStock(sym) {
  openModal('modal-sell');
  setTimeout(() => {
    const el = document.getElementById('esell-sym');
    if (el) { el.value = sym; updateSellPreview(); }
  }, 30);
}

export function quickSellMetal(key) {
  openModal('modal-metal-sell');
  setTimeout(() => {
    const el = document.getElementById('ems-type');
    if (el) { el.value = key; updateMetalSellPreview(); }
  }, 30);
}
