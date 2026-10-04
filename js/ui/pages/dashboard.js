// ══════════════════════════════════════════════════════════════════
//  pages/dashboard.js — لوحة التحكم
//  ⚠️ Snapshots تُقرأ بـ EGP وتُحوَّل للعملة الحالية عند العرض
// ══════════════════════════════════════════════════════════════════
import { DB, UI } from '../../state.js';
import {
  N2, fmt, fmtN, pct, periodStart, sign, cls, escapeHtml,
  MARKET_NAMES, getBankColor, baseCur, fromEGP
} from '../../core/utils.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, typeTag, getCertAlerts } from '../shared.js';
import { mkPie, mkLine, destroyChart } from '../charts.js';
import { calcTotals, getStockPrice, getMetalPrice } from '../../domain/calc.js';

// ✅ تحويل قيمة snapshot (المحفوظة بـ EGP) إلى العملة الأساسية الحالية
const displaySnapValue = (egpValue) => fromEGP(N2(egpValue), baseCur());

export function renderDashboard() {
  const T = calcTotals();
  const {
    grand, totalBanks, stocksVal, stocksCost, metalsVal, metalsCost,
    certsTotal, certsPaid, divTotal, pnlStocks, pnlMetals, totalPnl, debtsOwed
  } = T;
  const invested = stocksCost + metalsCost + certsTotal;
  const roi = invested > 0 ? totalPnl / invested * 100 : 0;
  const retS = stocksCost > 0 ? pnlStocks / stocksCost * 100 : 0;
  const retM = metalsCost > 0 ? pnlMetals / metalsCost * 100 : 0;

  document.getElementById('dash-kpis').innerHTML =
    kpi('إجمالي المحفظة', fmt(grand), `${DB.banks.length} حسابات، ${Object.keys(T.h).length} أسهم`, 'var(--blue)', svgIcon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'), roi) +
    kpi('الأرصدة البنكية', fmt(totalBanks), pct(totalBanks, grand) + ' من المحفظة', 'var(--teal)', svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')) +
    kpi('الأسهم والصناديق', fmt(stocksVal), sign(pnlStocks) + fmt(pnlStocks) + (retS ? ` (${sign(retS)}${retS.toFixed(1)}%)` : ''), retS >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'), retS || null) +
    kpi('المعادن الثمينة', fmt(metalsVal), sign(pnlMetals) + fmt(pnlMetals) + (retM ? ` (${sign(retM)}${retM.toFixed(1)}%)` : ''), retM >= 0 ? 'var(--gold)' : 'var(--red)', svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'), retM || null) +
    kpi('الشهادات الادخارية', fmt(certsTotal), 'مُصرف: ' + fmt(certsPaid), 'var(--purple)', svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>')) +
    kpi('العائد الإجمالي', fmt(totalPnl), roi.toFixed(2) + '% على رأس المال', totalPnl >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'), roi || null) +
    (debtsOwed > 0 ? kpi('التزامات/ديون', fmt(debtsOwed), 'مجموع ما عليك', 'var(--red)', svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>')) : '');

  // ─── التنبيهات ───
  const { soon, expired } = getCertAlerts();
  let alertsHtml = '';
  if (expired.length) {
    alertsHtml += `<div class="alert alert-warn">
      <div class="alert-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="alert-content">
        <div class="alert-title">شهادات بحاجة للاسترداد (${expired.length})</div>
        <div class="alert-body">${expired.map(c => escapeHtml(c.name) + ' — منذ ' + Math.abs(c.daysLeft) + ' يوم').join(' · ')}</div>
      </div>
    </div>`;
  }
  if (soon.length) {
    alertsHtml += `<div class="alert alert-info">
      <div class="alert-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="alert-content">
        <div class="alert-title">شهادات تستحق خلال 30 يوم (${soon.length})</div>
        <div class="alert-body">${soon.map(c => escapeHtml(c.name) + ' — ' + c.daysLeft + ' يوم').join(' · ')}</div>
      </div>
    </div>`;
  }
  const lowBal = DB.banks.filter(b => N2(b.min_balance) > 0 && N2(b.balance) < N2(b.min_balance));
  if (lowBal.length) {
    alertsHtml += `<div class="alert alert-warn">
      <div class="alert-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="alert-content">
        <div class="alert-title">حسابات تحت الحد الأدنى (${lowBal.length})</div>
        <div class="alert-body">${lowBal.map(b => escapeHtml(b.name) + ': ' + fmtN(b.balance) + ' ' + escapeHtml(b.currency || 'EGP')).join(' · ')}</div>
      </div>
    </div>`;
  }
  document.getElementById('dash-alerts').innerHTML = alertsHtml;

  renderRecent();
  renderDashCharts(T);
  renderDashMovers(T);

  // ─── الأهداف ───
  if (DB.goals.length) {
    let gh = '<div class="card"><div class="card-header"><div class="card-title">الأهداف المالية</div></div><div class="card-body">';
    DB.goals.forEach(g => {
      let cur = grand;
      if (g.category === 'banks') cur = totalBanks;
      else if (g.category === 'stocks') cur = stocksVal;
      else if (g.category === 'metals') cur = metalsVal;
      else if (g.category === 'certs') cur = certsTotal;
      const p = Math.min(g.target > 0 ? cur / g.target * 100 : 0, 100);
      gh += `<div class="goal-card" style="margin-bottom:8px"><div class="goal-header"><div><div class="goal-name">${escapeHtml(g.name)}</div><div class="goal-meta">${escapeHtml(g.category === 'all' ? 'كل المحفظة' : g.category)}</div></div><div style="text-align:left"><div class="goal-pct">${p.toFixed(0)}%</div><div class="goal-stats">${fmt(cur)} / ${fmt(g.target)}</div></div></div><div class="prog-wrap"><div class="prog-bar" style="width:${p}%;background:${p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--teal)' : 'var(--purple)'}"></div></div></div>`;
    });
    gh += '</div></div>';
    document.getElementById('dash-goals-section').innerHTML = gh;
  } else document.getElementById('dash-goals-section').innerHTML = '';
}

export function renderDashMovers(T) {
  const container = document.getElementById('dash-movers');
  if (!container) return;
  const rows = [];
  Object.entries(T.h).forEach(([sym, v]) => {
    const cp = getStockPrice(sym) || v.avgPrice;
    const cv = v.qty * cp;
    const pnl = cv - v.totalCost;
    const ret = v.totalCost ? pnl / v.totalCost * 100 : 0;
    rows.push({ label: sym, sub: v.name, ret, pnl, cv });
  });
  Object.entries(T.mh).forEach(([key, v]) => {
    const bt = (v.metal_type || key.split('|')[0]).trim();
    const cp = getMetalPrice(bt) || v.avgPrice;
    const cv = v.weight * cp;
    const pnl = cv - v.totalCost;
    const ret = v.totalCost ? pnl / v.totalCost * 100 : 0;
    rows.push({ label: bt, sub: v.title || 'معدن', ret, pnl, cv });
  });
  if (!rows.length) { container.innerHTML = ''; return; }
  const sorted = [...rows].sort((a, b) => b.ret - a.ret);
  const gainers = sorted.filter(r => r.ret > 0).slice(0, 4);
  const losers = sorted.filter(r => r.ret < 0).slice(-4).reverse();
  const rowHtml = r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:.5px solid var(--border)">
    <div><div style="font-weight:800;font-size:12.5px">${escapeHtml(r.label)}</div><div style="font-size:10px;color:var(--muted)">${escapeHtml(r.sub || '')}</div></div>
    <div style="text-align:left"><div class="${cls(r.ret)}" style="font-weight:800;font-size:12.5px;direction:ltr">${sign(r.ret)}${r.ret.toFixed(1)}%</div><div class="${cls(r.pnl)}" style="font-size:10px;direction:ltr">${sign(r.pnl)}${fmt(r.pnl)}</div></div>
  </div>`;
  container.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title">أكبر الرابحين</div></div>
      <div class="card-body">${gainers.length ? gainers.map(rowHtml).join('') : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">لا توجد حيازات رابحة</div>'}</div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title">أكبر الخاسرين</div></div>
      <div class="card-body">${losers.length ? losers.map(rowHtml).join('') : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">لا توجد حيازات خاسرة</div>'}</div>
    </div>`;
}

export function renderRecent() {
  const input = document.getElementById('recent-count-input');
  const limit = Math.min(Math.max(+(input?.value) || 25, 1), 200);
  const pStart = periodStart(UI.globalPeriod || '1y');
  const NEG = ['سحب','تحويل صادر','بيع'];
  const all = [
    ...DB.bankTxns.filter(t => t.date >= pStart).map(t => {
      const b = DB.banks.find(x => x.id === t.bank_id);
      return { date: t.date, type: t.type, cat: t.category || '', amt: t.amount, src: b?.name || 'بنك', notes: (t.notes || '').split('\n')[0], bankId: t.bank_id };
    }),
    ...DB.stockTxns.filter(t => t.date >= pStart).map(t => ({
      date: t.date, type: t.type, cat: MARKET_NAMES[t.market || 'EGX'] || 'أسهم',
      amt: t.net, src: t.symbol, notes: t.name, bankId: t.bank_id
    })),
    ...DB.metalTxns.filter(t => t.date >= pStart).map(t => ({
      date: t.date, type: t.op, cat: 'معادن', amt: t.net,
      src: t.metal_type + (t.notes ? ' — ' + t.notes : ''), notes: '', bankId: t.bank_id
    })),
    ...DB.dividends.filter(t => t.date >= pStart).map(d => ({
      date: d.date, type: 'أرباح', cat: 'توزيعات', amt: d.amount,
      src: d.symbol, notes: d.notes, bankId: d.bank_id
    }))
  ].sort((a, b) => b.date > a.date ? 1 : -1).slice(0, limit);

  const tbody = document.getElementById('dash-recent');
  if (!tbody) return;
  tbody.innerHTML = all.length ? all.map(t => {
    const color = t.bankId ? getBankColor(t.bankId) : 'var(--muted)';
    const dot = t.bankId ? `<span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>` : '';
    return `<tr>
      <td style="font-size:11.5px">${t.date}</td>
      <td>${typeTag(t.type)}</td>
      <td>${t.cat ? `<span class="badge badge-gray" style="font-size:9px">${escapeHtml(t.cat)}</span>` : ''}</td>
      <td class="td-num ${NEG.includes(t.type) ? 'neg' : 'pos'}" style="direction:ltr">${NEG.includes(t.type) ? '-' : '+'}${fmt(t.amt)}</td>
      <td style="display:flex;align-items:center;gap:4px;font-weight:700;font-size:12px">${dot}${escapeHtml(t.src)}</td>
      <td class="muted" style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.notes || '—')}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
}

export function renderDashCharts(T) {
  const { totalBanks, stocksVal, metalsVal, certsTotal } = T;
  const pieData = [
    { l: 'البنوك', v: totalBanks, c: '#1a56db' },
    { l: 'الأسهم', v: stocksVal, c: '#0d9488' },
    { l: 'المعادن', v: metalsVal, c: '#d97706' },
    { l: 'الشهادات', v: certsTotal, c: '#7c3aed' }
  ].filter(d => d.v > 0);

  setTimeout(() => {
    mkPie('dash-pie', pieData.map(d => d.l), pieData.map(d => d.v), pieData.map(d => d.c));

    const snaps = DB.snapshots.filter(s => {
      const s1 = periodStart(UI.globalPeriod || '1y');
      return s.snapshot_date >= s1;
    });
    if (snaps.length > 1) {
      const labels = snaps.map(s => {
        const d = new Date(s.snapshot_date);
        return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      });
      // ✅ تحويل كل القيم من EGP إلى العملة الأساسية الحالية
      mkLine('dash-line', labels, [
        { label: 'إجمالي المحفظة', data: snaps.map(s => displaySnapValue(s.grand_total)), borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.08)', fill: true, tension: .4, pointRadius: snaps.length < 30 ? 2 : 0, borderWidth: 2 }
      ]);
      mkLine('dash-stacked', labels, [
        { label: 'بنوك', data: snaps.map(s => displaySnapValue(s.total_banks)), borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.15)', fill: true, tension: .4, pointRadius: 0 },
        { label: 'أسهم', data: snaps.map(s => displaySnapValue(s.total_stocks)), borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.15)', fill: true, tension: .4, pointRadius: 0 },
        { label: 'معادن', data: snaps.map(s => displaySnapValue(s.total_metals)), borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.15)', fill: true, tension: .4, pointRadius: 0 },
        { label: 'شهادات', data: snaps.map(s => displaySnapValue(s.total_certs)), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.15)', fill: true, tension: .4, pointRadius: 0 }
      ]);
    }
  }, 50);
}
