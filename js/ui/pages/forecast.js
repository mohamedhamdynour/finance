// ══════════════════════════════════════════════════════════════════
//  pages/forecast.js — صفحة التوقعات
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../../state.js';
import { N2, fmt, fmtN, escapeHtml } from '../../core/utils.js';
import { kpi, svgIcon } from '../shared.js';
import { mkLine, mkBar } from '../charts.js';
import { calcTotals } from '../../domain/calc.js';
import { monthlyRates, forecastBalance, forecastGoals } from '../../domain/forecast.js';

// إعدادات المستخدم (محفوظة في APP_SETTINGS.forecast)
function getForecastSettings() {
  return APP_SETTINGS.forecast || {
    horizon: 12,          // أشهر
    monthlyContribution: null, // null = استخدم المعدل الفعلي
    expectedReturn: 15,   // % سنوي
    monthsBack: 6         // عدد الأشهر التاريخية للتحليل
  };
}

export function renderForecast() {
  const cfg = getForecastSettings();
  const T = calcTotals();
  const rates = monthlyRates(cfg.monthsBack);
  const forecast = forecastBalance(cfg.horizon, cfg);
  const goalsForecast = forecastGoals(cfg);
  const endBalance = forecast.projections[forecast.projections.length - 1]?.balance || T.grand;

  // ═══ KPIs ═══
  const growth = T.grand > 0 ? ((endBalance - T.grand) / T.grand) * 100 : 0;
  document.getElementById('fc-kpis').innerHTML =
    kpi('الرصيد الحالي', fmt(T.grand), 'نقطة البداية', 'var(--blue)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    kpi(`بعد ${cfg.horizon} شهر`, fmt(endBalance), (growth >= 0 ? '+' : '') + growth.toFixed(1) + '% نمو متوقع', growth >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'), growth) +
    kpi('صافي شهري متوقع', fmt(rates.avgNet), cfg.monthlyContribution !== null ? 'مخصص من إعداداتك' : 'من البيانات الفعلية', rates.avgNet >= 0 ? 'var(--teal)' : 'var(--red)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('متوسط الدخل الشهري', fmt(rates.avgIn), `آخر ${cfg.monthsBack} أشهر`, 'var(--green)', svgIcon('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>')) +
    kpi('متوسط المصروف الشهري', fmt(rates.avgOut), `آخر ${cfg.monthsBack} أشهر`, 'var(--red)', svgIcon('<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>'));

  // ═══ المحتوى ═══
  document.getElementById('fc-content').innerHTML = `
    <!-- الإعدادات -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82"/></svg>
        </div>
        إعدادات التوقع
      </div></div>
      <div class="card-body">
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">الأفق (شهور)</label>
            <select class="form-control" id="fc-horizon" onchange="saveForecastSettings()">
              <option value="3" ${cfg.horizon === 3 ? 'selected' : ''}>3 أشهر</option>
              <option value="6" ${cfg.horizon === 6 ? 'selected' : ''}>6 أشهر</option>
              <option value="12" ${cfg.horizon === 12 ? 'selected' : ''}>سنة</option>
              <option value="24" ${cfg.horizon === 24 ? 'selected' : ''}>سنتان</option>
              <option value="36" ${cfg.horizon === 36 ? 'selected' : ''}>3 سنوات</option>
              <option value="60" ${cfg.horizon === 60 ? 'selected' : ''}>5 سنوات</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">العائد السنوي المتوقع %</label>
            <input class="form-control" type="number" step="0.1" id="fc-return" value="${cfg.expectedReturn}" onchange="saveForecastSettings()">
            <div class="form-hint">للسوق المصري: 15-25% معقول</div>
          </div>
          <div class="form-group">
            <label class="form-label">شهور التحليل التاريخي</label>
            <input class="form-control" type="number" min="1" max="24" id="fc-months-back" value="${cfg.monthsBack}" onchange="saveForecastSettings()">
          </div>
        </div>
        <div class="form-group" style="margin-top:8px">
          <label class="form-label">مساهمة شهرية مخصصة (اختياري)</label>
          <input class="form-control" type="number" step="0.01" id="fc-contribution"
                 value="${cfg.monthlyContribution !== null ? cfg.monthlyContribution : ''}"
                 placeholder="اتركه فارغاً لاستخدام المعدل الفعلي: ${fmtN(rates.avgNet)}"
                 onchange="saveForecastSettings()">
          <div class="form-hint">حدد مبلغاً تريد ادخاره شهرياً لرؤية السيناريو</div>
        </div>
      </div>
    </div>

    <!-- الرسم البياني الرئيسي -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--green-l);color:var(--green)">
          <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        منحنى الرصيد المتوقع (${cfg.horizon} شهر)
      </div></div>
      <div class="card-body">
        <div class="chart-box" style="min-height:280px"><canvas id="fc-line"></canvas></div>
      </div>
    </div>

    <!-- تحليل التاريخ -->
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--green-l);color:var(--green)">
            <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
          </div>
          أعلى مصادر الدخل (آخر ${cfg.monthsBack} أشهر)
        </div></div>
        <div class="card-body">
          ${rates.topIn.length ? rates.topIn.map(([cat, val]) => `
            <div class="alloc-row">
              <div class="alloc-dot" style="background:var(--green)"></div>
              <div class="alloc-label">${escapeHtml(cat)}</div>
              <div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(100, val / Math.max(1, rates.totalIn) * 100)}%;background:var(--green)"></div></div></div>
              <div class="alloc-pct">${((val / Math.max(1, rates.totalIn)) * 100).toFixed(1)}%</div>
              <div class="alloc-val">${fmt(val)}</div>
            </div>
          `).join('') : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px">لا توجد بيانات</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--red-l);color:var(--red)">
            <svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>
          </div>
          أعلى أوجه الصرف (آخر ${cfg.monthsBack} أشهر)
        </div></div>
        <div class="card-body">
          ${rates.topOut.length ? rates.topOut.map(([cat, val]) => `
            <div class="alloc-row">
              <div class="alloc-dot" style="background:var(--red)"></div>
              <div class="alloc-label">${escapeHtml(cat)}</div>
              <div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(100, val / Math.max(1, rates.totalOut) * 100)}%;background:var(--red)"></div></div></div>
              <div class="alloc-pct">${((val / Math.max(1, rates.totalOut)) * 100).toFixed(1)}%</div>
              <div class="alloc-val">${fmt(val)}</div>
            </div>
          `).join('') : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px">لا توجد بيانات</div>'}
        </div>
      </div>
    </div>

    <!-- توقع الأهداف -->
    ${goalsForecast.length ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          </div>
          وقت الوصول للأهداف
        </div></div>
        <div class="card-body">
          ${goalsForecast.map(gf => renderGoalForecast(gf)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- جدول التوقعات الشهرية -->
    <div class="card">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg>
        </div>
        تفصيل شهري
      </div></div>
      <div class="card-body no-pad">
        <div class="table-wrap"><table>
          <thead><tr>
            <th>الشهر</th>
            <th style="text-align:left;direction:ltr">المساهمة</th>
            <th style="text-align:left;direction:ltr">النمو المتوقع</th>
            <th style="text-align:left;direction:ltr">الرصيد المتوقع</th>
            <th style="text-align:left;direction:ltr">التغيير</th>
          </tr></thead>
          <tbody>
            ${forecast.projections.filter(p => p.month > 0).map((p, i, arr) => {
              const prev = forecast.projections[p.month - 1];
              const diff = p.balance - prev.balance;
              return `<tr>
                <td style="font-weight:700">${escapeHtml(p.label)}</td>
                <td class="td-num ${p.contribution >= 0 ? 'pos' : 'neg'}" style="direction:ltr">${p.contribution >= 0 ? '+' : ''}${fmt(p.contribution)}</td>
                <td class="td-num pos" style="direction:ltr">+${fmt(p.growth)}</td>
                <td class="td-num" style="direction:ltr;font-weight:800">${fmt(p.balance)}</td>
                <td class="td-num pos" style="direction:ltr">+${fmt(diff)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    </div>
  `;

  // ═══ الرسم البياني ═══
  setTimeout(() => {
    const labels = forecast.projections.map(p => p.label);
    mkLine('fc-line', labels, [
      {
        label: 'الرصيد المتوقع',
        data: forecast.projections.map(p => +p.balance.toFixed(2)),
        borderColor: '#1a56db',
        backgroundColor: 'rgba(26,86,219,0.1)',
        fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2.5
      }
    ]);
  }, 60);
}

function renderGoalForecast(gf) {
  const { goal, reached, months, date, impossible } = gf;
  let statusHtml = '';
  let statusColor = 'var(--blue)';

  if (reached) {
    statusHtml = `<span style="color:var(--green);font-weight:800">✓ تم تحقيق الهدف</span>`;
    statusColor = 'var(--green)';
  } else if (impossible) {
    statusHtml = `<span style="color:var(--red);font-weight:800">⚠️ غير قابل للتحقيق بالمعدل الحالي</span>`;
    statusColor = 'var(--red)';
  } else {
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    const timeLabel = years > 0
      ? `${years} سنة${remMonths > 0 ? ' و ' + remMonths + ' شهر' : ''}`
      : `${months} شهر`;
    statusHtml = `<span style="color:${statusColor};font-weight:800">${timeLabel}</span><br><span style="font-size:10.5px;color:var(--muted)">${date}</span>`;
  }

  return `<div class="alloc-row" style="padding:12px 0;border-bottom:.5px solid var(--border)">
    <div style="flex:1;min-width:0">
      <div style="font-weight:800;font-size:13px">${escapeHtml(goal.name)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">المستهدف: ${fmt(goal.target)}</div>
    </div>
    <div style="text-align:left;direction:ltr">${statusHtml}</div>
  </div>`;
}

// ══════════════════════ Actions ══════════════════════

export async function saveForecastSettings() {
  const horizon = +document.getElementById('fc-horizon').value || 12;
  const expectedReturn = N2(document.getElementById('fc-return').value);
  const monthsBack = +document.getElementById('fc-months-back').value || 6;
  const contribRaw = document.getElementById('fc-contribution').value.trim();
  const monthlyContribution = contribRaw === '' ? null : N2(contribRaw);

  APP_SETTINGS.forecast = { horizon, expectedReturn, monthsBack, monthlyContribution };

  // حفظ
  const { persistAppSettings } = await import('../../core/settings.js');
  await persistAppSettings();

  // إعادة رسم
  renderForecast();
}
