// ══════════════════════════════════════════════════════════════════
//  attachments.js — إدارة المرفقات (رفع + عرض + حذف)
// ══════════════════════════════════════════════════════════════════
import { DB, conn } from '../state.js';
import { sbGet, sbPost, sbDel } from '../core/supabase.js';

const BUCKET = 'attachments';

// ══════════════════════ رفع ملف ══════════════════════

/**
 * يرفع ملف ويُنشئ سجل attachment.
 * @param {File} file
 * @param {string} parentTable - 'certificates' | 'debts' | 'installments'
 * @param {number} parentId
 * @param {string} notes
 */
export async function uploadAttachment(file, parentTable, parentId, notes = '') {
  const uid = conn.authSession?.user?.id;
  if (!uid) throw new Error('يجب تسجيل الدخول أولاً');
  if (!file) throw new Error('لم يتم اختيار ملف');

  // حد أقصى 10 MB
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) throw new Error(`حجم الملف كبير (الحد ${MAX_SIZE / 1024 / 1024} MB)`);

  // أنواع مدعومة
  const ALLOWED = ['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
  if (!ALLOWED.includes(file.type)) throw new Error('نوع الملف غير مدعوم (JPG/PNG/WebP/HEIC/PDF فقط)');

  // اسم فريد
  const ext = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `${timestamp}_${random}.${ext}`;

  // المسار: {user_id}/{parent_table}/{parent_id}/{file_name}
  const path = `${uid}/${parentTable}/${parentId}/${fileName}`;

  // ارفع عبر supabase-js
  const { error: upErr } = await conn.supabaseClient.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (upErr) throw new Error('فشل الرفع: ' + upErr.message);

  // سجّل في الجدول
  const res = await sbPost('attachments', [{
    parent_table: parentTable,
    parent_id: parentId,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    storage_path: path,
    notes
  }]);

  // حدّث DB محليًا
  if (res?.[0]) {
    if (!DB.attachments) DB.attachments = [];
    DB.attachments.unshift(res[0]);
  }

  return res?.[0];
}

// ══════════════════════ الحصول على رابط العرض ══════════════════════

/**
 * يعيد رابط URL صالح لفتح الملف (signed URL صالح لساعة).
 */
export async function getAttachmentUrl(attachment) {
  if (!attachment?.storage_path) return null;
  const { data, error } = await conn.supabaseClient.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 3600); // صالح ساعة
  if (error) throw new Error('فشل إنشاء رابط: ' + error.message);
  return data.signedUrl;
}

/**
 * يفتح المرفق في تبويب جديد.
 */
export async function openAttachment(attachment) {
  try {
    const url = await getAttachmentUrl(attachment);
    if (!url) return alert('تعذّر الحصول على الرابط');
    window.open(url, '_blank', 'noopener');
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
}

// ══════════════════════ حذف ══════════════════════

export async function deleteAttachment(id) {
  const att = (DB.attachments || []).find(a => a.id === id);
  if (!att) return;

  // احذف الملف من Storage
  if (att.storage_path) {
    try {
      await conn.supabaseClient.storage.from(BUCKET).remove([att.storage_path]);
    } catch (e) {
      console.warn('[attachments] storage delete failed:', e.message);
    }
  }

  // احذف السجل
  await sbDel('attachments', id);

  // حدّث DB
  DB.attachments = (DB.attachments || []).filter(a => a.id !== id);
}

// ══════════════════════ استعلامات ══════════════════════

export function attachmentsFor(parentTable, parentId) {
  return (DB.attachments || []).filter(a =>
    a.parent_table === parentTable && a.parent_id === parentId && !a.deleted_at
  );
}

export function attachmentsCount(parentTable, parentId) {
  return attachmentsFor(parentTable, parentId).length;
}

// ══════════════════════ مساعدات ══════════════════════

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

export function fileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  return '📎';
}
