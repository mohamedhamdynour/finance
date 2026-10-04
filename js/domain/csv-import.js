// ══════════════════════════════════════════════════════════════════
//  csv-import.js — تحليل كشوف CSV واستيرادها
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { N2, today } from '../core/utils.js';

// ══════════════════ تحميل PapaParse ══════════════════
let _papaparsePromise = null;
export function ensurePapaParse() {
  if (window.Papa) return Promise.resolve(true);
  if (_papaparsePromise) return _papaparsePromise;
  _papaparsePromise = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
    s.onload = () => resolve(true);
    s.onerror = () => { _papaparsePromise = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _papaparsePromise;
}

// ══════════════════ الحقول المحتملة ══════════════════
const FIELD_PATTERNS = {
  date: [/^date$/i, /^تاريخ/i, /^transaction.?date/i, /^التاريخ/i, /^date.?time/i],
  amount: [/^amount$/i, /^المبلغ/i, /^value$/i, /^credit$/i, /^debit$/i],
  debit: [/^debit$/i, /^مدين/i, /^withdrawal/i, /^مصروف/i, /^سحب/i],
  credit: [/^credit$/i, /^دائن/i, /^deposit/i, /^إيداع/i],
  description: [/^description$/i, /^البيان/i, /^ملاحظات/i, /^notes/i, /^details/i, /^narration/i, /^الوصف/i],
  type: [/^type$/i, /^النوع/i, /^transaction.?type/i],
  balance: [/^balance$/i, /^الرصيد/i],
  ref: [/^reference$/i, /^ref$/i, /^مرجع/i, /^رقم.?العملية/i]
};

function detectField(header) {
  const h = String(header).trim();
  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    if (patterns.some(p => p.test(h))) return field;
  }
  return null;
}

// ══════════════════ تحليل التاريخ ══════════════════
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY أو DD-MM-YYYY أو DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    // لو اليوم > 12 غالباً DD/MM/YYYY (النظام المصري/الأوروبي)
    if (+d > 12) return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    // وإلا نفترض MM/DD/YYYY (النظام الأمريكي)
    return `${y}-${d.padStart(2, '0')}-${mo.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // Date object
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

// ══════════════════ تحليل المبلغ ══════════════════
function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw)
    .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48)) // أرقام عربية → لاتينية
    .replace(/[,،\s]/g, '')
    .replace(/[^\d.\-()]/g, '');
  if (!s || s === '-') return null;
  // الأقواس = سالب
  const negative = s.includes('(') || s.includes(')');
  const num = parseFloat(s.replace(/[()]/g, ''));
  if (isNaN(num)) return null;
  return negative ? -Math.abs(num) : num;
}

// ══════════════════ تصنيف تلقائي ══════════════════
const CATEGORY_KEYWORDS = {
  'مرتب': ['salary', 'راتب', 'مرتب', 'payroll'],
  'فواتير': ['electric', 'water', 'gas', 'كهربا', 'مياه', 'غاز', 'internet', 'انترنت', 'phone', 'موبايل', 'bill'],
  'مواصلات': ['uber', 'careem', 'أوبر', 'كريم', 'fuel', 'بنزين', 'petrol', 'transport'],
  'مصروفات منزلية': ['supermarket', 'market', 'سوبر', 'ماركت', 'بقالة', 'grocery', 'هايبر'],
  'صحة': ['pharmacy', 'صيدلية', 'hospital', 'مستشفى', 'clinic', 'طبيب', 'doctor', 'medical'],
  'تعليم': ['school', 'مدرسة', 'university', 'جامعة', 'tuition', 'رسوم', 'education'],
  'ترفيه': ['netflix', 'spotify', 'cinema', 'سينما', 'restaurant', 'مطعم', 'cafe', 'كافيه'],
  'استثمار': ['investment', 'استثمار', 'stock', 'سهم', 'fund', 'صندوق'],
  'سداد دين': ['loan', 'قرض', 'installment', 'قسط', 'debt'],
  'تحويل': ['transfer', 'تحويل']
};

function autoCategorize(description) {
  const d = String(description || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => d.includes(k))) return cat;
  }
  return '';
}

// ══════════════════ التحليل الرئيسي ══════════════════
export async function parseCSV(file) {
  const ok = await ensurePapaParse();
  if (!ok) throw new Error('تعذّر تحميل مكتبة CSV');

  const text = await file.text();
  const result = window.Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim()
  });

  if (result.errors.length && !result.data.length) {
    throw new Error('فشل تحليل CSV: ' + result.errors[0].message);
  }

  const headers = result.meta.fields || [];
  const mapping = {};
  headers.forEach(h => {
    const f = detectField(h);
    if (f && !mapping[f]) mapping[f] = h;
  });

  if (!mapping.date) throw new Error('لم يُعثر على عمود التاريخ');
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    throw new Error('لم يُعثر على عمود المبلغ (amount/debit/credit)');
  }

  const rows = result.data.map((raw, idx) => {
    const date = parseDate(raw[mapping.date]);
    let amount = null;
    let type = null;

    if (mapping.amount) {
      amount = parseAmount(raw[mapping.amount]);
      type = amount >= 0 ? 'إيداع' : 'سحب';
      amount = Math.abs(amount);
    } else {
      const credit = mapping.credit ? parseAmount(raw[mapping.credit]) : null;
      const debit = mapping.debit ? parseAmount(raw[mapping.debit]) : null;
      if (credit && credit > 0) { amount = Math.abs(credit); type = 'إيداع'; }
      else if (debit && debit > 0) { amount = Math.abs(debit); type = 'سحب'; }
    }

    const description = mapping.description ? String(raw[mapping.description] || '') : '';
    const category = autoCategorize(description);

    return {
      _rowNum: idx + 2,
      _selected: true,
      date: date || '',
      type: type || 'سحب',
      amount: amount || 0,
      description,
      category,
      _valid: !!(date && amount > 0),
      _duplicate: false,
      _error: !date ? 'تاريخ غير صالح' : (!amount ? 'مبلغ غير صالح' : '')
    };
  }).filter(r => r.amount > 0 || r._error);

  return {
    rows,
    headers,
    mapping,
    summary: {
      total: rows.length,
      valid: rows.filter(r => r._valid).length,
      invalid: rows.filter(r => !r._valid).length
    }
  };
}

// ══════════════════ كشف التكرار ══════════════════
export function detectDuplicates(rows, bankId) {
  const existing = DB.bankTxns.filter(t => t.bank_id === bankId);
  const existingKeys = new Set(existing.map(t => `${t.date}|${N2(t.amount)}|${(t.notes || '').split('\n')[0].trim().slice(0, 50)}`));

  rows.forEach(r => {
    if (!r._valid) return;
    const key = `${r.date}|${N2(r.amount)}|${r.description.trim().slice(0, 50)}`;
    r._duplicate = existingKeys.has(key);
    if (r._duplicate) r._selected = false;   // اطفي المكرر تلقائياً
  });

  return rows;
}
