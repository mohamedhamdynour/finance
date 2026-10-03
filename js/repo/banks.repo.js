import { sbGet, sbPost, sbPatch, sbDel, sbRpc } from '../core/supabase.js';
import { handleError } from '../core/errors.js';

const TABLE = 'banks';

export const banksRepo = {
  async list() {
    try { return await sbGet(TABLE, '?order=id&deleted_at=is.null'); }
    catch (e) { handleError(e, 'banks.list'); return []; }
  },
  async listAll() {           // يشمل المؤرشفة
    return sbGet(TABLE, '?order=id');
  },
  async create(row) {
    const [created] = await sbPost(TABLE, [{ ...row, user_id: undefined }]); // user_id يملؤه default
    return created;
  },
  async update(id, patch) { return sbPatch(TABLE, id, patch); },
  async softDelete(id) {
    // الـ trigger يحوّله لـ update deleted_at تلقائيًا
    return sbDel(TABLE, id);
  },
  // استخدم RPC للتحويل الذرّي
  async transfer({ fromId, toId, amount, fee, date, notes }) {
    return sbRpc('transfer_funds', {
      p_from_id: fromId, p_to_id: toId,
      p_amount: amount, p_fee: fee || 0,
      p_date: date, p_notes: notes || '',
    });
  },
};
