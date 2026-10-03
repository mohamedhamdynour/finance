// ══════════════════════════════════════════════════════════════════
//  excel.js — تصدير Excel احترافي (SheetJS)
//  Lazy load + multi-sheet + تنسيقات عربية
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS, conn } from '../state.js';
import { N2, today, baseCur, toEGP, getBankColor } from './utils.js';
import { calcTotals, getHoldings, getMetalHoldings, getStockPrice, getMetalPrice } from '../domain/calc.js';

const SHEETJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// ══════════════════ Lazy Load SheetJS ══════════════════
let _xlsxLoading = null;

function ensureSheetJS() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.XLSX) return Promise.resolve(true);
  if (_xlsxLoading) return _xlsxLoading;

  _xlsxLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SHEETJS_CDN;
    s.async = true;
    s.onload = () => {
      console.log('[excel] ✓ SheetJS loaded');
      resolve(true);
    };
    s.onerror = () => {
      console.error('[excel] ✗ failed to load SheetJS');
      _xlsxLoading = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return _xlsxLoading;
}

// ══════════════════ مساعدات ══════════════════

function sheetFromRows(XLSX, rows, options = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // عرض الأعمدة التلقائي
  if (rows.length && rows[0].length) {
    const colWidths = [];
    const maxCol = rows[0].length;
    for (let c = 0; c < maxCol; c++) {
      let maxLen = 10;
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r][c];
        if (cell === undefined || cell === null) continue;
        const len = String(cell).length;
        if (len > maxLen) maxLen = Math.min(50, len);
      }
      colWidths.push({ wch: maxLen + 2 });
    }
    ws['!cols'] = colWidths;
  }

  // RTL
  if (!ws['!views']) ws['!views'] = [];
  ws['!views'].push({ RTL: true });

  return ws;
}

function fmtDate(d) {
  if (!d) return '';
  return String(d);
}

// ══════════════════ Export الكامل ══════════════════

export async function exportExcel() {
  const ok = await ensureSheetJS();
  if (!ok) {
    alert('تعذّر تحميل مكتبة Excel — تحقق من الاتصال بالإنترنت');
    return;
  }
  const XLSX = window.XLSX;

  try {
    const T = calcTotals();
    const wb = XLSX.utils.book_new();
    const cur = baseCur();

    // ══════════════════ 1) الملخص ══════════════════
    const summaryRows = [
      ['محفظة: ' + (APP_SETTINGS.exchange_name || 'بدون اسم')],
      ['تاريخ التصدير: ' + today()],
      ['العملة الأساسية: ' + cur],
      [],
      ['الفئة', `القيمة (${cur})`, 'النسبة %']
    ];
    const cats = [
      { label: 'البنوك والنقد', val: T.totalBanks },
      { label: 'الأسهم والصناديق', val: T.stocksVal },
      { label: 'المعادن الثمينة', val: T.metalsVal },
      { label: 'الشهادات الادخارية', val: T.certsTotal }
    ];
    cats.forEach(c => {
      summaryRows.push([c.label, +N2(c.val).toFixed(2), T.grand > 0 ? +((c.val / T.grand) * 100).toFixed(2) : 0]);
    });
    summaryRows.push([]);
    summaryRows.push(['إجمالي المحفظة', +N2(T.grand).toFixed(2), 100]);
    summaryRows.push([]);
    summaryRows.push(['مؤشرات الأداء', 'القيمة', 'نسبة %']);
    summaryRows.push(['ر/خ غير محقق — الأسهم', +N2(T.pnlStocks).toFixed(2), T.stocksCost > 0 ? +((T.pnlStocks / T.stocksCost) * 100).toFixed(2) : 0]);
    summaryRows.push(['ر/خ غير محقق — المعادن', +N2(T.pnlMetals).toFixed(2), T.metalsCost > 0 ? +((T.pnlMetals / T.metalsCost) * 100).toFixed(2) : 0]);
    summaryRows.push(['عوائد الشهادات المُصرَّفة', +N2(T.certsPaid).toFixed(2), '']);
    summaryRows.push(['توزيعات أرباح', +N2(T.divTotal).toFixed(2), '']);
    summaryRows.push(['إجمالي العائد', +N2(T.totalPnl).toFixed(2), '']);
    summaryRows.push([]);
    summaryRows.push(['الالتزامات', 'المتبقي', '']);
    summaryRows.push(['ديون عليّ', +N2(T.debtsOwed).toFixed(2), '']);
    summaryRows.push(['ديون لي', +N2(T.debtsOwing).toFixed(2), '']);
    summaryRows.push(['صافي الثروة (بدون ديون)', +N2(T.grand - T.debtsOwed).toFixed(2), '']);

    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, summaryRows), 'الملخص');

    // ══════════════════ 2) البنوك ══════════════════
    const bankRows = [
      ['الاسم', 'الكود', 'النوع', 'العملة', 'الرصيد', `الرصيد بـ ${cur}`, 'الحد الأدنى', 'رقم الحساب', 'ملاحظات', 'مؤرشف؟']
    ];
    DB.banks.forEach(b => {
      bankRows.push([
        b.name || '',
        b.bank_code || '',
        b.type || '',
        b.currency || 'EGP',
        +N2(b.balance).toFixed(2),
        +N2(toEGP(N2(b.balance), b.currency || 'EGP')).toFixed(2),
        +N2(b.min_balance || 0).toFixed(2),
        b.account_no || '',
        b.notes || '',
        b.is_active === false ? 'نعم' : 'لا'
      ]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, bankRows), 'البنوك');

    // ══════════════════ 3) حركات البنوك ══════════════════
    const btxnRows = [
      ['التاريخ', 'الحساب', 'النوع', 'الفئة', 'المبلغ', 'الرصيد بعد', 'ملاحظات']
    ];
    DB.bankTxns.forEach(t => {
      const b = DB.banks.find(x => x.id === t.bank_id);
      btxnRows.push([
        fmtDate(t.date),
        b?.name || '— محذوف —',
        t.type || '',
        t.category || '',
        +N2(t.amount).toFixed(2),
        t.balance_after != null ? +N2(t.balance_after).toFixed(2) : '',
        (t.notes || '').split('\n')[0]
      ]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, btxnRows), 'حركات البنوك');

    // ══════════════════ 4) الأسهم (الحيازات) ══════════════════
    const h = getHoldings();
    const stockHoldRows = [
      ['الكود', 'الاسم', 'النوع', 'السوق', 'العملة', 'الكمية', 'متوسط التكلفة', 'السعر الحالي', 'القيمة السوقية', 'إجمالي التكلفة', 'ر/خ', 'عائد %']
    ];
    Object.entries(h).forEach(([sym, v]) => {
      const cp = getStockPrice(sym) || v.avgPrice;
      const cv = v.qty * cp;
      const pnl = cv - v.totalCost;
      const ret = v.totalCost > 0 ? (pnl / v.totalCost) * 100 : 0;
      stockHoldRows.push([
        sym, v.name || '', v.type || 'سهم', v.market || 'EGX', v.currency || 'EGP',
        +N2(v.qty).toFixed(4), +N2(v.avgPrice).toFixed(4), +N2(cp).toFixed(4),
        +N2(cv).toFixed(2), +N2(v.totalCost).toFixed(2),
        +N2(pnl).toFixed(2), +ret.toFixed(2)
      ]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, stockHoldRows), 'حيازات الأسهم');

    // ══════════════════ 5) حركات الأسهم ══════════════════
    const stockTxnRows = [
      ['التاريخ', 'النوع', 'الكود', 'الاسم', 'السوق', 'الكمية', 'السعر', 'الإجمالي', 'العمولة', 'الصافي', 'ر/خ', 'الحساب البنكي', 'ملاحظات']
    ];
    DB.stockTxns.forEach(t => {
      const b = DB.banks.find(x => x.id === t.bank_id);
      stockTxnRows.push([
        fmtDate(t.date), t.type || '', t.symbol || '', t.name || '',
        t.market || 'EGX',
        +N2(t.quantity).toFixed(4),
        +N2(t.price).toFixed(4),
        +N2(t.total).toFixed(2),
        +N2(t.commission).toFixed(2),
        +N2(t.net).toFixed(2),
        t.profit != null ? +N2(t.profit).toFixed(2) : '',
        b?.name || '',
        (t.notes || '').split('\n')[0]
      ]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, stockTxnRows), 'حركات الأسهم');

    // ══════════════════ 6) توزيعات الأرباح ══════════════════
    if (DB.dividends.length) {
      const divRows = [['التاريخ', 'الكود', 'المبلغ', 'الحساب', 'ملاحظات']];
      DB.dividends.forEach(d => {
        const b = DB.banks.find(x => x.id === d.bank_id);
        divRows.push([fmtDate(d.date), d.symbol || '', +N2(d.amount).toFixed(2), b?.name || '', d.notes || '']);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, divRows), 'أرباح الأسهم');
    }

    // ══════════════════ 7) المعادن (الحيازات) ══════════════════
    const mh = getMetalHoldings();
    const metalHoldRows = [
      ['النوع', 'العنوان', 'الوزن (جم)', 'متوسط سعر الجرام', 'السعر الحالي/جم', 'القيمة السوقية', 'إجمالي التكلفة', 'ر/خ', 'عائد %']
    ];
    Object.entries(mh).forEach(([key, v]) => {
      const bt = (v.metal_type || key.split('|')[0]).trim();
      const cp = getMetalPrice(bt) || v.avgPrice;
      const cv = v.weight * cp;
      const pnl = cv - v.totalCost;
      const ret = v.totalCost > 0 ? (pnl / v.totalCost) * 100 : 0;
      metalHoldRows.push([
        bt, v.title || '',
        +N2(v.weight).toFixed(3),
        +N2(v.avgPrice).toFixed(2),
        +N2(cp).toFixed(2),
        +N2(cv).toFixed(2),
        +N2(v.totalCost).toFixed(2),
        +N2(pnl).toFixed(2),
        +ret.toFixed(2)
      ]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, metalHoldRows), 'حيازات المعادن');

    // ══════════════════ 8) حركات المعادن ══════════════════
    if (DB.metalTxns.length) {
      const metalTxnRows = [
        ['التاريخ', 'النوع', 'النوع', 'العنوان', 'الوزن (جم)', 'سعر/جم', 'الإجمالي', 'تصنيع', 'كاش باك', 'الصافي', 'الحساب', 'ملاحظات']
      ];
      DB.metalTxns.forEach(t => {
        const b = DB.banks.find(x => x.id === t.bank_id);
        metalTxnRows.push([
          fmtDate(t.date), t.op || '', t.metal_type || '', t.notes || '',
          +N2(t.weight).toFixed(3),
          +N2(t.price_per_gram).toFixed(2),
          +N2(t.total).toFixed(2),
          +N2(t.manufacturing || 0).toFixed(2),
          +N2(t.cashback || 0).toFixed(2),
          +N2(t.net).toFixed(2),
          b?.name || '',
          ''
        ]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, metalTxnRows), 'حركات المعادن');
    }

    // ══════════════════ 9) الشهادات ══════════════════
    if (DB.certs.length) {
      const certRows = [
        ['الاسم', 'البنك', 'المبلغ', 'العملة', 'الفائدة %', 'المدة (سنة)', 'تاريخ الإصدار', 'تاريخ الاستحقاق', 'نوع العائد', 'إجمالي الفائدة', 'فائدة مُصرَّفة', 'المتبقي']
      ];
      DB.certs.forEach(c => {
        const remaining = Math.max(0, N2(c.total_interest) - N2(c.interest_paid));
        certRows.push([
          c.name || '', c.bank_name || '',
          +N2(c.amount).toFixed(2), c.currency || 'EGP',
          +N2(c.rate).toFixed(2), +N2(c.duration).toFixed(2),
          fmtDate(c.issued_date), fmtDate(c.maturity_date),
          c.payout_type || 'سنوي',
          +N2(c.total_interest).toFixed(2),
          +N2(c.interest_paid).toFixed(2),
          +remaining.toFixed(2)
        ]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, certRows), 'الشهادات');
    }

    // ══════════════════ 10) الأقساط ══════════════════
    if (DB.installments?.length) {
      const instRows = [
        ['الاسم', 'الطرف', 'المبلغ الإجمالي', 'عدد الأقساط', 'قيمة القسط', 'التكرار', 'تاريخ البداية', 'مدفوع', 'المتبقي', 'أقساط مدفوعة', 'أقساط متبقية']
      ];
      DB.installments.forEach(inst => {
        const payments = DB.installmentPayments.filter(p => p.installment_id === inst.id && !p.deleted_at);
        const paid = payments.reduce((a, p) => a + N2(p.amount), 0);
        const remaining = Math.max(0, N2(inst.total_amount) - paid);
        instRows.push([
          inst.name || '', inst.party || '',
          +N2(inst.total_amount).toFixed(2),
          inst.installments_count,
          +N2(inst.installment_amount).toFixed(2),
          inst.frequency || 'monthly',
          fmtDate(inst.start_date),
          +paid.toFixed(2),
          +remaining.toFixed(2),
          payments.length,
          Math.max(0, inst.installments_count - payments.length)
        ]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, instRows), 'الأقساط');
    }

    // ══════════════════ 11) الديون ══════════════════
    if (DB.debts.length) {
      const debtRows = [
        ['الاسم', 'الطرف', 'النوع', 'الفائدة %', 'المبلغ الأصلي', 'المتبقي', 'تاريخ البداية', 'الاستحقاق', 'ملاحظات']
      ];
      DB.debts.forEach(d => {
        debtRows.push([
          d.name || '', d.party || '', d.type || '',
          +N2(d.rate || 0).toFixed(2),
          +N2(d.amount).toFixed(2),
          +N2(d.remaining).toFixed(2),
          fmtDate(d.start_date), fmtDate(d.due_date),
          d.notes || ''
        ]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, debtRows), 'الديون');
    }

    // ══════════════════ 12) الأهداف ══════════════════
    if (DB.goals.length) {
      const goalRows = [['الهدف', 'المستهدف', 'الفئة', 'التقدم الحالي', 'النسبة %']];
      DB.goals.forEach(g => {
        let current = T.grand;
        if (g.category === 'banks') current = T.totalBanks;
        else if (g.category === 'stocks') current = T.stocksVal;
        else if (g.category === 'metals') current = T.metalsVal;
        else if (g.category === 'certs') current = T.certsTotal;
        const pct = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
        goalRows.push([g.name || '', +N2(g.target).toFixed(2), g.category || 'all', +current.toFixed(2), +pct.toFixed(2)]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, goalRows), 'الأهداف');
    }

    // ══════════════════ 13) العمليات المتكررة ══════════════════
    if (DB.recurring.length) {
      const recRows = [['الاسم', 'النوع', 'التكرار', 'المبلغ', 'الحساب', 'تاريخ البداية', 'آخر تطبيق']];
      DB.recurring.forEach(r => {
        const b = DB.banks.find(x => x.id === r.bank_id);
        recRows.push([
          r.name || '', r.type || '', r.freq || 'monthly',
          +N2(r.amount).toFixed(2),
          b?.name || '',
          fmtDate(r.start_date), fmtDate(r.last_applied)
        ]);
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, recRows), 'عمليات متكررة');
    }

    // ══════════════════ الحفظ ══════════════════
    const filename = `portfolio_${today()}.xlsx`;
    XLSX.writeFile(wb, filename);

    return { success: true, sheets: wb.SheetNames.length, filename };
  } catch (e) {
    console.error('[excel] export failed:', e);
    throw e;
  }
}

// ══════════════════ تصدير ورقة واحدة (اختياري) ══════════════════

export async function exportSingleSheet(sheetName) {
  const ok = await ensureSheetJS();
  if (!ok) return alert('تعذّر تحميل مكتبة Excel');

  const XLSX = window.XLSX;
  let rows = [];

  switch (sheetName) {
    case 'banks':
      rows = [['الاسم', 'الرصيد', 'العملة', 'النوع']];
      DB.banks.forEach(b => rows.push([b.name, +N2(b.balance).toFixed(2), b.currency || 'EGP', b.type]));
      break;
    case 'stocks':
      const h = getHoldings();
      rows = [['الكود', 'الكمية', 'متوسط التكلفة', 'القيمة السوقية']];
      Object.entries(h).forEach(([sym, v]) => {
        const cp = getStockPrice(sym) || v.avgPrice;
        rows.push([sym, +N2(v.qty).toFixed(4), +N2(v.avgPrice).toFixed(4), +N2(v.qty * cp).toFixed(2)]);
      });
      break;
    default:
      return alert('ورقة غير معروفة');
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(XLSX, rows), sheetName);
  XLSX.writeFile(wb, `${sheetName}_${today()}.xlsx`);
}
