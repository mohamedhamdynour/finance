// ══════════════════════════════════════════════════════════════════
//  pages/audit.js — سجل التغييرات (Audit Log)
// ══════════════════════════════════════════════════════════════════
import { DB } from '../../state.js';
import { N2, fmt, fmtN, escapeHtml, today } from '../../core/utils.js';
import { sbGet } from '../../core/supabase.js';
import { kpi, svgIcon, getReportPeriodBounds } from '../shared.js';

const TABLE_LABELS = {
  banks: 'بنوك',
  bank_transactions: 'حركات بنكية',
  stock_transactions: 'عمليات أسهم',
  metal_transactions: 'عمليات معادن',
  certificates: 'شهادات',
  dividends: 'توزيعات',
  debts: 'ديون',
  debt_payments: 'دفعات ديون',
  recurring_transactions: 'عمليات متكررة',
  financial_goals: 'أهداف',
  installments: 'أقساط',
  installment_payments: 'دفعات أقساط'
};

const ACTION_LABELS = {
  INSERT: { label: 'إضافة', color: 'var(--green)', bg: 'var(--green-l)', icon: '+' },
  UPDATE: { label: 'تعديل', color: 'var(--gold)', bg: 'var(--gold-l)', icon: '✎' },
  DELETE: { label: 'حذف', color: 'var(--red)', bg: 'var(--red-l)', icon: '✗' }
};

let _auditCache = null;
let _filters = { table: 'ALL', action: 'ALL', search: '' };

export async function renderAudit() {
  const kpisEl = document.getElementById('audit-kpis');
  const contentEl = document.getElementById('audit-content');

  if (!kpisEl || !contentEl) return;

  kpisEl.innerHTML = kpi('جاري التحميل...', '...', '', 'var(--blue)', '');
  contentEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)">جاري جلب السجلات...</div>';

  try {
    const rows = await sbGet('audit_log', '?order=changed_at.desc&limit=500');
    _auditCache = rows || [];

    const total = _auditCache.length;
    const inserts = _auditCache.filter(r => r.action === 'INSERT').length;
    const updates = _auditCache.filter(r => r.action === 'UPDATE').length;
    const deletes = _auditCache.filter(r => r.action === 'DELETE').length;

    kpisEl.innerHTML =
      kpi('إجمالي السجلات', total, 'آخر 500 تغيير', 'var(--blue)', svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>')) +
      kpi('إضافات', inserts, '', 'var(--green)', svgIcon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')) +
      kpi('تعديلات', updates, '', 'var(--gold)', svgIcon('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>')) +
      kpi('عمليات حذف', deletes, '', 'var(--red)', svgIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>'));

    renderAuditContent();
  } catch (e) {
    console.error('audit load failed:', e);
    kpisEl.innerHTML = '';
    contentEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--red)">
      فشل تحميل السجل: ${escapeHtml(e.message)}
      <br><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="renderAudit()">إعادة المحاولة</button>
    </div>`;
  }
}

function renderAuditContent() {
  const el = document.getElementById('audit-content');
  if (!el || !_auditCache) return;

  // طبق الفلاتر
  let filtered = _auditCache;
  if (_filters.table !== 'ALL') filtered = filtered.filter(r => r.table_name === _filters.table);
  if (_filters.action !== 'ALL') filtered = filtered.filter(r => r.action === _filters.action);
  if (_filters.search) {
    const q = _filters.search.toLowerCase();
    filtered = filtered.filter(r => {
      const haystack = JSON.stringify(r).toLowerCase();
      return haystack.includes(q);
    });
  }

  // الجداول المتاحة
  const tables = [...new Set(_auditCache.map(r => r.table_name))].sort();

  // الفلاتر
  const filterBar = `
    <div class="filter-bar" style="margin-bottom:12px">
      <select class="period-select" onchange="window.__auditSetTable(this.value)" style="min-width:160px">
        <option value="ALL" ${_filters.table === 'ALL' ? 'selected' : ''}>كل الجداول</option>
        ${tables.map(t => `<option value="${t}" ${_filters.table === t ? 'selected' : ''}>${escapeHtml(TABLE_LABELS[t] || t)}</option>`).join('')}
      </select>
      <select class="period-select" onchange="window.__auditSetAction(this.value)" style="min-width:130px">
        <option value="ALL" ${_filters.action === 'ALL' ? 'selected' : ''}>كل الإجراءات</option>
        <option value="INSERT" ${_filters.action === 'INSERT' ? 'selected' : ''}>إضافة</option>
        <option value="UPDATE" ${_filters.action === 'UPDATE' ? 'selected' : ''}>تعديل</option>
        <option value="DELETE" ${_filters.action === 'DELETE' ? 'selected' : ''}>حذف</option>
      </select>
      <input type="text" class="search-input" placeholder="بحث..." value="${escapeHtml(_filters.search)}"
             oninput="window.__auditSetSearch(this.value)" style="flex:1;min-width:180px">
      <span style="font-size:11.5px;color:var(--muted);white-space:nowrap">${filtered.length} سجل</span>
    </div>
  `;

  if (!filtered.length) {
    el.innerHTML = filterBar + `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)">
      <p>لا توجد سجلات مطابقة</p>
    </div>`;
    return;
  }

  el.innerHTML = filterBar + `
    <div class="card">
      <div class="card-body no-pad">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الإجراء</th>
                <th>الجدول</th>
                <th>#ID</th>
                <th>تفاصيل</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r, i) => renderAuditRow(r, i)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderAuditRow(r, index) {
  const action = ACTION_LABELS[r.action] || { label: r.action, color: 'var(--muted)', bg: 'var(--surface2)', icon: '?' };
  const tableLabel = TABLE_LABELS[r.table_name] || r.table_name;
  const date = new Date(r.changed_at).toLocaleString('ar-EG');

  // مقتطف من التفاصيل
  const data = r.action === 'DELETE' ? r.old_data : (r.new_data || r.old_data);
  const snippet = data ? summarizeData(r.table_name, data) : '—';

  return `
    <tr>
      <td style="font-size:11.5px">${escapeHtml(date)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;background:${action.bg};color:${action.color}">
          ${action.icon} ${action.label}
        </span>
      </td>
      <td><span class="badge badge-gray" style="font-size:10px">${escapeHtml(tableLabel)}</span></td>
      <td class="td-num" style="direction:ltr;font-size:11px;color:var(--muted)">#${r.record_id || '—'}</td>
      <td style="font-size:11.5px;color:var(--muted);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(snippet)}</td>
      <td class="td-actions">
        <button class="btn-icon" onclick="window.__showAuditDetails(${index})" title="التفاصيل الكاملة">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function summarizeData(table, data) {
  if (!data) return '—';
  try {
    // استخرج أهم حقول حسب الجدول
    const keys = {
      banks: ['name', 'balance', 'currency'],
      bank_transactions: ['type', 'amount', 'date', 'notes'],
      stock_transactions: ['type', 'symbol', 'quantity', 'price'],
      metal_transactions: ['op', 'metal_type', 'weight', 'price_per_gram'],
      certificates: ['name', 'amount', 'rate'],
      dividends: ['symbol', 'amount', 'date'],
      debts: ['name', 'type', 'remaining'],
      debt_payments: ['amount', 'date'],
      recurring_transactions: ['name', 'type', 'amount', 'freq'],
      financial_goals: ['name', 'target', 'category'],
      installments: ['name', 'total_amount', 'installments_count'],
      installment_payments: ['amount', 'date']
    }[table] || Object.keys(data).slice(0, 4);

    return keys
      .filter(k => data[k] !== undefined && data[k] !== null)
      .map(k => {
        const v = data[k];
        if (typeof v === 'number') return `${k}=${fmtN(v, 2)}`;
        return `${k}=${String(v).slice(0, 30)}`;
      })
      .join(' · ');
  } catch {
    return '—';
  }
}

// ══════════════════ Filter handlers ══════════════════

export function installAuditHandlers() {
  window.__auditSetTable = (v) => { _filters.table = v; renderAuditContent(); };
  window.__auditSetAction = (v) => { _filters.action = v; renderAuditContent(); };
  window.__auditSetSearch = (v) => {
    clearTimeout(window.__auditSearchTimer);
    window.__auditSearchTimer = setTimeout(() => {
      _filters.search = v;
      renderAuditContent();
    }, 200);
  };

  window.__showAuditDetails = (index) => {
    // نعيد الفلترة بنفس المنطق
    let filtered = _auditCache || [];
    if (_filters.table !== 'ALL') filtered = filtered.filter(r => r.table_name === _filters.table);
    if (_filters.action !== 'ALL') filtered = filtered.filter(r => r.action === _filters.action);
    if (_filters.search) {
      const q = _filters.search.toLowerCase();
      filtered = filtered.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    }

    const r = filtered[index];
    if (!r) return;

    const action = ACTION_LABELS[r.action] || { label: r.action, color: 'var(--muted)', bg: 'var(--surface2)' };
    const tableLabel = TABLE_LABELS[r.table_name] || r.table_name;

    document.getElementById('edit-modal-title').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px">
        <span style="background:${action.bg};color:${action.color};padding:3px 10px;border-radius:20px;font-size:11px">${action.label}</span>
        ${escapeHtml(tableLabel)} #${r.record_id}
      </span>
    `;

    document.getElementById('edit-modal-body').innerHTML = `
      <div style="padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:12px;font-size:11.5px;color:var(--muted)">
        <strong>التاريخ:</strong> ${new Date(r.changed_at).toLocaleString('ar-EG')}
      </div>

      ${r.action !== 'INSERT' && r.old_data ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:800;color:var(--red);margin-bottom:6px;text-transform:uppercase">📤 قبل التعديل</div>
          <pre style="background:var(--red-l);border:.5px solid var(--red);border-radius:8px;padding:10px;font-size:11px;direction:ltr;text-align:left;overflow-x:auto;max-height:240px">${escapeHtml(JSON.stringify(r.old_data, null, 2))}</pre>
        </div>
      ` : ''}

      ${r.action !== 'DELETE' && r.new_data ? `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:800;color:var(--green);margin-bottom:6px;text-transform:uppercase">📥 بعد التعديل</div>
          <pre style="background:var(--green-l);border:.5px solid var(--green);border-radius:8px;padding:10px;font-size:11px;direction:ltr;text-align:left;overflow-x:auto;max-height:240px">${escapeHtml(JSON.stringify(r.new_data, null, 2))}</pre>
        </div>
      ` : ''}
    `;

    // اخفِ زر الحفظ
    const saveBtn = document.getElementById('edit-modal-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';

    window.openModal('modal-edit');
  };
}
