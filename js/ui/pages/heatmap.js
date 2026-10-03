// ══════════════════════════════════════════════════════════════════
//  pages/heatmap.js — خريطة حرارة الأسهم (treemap)
// ══════════════════════════════════════════════════════════════════
import { N2, fmt, fmtK, escapeHtml } from '../../core/utils.js';
import { calcTotals, getStockPrice } from '../../domain/calc.js';

export function renderStockHeatmapInto(h, div) {
  div.id = 'stocks-heatmap';
  renderStockHeatmap(h, div);
}

export function renderStockHeatmap(h, container) {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(h);
  if (!entries.length) return;

  const T = calcTotals();
  const items = entries.map(([sym, v]) => {
    const cp = getStockPrice(sym) || v.avgPrice;
    const curVal = v.qty * cp;
    const pnl = curVal - v.totalCost;
    const ret = v.totalCost ? pnl / v.totalCost * 100 : 0;
    return { sym, name: v.name, curVal, ret, pnl, share: T.stocksVal > 0 ? curVal / T.stocksVal * 100 : 0 };
  }).sort((a, b) => b.curVal - a.curVal);

  const getColor = ret => {
    if (ret > 15) return { bg: '#065f46', text: '#a7f3d0' };
    if (ret > 8) return { bg: '#0d9488', text: '#ccfbf1' };
    if (ret > 3) return { bg: '#14b8a6', text: '#f0fdfa' };
    if (ret > 0) return { bg: '#2dd4bf', text: '#134e4a' };
    if (ret === 0) return { bg: '#64748b', text: '#f1f5f9' };
    if (ret > -3) return { bg: '#f87171', text: '#450a0a' };
    if (ret > -8) return { bg: '#ef4444', text: '#ffe4e6' };
    if (ret > -15) return { bg: '#dc2626', text: '#fee2e2' };
    return { bg: '#7f1d1d', text: '#fecaca' };
  };

  const card = document.createElement('div');
  card.className = 'card';
  card.style = 'margin-bottom:16px';

  const totalVal = items.reduce((a, x) => a + x.curVal, 0) || 1;
  const BOX_W = 760, BOX_H = 220;

  function squarify(items, x, y, w, h) {
    if (!items.length) return [];
    if (items.length === 1) return [{ ...items[0], x, y, w, h }];
    const splitH = w >= h;
    const half = Math.floor(items.length / 2);
    const firstHalf = items.slice(0, half || 1);
    const secondHalf = items.slice(half || 1);
    const firstVal = firstHalf.reduce((a, x) => a + x.curVal, 0);
    const ratio = firstVal / totalVal;
    if (splitH) {
      const w1 = Math.max(60, w * ratio);
      return [...squarify(firstHalf, x, y, w1, h), ...squarify(secondHalf, x + w1, y, w - w1, h)];
    } else {
      const h1 = Math.max(40, h * ratio);
      return [...squarify(firstHalf, x, y, w, h1), ...squarify(secondHalf, x, y + h1, w, h - h1)];
    }
  }

  const layout = squarify(items, 0, 0, BOX_W, BOX_H);
  const cells = layout.map(item => {
    const c = getColor(item.ret);
    const fs = Math.max(10, Math.min(16, Math.sqrt(item.w * item.h) / 7));
    const showRet = item.h > 36 && item.w > 50;
    const showVal = item.h > 54 && item.w > 70;
    const leftPct = (item.x / BOX_W * 100).toFixed(3);
    const topPct = (item.y / BOX_H * 100).toFixed(3);
    const wPct = (Math.max(4, item.w - 3) / BOX_W * 100).toFixed(3);
    const hPct = (Math.max(4, item.h - 3) / BOX_H * 100).toFixed(3);
    return `<div title="${escapeHtml(item.name)}&#10;القيمة: ${fmt(item.curVal)}&#10;ر/خ: ${sign(item.pnl)}${fmt(item.pnl)}&#10;عائد: ${sign(item.ret)}${item.ret.toFixed(2)}%&#10;الحصة: ${item.share.toFixed(1)}%"
      style="position:absolute;left:${leftPct}%;top:${topPct}%;width:${wPct}%;height:${hPct}%;
      background:${c.bg};border-radius:6px;padding:5px 6px;cursor:default;overflow:hidden;
      display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;
      transition:filter .15s;box-shadow:0 1px 3px rgba(0,0,0,.25)"
      onmouseover="this.style.filter='brightness(1.15)';this.style.zIndex='5'"
      onmouseout="this.style.filter='';this.style.zIndex=''">
      <div style="font-weight:900;color:${c.text};font-size:clamp(9px,${fs}px,${fs}px);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center">${escapeHtml(item.sym)}</div>
      ${showRet ? `<div style="font-weight:700;color:${c.text};font-size:${Math.max(9, fs - 2)}px;opacity:.92">${sign(item.ret)}${item.ret.toFixed(1)}%</div>` : ''}
      ${showVal ? `<div style="color:${c.text};font-size:${Math.max(8, fs - 3)}px;opacity:.75">${fmtK(item.curVal)}</div>` : ''}
    </div>`;
  }).join('');

  const legend = ['خسارة > 15%','خسارة','محايد','ربح','ربح > 15%'].map((label, i) => {
    const colors = ['#7f1d1d','#ef4444','#64748b','#14b8a6','#065f46'];
    return `<span style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--muted)"><span style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></span>${label}</span>`;
  }).join('');

  card.innerHTML = `<div class="card-header">
    <div class="card-title">
      <div class="card-title-icon" style="background:var(--blue-l);color:var(--blue)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
      </div>
      خريطة حرارة الأسهم
      <span style="font-size:10px;color:var(--muted);font-weight:400">(الحجم = الحصة | اللون = العائد)</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${legend}</div>
  </div>
  <div class="card-body" style="padding:10px">
    <div style="position:relative;width:100%;aspect-ratio:${BOX_W}/${BOX_H};overflow:hidden;border-radius:8px">${cells}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:.5px solid var(--border)">
      ${items.map(x => {
        const c = getColor(x.ret);
        return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px">
          <span style="width:8px;height:8px;border-radius:2px;background:${c.bg};display:inline-block"></span>
          <strong style="color:var(--text)">${escapeHtml(x.sym)}</strong>
          <span style="color:${x.ret >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${sign(x.ret)}${x.ret.toFixed(1)}%</span>
          <span style="color:var(--muted);font-size:10px">${x.share.toFixed(0)}%</span>
        </span>`;
      }).join('')}
    </div>
  </div>`;
  container.appendChild(card);
}

function sign(v) { return N2(v) >= 0 ? '+' : ''; }
