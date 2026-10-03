// ══════════════════════════════════════════════════════════════════
//  validation.js — طبقة تحقق مركزية
// ══════════════════════════════════════════════════════════════════
import { currencyCodes } from './utils.js';

// ─── helpers ───────────────────────────────────────────────────
const isNum = v => v !== null && v !== '' && !isNaN(+v);

// ─── مخططات التحقق لكل نموذج ───────────────────────────────────
export const schemas = {
  bank: {
    name:         { required: true, maxLength: 100, trim: true },
    type:         { required: true, in: ['جاري','توفير','استثماري','بورصة','كاش'] },
    currency:     { required: true, in: () => currencyCodes() },
    balance:      { type: 'number', min: -1e12, max: 1e12 },
    min_balance:  { type: 'number', min: 0, default: 0 },
    account_no:   { maxLength: 50 },
    bank_code:    { maxLength: 20 },
    notes:        { maxLength: 500 },
  },

  deposit: {
    bank_id:  { required: true, type: 'number', min: 1 },
    amount:   { required: true, type: 'number', min: 0.01 },
    date:     { required: true, type: 'date' },
    notes:    { maxLength: 500 },
    category: { maxLength: 50 },
  },

  withdraw: {
    bank_id:  { required: true, type: 'number', min: 1 },
    amount:   { required: true, type: 'number', min: 0.01 },
    date:     { required: true, type: 'date' },
    notes:    { maxLength: 500 },
    category: { maxLength: 50 },
  },

  transfer: {
    from_id: { required: true, type: 'number', min: 1 },
    to_id:   { required: true, type: 'number', min: 1 },
    amount:  { required: true, type: 'number', min: 0.01 },
    fee:     { type: 'number', min: 0, default: 0 },
    date:    { required: true, type: 'date' },
  },

  stockBuy: {
    symbol:   { required: true, maxLength: 20, upper: true },
    name:     { required: true, maxLength: 150 },
    quantity: { required: true, type: 'number', min: 0.0001 },
    price:    { required: true, type: 'number', min: 0 },
    date:     { required: true, type: 'date' },
    bank_id:  { required: true, type: 'number', min: 1 },
  },

  stockSell: {
    symbol:   { required: true, maxLength: 20, upper: true },
    quantity: { required: true, type: 'number', min: 0.0001 },
    price:    { required: true, type: 'number', min: 0 },
    date:     { required: true, type: 'date' },
    bank_id:  { required: true, type: 'number', min: 1 },
  },

  metalBuy: {
    metal_type:     { required: true, maxLength: 50 },
    weight:         { required: true, type: 'number', min: 0.001 },
    price_per_gram: { required: true, type: 'number', min: 0 },
    date:           { required: true, type: 'date' },
    bank_id:        { required: true, type: 'number', min: 1 },
  },

  cert: {
    name:          { required: true, maxLength: 100 },
    amount:        { required: true, type: 'number', min: 1 },
    rate:          { required: true, type: 'number', min: 0, max: 100 },
    duration:      { required: true, type: 'number', min: 0.01 },
    issued_date:   { required: true, type: 'date' },
    maturity_date: { required: true, type: 'date' },
    payout_type:   { required: true, in: ['سنوي','شهري','أسبوعي','يومي'] },
    bank_id:       { required: true, type: 'number', min: 1 },
  },

  debt: {
    name:      { required: true, maxLength: 100 },
    type:      { required: true, in: ['دين علي','دين لي'] },
    amount:    { required: true, type: 'number', min: 0.01 },
    remaining: { type: 'number', min: 0 },
  },

  goal: {
    name:     { required: true, maxLength: 100 },
    target:   { required: true, type: 'number', min: 1 },
    category: { required: true, in: ['all','banks','stocks','metals','certs'] },
  },
};

/**
 * يتحقق من البيانات مقابل مخطط، ويعيد نسخة منظّفة + قائمة أخطاء.
 * @param {string} schemaName - اسم المخطط
 * @param {object} data - البيانات الواردة
 * @returns {{ ok: boolean, errors: string[], value: object }}
 */
export function validate(schemaName, data) {
  const schema = schemas[schemaName];
  if (!schema) return { ok: true, value: data, errors: [] };

  const errors = [];
  const cleaned = {};

  for (const [field, rules] of Object.entries(schema)) {
    let val = data[field];

    // trim
    if (typeof val === 'string' && rules.trim) val = val.trim();

    // uppercase
    if (typeof val === 'string' && rules.upper) val = val.toUpperCase();

    // required
    if (rules.required && (val === undefined || val === null || val === '')) {
      errors.push(`${field}: مطلوب`);
      continue;
    }

    // قيمة افتراضية إن كان الحقل فارغًا وغير مطلوب
    if (val === undefined || val === null || val === '') {
      if (rules.default !== undefined) cleaned[field] = rules.default;
      continue;
    }

    // رقم
    if (rules.type === 'number') {
      if (!isNum(val)) { errors.push(`${field}: يجب أن يكون رقمًا`); continue; }
      val = +val;
      if (rules.min !== undefined && val < rules.min) errors.push(`${field}: أصغر من ${rules.min}`);
      if (rules.max !== undefined && val > rules.max) errors.push(`${field}: أكبر من ${rules.max}`);
    }

    // تاريخ
    if (rules.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      errors.push(`${field}: تاريخ غير صالح`);
    }

    // طول
    if (rules.maxLength && String(val).length > rules.maxLength) {
      errors.push(`${field}: أطول من ${rules.maxLength} حرفًا`);
    }

    // ضمن قائمة
    if (rules.in) {
      const allowed = typeof rules.in === 'function' ? rules.in() : rules.in;
      if (!allowed.includes(val)) errors.push(`${field}: قيمة غير مسموحة`);
    }

    cleaned[field] = val;
  }

  return { ok: errors.length === 0, errors, value: cleaned };
}
