// ══════════════════════════════════════════════════════════════════
//  csv-import.js — واجهة استيراد CSV
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, fmtN, escapeHtml, today } from '../core/utils.js';
import { sbPost } from '../core/supabase.js';
import { toast } from './toast.js';
import { parseCSV, detectDuplicates } from '../domain/csv-import.js';
import { populateSelect } from './shared.js';

let _state = { rows: [], bankId: null, parsed: false };

export function openCSVImport() {
  _state = { rows: [], bankId: null, parsed: false };

  // تهيئة الـ body قبل ما نفتح الـ modal
  const bodyEl = document.getElementById('edit-modal-body');
  if (bodyEl) bodyEl.innerHTML = renderInitialUI();

  const titleEl = document.getElementById('edit-modal-title');
  if (titleEl) titleEl.innerHTML = '📥 استيراد كشف حساب CSV';

  const saveBtn = document.getElementById('edit-modal-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';

  window.openModal('modal-edit');

  // املأ الحسابات البنكية
  setTimeout(() => {
    populateSelect('csv-bank-select');
  }, 50);
}

function renderInitialUI() {
  return `
    <div class="form-group">
      <label class="form-label">الحساب البنكي *</label>
      <select class="form-control" id="csv-bank-select">
        <option value="">— اختر الحساب —</option>
      </select>
      <div class="form-hint">ستُضاف الحركات لهذا الحساب</div>
    </div>

    <div id="csv-drop-zone" style="
      border: 2px dashed var(--border2);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all .2s;
      background: var(--surface2);
    "
       ondragover="event.preventDefault(); this.style.borderColor='var(--blue)'; this.style.background='var(--blue-l)'"
       ondragleave="this.style.borderColor='var(--border2)'; this.style.background='var(--surface2)'"
       ondrop="window.__csvDrop(event)"
       onclick="document.getElementById('csv-file-input').click()">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--muted);margin-bottom:10px">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <polyline points="9 15 12 12 15 15"/>
      </svg>
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">اسحب ملف CSV هنا</div>
      <div style="font-size:11.5px;color:var(--muted)">أو اضغط للاختيار من الجهاز</div>
      <div style="font-size:10.5px;color:var(--muted);margin-top:10px">يدعم: الأهلي، مصر، CIB، QNB، بنوك أجنبية</div>
    </div>
    <input type="file" id="csv-file-input" accept=".csv,text/csv" style="display:none" onchange="window.__csvFileSelected(this)">
    <div id="csv-status" style="margin-top:12px"></div>

    <div style="margin-top:16px;padding:12px;background:var(--surface2);border-radius:8px;font-size:11px;color:var(--muted);line-height:1.7">
      <strong>ملاحظات:</strong><br>
      • التطبيق يكتشف الأعمدة تلقائياً (التاريخ، المبلغ، الوصف)<br>
      • الحركات المكررة (نفس التاريخ والمبلغ) تُلغى تلقائياً<br>
      • يمكنك تعديل كل سطر قبل الاستيراد
    </div>
  `;
}

export function installCSVHandlers() {
  window.__csvFileSelected = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  window.__csvDrop = async (e) => {
    e.preventDefault();
    if (e.currentTarget) {
      e.currentTarget.style.borderColor = 'var(--border2)';
      e.currentTarget.style.background = 'var(--surface2)';
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  };

  window.__csvToggleRow = (i) => {
    if (!_state.rows[i]) return;
    _state.rows[i]._selected = !_state.rows[i]._selected;
    renderPreview();
  };

  window.__csvToggleAll = (checked) => {
    _state.rows.forEach(r => {
      if (r._valid && !r._duplicate) r._selected = checked;
    });
    renderPreview();
  };

  window.__csvSetCategory = (i, v) => {
    if (_state.rows[i]) _state.rows[i].category = v;
  };

  window.__csvConfirmImport = async () => {
    const selected = _state.rows.filter(r => r._selected && r._valid);
    if (!selected.length) return alert('لم تختر أي حركة');
    if (!_state.bankId) return alert('اختر الحساب البنكي');

    const btn = document.getElementById('csv-import-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الاستيراد...'; }

    const transactions = selected.map(r => ({
      bank_id: _state.bankId,
      type: r.type,
      amount: r.amount,
      date: r.date,
      notes: r.description + ' (مستورد من CSV)',
      category: r.category || 'مستورد'
    }));

    try {
      const BATCH = 50;
      let inserted = 0;
      for (let i = 0; i < transactions.length; i += BATCH) {
        const batch = transactions.slice(i, i + BATCH);
        await sbPost('bank_transactions', batch);
        inserted += batch.length;
        if (btn) btn.textContent = `استوردت ${inserted} / ${transactions.length}...`;
      }

      toast(`تم استيراد ${inserted} حركة بنجاح ✓`);
      window.closeModal('modal-edit');
      if (typeof window.loadAll === 'function') await window.loadAll();
    } catch (e) {
      console.error('CSV import failed:', e);
      toast('خطأ: ' + e.message, false);
      if (btn) { btn.disabled = false; btn.textContent = 'استيراد الحركات المحددة'; }
    }
  };
}

async function handleFile(file) {
  // تحقق من الحساب
  const bankId = +document.getElementById('csv-bank-select')?.value || null;
  if (!bankId) {
    const status = document.getElementById('csv-status');
    if (status) {
      status.innerHTML = `<div style="padding:12px;background:var(--red-l);color:var(--red-d);border-radius:8px;font-size:12px">⚠️ اختر الحساب البنكي أولاً</div>`;
    }
    return;
  }
  _state.bankId = bankId;

  const status = document.getElementById('csv-status');
  if (status) status.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)">جاري تحليل الملف...</div>`;

  try {
    const { rows, summary } = await parseCSV(file);
    detectDuplicates(rows, bankId);
    _state.rows = rows;
    _state.parsed = true;

    const dupCount = rows.filter(r => r._duplicate).length;
    if (status) {
      status.innerHTML = `<div style="padding:12px;background:var(--green-l);color:var(--green-d);border-radius:8px;font-size:12px">
        ✓ تم تحليل ${summary.total} سطر — ${summary.valid} صالح${dupCount > 0 ? ` — ${dupCount} مكرر (سيُلغى)` : ''}${summary.invalid > 0 ? ` — ${summary.invalid} غير صالح` : ''}
      </div>`;
    }

    renderPreview();
  } catch (e) {
    console.error('CSV parse failed:', e);
    if (status) {
      status.innerHTML = `<div style="padding:12px;background:var(--red-l);color:var(--red-d);border-radius:8px;font-size:12px">✗ ${escapeHtml(e.message)}</div>`;
    }
  }
}

function renderPreview() {
  const container = document.getElementById('edit-modal-body');
  if (!container) return;

  const rows = _state.rows;
  const selectedCount = rows.filter(r => r._selected && r._valid).length;
  const validCount = rows.filter(r => r._valid).length;
  const dupCount = rows.filter(r => r._duplicate).length;

  const CATEGORIES = ['', 'مرتب', 'فواتير', 'مصروفات منزلية', 'مواصلات', 'صحة', 'تعليم', 'ترفيه', 'استثمار', 'سداد دين', 'تحويل', 'أخرى'];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;color:var(--muted)">
        <strong style="color:var(--text)">${validCount}</strong> حركة صالحة${dupCount ? ` · <span style="color:var(--gold)">${dupCount} مكررة</span>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-xs btn-outline" onclick="window.__csvToggleAll(true)">تحديد الكل</button>
        <button class="btn btn-xs btn-outline" onclick="window.__csvToggleAll(false)">إلغاء الكل</button>
      </div>
    </div>

    <div style="max-height:400px;overflow-y:auto;border:.5px solid var(--border);border-radius:10px">
      <table style="min-width:100%">
        <thead style="position:sticky;top:0;background:var(--surface2);z-index:2">
          <tr>
            <th style="width:40px"></th>
            <th style="width:100px">التاريخ</th>
            <th style="width:70px">النوع</th>
            <th style="text-align:left;direction:ltr;width:110px">المبلغ</th>
            <th style="min-width:160px">الوصف</th>
            <th style="width:130px">الفئة</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const isInvalid = !r._valid;
            const bg = isInvalid ? 'rgba(225,29,72,.05)' : r._duplicate ? 'rgba(217,119,6,.05)' : '';
            return `<tr style="background:${bg};${isInvalid ? 'opacity:.6' : ''}">
              <td style="text-align:center">
                ${isInvalid ? '✗' : r._duplicate
                  ? `<span title="مكرر" style="color:var(--gold);cursor:pointer;font-size:18px" onclick="window.__csvToggleRow(${i})">${r._selected ? '☑' : '☐'}</span>`
                  : `<input type="checkbox" ${r._selected ? 'checked' : ''} onchange="window.__csvToggleRow(${i})">`}
              </td>
              <td style="font-size:11.5px">${escapeHtml(r.date || '—')}</td>
              <td><span class="tag ${r.type === 'إيداع' ? 'tag-dep' : 'tag-wit'}" style="font-size:10px">${escapeHtml(r.type)}</span></td>
              <td class="td-num ${r.type === 'إيداع' ? 'pos' : 'neg'}" style="direction:ltr;font-weight:700">${r.type === 'إيداع' ? '+' : '-'}${fmtN(r.amount, 2)}</td>
              <td style="font-size:11.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.description)}">${escapeHtml(r.description || '—')}</td>
              <td>
                ${isInvalid ? `<span style="color:var(--red);font-size:10px">${escapeHtml(r._error)}</span>` : `
                  <select style="width:100%;font-size:11px;padding:3px 6px;border:.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit"
                          onchange="window.__csvSetCategory(${i}, this.value)">
                    ${CATEGORIES.map(c => `<option value="${c}" ${r.category === c ? 'selected' : ''}>${c || '— بدون —'}</option>`).join('')}
                  </select>
                `}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="window.closeModal('modal-edit')">إلغاء</button>
      <button class="btn btn-primary" id="csv-import-btn" onclick="window.__csvConfirmImport()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        استيراد ${selectedCount} حركة
      </button>
    </div>
  `;

  const titleEl = document.getElementById('edit-modal-title');
  if (titleEl) titleEl.innerHTML = `📥 استيراد CSV — ${selectedCount} حركة محددة`;
}
