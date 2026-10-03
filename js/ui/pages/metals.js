// ══════════════════════════════════════════════════════════════════
//  pages/metals.js — المعادن الثمينة
// ══════════════════════════════════════════════════════════════════
import { DB, UI, editCtx } from '../../state.js';
import { N2, fmt, fmtN, pct, today, sign, cls, escapeHtml, baseCur } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel, sbUpsert } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, typeTag, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals, getMetalHoldings, getMetalPrice } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

export function renderMetals() {
  const mh = getMetalHoldings();
  const T = calcTotals();
  const { metalsVal, metalsCost, pnlMetals, grand } = T;
  const retM = metalsCost > 0 ? pnlMetals / metalsCost * 100 : 0;

  document.getElementById('metal-kpis').innerHTML =
    kpi('القيمة السوقية', fmt(metalsVal), pct(metalsVal, grand) + ' من المحفظة', 'var(--gold)', svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')) +
    kpi('إجمالي التكلفة', fmt(metalsCost), 'رأس المال المستثمر', 'var(--muted)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('ربح / خسارة', fmt(pnlMetals), (retM >= 0 ? '+' : '') + retM.toFixed(2) + '%', pnlMetals >= 0 ? 'var(--gold)' : 'var(--red)', svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'), retM) +
    kpi('حيازات نشطة', Object.keys(mh).length, 'أنواع مختلفة', 'var(--teal)', svgIcon('<circle cx="12" cy="12" r="10"/>'));

  const sorted = Object.entries(mh).map(([key, v]) => {
    const baseType = (v.metal_type || key.split('|')[0]).trim();
    const cp = getMetalPrice(baseType) || v.avgPrice;
    return [key, v, baseType, cp, v.weight * cp];
  }).sort((a, b) => b[4] - a[4]);

  document.getElementById('metal-holdings-cards').innerHTML = sorted.length
    ? sorted.map(([key, v, baseType, cp, curVal]) => {
        const pnlVal = curVal - v.totalCost;
        const ret = v.totalCost ? (pnlVal / v.totalCost * 100) : 0;
        const win = pnlVal >= 0;
        return `<div class="info-card">
          <div class="info-card-strip" style="background:${win ? 'var(--green)' : 'var(--red)'}"></div>
          <div class="info-card-body">
            <div style="min-width:0">
              <div style="font-weight:900;font-size:15px;color:var(--gold)">${escapeHtml(baseType)}</div>
              <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(v.title || '—')}</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:900">${fmt(curVal)}</div>
              <div style="display:flex;align-items:center;gap:6px;font-size:12px" class="${cls(pnlVal)}">
                <strong>${sign(pnlVal)}${fmt(pnlVal)}</strong><span>(${sign(ret)}${ret.toFixed(2)}%)</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
              <div>الوزن<div style="color:var(--text);font-weight:700">${fmtN(v.weight, 3)} جم</div></div>
              <div>متوسط/جم<div style="color:var(--text);font-weight:700">${fmtN(v.avgPrice, 2)}</div></div>
              <div>السعر الحالي/جم<div style="color:var(--gold);font-weight:700">${fmtN(cp, 2)}</div></div>
              <div>من المحفظة<div style="color:var(--text);font-weight:700">${pct(curVal, grand)}</div></div>
            </div>
          </div>
          <div class="info-card-footer">
            <button class="btn btn-xs btn-success" onclick="addMoreMetal('${baseType.replace(/'/g, "\\'")}','${(v.title || '').replace(/'/g, "\\'")}')">إضافة</button>
            <button class="btn btn-xs btn-danger" onclick="quickSellMetal('${key.replace(/'/g, "\\'")}')">بيع</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:32px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد معادن مملوكة</p></div>`;

  // جدول العمليات مع ر/خ تراكمي
  const running = {};
  const txnsWithPnl = [...DB.metalTxns].sort((a, b) => a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id).map(t => {
    const key = (t.notes?.trim()) ? t.metal_type + '|' + t.notes.trim() : t.metal_type;
    if (!running[key]) running[key] = { w: 0, cost: 0 };
    let pnl = null;
    if (t.op === 'شراء') {
      running[key].w += N2(t.weight);
      running[key].cost += N2(t.net);
    } else {
      const avg = running[key].w > 0 ? running[key].cost / running[key].w : 0;
      pnl = N2(t.net) - avg * N2(t.weight);
      const sw = Math.min(N2(t.weight), running[key].w);
      running[key].w -= sw;
      running[key].cost -= avg * sw;
    }
    return { ...t, _pnl: pnl };
  });
  const txns = [...txnsWithPnl].reverse();
  document.getElementById('metal-txns-tbody').innerHTML = txns.length ? txns.map(t => {
    const bank = DB.banks.find(b => b.id === t.bank_id);
    const bc = bank ? (bank.color || '#3b82f6') : '#888';
    return `<tr style="border-right:2px solid ${bc}22">
      <td>${t.date}</td><td>${typeTag(t.op)}</td>
      <td><div style="font-weight:700;color:var(--gold)">${escapeHtml((t.metal_type || '').split('|')[0])}</div>${t.notes ? `<div style="font-size:10px;color:var(--muted)">${escapeHtml(t.notes)}</div>` : ''}</td>
      <td class="td-num">${fmtN(N2(t.weight), 3)} جم</td>
      <td class="td-num">${fmtN(N2(t.price_per_gram), 2)}</td>
      <td class="td-num">${fmt(t.total)}</td>
      <td class="td-num" style="color:var(--red)">${N2(t.manufacturing) > 0 ? fmt(t.manufacturing) : '—'}</td>
      <td class="td-num" style="color:var(--green)">${N2(t.cashback) > 0 ? fmt(t.cashback) : '—'}</td>
      <td class="td-num" style="font-weight:800">${fmt(t.net)}</td>
      <td class="td-num ${t._pnl != null ? cls(t._pnl) : ''}">${t._pnl != null ? sign(t._pnl) + fmt(t._pnl) : '—'}</td>
      <td>${bank ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid ${bc}40"><span style="width:6px;height:6px;border-radius:50%;background:${bc}"></span>${escapeHtml(bank.name)}</span>` : '—'}</td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editMetalTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteMetalTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات</td></tr>`;
}

export async function doMetalBuy() {
  const typeSel = document.getElementById('emb-metal-type')?.value;
  const metal_type = typeSel === '__custom__' ? (document.getElementById('emb-metal-custom')?.value?.trim() || '') : (typeSel || 'ذهب 21');
  const metal_title = document.getElementById('emb-notes')?.value?.trim() || '';
  const weight = N2(document.getElementById('emb-weight').value);
  const price_per_gram = N2(document.getElementById('emb-price').value);
  const currency = document.getElementById('emb-currency')?.value || baseCur();
  const manuf_per_gram = N2(document.getElementById('emb-manuf').value);
  const cf = N2(document.getElementById('emb-fixed').value);
  const dt = document.getElementById('emb-date').value || today();
  const bankId = +document.getElementById('emb-bank').value;
  if (!metal_type || !weight || !price_per_gram) return alert('أكمل البيانات');
  if (!bankId) return alert('اختر حساباً بنكياً');
  const total = weight * price_per_gram;
  const manufacturing = manuf_per_gram * weight;
  const net = total + manufacturing + cf;
  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');
  const bankCur = bank.currency || 'EGP';
  if (currency !== bankCur) return alert(`عملة الشراء (${currency}) لا تطابق عملة الحساب "${bank.name}" (${bankCur}).`);
  if (N2(bank.balance) < net) return alert('الرصيد غير كافٍ: ' + fmt(bank.balance) + ' ' + bankCur);
  try {
    const autoNote = `نوع: ${metal_type}${metal_title ? ' — ' + metal_title : ''} | سعر الجرام: ${fmtN(price_per_gram)} ${currency}${manufacturing > 0 ? ' | تصنيع: ' + fmtN(manuf_per_gram, 2) + ' ' + currency + '/جم' : ''}`;
    const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'سحب', amount: net, date: dt, notes: `شراء ${metal_type}\n${autoNote}`, category: 'شراء معادن' }]);
    await sbPost('metal_transactions', [{ bank_id: bankId, op: 'شراء', metal_type, weight, price_per_gram, currency, total, manufacturing, cashback: 0, net, date: dt, notes: metal_title, commission_fixed: cf, bank_transaction_id: bt?.[0]?.id || null }]);
    if (!getMetalPrice(metal_type)) {
      await sbUpsert('metal_prices', { metal_type, price_per_gram });
    }
    closeModal('modal-metal-buy');
    toast('تم الشراء'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function doMetalSell() {
  const metalKey = document.getElementById('ems-type').value;
  const weight = N2(document.getElementById('ems-weight').value);
  const price_per_gram = N2(document.getElementById('ems-price').value);
  const cashback = N2(document.getElementById('ems-cashback').value);
  const dt = document.getElementById('ems-date').value || today();
  const bankId = +document.getElementById('ems-bank').value;
  if (!metalKey || !weight || !price_per_gram) return alert('أكمل البيانات');
  if (!bankId) return alert('اختر حساباً بنكياً');
  const keyParts = metalKey.split('|');
  const metal_type = keyParts[0];
  const metal_title = keyParts[1] || '';
  const mh = getMetalHoldings();
  if (!mh[metalKey]) return alert('الحيازة غير موجودة');
  const hld = mh[metalKey];
  if (weight > hld.weight + 0.0001) return alert(`الوزن (${fmtN(weight, 3)}جم) أكبر من المملوك (${fmtN(hld.weight, 3)}جم)`);
  const total = weight * price_per_gram, net = total + cashback;
  const pnl = net - hld.avgPrice * weight;
  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');
  try {
    const autoNote = `نوع: ${metal_type}${metal_title ? ' — ' + metal_title : ''} | سعر البيع: ${fmtN(price_per_gram)} /جم | ر/خ: ${sign(pnl)}${fmtN(pnl)}`;
    const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'إيداع', amount: net, date: dt, notes: `بيع ${metal_type}\n${autoNote}`, category: 'بيع معادن' }]);
    await sbPost('metal_transactions', [{ bank_id: bankId, op: 'بيع', metal_type, weight, price_per_gram, total, manufacturing: 0, cashback, net, date: dt, notes: metal_title, bank_transaction_id: bt?.[0]?.id || null }]);
    closeModal('modal-metal-sell');
    toast('تم البيع'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function deleteMetalTxn(id) {
  const txn = DB.metalTxns.find(t => t.id === id);
  if (!txn || !confirm('حذف هذه العملية وعكس أثرها البنكي؟')) return;
  try {
    if (txn.bank_transaction_id) { try { await sbDel('bank_transactions', txn.bank_transaction_id); } catch (e) {} }
    await sbDel('metal_transactions', id);
    toast('تم الحذف'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editMetalTxn(id) {
  const t = DB.metalTxns.find(x => x.id === id);
  if (!t) return;
  editCtx.table = 'metal_transactions';
  editCtx.id = id;
  const isBuy = t.op === 'شراء';
  const manufPerGram = N2(t.weight) > 0 ? N2(t.manufacturing) / N2(t.weight) : 0;
  document.getElementById('edit-modal-title').innerHTML = 'تعديل عملية معادن';
  document.getElementById('edit-modal-body').innerHTML = `
    <div class="form-row">
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
      <div class="form-group"><label class="form-label">النوع</label><select class="form-control" id="edt-op"><option ${t.op === 'شراء' ? 'selected' : ''}>شراء</option><option ${t.op === 'بيع' ? 'selected' : ''}>بيع</option></select></div>
    </div>
    <div class="form-group"><label class="form-label">اسم المعدن</label><input class="form-control" id="edt-metal" value="${escapeHtml(t.metal_type)}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">الوزن (جم)</label><input class="form-control" type="number" step="0.001" id="edt-weight" value="${t.weight}"></div>
      <div class="form-group"><label class="form-label">سعر/جم</label><input class="form-control" type="number" step="0.01" id="edt-price" value="${t.price_per_gram}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">تصنيع/جم</label><input class="form-control" type="number" step="0.01" id="edt-manuf" value="${isBuy ? fmtN(manufPerGram, 4) : 0}" ${isBuy ? '' : 'disabled'}></div>
      <div class="form-group"><label class="form-label">${isBuy ? 'عمولة ثابتة' : 'كاش باك'}</label><input class="form-control" type="number" step="0.01" id="edt-extra" value="${isBuy ? N2(t.commission_fixed) : N2(t.cashback)}"></div>
    </div>
    <div class="form-group"><label class="form-label">الحساب البنكي المرتبط</label><select class="form-control" id="edt-bank-id"></select></div>
    <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-control" id="edt-notes" value="${escapeHtml(t.notes || '')}"></div>`;
  populateSelect('edt-bank-id');
  setTimeout(() => { const el = document.getElementById('edt-bank-id'); if (el) el.value = t.bank_id || ''; }, 0);
  openModal('modal-edit');
}

export function addMoreMetal(metalType, metalTitle) {
  openModal('modal-metal-buy');
  setTimeout(() => {
    // على افتراض أن populateMetalTypeSelect موجودة في settings.js
    if (typeof window.__populateMetalTypeSelect === 'function') window.__populateMetalTypeSelect(metalType);
    document.getElementById('emb-notes').value = metalTitle || '';
    document.getElementById('emb-weight').value = '';
    document.getElementById('emb-price').value = '';
    document.getElementById('emb-manuf').value = '0';
    document.getElementById('emb-fixed').value = '0';
    const last = [...DB.metalTxns].filter(t => t.metal_type === metalType).sort((a, b) => b.date > a.date ? 1 : -1)[0];
    if (last && last.bank_id) document.getElementById('emb-bank').value = last.bank_id;
    document.getElementById('metal-buy-preview').innerHTML = '';
  }, 30);
}
