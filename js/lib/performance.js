/**
 * performance.js — مقاييس أداء المحفظة (بدون اعتماد على أي مكتبة).
 *
 *  xirr(flows)                     العائد السنوي المرجّح بالنقد (money-weighted)
 *  twr(points)                     العائد المرجّح بالزمن (time-weighted) من لقطات المحفظة
 *  realReturn(nominal, inflation)  العائد الحقيقي بعد التضخم
 *  fxAttribution(local, fx)        فصل أثر سعر الصرف عن أثر السعر
 *  weightedAvgCost(txns)           متوسط التكلفة المرجح + الربح المحقق (العمولة تدخل في التكلفة)
 *
 * كل النسب كسور عشرية (0.12 = 12%).
 */
(function (root) {
  'use strict';
  const MS_DAY = 86400000;

  function toTime(d) { return d instanceof Date ? d.getTime() : new Date(d).getTime(); }

  /**
   * flows: [{date, amount}]  —  الإيداعات في المحفظة سالبة، السحوبات والقيمة النهائية موجبة.
   * مثال: [{date:'2026-01-01',amount:-10000},{date:'2026-06-01',amount:-5000},{date:'2026-11-18',amount:16500}]
   * يرجّع null لو مفيش حل (كل التدفقات بنفس الإشارة).
   */
  function xirr(flows, guess) {
    const f = (flows || []).filter((x) => x && isFinite(x.amount) && x.amount !== 0)
      .map((x) => ({ t: toTime(x.date), a: Number(x.amount) }))
      .sort((p, q) => p.t - q.t);
    if (f.length < 2) return null;
    if (!f.some((x) => x.a < 0) || !f.some((x) => x.a > 0)) return null;
    const t0 = f[0].t;
    const yrs = f.map((x) => (x.t - t0) / MS_DAY / 365);
    const npv = (r) => f.reduce((s, x, i) => s + x.a / Math.pow(1 + r, yrs[i]), 0);
    const dnpv = (r) => f.reduce((s, x, i) => s - (yrs[i] * x.a) / Math.pow(1 + r, yrs[i] + 1), 0);

    let r = typeof guess === 'number' ? guess : 0.1;
    for (let i = 0; i < 60; i++) {                          // Newton
      const v = npv(r), d = dnpv(r);
      if (!isFinite(v) || !isFinite(d) || d === 0) break;
      const nr = r - v / d;
      if (nr <= -0.999999) break;
      if (Math.abs(nr - r) < 1e-10) return nr;
      r = nr;
    }
    let lo = -0.999999, hi = 1e6;                           // Bisection احتياطي
    let flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 300; i++) {
      const mid = (lo + hi) / 2, fm = npv(mid);
      if (Math.abs(fm) < 1e-9 || (hi - lo) / 2 < 1e-12) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  /**
   * points: [{date, value, flow}] مرتبة بالتاريخ.
   *   value = قيمة المحفظة في نهاية اليوم بعد التدفق
   *   flow  = صافي المساهمة الخارجية في اليوم (إيداع +، سحب −) وليس عوائد أو توزيعات أرباح.
   * التدفق يُفترض أنه حصل في بداية اليوم (يدخل في رأس مال الفترة).
   * يرجّع { total, annualized, periods }.
   */
  function twr(points) {
    const p = (points || []).filter((x) => x && isFinite(x.value)).slice().sort((a, b) => toTime(a.date) - toTime(b.date));
    if (p.length < 2) return { total: null, annualized: null, periods: 0 };
    let growth = 1, periods = 0;
    for (let i = 1; i < p.length; i++) {
      const base = p[i - 1].value + (Number(p[i].flow) || 0);
      if (base <= 0) continue;                              // محفظة فاضية: نتخطى الفترة
      growth *= p[i].value / base;
      periods++;
    }
    const days = (toTime(p[p.length - 1].date) - toTime(p[0].date)) / MS_DAY;
    const total = growth - 1;
    const annualized = days >= 30 ? Math.pow(growth, 365 / days) - 1 : null;
    return { total, annualized, periods };
  }

  function realReturn(nominal, inflation) { return (1 + nominal) / (1 + inflation) - 1; }

  /**
   * local: عائد الأصل بعملته. fx: تغير سعر العملة مقابل EGP (0.10 = العملة ارتفعت 10%).
   * يرجّع { total, price, fx, fxEffect } حيث fxEffect = الجزء الناتج عن العملة فقط.
   */
  function fxAttribution(local, fx) {
    const total = (1 + local) * (1 + fx) - 1;
    return { total, price: local, fx, fxEffect: total - local };
  }

  /**
   * txns: [{type:'buy'|'sell', qty, price, fee}] بترتيب التنفيذ.
   * الشراء: التكلفة = qty*price + fee.  البيع: الصافي = qty*price − fee.
   * يرجّع { qty, avgCost, costBasis, realized, error? }
   */
  function weightedAvgCost(txns) {
    let qty = 0, cost = 0, realized = 0;
    for (const t of txns || []) {
      const q = Number(t.qty), pr = Number(t.price), fee = Number(t.fee) || 0;
      if (t.type === 'buy') { qty += q; cost += q * pr + fee; }
      else if (t.type === 'sell') {
        if (q > qty + 1e-9) return { qty, avgCost: qty ? cost / qty : 0, costBasis: cost, realized, error: 'بيع أكبر من الكمية المملوكة' };
        const avg = qty ? cost / qty : 0;
        realized += (q * pr - fee) - q * avg;
        qty -= q; cost -= q * avg;
        if (Math.abs(qty) < 1e-9) { qty = 0; cost = 0; }
      }
    }
    return { qty, avgCost: qty ? cost / qty : 0, costBasis: cost, realized };
  }

  const api = { xirr, twr, realReturn, fxAttribution, weightedAvgCost };
  root.PortfolioPerf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
