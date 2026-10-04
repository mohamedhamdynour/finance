// ══════════════════════════════════════════════════════════════════
//  sharing-setup.js — واجهة إدارة المشاركة
// ══════════════════════════════════════════════════════════════════
import { conn } from '../state.js';
import { escapeHtml, fmt } from '../core/utils.js';
import { toast } from './toast.js';
import {
  getMyMembers, getSharedWithMe, inviteMember, removeMember,
  updateMemberRole, setViewingContext, isViewingShared, getOwnerInfo
} from '../domain/sharing.js';

// ══════════════════ البطاقة الرئيسية ══════════════════

export async function renderSharingCard() {
  const card = document.getElementById('st-sharing-section');
  if (!card) return;

  card.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted)">جاري التحميل...</div>`;

  try {
    const [myMembers, sharedWithMe] = await Promise.all([
      getMyMembers(),
      getSharedWithMe()
    ]);

    card.innerHTML = buildCardHtml(myMembers, sharedWithMe);
  } catch (e) {
    console.warn('[sharing] render failed:', e.message);
    card.innerHTML = `<div class="card" style="margin-top:16px">
      <div class="card-body" style="color:var(--red);font-size:12.5px">تعذّر تحميل المشاركة: ${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function buildCardHtml(myMembers, sharedWithMe) {
  const activeMembers = myMembers.filter(m => m.status === 'accepted');
  const pendingMembers = myMembers.filter(m => m.status === 'pending');

  return `
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--purple-l);color:var(--purple)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          المشاركة مع العائلة
        </div>
        <span class="badge badge-gray">${activeMembers.length} عضو</span>
      </div>
      <div class="card-body">

        <!-- دعوة جديدة -->
        <div class="section-title">دعوة عضو جديد</div>
        <div class="form-hint" style="margin-bottom:10px;line-height:1.7">
          يدخل العضو بنفس بياناته في التطبيق، ويقبل الدعوة تلقائياً عند تسجيل الدخول.
          يجب أن يكون مسجّلاً في نفس مشروع Supabase.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="flex:1;min-width:200px;margin:0">
            <label class="form-label" style="font-size:9.5px">البريد الإلكتروني</label>
            <input class="form-control" type="email" id="sh-invite-email"
                   placeholder="wife@example.com"
                   style="direction:ltr;text-align:left">
          </div>
          <div class="form-group" style="flex:0 0 130px;margin:0">
            <label class="form-label" style="font-size:9.5px">الصلاحية</label>
            <select class="form-control" id="sh-invite-role">
              <option value="viewer">مشاهدة فقط</option>
              <option value="editor">تعديل كامل</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="window.__shInvite()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            دعوة
          </button>
        </div>

        <!-- قائمة الأعضاء الحاليين -->
        ${activeMembers.length ? `
          <div class="form-divider"></div>
          <div class="section-title">الأعضاء الحاليون (${activeMembers.length})</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${activeMembers.map(m => memberRow(m)).join('')}
          </div>
        ` : ''}

        <!-- دعوات معلّقة -->
        ${pendingMembers.length ? `
          <div class="form-divider"></div>
          <div class="section-title">دعوات معلّقة (${pendingMembers.length})</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${pendingMembers.map(m => pendingRow(m)).join('')}
          </div>
        ` : ''}

        <!-- محافظ مشتركة معي -->
        ${sharedWithMe.length ? `
          <div class="form-divider"></div>
          <div class="section-title">محافظ مشتركة معي (${sharedWithMe.length})</div>
          <div class="hint" style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.7">
            يمكنك معاينة محفظة كل مالك بضغطة واحدة. في وضع المعاينة، كل البيانات (والعمليات الجديدة) تُسجَّل في محفظة المالك.
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${sharedWithMe.map(m => sharedWithMeRow(m)).join('')}
          </div>
        ` : ''}

        <!-- ملاحظة -->
        ${!activeMembers.length && !pendingMembers.length && !sharedWithMe.length ? `
          <div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;background:var(--surface2);border-radius:10px;margin-top:12px">
            لا توجد مشاركات بعد — أضف أول عضو من الأعلى.
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function memberRow(m) {
  const roleLabel = m.role === 'editor' ? 'تعديل كامل' : 'مشاهدة فقط';
  const roleBg = m.role === 'editor' ? 'var(--blue-l)' : 'var(--surface2)';
  const roleColor = m.role === 'editor' ? 'var(--blue)' : 'var(--muted)';
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border-radius:10px">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--purple-l);color:var(--purple);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:900;font-size:14px">
        ${escapeHtml((m.member_email[0] || '?').toUpperCase())}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.member_email)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">
          انضم في: ${m.accepted_at ? new Date(m.accepted_at).toLocaleDateString('ar-EG') : '—'}
        </div>
      </div>
      <span class="badge" style="background:${roleBg};color:${roleColor}">${roleLabel}</span>
      <button class="btn-icon edit" title="تغيير الصلاحية" onclick="window.__shChangeRole(${m.id},'${m.role === 'editor' ? 'viewer' : 'editor'}')">
        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon danger" title="إزالة" onclick="window.__shRemove(${m.id})">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>
  `;
}

function pendingRow(m) {
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--gold-l);border-radius:10px;border:.5px solid var(--gold)">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--gold);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:900;font-size:14px">
        ?
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.member_email)}</div>
        <div style="font-size:10.5px;color:var(--gold-d);margin-top:2px">
          لم يقبل الدعوة بعد — سيتم القبول تلقائياً عند تسجيل دخوله
        </div>
      </div>
      <button class="btn-icon danger" title="إلغاء الدعوة" onclick="window.__shRemove(${m.id})">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>
  `;
}

function sharedWithMeRow(m) {
  const isActive = isViewingShared() && localStorage.getItem('viewingContextUid') === m.owner_user_id;
  const roleLabel = m.role === 'editor' ? 'تعديل كامل' : 'مشاهدة فقط';

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${isActive ? 'var(--blue-l)' : 'var(--surface2)'};border-radius:10px;border:.5px solid ${isActive ? 'var(--blue)' : 'transparent'}">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:900;font-size:14px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12.5px">محفظة مشتركة</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${roleLabel}</div>
      </div>
      ${isActive ? `
        <button class="btn btn-outline btn-xs" onclick="window.__shExitContext()">رجوع لمحفظتي</button>
      ` : `
        <button class="btn btn-primary btn-xs" onclick="window.__shEnterContext('${m.owner_user_id}','${m.role}')">عرض</button>
      `}
      <button class="btn-icon danger" title="مغادرة" onclick="window.__shLeave(${m.id})">
        <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  `;
}

// ══════════════════ Handlers ══════════════════

export function installSharingHandlers() {
  window.__shInvite = async () => {
    const email = document.getElementById('sh-invite-email')?.value || '';
    const role = document.getElementById('sh-invite-role')?.value || 'viewer';
    if (!email.trim()) return toast('أدخل البريد الإلكتروني', false);

    try {
      await inviteMember(email, role);
      toast('تم إرسال الدعوة ✓');
      document.getElementById('sh-invite-email').value = '';
      await renderSharingCard();
    } catch (e) {
      toast(e.message, false);
    }
  };

  window.__shRemove = async (id) => {
    if (!confirm('إزالة هذا العضو / إلغاء الدعوة؟')) return;
    try {
      await removeMember(id);
      toast('تمت الإزالة');
      await renderSharingCard();
    } catch (e) {
      toast('خطأ: ' + e.message, false);
    }
  };

  window.__shChangeRole = async (id, newRole) => {
    try {
      await updateMemberRole(id, newRole);
      toast('تم تغيير الصلاحية');
      await renderSharingCard();
    } catch (e) {
      toast('خطأ: ' + e.message, false);
    }
  };

  window.__shLeave = async (id) => {
    if (!confirm('مغادرة هذه المحفظة المشتركة؟')) return;
    try {
      await removeMember(id);
      toast('تمت المغادرة');
      await renderSharingCard();
      if (typeof window.loadAll === 'function') await window.loadAll();
    } catch (e) {
      toast('خطأ: ' + e.message, false);
    }
  };

  window.__shEnterContext = async (ownerUid, role) => {
    setViewingContext(ownerUid, role);
    toast('جاري تحويل العرض...');
    setTimeout(() => location.reload(), 400);
  };

  window.__shExitContext = () => {
    setViewingContext(null);
    toast('جاري العودة لمحفظتك...');
    setTimeout(() => location.reload(), 400);
  };
}

// ══════════════════ شريط السياق (Banner) ══════════════════

/**
 * يعرض/يخفي شريط "معاينة محفظة مشتركة".
 * يُستدعى عند كل loadAll.
 */
export async function updateSharedBanner() {
  const banner = document.getElementById('shared-context-banner');
  if (!banner) return;

  if (!isViewingShared()) {
    banner.style.display = 'none';
    return;
  }

  const ctxUid = localStorage.getItem('viewingContextUid');
  const info = await getOwnerInfo(ctxUid);
  const roleLabel = info?.role === 'editor' ? 'تعديل كامل' : 'مشاهدة فقط';

  banner.style.display = 'flex';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 16px;background:var(--blue-l);border:.5px solid var(--blue);border-radius:10px;font-size:12.5px">
      <div style="width:26px;height:26px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <strong style="color:var(--blue)">أنت تعرض محفظة مشتركة</strong>
        <span style="color:var(--muted)"> • ${roleLabel}</span>
      </div>
      <button class="btn btn-outline btn-xs" onclick="window.__shExitContext()">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 14 4 9 9 4"/>
          <path d="M20 20v-7a4 4 0 00-4-4H4"/>
        </svg>
        رجوع لمحفظتي
      </button>
    </div>
  `;
}
