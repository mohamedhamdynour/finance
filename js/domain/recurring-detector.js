// ══════════════════════════════════════════════════════════════════
//  recurring-detector.js — كشف العمليات المتكررة تلقائياً
//  يحلّل آخر N شهر ويقترح عمليات متكررة جديدة
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { N2, today } from '../core/utils.js';

/**
 * يوحّد النص العربي لإزالة الأرقام والتواريخ المتغيرة.
 */
function normalizeText(s) {
  if (!s) return '';
  return String(s)
    .split('\n')[0]                 // خذ أول سطر فقط
    .replace(/[\d٠-٩]+/g, '#')      // استبدل الأرقام بـ #
    .replace(/[\/\-\.,:]/g, ' ')     // علامات الترقيم
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * يحسب الفاصل الزمني بين تواريخ متتالية (بالأيام).
 */
function intervals(dates) {
  const result = [];
  const sorted = [...dates].sort();
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]);
    const b = new Date(sorted[i]);
    result.push(Math.round((b - a) / 86400000));
  }
  return result;
}

/**
 * يقيس انتظام فترات (0-1، حيث 1 = منتظم جداً).
 */
function regularity(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  const cv = std / mean; // معامل الاختلاف
  return Math.max(0, 1 - Math.min(1, cv));
}

/**
 * يخمّن نوع التكرار من متوسط الفواصل.
 */
function guessFrequency(avgDays) {
  if (avgDays >= 5 && avgDays <= 10) return { freq: 'weekly', label: 'أسبوعي', confidence: 1 - Math.abs(avgDays - 7) / 7 };
  if (avgDays >= 25 && avgDays <= 35) return { freq: 'monthly', label: 'شهري', confidence: 1 - Math.abs(avgDays - 30.4) / 30.4 };
  if (avgDays >= 85 && avgDays <= 100) return { freq: 'quarterly', label: 'ربع سنوي', confidence: 1 - Math.abs(avgDays - 91) / 91 };
  if (avgDays >= 355 && avgDays <= 375) return { freq: 'yearly', label: 'سنوي', confidence: 1 - Math.abs(avgDays - 365) / 365 };
  return null;
}

/**
 * يحسب تشابه المبالغ.
 */
function amountSimilarity(amounts) {
  if (amounts.length < 2) return 0;
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (mean === 0) return 0;
  const maxDeviation = Math.max(...amounts.map(a => Math.abs(a - mean))) / mean;
  return Math.max(0, 1 - Math.min(1, maxDeviation * 5)); // 20% deviation → 0
}

/**
 * الكشف الرئيسي.
 * @param {object} opts - { monthsBack, minOccurrences, bankId }
 * @returns {Array} مقترحات مصنّفة حسب الثقة
 */
export function detectRecurring(opts = {}) {
  const monthsBack = opts.monthsBack || 6;
  const minOccurrences = opts.minOccurrences || 3;
  const filterBankId = opts.bankId || null;

  // 1) اجمع الحركات في الفترة
  const end = today();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsBack);
  const start = startDate.toISOString().slice(0, 10);

  const txns = DB.bankTxns.filter(t => {
    if (t.date < start || t.date > end) return false;
    // استبعد المتحركات المُنشأة من المتكرر أصلاً
    if (t.category && t.category.includes('متكرر')) return false;
    // فقط إيداع/سحب
    if (!['إيداع', 'سحب'].includes(t.type)) return false;
    if (filterBankId && t.bank_id !== filterBankId) return false;
    return true;
  });

  // 2) اجمع حسب (bank_id + type + normalizedText)
  const groups = {};
  txns.forEach(t => {
    const key = [t.bank_id, t.type, normalizeText(t.notes || '')].join('|');
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  // 3) حلّل كل مجموعة
  const suggestions = [];
  const existingRecurring = new Set(
    DB.recurring.map(r => [r.bank_id, r.type, normalizeText(r.name || '')].join('|'))
  );

  Object.entries(groups).forEach(([key, items]) => {
    if (items.length < minOccurrences) return;

    // تجاهل لو موجودة كـ recurring
    const compositeKey = key;
    if (existingRecurring.has(compositeKey)) return;

    const dates = items.map(t => t.date);
    const amounts = items.map(t => N2(t.amount));

    const ints = intervals(dates);
    const avgInterval = ints.reduce((a, b) => a + b, 0) / ints.length;
    const freqInfo = guessFrequency(avgInterval);
    if (!freqInfo) return;

    const intReg = regularity(ints);
    const amtSim = amountSimilarity(amounts);
    const freqConf = Math.max(0, Math.min(1, freqInfo.confidence));

    // الثقة الإجمالية
    const confidence = intReg * 0.45 + amtSim * 0.35 + freqConf * 0.2;

    if (confidence < 0.5) return;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const firstTxn = items[0];
    const bank = DB.banks.find(b => b.id === firstTxn.bank_id);

    // اسم مقترح
    const suggestedName = (firstTxn.notes || '').split('\n')[0].slice(0, 50) || 'عملية متكررة';

    suggestions.push({
      key: compositeKey,
      name: suggestedName,
      type: firstTxn.type,
      freq: freqInfo.freq,
      freqLabel: freqInfo.label,
      amount: +avgAmount.toFixed(2),
      bank_id: firstTxn.bank_id,
      bank_name: bank?.name || '—',
      occurrences: items.length,
      first_date: dates[0],
      last_date: dates[dates.length - 1],
      avgInterval: Math.round(avgInterval),
      confidence: +confidence.toFixed(3),
      intervals: ints,
      dates,
      amounts
    });
  });

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * يُرجع أفضل N اقتراح.
 */
export function topSuggestions(n = 5) {
  return detectRecurring().slice(0, n);
}
