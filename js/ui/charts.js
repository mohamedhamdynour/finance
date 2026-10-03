// ══════════════════════════════════════════════════════════════════
//  charts.js — رسوم Chart.js موحّدة
//  يعتمد على وجود Chart في window (يُحمَّل من CDN أو Lazy)
// ══════════════════════════════════════════════════════════════════
import { CHARTS } from '../state.js';

// ══════════════════ Lazy Load Chart.js (اختياري) ══════════════════
// يُستخدم عند عدم تحميل Chart.js في <head> مباشرة
// مثال في main.js:
//   import { ensureChartLoaded } from './ui/charts.js';
//   setTimeout(() => ensureChartLoaded(), 100);

let _chartLoadingPromise = null;

export function ensureChartLoaded() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Chart) return Promise.resolve(true);
  if (_chartLoadingPromise) return _chartLoadingPromise;

  _chartLoadingPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.async = true;
        s.onload = () => {
      console.log('[charts] ✓ Chart.js loaded lazily');
      // أعد رسم الصفحة الحالية بعد تحميل Chart.js (لرسم الرسوم في أول فتح)
      setTimeout(() => {
        if (typeof window.renderPage === 'function') {
          try { window.renderPage(); } catch (e) { console.warn('[charts] re-render failed:', e); }
        }
      }, 150);
      resolve(true);
    };
    s.onerror = () => {
      console.warn('[charts] ✗ failed to load Chart.js');
      _chartLoadingPromise = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return _chartLoadingPromise;
}

// ══════════════════ Palette ══════════════════
export const PALETTE = [
  '#1a56db', '#0d9488', '#d97706', '#7c3aed', '#e11d48',
  '#0891b2', '#c2410c', '#059669', '#9333ea', '#0369a1'
];

// ══════════════════ Helpers ══════════════════
const isDark = () => document.body.classList.contains('dark');
const gc = () => isDark() ? '#1e2d47' : '#e8edf5';   // grid color
const tc = () => isDark() ? '#4a6080' : '#7a8ba8';   // tick color

// تحقق من تحميل Chart.js
function chartAvailable() {
  if (typeof window === 'undefined' || !window.Chart) {
    console.warn('[charts] Chart.js غير محمّلة — سيتم تجاهل الرسم');
    return false;
  }
  return true;
}

// تنسيق الأرقام على المحور
function fmtAxisTick(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v;
}

// تنسيق الأرقام في tooltips
function fmtTooltip(v) {
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(v);
}

// ══════════════════ Destroy Chart ══════════════════
export function destroyChart(key) {
  if (!CHARTS[key]) return;
  try { CHARTS[key].destroy(); } catch (e) { /* ignore */ }
  CHARTS[key] = null;
}

// ══════════════════ Pie / Doughnut ══════════════════
export function mkPie(id, labels, data, colors) {
  destroyChart(id);
  if (!chartAvailable()) return;
  const cv = document.getElementById(id);
  if (!cv) return;

  CHARTS[id] = new window.Chart(cv, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: isDark() ? '#0f1729' : '#fff',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      animation: { duration: 500 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: tc(),
            font: { size: 11, family: 'Cairo' },
            padding: 14,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + (b || 0), 0);
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0';
              return `${ctx.label}: ${fmtTooltip(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ══════════════════ Bar ══════════════════
export function mkBar(id, labels, datasets, stacked = false) {
  destroyChart(id);
  if (!chartAvailable()) return;
  const cv = document.getElementById(id);
  if (!cv) return;

  CHARTS[id] = new window.Chart(cv, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked,
          grid: { display: false },
          ticks: { color: tc(), font: { size: 10, family: 'Cairo' } }
        },
        y: {
          stacked,
          grid: { color: gc() },
          ticks: {
            color: tc(),
            font: { size: 10, family: 'Cairo' },
            callback: fmtAxisTick
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: tc(),
            font: { size: 11, family: 'Cairo' },
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label || ''}: ${fmtTooltip(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ══════════════════ Line ══════════════════
export function mkLine(id, labels, datasets) {
  destroyChart(id);
  if (!chartAvailable()) return;
  const cv = document.getElementById(id);
  if (!cv) return;

  CHARTS[id] = new window.Chart(cv, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: tc(),
            font: { size: 10, family: 'Cairo' },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: gc() },
          ticks: {
            color: tc(),
            font: { size: 10, family: 'Cairo' },
            callback: fmtAxisTick
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: tc(),
            font: { size: 11, family: 'Cairo' },
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtTooltip(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ══════════════════ Horizontal Bar ══════════════════
export function mkHBar(id, labels, data, colors) {
  destroyChart(id);
  if (!chartAvailable()) return;
  const cv = document.getElementById(id);
  if (!cv) return;

  CHARTS[id] = new window.Chart(cv, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmtTooltip(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { color: gc() },
          ticks: {
            color: tc(),
            font: { size: 10, family: 'Cairo' },
            callback: fmtAxisTick
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: tc(),
            font: { size: 11, family: 'Cairo' }
          }
        }
      }
    }
  });
}

// ══════════════════ Stats (مساعد للرسوم) ══════════════════

/**
 * يعيد لون خلفية صالح لرسوم PnL (أخضر للربح، أحمر للخسارة)
 * @param {number} value - القيمة
 * @param {number} alpha - الشفافية (0-1)
 */
export function pnlColor(value, alpha = 0.85) {
  return value >= 0
    ? `rgba(13,148,136,${alpha})`
    : `rgba(225,29,72,${alpha})`;
}

/**
 * ينتج مصفوفة ألوان من PALETTE للأطوال المختلفة
 */
export function paletteColors(count) {
  return Array(count).fill(0).map((_, i) => PALETTE[i % PALETTE.length]);
}
