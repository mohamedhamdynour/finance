// ══════════════════════════════════════════════════════════════════
//  cert-maturation.js — استرداد الشهادات المنتهية تلقائياً
// ══════════════════════════════════════════════════════════════════
import { DB, conn } from '../state.js';
import { N2, today } from '../core/utils.js';
import { sbPost, sbPatch } from '../core/supabase.js';

const LAST_RUN_KEY = 'certMaturationLastRun';

/**
 * الشهادات التي انتهت ولم تُستردّ بعد.
 */
export function detectMaturedCerts() {
  const todayStr = today();
  return DB.certs.filter(c => {
    if (c.matured_at) return false;
    if (c.maturity_date > todayStr) return false;
    return true;
  });
}

/**
 * يعالج شهادة منتهية واحدة.
 */
export async function matureCert(cert) {
  if (!cert.bank_id) throw new Error('الشهادة بدون حساب بنكي مرتبط');

  const bank = DB.banks.find(b => b.id === cert.bank_id);
  if (!bank) throw new Error('الحساب البنكي المرتبط غير موجود');

  const remainingInterest = Math.max(0, N2(cert.total_interest) - N2(cert.interest_paid));
  const refund = N2(cert.amount) + remainingInterest;
  const newBalance = +(N2(bank.balance) + refund).toFixed(4);

  // 1) حركة بنكية
  await sbPost('bank_transactions', [{
    bank_id: cert.bank_id,
    type: 'إيداع',
    amount: refund,
    date: cert.maturity_date,
    notes: `استرداد شهادة: ${cert.name} (${cert.maturity_date})` +
           (remainingInterest > 0 ? ` — عائد متبقي: ${remainingInterest.toFixed(2)}` : ''),
    category: 'استرداد شهادة'
  }]);

  // 2) تحديث الرصيد
  await sbPatch('banks', cert.bank_id, { balance: newBalance });

  // 3) وسم الشهادة
  await sbPatch('certificates', cert.id, {
    matured_at: new Date().toISOString(),
    matured_amount: refund
  });

  return {
    cert_name: cert.name,
    refund,
    remaining_interest: remainingInterest,
    bank_name: bank.name
  };
}

/**
 * يعالج كل الشهادات المنتهية دفعة واحدة.
 */
export async function processMaturedCerts(force = false) {
  const todayStr = today();
  if (!force && localStorage.getItem(LAST_RUN_KEY) === todayStr) {
    return { processed: 0, results: [], skipped: true };
  }

  const uid = conn.authSession?.user?.id;
  if (!uid) return { processed: 0, results: [], skipped: true };

  const matured = detectMaturedCerts();
  if (!matured.length) {
    localStorage.setItem(LAST_RUN_KEY, todayStr);
    return { processed: 0, results: [], skipped: false };
  }

  const results = [];
  for (const cert of matured) {
    try {
      const r = await matureCert(cert);
      results.push({ ...r, ok: true });
    } catch (e) {
      console.warn(`[cert-maturation] فشل استرداد "${cert.name}":`, e.message);
      results.push({ cert_name: cert.name, ok: false, error: e.message });
    }
  }

  localStorage.setItem(LAST_RUN_KEY, todayStr);
  return { processed: results.filter(r => r.ok).length, results, skipped: false };
}
