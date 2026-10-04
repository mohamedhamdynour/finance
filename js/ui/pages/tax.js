// ══════════════════════════════════════════════════════════════════
//  pages/tax.js — صفحة الضرائب
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, fmtN, escapeHtml } from '../../core/utils.js';
import { toast } from '../toast.js';
import { kpi, svgIcon } from '../shared.js';
import { capitalGainsTax, dividendTax, interestTax, annualTaxReport, availableYears, getTaxSettings, saveTaxSettings } from '../../domain/tax.js';
import { persistAppSettings } from '../../core/settings.js';

let _selectedYear = new Date().getFullYear();

export function renderTax() {
  const years = availableYears();
  if (years.length && !years.includes(String(_selectedYear))) _selectedYear = +years[0] || new Date().getFullYear();

  const report = annualTaxReport(_selectedYear);

  // KPIs
  document.getElementById('tax-kpis').innerHTML =
    kpi('السنة المالية', _selectedYear, `${years.length} سنة متوفرة`, 'var(--blue)', svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>')) +
    kpi('إجمالي الضريبة', fmt(report.totalTax), 'على كل الأنشطة', 'var(--red)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>')) +
    kpi('أرباح رأسمالية', fmt(report.capitalGains.totals.netProfit), `${report.capitalGains.totals.salesCount} عملية بيع`, report.capitalGains.totals.netProfit >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('توزيعات مستلمة', fmt(report.dividends.totals.grossTotal), `${report.dividends.totals.count} توزيع`, 'var(--purple)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>'));

  // Selector + Settings
  const yearsOpts = years.map(y => `<option value="${y}" ${+y === _selectedYear ? 'selected' : ''}>${y}</option>`).join('');

  document.getElementById('tax-content').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:14px 18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;color:var(--muted);font-weight:700">السنة المالية:</span>
            <select class="period-select" onchange="window.__taxSetYear(this.value)" style="min-width:120px">
              ${yearsOpts || `<option>${_selectedYear}</option>`}
            </select>
          </div>
          <button class="btn btn-outline btn-sm" onclick="window.__toggleTaxSettings()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82"/></svg>
            إعدادات النسب
          </button>
        </div>
        <div id="tax-settings" class="hidden" style="margin-top:12px;padding-top:12px;border-top:.5px solid var(--border)"></div>
      </div>
    </div>

    <!-- Breakdown -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">
        <div class="card-title-icon" style="background:var(--red-l);color:var(--red)">
          <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        تفصيل الضريبة حسب النشاط
      </div></div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:10px">
          ${report.breakdown.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--surface2);border-radius:10px;border-right:3px solid ${b.color}">
              <div>
                <div style="font-weight:800;font-size:13px">${escapeHtml(b.label)}</div>
                <div style="font-size:11px;color:var(--muted)">النسبة المطبقة: ${b.rate}%</div>
              </div>
              <div style="font-weight:900;font-size:16px;color:${b.color};direction:ltr">${fmtN(b.value, 2)}</div>
            </div>
          `).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:var(--red-l);border-radius:10px;border:1px solid var(--red)">
            <div style="font-weight:900;font-size:14px;color:var(--red-d)">الإجمالي المستحق</div>
            <div style="font-weight:900;font-size:20px;color:var(--red);direction:ltr">${fmtN(report.totalTax, 2)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Capital Gains Table -->
    ${report.capitalGains.rows.length ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
            <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
          </div>
          صفقات البيع (${report.capitalGains.rows.length})
        </div></div>
        <div class="card-body no-pad"><div class="table-wrap"><table>
          <thead><tr>
            <th>التاريخ</th><th>الكود</th><th>الكمية</th><th style="text-align:left;direction:ltr">سعر البيع</th>
            <th style="text-align:left;direction:ltr">صافي البيع</th><th style="text-align:left;direction:ltr">الربح/الخسارة</th>
            <th style="text-align:left;direction:ltr">الضريبة</th>
          </tr></thead>
          <tbody>
            ${report.capitalGains.rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td class="td-sym">${escapeHtml(r.symbol)}</td>
                <td class="td-num">${fmtN(r.quantity, 2)}</td>
                <td class="td-num" style="direction:ltr">${fmtN(r.sellPrice, 2)}</td>
                <td class="td-num" style="direction:ltr">${fmtN(r.net, 2)}</td>
                <td class="td-num ${r.profit >= 0 ? 'pos' : 'neg'}" style="direction:ltr">${r.profit >= 0 ? '+' : ''}${fmtN(r.profit, 2)}</td>
                <td class="td-num ${r.tax > 0 ? 'neg' : ''}" style="direction:ltr">${fmtN(r.tax, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>
      </div>
    ` : ''}

    <!-- Dividends Table -->
    ${report.dividends.rows.length ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/></svg>
          </div>
          التوزيعات (${report.dividends.rows.length})
        </div></div>
        <div class="card-body no-pad"><div class="table-wrap"><table>
          <thead><tr>
            <th>التاريخ</th><th>الكود</th>
            <th style="text-align:left;direction:ltr">الإجمالي</th>
            <th style="text-align:left;direction:ltr">الضريبة (${report.dividends.rate}%)</th>
            <th style="text-align:left;direction:ltr">الصافي</th>
          </tr></thead>
          <tbody>
            ${report.dividends.rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td class="td-sym">${escapeHtml(r.symbol)}</td>
                <td class="td-num" style="direction:ltr">${fmtN(r.gross, 2)}</td>
                <td class="td-num neg" style="direction:ltr">${fmtN(r.tax, 2)}</td>
                <td class="td-num pos" style="direction:ltr">${fmtN(r.net, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>
      </div>
    ` : ''}

    <!-- Interest Table -->
    ${report.interest.rows.length ? `
      <div class="card">
        <div class="card-header"><div class="card-title">
          <div class="card-title-icon" style="background:var(--gold-l);color:var(--gold)">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          عوائد الشهادات (${report.interest.rows.length})
        </div></div>
        <div class="card-body no-pad"><div class="table-wrap"><table>
          <thead><tr>
            <th>التاريخ</th><th>المصدر</th>
            <th style="text-align:left;direction:ltr">الإجمالي</th>
            <th style="text-align:left;direction:ltr">الضريبة</th>
            <th style="text-align:left;direction:ltr">الصافي</th>
          </tr></thead>
          <tbody>
            ${report.interest.rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td>${escapeHtml(r.source)}</td>
                <td class="td-num" style="direction:ltr">${fmtN(r.gross, 2)}</td>
                <td class="td-num ${r.tax > 0 ? 'neg' : ''}" style="direction:ltr">${fmtN(r.tax, 2)}</td>
                <td class="td-num pos" style="direction:ltr">${fmtN(r.net, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>
      </div>
    ` : ''}

    ${!report.capitalGains.rows.length && !report.dividends.rows.length && !report.interest.rows.length ? `
      <div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)">
        <p>لا توجد أحداث خاضعة للضريبة في ${_selectedYear}</p>
      </div>
    ` : ''}
  `;

  renderTaxSettingsPanel();
}

function renderTaxSettingsPanel() {
  const el = document.getElementById('tax-settings');
  if (!el) return;
  const cfg = getTaxSettings();

  el.innerHTML = `
    <div class="form-row-3">
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label" style="font-size:10px">ضريبة أرباح رأس المال %</label>
        <input class="form-control" type="number" step="0.01" id="tax-cg" value="${cfg.stockCapitalGainsRate}">
        <div class="form-hint" style="font-size:10px">EGX: معفاة (0%)</div>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label" style="font-size:10px">ضريبة التوزيعات %</label>
        <input class="form-control" type="number" step="0.01" id="tax-div" value="${cfg.stockDividendRate}">
        <div class="form-hint" style="font-size:10px">مصر: 10%</div>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label" style="font-size:10px">ضريبة عوائد الشهادات %</label>
        <input class="form-control" type="number" step="0.01" id="tax-cert" value="${cfg.certInterestRate}">
        <div class="form-hint" style="font-size:10px">معفاة عادة</div>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" style="width:100%" onclick="window.__saveTaxRates()">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> حفظ النسب
    </button>
  `;
}

export function installTaxHandlers() {
  window.__taxSetYear = (y) => { _selectedYear = +y; renderTax(); };

  window.__toggleTaxSettings = () => {
    const el = document.getElementById('tax-settings');
    if (el) el.classList.toggle('hidden');
  };

  window.__saveTaxRates = async () => {
    const cfg = {
      stockCapitalGainsRate: N2(document.getElementById('tax-cg').value),
      stockDividendRate: N2(document.getElementById('tax-div').value),
      certInterestRate: N2(document.getElementById('tax-cert').value)
    };
    saveTaxSettings(cfg);
    await persistAppSettings();
    toast('تم الحفظ');
    renderTax();
  };
}
