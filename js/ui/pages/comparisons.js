// ══════════════════════════════════════════════════════════════════
//  pages/comparisons.js — صفحة تحليل YoY/MoM
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, fmtN, escapeHtml, baseCur } from '../../core/utils.js';
import { kpi, svgIcon } from '../shared.js';
import { mkBar, mkLine } from '../charts.js';
import { getMoM, getYoY, getQoQ, monthlyStats, categoryComparison, topChanges } from '../../domain/comparisons.js';

let _activeTab = 'mom'; // 'mom' | 'qoq' | 'yoy'

export function renderComparisons() {
  renderKpis();
  renderTabs();
  renderActiveSection();
  renderMonthlyChart();
  renderCategoriesSection();
}

// ══════════════════ KPIs عامة ══════════════════

function renderKpis() {
  const mom = getMoM();
  const yoy = getYoY();
  const qoq = getQoQ();

  const incomeMoM = mom.metrics.find(m => m.label === 'الدخل');
  const expenseMoM = mom.metrics.find(m => m.label === 'المصروفات');
  const incomeYoY = yoy.metrics.find(m => m.label === 'الدخل');
  const netYoY = yoy.metrics.find(m => m.label === 'صافي التوفير');

  const el = document.getElementById('cmp-kpis');
  if (!el) return;

  el.innerHTML =
    kpi('دخل الشهر', fmt(incomeMoM.current),
      (incomeMoM.pct >= 0 ? '+' : '') + incomeMoM.pct.toFixed(1) + '% عن الشهر الماضي',
      incomeMoM.isPositive ? 'var(--green)' : 'var(--red)',
      svgIcon('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>'),
      incomeMoM.pct) +
    kpi('مصروف الشهر', fmt(expenseMoM.current),
      (expenseMoM.pct >= 0 ? '+' : '') + expenseMoM.pct.toFixed(1) + '% عن الشهر الماضي',
      expenseMoM.isNegative ? 'var(--red)' : 'var(--green)',
      svgIcon('<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>'),
      -expenseMoM.pct) +
    kpi('دخل 12 شهر (YoY)', fmt(incomeYoY.current),
      (incomeYoY.pct >= 0 ? '+' : '') + incomeYoY.pct.toFixed(1) + '% عن السنة السابقة',
      incomeYoY.isPositive ? 'var(--green)' : 'var(--red)',
      svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>'),
      incomeYoY.pct) +
    kpi('صافي التوفير السنوي', fmt(netYoY.current),
      (netYoY.pct >= 0 ? '+' : '') + netYoY.pct.toFixed(1) + '% عن السنة السابقة',
      netYoY.isPositive ? 'var(--green)' : 'var(--red)',
      svgIcon('<circle cx="12" cy="12" r="10"/>'),
      netYoY.pct);
}

// ══════════════════ Tabs ══════════════════

function renderTabs() {
  const el = document.getElementById('cmp-tabs');
  if (!el) return;
  const tabs = [
    { key: 'mom', label: 'شهر لشهر (MoM)' },
    { key: 'qoq', label: 'ربع لربع (QoQ)' },
    { key: 'yoy', label: 'سنة لسنة (YoY)' }
  ];
  el.innerHTML = tabs.map(t =>
    `<div class="tab ${_activeTab === t.key ? 'active' : ''}" onclick="window.__setCmpTab('${t.key}')">${escapeHtml(t.label)}</div>`
  ).join('');
}

export function setCmpTab(key) {
  _activeTab = key;
  renderTabs();
  renderActiveSection();
}

// ══════════════════ القسم النشط ══════════════════

function renderActiveSection() {
  const el = document.getElementById('cmp-active');
  if (!el) return;

  const data = _activeTab === 'mom' ? getMoM() : _activeTab === 'qoq' ? getQoQ() : getYoY();

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
            <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          ${escapeHtml(data.title)}
        </div>
        <div style="font-size:11px;color:var(--muted);text-align:left">
          ${escapeHtml(data.previousLabel)} → ${escapeHtml(data.currentLabel)}
        </div>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
          ${data.metrics.map(m => renderMetricCard(m)).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          مقارنة بصرية
        </div>
      </div>
      <div class="card-body"><div class="chart-box" style="min-height:220px"><canvas id="cmp-bar"></canvas></div></div>
    </div>
  `;

  setTimeout(() => {
    const labels = data.metrics.map(m => m.label);
    const currData = data.metrics.map(m => +m.current.toFixed(2));
    const prevData = data.metrics.map(m => +m.previous.toFixed(2));
    mkBar('cmp-bar', labels, [
      { label: 'الحالي', data: currData, backgroundColor: 'rgba(26,86,219,.85)', borderRadius: 6, borderSkipped: false },
      { label: 'السابق', data: prevData, backgroundColor: 'rgba(122,139,168,.5)', borderRadius: 6, borderSkipped: false }
    ]);
  }, 60);
}

function renderMetricCard(m) {
  const color = m.isPositive ? 'var(--green)' : m.isNegative ? 'var(--red)' : 'var(--muted)';
  const arrow = m.delta >= 0 ? '▲' : '▼';
  const sign = m.delta >= 0 ? '+' : '';
  return `
    <div style="padding:16px;background:var(--surface2);border-radius:12px;border:.5px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${escapeHtml(m.label)}</div>
      <div style="font-size:22px;font-weight:900;color:var(--text);margin-bottom:4px">${fmt(m.current)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--muted)">السابق: ${fmt(m.previous)}</span>
        <span style="font-size:13px;font-weight:900;color:${color};display:inline-flex;align-items:center;gap:4px">
          ${arrow} ${sign}${m.pct.toFixed(1)}%
        </span>
      </div>
      <div style="font-size:11px;color:${color};margin-top:6px;padding-top:6px;border-top:.5px dashed var(--border)">
        التغيير: <strong style="direction:ltr">${sign}${fmt(m.delta)}</strong>
      </div>
    </div>
  `;
}

// ══════════════════ الرسم الشهري ══════════════════

function renderMonthlyChart() {
  const stats = monthlyStats(12);
  if (!stats.length) return;
  setTimeout(() => {
    mkLine('cmp-monthly-chart', stats.map(s => s.label), [
      {
        label: 'دخل',
        data: stats.map(s => +s.income.toFixed(2)),
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13,148,136,0.08)',
        fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2
      },
      {
        label: 'مصروف',
        data: stats.map(s => +s.expense.toFixed(2)),
        borderColor: '#e11d48',
        backgroundColor: 'rgba(225,29,72,0.08)',
        fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2
      },
      {
        label: 'صافي',
        data: stats.map(s => +s.net.toFixed(2)),
        borderColor: '#1a56db',
        backgroundColor: 'rgba(26,86,219,0.08)',
        fill: false, tension: 0.35, pointRadius: 3, borderWidth: 2
      }
    ]);
  }, 60);
}

// ══════════════════ مقارنة الفئات ══════════════════

function renderCategoriesSection() {
  const now = new Date();
  // آخر 3 شهور vs الـ 3 السابقة
  const currStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
  const currEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 2, 0).toISOString().slice(0, 10);

  const comparison = categoryComparison(currStart, currEnd, prevStart, prevEnd);
  const { improvements, declines } = topChanges(comparison);

  const el = document.getElementById('cmp-categories');
  if (!el) return;

  el.innerHTML = `
    <div class="grid-2">
      ${renderTopChangesCard('أفضل التغييرات', improvements, true)}
      ${renderTopChangesCard('أحتاج مراجعة', declines, false)}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--teal-l);color:var(--teal)">
            <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          مقارنة الفئات (آخر 3 شهور vs الـ 3 السابقة)
        </div>
      </div>
      <div class="card-body no-pad">
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>الفئة</th>
              <th>النوع</th>
              <th style="text-align:left;direction:ltr">الحالي</th>
              <th style="text-align:left;direction:ltr">السابق</th>
              <th style="text-align:left;direction:ltr">التغيير</th>
              <th style="text-align:left;direction:ltr">%</th>
            </tr>
          </thead>
          <tbody>
            ${comparison.length ? comparison.map(c => `
              <tr>
                <td style="font-weight:700">${escapeHtml(c.category)}</td>
                <td><span class="badge badge-gray" style="font-size:9.5px">${escapeHtml(c.type)}</span></td>
                <td class="td-num" style="direction:ltr">${fmt(c.current)}</td>
                <td class="td-num" style="direction:ltr;color:var(--muted)">${fmt(c.previous)}</td>
                <td class="td-num ${c.delta >= 0 ? 'pos' : 'neg'}" style="direction:ltr;font-weight:800">${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}</td>
                <td class="td-num ${c.isPositive ? 'pos' : 'neg'}" style="direction:ltr;font-weight:800">${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(1)}%</td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">لا توجد بيانات كافية للمقارنة</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>
  `;
}

function renderTopChangesCard(title, items, isGood) {
  const color = isGood ? 'var(--green)' : 'var(--red)';
  const bg = isGood ? 'var(--green-l)' : 'var(--red-l)';
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">
        <div class="card-title-icon" style="background:${bg};color:${color}">
          <svg viewBox="0 0 24 24">${isGood ? '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>' : '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>'}</svg>
        </div>
        ${escapeHtml(title)}
      </div>
    </div>
    <div class="card-body">
      ${items.length ? items.map(c => `
        <div class="alloc-row" style="padding:10px 0">
          <div class="alloc-dot" style="background:${color}"></div>
          <div class="alloc-label">
            ${escapeHtml(c.category)}
            <div style="font-size:10px;color:var(--muted);font-weight:400">${escapeHtml(c.type)}</div>
          </div>
          <div style="text-align:left;direction:ltr">
            <div style="font-weight:900;font-size:13px;color:${color}">${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(1)}%</div>
            <div style="font-size:10.5px;color:var(--muted);direction:ltr">${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}</div>
          </div>
        </div>
      `).join('') : `<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">لا توجد بيانات كافية</div>`}
    </div>
  </div>`;
}
