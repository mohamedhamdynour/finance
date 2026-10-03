// ══════════════════════════════════════════════════════════════════
//  settings.js — إعدادات التطبيق + العملات + الحفظ
// ══════════════════════════════════════════════════════════════════
import { conn, APP_SETTINGS } from '../state.js';
import { sbGet, sbPost, sbPatchBy } from './supabase.js';
import { baseCur, currencyCodes, N2, escapeHtml } from './utils.js';

// ─── تسميات عملات معروفة (تُستخدم لملء الاسم الافتراضي) ───────
export const CURRENCY_LABELS = {
  EGP: 'الجنيه المصري', SAR: 'ريال سعودي', AED: 'درهم إماراتي',
  USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني',
  KWD: 'دينار كويتي', QAR: 'ريال قطري', BHD: 'دينار بحريني',
  OMR: 'ريال عماني', JOD: 'دينار أردني'
};

// ─── ترحيل قائمة العملات من صيغة قديمة (سلاسل) إلى كائنات ──────
export function normalizeCurrencies() {
  APP_SETTINGS.currencies = (APP_SETTINGS.currencies || []).map(c =>
    typeof c === 'string'
      ? { code: c, name: CURRENCY_LABELS[c] || c }
      : { code: c.code, name: c.name || CURRENCY_LABELS[c.code] || c.code }
  );
}

// ─── تحميل الإعدادات من Supabase أو localStorage ───────────────
export async function loadAppSettings() {
  try {
    const rows = await sbGet('app_settings', '?limit=1');
    if (rows && rows.length && rows[0].value) {
      APP_SETTINGS.exchange_name = rows[0].value.exchange_name ?? APP_SETTINGS.exchange_name;
      APP_SETTINGS.base_currency = rows[0].value.base_currency ?? APP_SETTINGS.base_currency;
      APP_SETTINGS.currencies = rows[0].value.currencies ?? APP_SETTINGS.currencies;
      APP_SETTINGS.goldapi_key = rows[0].value.goldapi_key ?? APP_SETTINGS.goldapi_key;
      if (rows[0].value.zakat) {
        APP_SETTINGS.zakat = { ...APP_SETTINGS.zakat, ...rows[0].value.zakat };
      }
      conn.settingsBackend = 'supabase';
    } else {
      // لا يوجد صف لهذا المستخدم — أنشئ واحدًا
      await sbPost('app_settings', [{ value: APP_SETTINGS }]);
      conn.settingsBackend = 'supabase';
    }
    normalizeCurrencies();
    return;
  } catch (e) { /* الجدول غير موجود — fallback */ }

  // Fallback: localStorage
  conn.settingsBackend = 'local';
  try {
    const raw = localStorage.getItem('appSettings');
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(APP_SETTINGS, parsed);
      if (parsed.zakat) APP_SETTINGS.zakat = { ...APP_SETTINGS.zakat, ...parsed.zakat };
    }
  } catch (e) {}
  normalizeCurrencies();
}

// ─── حفظ الإعدادات ─────────────────────────────────────────────
export async function persistAppSettings() {
  if (conn.settingsBackend === 'supabase') {
    try {
      const uid = conn.authSession?.user?.id;
      if (!uid) {
        conn.settingsBackend = 'local';
      } else {
        const rows = await sbGet('app_settings', '?limit=1');
        if (rows && rows.length) {
          await sbPatchBy('app_settings', 'user_id=eq.' + uid, { value: APP_SETTINGS });
        } else {
          await sbPost('app_settings', [{ value: APP_SETTINGS }]);
        }
        return;
      }
    } catch (e) {
      console.warn('persistAppSettings supabase failed, falling back to local:', e.message);
      conn.settingsBackend = 'local';
    }
  }
  try { localStorage.setItem('appSettings', JSON.stringify(APP_SETTINGS)); } catch (e) {}
}

// ─── ملء قوائم العملات في النماذج ─────────────────────────────
export function populateCurrencySelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  const codes = currencyCodes();
  sel.innerHTML = APP_SETTINGS.currencies
    .map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`)
    .join('');
  if (cur && codes.includes(cur)) sel.value = cur;
  else if (codes.includes(baseCur())) sel.value = baseCur();
}

export function populateAllCurrencySelects() {
  ['ebuy-currency', 'eb-currency', 'ecert-currency', 'emb-currency']
    .forEach(populateCurrencySelect);
}

// ─── تحديث وسوم "<span class="cur-unit">" في كامل الصفحة ──────
export function updateCurrencyLabels() {
  document.querySelectorAll('.cur-unit').forEach(el => el.textContent = baseCur());
}

// ─── إضافة عملة جديدة ──────────────────────────────────────────
export function addSettingsCurrency() {
  const code = document.getElementById('st-new-currency-code').value.trim().toUpperCase();
  const name = document.getElementById('st-new-currency-name').value.trim();
  if (!code || code.length < 3) return alert('أدخل كود عملة صحيح (3 أحرف مثل USD)');
  if (!name) return alert('أدخل اسم العملة');
  if (currencyCodes().includes(code)) return alert('العملة موجودة بالفعل');
  APP_SETTINGS.currencies.push({ code, name });
  document.getElementById('st-new-currency-code').value = '';
  document.getElementById('st-new-currency-name').value = '';
  persistAppSettings();
  renderSettings();
  populateAllCurrencySelects();
  if (window.toast) window.toast('تمت الإضافة');
}

// ─── تعديل اسم عملة ────────────────────────────────────────────
export function renameSettingsCurrency(code, newName) {
  newName = (newName || '').trim();
  const entry = APP_SETTINGS.currencies.find(c => c.code === code);
  if (!entry || !newName || entry.name === newName) return;
  entry.name = newName;
  persistAppSettings();
  populateAllCurrencySelects();
}

// ─── حذف عملة ──────────────────────────────────────────────────
export function removeSettingsCurrency(code) {
  if (code === baseCur()) return alert('لا يمكن حذف العملة الأساسية الحالية');
  if (!confirm('حذف عملة ' + code + ' من القائمة؟')) return;
  APP_SETTINGS.currencies = APP_SETTINGS.currencies.filter(x => x.code !== code);
  persistAppSettings();
  renderSettings();
  populateAllCurrencySelects();
}

// ─── callback يُسجِّله main.js لإعادة التحميل عند تغيير العملة ──
let _onSettingsChanged = null;
export function setSettingsChangeHandler(fn) { _onSettingsChanged = fn; }

// ─── حفظ الإعدادات العامة ──────────────────────────────────────
export async function saveGeneralSettings() {
  const oldBase = baseCur();
  APP_SETTINGS.exchange_name = document.getElementById('st-exchange-name').value.trim();
  const newBase = document.getElementById('st-base-currency').value || 'EGP';
  APP_SETTINGS.base_currency = newBase;
  await persistAppSettings();
  updateCurrencyLabels();
  populateAllCurrencySelects();

  if (newBase !== oldBase) {
    if (window.toast) window.toast('تم تغيير العملة الأساسية — جاري تحديث كل الأرقام...');
    if (_onSettingsChanged) await _onSettingsChanged();
  } else {
    if (window.toast) window.toast('تم الحفظ');
  }
}

// ─── حفظ مفتاح GoldAPI.io ──────────────────────────────────────
export function saveGoldApiKey() {
  const key = document.getElementById('st-goldapi-key').value.trim();
  APP_SETTINGS.goldapi_key = key;
  persistAppSettings();
  if (window.toast) window.toast(key ? 'تم حفظ المفتاح' : 'تم مسح المفتاح');
}

// ─── قوائم أنواع المعادن حسب العملة الأساسية ──────────────────
export const METAL_TYPES_BY_CURRENCY = {
  EGP:     ['ذهب 24','ذهب 21','ذهب 18','جنيه ذهب','سبيكة ذهب','فضة'],
  SAR:     ['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة'],
  AED:     ['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة'],
  DEFAULT: ['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة']
};

export function getMetalTypeList() {
  return METAL_TYPES_BY_CURRENCY[baseCur()] || METAL_TYPES_BY_CURRENCY.DEFAULT;
}

export function populateMetalTypeSelect(presetValue) {
  const sel = document.getElementById('emb-metal-type');
  if (!sel) return;
  const list = getMetalTypeList();
  const cur = presetValue || sel.value;
  sel.innerHTML = list.map(t => `<option>${t}</option>`).join('')
    + '<option value="__custom__">أخرى (تحديد يدوي)</option>';
  if (cur && list.includes(cur)) sel.value = cur;
  else if (cur) {
    sel.insertAdjacentHTML('beforeend', `<option value="${cur}" selected>${cur}</option>`);
  }
  onMetalTypeChange();
}

export function onMetalTypeChange() {
  const sel = document.getElementById('emb-metal-type');
  const customEl = document.getElementById('emb-metal-custom');
  if (!sel || !customEl) return;
  customEl.classList.toggle('hidden', sel.value !== '__custom__');
  // نُطلق حدث مخصص بدل استدعاء updateMetalBuyPreview مباشرة (داخل النطاق الصحيح)
  document.dispatchEvent(new CustomEvent('metalTypeChange'));
}

// ─── عرض صفحة الإعدادات ────────────────────────────────────────
export function renderSettings() {
  const nameEl = document.getElementById('st-exchange-name');
  if (nameEl) nameEl.value = APP_SETTINGS.exchange_name || '';
  const goldKeyEl = document.getElementById('st-goldapi-key');
  if (goldKeyEl) goldKeyEl.value = APP_SETTINGS.goldapi_key || '';

  const baseSel = document.getElementById('st-base-currency');
  if (baseSel) {
    baseSel.innerHTML = APP_SETTINGS.currencies
      .map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`)
      .join('');
    baseSel.value = baseCur();
  }

  const listEl = document.getElementById('st-currencies-list');
  if (listEl) {
    listEl.innerHTML = APP_SETTINGS.currencies.map(c =>
      `<span class="badge badge-blue" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:11.5px">
        <strong>${escapeHtml(c.code)}</strong> - <span contenteditable="true" spellcheck="false" style="outline:none;border-bottom:1px dashed currentColor" onblur="window.__renameSettingsCurrency('${c.code}',this.textContent)">${escapeHtml(c.name)}</span>
        ${c.code !== baseCur() ? `<span style="cursor:pointer;font-weight:900" onclick="window.__removeSettingsCurrency('${c.code}')" title="حذف">×</span>` : ''}
      </span>`
    ).join('');
  }

  const modeEl = document.getElementById('st-storage-mode');
  if (modeEl) {
    modeEl.innerHTML = conn.settingsBackend === 'supabase'
      ? '<span style="color:var(--green)">✓ الإعدادات متزامنة عبر قاعدة البيانات على كل أجهزتك</span>'
      : '<span style="color:var(--gold)">⚠ الإعدادات محفوظة على هذا الجهاز فقط. تأكد من تشغيل schema.sql.</span>';
  }

  renderSchemaAlert();
}

// ─── تنبيه أعمدة قاعدة البيانات الناقصة ────────────────────────
const COLUMN_TYPE_HINTS = { currency: 'text', market: 'text', price_currency: 'text' };

export function renderSchemaAlert() {
  const el = document.getElementById('st-live-schema-alert');
  if (!el) return;
  const warnings = window.__schemaWarnings ? [...window.__schemaWarnings] : [];
  if (!warnings.length) {
    el.innerHTML = '<span style="color:var(--green)">✓ لا توجد تنبيهات — قاعدة البيانات متوافقة مع كل ميزات التطبيق الحالية.</span>';
    return;
  }
  const alterLines = warnings.map(w => {
    const [table, col] = w.split('.');
    return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${COLUMN_TYPE_HINTS[col] || 'text'};`;
  });
  el.innerHTML = `
    <div style="color:var(--red);font-weight:800;margin-bottom:6px">⚠ قاعدة بياناتك ناقصة ${warnings.length} عمود:</div>
    <ul style="margin:0 0 8px 18px;padding:0">${warnings.map(w => `<li><code>${escapeHtml(w)}</code></li>`).join('')}</ul>
    <code style="font-size:10.5px;display:block;background:var(--surface2);padding:8px;border-radius:6px;direction:ltr;text-align:left;white-space:pre-line">${escapeHtml(alterLines.join('\n'))}</code>`;
}
