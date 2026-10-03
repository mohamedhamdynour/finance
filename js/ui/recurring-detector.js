// ══════════════════════════════════════════════════════════════════
//  recurring-detector.js (UI) — بطاقة عرض الاقتراحات
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, escapeHtml } from '../core/utils.js';
import { sbPost } from '../core/supabase.js';
import { toast } from './toast.js';
import { detectRecurring } from '../domain/recurring-detector.js';

/**
 * يعرض قسم "عمليات مكتشفة".
 */
export function renderDetectorSection() {
  const suggestions = detectRecurring();

  if (!suggestions.length) {
    return `
      <div class="card" style="margin-bottom:16px;border-right:3px solid var(--muted)">
        <div class="card-body" style="padding:16px;display:flex;align-items:center;gap:12px">
          <div style="font-size:22px">🔍</div>
          <div>
            <div style="font-weight:800;font-size:13px;color:var(--text)">لم يُكتشف أي نمط متكرر جديد</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">يحتاج النظام إلى 3 حركات متشابهة على الأقل خلال 6 أشهر لاكتشاف النمط</div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="card" style="margin-bottom:16px;border-right:3px solid var(--purple)">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          عمليات مكتشفة تلقائياً (${suggestions.length})
        </div>
      </div>
      <div class="card-body">
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:12px;line-height:1.6">
          حلّل النظام آخر 6 أشهر واكتشف هذه الأنماط المتكررة. اضغط "إضافة" لإنشائها كعملية متكررة رسمية.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${suggestions.map(s => renderSuggestion(s)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderSuggestion(s) {
  const isIn = s.type === 'إيداع';
  const confPct = (s.confidence * 100).toFixed(0);
  const confColor = s.confidence >= 0.8 ? 'var(--green)' : s.confidence >= 0.65 ? 'var(--gold)' : 'var(--muted)';
  const confLabel = s.confidence >= 0.8 ? 'ثقة عالية' : s.confidence >= 0.65 ? 'ثقة متوسطة' : 'ثقة منخفضة';

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--surface2);border-radius:10px;border:.5px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:9px;background:${isIn ? 'var(--green-l)' : 'var(--red-l)'};color:${isIn ? 'var(--green)' : 'var(--red)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${isIn ? '<path d="M12 5v14M5 12l7 7 7-7"/>' : '<path d="M12 19V5M5 12l7-7 7 7"/>'}
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          ${escapeHtml(s.bank_name)} • ${escapeHtml(s.freqLabel)} • ${s.occurrences} مرات
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <span class="badge" style="background:${confColor}22;color:${confColor};font-size:9.5px">${confLabel} ${confPct}%</span>
          <span class="badge badge-gray" style="font-size:9.5px">فاصل ~${s.avgInterval} يوم</span>
        </div>
      </div>
      <div style="text-align:left;direction:ltr;flex-shrink:0">
        <div style="font-weight:900;font-size:14px;color:${isIn ? 'var(--green)' : 'var(--red)'}">${isIn ? '+' : '-'}${fmt(s.amount)}</div>
      </div>
      <button class="btn btn-xs btn-primary" onclick="window.__acceptRecurringSuggestion('${s.key.replace(/'/g, "\\'")}')" title="إنشاء كعملية متكررة">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        إضافة
      </button>
    </div>
  `;
}

// ══════════════════ Global handler ══════════════════

export function installDetectorHandlers() {
  window.__acceptRecurringSuggestion = async (key) => {
    // أعد الكشف لجلب التفاصيل
    const suggestions = detectRecurring();
    const s = suggestions.find(x => x.key === key);
    if (!s) return alert('الاقتراح لم يعد صالحاً — أعد تحميل الصفحة');

    if (!confirm(`إنشاء عملية متكررة؟\n\nالاسم: ${s.name}\nالنوع: ${s.type}\nالمبلغ: ${fmt(s.amount)}\nالتكرار: ${s.freqLabel}\nالحساب: ${s.bank_name}`)) return;

    try {
      await sbPost('recurring_transactions', [{
        name: s.name,
        type: s.type,
        freq: s.freq,
        amount: s.amount,
        bank_id: s.bank_id,
        start_date: s.last_date,       // ابدأ من آخر مرة سُجّلت
        last_applied: s.last_date
      }]);
      toast('تم إنشاء العملية المتكررة ✓');
      // أعد تحميل الصفحة
      if (typeof window.loadAll === 'function') await window.loadAll({ silent: true });
      else if (typeof window.renderPage === 'function') window.renderPage();
    } catch (e) {
      toast('خطأ: ' + e.message, false);
    }
  };
}
