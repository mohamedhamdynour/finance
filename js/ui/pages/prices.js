// ══════════════════════════════════════════════════════════════════
//  pages/prices.js — تحديث أسعار الأسهم/المعادن/الصرف
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS, conn } from '../../state.js';
import { N2, fmtN, today, escapeHtml, encodeID, baseCur } from '../../core/utils.js';
import { sbGet, sbUpsert, sbDelBy } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { getHoldings, getMetalHoldings, getStockPrice, getMetalPrice } from '../../domain/calc.js';
import { persistAppSettings } from '../../core/settings.js';

const reload = () => window.loadAll?.();

export function renderPrices() {
  const h = getHoldings();
  const heldSyms = Object.keys(h);
  const orphanSyms = DB.stockPrices.map(p => p.symbol).filter(s => !h[s]);

  const rowHtml = (sym, isHeld) => {
    const p = DB.stockPrices.find(x => x.symbol === sym);
    return `<div class="price-item">
      <div>
        <div class="price-item-label">${escapeHtml(sym)}${!isHeld ? ' <span style="font-size:9.5px;color:var(--red);font-weight:700;background:var(--red-l);padding:1px 5px;border-radius:4px">مُباع</span>' : ''}</div>
        <div class="price-item-sub">${escapeHtml(p?.name || h[sym]?.name || '')}${!isHeld ? ` — <button class="btn btn-xs btn-danger" onclick="removeOrphanStock('${encodeURIComponent(sym)}')">حذف</button>` : ''}</div>
      </div>
      <input class="price-input" type="number" step="0.01" id="sp-${encodeID(sym)}" value="${p?.current_price || ''}" placeholder="0.00">
    </div>`;
  };
  document.getElementById('stock-prices-list').innerHTML =
    (heldSyms.length ? heldSyms.map(s => rowHtml(s, true)).join('') : `<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد أسهم مملوكة</div>`) +
    (orphanSyms.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--muted);font-weight:700;padding:6px 0">أسعار قديمة (${orphanSyms.length})</summary>${orphanSyms.map(s => rowHtml(s, false)).join('')}</details>` : '');

  const mh = getMetalHoldings();
  const heldTypes = new Set(Object.values(mh).filter(v => v.weight > 0.001).map(v => (v.metal_type || '').split('|')[0].trim()));
  const allTypes = new Set(DB.metalPrices.map(p => p.metal_type));
  DB.metalTxns.forEach(t => { if (t.metal_type) allTypes.add(t.metal_type.split('|')[0].trim()); });
  const orphanTypes = [...allTypes].filter(t => !heldTypes.has(t)).sort();
  const heldTypeList = [...heldTypes].sort();

  const metalRowHtml = (type, isHeld) => {
    const p = DB.metalPrices.find(x => x.metal_type === type);
    const count = Object.values(mh).filter(v => (v.metal_type || '').split('|')[0].trim() === type && v.weight > 0.001).length;
    return `<div class="price-item">
      <div>
        <div class="price-item-label" style="color:${isHeld ? 'var(--gold)' : 'var(--muted)'};font-weight:800">${escapeHtml(type)}${!isHeld ? ' <span style="font-size:9.5px;color:var(--red);font-weight:700;background:var(--red-l);padding:1px 5px;border-radius:4px">مُباع</span>' : ''}</div>
        <div class="price-item-sub">${count > 0 ? count + ' حيازة' : ''}</div>
      </div>
      <input class="price-input" type="number" step="0.01" id="mp-${encodeID(type)}" value="${p?.price_per_gram || ''}" placeholder="ج.م/جم">
    </div>`;
  };
  document.getElementById('metal-prices-list').innerHTML =
    (heldTypeList.length ? heldTypeList.map(t => metalRowHtml(t, true)).join('') : `<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد معادن</div>`) +
    (orphanTypes.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--muted);font-weight:700;padding:6px 0">أسعار قديمة (${orphanTypes.length})</summary>${orphanTypes.map(t => metalRowHtml(t, false)).join('')}</details>` : '');

  const currencies = [...new Set(DB.banks.map(b => b.currency || 'EGP').filter(c => c !== 'EGP'))];
  const lastFx = localStorage.getItem('lastFxFetchDate');
  const fxStatus = `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 2px;margin-bottom:6px;border-bottom:.5px solid var(--border)">
    <div style="font-size:11px;color:var(--muted)">${lastFx === today() ? '✓ تم التحديث اليوم' : lastFx ? 'آخر تحديث: ' + lastFx : 'لم يتم التحديث'}</div>
    <button class="btn btn-xs btn-teal" onclick="autoFetchExchangeRates(true)" id="fx-fetch-btn">جلب الأسعار</button>
  </div>`;
  document.getElementById('exchange-rates-list').innerHTML = currencies.length
    ? fxStatus + currencies.map(cur => {
        const r = DB.exchangeRates.find(x => x.currency === cur);
        return `<div class="price-item"><div><div class="price-item-label">${escapeHtml(cur)} → EGP</div><div class="price-item-sub">${r?.updated_at ? 'آخر تحديث: ' + new Date(r.updated_at).toLocaleDateString('ar-EG') : '—'}</div></div><div style="display:flex;gap:6px;align-items:center"><input class="price-input" type="number" step="0.0001" id="exr-${escapeHtml(cur)}" value="${r?.rate || ''}" placeholder="49.5"><button class="btn btn-xs btn-teal" onclick="saveExchangeRate('${encodeURIComponent(cur)}')">حفظ</button></div></div>`;
      }).join('')
    : `<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد حسابات بعملات أجنبية</div>`;
}

export async function saveStockPrices() {
  const h = getHoldings();
  const syms = [...new Set([...DB.stockPrices.map(p => p.symbol), ...Object.keys(h)])];
  try {
    for (const sym of syms) {
      const el = document.getElementById('sp-' + encodeID(sym));
      if (!el) continue;
      const p = N2(el.value);
      if (!p) continue;
      const info = DB.stockPrices.find(x => x.symbol === sym) || { name: h[sym]?.name || sym, sec_type: h[sym]?.type || 'سهم' };
      await sbUpsert('stock_prices', { symbol: sym, name: info.name, sec_type: info.sec_type, current_price: p });
    }
    toast('تم حفظ أسعار الأسهم'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function saveMetalPrices() {
  try {
    for (const p of DB.metalPrices) {
      const el = document.getElementById('mp-' + encodeID(p.metal_type));
      if (!el) continue;
      const pr = N2(el.value);
      if (!pr) continue;
      await sbUpsert('metal_prices', { metal_type: p.metal_type, price_per_gram: pr });
    }
    toast('تم حفظ أسعار المعادن'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function saveExchangeRate(cur) {
  cur = decodeURIComponent(cur || '');
  const el = document.getElementById('exr-' + cur);
  if (!el) return;
  const rate = N2(el.value);
  if (!rate) return alert('أدخل سعر صرف صحيح');
  try { await sbUpsert('exchange_rates', { currency: cur, rate }); toast('تم حفظ سعر ' + cur); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function autoFetchExchangeRates(manual = false) {
  const currencies = [...new Set(DB.banks.map(b => b.currency || 'EGP').filter(c => c !== 'EGP'))];
  if (!currencies.length) { if (manual) alert('لا توجد عملات أجنبية'); return; }
  const todayStr = today();
  if (!manual && localStorage.getItem('lastFxFetchDate') === todayStr) return;
  const btn = document.getElementById('fx-fetch-btn');
  if (btn) btn.disabled = true;
  let updated = 0, failed = [];
  for (const cur of currencies) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      const rate = data?.rates?.EGP;
      if (data?.result === 'success' && rate) {
        await sbUpsert('exchange_rates', { currency: cur, rate: +N2(rate).toFixed(4) });
        updated++;
      } else failed.push(cur);
    } catch (e) { failed.push(cur); }
  }
  if (updated > 0) {
    localStorage.setItem('lastFxFetchDate', todayStr);
    localStorage.setItem('lastFxFetchAt', new Date().toISOString());
    localStorage.setItem('lastFxSource', 'open.er-api.com');
  }
  if (btn) btn.disabled = false;
  if (updated > 0) { toast(`تم تحديث ${updated} عملة`); await reload(); }
  else if (manual) alert('تعذّر الجلب');
}

export function saveGoldApiKey() {
  const key = document.getElementById('st-goldapi-key').value.trim();
  APP_SETTINGS.goldapi_key = key;
  persistAppSettings();
  toast(key ? 'تم الحفظ' : 'تم المسح');
}

function extractGramPrice(apiData, metalTypeLabel) {
  const oz2gram = v => v ? v / 31.1034768 : null;
  const t = metalTypeLabel.replace(/\s+/g, '');
  const map = {
    'ذهب24': apiData.price_gram_24k, 'ذهب24قيراط': apiData.price_gram_24k,
    'ذهب22قيراط': apiData.price_gram_22k,
    'ذهب21': apiData.price_gram_21k, 'ذهب21قيراط': apiData.price_gram_21k,
    'ذهب18': apiData.price_gram_18k, 'ذهب18قيراط': apiData.price_gram_18k,
    'جنيهذهب': apiData.price_gram_21k,
    'سبيكةذهب': apiData.price_gram_24k,
    'فضة': apiData.price_gram_24k || oz2gram(apiData.price)
  };
  return map[t] || null;
}

export async function autoFetchMetalPrices(manual = false) {
  const apiKey = APP_SETTINGS.goldapi_key;
  if (!apiKey) { if (manual) alert('أدخل مفتاح GoldAPI.io'); return; }
  const todayStr = today();
  if (!manual && localStorage.getItem('lastMetalFetchDate') === todayStr) return;
  const mh = getMetalHoldings();
  const heldTypes = [...new Set(Object.values(mh).filter(v => v.weight > 0.001).map(v => (v.metal_type || '').split('|')[0].trim()))].filter(Boolean);
  if (!heldTypes.length) { if (manual) alert('لا توجد معادن مملوكة'); return; }
  const isSilver = t => t.includes('فضة');
  const needGold = heldTypes.some(t => !isSilver(t)), needSilver = heldTypes.some(isSilver);
  const cur = baseCur();
  const btn = document.getElementById('metal-fetch-btn');
  if (btn) btn.disabled = true;
  let goldData = null, silverData = null, errors = [];
  try {
    if (needGold) {
      const r = await fetch(`https://www.goldapi.io/api/XAU/${cur}`, { headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' } });
      if (r.ok) goldData = await r.json(); else errors.push('XAU HTTP ' + r.status);
    }
    if (needSilver) {
      const r = await fetch(`https://www.goldapi.io/api/XAG/${cur}`, { headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' } });
      if (r.ok) silverData = await r.json(); else errors.push('XAG HTTP ' + r.status);
    }
  } catch (e) { errors.push('تعذّر الاتصال'); }
  let updated = 0;
  for (const t of heldTypes) {
    const data = isSilver(t) ? silverData : goldData;
    if (!data) continue;
    const gp = extractGramPrice(data, t);
    if (gp) { await sbUpsert('metal_prices', { metal_type: t, price_per_gram: +N2(gp).toFixed(2) }); updated++; }
  }
  if (updated > 0) {
    localStorage.setItem('lastMetalFetchDate', todayStr);
    localStorage.setItem('lastMetalFetchAt', new Date().toISOString());
    localStorage.setItem('lastMetalSource', 'goldapi.io');
  }
  if (btn) btn.disabled = false;
  if (updated > 0) { toast(`تم تحديث ${updated} نوع`); await reload(); }
  else if (manual) alert('تعذّر التحديث');
}

export async function removeOrphanStock(sym) {
  sym = decodeURIComponent(sym || '');
  if (!confirm(`حذف سعر ${sym}؟`)) return;
  try { await sbDelBy('stock_prices', 'symbol=eq.' + encodeURIComponent(sym)); toast('تم الحذف'); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}
