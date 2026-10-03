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
  
  // استعد زر الحفظ إن كان مخفيًا (من نافذة المرفقات مثلاً)
  const saveBtn = document.getElementById('edit-modal-save-btn');
  if (saveBtn) saveBtn.style.display = '';
  
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

// ══════════════════ المعاينات ══════════════════

export function updateDepPreview() {
  const bid = +document.getElementById('ed-bank').value;
  const amt = N2(document.getElementById('ed-amount').value);
  const b = DB.banks.find(x => x.id === bid);
  const el = document.getElementById('dep-preview');
  if (!el) return;
  if (!b || !amt) { el.innerHTML = ''; return; }
  const after = N2(b.balance) + amt;
  el.innerHTML = previewBox([
    ['الرصيد الحالي', fmt(b.balance) + ' ' + (b.currency || 'EGP')],
    ['المبلغ المُضاف', '+' + fmt(amt), 'color:var(--green)'],
    ['الرصيد بعد العملية', fmt(after) + ' ' + (b.currency || 'EGP'), 'color:var(--green);font-weight:900']
  ]);
}

export function updateWitPreview() {
  const bid = +document.getElementById('ew-bank').value;
  const amt = N2(document.getElementById('ew-amount').value);
  const b = DB.banks.find(x => x.id === bid);
  const el = document.getElementById('wit-preview');
  if (!el) return;
  if (!b || !amt) { el.innerHTML = ''; return; }
  const after = N2(b.balance) - amt;
  const ok = after >= 0;
  el.innerHTML = previewBox([
    ['الرصيد الحالي', fmt(b.balance) + ' ' + (b.currency || 'EGP')],
    ['المبلغ المسحوب', '-' + fmt(amt), 'color:var(--red)'],
    ['الرصيد بعد العملية', fmt(after) + ' ' + (b.currency || 'EGP'), ok ? 'color:var(--green);font-weight:900' : 'color:var(--red);font-weight:900']
  ]) + (!ok ? '<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الرصيد غير كافٍ</div>' : '');
}

export function updateTransferPreview() {
  const fromId = +document.getElementById('etr-from').value;
  const toId = +document.getElementById('etr-to').value;
  const amt = N2(document.getElementById('etr-amount').value);
  const from = DB.banks.find(x => x.id === fromId);
  const to = DB.banks.find(x => x.id === toId);
  const el = document.getElementById('transfer-preview');
  if (!el) return;
  if (!from || !to || !amt) { el.innerHTML = ''; return; }
  const fromCur = from.currency || 'EGP', toCur = to.currency || 'EGP';
  const egpAmt = toEGP(amt, fromCur);
  const toAmt = toCur === fromCur ? amt : (toCur === baseCur() ? egpAmt : egpAmt / getRate(toCur));
  const fromAfter = N2(from.balance) - amt;
  const ok = fromAfter >= 0;
  el.innerHTML = previewBox([
    [`من: ${from.name}`, `${fmt(from.balance)} ${fromCur} ← ${fmt(fromAfter)} ${fromCur}`, fromAfter >= 0 ? 'color:var(--green)' : 'color:var(--red)'],
    [`إلى: ${to.name}`, `${fmt(N2(to.balance))} ${toCur} ← ${fmt(N2(to.balance) + toAmt)} ${toCur}`, 'color:var(--blue)'],
    fromCur !== toCur ? ['المبلغ المُحوَّل', `${fmtN(toAmt, 2)} ${toCur} (بسعر ${fmtN(getRate(fromCur))} = 1 ${fromCur})`, 'color:var(--muted)'] : null
  ]) + (!ok ? `<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الرصيد في ${escapeHtml(from.name)} غير كافٍ</div>` : '');
}

export function updateBuyPreview() {
  const q = N2(document.getElementById('ebuy-qty').value);
  const p = N2(document.getElementById('ebuy-price').value);
  const c = N2(document.getElementById('ebuy-comm').value);
  const cf = N2(document.getElementById('ebuy-comm-fixed').value);
  const el = document.getElementById('buy-preview');
  if (!el) return;
  if (!q || !p) { el.innerHTML = ''; return; }
  const total = q * p, comm = total * c / 100, net = total + comm + cf;
  el.innerHTML = previewBox([
    ['الإجمالي', fmt(total)],
    ['العمولة (' + c + '%)', '+' + fmt(comm), 'color:var(--red)'],
    cf > 0 ? ['عمولة ثابتة', '+' + fmt(cf), 'color:var(--red)'] : null,
    ['الصافي المدفوع', fmt(net), 'color:var(--blue);font-weight:900']
  ]);
}

export function updateSellPreview() {
  const sym = document.getElementById('esell-sym').value;
  const q = N2(document.getElementById('esell-qty').value);
  const p = N2(document.getElementById('esell-price').value);
  const c = N2(document.getElementById('esell-comm').value);
  const cf = N2(document.getElementById('esell-comm-fixed').value);
  const el = document.getElementById('sell-preview');
  if (!el) return;
  if (!sym || !q || !p) { el.innerHTML = ''; return; }
  const h = getHoldings(), hld = h[sym];
  if (!hld) return;
  const total = q * p, comm = total * c / 100, net = total - comm - cf;
  const profit = net - hld.avgPrice * q;
  const newQty = hld.qty - q, newCost = hld.totalCost - hld.avgPrice * q;
  const newAvg = newQty > 0 ? newCost / newQty : 0;
  const qOk = q <= hld.qty;
  el.innerHTML = previewBox([
    ['الإجمالي', fmt(total)],
    ['العمولة (' + c + '%)', '-' + fmt(comm), 'color:var(--red)'],
    cf > 0 ? ['عمولة ثابتة', '-' + fmt(cf), 'color:var(--red)'] : null,
    ['الصافي المستلم', fmt(net), 'color:var(--green);font-weight:900'],
    ['ربح / خسارة هذه الصفقة', (profit >= 0 ? '+' : '') + fmt(profit), profit >= 0 ? 'color:var(--green);font-weight:800' : 'color:var(--red);font-weight:800'],
    ['متوسط التكلفة الجديد', newQty > 0 ? fmtN(newAvg) + ' ' + baseCur() : 'لا يوجد مخزون', 'color:var(--purple)']
  ]) + (!qOk ? `<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الكمية (${q}) أكبر من المملوك (${fmtN(hld.qty, 2)})</div>` : '');
}

export function updateMetalBuyPreview() {
  const w = N2(document.getElementById('emb-weight').value);
  const p = N2(document.getElementById('emb-price').value);
  const mf = N2(document.getElementById('emb-manuf').value);
  const cf = N2(document.getElementById('emb-fixed').value);
  const el = document.getElementById('metal-buy-preview');
  if (!el) return;
  if (!w || !p) { el.innerHTML = ''; return; }
  const total = w * p, manuf = mf * w, net = total + manuf + cf;
  el.innerHTML = previewBox([
    ['الإجمالي (' + fmtN(w, 3) + ' جم × ' + fmtN(p) + ' ' + baseCur() + ')', fmt(total)],
    manuf > 0 ? ['رسوم التصنيع', '+' + fmt(manuf), 'color:var(--red)'] : null,
    cf > 0 ? ['عمولة ثابتة', '+' + fmt(cf), 'color:var(--red)'] : null,
    ['الصافي المدفوع', fmt(net), 'color:var(--gold);font-weight:900'],
    ['تكلفة الجرام الفعلية', fmtN(w > 0 ? net / w : 0) + ' ' + baseCur() + '/جم', 'color:var(--muted)']
  ]);
}

export function updateMetalSellPreview() {
  const type = document.getElementById('ems-type').value;
  const w = N2(document.getElementById('ems-weight').value);
  const p = N2(document.getElementById('ems-price').value);
  const cb = N2(document.getElementById('ems-cashback').value);
  const el = document.getElementById('metal-sell-preview');
  if (!el) return;
  if (!type || !w || !p) { el.innerHTML = ''; return; }
  const mh = getMetalHoldings(), hld = mh[type];
  if (!hld) return;
  const net = w * p + cb;
  const wOk = w <= hld.weight;
  const pnl = net - hld.avgPrice * w;
  el.innerHTML = previewBox([
    ['الإجمالي', fmt(w * p)],
    cb > 0 ? ['كاش باك', '+' + fmt(cb), 'color:var(--green)'] : null,
    ['الصافي المستلم', fmt(net), 'color:var(--green);font-weight:900'],
    ['ربح / خسارة', (pnl >= 0 ? '+' : '') + fmt(pnl), pnl >= 0 ? 'color:var(--green);font-weight:800' : 'color:var(--red);font-weight:800'],
    ['الوزن المملوك', fmtN(hld.weight, 3) + ' جم', wOk ? '' : 'color:var(--red)']
  ]) + (!wOk ? '<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الوزن أكبر من المملوك</div>' : '');
}

export function updateCertPreview() {
  const amount = N2(document.getElementById('ecert-amount').value);
  const rate = N2(document.getElementById('ecert-rate').value);
  const dur = N2(document.getElementById('ecert-dur').value);
  const payout = document.getElementById('ecert-payout').value;
  const el = document.getElementById('cert-preview');
  if (!el) return;
  if (!amount || !rate) { el.innerHTML = ''; return; }
  const totalInt = amount * rate / 100 * dur;
  const periodsMap = { 'سنوي': dur, 'شهري': dur * 12, 'أسبوعي': dur * 52, 'يومي': dur * 365 };
  const periods = periodsMap[payout] || dur;
  const perPeriod = periods > 0 ? totalInt / periods : 0;
  el.innerHTML = previewBox([
    ['الفائدة السنوية', fmt(amount * rate / 100), 'color:var(--green)'],
    ['العائد لكل ' + payout, fmt(perPeriod), 'color:var(--purple)'],
    ['إجمالي الفائدة (' + dur + ' سنة)', fmt(totalInt), 'color:var(--green)'],
    ['القيمة الإجمالية عند الاستحقاق', fmt(amount + totalInt), 'color:var(--purple);font-weight:900']
  ]);
}

export function updateCertBreakPreview() {
  const certId = +document.getElementById('ecb-cert').value;
  const fee = N2(document.getElementById('ecb-fee').value);
  const breakDate = document.getElementById('ecb-date').value;
  const cert = DB.certs.find(c => c.id === certId);
  const el = document.getElementById('cert-break-preview');
  if (!el) return;
  if (!cert) { el.innerHTML = ''; return; }
  const now = new Date(breakDate || today());
  const issued = new Date(cert.issued_date), mat = new Date(cert.maturity_date);
  const isEarly = now < mat;
  const daysHeld = Math.max(0, Math.ceil((now - issued) / 86400000));
  const totalDays = Math.max(1, Math.ceil((mat - issued) / 86400000));
  const earnedInterest = isEarly ? (N2(cert.total_interest) * daysHeld / totalDays) : N2(cert.total_interest);
  const alreadyPaid = N2(cert.interest_paid);
  const remainingInterest = Math.max(0, earnedInterest - alreadyPaid);
  const refund = N2(cert.amount) + remainingInterest - fee;
  el.innerHTML = previewBox([
    ['المبلغ الأصلي', fmt(cert.amount)],
    ['عائد مستحق (' + daysHeld + ' يوم)', fmt(remainingInterest), 'color:var(--green)'],
    fee > 0 ? ['رسوم الكسر', '-' + fmt(fee), 'color:var(--red)'] : null,
    isEarly ? ['ملاحظة', 'كسر قبل الاستحقاق — عائد جزئي فقط', 'color:var(--gold)'] : null,
    ['المبلغ المسترد', fmt(Math.max(0, refund)), refund >= N2(cert.amount) ? 'color:var(--green);font-weight:900' : 'color:var(--gold);font-weight:900']
  ]);
  window._certBreakRefund = Math.max(0, refund);
  window._certBreakEarnedInt = remainingInterest;
}

// ══════════════════ دفعات الشهادات ══════════════════

export function setCertPayoutMode(mode) {
  const singleWrap = document.getElementById('ecp-mode-single-wrap');
  const scheduleWrap = document.getElementById('ecp-mode-schedule-wrap');
  document.getElementById('ecp-single-fields').classList.toggle('hidden', mode === 'schedule');
  document.getElementById('ecp-schedule-fields').classList.toggle('hidden', mode !== 'schedule');
  document.getElementById('ecp-submit-btn').textContent = mode === 'schedule' ? ' تسجيل كل الدفعات المستحقة' : ' صرف العائد';
  if (singleWrap) singleWrap.style.borderColor = mode === 'single' ? 'var(--green)' : 'var(--border2)';
  if (scheduleWrap) scheduleWrap.style.borderColor = mode === 'schedule' ? 'var(--green)' : 'var(--border2)';
  if (mode === 'schedule') {
    const certId = +document.getElementById('ecp-cert-id').value;
    const cert = DB.certs.find(c => c.id === certId);
    if (!cert) return;
    const sched = getCertPayoutSchedule(cert);
    const preview = document.getElementById('ecp-schedule-preview');
    preview.innerHTML = sched.unpaidPeriods.length
      ? sched.unpaidPeriods.map(p => `<div style="display:flex;justify-content:space-between;padding:5px 2px;font-size:12px;border-bottom:.5px solid var(--border)"><span>دفعة رقم ${p.period} — ${p.date}</span><strong class="pos">${fmt(p.amount)}</strong></div>`).join('')
        + `<div style="display:flex;justify-content:space-between;padding:6px 2px;font-size:12.5px;font-weight:800;margin-top:4px"><span>الإجمالي (${sched.unpaidPeriods.length} دفعة)</span><span>${fmt(sched.unpaidPeriods.reduce((a, p) => a + p.amount, 0))}</span></div>`
      : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:10px">لا توجد دفعات مستحقة</div>';
  }
}

export function openCertPayout(certId) {
  const cert = DB.certs.find(c => c.id === certId);
  if (!cert) return;
  document.getElementById('ecp-cert-id').value = certId;
  const accrued = calcAccruedInterest(cert);
  const alreadyPaid = N2(cert.interest_paid);
  const canCollect = Math.max(0, accrued - alreadyPaid);
  const nextDate = calcNextPayoutDate(cert);
  const payout = cert.payout_type || 'سنوي';
  const periodDays = { 'يومي': 1, 'أسبوعي': 7, 'شهري': 30.4375, 'سنوي': 365.25 }[payout] || 365.25;
  const totalDays = Math.max(1, (new Date(cert.maturity_date) - new Date(cert.issued_date)) / 86400000);
  const totalPeriods = Math.ceil(totalDays / periodDays);
  const perPeriod = N2(cert.total_interest) / Math.max(1, totalPeriods);
  const elapsedDays = (new Date() - new Date(cert.issued_date)) / 86400000;
  const completedPeriods = Math.floor(Math.max(0, elapsedDays) / periodDays);

  document.getElementById('ecp-info').innerHTML = `
    <div style="font-weight:800;font-size:14px;margin-bottom:10px">${escapeHtml(cert.name)} <span class="badge badge-blue" style="font-size:10px;margin-right:6px">${payout}</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
      <div style="padding:10px;background:var(--blue-l);border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--muted);margin-bottom:4px">فترات مكتملة</div><div style="font-weight:900;font-size:18px;color:var(--blue)">${completedPeriods}</div><div style="font-size:9.5px;color:var(--muted)">من ${totalPeriods}</div></div>
      <div style="padding:10px;background:var(--green-l);border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--muted);margin-bottom:4px">مستحق للصرف</div><div style="font-weight:900;font-size:18px;color:var(--green)">${fmt(canCollect)}</div></div>
      <div style="padding:10px;background:var(--gold-l);border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--muted);margin-bottom:4px">الدفعة القادمة</div><div style="font-weight:900;font-size:14px;color:var(--gold)">${nextDate ? nextDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : 'عند الاستحقاق'}</div><div style="font-size:9.5px;color:var(--muted)">${fmt(perPeriod)}</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);padding:8px;background:var(--surface2);border-radius:6px">مُصرَّف سابقاً: <strong>${fmt(alreadyPaid)}</strong> | إجمالي الفوائد: <strong>${fmt(N2(cert.total_interest))}</strong> | متبقي: <strong style="color:var(--gold)">${fmt(Math.max(0, N2(cert.total_interest) - alreadyPaid))}</strong></div>`;
  document.getElementById('ecp-amount').value = canCollect > 0 ? canCollect.toFixed(2) : '';
  populateSelect('ecp-bank');
  if (cert.bank_id) document.getElementById('ecp-bank').value = cert.bank_id;
  document.getElementById('ecp-date').value = today();
  const sr = document.querySelector('input[name="ecp-mode"][value="single"]');
  if (sr) sr.checked = true;
  setCertPayoutMode('single');
  openModal('modal-cert-payout');
}

export function openBulkCertPayout() {
  if (!DB.certs.length) return alert('لا توجد شهادات');
  document.getElementById('bcp-date').value = today();
  const sr = document.querySelector('input[name="bcp-mode"][value="single"]');
  if (sr) sr.checked = true;
  setBulkCertMode('single');
  openModal('modal-bulk-cert-payout');
}

export function setBulkCertMode(mode) {
  const singleWrap = document.getElementById('bcp-mode-single-wrap');
  const scheduleWrap = document.getElementById('bcp-mode-schedule-wrap');
  document.getElementById('bcp-date-wrap').classList.toggle('hidden', mode === 'schedule');
  if (singleWrap) singleWrap.style.borderColor = mode === 'single' ? 'var(--green)' : 'var(--border2)';
  if (scheduleWrap) scheduleWrap.style.borderColor = mode === 'schedule' ? 'var(--green)' : 'var(--border2)';
  renderBulkCertList(mode);
}

export function renderBulkCertList(mode) {
  mode = mode || document.querySelector('input[name="bcp-mode"]:checked')?.value || 'single';
  const listEl = document.getElementById('bcp-list');
  if (!listEl) return;
  if (mode === 'single') {
    const items = DB.certs.map(c => {
      const remaining = Math.max(0, N2(c.total_interest) - N2(c.interest_paid));
      const accrued = calcAccruedInterest(c);
      const available = Math.max(0, Math.min(remaining, accrued));
      return { c, available };
    }).filter(x => x.available > 0.01);
    listEl.innerHTML = items.length
      ? items.map(({ c, available }) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:.5px solid var(--border)"><input type="checkbox" class="bcp-check" data-cert="${c.id}" checked style="width:17px;height:17px;flex-shrink:0"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px">${escapeHtml(c.name)}</div><div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name || '—')} · مستحق: ${fmt(available)}</div></div><input type="number" step="0.01" class="form-control bcp-amount" data-cert="${c.id}" value="${available.toFixed(2)}" style="width:110px;padding:6px 8px;font-size:12px"></div>`).join('')
      : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">لا توجد عوائد مستحقة</div>';
  } else {
    const items = DB.certs.map(c => ({ c, sched: getCertPayoutSchedule(c) })).filter(x => x.sched.unpaidPeriods.length > 0);
    listEl.innerHTML = items.length
      ? items.map(({ c, sched }) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:.5px solid var(--border)"><input type="checkbox" class="bcp-check" data-cert="${c.id}" checked style="width:17px;height:17px;flex-shrink:0"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px">${escapeHtml(c.name)}</div><div style="font-size:10.5px;color:var(--muted)">${sched.unpaidPeriods.length} دفعة</div></div><div style="font-weight:800;color:var(--green);font-size:12.5px">${fmt(sched.unpaidPeriods.reduce((a, p) => a + p.amount, 0))}</div></div>`).join('')
      : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">لا توجد دفعات مستحقة</div>';
  }
}

export function setDividendMode(mode) {
  const cashWrap = document.getElementById('ediv-mode-cash-wrap');
  const stockWrap = document.getElementById('ediv-mode-stock-wrap');
  document.getElementById('ediv-amount-wrap').classList.toggle('hidden', mode === 'stock');
  document.getElementById('ediv-shares-wrap').classList.toggle('hidden', mode !== 'stock');
  document.getElementById('ediv-bank-wrap').classList.toggle('hidden', mode === 'stock');
  if (cashWrap) { cashWrap.style.borderColor = mode === 'cash' ? 'var(--green)' : 'var(--border2)'; cashWrap.style.background = mode === 'cash' ? 'var(--green-l)' : 'transparent'; }
  if (stockWrap) { stockWrap.style.borderColor = mode === 'stock' ? 'var(--green)' : 'var(--border2)'; stockWrap.style.background = mode === 'stock' ? 'var(--green-l)' : 'transparent'; }
}

document.addEventListener('metalTypeChange', () => {
  updateMetalBuyPreview();
});
