// ══════════════════════════════════════════════════════════════════
//  pages/stocks.js — الأسهم والصناديق + التوزيعات + Undo
// ══════════════════════════════════════════════════════════════════
import { DB, UI, marketCtx, editCtx } from '../../state.js';
import { N2, fmt, fmtN, pct, today, sign, cls, escapeHtml, MARKET_COLORS, MARKET_NAMES } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel, sbUpsert } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { deleteWithUndo } from '../undo.js';
import { kpi, svgIcon, typeTag, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals, getHoldings, getStockPrice } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

// ══════════════════ Render ══════════════════

export function renderStocks() {
  const mf = marketCtx.activeStockMarket || 'ALL';
  const h = getHoldings(mf === 'ALL' ? null : mf);
  const hAll = getHoldings(null);
  const T = calcTotals();
  const { grand } = T;
  const fSV = Object.entries(h).reduce((a, [, v]) => a + v.qty * (getStockPrice(v.symbol) || v.avgPrice), 0);
  const fSC = Object.values(h).reduce((a, v) => a + v.totalCost, 0);
  const fPnl = fSV - fSC, fRet = fSC > 0 ? fPnl / fSC * 100 : 0;
  const { stocksVal, stocksCost, pnlStocks } = T;
  const retS = stocksCost > 0 ? pnlStocks / stocksCost * 100 : 0;
  const realPnl = DB.stockTxns.filter(t => t.type === 'بيع' && t.profit != null && (mf === 'ALL' || (t.market || 'EGX') === mf)).reduce((a, t) => a + N2(t.profit), 0);
  const symToMarket = {};
  DB.stockTxns.forEach(t => { if (t.symbol && !symToMarket[t.symbol]) symToMarket[t.symbol] = t.market || 'EGX'; });
  const divFiltered = DB.dividends.filter(d => mf === 'ALL' || (symToMarket[d.symbol] || 'EGX') === mf).reduce((a, d) => a + N2(d.amount), 0);
  const useV = mf === 'ALL' ? stocksVal : fSV;
  const useC = mf === 'ALL' ? stocksCost : fSC;
  const usePnl = mf === 'ALL' ? pnlStocks : fPnl;
  const useRet = mf === 'ALL' ? retS : fRet;

  document.getElementById('stock-kpis').innerHTML =
    kpi('القيمة السوقية', fmt(useV), pct(useV, grand) + ' من المحفظة', 'var(--blue)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('رأس المال', fmt(useC), 'التكلفة الإجمالية', 'var(--muted)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    kpi('ر/خ غير محقق', fmt(usePnl), (useRet >= 0 ? '+' : '') + useRet.toFixed(2) + '%', usePnl >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'), useRet) +
    kpi('أرباح محققة', fmt(realPnl), 'من صفقات البيع', realPnl >= 0 ? 'var(--teal)' : 'var(--red)', svgIcon('<polyline points="9 11 12 14 22 4"/>')) +
    kpi('أرباح موزعة', fmt(divFiltered), 'توزيعات مستلمة', 'var(--purple)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('إجمالي العائد', fmt(usePnl + realPnl + divFiltered), 'غير محقق + محقق + توزيعات', (usePnl + realPnl + divFiltered) >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<line x1="12" y1="20" x2="12" y2="10"/>')) +
    kpi('أوراق مالية', Object.keys(h).length + (mf !== 'ALL' ? ' / ' + Object.keys(hAll).length : ''), 'حيازات حالية', 'var(--teal)', svgIcon('<circle cx="12" cy="12" r="10"/>'));

  const holdingsSorted = Object.entries(h).map(([sym, v]) => {
    const cp = getStockPrice(sym) || v.avgPrice, cv = v.qty * cp;
    return [sym, v, cv];
  }).sort((a, b) => b[2] - a[2]);

  document.getElementById('holdings-cards').innerHTML = holdingsSorted.length
    ? holdingsSorted.map(([sym, v, cv]) => {
        const cp = getStockPrice(sym) || v.avgPrice;
        const pnlV = cv - v.totalCost;
        const ret = v.totalCost ? (pnlV / v.totalCost * 100) : 0;
        const mkt = v.market || 'EGX', cur = v.currency || 'EGP';
        const win = pnlV >= 0;
        return `<div class="info-card">
          <div class="info-card-strip" style="background:${win ? 'var(--green)' : 'var(--red)'}"></div>
          <div class="info-card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="min-width:0">
                <div style="font-weight:900;font-size:15px">${escapeHtml(sym)}</div>
                <div style="font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.name)}</div>
              </div>
              <span class="badge ${MARKET_COLORS[mkt] || 'badge-gray'}" style="font-size:9px">${MARKET_NAMES[mkt] || mkt}</span>
            </div>
            <div>
              <div style="font-size:20px;font-weight:900">${fmt(cv)}</div>
              <div style="display:flex;align-items:center;gap:6px;font-size:12px" class="${cls(pnlV)}">
                <strong>${sign(pnlV)}${fmt(pnlV)}</strong><span>(${sign(ret)}${ret.toFixed(2)}%)</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
              <div>الكمية<div style="color:var(--text);font-weight:700">${fmtN(v.qty, 4)}</div></div>
              <div>متوسط التكلفة<div style="color:var(--text);font-weight:700">${fmtN(v.avgPrice, 4)} ${cur}</div></div>
              <div>السعر الحالي<div style="color:var(--gold);font-weight:700">${fmtN(cp, 4)} ${cur}</div></div>
              <div>من المحفظة<div style="color:var(--text);font-weight:700">${pct(cv, grand)}</div></div>
            </div>
          </div>
          <div class="info-card-footer">
            <button class="btn btn-xs btn-success" onclick="addMoreStock('${escapeHtml(sym)}')">إضافة</button>
            <button class="btn btn-xs btn-danger" onclick="quickSellStock('${escapeHtml(sym)}')">بيع</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:32px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد حيازات${mf !== 'ALL' ? ' في سوق ' + escapeHtml(mf) : ''}</p></div>`;

  const txns = [...DB.stockTxns].filter(t => mf === 'ALL' || (t.market || 'EGX') === mf).reverse();
  document.getElementById('stock-txns-tbody').innerHTML = txns.length ? txns.map(t => {
    const bank = DB.banks.find(b => b.id === t.bank_id);
    const bc = bank ? (bank.color || '#3b82f6') : '#888';
    return `<tr data-row-id="${t.id}" style="border-right:2px solid ${bc}22">
      <td>${t.date}</td><td>${typeTag(t.type)}</td>
      <td class="td-sym" style="font-weight:900">${escapeHtml(t.symbol)}</td>
      <td class="muted" style="font-size:11px">${escapeHtml(t.name || '')}</td>
      <td><span class="badge ${MARKET_COLORS[t.market || 'EGX'] || 'badge-gray'}" style="font-size:9px">${MARKET_NAMES[t.market || 'EGX'] || t.market || 'EGX'}</span></td>
      <td class="td-num">${fmtN(N2(t.quantity), 4)}</td>
      <td class="td-num">${fmtN(N2(t.price), 4)} ${escapeHtml(t.price_currency || 'EGP')}</td>
      <td class="td-num">${fmt(t.total)}</td>
      <td class="td-num muted">${fmt(t.commission)}</td>
      <td class="td-num" style="font-weight:800">${fmt(t.net)}</td>
      <td class="td-num ${t.profit != null ? cls(t.profit) : ''}">${t.profit != null ? sign(t.profit) + fmt(t.profit) : '—'}</td>
      <td>${bank ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid ${bc}40"><span style="width:6px;height:6px;border-radius:50%;background:${bc}"></span>${escapeHtml(bank.name)}</span>` : '—'}</td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editStockTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteStockTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات</td></tr>`;

  if (typeof window.renderStockHeatmap === 'function') {
    let el = document.getElementById('stocks-heatmap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'stocks-heatmap';
      const f = document.querySelector('#page-stocks .card');
      if (f) f.parentNode.insertBefore(el, f);
    }
    if (el) window.renderStockHeatmap(h, el);
  }
  renderDividends();
}

export function renderDividends() {
  const total = DB.dividends.reduce((a, d) => a + N2(d.amount), 0);
  const bySymbol = {};
  DB.dividends.forEach(d => { if (!bySymbol[d.symbol]) bySymbol[d.symbol] = 0; bySymbol[d.symbol] += N2(d.amount); });
  const top = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('div-kpis').innerHTML =
    kpi('إجمالي التوزيعات', fmt(total), '', 'var(--purple)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('عدد التوزيعات', DB.dividends.length, '', 'var(--blue)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    (top ? kpi('أعلى مصدر', fmt(top[1]), top[0], 'var(--green)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) : '');
  document.getElementById('div-tbody').innerHTML = DB.dividends.length
    ? DB.dividends.map(d => {
        const bank = DB.banks.find(b => b.id === d.bank_id);
        return `<tr data-row-id="${d.id}">
          <td>${d.date}</td><td class="td-sym">${escapeHtml(d.symbol)}</td>
          <td style="color:var(--green);font-weight:700">${fmt(d.amount)}</td>
          <td class="muted">${bank ? escapeHtml(bank.name) : '—'}</td>
          <td class="muted">${escapeHtml(d.notes || '—')}</td>
          <td class="td-actions">
            <button class="btn-icon edit" onclick="editDividend(${d.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn-icon danger" onclick="deleteDividend(${d.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">لا توجد توزيعات</td></tr>`;
}

// ══════════════════ Actions ══════════════════

export function autoFillStock() {
  const sym = document.getElementById('ebuy-sym').value.trim().toUpperCase();
  if (!sym) return;
  const last = DB.stockTxns.filter(t => t.symbol === sym).sort((a, b) => b.date > a.date ? 1 : -1)[0];
  const price = DB.stockPrices.find(p => p.symbol === sym);
  if (last) {
    const nameEl = document.getElementById('ebuy-name');
    if (nameEl && !nameEl.value) nameEl.value = last.name || '';
    if (last.sec_type) { const el = document.getElementById('ebuy-type'); if (el) el.value = last.sec_type; }
    if (last.market) { const el = document.getElementById('ebuy-market'); if (el) el.value = last.market; }
    if (last.price_currency) { const el = document.getElementById('ebuy-currency'); if (el) el.value = last.price_currency; }
    if (last.quantity && last.price && last.commission) {
      const rate = N2(last.commission) / (N2(last.quantity) * N2(last.price)) * 100;
      const el = document.getElementById('ebuy-comm');
      if (el) el.value = rate.toFixed(3);
    }
    if (last.bank_id) { const el = document.getElementById('ebuy-bank'); if (el) setTimeout(() => el.value = last.bank_id, 60); }
  }
  const cp = price?.current_price || getStockPrice(sym);
  if (cp) { const el = document.getElementById('ebuy-price'); if (el && !el.value) el.value = fmtN(cp, 2); }
}

export async function doBuy() {
  const isEdit = document.getElementById('ebuy-id').value;
  const sym = document.getElementById('ebuy-sym').value.toUpperCase().trim();
  const name = document.getElementById('ebuy-name').value.trim();
  const sec_type = document.getElementById('ebuy-type').value;
  const market = document.getElementById('ebuy-market')?.value || 'EGX';
  const price_currency = document.getElementById('ebuy-currency')?.value || 'EGP';
  const qty = N2(document.getElementById('ebuy-qty').value), price = N2(document.getElementById('ebuy-price').value);
  const commPct = N2(document.getElementById('ebuy-comm').value), commFixed = N2(document.getElementById('ebuy-comm-fixed').value);
  const dt = document.getElementById('ebuy-date').value || today();
  const bankId = +document.getElementById('ebuy-bank').value;
  const userNotes = document.getElementById('ebuy-notes-field')?.value || '';
  if (!sym || !name || !qty || !price) return alert('أكمل البيانات المطلوبة');
  if (!bankId) return alert('اختر حساباً بنكياً');
  const total = qty * price, commission = total * commPct / 100, net = total + commission + commFixed;
  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');
  const bankCur = bank.currency || 'EGP';
  if (price_currency !== bankCur) return alert(`عملة السهم (${price_currency}) لا تطابق عملة الحساب "${bank.name}" (${bankCur}).`);
  const oldForEdit = isEdit ? DB.stockTxns.find(t => t.id === +isEdit) : null;
  let available = N2(bank.balance);
  if (oldForEdit && oldForEdit.bank_id === bankId) available += N2(oldForEdit.net);
  if (N2(available) < net) return alert('الرصيد غير كافٍ: ' + fmt(available) + ' ' + bankCur);
  try {
    if (isEdit) {
      const old = oldForEdit;
      const buyNote = `سعر الشراء: ${fmtN(price)} ${bankCur}/سهم${userNotes ? ' | ' + userNotes : ''}`;
      await sbPatch('stock_transactions', isEdit, { symbol: sym, name, sec_type, market, price_currency, quantity: qty, price, total, commission, net, date: dt, commission_fixed: commFixed, bank_id: bankId, notes: buyNote });
      if (old?.bank_transaction_id) {
        await sbPatch('bank_transactions', old.bank_transaction_id, { bank_id: bankId, amount: net, date: dt, notes: 'شراء ' + sym + '\n' + buyNote });
      }
      toast('تم التعديل');
    } else {
      const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'سحب', amount: net, date: dt, notes: 'شراء ' + sym }]);
      const buyNote = `سعر الشراء: ${fmtN(price)} ${bankCur}/سهم${userNotes ? ' | ' + userNotes : ''}`;
      await sbPost('stock_transactions', [{ bank_id: bankId, type: 'شراء', symbol: sym, name, sec_type, market, price_currency, quantity: qty, price, total, commission, net, date: dt, commission_fixed: commFixed, bank_transaction_id: bt?.[0]?.id || null, notes: buyNote }]);
      await sbUpsert('stock_prices', { symbol: sym, name, sec_type, current_price: getStockPrice(sym) || price });
      toast('تم الشراء');
    }
    closeModal('modal-buy');
    document.getElementById('ebuy-id').value = '';
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function doSell() {
  const sym = document.getElementById('esell-sym').value;
  const qty = N2(document.getElementById('esell-qty').value), price = N2(document.getElementById('esell-price').value);
  const commPct = N2(document.getElementById('esell-comm').value), commFixed = N2(document.getElementById('esell-comm-fixed').value);
  const dt = document.getElementById('esell-date').value || today();
  const bankId = +document.getElementById('esell-bank').value;
  const userSellNotes = document.getElementById('esell-notes')?.value || '';
  if (!sym || !qty || !price) return alert('أكمل البيانات');
  if (!bankId) return alert('اختر حساباً بنكياً');
  const h = getHoldings();
  if (!h[sym]) return alert('الورقة المالية غير مملوكة');
  if (qty > h[sym].qty + 0.0001) return alert(`الكمية (${fmtN(qty, 2)}) أكبر من المملوك (${fmtN(h[sym].qty, 2)})`);
  const total = qty * price, commission = total * commPct / 100, net = total - commission - commFixed;
  const profit = net - h[sym].avgPrice * qty;
  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');
  try {
    const autoNote = `سعر البيع: ${fmtN(price)} ${bank.currency || 'EGP'}/وحدة | متوسط التكلفة: ${fmtN(h[sym].avgPrice)} | ر/خ: ${sign(profit)}${fmtN(profit)}`;
    const notesFull = userSellNotes ? userSellNotes + '\n' + autoNote : autoNote;
    const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'إيداع', amount: net, date: dt, notes: `بيع ${sym}\n${autoNote}`, category: 'بيع أسهم' }]);
    await sbPost('stock_transactions', [{ bank_id: bankId, type: 'بيع', symbol: sym, name: h[sym].name, sec_type: h[sym].type, market: h[sym].market, price_currency: h[sym].currency, quantity: qty, price, total, commission, net, profit, date: dt, commission_fixed: commFixed, bank_transaction_id: bt?.[0]?.id || null, notes: notesFull }]);
    closeModal('modal-sell');
    toast('تم البيع');
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

// ✅ Undo: حذف عملية سهم
export async function deleteStockTxn(id) {
  const txn = DB.stockTxns.find(t => t.id === id);
  if (!txn) return;
  const label = `${txn.symbol} ${txn.type}`;
  await deleteWithUndo('stock_transactions', id, label, async () => {
    if (txn.bank_transaction_id) {
      try { await sbDel('bank_transactions', txn.bank_transaction_id); } catch (e) {}
    }
  });
}

export function editStockTxn(id) {
  const t = DB.stockTxns.find(x => x.id === id);
  if (!t) return;
  if (t.type === 'شراء') {
    document.getElementById('ebuy-id').value = t.id;
    document.getElementById('ebuy-sym').value = t.symbol;
    document.getElementById('ebuy-name').value = t.name;
    document.getElementById('ebuy-type').value = t.sec_type || 'سهم';
    const marketEl = document.getElementById('ebuy-market');
    if (marketEl) marketEl.value = t.market || 'EGX';
    const curEl = document.getElementById('ebuy-currency');
    if (curEl) curEl.value = t.price_currency || 'EGP';
    document.getElementById('ebuy-qty').value = t.quantity;
    document.getElementById('ebuy-price').value = t.price;
    const commRate = N2(t.quantity) && N2(t.price) ? ((N2(t.commission) / (N2(t.quantity) * N2(t.price))) * 100).toFixed(3) : '0.5';
    document.getElementById('ebuy-comm').value = commRate;
    document.getElementById('ebuy-comm-fixed').value = t.commission_fixed || 0;
    document.getElementById('ebuy-date').value = t.date;
    const bankSel = document.getElementById('ebuy-bank');
    if (bankSel) bankSel.value = t.bank_id || '';
    document.getElementById('buy-preview').innerHTML = '';
    openModal('modal-buy');
  } else {
    editCtx.table = 'stock_transactions';
    editCtx.id = id;
    document.getElementById('edit-modal-title').textContent = 'تعديل عملية بيع أسهم';
    document.getElementById('edit-modal-body').innerHTML = `
      <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px">${escapeHtml(t.symbol)} — ${escapeHtml(t.name)} | النوع: <strong style="color:var(--red)">بيع</strong></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
        <div class="form-group"><label class="form-label">الكمية</label><input class="form-control" type="number" step="0.001" id="edt-qty" value="${t.quantity}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">السعر</label><input class="form-control" type="number" step="0.01" id="edt-price" value="${t.price}"></div>
        <div class="form-group"><label class="form-label">العمولة</label><input class="form-control" type="number" step="0.01" id="edt-commission" value="${t.commission}"></div>
      </div>
      <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-control" id="edt-notes" value="${escapeHtml(t.notes || '')}"></div>`;
    openModal('modal-edit');
  }
}

export function addMoreStock(sym) {
  const h = getHoldings(), hld = h[sym];
  if (!hld) return;
  const lastBuy = [...DB.stockTxns].filter(t => t.symbol === sym && t.type === 'شراء').sort((a, b) => b.date > a.date ? 1 : -1)[0];
  const currentPrice = getStockPrice(sym) || hld.avgPrice;
  document.getElementById('ebuy-id').value = '';
  document.getElementById('ebuy-sym').value = sym;
  document.getElementById('ebuy-name').value = hld.name;
  document.getElementById('ebuy-type').value = hld.type || lastBuy?.sec_type || 'سهم';
  const mktEl = document.getElementById('ebuy-market');
  if (mktEl) mktEl.value = hld.market || lastBuy?.market || 'EGX';
  const curEl = document.getElementById('ebuy-currency');
  if (curEl) curEl.value = hld.currency || lastBuy?.price_currency || 'EGP';
  document.getElementById('ebuy-qty').value = '';
  document.getElementById('ebuy-price').value = currentPrice > 0 ? fmtN(currentPrice, 2) : '';
  const lastComm = lastBuy && N2(lastBuy.quantity) && N2(lastBuy.price) ? ((N2(lastBuy.commission) / (N2(lastBuy.quantity) * N2(lastBuy.price))) * 100).toFixed(3) : '0.5';
  document.getElementById('ebuy-comm').value = lastComm;
  document.getElementById('ebuy-comm-fixed').value = lastBuy?.commission_fixed || 0;
  document.getElementById('ebuy-date').value = today();
  if (lastBuy?.bank_id) setTimeout(() => { document.getElementById('ebuy-bank').value = lastBuy.bank_id; }, 50);
  document.getElementById('buy-preview').innerHTML = '';
  openModal('modal-buy');
}

// ══════════════════ Dividends ══════════════════

export async function saveDividend() {
  const id = document.getElementById('ediv-id').value;
  const sym = document.getElementById('ediv-sym').value.toUpperCase().trim();
  const mode = document.querySelector('input[name="ediv-mode"]:checked')?.value || 'cash';
  const dt = document.getElementById('ediv-date').value || today();
  const notes = document.getElementById('ediv-notes')?.value || '';
  if (!sym) return alert('أدخل كود السهم');
  if (mode === 'stock' && !id) {
    const sharesQty = N2(document.getElementById('ediv-shares').value);
    if (!sharesQty || sharesQty <= 0) return alert('أدخل عدد الأسهم');
    const h = getHoldings(), existing = h[sym];
    try {
      await sbPost('stock_transactions', [{ symbol: sym, name: existing?.name || sym, sec_type: existing?.type || 'سهم', market: existing?.market || 'EGX', price_currency: existing?.currency || 'EGP', type: 'شراء', quantity: sharesQty, price: 0, total: 0, commission: 0, net: 0, date: dt, bank_id: null, notes: 'أسهم منحة' + (notes ? ' | ' + notes : '') }]);
      closeModal('modal-dividend');
      document.getElementById('ediv-id').value = '';
      toast(`تم إضافة ${fmtN(sharesQty, 4)} سهم منحة`);
      await reload();
    } catch (e) { toast('خطأ: ' + e.message, false); }
    return;
  }
  const amt = N2(document.getElementById('ediv-amount').value);
  const bankId = +document.getElementById('ediv-bank').value || null;
  if (!amt) return alert('أكمل البيانات');
  try {
    if (id) {
      const orig = DB.dividends.find(d => d.id === +id);
      if (orig?.bank_transaction_id) {
        await sbPatch('bank_transactions', orig.bank_transaction_id, { bank_id: bankId || orig.bank_id, amount: amt, date: dt, notes: 'أرباح موزعة: ' + sym, category: 'أرباح أسهم' });
      } else if (bankId) {
        const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'إيداع', amount: amt, date: dt, notes: 'أرباح موزعة: ' + sym, category: 'أرباح أسهم' }]);
        await sbPatch('dividends', id, { symbol: sym, amount: amt, date: dt, notes, bank_id: bankId, bank_transaction_id: bt?.[0]?.id || null });
      }
      await sbPatch('dividends', id, { symbol: sym, amount: amt, date: dt, notes, bank_id: bankId || null });
      toast('تم التعديل');
    } else {
      let btId = null;
      if (bankId) {
        const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'إيداع', amount: amt, date: dt, notes: 'أرباح موزعة: ' + sym, category: 'أرباح أسهم' }]);
        btId = bt?.[0]?.id || null;
      }
      await sbPost('dividends', [{ symbol: sym, amount: amt, date: dt, bank_id: bankId, notes, bank_transaction_id: btId }]);
      toast('تم الحفظ');
    }
    closeModal('modal-dividend');
    document.getElementById('ediv-id').value = '';
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editDividend(id) {
  const d = DB.dividends.find(x => x.id === id);
  if (!d) return;
  document.getElementById('ediv-id').value = d.id;
  document.getElementById('ediv-sym').value = d.symbol;
  document.getElementById('ediv-amount').value = d.amount;
  document.getElementById('ediv-date').value = d.date;
  document.getElementById('ediv-notes').value = d.notes || '';
  const bankSel = document.getElementById('ediv-bank');
  if (bankSel) bankSel.value = d.bank_id || '';
  openModal('modal-dividend');
}

// ✅ Undo: حذف توزيع أرباح
export async function deleteDividend(id) {
  const div = DB.dividends.find(d => d.id === id);
  if (!div) return;
  const label = `توزيع ${div.symbol}`;
  await deleteWithUndo('dividends', id, label, async () => {
    if (div.bank_transaction_id) {
      try { await sbDel('bank_transactions', div.bank_transaction_id); } catch (e) {}
    }
  });
}
