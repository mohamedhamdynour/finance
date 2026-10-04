// ══════════════════════════════════════════════════════════════════
//  sharing.js — إدارة المشاركة مع العائلة
// ══════════════════════════════════════════════════════════════════
import { conn } from '../state.js';
import { sbGet, sbPost, sbPatch, sbDel, sbRpc } from '../core/supabase.js';

// ══════════════════ قائمة الأعضاء ══════════════════

/**
 * يجلب كل أعضاء محفظتي (الذين دعوتهم).
 */
export async function getMyMembers() {
  const uid = conn.authSession?.user?.id;
  if (!uid) return [];
  return sbGet('portfolio_members', `?owner_user_id=eq.${uid}&order=created_at.desc`);
}

/**
 * يجلب المحافظ التي أشاركني أصحابها.
 */
export async function getSharedWithMe() {
  const uid = conn.authSession?.user?.id;
  if (!uid) return [];
  return sbGet('portfolio_members', `?member_user_id=eq.${uid}&status=eq.accepted&order=accepted_at.desc`);
}

// ══════════════════ دعوة عضو ══════════════════

/**
 * يدعو عضواً جديداً بالبريد الإلكتروني.
 * @param {string} email
 * @param {'viewer'|'editor'} role
 */
export async function inviteMember(email, role = 'viewer') {
  const uid = conn.authSession?.user?.id;
  if (!uid) throw new Error('يجب تسجيل الدخول');

  email = String(email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('بريد إلكتروني غير صالح');
  }
  if (email === (conn.authSession?.user?.email || '').toLowerCase()) {
    throw new Error('لا يمكنك دعوة نفسك');
  }
  if (!['viewer', 'editor'].includes(role)) role = 'viewer';

  try {
    const res = await sbPost('portfolio_members', [{
      owner_user_id: uid,
      member_email: email,
      role,
      status: 'pending'
    }]);
    return res?.[0];
  } catch (e) {
    if (e.message?.includes('duplicate key') || e.message?.includes('unique')) {
      throw new Error('هذا البريد مدعو بالفعل');
    }
    throw e;
  }
}

/**
 * يحذف دعوة / عضواً.
 */
export async function removeMember(memberId) {
  return sbDel('portfolio_members', memberId);
}

/**
 * يعدّل دور عضو (viewer ↔ editor).
 */
export async function updateMemberRole(memberId, role) {
  if (!['viewer', 'editor'].includes(role)) throw new Error('دور غير صالح');
  return sbPatch('portfolio_members', memberId, { role });
}

// ══════════════════ قبول الدعوات ══════════════════

/**
 * يقبل كل الدعوات المعلّقة للمستخدم الحالي.
 */
export async function acceptPendingInvites() {
  try {
    const count = await sbRpc('accept_pending_invites', {});
    return Number(count) || 0;
  } catch (e) {
    console.warn('[sharing] accept invites failed:', e.message);
    return 0;
  }
}

// ══════════════════ السياق (Context) ══════════════════

const CTX_KEY = 'viewingContextUid';

/**
 * يُرجع user_id الخاص بالسياق الحالي:
 * - لو null → محفظتي الخاصة
 * - غير ذلك → محفظة المالك
 */
export function getContextUserId() {
  const stored = localStorage.getItem(CTX_KEY);
  const myUid = conn.authSession?.user?.id;
  if (!stored || stored === myUid) return myUid;
  return stored;
}

/**
 * يضبط سياق العرض على محفظة عضو آخر.
 */
export function setViewingContext(ownerUserId) {
  if (!ownerUserId) {
    localStorage.removeItem(CTX_KEY);
    conn.viewingUserId = null;
  } else {
    localStorage.setItem(CTX_KEY, ownerUserId);
    conn.viewingUserId = ownerUserId;
  }
}

/**
 * هل نحن في وضع "معاينة محفظة شخص آخر"؟
 */
export function isViewingShared() {
  const stored = localStorage.getItem(CTX_KEY);
  const myUid = conn.authSession?.user?.id;
  return !!(stored && stored !== myUid);
}

/**
 * يهيّئ conn.viewingUserId من localStorage.
 */
export function initViewingContext() {
  const stored = localStorage.getItem(CTX_KEY);
  const myUid = conn.authSession?.user?.id;
  if (stored && stored !== myUid) {
    conn.viewingUserId = stored;
  } else {
    conn.viewingUserId = null;
    localStorage.removeItem(CTX_KEY);
  }
}

/**
 * يفحص أن المستخدم ما زال لديه صلاحية الوصول للسياق الحالي.
 * (يُستخدم عند بدء التشغيل — لو أُلغي الوصول، ارجع لمحفظتك).
 */
export async function verifyCurrentContext() {
  if (!isViewingShared()) return true;
  try {
    const ctxUid = getContextUserId();
    const uid = conn.authSession?.user?.id;
    const rows = await sbGet(
      'portfolio_members',
      `?owner_user_id=eq.${ctxUid}&member_user_id=eq.${uid}&status=eq.accepted&limit=1`
    );
    if (!rows?.length) {
      setViewingContext(null);
      return false;
    }
    return true;
  } catch (e) {
    return true; // تجاهل أخطاء الشبكة العابرة
  }
}

/**
 * يجلب معلومات المالك (email) لعرضها في الشريط.
 */
export async function getOwnerInfo(ownerUserId) {
  try {
    // لا يمكن قراءة جدول auth.users من العميل — نستخدم member_email عكسياً
    const rows = await sbGet(
      'portfolio_members',
      `?owner_user_id=eq.${ownerUserId}&member_user_id=eq.${conn.authSession?.user?.id}&limit=1`
    );
    return rows?.[0] || null;
  } catch (e) {
    return null;
  }
}
