// ══════════════════════════════════════════════════════════════════
//  telegram.js — إشعارات وتقارير عبر Telegram
//  لا يحتاج backend — يعمل مباشرة من المتصفح (CORS مدعوم)
// ══════════════════════════════════════════════════════════════════
import { APP_SETTINGS } from '../state.js';
import { N2, fmt, fmtN, today, baseCur } from '../core/utils.js';
import { calcTotals } from './calc.js';

const API = 'https://api.telegram.org/bot';

// ══════════════════ الإعدادات ══════════════════

export function getTelegramConfig() {
  return APP_SETTINGS.telegram || {
    enabled: false,
    bot_token: '',
    chat_id: '',
    daily_summary: true,
    notify_low_balance: true,
    notify_cert_maturity: true,
    notify_debts: true,
    last_daily_sent: null
  };
}

export function saveTelegramConfig(cfg) {
  APP_SETTINGS.telegram = { ...getTelegramConfig(), ...cfg };
}

// ══════════════════ الأساسيات ══════════════════

/**
 * يتأكد أن Bot Token صالح ويعيد بيانات البوت.
 */
export async function verifyBotToken(token) {
  if (!token) throw new Error('أدخل Bot Token أولاً');
  try {
    const res = await fetch(`${API}${token}/getMe`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'Token غير صالح');
    return data.result;
  } catch (e) {
    if (e.message.includes('Failed to fetch')) throw new Error('تعذّر الاتصال بـ Telegram — تحقق من الإنترنت');
    throw e;
  }
}

/**
 * يجلب آخر الرسائل المُرسلة للبوت — لاكتشاف chat_id.
 * يجب أن يرسل المستخدم رسالة واحدة للبوت أولاً.
 */
export async function detectChatId(token) {
  if (!token) throw new Error('أدخل Bot Token أولاً');
  const res = await fetch(`${API}${token}/getUpdates?limit=10`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'فشل جلب التحديثات');

  if (!data.result?.length) {
    throw new Error('لم يتم العثور على رسائل — افتح بوتك على Telegram واضغط Start أولاً');
  }

  // آخر محادثة
  const last = data.result[data.result.length - 1];
  const chatId = last.message?.chat?.id;
  if (!chatId) throw new Error('تعذّر استخراج chat_id');

  return {
    chat_id: String(chatId),
    username: last.message.from?.username || '',
    first_name: last.message.from?.first_name || ''
  };
}

/**
 * يرسل رسالة عبر البوت.
 * @param {string} text - نص الرسالة (Markdown مدعوم جزئياً)
 */
export async function sendTelegramMessage(text, opts = {}) {
  const cfg = getTelegramConfig();
  if (!cfg.bot_token || !cfg.chat_id) {
    throw new Error('لم يتم إعداد Telegram');
  }

  const body = {
    chat_id: cfg.chat_id,
    text,
    parse_mode: opts.parseMode || 'HTML',
    disable_notification: opts.silent === true,
    disable_web_page_preview: true
  };

  try {
    const res = await fetch(`${API}${cfg.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'فشل إرسال الرسالة');
    return data.result;
  } catch (e) {
    if (e.message.includes('Failed to fetch')) throw new Error('تعذّر الاتصال بـ Telegram');
    throw e;
  }
}

// ══════════════════ اختبار الاتصال ══════════════════

export async function testTelegram() {
  const cfg = getTelegramConfig();
  if (!cfg.bot_token || !cfg.chat_id) {
    throw new Error('أكمل إعدادات البوت أولاً');
  }

  const botInfo = await verifyBotToken(cfg.bot_token);
  const msg = `🔔 <b>اختبار ناجح</b>

البوت: <code>@${botInfo.username}</code>
الوقت: ${new Date().toLocaleString('ar-EG')}

ستصلك الإشعارات على هذا الحساب من الآن.`;

  await sendTelegramMessage(msg);
  return botInfo;
}

// ══════════════════ بناء الرسائل ══════════════════

/**
 * يبني ملخص المحفظة اليومي.
 */
export function buildDailySummary() {
  const T = calcTotals();
  const cur = baseCur();

  const lines = [
    `📊 <b>ملخص محفظتك — ${today()}</b>`,
    '',
    `💰 <b>الإجمالي:</b> ${escapeTg(fmt(T.grand))}`,
    `   • بنوك: ${escapeTg(fmt(T.totalBanks))}`,
    `   • أسهم: ${escapeTg(fmt(T.stocksVal))} (${T.pnlStocks >= 0 ? '+' : ''}${escapeTg(fmt(T.pnlStocks))})`,
    `   • معادن: ${escapeTg(fmt(T.metalsVal))} (${T.pnlMetals >= 0 ? '+' : ''}${escapeTg(fmt(T.pnlMetals))})`,
    `   • شهادات: ${escapeTg(fmt(T.certsTotal))}`,
    '',
    `📈 <b>العائد:</b> ${T.totalPnl >= 0 ? '+' : ''}${escapeTg(fmt(T.totalPnl))}`,
  ];

  if (T.debtsOwed > 0) {
    lines.push(`⚠️ <b>ديون عليك:</b> ${escapeTg(fmt(T.debtsOwed))}`);
  }

  lines.push('');
  lines.push(`🕐 ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`);

  return lines.join('\n');
}

/**
 * إشعار انخفاض رصيد.
 */
export function buildLowBalanceMsg(bank) {
  return `⚠️ <b>تنبيه رصيد منخفض</b>

البنك: <b>${escapeTg(bank.name)}</b>
الرصيد الحالي: <code>${escapeTg(fmtN(bank.balance, 2))} ${escapeTg(bank.currency || 'EGP')}</code>
الحد الأدنى: <code>${escapeTg(fmtN(bank.min_balance, 2))}</code>

💡 راجع حساباتك أو حوّل مبلغاً لهذا الحساب.`;
}

/**
 * إشعار شهادة منتهية.
 */
export function buildCertMaturityMsg(cert) {
  return `📜 <b>شهادة بحاجة للاسترداد</b>

الشهادة: <b>${escapeTg(cert.name)}</b>
البنك: ${escapeTg(cert.bank_name || '—')}
المبلغ: <code>${escapeTg(fmt(cert.amount))}</code>
تاريخ الاستحقاق: ${cert.maturity_date}

💡 افتح التطبيق لاسترداد الأصل + العائد المتبقي.`;
}

/**
 * إشعار دين متأخر.
 */
export function buildDebtOverdueMsg(debt, daysLate) {
  return `🔴 <b>دين متأخر</b>

الوصف: <b>${escapeTg(debt.name)}</b>
الطرف: ${escapeTg(debt.party || '—')}
المتبقي: <code>${escapeTg(fmt(debt.remaining))}</code>
متأخر منذ: <b>${daysLate} يوم</b>

💡 بادر بالسداد أو تواصل مع الطرف الآخر.`;
}

// ══════════════════ مُرسل تلقائي ══════════════════

/**
 * يرسل الملخص اليومي إن لم يُرسَل اليوم.
 */
export async function trySendDailySummary() {
  const cfg = getTelegramConfig();
  if (!cfg.enabled || !cfg.daily_summary) return { sent: false, reason: 'disabled' };

  const todayStr = today();
  if (cfg.last_daily_sent === todayStr) return { sent: false, reason: 'already-sent' };

  try {
    await sendTelegramMessage(buildDailySummary());
    saveTelegramConfig({ last_daily_sent: todayStr });
    return { sent: true };
  } catch (e) {
    console.warn('[telegram] daily summary failed:', e.message);
    return { sent: false, error: e.message };
  }
}

/**
 * يُرسل تنبيهات لكل الحالات الطارئة (شهادات منتهية + أرصدة منخفضة).
 */
export async function sendUrgentAlerts() {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { sent: 0 };

  let sent = 0;

  // شهادات منتهية
  if (cfg.notify_cert_maturity) {
    const matured = (DB.certs || []).filter(c => !c.matured_at && c.maturity_date <= today());
    for (const cert of matured) {
      try {
        await sendTelegramMessage(buildCertMaturityMsg(cert));
        sent++;
      } catch (e) { console.warn('[telegram] cert alert failed:', e.message); }
    }
  }

  // أرصدة منخفضة
  if (cfg.notify_low_balance) {
    const lowBanks = (DB.banks || []).filter(b =>
      b.is_active !== false && N2(b.min_balance) > 0 && N2(b.balance) < N2(b.min_balance)
    );
    for (const bank of lowBanks) {
      try {
        await sendTelegramMessage(buildLowBalanceMsg(bank));
        sent++;
      } catch (e) { console.warn('[telegram] low balance failed:', e.message); }
    }
  }

  // ديون متأخرة
  if (cfg.notify_debts) {
    const now = new Date();
    const overdue = (DB.debts || []).filter(d =>
      d.due_date && new Date(d.due_date) < now && N2(d.remaining) > 0
    );
    for (const debt of overdue) {
      try {
        const daysLate = Math.ceil((now - new Date(debt.due_date)) / 86400000);
        await sendTelegramMessage(buildDebtOverdueMsg(debt, daysLate));
        sent++;
      } catch (e) { console.warn('[telegram] debt alert failed:', e.message); }
    }
  }

  return { sent };
}

// ══════════════════ Helpers ══════════════════

function escapeTg(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
