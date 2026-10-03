import { currencyCodes } from './settings.js';

const isNum = v => v !== null && v !== '' && !isNaN(+v);

export const schemas = {
  bank: {
    name:         { required: true, maxLength: 100, trim: true },
    type:         { required: true, in: ['جاري','توفير','استثماري','بورصة','كاش'] },
    currency:     { required: true, in: () => currencyCodes() },
    balance:      { type: 'number', min: -1e12, max: 1e12 },
    min_balance:  { type: 'number', min: 0, default: 0 },
  },
  deposit: {
    bank_id:  { required: true, type: 'number', min: 1 },
    amount:   { required: true, type: 'number', min: 0.01 },
    date:     { required: true, type: 'date' },
  },
  stockBuy: {
    symbol:   { required: true, maxLength: 20, upper: true },
    name:     { required: true, maxLength: 150 },
    quantity: { required: true, type: 'number', min: 0.0001 },
    price:    { required: true, type: 'number', min: 0 },
    date:     { required: true, type: 'date' },
    bank_id:  { required: true, type: 'number', min: 1 },
  },
  // ...
};

export function validate(schemaName, data) {
  const schema = schemas[schemaName];
  if (!schema) return { ok: true, value: data };
  const errors = [];
  const cleaned = {};

  for (const [field, rules] of Object.entries(schema)) {
    let val = data[field];
    if (typeof val === 'string' && rules.trim) val = val.trim();
    if (typeof val === 'string' && rules.upper) val = val.toUpperCase();

    if (rules.required && (val === undefined || val === null || val === '')) {
      errors.push(`${field}: مطلوب`);
      continue;
    }
    if (val === undefined || val === null || val === '') {
      if (rules.default !== undefined) cleaned[field] = rules.default;
      continue;
    }
    if (rules.type === 'number') {
      if (!isNum(val)) { errors.push(`${field}: يجب أن يكون رقمًا`); continue; }
      val = +val;
      if (rules.min !== undefined && val < rules.min) errors.push(`${field}: أصغر من ${rules.min}`);
      if (rules.max !== undefined && val > rules.max) errors.push(`${field}: أكبر من ${rules.max}`);
    }
    if (rules.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      errors.push(`${field}: تاريخ غير صالح`);
    }
    if (rules.maxLength && String(val).length > rules.maxLength) {
      errors.push(`${field}: أطول من ${rules.maxLength} حرف`);
    }
    if (rules.in) {
      const allowed = typeof rules.in === 'function' ? rules.in() : rules.in;
      if (!allowed.includes(val)) errors.push(`${field}: قيمة غير مسموحة`);
    }
    cleaned[field] = val;
  }

  return { ok: errors.length === 0, errors, value: cleaned };
}

// استخدام:
// const v = validate('bank', formData);
// if (!v.ok) return toast(v.errors.join(' · '), false);
// await repo.addBank(v.value);
