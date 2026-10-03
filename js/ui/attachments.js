// ══════════════════════════════════════════════════════════════════
//  attachments.js (UI) — مكوّن عرض/رفع المرفقات
// ══════════════════════════════════════════════════════════════════
import { escapeHtml } from '../core/utils.js';
import { toast } from './toast.js';
import {
  uploadAttachment, openAttachment, deleteAttachment,
  attachmentsFor, formatFileSize, fileIcon
} from '../domain/attachments.js';

/**
 * يعرض قائمة المرفقات + منطقة الرفع.
 * @param {string} parentTable
 * @param {number} parentId
 * @returns {string} HTML
 */
export function renderAttachmentsSection(parentTable, parentId) {
  const atts = attachmentsFor(parentTable, parentId);
  const inputId = `att-upload-${parentTable}-${parentId}`;
  const listId = `att-list-${parentTable}-${parentId}`;

  return `
    <div class="form-divider"></div>
    <div class="form-group">
      <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
        <span>📎 المرفقات (${atts.length})</span>
        <button type="button" class="btn btn-xs btn-outline" onclick="document.getElementById('${inputId}').click()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          رفع ملف
        </button>
      </label>
      <input type="file" id="${inputId}" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
             style="display:none"
             onchange="window.__handleAttachmentUpload(this, '${parentTable}', ${parentId})">
      <div id="${listId}" style="margin-top:8px">
        ${renderAttachmentsList(atts)}
      </div>
      <div class="form-hint" style="margin-top:6px">
        JPG / PNG / WebP / HEIC / PDF — حد أقصى 10 MB
      </div>
    </div>
  `;
}

function renderAttachmentsList(atts) {
  if (!atts.length) {
    return `<div style="padding:12px;text-align:center;color:var(--muted);font-size:11.5px;background:var(--surface2);border-radius:8px;border:.5px dashed var(--border2)">لا توجد مرفقات</div>`;
  }
  return atts.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:8px;margin-bottom:6px">
      <span style="font-size:20px;flex-shrink:0">${fileIcon(a.mime_type)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.file_name)}</div>
        <div style="font-size:10px;color:var(--muted)">${formatFileSize(a.file_size)}${a.notes ? ' • ' + escapeHtml(a.notes) : ''}</div>
      </div>
      <button type="button" class="btn-icon" onclick="window.__openAttachment(${a.id})" title="فتح">
        <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button type="button" class="btn-icon danger" onclick="window.__deleteAttachment(${a.id},'${a.parent_table}',${a.parent_id})" title="حذف">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>
  `).join('');
}

// ══════════════════════ Global handlers ══════════════════════

export function installAttachmentHandlers() {
  window.__handleAttachmentUpload = async (input, parentTable, parentId) => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await uploadAttachment(file, parentTable, parentId);
      toast('تم رفع الملف ✓');
      // أعد رسم قائمة المرفقات
      const listId = `att-list-${parentTable}-${parentId}`;
      const listEl = document.getElementById(listId);
      if (listEl) {
        const atts = attachmentsFor(parentTable, parentId);
        listEl.innerHTML = renderAttachmentsList(atts);
      }
      // أعد رسم الصفحة الرئيسية إذا كان modal مغلقًا
      input.value = '';
    } catch (e) {
      toast('خطأ: ' + e.message, false);
      input.value = '';
    }
  };

  window.__openAttachment = async (id) => {
    const att = (window.__DB__?.attachments || []).find(a => a.id === id);
    if (!att) return alert('المرفق غير موجود');
    await openAttachment(att);
  };

  window.__deleteAttachment = async (id, parentTable, parentId) => {
    if (!confirm('حذف هذا المرفق نهائياً؟')) return;
    try {
      await deleteAttachment(id);
      toast('تم الحذف');
      const listId = `att-list-${parentTable}-${parentId}`;
      const listEl = document.getElementById(listId);
      if (listEl) {
        const atts = attachmentsFor(parentTable, parentId);
        listEl.innerHTML = renderAttachmentsList(atts);
      }
    } catch (e) {
      toast('خطأ: ' + e.message, false);
    }
  };
}
