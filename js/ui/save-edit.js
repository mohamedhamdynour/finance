// ══════════════════════════════════════════════════════════════════
//  save-edit.js — حفظ نموذج التعديل العام (Generic Edit Modal)
// ══════════════════════════════════════════════════════════════════
import { DB, editCtx } from '../state.js';
import { N2, fmt, today, baseCur, escapeHtml } from '../core/utils.js';
import { sbPatch } from '../core/supabase.js';
import { toast } from './toast.js';
import { closeModal } from './modals.js';
import { getHoldings } from '../domain/calc.js';

const reload = () => window.loadAll?.();

export async function saveEdit() {
  const { table, id } = editCtx;
  if (!table || !id) return;

  // ─── تعديل هدف مالي ───
  if (table === 'financial_goals') {
    const name = document.getElementById('edt-goal-name').value.trim();
    const target = N2(document.getElementById('edt-goal-target').value);
    const cat = document.getElementById('edt-goal-cat').value;
    if (!name || !target) return alert('أكمل البيانات');
    try {
      await sbPatch('financial_goals', id, { name, target, category: cat });
      closeModal('modal-edit');
      editCtx.table = null; editCtx.id = null;
      toast('تم تعديل الهدف');
      await reload();
    } catch (e) { toast('خطأ: ' + e.message, false); }
    return;
  }

  try {
    let body = {};

    // ─── حركة بنكية ───
    if (table === 'bank_transactions') {
      const dt = document.getElementById('edt-date').value;
      const type = document.getElementById('edt-type').value;
      const amount = N2(document.getElementById('edt-amount').value);
      const notes = document.getElementById('edt-notes').value;
      const cat = document.getElementById('edt-cat')?.value || '';
      if (!amount || amount <= 0) { toast('أدخل مبلغ صحيح', false); return; }
      body = { date: dt, type, amount, notes, category: cat };
    }

    // ─── عملية سهم (بيع) ───
    else if (table === 'stock_transactions') {
      const qty = N2(document.getElementById('edt-qty').value);
      const price = N2(document.getElementById('edt-price').value);
      const commission = N2(document.getElementById('edt-commission').value);
      const total = qty * price;
      const net = total - commission;
      const orig = DB.stockTxns.find(t => t.id === +id);
      const h = getHoldings();
      const sym = orig?.symbol;
      const dt = document.getElementById('edt-date').value;
      const avgCost = h[sym]?.avgPrice || orig?.price || 0;
      const profit = net - avgCost * qty;
      body = { date: dt, quantity: qty, price, total, commission, net, profit, notes: document.getElementById('edt-notes')?.value || '' };
      if (orig?.bank_transaction_id) {
        await sbPatch('bank_transactions', orig.bank_transaction_id, {
          amount: net, date: dt,
          notes: (orig.type === 'بيع' ? 'بيع ' : 'شراء ') + sym
        });
      }
    }

    // ─── عملية معدن ───
    else if (table === 'metal_transactions') {
      const w = N2(document.getElementById('edt-weight').value);
      const p = N2(document.getElementById('edt-price').value);
      const op = document.getElementById('edt-op').value;
      const extra = N2(document.getElementById('edt-extra')?.value || 0);
      const manufPerGram = op === 'شراء' ? N2(document.getElementById('edt-manuf').value) : 0;
      const manufacturing = manufPerGram * w;
      const commissionFixed = op === 'شراء' ? extra : 0;
      const cashback = op === 'بيع' ? extra : 0;
      const total = w * p;
      const net = op === 'شراء' ? total + manufacturing + commissionFixed : total + cashback;
      const bankSel = document.getElementById('edt-bank-id');
      const orig = DB.metalTxns.find(t => t.id === +id);
      const bankId = bankSel && bankSel.value ? +bankSel.value : (orig?.bank_id || null);
      const dt = document.getElementById('edt-date').value;
      const metal_type = document.getElementById('edt-metal').value;
      body = {
        date: dt, op, metal_type, weight: w, price_per_gram: p, total,
        manufacturing, commission_fixed: commissionFixed, cashback, net,
        bank_id: bankId,
        notes: document.getElementById('edt-notes')?.value || ''
      };
      if (orig?.bank_transaction_id) {
        const newBtType = op === 'شراء' ? 'سحب' : 'إيداع';
        await sbPatch('bank_transactions', orig.bank_transaction_id, {
          bank_id: bankId || orig.bank_id, type: newBtType, amount: net, date: dt,
          notes: (op === 'شراء' ? 'شراء ' : 'بيع ') + metal_type
        });
      }
    }

    await sbPatch(table, id, body);
    closeModal('modal-edit');
    editCtx.table = null; editCtx.id = null;
    toast('تم حفظ التعديلات');
    await reload();
  } catch (e) {
    toast('خطأ: ' + e.message, false);
  }
}
