// ══════════════════════════════════════════════════════════════════
//  cache.js — تخزين مؤقت في IndexedDB (تحميل فوري + offline)
// ══════════════════════════════════════════════════════════════════
import { DB, conn } from '../state.js';

const DB_NAME = 'portfolio-cache-v1';
const STORE_NAME = 'portfolio_data';
const MAX_SNAPSHOTS_IN_CACHE = 100;
const MAX_TXNS_IN_CACHE = 2000; // حد أقصى للحركات المحفوظة

let _db = null;

// ══════════════════ فتح قاعدة البيانات ══════════════════

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// ══════════════════ حفظ البيانات في الكاش ══════════════════

export async function saveCache() {
  try {
    const uid = conn.authSession?.user?.id;
    if (!uid) return;
    const db = await openDB();

    // احتفظ بعدد محدود لتجنب تجاوز الحجم
    const snap = {
  data: {
    banks: DB.banks,
    bankTxns: DB.bankTxns.slice(0, MAX_TXNS_IN_CACHE),
    stockTxns: DB.stockTxns,
    stockPrices: DB.stockPrices,
    metalTxns: DB.metalTxns,
    metalPrices: DB.metalPrices,
    certs: DB.certs,
    dividends: DB.dividends,
    recurring: DB.recurring,
    goals: DB.goals,
    exchangeRates: DB.exchangeRates,
    snapshots: DB.snapshots.slice(-MAX_SNAPSHOTS_IN_CACHE),
    debts: DB.debts,
    debtPayments: DB.debtPayments,
    installments: DB.installments,             // ← جديد
    installmentPayments: DB.installmentPayments, // ← جديد
    rebalancing: undefined,
    attachments: DB.attachments || []
  },
  ts: Date.now(),
  version: 1
};
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(snap, uid);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });

    const size = JSON.stringify(snap.data).length;
    console.log(`[cache] ✓ saved (${(size / 1024).toFixed(1)} KB) at ${new Date().toLocaleTimeString('ar-EG')}`);
  } catch (e) {
    console.warn('[cache] save failed:', e.message);
  }
}

// ══════════════════ تحميل البيانات من الكاش ══════════════════

export async function loadCache() {
  try {
    const uid = conn.authSession?.user?.id;
    if (!uid) return null;

    const db = await openDB();
    const entry = await new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(uid);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    if (!entry || !entry.data) return null;

    // عمر الكاش
    const ageMin = (Date.now() - entry.ts) / 60000;
    console.log(`[cache] ✓ loaded — عمره ${ageMin.toFixed(1)} دقيقة`);

    return { data: entry.data, age: ageMin, ts: entry.ts };
  } catch (e) {
    console.warn('[cache] load failed:', e.message);
    return null;
  }
}

// ══════════════════ تطبيق الكاش على DB ══════════════════

export function applyCacheToDB(cacheData) {
  if (!cacheData) return false;
  Object.keys(cacheData).forEach(key => {
    if (Array.isArray(cacheData[key])) {
      DB[key] = cacheData[key];
    }
  });
  return true;
}

// ══════════════════ مسح الكاش ══════════════════

export async function clearCache() {
  try {
    const uid = conn.authSession?.user?.id;
    if (!uid) return;
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(uid);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    console.log('[cache] cleared');
  } catch (e) {
    console.warn('[cache] clear failed:', e.message);
  }
}

// ══════════════════ عرض حالة الكاش (للتشخيص) ══════════════════

export async function cacheInfo() {
  try {
    const uid = conn.authSession?.user?.id;
    if (!uid) return null;
    const db = await openDB();
    const entry = await new Promise((res) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(uid);
      req.onsuccess = () => res(req.result);
    });
    if (!entry) return null;
    return {
      age: (Date.now() - entry.ts) / 60000,
      ts: entry.ts,
      size: JSON.stringify(entry.data).length
    };
  } catch (e) { return null; }
}
