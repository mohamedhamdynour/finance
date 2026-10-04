// ══════════════════════════════════════════════════════════════════
//  telegram-setup.js — واجهة إعداد Telegram Bot
// ══════════════════════════════════════════════════════════════════
import { escapeHtml } from '../core/utils.js';
import { toast } from './toast.js';
import { persistAppSettings } from '../core/settings.js';
import {
  getTelegramConfig, saveTelegramConfig,
  verifyBotToken, detectChatId, testTelegram,
  sendTelegramMessage, buildDailySummary
} from '../domain/telegram.js';

/**
 * يُرجع HTML كامل لكارت إعداد Telegram.
 */
export function renderTelegramCard() {
  const cfg = getTelegramConfig();
  const configured = !!(cfg.bot_token && cfg.chat_id);

  return `
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:#229ED9;color:#fff">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13"/>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </div>
          إشعارات Telegram
        </div>
        ${configured ? `<span class="badge badge-green">مفعّل</span>` : `<span class="badge badge-gray">غير مُعدّ</span>`}
      </div>
      <div class="card-body">
        <div class="form-hint" style="margin-bottom:14px;line-height:1.9">
          استقبل <strong>ملخصاً يومياً</strong> و<strong>تنبيهات فورية</strong> (شهادة منتهية، رصيد منخفض، دين متأخر) على Telegram.
          <br>الإعداد يستغرق دقيقة واحدة — لا يحتاج أي خدمة مدفوعة.
        </div>

        <!-- دليل الإعداد -->
        ${!configured ? `
          <details style="margin-bottom:14px;padding:12px;background:var(--surface2);border-radius:10px;border:.5px solid var(--border)">
            <summary style="cursor:pointer;font-weight:800;font-size:12.5px;color:var(--blue)">
              📖 خطوات الإعداد (اضغط للعرض)
            </summary>
            <ol style="margin:10px 18px 0;padding:0;font-size:12px;color:var(--muted);line-height:2">
              <li>افتح Telegram → ابحث عن <code>@BotFather</code></li>
              <li>أرسل <code>/newbot</code> ثم اتبع التعليمات</li>
              <li>انسخ <strong>Bot Token</strong> (يبدأ بـ <code>123456:ABC...</code>)</li>
              <li>الصقه في الحقل أدناه</li>
              <li>افتح بوتك الجديد على Telegram واضغط <strong>Start</strong></li>
              <li>اضغط <strong>"اكتشاف Chat ID"</strong> في التطبيق</li>
            </ol>
          </details>
        ` : ''}

        <!-- Bot Token -->
        <div class="form-group">
          <label class="form-label">Bot Token</label>
          <input class="form-control" type="text" id="tg-token"
                 value="${escapeHtml(cfg.bot_token)}"
                 placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                 style="direction:ltr;text-align:left;font-family:monospace;font-size:11.5px">
          <div class="form-hint">من <code>@BotFather</code> — احتفظ به سرياً</div>
        </div>

        <!-- Chat ID + Detect -->
        <div class="form-group">
          <label class="form-label">Chat ID</label>
          <div style="display:flex;gap:8px">
            <input class="form-control" type="text" id="tg-chat-id"
                   value="${escapeHtml(cfg.chat_id)}"
                   placeholder="— لم يُكتشف بعد —"
                   style="direction:ltr;text-align:left;font-family:monospace;font-size:11.5px;flex:1">
            <button class="btn btn-outline btn-sm" onclick="window.__tgDetectChat()" style="white-space:nowrap">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              اكتشاف
            </button>
          </div>
          <div class="form-hint">تأكد من فتح البوت والضغط على Start قبل الاكتشاف</div>
        </div>

        <!-- التفضيلات -->
        <div class="form-divider"></div>
        <div class="section-title">تفضيلات الإشعارات</div>

        <label class="switch-label" style="display:flex;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:8px">
          <span style="font-size:12.5px;font-weight:700">الملخص اليومي</span>
          <input type="checkbox" id="tg-daily" ${cfg.daily_summary ? 'checked' : ''} class="switch-input" onchange="window.__tgSavePrefs()">
          <span class="switch-track"></span>
        </label>

        <label class="switch-label" style="display:flex;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:8px">
          <span style="font-size:12.5px;font-weight:700">رصيد منخفض</span>
          <input type="checkbox" id="tg-low-bal" ${cfg.notify_low_balance ? 'checked' : ''} class="switch-input" onchange="window.__tgSavePrefs()">
          <span class="switch-track"></span>
        </label>

        <label class="switch-label" style="display:flex;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:8px">
          <span style="font-size:12.5px;font-weight:700">شهادة منتهية</span>
          <input type="checkbox" id="tg-cert" ${cfg.notify_cert_maturity ? 'checked' : ''} class="switch-input" onchange="window.__tgSavePrefs()">
          <span class="switch-track"></span>
        </label>

        <label class="switch-label" style="display:flex;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:12px">
          <span style="font-size:12.5px;font-weight:700">دين متأخر</span>
          <input type="checkbox" id="tg-debts" ${cfg.notify_debts ? 'checked' : ''} class="switch-input" onchange="window.__tgSavePrefs()">
          <span class="switch-track"></span>
        </label>

        <!-- أزرار -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="tg-save-btn" onclick="window.__tgSave()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            حفظ
          </button>
          <button class="btn btn-success" id="tg-test-btn" onclick="window.__tgTest()" ${!configured ? 'disabled' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"/>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            إرسال اختبار
          </button>
          <button class="btn btn-outline" onclick="window.__tgSendSummary()" ${!configured ? 'disabled' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            إرسال ملخص الآن
          </button>
        </div>

        <div id="tg-status" style="margin-top:10px;font-size:11.5px;color:var(--muted)"></div>
      </div>
    </div>
  `;
}

// ══════════════════ Handlers ══════════════════

export function installTelegramHandlers() {
  const setStatus = (msg, ok = true) => {
    const el = document.getElementById('tg-status');
    if (!el) return;
    el.innerHTML = `<span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${escapeHtml(msg)}</span>`;
  };

  window.__tgDetectChat = async () => {
    const token = document.getElementById('tg-token').value.trim();
    if (!token) return toast('أدخل Bot Token أولاً', false);
    setStatus('جاري الاكتشاف...');
    try {
      const info = await detectChatId(token);
      document.getElementById('tg-chat-id').value = info.chat_id;
      setStatus(`✓ تم الاكتشاف${info.username ? ' — @' + info.username : ''}`, true);
      toast('تم اكتشاف Chat ID ✓');
    } catch (e) {
      setStatus('✗ ' + e.message, false);
    }
  };

  window.__tgSavePrefs = () => {
    const cfg = {
      daily_summary: document.getElementById('tg-daily')?.checked ?? true,
      notify_low_balance: document.getElementById('tg-low-bal')?.checked ?? true,
      notify_cert_maturity: document.getElementById('tg-cert')?.checked ?? true,
      notify_debts: document.getElementById('tg-debts')?.checked ?? true
    };
    saveTelegramConfig(cfg);
    persistAppSettings();
  };

  window.__tgSave = async () => {
    const token = document.getElementById('tg-token').value.trim();
    const chatId = document.getElementById('tg-chat-id').value.trim();

    if (!token || !chatId) return toast('أكمل Token و Chat ID', false);

    setStatus('جاري التحقق...');
    const btn = document.getElementById('tg-save-btn');
    if (btn) btn.disabled = true;

    try {
      await verifyBotToken(token);

      saveTelegramConfig({
        bot_token: token,
        chat_id: chatId,
        enabled: true,
        daily_summary: document.getElementById('tg-daily')?.checked ?? true,
        notify_low_balance: document.getElementById('tg-low-bal')?.checked ?? true,
        notify_cert_maturity: document.getElementById('tg-cert')?.checked ?? true,
        notify_debts: document.getElementById('tg-debts')?.checked ?? true
      });
      await persistAppSettings();

      setStatus('✓ محفوظ ومُفعّل — جرّب الإرسال', true);
      toast('تم حفظ إعدادات Telegram ✓');

      // أعد رسم الصفحة لتحديث الحالة
      if (typeof window.renderSettings === 'function') {
        setTimeout(window.renderSettings, 300);
      }
    } catch (e) {
      setStatus('✗ ' + e.message, false);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.__tgTest = async () => {
    const btn = document.getElementById('tg-test-btn');
    if (btn) btn.disabled = true;
    setStatus('جاري الإرسال...');
    try {
      const info = await testTelegram();
      setStatus(`✓ تم الإرسال — تحقق من @${info.username}`, true);
      toast('تم الإرسال ✓');
    } catch (e) {
      setStatus('✗ ' + e.message, false);
      toast('خطأ: ' + e.message, false);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.__tgSendSummary = async () => {
    setStatus('جاري الإرسال...');
    try {
      await sendTelegramMessage(buildDailySummary());
      setStatus('✓ تم إرسال الملخص', true);
      toast('تم الإرسال ✓');
    } catch (e) {
      setStatus('✗ ' + e.message, false);
    }
  };
}
