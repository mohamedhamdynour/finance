// ══════════════════════════════════════════════════════════════════
//  pages/risk.js — تحليل مخاطر المحفظة
// ══════════════════════════════════════════════════════════════════
import { DB } from '../../state.js';
import { N2, fmt, fmtN, escapeHtml } from '../../core/utils.js';
import { kpi, svgIcon } from '../shared.js';
import { mkPie, mkBar, mkHBar, paletteColors } from '../charts.js';
import { calcTotals } from '../../domain/calc.js';
import {
  concentrationAnalysis, diversificationScore, historicalRisk,
  riskAlerts, pnlByCategory, hhiLabel
} from '../../domain/risk.js';

const SEVERITY_STYLE = {
  high:   { bg: 'var(--red-l)',    border: 'var(--red)',    icon: '⚠️', color: 'var(--red)' },
  medium: { bg: 'var(--gold-l)',   border: 'var(--gold)',   icon: '⚡', color: 'var(--gold)' },
  low:    { bg: 'var(--blue-l)',   border: 'var(--blue)',   icon: 'ℹ️', color: 'var(--blue)' }
};

export function renderRisk() {
  const T = calcTotals();
  const conc = concentrationAnalysis();
  const div = diversificationScore();
  const hist = historicalRisk();
  const alerts = riskAlerts();

  if (T.grand <= 0) {
    document.getElementById('risk-kpis').innerHTML = '';
    document.getElementById('risk-content').innerHTML = `
      <div class="empty-state" style="padding:64px;text-align:center">
        <p style="font-size:15px;font-weight:700">لا توجد بيانات كافية للتحليل</p>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">أضف بنوك، أسهم، معادن، أو شهادات أولاً</p>
      </div>`;
    return;
  }

  // ═══ KPIs ═══
  const hhiInfo = hhiLabel(conc.hhi);
  const divScore = div.score;
  const divColor = divScore >= 70 ? 'var(--green)' : divScore >= 50 ? 'var(--teal)' : divScore >= 30 ? 'var(--gold)' : 'var(--red)';
  const divLabel = divScore >= 70 ? 'ممتاز' : divScore >= 50 ? 'جيد' : divScore >= 30 ? 'متوسط' : 'ضعيف';

  document.getElementById('risk-kpis').innerHTML =
    kpi('درجة التنويع', divScore + '/100', divLabel, divColor, svgIcon('<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>')) +
    kpi('مؤشر التركيز (HHI)', Math.round(conc.hhi), hhiInfo.label, hhiInfo.color, svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>')) +
    kpi('أكبر حصة', conc.maxAsset ? (conc.maxAsset.weight * 100).toFixed(1) + '%' : '—', conc.maxAsset ? escapeHtml(conc.maxAsset.symbol) : '', conc.maxAsset && conc.maxAsset.weight > 0.25 ? 'var(--red)' : 'var(--blue)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('أكبر 3 أصول', conc.top3Pct.toFixed(1) + '%', 'من إجمالي المحفظة', conc.top3Pct > 60 ? 'var(--gold)' : 'var(--teal)', svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')) +
    (hist.hasData ? kpi('Sharpe Ratio', hist.sharpe.toFixed(2), hist.sharpe >= 1 ? 'ممتاز' : hist.sharpe >= 0.5 ? 'جيد' : 'ضعيف', hist.sharpe >= 1 ? 'var(--green)' : hist.sharpe >= 0.5 ? 'var(--teal)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) : '') +
    (hist.hasData ? kpi('أقصى تراجع', (hist.maxDrawdown * 100).toFixed(1) + '%', 'من أعلى قمة', hist.maxDrawdown > -0.2 ? 'var(--gold)' : 'var(--red)', svgIcon('<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>')) : '');

  // ═══ التنبيهات ═══
  let alertsHtml = '';
  if (alerts.length) {
    alertsHtml = `<div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--gold-l);color:var(--gold)">
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        تنبيهات المخاطر (${alerts.length})
      </div></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
        ${alerts.map(a => {
          const s = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low;
          return `<div style="display:flex;gap:12px;padding:12px 14px;background:${s.bg};border:.5px solid ${s.border}33;border-radius:10px;align-items:flex-start">
            <div style="font-size:20px;flex-shrink:0">${s.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:13px;color:${s.color}">${escapeHtml(a.title)}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.5">${escapeHtml(a.body)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  } else {
    alertsHtml = `<div class="card" style="margin-bottom:16px;border-right:3px solid var(--green)">
      <div class="card-body" style="padding:14px 18px;display:flex;align-items:center;gap:12px">
        <div style="font-size:24px">✅</div>
        <div>
          <div style="font-weight:800;font-size:14px;color:var(--green)">لا توجد تنبيهات — محفظتك متوازنة</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">جميع مؤشرات المخاطر داخل الحدود الآمنة</div>
        </div>
      </div>
    </div>`;
  }

  // ═══ محتوى الصفحة ═══
  document.getElementById('risk-content').innerHTML = alertsHtml + `

    <!-- Charts Row 1 -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
            <svg viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/></svg>
          </div>
          توزيع الفئات
        </div></div>
        <div class="card-body"><div class="chart-box"><canvas id="risk-pie-cat"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </div>
          أكبر 10 أصول
        </div></div>
        <div class="card-body"><div class="chart-box"><canvas id="risk-hbar-assets"></canvas></div></div>
      </div>
    </div>

    <!-- درجة التنويع -->
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--green-l);color:var(--green)">
          <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        تفصيل درجة التنويع — ${div.score}/100
      </div></div>
      <div class="card-body">
        ${renderDivScore(div)}
      </div>
    </div>

    <!-- المخاطر التاريخية -->
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--gold-l);color:var(--gold)">
          <svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
        </div>
        المخاطر التاريخية
      </div></div>
      <div class="card-body">
        ${hist.hasData ? renderHistoricalRisk(hist) : renderHistoricalEmpty(hist)}
      </div>
    </div>

    <!-- PnL حسب الفئة -->
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--teal-l);color:var(--teal)">
          <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        أداء الفئات (PnL)
      </div></div>
      <div class="card-body">
        ${renderPnlByCat(pnlByCategory())}
      </div>
    </div>
  `;

  // ═══ رسوم بيانية ═══
  setTimeout(() => {
    // Pie: توزيع الفئات
    if (conc.byCategory.length) {
      mkPie('risk-pie-cat',
        conc.byCategory.map(c => c.label),
        conc.byCategory.map(c => c.value),
        conc.byCategory.map(c => c.color));
    }
    // HBar: أكبر 10 أصول
    const top10 = conc.assets.slice(0, 10);
    if (top10.length) {
      mkHBar('risk-hbar-assets',
        top10.map(a => a.symbol),
        top10.map(a => +a.value.toFixed(2)),
        top10.map(a => a.color));
    }
  }, 60);
}

// ══════════════════════ مساعدات العرض ══════════════════════

function renderDivScore(div) {
  const b = div.breakdown;
  const items = [
    { label: 'تنويع الفئات', sub: `${b.categories.count} فئات مختلفة`, score: b.categories.score, weight: b.categories.weight, color: 'var(--blue)' },
    { label: 'عدد الأصول', sub: `${b.assets.count} أصل في المحفظة`, score: b.assets.score, weight: b.assets.weight, color: 'var(--purple)' },
    { label: 'تركيز الأصول (HHI)', sub: `HHI = ${b.hhi.value}`, score: b.hhi.score, weight: b.hhi.weight, color: 'var(--teal)' }
  ];
  return items.map(it => `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div>
          <div style="font-weight:800;font-size:13px">${escapeHtml(it.label)}</div>
          <div style="font-size:11px;color:var(--muted)">${escapeHtml(it.sub)} • الوزن ${it.weight}%</div>
        </div>
        <div style="font-weight:900;font-size:18px;color:${it.color}">${it.score}</div>
      </div>
      <div class="prog-wrap" style="height:8px">
        <div class="prog-bar" style="width:${it.score}%;background:${it.color}"></div>
      </div>
    </div>
  `).join('');
}

function renderHistoricalRisk(hist) {
  const formatPct = v => (v * 100).toFixed(2) + '%';
  const sharpeColor = hist.sharpe >= 1 ? 'var(--green)' : hist.sharpe >= 0.5 ? 'var(--teal)' : hist.sharpe >= 0 ? 'var(--gold)' : 'var(--red)';
  const ddColor = hist.maxDrawdown > -0.1 ? 'var(--green)' : hist.maxDrawdown > -0.2 ? 'var(--gold)' : 'var(--red)';
  const varColor = Math.abs(hist.var95) < 0.02 ? 'var(--green)' : Math.abs(hist.var95) < 0.05 ? 'var(--gold)' : 'var(--red)';

  return `
    <div class="form-hint" style="margin-bottom:14px">
      محسوبة من ${hist.count} snapshot (${hist.returns} عائد يومي). محاكاة سنوية على أساس 252 يوم تداول.
      <br>معدل خالٍ من المخاطر المستخدم: ${(hist.riskFree * 100).toFixed(0)}% سنوياً (تقريبي للسوق المصري).
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      ${riskMetricCard('Sharpe Ratio', hist.sharpe.toFixed(2), 'عائد لكل وحدة مخاطرة', sharpeColor, '>1 ممتاز')}
      ${riskMetricCard('Sortino Ratio', hist.sortino.toFixed(2), 'يركّز على المخاطر السلبية', hist.sortino >= 1 ? 'var(--green)' : 'var(--gold)', '>1 ممتاز')}
      ${riskMetricCard('Max Drawdown', formatPct(hist.maxDrawdown), `${hist.maxDrawdownStart} → ${hist.maxDrawdownEnd}`, ddColor, '> -10% جيد')}
      ${riskMetricCard('التقلب السنوي', formatPct(hist.annualStd), 'الانحراف المعياري السنوي', hist.annualStd < 0.2 ? 'var(--green)' : hist.annualStd < 0.35 ? 'var(--gold)' : 'var(--red)', '< 20% منخفض')}
      ${riskMetricCard('العائد السنوي', formatPct(hist.annualMean), 'المتوسط السنوي المتوقع', hist.annualMean > 0 ? 'var(--green)' : 'var(--red)', hist.annualMean > 0.2 ? '> 20% جيد' : '')}
      ${riskMetricCard('VaR 95% (يومي)', formatPct(hist.var95), `≈ ${fmt(hist.var95Value)} خسارة متوقعة`, varColor, 'أقصى خسارة يومية بـ 95% ثقة')}
      ${riskMetricCard('CVaR 95% (يومي)', formatPct(hist.cvar95), `≈ ${fmt(hist.cvar95Value)} في أسوأ 5%`, 'var(--red)', 'متوسط الخسائر عند تجاوز VaR')}
    </div>
  `;
}

function riskMetricCard(title, value, sub, color, hint) {
  return `<div style="padding:14px;background:var(--surface2);border-radius:10px;border:.5px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${escapeHtml(title)}</div>
    <div style="font-weight:900;font-size:22px;color:${color};direction:ltr;text-align:left">${escapeHtml(value)}</div>
    <div style="font-size:11.5px;color:var(--text2);margin-top:4px;line-height:1.4">${escapeHtml(sub)}</div>
    ${hint ? `<div style="font-size:10px;color:var(--muted);margin-top:6px;padding-top:6px;border-top:.5px dashed var(--border)">${escapeHtml(hint)}</div>` : ''}
  </div>`;
}

function renderHistoricalEmpty(hist) {
  return `<div style="text-align:center;padding:24px 12px">
    <div style="font-size:32px;margin-bottom:8px">📊</div>
    <div style="font-weight:800;font-size:13px;color:var(--text);margin-bottom:4px">تحتاج إلى بيانات تاريخية أكثر</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.6">
      لديك حالياً <strong>${hist.count || 0}</strong> snapshot. تحتاج إلى <strong>${hist.needed || 5}</strong> على الأقل لحساب التقلب وSharpe وVaR.
      <br>Snapshots تُحفظ تلقائياً عند كل فتح للتطبيق — انتظر بضعة أيام.
    </div>
  </div>`;
}

function renderPnlByCat(items) {
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${items.map(it => {
      const pos = it.value >= 0;
      const pctLabel = it.pct !== null ? ` (${pos ? '+' : ''}${it.pct.toFixed(1)}%)` : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--surface2);border-radius:10px;border-right:3px solid ${it.color}">
        <div>
          <div style="font-weight:800;font-size:13px">${escapeHtml(it.label)}</div>
          <div style="font-size:11px;color:var(--muted)">${it.cost > 0 ? 'رأس المال: ' + fmt(it.cost) : ''}</div>
        </div>
        <div style="text-align:left;direction:ltr">
          <div style="font-weight:900;font-size:15px;color:${pos ? 'var(--green)' : 'var(--red)'}">${pos ? '+' : ''}${fmt(it.value)}</div>
          ${pctLabel ? `<div style="font-size:10.5px;color:${pos ? 'var(--green)' : 'var(--red)'};font-weight:700">${pctLabel}</div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
