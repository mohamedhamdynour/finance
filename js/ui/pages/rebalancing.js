// ══════════════════════════════════════════════════════════════════
//  pages/rebalancing.js — إعادة توازن المحفظة
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../../state.js';
import { N2, fmt, escapeHtml } from '../../core/utils.js';
import { toast } from '../toast.js';
import { kpi, svgIcon } from '../shared.js';
import { calcTotals } from '../../domain/calc.js';
import { persistAppSettings } from '../../core/settings.js';

const CATEGORIES = [
  { key: 'banks',  label: 'البنوك والنقد',     color: 'var(--teal)',   icon: '🏦' },
  { key: 'stocks', label: 'الأسهم والصناديق', color: 'var(--green)',  icon: '📈' },
  { key: 'metals', label: 'المعادن الثمينة',   color: 'var(--gold)',   icon: '🥇' },
  { key: 'certs',  label: 'الشهادات الادخارية', color: 'var(--purple)', icon: '📜' }
];

function getRebalanceData() {
  const T = calcTotals();
  const grand = T.grand;
  const cfg = APP_SETTINGS.rebalancing || { targets: { banks: 25, stocks: 45, metals: 20, certs: 10 }, threshold: 5 };
  const actual = { banks: T.totalBanks, stocks: T.stocksVal, metals: T.metalsVal, certs: T.certsTotal };

  const rows = CATEGORIES.map(cat => {
    const targetPct = N2(cfg.targets[cat.key]);
    const actualVal = actual[cat.key] || 0;
    const actualPct = grand > 0 ? (actualVal / grand) * 100 : 0;
    const diffPct = actualPct - targetPct;
    const targetVal = grand * targetPct / 100;
    const diffVal = actualVal - targetVal;
    return { ...cat, targetPct, actualPct, actualVal, targetVal, diffPct, diffVal };
  });

  const maxDeviation = rows.reduce((max, r) => Math.max(max, Math.abs(r.diffPct)), 0);
  const threshold = N2(cfg.threshold) || 5;
  const balanced = maxDeviation <= threshold;
  const totalToSell = rows.filter(r => r.diffVal > 0).reduce((a, r) => a + r.diffVal, 0);
  const totalToBuy = rows.filter(r => r.diffVal < 0).reduce((a, r) => a + Math.abs(r.diffVal), 0);

  return { rows, maxDeviation, threshold, balanced, totalToSell, totalToBuy, grand };
}

export function renderRebalancing() {
  const { rows, maxDeviation, threshold, balanced, totalToSell, totalToBuy, grand } = getRebalanceData();

  document.getElementById('rb-kpis').innerHTML =
    kpi('حالة التوازن', balanced ? 'متوازنة ✓' : 'تحتاج تعديل',
        balanced ? `أقصى انحراف ${maxDeviation.toFixed(1)}% (ضمن الحد)` : `أقصى انحراف ${maxDeviation.toFixed(1)}% (الحد ${threshold}%)`,
        balanced ? 'var(--green)' : 'var(--gold)',
        svgIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>')) +
    kpi('إجمالي للبيع', fmt(totalToSell), 'من الفئات الزائدة', 'var(--red)', svgIcon('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>')) +
    kpi('إجمالي للشراء', fmt(totalToBuy), 'في الفئات الناقصة', 'var(--green)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('إجمالي المحفظة', fmt(grand), 'القيمة الكاملة', 'var(--blue)', svgIcon('<circle cx="12" cy="12" r="10"/>'));

  // ─── إعدادات الأهداف ───
  const cfg = APP_SETTINGS.rebalancing || { targets: { banks: 25, stocks: 45, metals: 20, certs: 10 }, threshold: 5 };
  const sumTargets = CATEGORIES.reduce((a, c) => a + N2(cfg.targets[c.key]), 0);

  document.getElementById('rb-targets').innerHTML = CATEGORIES.map(cat => `
    <div class="form-group" style="margin-bottom:10px">
      <label class="form-label" style="color:${cat.color}">${cat.icon} ${escapeHtml(cat.label)}</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="form-control" type="number" min="0" max="100" step="1"
               id="rbt-${cat.key}" value="${cfg.targets[cat.key] || 0}"
               oninput="updateRebalanceSum()"
               style="direction:ltr;text-align:center;font-weight:700">
        <span style="font-size:16px;font-weight:900;color:var(--muted)">%</span>
      </div>
    </div>
  `).join('') + `
    <div class="form-divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px">
      <span style="color:var(--muted);font-weight:700">المجموع:</span>
      <span id="rb-sum" style="font-weight:900;font-size:16px;color:${Math.abs(sumTargets - 100) < 0.01 ? 'var(--green)' : 'var(--red)'}">${sumTargets}%</span>
    </div>
    <div class="form-group" style="margin-top:8px">
      <label class="form-label">حد الانحراف المسموح</label>
      <input class="form-control" type="number" min="0" max="50" step="0.5"
             id="rbt-threshold" value="${cfg.threshold || 5}"
             style="direction:ltr;text-align:center;font-weight:700">
      <div class="form-hint">إذا انحرفت فئة أكثر من هذا الحد، يظهر تنبيه</div>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveRebalanceTargets()">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> حفظ الأهداف
    </button>
  `;

  // ─── الجدول ───
  document.getElementById('rb-table').innerHTML = `
    <thead>
      <tr>
        <th style="min-width:150px">الفئة</th>
        <th style="text-align:left;direction:ltr;min-width:100px">القيمة الحالية</th>
        <th style="text-align:left;direction:ltr">الحالي %</th>
        <th style="text-align:left;direction:ltr">المستهدف %</th>
        <th style="text-align:left;direction:ltr;min-width:100px">الانحراف</th>
        <th style="text-align:left;direction:ltr;min-width:120px">المقترح</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => {
        const over = r.diffPct > threshold;
        const under = r.diffPct < -threshold;
        const statusColor = over ? 'var(--red)' : under ? 'var(--green)' : 'var(--muted)';
        const statusLabel = over ? 'زائد' : under ? 'ناقص' : 'متوازن';
        const suggestion = Math.abs(r.diffVal) < 1
          ? '<span style="color:var(--muted)">—</span>'
          : (r.diffVal > 0
              ? `<span style="color:var(--red);font-weight:800">بِع ${fmt(r.diffVal)}</span>`
              : `<span style="color:var(--green);font-weight:800">اشترِ ${fmt(Math.abs(r.diffVal))}</span>`);
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:18px">${r.icon}</span>
                <div>
                  <div style="font-weight:800;font-size:13px">${escapeHtml(r.label)}</div>
                  <div style="font-size:10px;color:${statusColor};font-weight:700">${statusLabel} (${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(1)}%)</div>
                </div>
              </div>
            </td>
            <td class="td-num" style="direction:ltr;font-weight:700">${fmt(r.actualVal)}</td>
            <td class="td-num" style="direction:ltr">${r.actualPct.toFixed(1)}%</td>
            <td class="td-num" style="direction:ltr;color:var(--blue);font-weight:700">${r.targetPct.toFixed(1)}%</td>
            <td class="td-num ${r.diffVal >= 0 ? 'neg' : 'pos'}" style="direction:ltr;font-weight:800">${r.diffVal >= 0 ? '+' : ''}${fmt(r.diffVal)}</td>
            <td class="td-num" style="direction:ltr">${suggestion}</td>
          </tr>`;
      }).join('')}
    </tbody>`;

  renderRebalanceCalculator();
}

export function updateRebalanceSum() {
  const sum = CATEGORIES.reduce((a, c) => a + N2(document.getElementById('rbt-' + c.key).value), 0);
  const el = document.getElementById('rb-sum');
  if (el) {
    el.textContent = sum + '%';
    el.style.color = Math.abs(sum - 100) < 0.01 ? 'var(--green)' : 'var(--red)';
  }
}

export async function saveRebalanceTargets() {
  const targets = {};
  CATEGORIES.forEach(c => { targets[c.key] = N2(document.getElementById('rbt-' + c.key).value); });
  const sum = Object.values(targets).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) return alert(`مجموع النسب يجب أن يكون 100% (المجموع الحالي: ${sum}%)`);

  const threshold = N2(document.getElementById('rbt-threshold').value) || 5;
  APP_SETTINGS.rebalancing = { targets, threshold };
  await persistAppSettings();
  toast('تم حفظ الأهداف');
  renderRebalancing();
}

export function renderRebalanceCalculator() {
  const amountEl = document.getElementById('rb-amount');
  const resultEl = document.getElementById('rb-calculator-result');
  if (!amountEl || !resultEl) return;
  const amount = N2(amountEl.value);
  if (!amount || amount <= 0) { resultEl.innerHTML = ''; return; }

  const { rows } = getRebalanceData();
  const missing = rows.filter(r => r.targetPct > r.actualPct);
  const totalMissing = missing.reduce((a, r) => a + (r.targetPct - r.actualPct), 0);

  if (totalMissing <= 0) {
    resultEl.innerHTML = `<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">المحفظة متوازنة — لا توجد فئات ناقصة</div>`;
    return;
  }

  resultEl.innerHTML = missing.map(r => {
    const share = (r.targetPct - r.actualPct) / totalMissing;
    const suggestAmount = amount * share;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${r.icon}</span>
          <div>
            <div style="font-weight:800;font-size:13px">${escapeHtml(r.label)}</div>
            <div style="font-size:10.5px;color:var(--muted)">ناقص ${(r.targetPct - r.actualPct).toFixed(1)}%</div>
          </div>
        </div>
        <div style="text-align:left;direction:ltr">
          <div style="font-weight:900;font-size:15px;color:var(--green)">${fmt(suggestAmount)}</div>
          <div style="font-size:10px;color:var(--muted)">${(share * 100).toFixed(0)}% من المبلغ</div>
        </div>
      </div>`;
  }).join('');
}
