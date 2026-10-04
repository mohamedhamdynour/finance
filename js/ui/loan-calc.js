// ══════════════════════════════════════════════════════════════════
//  loan-calc.js — آلة حاسبة القرض (UI)
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, fmtN } from '../core/utils.js';
import { calcLoan, formatMonths } from '../domain/loan.js';

export function installLoanCalcHandlers() {
  window.__updateLoanCalc = () => {
    const principal = N2(document.getElementById('edebt-amount')?.value);
    const months = N2(document.getElementById('loan-months')?.value);
    const rate = N2(document.getElementById('loan-rate')?.value);
    const el = document.getElementById('loan-result');
    if (!el) return;

    if (!principal || !months) {
      el.innerHTML = '<div style="color:var(--muted);text-align:center;font-size:11px;padding:6px">أدخل المبلغ الأصلي والمدة</div>';
      return;
    }

    const loan = calcLoan(principal, rate, months);
    if (!loan) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="padding:8px;background:var(--blue-l);border-radius:6px">
          <div style="font-size:10px;color:var(--muted)">القسط الشهري</div>
          <div style="font-weight:900;font-size:15px;color:var(--blue);direction:ltr">${fmtN(loan.monthlyPayment, 2)}</div>
        </div>
        <div style="padding:8px;background:var(--gold-l);border-radius:6px">
          <div style="font-size:10px;color:var(--muted)">إجمالي الفوائد</div>
          <div style="font-weight:900;font-size:15px;color:var(--gold);direction:ltr">${fmtN(loan.totalInterest, 2)}</div>
        </div>
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--muted);text-align:center">
        الإجمالي المدفوع: <strong style="color:var(--text)">${fmt(loan.totalPayment)}</strong>
      </div>
    `;
  };

  window.__applyLoanCalc = () => {
    const principal = N2(document.getElementById('edebt-amount')?.value);
    const rate = N2(document.getElementById('loan-rate')?.value);
    const months = N2(document.getElementById('loan-months')?.value);

    if (!principal || !months) return alert('أدخل المبلغ الأصلي والمدة أولاً');

    const loan = calcLoan(principal, rate, months);
    if (!loan) return;

    // املأ الفائدة والمتبقي
    const rateEl = document.getElementById('edebt-rate');
    if (rateEl) rateEl.value = rate;

    const remainEl = document.getElementById('edebt-remaining');
    if (remainEl && !remainEl.value) remainEl.value = principal;

    // أظهر اسم دين مفيد
    const nameEl = document.getElementById('edebt-name');
    if (nameEl && !nameEl.value) {
      nameEl.value = `قرض — ${formatMonths(months)} بفائدة ${rate}%`;
    }
  };

  // ربط تلقائي عند تغيير المبلغ
  const amountEl = document.getElementById('edebt-amount');
  if (amountEl) {
    amountEl.addEventListener('input', () => window.__updateLoanCalc());
  }

  // عرض أولي عند فتح النافذة
  const observer = new MutationObserver(() => {
    const modal = document.getElementById('modal-debt-add');
    if (modal && modal.classList.contains('open')) {
      setTimeout(window.__updateLoanCalc, 50);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

/**
 * آلة حاسبة كاملة (صفحة منفصلة) — اختياري
 */
export function renderLoanCalcPage() {
  const el = document.getElementById('loan-full-calc');
  if (!el) return;

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </div>
          آلة حاسبة القروض
        </div>
      </div>
      <div class="card-body">
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">المبلغ *</label>
            <input class="form-control" type="number" id="calc-amount" value="300000" oninput="window.__renderFullCalc()">
          </div>
          <div class="form-group">
            <label class="form-label">الفائدة % سنوي</label>
            <input class="form-control" type="number" step="0.01" id="calc-rate" value="18" oninput="window.__renderFullCalc()">
          </div>
          <div class="form-group">
            <label class="form-label">المدة (شهور)</label>
            <input class="form-control" type="number" id="calc-months" value="60" oninput="window.__renderFullCalc()">
          </div>
        </div>
        <div id="calc-result"></div>
      </div>
    </div>
  `;

  window.__renderFullCalc = () => {
    const P = N2(document.getElementById('calc-amount')?.value);
    const rate = N2(document.getElementById('calc-rate')?.value);
    const months = N2(document.getElementById('calc-months')?.value);
    const out = document.getElementById('calc-result');
    if (!P || !months) { out.innerHTML = ''; return; }

    const loan = calcLoan(P, rate, months);
    if (!loan) { out.innerHTML = ''; return; }

    // جدول مختصر: أول 12 شهر + آخر 3
    const schedule = loan.schedule;
    const preview = schedule.length <= 15 ? schedule : [...schedule.slice(0, 12), { _ellipsis: true }, ...schedule.slice(-3)];

    out.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0">
        <div style="padding:14px;background:var(--blue-l);border-radius:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">القسط الشهري</div>
          <div style="font-weight:900;font-size:20px;color:var(--blue);direction:ltr">${fmtN(loan.monthlyPayment, 2)}</div>
        </div>
        <div style="padding:14px;background:var(--gold-l);border-radius:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">إجمالي الفوائد</div>
          <div style="font-weight:900;font-size:20px;color:var(--gold);direction:ltr">${fmtN(loan.totalInterest, 2)}</div>
        </div>
        <div style="padding:14px;background:var(--purple-l);border-radius:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">الإجمالي المدفوع</div>
          <div style="font-weight:900;font-size:20px;color:var(--purple);direction:ltr">${fmtN(loan.totalPayment, 2)}</div>
        </div>
        <div style="padding:14px;background:var(--teal-l);border-radius:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">نسبة الفائدة من الإجمالي</div>
          <div style="font-weight:900;font-size:20px;color:var(--teal)">${(loan.totalInterest / loan.totalPayment * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div class="table-wrap">
        <table style="min-width:0">
          <thead>
            <tr>
              <th>الشهر</th>
              <th style="text-align:left;direction:ltr">القسط</th>
              <th style="text-align:left;direction:ltr">الفائدة</th>
              <th style="text-align:left;direction:ltr">الأصل</th>
              <th style="text-align:left;direction:ltr">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${preview.map((row, i) => row._ellipsis
              ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-style:italic">... (${schedule.length - 15} شهر إضافية) ...</td></tr>`
              : `<tr>
                <td style="font-weight:700">${row.month}</td>
                <td class="td-num" style="direction:ltr">${fmtN(row.payment, 2)}</td>
                <td class="td-num" style="direction:ltr;color:var(--gold)">${fmtN(row.interest, 2)}</td>
                <td class="td-num" style="direction:ltr;color:var(--green)">${fmtN(row.principal, 2)}</td>
                <td class="td-num" style="direction:ltr;color:var(--muted)">${fmtN(row.balance, 2)}</td>
              </tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  setTimeout(window.__renderFullCalc, 50);
}
