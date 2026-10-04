// ══════════════════════════════════════════════════════════════════
//  ocr.js — استخراج البيانات من الصور (Tesseract.js)
// ══════════════════════════════════════════════════════════════════
let _tesseractPromise = null;

export function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve(true);
  if (_tesseractPromise) return _tesseractPromise;
  _tesseractPromise = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => resolve(true);
    s.onerror = () => { _tesseractPromise = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _tesseractPromise;
}

/**
 * يستخرج النص من صورة (receipt/invoice).
 * @param {File|Blob} image
 * @param {Function} onProgress - (pct) => void
 */
export async function extractText(image, onProgress) {
  const ok = await ensureTesseract();
  if (!ok) throw new Error('تعذّر تحميل Tesseract.js');

  const result = await window.Tesseract.recognize(image, 'ara+eng', {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress * 100);
    }
  });

  return result.data.text || '';
}

/**
 * يحاول استخراج الحقول المهمة من نص الفاتورة.
 * @returns {{amount:number|null, date:string|null, merchant:string|null, raw:string}}
 */
export function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // المبلغ: ابحث عن "الإجمالي"، "إجمالي"، "total"، "amount"
  let amount = null;
  const amountKeywords = /(الإجمالي|إجمالي|الإجمالى|total|amount|grand\s*total|net)/i;
  for (const line of lines) {
    if (amountKeywords.test(line)) {
      const match = line.match(/(\d[\d,.\s]{1,15})/);
      if (match) {
        const num = parseFloat(match[1].replace(/[,\s]/g, ''));
        if (!isNaN(num) && num > 0 && num < 1e9) { amount = num; break; }
      }
    }
  }
  // لو مافيش، خذ أكبر رقم معقول (يحتمل أنه الإجمالي)
  if (!amount) {
    let max = 0;
    for (const line of lines) {
      const nums = line.match(/\d[\d,.]{2,15}/g) || [];
      nums.forEach(n => {
        const v = parseFloat(n.replace(/[,\s]/g, ''));
        if (!isNaN(v) && v > max && v < 1e7) max = v;
      });
    }
    if (max > 0) amount = max;
  }

  // التاريخ: ابحث عن DD/MM/YYYY أو YYYY-MM-DD
  let date = null;
  const datePatterns = [
    /(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/,
    /(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/
  ];
  for (const line of lines) {
    for (const p of datePatterns) {
      const m = line.match(p);
      if (m) {
        if (m[1].length === 4) {
          date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        } else {
          let [, d, mo, y] = m;
          if (y.length === 2) y = '20' + y;
          if (+d > 12) date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
          else date = `${y}-${d.padStart(2, '0')}-${mo.padStart(2, '0')}`;
        }
        break;
      }
    }
    if (date) break;
  }

  // التاجر: أول سطر معقول (بدون أرقام كثيرة، طول 3-50)
  let merchant = null;
  for (const line of lines.slice(0, 8)) {
    const digitsRatio = (line.match(/\d/g) || []).length / line.length;
    if (line.length >= 3 && line.length <= 50 && digitsRatio < 0.3 && /[\u0600-\u06FFa-zA-Z]/.test(line)) {
      merchant = line;
      break;
    }
  }

  return { amount, date, merchant, raw: text };
}
