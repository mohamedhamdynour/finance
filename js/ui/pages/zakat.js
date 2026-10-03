// ══════════════════════════════════════════════════════════════════
//  pages/zakat.js — الزكاة
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../../state.js';
import { N2, fmt, fmtN, today, escapeHtml, toEGP } from '../../core/utils.js';
import { sbPost } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals } from '../../domain/calc.js';
import { hijriParts, hijriLabel, addHijriYear } from '../../domain/calc.js';
import { persistAppSettings } from '../../core/settings.js';

const reload = () => window.loadAll?.();

export function getZakatItems() {
  const T = calcTotals();
  return [
    { key: 'banks', label: 'أرصدة الحسابات البنكية والنقد', note: 'نقود — تُزكّى كاملة', value: T.totalBanks, defaultInclude: true },
    { key: 'stocks', label: 'الأسهم والصناديق', note: 'عروض تجارة — بالقيمة السوقية وقت الوجوب', value: T.stocksVal, defaultInclude: true },
    { key: 'metals', label: 'الذهب والفضة المُدَّخرة', note: 'للادخار/الاستثمار', value: T.metalsVal, defaultInclude: true },
    { key: 'certs_principal', label: 'أصل الشهادات الادخارية', note: 'مال مُدَّخر — يُزكّى أصله', value: T.certsTotal, defaultInclude: true },
    { key: 'debts_owing', label: 'ديون لك عند الغير', note: 'تُزكّى إن كانت مرجوّة السداد', value: T.debtsOwing, defaultInclude: false },
    { key: 'debts_owed', label: 'ديون عليك (الحالّة فقط)', note: 'تُخصم إن كانت مستحقة الأداء', value: -T.debtsOwed, defaultInclude: true }
  ];
}

export function previewZakatHijri() {
  const v = document.getElementById('zk-start-date').value;
  const el = document.getElementById('zk-start-hijri');
  if (el) el.textContent = v ? 'يوافق: ' + hijriLabel(v) : '';
}

export function zakatGoldPrice24() {
  const price = t => {
    const p = DB.metalPrices.find(x => x.metal_type === t);
    return p ? N2(p.price_per_gram) : 0;
  };
  return price('ذهب 24') || price('ذهب 24 قيراط') ||
         (price('ذهب 21') ? price('ذهب 21') * 24 / 21 : 0) ||
         (price('ذهب 21 قيراط') ? price('ذهب 21 قيراط') * 24 / 21 : 0) ||
         (price('ذهب 18') ? price('ذهب 18') * 24 / 18 : 0) || 0;
}

export function autofillZakatPrices() {
  const g = zakatGoldPrice24();
  const s = DB.metalPrices.find(x => x.metal_type === 'فضة');
  if (g) document.getElementById('zk-gold-price').value = g.toFixed(2);
  if (s) document.getElementById('zk-silver-price').value = N2(s.price_per_gram).toFixed(2);
  if (!g && !s) return alert('لا توجد أسعار ذهب/فضة');
  saveZakatSettings();
}

export function renderZakat() {
  const z = APP_SETTINGS.zakat || {};
  document.getElementById('zk-start-date').value = z.start_date || '';
  document.getElementById('zk-gold-price').value = z.gold_price || '';
  document.getElementById('zk-silver-price').value = z.silver_price || '';
  document.getElementById('zk-basis').value = z.basis || 'gold';
  previewZakatHijri();

  document.getElementById('zakat-breakdown-tbody').innerHTML = getZakatItems().map(it => {
    const included = z.include && (it.key in z.include) ? z.include[it.key] : it.defaultInclude;
    return `<tr>
      <td style="font-size:12px"><div style="font-weight:700">${escapeHtml(it.label)}</div><div style="font-size:10px;color:var(--muted)">${escapeHtml(it.note)}</div></td>
      <td class="td-num" style="font-weight:700">${fmt(it.value)}</td>
      <td><input type="checkbox" ${included ? 'checked' : ''} onchange="toggleZakatInclude('${it.key}',this.checked)" style="width:18px;height:18px;cursor:pointer"></td>
    </tr>`;
  }).join('');

  computeAndRenderZakat();
  renderZakatHistory();
}

export function toggleZakatInclude(key, val) {
  APP_SETTINGS.zakat.include = APP_SETTINGS.zakat.include || {};
  APP_SETTINGS.zakat.include[key] = val;
  persistAppSettings();
  computeAndRenderZakat();
}

export function saveZakatSettings() {
  const z = APP_SETTINGS.zakat = APP_SETTINGS.zakat || {};
  z.start_date = document.getElementById('zk-start-date').value || null;
  z.gold_price = N2(document.getElementById('zk-gold-price').value) || null;
  z.silver_price = N2(document.getElementById('zk-silver-price').value) || null;
  z.basis = document.getElementById('zk-basis').value || 'gold';
  persistAppSettings();
  toast('تم الحفظ');
  previewZakatHijri();
  computeAndRenderZakat();
}

export function zakatState() {
  const z = APP_SETTINGS.zakat || {};
  const base = getZakatItems().reduce((a, it) => a + ((z.include && (it.key in z.include) ? z.include[it.key] : it.defaultInclude) ? it.value : 0), 0);
  const nisabGold = z.gold_price ? 85 * N2(z.gold_price) : null;
  const nisabSilver = z.silver_price ? 595 * N2(z.silver_price) : null;
  const basis = z.basis === 'silver' ? 'silver' : 'gold';
  const nisab = basis === 'silver' ? nisabSilver : nisabGold;
  const nisabLabel = basis === 'silver' ? '595 جم فضة خالصة' : '85 جم ذهب عيار 24';

  let hawl = null;
  if (z.start_date) {
    const end = addHijriYear(z.start_date);
    const now = today();
    const total = (new Date(end) - new Date(z.start_date)) / 86400000;
    const elapsed = (new Date(now) - new Date(z.start_date)) / 86400000;
    hawl = {
      start: z.start_date, end,
      complete: now >= end,
      daysLeft: Math.ceil((new Date(end) - new Date(now)) / 86400000),
      pct: Math.max(0, Math.min(100, elapsed / total * 100))
    };
  }
  const meets = nisab !== null && base >= nisab;
  return { z, base, nisab, nisabLabel, hawl, meets, due: base > 0 ? base * 0.025 : 0, isDue: meets && !!hawl && hawl.complete };
}

export function computeAndRenderZakat() {
  const S = zakatState();
  const { base, nisab, nisabLabel, hawl, meets, due, isDue } = S;

  document.getElementById('zakat-kpis').innerHTML =
    kpi('الوعاء الزكوي', fmt(base), 'صافي الأموال بعد الديون', 'var(--teal)', svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>')) +
    kpi('النصاب', nisab ? fmt(nisab) : '—', nisab ? nisabLabel : 'أدخل سعر الذهب', 'var(--gold)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    kpi('الزكاة (٢٫٥٪)', fmt(due), meets ? (isDue ? 'مستحقة الآن' : 'بلغ النصاب — بانتظار الحول') : 'لم يبلغ النصاب', isDue ? 'var(--green)' : 'var(--muted)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>'));

  const hp = document.getElementById('zk-hawl-panel');
  hp.innerHTML = hawl
    ? `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;margin-bottom:8px">
        <div><span style="color:var(--muted)">بداية الحول:</span> <strong>${hawl.start}</strong> <span style="color:var(--muted)">(${hijriLabel(hawl.start)})</span></div>
        <div><span style="color:var(--muted)">نهاية الحول:</span> <strong>${hawl.end}</strong> <span style="color:var(--muted)">(${hijriLabel(hawl.end)})</span></div>
      </div>
      <div class="prog-wrap lg"><div class="prog-bar" style="width:${hawl.pct}%;background:${hawl.complete ? 'var(--green)' : 'var(--gold)'}"></div></div>
      <div style="margin-top:8px;font-size:12px;font-weight:700;color:${hawl.complete ? 'var(--green)' : 'var(--gold)'}">${hawl.complete ? '✓ اكتمل الحول' : 'متبقٍ ' + hawl.daysLeft + ' يوم'}</div>`
    : `<div style="color:var(--muted);font-size:12px">حدّد تاريخ بداية الحول</div>`;

  document.getElementById('zakat-result').innerHTML = !nisab
    ? `<div style="padding:20px;text-align:center;color:var(--muted)">أدخل سعر الذهب</div>`
    : isDue
      ? `<div style="text-align:center;padding:14px">
          <div style="font-size:13px;color:var(--muted)">الزكاة المستحقة</div>
          <div style="font-size:32px;font-weight:900;color:var(--green)">${fmt(due)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">٢٫٥٪ من ${fmt(base)} — بلغ النصاب واكتمل الحول</div>
          <button class="btn btn-success" style="margin-top:14px" onclick="openZakatPay()">تسجيل إخراج الزكاة</button>
        </div>`
      : `<div style="text-align:center;padding:14px;color:var(--muted);font-size:13px">${!meets ? 'الوعاء (' + fmt(base) + ') لم يبلغ النصاب (' + fmt(nisab) + ')' : (hawl ? 'بلغ النصاب، والزكاة تجب عند ' + hawl.end : 'بلغ النصاب — حدّد تاريخ بداية الحول.')}</div>`;
}

export function renderZakatHistory() {
  const h = (APP_SETTINGS.zakat && APP_SETTINGS.zakat.history) || [];
  document.getElementById('zakat-history-tbody').innerHTML = h.length
    ? [...h].reverse().map((r, i) => `<tr>
        <td>${r.date}</td><td class="muted">${hijriLabel(r.date)}</td>
        <td class="td-num pos" style="font-weight:800">${fmt(r.amount)}</td>
        <td class="td-num muted">${fmt(r.base)}</td><td>${escapeHtml(r.bank_name || '—')}</td>
        <td><button class="btn-icon danger" onclick="deleteZakatRecord(${h.length - 1 - i})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></td>
      </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">لم تُسجَّل زكاة بعد</td></tr>`;
}

export function deleteZakatRecord(idx) {
  if (!confirm('حذف هذا السطر من سجل الزكاة؟')) return;
  APP_SETTINGS.zakat.history.splice(idx, 1);
  persistAppSettings();
  renderZakatHistory();
}

export function openZakatPay() {
  const S = zakatState();
  document.getElementById('zpay-amount').value = S.due.toFixed(2);
  document.getElementById('zpay-date').value = today();
  populateSelect('zpay-bank');
  openModal('modal-zakat-pay');
}

export async function doZakatPay() {
  const S = zakatState();
  const amount = N2(document.getElementById('zpay-amount').value);
  const bankId = +document.getElementById('zpay-bank').value;
  const dt = document.getElementById('zpay-date').value || today();
  if (!amount || amount <= 0) return alert('أدخل المبلغ');
  if (!bankId) return alert('اختر الحساب');
  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');
  const perUnit = toEGP(1, bank.currency || 'EGP') || 1;
  const amtBank = +(amount / perUnit).toFixed(4);
  if (N2(bank.balance) < amtBank) return alert('الرصيد غير كافٍ');
  try {
    await sbPost('bank_transactions', [{ bank_id: bankId, type: 'سحب', amount: amtBank, date: dt, notes: 'زكاة المال', category: 'زكاة' }]);
    const z = APP_SETTINGS.zakat;
    z.history = z.history || [];
    z.history.push({ date: dt, amount, base: S.base, bank_id: bankId, bank_name: bank.name, hawl_end: S.hawl ? S.hawl.end : null });
    if (S.hawl) z.start_date = S.hawl.end;
    await persistAppSettings();
    closeModal('modal-zakat-pay');
    toast('تم تسجيل إخراج الزكاة');
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}
