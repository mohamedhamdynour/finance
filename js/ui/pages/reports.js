// ══════════════════════════════════════════════════════════════════
//  pages/reports.js — التقارير والتحليل + تصدير PDF/Excel
// ══════════════════════════════════════════════════════════════════
import { DB, UI, APP_SETTINGS, CHARTS } from '../../state.js';
import { N2, fmt, fmtN, fmtK, pct, sign, cls, today, escapeHtml, getBankColor, toEGP, baseCur, MARKET_NAMES, MARKET_COLORS } from '../../core/utils.js';
import { PALETTE } from '../charts.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, getReportPeriodBounds } from '../shared.js';
import { mkPie, mkBar, mkLine, destroyChart } from '../charts.js';
import { calcTotals, calcTotalsForPeriod, getHoldings, getMetalHoldings, getStockPrice, getMetalPrice } from '../../domain/calc.js';

const isDark = () => document.body.classList.contains('dark');
const gc = () => isDark() ? '#1e2d47' : '#e8edf5';
const tc = () => isDark() ? '#4a6080' : '#7a8ba8';

// ══════════════════ Render الرئيسي ══════════════════

export function renderReports() {
  const { pStart, pEnd } = getReportPeriodBounds();
  const PT = calcTotalsForPeriod(pStart, pEnd);
  const { h, mh, grand, totalBanks, stocksVal, stocksCost, metalsVal, metalsCost,
          certsTotal, certsPaid, divTotal, pnlStocks, pnlMetals, totalPnl,
          debtsOwed, debtsOwing, realizedStockPnl, cashIn, cashOut } = PT;
  const invested = stocksCost + metalsCost + certsTotal;
  const roi = invested > 0 ? totalPnl / invested * 100 : 0;
  const retS = stocksCost > 0 ? pnlStocks / stocksCost * 100 : 0;
  const retM = metalsCost > 0 ? pnlMetals / metalsCost * 100 : 0;
  const periodLabel = pStart + ' — ' + pEnd;

  const lu = document.getElementById('r-last-update');
  if (lu) lu.textContent = new Date().toLocaleString('ar-EG') + ' | الفترة: ' + periodLabel;

  // ═══ KPIs ═══
  document.getElementById('report-kpis').innerHTML =
    kpi('إجمالي المحفظة', fmt(grand), 'القيمة السوقية الحالية', 'var(--blue)', svgIcon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'), roi) +
    kpi('رأس المال المستثمر', fmt(invested + totalBanks), 'إجمالي ما تم ضخه', 'var(--muted)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>')) +
    kpi('العائد الصافي', fmt(totalPnl), (roi >= 0 ? '+' : '') + roi.toFixed(2) + '% ROI', totalPnl >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'), roi) +
    kpi('دخل الفترة', fmt(certsPaid + divTotal + realizedStockPnl), 'عوائد + توزيعات + مبيعات', 'var(--teal)', svgIcon('<polyline points="20 6 9 17 4 12"/>')) +
    (debtsOwed > 0 ? kpi('صافي الثروة', fmt(grand - debtsOwed), 'المحفظة ناقص الالتزامات', grand - debtsOwed >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>')) : '');

  // ═══ بطاقات الفئات ═══
  const catEl = document.getElementById('r-category-cards');
  if (catEl) catEl.innerHTML = [
    { l: 'البنوك', v: totalBanks, p: grand ? totalBanks / grand * 100 : 0, sub: DB.banks.filter(b => b.is_active !== false).length + ' حساب', c: 'var(--teal)', pnl: null },
    { l: 'الأسهم', v: stocksVal, p: grand ? stocksVal / grand * 100 : 0, sub: (retS >= 0 ? '+' : '') + retS.toFixed(1) + '% عائد', c: retS >= 0 ? 'var(--green)' : 'var(--red)', pnl: pnlStocks },
    { l: 'المعادن', v: metalsVal, p: grand ? metalsVal / grand * 100 : 0, sub: (retM >= 0 ? '+' : '') + retM.toFixed(1) + '% عائد', c: retM >= 0 ? 'var(--gold)' : 'var(--red)', pnl: pnlMetals },
    { l: 'الشهادات', v: certsTotal, p: grand ? certsTotal / grand * 100 : 0, sub: 'مُصرَّف: ' + fmt(certsPaid), c: 'var(--purple)', pnl: certsPaid > 0 ? certsPaid : null }
  ].map(c => `<div class="card" style="border-right:3px solid ${c.c};margin-bottom:0"><div class="card-body" style="padding:14px">
    <div style="font-size:10px;color:var(--muted);font-weight:800;margin-bottom:6px">${c.l}</div>
    <div style="font-size:20px;font-weight:900;color:${c.c};margin-bottom:4px">${fmt(c.v)}</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:11px;color:var(--muted)">${c.sub}</span><span style="font-size:13px;font-weight:900;color:${c.c}">${c.p.toFixed(1)}%</span></div>
    <div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(c.p, 100)}%;background:${c.c}"></div></div>
    ${c.pnl != null ? `<div style="font-size:11px;margin-top:6px;font-weight:700;color:${c.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${c.pnl >= 0 ? 'ربح' : 'خسارة'}: ${fmt(Math.abs(c.pnl))}</div>` : ''}
  </div></div>`).join('');

  // ═══ توزيع الأسهم ═══
  const stEl = document.getElementById('r-stocks-alloc');
  if (stEl) stEl.innerHTML = Object.entries(h).length ? Object.entries(h).map(([s, v], i) => {
    const cp = getStockPrice(s) || v.avgPrice;
    const cv = v.qty * cp;
    const p = stocksVal ? cv / stocksVal * 100 : 0;
    const pnl = cv - v.totalCost;
    return `<div class="alloc-row"><div class="alloc-dot" style="background:${PALETTE[i % PALETTE.length]}"></div><div class="alloc-label">${escapeHtml(s)} — ${escapeHtml(v.name)}</div><div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(p, 100)}%;background:${PALETTE[i % PALETTE.length]}"></div></div></div><div class="alloc-pct">${p.toFixed(1)}%</div><div class="alloc-val ${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}${fmtK(pnl)}</div></div>`;
  }).join('') : `<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد أسهم في هذه الفترة</div>`;

  // ═══ توزيع المعادن ═══
  const mtEl = document.getElementById('r-metals-alloc');
  if (mtEl) mtEl.innerHTML = Object.entries(mh).length ? Object.entries(mh).map(([t, v], i) => {
    const bt = v.metal_type || t.split('|')[0];
    const cp = getMetalPrice(bt) || v.avgPrice;
    const cv = v.weight * cp;
    const p = metalsVal ? cv / metalsVal * 100 : 0;
    const pnl = cv - v.totalCost;
    return `<div class="alloc-row"><div class="alloc-dot" style="background:${['#d97706','#f59e0b','#b45309','#92400e'][i % 4]}"></div><div class="alloc-label">${escapeHtml(v.title ? bt + ' — ' + v.title : bt)}</div><div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(p, 100)}%;background:#d97706"></div></div></div><div class="alloc-pct">${p.toFixed(1)}%</div><div class="alloc-val ${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}${fmtK(pnl)}</div></div>`;
  }).join('') : `<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد معادن</div>`;

  // ═══ الديون ═══
  const debtsEl = document.getElementById('r-debts-section');
  if (debtsEl) {
    if (DB.debts.length) {
      const now = new Date();
      debtsEl.innerHTML = `<div class="grid-2">
        <div class="card"><div class="card-header"><div class="card-title">جدول الاستحقاق</div></div>
          <div class="card-body no-pad"><div class="table-wrap"><table><thead><tr><th>الدين</th><th>الطرف</th><th style="direction:ltr;text-align:left">المتبقي</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
          <tbody>${DB.debts.map(d => {
            const due = d.due_date ? new Date(d.due_date) : null;
            const ov = due && now > due && +d.remaining > 0;
            const dl = due ? Math.ceil((due - now) / 86400000) : null;
            return `<tr class="${ov ? 'tr-negative' : ''}"><td style="font-weight:700">${escapeHtml(d.name)}</td><td class="muted">${escapeHtml(d.party || '—')}</td><td class="td-num ${d.type === 'دين علي' ? 'neg' : 'pos'}" style="direction:ltr;font-weight:800">${d.type === 'دين علي' ? '-' : '+'}${fmt(d.remaining)}</td><td>${d.due_date || '—'}</td><td style="font-size:11px;font-weight:700;color:${ov ? 'var(--red)' : dl && dl <= 30 ? 'var(--gold)' : 'var(--green)'}">${ov ? 'متأخر ' + Math.abs(dl) + ' يوم' : dl !== null ? dl + ' يوم' : '—'}</td></tr>`;
          }).join('')}</tbody></table></div></div></div>
        <div class="card"><div class="card-header"><div class="card-title">القدرة على السداد</div></div>
          <div class="card-body">
            <div style="font-size:18px;font-weight:900;margin-bottom:8px;color:${totalBanks >= debtsOwed ? 'var(--green)' : 'var(--red)'}">${totalBanks >= debtsOwed ? 'يمكن السداد' : 'السيولة غير كافية'}</div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:8px">السيولة: ${fmt(totalBanks)} | الديون: ${fmt(debtsOwed)}</div>
            <div class="prog-wrap" style="height:10px;margin-bottom:10px"><div class="prog-bar" style="width:${Math.min(totalBanks / Math.max(1, debtsOwed) * 100, 100)}%;background:${totalBanks >= debtsOwed ? 'var(--green)' : 'var(--red)'}"></div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="padding:10px;background:var(--red-l);border-radius:8px;text-align:center"><div style="font-weight:800;color:var(--red);font-size:16px">${fmt(debtsOwed)}</div><div style="color:var(--muted);font-size:11px">ديون عليّ</div></div>
              <div style="padding:10px;background:var(--green-l);border-radius:8px;text-align:center"><div style="font-weight:800;color:var(--green);font-size:16px">${fmt(debtsOwing)}</div><div style="color:var(--muted);font-size:11px">ديون لي</div></div>
            </div>
            <div style="margin-top:8px;padding:8px;background:var(--surface2);border-radius:8px;font-size:11px;text-align:center">نسبة الدين للمحفظة: <strong style="color:${debtsOwed / Math.max(1, grand) > 0.3 ? 'var(--red)' : 'var(--green)'}">${(debtsOwed / Math.max(1, grand) * 100).toFixed(1)}%</strong></div>
          </div></div>
      </div>`;
    } else debtsEl.innerHTML = '';
  }

  // ═══ القوائم المالية ═══
  buildFinancialStatement(PT, periodLabel);
  buildIncomeStatement(PT, periodLabel);
  buildCashFlowStatement(PT, periodLabel);

  if (typeof updateReportCurrencyCard === 'function') updateReportCurrencyCard();
  setTimeout(() => renderReportCharts(PT), 60);
}

// ══════════════════ القائمة المالية التفصيلية ══════════════════

function buildFinancialStatement(PT, periodLabel) {
  const { h, mh, grand, totalBanks, stocksVal, stocksCost, metalsVal, metalsCost,
          certsTotal, certsPaid, pnlStocks, pnlMetals, totalPnl,
          debtsOwed, debtsOwing } = PT;
  const invested = stocksCost + metalsCost + certsTotal;
  const roi = invested > 0 ? totalPnl / invested * 100 : 0;
  const retS = stocksCost > 0 ? pnlStocks / stocksCost * 100 : 0;
  const retM = metalsCost > 0 ? pnlMetals / metalsCost * 100 : 0;

  let fs = '';
  fs += `<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الحسابات البنكية — ${fmt(totalBanks)}</td></tr>`;
  DB.banks.forEach(b => {
    const bv = toEGP(N2(b.balance), b.currency || 'EGP');
    const bc = getBankColor(b.id);
    fs += `<tr><td style="padding-right:28px"><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${bc};display:inline-block"></span>${escapeHtml(b.name)}${b.bank_code ? ' (' + escapeHtml(b.bank_code) + ')' : ''} <span style="font-size:10px;color:var(--muted)">${escapeHtml(b.currency || 'EGP')}</span></span></td><td class="td-num" style="direction:ltr">—</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(bv)}</td><td>—</td><td>—</td><td style="text-align:center">${pct(bv, totalBanks)}</td><td style="text-align:center">${pct(bv, grand)}</td></tr>`;
  });
  fs += `<tr class="fs-subtotal"><td>المجموع — بنوك</td><td style="direction:ltr">—</td><td class="td-num" style="direction:ltr;font-weight:900">${fmt(totalBanks)}</td><td>—</td><td>—</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(totalBanks, grand)}</td></tr>`;

  if (Object.keys(h).length) {
    fs += `<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الأسهم والصناديق — ${(retS >= 0 ? '+' : '') + retS.toFixed(2)}%</td></tr>`;
    Object.entries(h).forEach(([sym, v]) => {
      const cp = getStockPrice(sym) || v.avgPrice;
      const cv = v.qty * cp;
      const pnl = cv - v.totalCost;
      const ret = v.totalCost ? pnl / v.totalCost * 100 : 0;
      fs += `<tr><td style="padding-right:28px;font-weight:700;color:var(--blue)">${escapeHtml(sym)} — ${escapeHtml(v.name)}</td><td class="td-num" style="direction:ltr">${fmt(v.totalCost)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(cv)}</td><td class="td-num ${cls(pnl)}" style="direction:ltr">${sign(pnl)}${fmt(pnl)}</td><td class="td-num ${cls(ret)}" style="direction:ltr">${sign(ret)}${ret.toFixed(2)}%</td><td style="text-align:center">${pct(cv, stocksVal)}</td><td style="text-align:center">${pct(cv, grand)}</td></tr>`;
    });
    fs += `<tr class="fs-subtotal"><td>المجموع — أسهم</td><td class="td-num" style="direction:ltr">${fmt(stocksCost)}</td><td class="td-num" style="direction:ltr">${fmt(stocksVal)}</td><td class="td-num ${cls(pnlStocks)}" style="direction:ltr">${sign(pnlStocks)}${fmt(pnlStocks)}</td><td class="td-num ${cls(retS)}" style="direction:ltr">${sign(retS)}${retS.toFixed(2)}%</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(stocksVal, grand)}</td></tr>`;
  }
  if (Object.keys(mh).length) {
    const retM2 = metalsCost > 0 ? pnlMetals / metalsCost * 100 : 0;
    fs += `<tr class="tr-section"><td colspan="7" style="padding:8px 14px">المعادن الثمينة — ${(retM2 >= 0 ? '+' : '') + retM2.toFixed(2)}%</td></tr>`;
    Object.entries(mh).forEach(([t, v]) => {
      const bt = v.metal_type || t.split('|')[0];
      const cp = getMetalPrice(bt) || v.avgPrice;
      const cv = v.weight * cp;
      const pnl = cv - v.totalCost;
      const ret = v.totalCost ? pnl / v.totalCost * 100 : 0;
      fs += `<tr><td style="padding-right:28px;font-weight:700;color:var(--gold)">${escapeHtml(v.title ? v.metal_type + ' — ' + v.title : bt)}</td><td class="td-num" style="direction:ltr">${fmt(v.totalCost)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(cv)}</td><td class="td-num ${cls(pnl)}" style="direction:ltr">${sign(pnl)}${fmt(pnl)}</td><td class="td-num ${cls(ret)}" style="direction:ltr">${sign(ret)}${ret.toFixed(2)}%</td><td style="text-align:center">${pct(cv, metalsVal)}</td><td style="text-align:center">${pct(cv, grand)}</td></tr>`;
    });
    fs += `<tr class="fs-subtotal"><td>المجموع — معادن</td><td class="td-num" style="direction:ltr">${fmt(metalsCost)}</td><td class="td-num" style="direction:ltr">${fmt(metalsVal)}</td><td class="td-num ${cls(pnlMetals)}" style="direction:ltr">${sign(pnlMetals)}${fmt(pnlMetals)}</td><td class="td-num ${cls(retM2)}" style="direction:ltr">${sign(retM2)}${retM2.toFixed(2)}%</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(metalsVal, grand)}</td></tr>`;
  }
  if (DB.certs.length) {
    fs += `<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الشهادات الادخارية — مُصرَّف في الفترة: ${fmt(certsPaid)}</td></tr>`;
    DB.certs.forEach(c => {
      const rc = N2(c.amount) > 0 ? N2(c.interest_paid) / N2(c.amount) * 100 : 0;
      fs += `<tr><td style="padding-right:28px;font-weight:700;color:var(--purple)">${escapeHtml(c.name)}${c.bank_name ? ' — ' + escapeHtml(c.bank_name) : ''}</td><td class="td-num" style="direction:ltr">${fmt(c.amount)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(N2(c.amount) + N2(c.interest_paid))}</td><td class="td-num ${N2(c.interest_paid) > 0 ? 'pos' : ''}" style="direction:ltr">${N2(c.interest_paid) > 0 ? '+' + fmt(c.interest_paid) : '—'}</td><td class="td-num ${rc > 0 ? 'pos' : ''}" style="direction:ltr">${rc > 0 ? rc.toFixed(2) + '%' : '—'}</td><td style="text-align:center">${pct(N2(c.amount), certsTotal)}</td><td style="text-align:center">${pct(N2(c.amount), grand)}</td></tr>`;
    });
    fs += `<tr class="fs-subtotal"><td>المجموع — شهادات</td><td class="td-num" style="direction:ltr">${fmt(certsTotal)}</td><td class="td-num" style="direction:ltr">${fmt(certsTotal + certsPaid)}</td><td class="td-num pos" style="direction:ltr">+${fmt(certsPaid)}</td><td>—</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(certsTotal, grand)}</td></tr>`;
  }
  if (DB.debts.length) {
    fs += `<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الديون والالتزامات</td></tr>`;
    DB.debts.forEach(d => {
      const io = d.type === 'دين علي';
      fs += `<tr><td style="padding-right:28px;font-weight:700;color:${io ? 'var(--red)' : 'var(--green)'}">${escapeHtml(d.name)}${d.party ? ' — ' + escapeHtml(d.party) : ''}</td><td class="td-num" style="direction:ltr">${fmt(d.amount)}</td><td class="td-num ${io ? 'neg' : 'pos'}" style="direction:ltr;font-weight:700">${io ? '-' : '+'}${fmt(d.remaining)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    });
    fs += `<tr class="fs-subtotal"><td>صافي الديون</td><td>—</td><td class="td-num ${cls(debtsOwing - debtsOwed)}" style="direction:ltr">${sign(debtsOwing - debtsOwed)}${fmt(Math.abs(debtsOwing - debtsOwed))}</td><td colspan="4"></td></tr>`;
  }
  fs += `<tr class="fs-grand"><td>صافي الثروة — ${escapeHtml(periodLabel)}</td><td class="td-num" style="direction:ltr;font-size:13px">${fmt(invested + totalBanks)}</td><td class="td-num" style="direction:ltr;font-size:14px;font-weight:900">${fmt(grand - debtsOwed)}</td><td class="td-num ${cls(totalPnl)}" style="direction:ltr">${sign(totalPnl)}${fmt(totalPnl)}</td><td class="td-num ${cls(roi)}" style="direction:ltr">${sign(roi)}${roi.toFixed(2)}%</td><td colspan="2" style="text-align:center;color:var(--muted);font-size:11px">الفترة: ${escapeHtml(periodLabel)}</td></tr>`;

  document.getElementById('r-detail-tbody').innerHTML = fs;
}

// ══════════════════ قائمة الدخل ══════════════════

function buildIncomeStatement(PT, periodLabel) {
  const { pnlStocks, pnlMetals, certsPaid, divTotal, realizedStockPnl } = PT;
  const realizedTotal = divTotal + certsPaid + realizedStockPnl;
  const unrealizedTotal = pnlStocks + pnlMetals;
  const netIncome = realizedTotal + unrealizedTotal;
  const incRow = (label, val, indent = false, bold = false) =>
    `<tr class="${bold ? 'fs-subtotal' : ''}"><td style="${indent ? 'padding-right:28px' : 'font-weight:700'}">${escapeHtml(label)}</td><td class="td-num ${cls(val)}" style="direction:ltr;${bold ? 'font-weight:800' : ''}">${sign(val)}${fmt(Math.abs(val))}</td></tr>`;

  let inc = '<tr class="tr-section"><td colspan="2" style="padding:8px 14px">الدخل المحقق (Realized)</td></tr>';
  inc += incRow('توزيعات أرباح الأسهم المستلمة', divTotal, true);
  inc += incRow('عوائد الشهادات الادخارية المصروفة', certsPaid, true);
  inc += incRow('أرباح/خسائر محققة من بيع الأسهم', realizedStockPnl, true);
  inc += incRow('إجمالي الدخل المحقق', realizedTotal, false, true);
  inc += '<tr class="tr-section"><td colspan="2" style="padding:8px 14px">التغير في القيمة السوقية (غير محقق)</td></tr>';
  inc += incRow('أرباح/خسائر غير محققة — الأسهم', pnlStocks, true);
  inc += incRow('أرباح/خسائر غير محققة — المعادن', pnlMetals, true);
  inc += incRow('إجمالي التغير غير المحقق', unrealizedTotal, false, true);
  inc += `<tr class="fs-grand"><td>صافي الدخل الإجمالي — ${escapeHtml(periodLabel)}</td><td class="td-num ${cls(netIncome)}" style="direction:ltr;font-size:14px;font-weight:900">${sign(netIncome)}${fmt(Math.abs(netIncome))}</td></tr>`;
  document.getElementById('r-income-tbody').innerHTML = inc;
}

// ══════════════════ قائمة التدفقات النقدية ══════════════════

function buildCashFlowStatement(PT, periodLabel) {
  const { cashIn, cashOut, totalBanks, periodStart: pS, periodEnd: pE } = PT;
  const netCashFlow = cashIn - cashOut;
  const bTxnsForCF = DB.bankTxns.filter(t => t.date >= pS && t.date <= pE);
  const CREDIT_TYPES = ['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  const inflowByCat = {}, outflowByCat = {};
  bTxnsForCF.forEach(t => {
    const bucket = CREDIT_TYPES.includes(t.type) ? inflowByCat : outflowByCat;
    bucket[t.type] = (bucket[t.type] || 0) + N2(t.amount);
  });
  const catRow = (label, val) => `<tr><td style="padding-right:28px;color:var(--muted);font-size:12px">${escapeHtml(label)}</td><td class="td-num" style="direction:ltr;font-size:12px">${fmt(val)}</td></tr>`;
  const row = (label, val, bold = false) => `<tr class="${bold ? 'fs-subtotal' : ''}"><td style="${bold ? 'font-weight:700' : ''}">${escapeHtml(label)}</td><td class="td-num ${cls(val)}" style="direction:ltr;${bold ? 'font-weight:800' : ''}">${sign(val)}${fmt(Math.abs(val))}</td></tr>`;

  let cf = `<tr class="tr-section" style="background:var(--green-l)"><td colspan="2" style="padding:9px 14px;color:var(--green);font-weight:800">↓ التدفقات الداخلة</td></tr>`;
  cf += Object.keys(inflowByCat).length
    ? Object.entries(inflowByCat).sort((a, b) => b[1] - a[1]).map(([t, v]) => catRow(t, v)).join('')
    : catRow('لا توجد حركات داخلة في هذه الفترة', 0);
  cf += row('إجمالي التدفقات الداخلة', cashIn, true);
  cf += `<tr class="tr-section" style="background:var(--red-l)"><td colspan="2" style="padding:9px 14px;color:var(--red);font-weight:800">↑ التدفقات الخارجة</td></tr>`;
  cf += Object.keys(outflowByCat).length
    ? Object.entries(outflowByCat).sort((a, b) => b[1] - a[1]).map(([t, v]) => catRow(t, v)).join('')
    : catRow('لا توجد حركات خارجة في هذه الفترة', 0);
  cf += row('إجمالي التدفقات الخارجة', -cashOut, true);
  cf += `<tr class="fs-grand"><td>صافي التدفق النقدي — ${escapeHtml(periodLabel)}</td><td class="td-num ${cls(netCashFlow)}" style="direction:ltr;font-size:14px;font-weight:900">${sign(netCashFlow)}${fmt(Math.abs(netCashFlow))}</td></tr>`;
  cf += `<tr><td style="color:var(--muted);font-size:11px;padding-top:10px">رصيد البنوك الحالي (كل الحسابات)</td><td class="td-num" style="direction:ltr;color:var(--muted);font-size:11px">${fmt(totalBanks)}</td></tr>`;
  document.getElementById('r-cashflow-tbody').innerHTML = cf;
}

// ══════════════════ الرسوم البيانية ══════════════════

export function renderReportCharts(PT) {
  const { h, mh, totalBanks, stocksVal, metalsVal, certsTotal,
          pnlStocks, pnlMetals, certsPaid, divTotal, realizedStockPnl } = PT;
  const { pStart: rStart, pEnd: rEnd } = getReportPeriodBounds();

  const pd = [
    { l: 'البنوك', v: totalBanks, c: '#1a56db' },
    { l: 'الأسهم', v: stocksVal, c: '#0d9488' },
    { l: 'المعادن', v: metalsVal, c: '#d97706' },
    { l: 'الشهادات', v: certsTotal, c: '#7c3aed' }
  ].filter(d => d.v > 0);
  if (pd.length) mkPie('r-pie', pd.map(d => d.l), pd.map(d => d.v), pd.map(d => d.c));

  const pi = [
    { l: 'أسهم (غير محقق)', v: pnlStocks },
    { l: 'معادن (غير محقق)', v: pnlMetals },
    { l: 'أسهم محقق', v: realizedStockPnl },
    { l: 'شهادات مُصرَّفة', v: certsPaid },
    { l: 'أرباح موزعة', v: divTotal }
  ].filter(x => Math.abs(x.v) > 0.01);
  if (pi.length) mkBar('r-pnl', pi.map(x => x.l), [{
    label: 'ر/خ', data: pi.map(x => x.v),
    backgroundColor: pi.map(x => x.v >= 0 ? 'rgba(13,148,136,.85)' : 'rgba(225,29,72,.85)'),
    borderRadius: 8, borderSkipped: false
  }]);

  const snaps = DB.snapshots.filter(s => s.snapshot_date >= rStart && s.snapshot_date <= rEnd);
  if (snaps.length > 1) mkLine('r-line', snaps.map(s => {
    const d = new Date(s.snapshot_date);
    return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  }), [
    { label: 'الإجمالي', data: snaps.map(s => N2(s.grand_total)), borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,.08)', fill: true, tension: .4, pointRadius: snaps.length < 40 ? 2 : 0, borderWidth: 2 },
    { label: 'البنوك', data: snaps.map(s => N2(s.total_banks)), borderColor: '#0891b2', fill: false, tension: .4, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 4] },
    { label: 'الأسهم', data: snaps.map(s => N2(s.total_stocks)), borderColor: '#0d9488', fill: false, tension: .4, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 4] }
  ]);

  if (Object.keys(h).length) {
    const ent = Object.entries(h);
    const sv = ent.map(([s, v]) => {
      const cp = getStockPrice(s) || v.avgPrice;
      return +(v.qty * cp - v.totalCost).toFixed(2);
    });
    if (sv.some(v => Math.abs(v) > 0.01)) {
      mkBar('r-stocks-pnl', ent.map(([s]) => s), [{
        label: 'ر/خ', data: sv,
        backgroundColor: sv.map(v => v >= 0 ? '#0d9488' : '#e11d48'),
        borderRadius: 6
      }]);
    }
  }

  if (Object.keys(mh).length) {
    const me = Object.entries(mh);
    const mv = me.map(([t, v]) => {
      const bt = v.metal_type || t.split('|')[0];
      const cp = getMetalPrice(bt) || v.avgPrice;
      return +(v.weight * cp - v.totalCost).toFixed(2);
    });
    if (mv.some(v => Math.abs(v) > 0.01)) {
      mkBar('r-metals-pnl', me.map(([t, v]) => v.title ? v.metal_type + '—' + v.title : (v.metal_type || t.split('|')[0])), [{
        label: 'ر/خ', data: mv,
        backgroundColor: mv.map(v => v >= 0 ? '#d97706' : '#e11d48'),
        borderRadius: 6
      }]);
    }
  }

  // ─── شهادات (باستخدام CHARTS الموحد) ───
  if (DB.certs.length) {
    const sorted = [...DB.certs].sort((a, b) => a.maturity_date > b.maturity_date ? 1 : -1);
    destroyChart('r-certs');
    const cv = document.getElementById('r-certs');
    if (cv && window.Chart) {
      CHARTS['r-certs'] = new window.Chart(cv, {
        type: 'bar',
        data: {
          labels: sorted.map(c => c.name),
          datasets: [
            { label: 'الأصل', data: sorted.map(c => N2(c.amount)), backgroundColor: '#7c3aed', borderRadius: 4, stack: 's' },
            { label: 'مُصرَّف', data: sorted.map(c => N2(c.interest_paid)), backgroundColor: '#0d9488', borderRadius: 4, stack: 's' },
            { label: 'متبقي', data: sorted.map(c => Math.max(0, N2(c.total_interest) - N2(c.interest_paid))), backgroundColor: 'rgba(124,58,237,.25)', borderRadius: 4, stack: 's' }
          ]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: true,
          plugins: { legend: { labels: { color: tc(), font: { family: 'Cairo', size: 11 } } } },
          scales: {
            x: { stacked: true, grid: { color: gc() }, ticks: { color: tc(), font: { family: 'Cairo', size: 10 } } },
            y: { stacked: true, grid: { display: false }, ticks: { color: tc(), font: { family: 'Cairo', size: 10 } } }
          }
        }
      });
    }
  }

  const bd = DB.banks.filter(b => b.is_active !== false && toEGP(N2(b.balance), b.currency || 'EGP') > 0);
  if (bd.length) mkPie('r-banks', bd.map(b => b.name), bd.map(b => toEGP(N2(b.balance), b.currency || 'EGP')), bd.map(b => getBankColor(b.id)));

  // ─── نشاط الحركات ───
  const months = [], deps = [], withs = [];
  const ep = UI.globalPeriod || '1y';
  let dateList = [];
  if (ep === 'custom' && UI.customFrom && UI.customTo) {
    const s = new Date(UI.customFrom), e = new Date(UI.customTo);
    const c = new Date(s.getFullYear(), s.getMonth(), 1);
    while (c <= e) { dateList.push(new Date(c)); c.setMonth(c.getMonth() + 1); }
  } else {
    const mb = ep === '3m' ? 3 : ep === '6m' ? 6 : ep === '1y' ? 12 : ep === '2y' ? 24 : ep === '5y' ? 60 : 120;
    for (let j = mb - 1; j >= 0; j--) {
      const d = new Date();
      d.setMonth(d.getMonth() - j);
      if (d.toISOString().slice(0, 7) >= rStart.slice(0, 7)) dateList.push(new Date(d));
    }
  }
  const CREDIT = ['إيداع','تحويل وارد','عائد شهادة','أرباح'];
  dateList.forEach(d => {
    const ym = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0');
    months.push(new Intl.DateTimeFormat('ar-EG', { month: 'short', year: '2-digit' }).format(d));
    const mt = DB.bankTxns.filter(t => t.date && t.date.startsWith(ym));
    deps.push(mt.filter(t => CREDIT.includes(t.type)).reduce((a, t) => a + N2(t.amount), 0));
    withs.push(mt.filter(t => !CREDIT.includes(t.type)).reduce((a, t) => a + N2(t.amount), 0));
  });
  if (months.length) mkBar('r-activity', months, [
    { label: 'واردات', data: deps, backgroundColor: 'rgba(13,148,136,.85)', borderRadius: 6, borderSkipped: false },
    { label: 'صادرات', data: withs, backgroundColor: 'rgba(225,29,72,.85)', borderRadius: 6, borderSkipped: false }
  ]);
}

// ══════════════════ بطاقة عملة التقارير ══════════════════

export function updateReportCurrencyCard() {
  const sel = document.getElementById('r-currency-sel');
  if (!sel) return;
  const toCur = sel.value || 'EGP';
  const T = calcTotals();

  const knownCurs = ['EGP','USD','EUR','GBP','SAR','AED'];
  const extraCurs = DB.exchangeRates.filter(r => !knownCurs.includes(r.currency));
  extraCurs.forEach(r => {
    if (!sel.querySelector(`option[value="${r.currency}"]`)) {
      const opt = document.createElement('option');
      opt.value = r.currency;
      opt.textContent = r.currency;
      sel.appendChild(opt);
    }
  });

  const rate = toCur === 'EGP' ? 1 : (DB.exchangeRates.find(x => x.currency === toCur)?.rate || 1);
  const egpToTarget = egp => toCur === 'EGP' ? egp : (rate > 0 ? egp / rate : egp);

  const categories = [
    { label: 'إجمالي المحفظة', val: T.grand, color: 'var(--blue)' },
    { label: 'الأرصدة البنكية', val: T.totalBanks, color: 'var(--teal)' },
    { label: 'الأسهم', val: T.stocksVal, color: 'var(--green)' },
    { label: 'المعادن', val: T.metalsVal, color: 'var(--gold)' },
    { label: 'الشهادات', val: T.certsTotal, color: 'var(--purple)' }
  ];

  const grid = document.getElementById('r-currency-grid');
  if (!grid) return;
  const rateDisplay = toCur !== 'EGP'
    ? `<div style="font-size:10px;color:var(--muted);margin-top:8px;padding:6px;background:var(--surface2);border-radius:6px">سعر الصرف: 1 ${toCur} = ${fmtN(rate, 4)} EGP</div>`
    : '';
  grid.innerHTML = categories.map(c => {
    const converted = egpToTarget(c.val);
    const pctVal = T.grand > 0 ? c.val / T.grand * 100 : 0;
    return `<div style="padding:14px;border-radius:10px;border:.5px solid var(--border);background:var(--surface2);text-align:center">
      <div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:6px">${escapeHtml(c.label)}</div>
      <div style="font-size:20px;font-weight:900;color:${c.color}">${fmtN(converted, 2)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(toCur)}</div>
      ${c.label !== 'إجمالي المحفظة' ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${pctVal.toFixed(1)}% من المحفظة</div>` : ''}
    </div>`;
  }).join('') + rateDisplay;
}

// ══════════════════ exportPDF ══════════════════

export async function exportPDF() {
  try {
    renderReports();
    const T = calcTotals();
    const { pStart, pEnd } = getReportPeriodBounds();
    const title = APP_SETTINGS.exchange_name || 'تقرير المحفظة المالية';
    const cur = baseCur();

    const table = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="c">لا توجد بيانات</td></tr>`}</tbody></table>`;
    const sec = (t, inner) => `<section><h2>${t}</h2>${inner}</section>`;
    const kv = (k, v, c = '') => `<tr><td>${k}</td><td class="n ${c}">${v}</td></tr>`;

    const summary = table(['البند', 'القيمة (' + cur + ')'],
      kv('إجمالي الثروة', fmt(T.grand), 'b') +
      kv('الحسابات البنكية والنقد', fmt(T.totalBanks)) +
      kv('الأسهم والصناديق', fmt(T.stocksVal)) +
      kv('المعادن الثمينة', fmt(T.metalsVal)) +
      kv('الشهادات الادخارية', fmt(T.certsTotal)) +
      kv('ديون لك', fmt(T.debtsOwing)) +
      kv('ديون عليك', fmt(-T.debtsOwed), 'neg'));

    const banks = table(['الحساب','النوع','العملة','الرصيد','المقابل (' + cur + ')'],
      DB.banks.filter(b => b.is_active !== false).map(b =>
        `<tr><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.type)}</td><td>${escapeHtml(b.currency || 'EGP')}</td><td class="n">${fmtN(b.balance)}</td><td class="n">${fmt(toEGP(N2(b.balance), b.currency || 'EGP'))}</td></tr>`
      ).join(''));

    const h = getHoldings();
    const stocks = table(['الكود','الاسم','الكمية','متوسط التكلفة','السعر الحالي','القيمة','ر/خ'],
      Object.entries(h).map(([s, v]) => {
        const cp = getStockPrice(s) || v.avgPrice;
        const cv = v.qty * cp;
        const pl = cv - v.totalCost;
        return `<tr><td>${escapeHtml(s)}</td><td>${escapeHtml(v.name)}</td><td class="n">${fmtN(v.qty, 4)}</td><td class="n">${fmtN(v.avgPrice, 4)}</td><td class="n">${fmtN(cp, 4)}</td><td class="n">${fmt(cv)}</td><td class="n ${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : ''}${fmt(pl)}</td></tr>`;
      }).join(''));

    const mh = getMetalHoldings();
    const metals = table(['النوع','العنوان','الوزن (جم)','متوسط/جم','السعر الحالي/جم','القيمة','ر/خ'],
      Object.entries(mh).filter(([, v]) => v.weight > 0.001).map(([k, v]) => {
        const bt = (v.metal_type || k.split('|')[0]).trim();
        const cp = getMetalPrice(bt) || v.avgPrice;
        const cv = v.weight * cp;
        const pl = cv - v.totalCost;
        return `<tr><td>${escapeHtml(bt)}</td><td>${escapeHtml(v.title || '—')}</td><td class="n">${fmtN(v.weight, 3)}</td><td class="n">${fmtN(v.avgPrice)}</td><td class="n">${fmtN(cp)}</td><td class="n">${fmt(cv)}</td><td class="n ${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : ''}${fmt(pl)}</td></tr>`;
      }).join(''));

    const certs = table(['الشهادة','البنك','المبلغ','الفائدة %','الإصدار','الاستحقاق','عائد مُصرف','إجمالي الفائدة'],
      DB.certs.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.bank_name || '—')}</td><td class="n">${fmt(c.amount)}</td><td class="n">${c.rate}%</td><td>${c.issued_date}</td><td>${c.maturity_date}</td><td class="n">${fmt(c.interest_paid)}</td><td class="n">${fmt(c.total_interest)}</td></tr>`).join(''));

    const detail = `<table><thead><tr><th>البند</th><th>التكلفة</th><th>القيمة الحالية</th><th>ر/خ</th><th>عائد %</th><th>من الفئة</th><th>من المحفظة</th></tr></thead><tbody>${document.getElementById('r-detail-tbody').innerHTML}</tbody></table>`;
    const income = `<table><tbody>${document.getElementById('r-income-tbody').innerHTML}</tbody></table>`;
    const cashflow = `<table><tbody>${document.getElementById('r-cashflow-tbody').innerHTML}</tbody></table>`;

    const css = `
      @page{size:A4;margin:14mm 12mm}
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Tahoma,'Noto Naskh Arabic',Arial,sans-serif;color:#111827;direction:rtl;font-size:11px;line-height:1.55;margin:0}
      header{border-bottom:3px solid #1a56db;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
      header h1{margin:0;font-size:22px;color:#1a56db}
      header .meta{font-size:10.5px;color:#4b5563;text-align:left;direction:ltr}
      section{margin-bottom:16px}
      h2{font-size:13.5px;margin:0 0 6px;padding:5px 10px;background:#eff6ff;border-right:4px solid #1a56db;color:#1e3a8a}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th{background:#f3f4f6;text-align:right;padding:5px 7px;border:1px solid #d1d5db;font-weight:800}
      td{padding:4px 7px;border:1px solid #e5e7eb}
      .n,.td-num{text-align:left;direction:ltr;white-space:nowrap}
      .c{text-align:center;color:#6b7280}
      .b{font-weight:900}
      .pos{color:#15803d}.neg{color:#b91c1c}
      .tr-section td,.tr-section{background:#f9fafb;font-weight:800}
      .fs-grand td{background:#eff6ff;font-weight:900;border-top:2px solid #1a56db}
      .fs-subtotal td{font-weight:800;background:#f9fafb}
      footer{margin-top:10px;padding-top:6px;border-top:1px solid #d1d5db;font-size:9.5px;color:#6b7280;text-align:center}
    `;
    const doc = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${today()}</title><style>${css}</style></head><body>
      <header><div><h1>${escapeHtml(title)}</h1><div style="color:#4b5563">تقرير مالي شامل — العملة الأساسية: ${escapeHtml(cur)}</div></div>
      <div class="meta">Period: ${pStart} → ${pEnd}<br>Generated: ${new Date().toLocaleString('en-GB')}</div></header>
      ${sec('١. ملخص المحفظة', summary)}
      ${sec('٢. الحسابات البنكية', banks)}
      ${sec('٣. القائمة المالية التفصيلية', detail)}
      ${sec('٤. قائمة الدخل (' + pStart + ' → ' + pEnd + ')', income)}
      ${sec('٥. قائمة التدفقات النقدية (' + pStart + ' → ' + pEnd + ')', cashflow)}
      ${sec('٦. حيازات الأسهم والصناديق', stocks)}
      ${sec('٧. المعادن الثمينة', metals)}
      ${sec('٨. الشهادات الادخارية', certs)}
      <footer>تم إنشاء هذا التقرير آليًا — الأرقام حتى ${today()}</footer>
    </body></html>`;

    const old = document.getElementById('print-frame');
    if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = 'print-frame';
    fr.style.cssText = 'position:fixed;right:-9999px;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.contentDocument.open();
    fr.contentDocument.write(doc);
    fr.contentDocument.close();
    setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 400);
    toast('اختر "حفظ كـ PDF" من نافذة الطباعة');
  } catch (e) {
    console.error('exportPDF:', e);
    toast('خطأ في التصدير: ' + e.message, false);
  }
}
