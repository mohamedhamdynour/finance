// ══════════════════════════════════════════════════════════════════
//  pages/certs.js — الشهادات الادخارية
// ══════════════════════════════════════════════════════════════════
import { DB } from '../../state.js';
import { N2, fmt, fmtN, pct, today, sign, cls, escapeHtml, baseCur, toEGP } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, populateSelect, getCertAlerts } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals, calcAccruedInterest, getCertPayoutSchedule } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

export function renderCerts() {
  const T = calcTotals();
  const { certsTotal, grand } = T;
  const alerts = getCertAlerts();
  const totalInt = DB.certs.reduce((a, c) => a + N2(c.total_interest), 0);
  const totalPaid = DB.certs.reduce((a, c) => a + N2(c.interest_paid), 0);
  const todayAccrued = DB.certs.reduce((a, c) => a + calcAccruedInterest(c), 0);

  document.getElementById('cert-kpis').innerHTML =
    kpi('إجمالي الشهادات', fmt(certsTotal), pct(certsTotal, grand) + ' من المحفظة', 'var(--purple)', svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>')) +
    kpi('مستحق حتى اليوم', fmt(todayAccrued), (todayAccrued / Math.max(1, totalInt) * 100).toFixed(1) + '% من الإجمالي', 'var(--blue)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    kpi('إجمالي الفوائد', fmt(totalInt), 'على مدى المدد كاملة', 'var(--green)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('فوائد تم صرفها', fmt(totalPaid), (totalPaid / Math.max(1, totalInt) * 100).toFixed(1) + '% من الإجمالي', 'var(--teal)', svgIcon('<polyline points="20 6 9 17 4 12"/>')) +
    kpi('فوائد متبقية', fmt(totalInt - totalPaid), 'لم يتم صرفها بعد', 'var(--gold)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    kpi('تستحق قريباً', alerts.soon.length + alerts.expired.length, alerts.expired.length ? 'منتهية: ' + alerts.expired.length : 'خلال 30 يوم', alerts.expired.length ? 'var(--red)' : 'var(--gold)', svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'));

  let alertsHtml = '';
  if (alerts.expired.length) alertsHtml += `<div class="alert alert-danger"><div class="alert-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="alert-content"><div class="alert-title">شهادات منتهية (${alerts.expired.length})</div><div class="alert-body">${alerts.expired.map(c => escapeHtml(c.name) + ' — منذ ' + Math.abs(c.daysLeft) + ' يوم').join(' · ')}</div></div></div>`;
  if (alerts.soon.length) alertsHtml += `<div class="alert alert-warn"><div class="alert-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div class="alert-content"><div class="alert-title">تستحق خلال 30 يوم</div><div class="alert-body">${alerts.soon.map(c => escapeHtml(c.name) + ': ' + c.daysLeft + ' يوم').join(' | ')}</div></div></div>`;
  document.getElementById('cert-alerts').innerHTML = alertsHtml;

  const now = new Date();
  document.getElementById('cert-cards').innerHTML = DB.certs.length ? DB.certs.map(c => {
    const mat = new Date(c.maturity_date);
    const days = Math.ceil((mat - now) / 86400000);
    const isExpired = days < 0, isSoon = days >= 0 && days <= 30;
    const periodsMap = { 'سنوي': N2(c.duration), 'شهري': N2(c.duration) * 12, 'أسبوعي': N2(c.duration) * 52, 'يومي': N2(c.duration) * 365 };
    const periods = periodsMap[c.payout_type || 'سنوي'] || N2(c.duration);
    const perPeriod = periods > 0 ? N2(c.total_interest) / periods : 0;
    const remaining = Math.max(0, N2(c.total_interest) - N2(c.interest_paid));
    const accrued = calcAccruedInterest(c);
    const paidPct = N2(c.total_interest) > 0 ? Math.min(100, N2(c.interest_paid) / N2(c.total_interest) * 100) : 0;
    const statusColor = isExpired ? 'var(--red)' : isSoon ? 'var(--gold)' : 'var(--purple)';
    const statusLabel = isExpired ? 'منتهية' : isSoon ? days + ' يوم للاستحقاق' : 'نشطة';
    return `<div class="info-card">
      <div class="info-card-strip" style="background:${statusColor}"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="min-width:0">
            <div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.name)}</div>
            <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name || '—')} • ${escapeHtml(c.payout_type || 'سنوي')}</div>
          </div>
          <span class="badge" style="background:${statusColor}22;color:${statusColor};font-weight:800">${statusLabel}</span>
        </div>
        <div>
          <div style="font-size:20px;font-weight:900;color:var(--purple)">${fmt(c.amount)}</div>
          <div style="font-size:11px;color:var(--muted)">فائدة ${c.rate}% • ${c.duration} سنة (${c.issued_date} → ${c.maturity_date})</div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-bottom:3px">
            <span>عائد مُصرف: ${paidPct.toFixed(0)}%</span><span>متبقي: ${fmt(remaining)}</span>
          </div>
          <div class="prog-wrap"><div class="prog-bar" style="width:${paidPct}%;background:var(--teal)"></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
          <div>مستحق حتى اليوم<div style="color:var(--blue);font-weight:700">${fmt(accrued)}</div></div>
          <div>العائد الدوري<div style="color:var(--green);font-weight:700">${fmt(perPeriod)}</div></div>
          <div>عائد مُصرف<div style
