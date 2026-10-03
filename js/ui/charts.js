// ══════════════════════════════════════════════════════════════════
//  charts.js — رسوم Chart.js موحّدة
//  يعتمد على وجود Chart في window (يُحمَّل من CDN في index.html)
// ══════════════════════════════════════════════════════════════════
import { CHARTS } from '../state.js';

// ─── ألوان الوضع الليلي/النهاري ────────────────────────────────
const isDark = () => document.body.classList.contains('dark');
const gc = () => isDark() ? '#1e2d47' : '#e8edf5';
const tc = () => isDark() ? '#4a6080' : '#7a8ba8';

export const PALETTE = [
  '#1a56db', '#0d9488', '#d97706', '#7c3aed', '#e11d48',
  '#0891b2', '#c2410c', '#059669', '#9333ea', '#0369a1'
];

// ─── تدمير رسم موجود ───────────────────────────────────────────
export function destroyChart(key) {
  if (CHARTS[key]) {
    try { CHARTS[key].destroy(); } catch (e) {}
    CHARTS[key] = null;
  }
}

// ─── Chart.js متاح؟ ────────────────────────────────────────────
function chartAvailable() {
  if (typeof window === 'undefined' || !window.Chart) {
    console.warn('[charts] Chart.js غير محمّلة');
    return false;
  }
  return true;
}

// ─── دوائر / دونات ─────────────────────────────────────────────
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
          labels: { color: tc(), font: { size: 11, family: 'Cairo' }, padding: 14, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ─── أعمدة ─────────────────────────────────────────────────────
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
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: tc(), font: { size: 10, family: 'Cairo' } } },
        y: {
          stacked, grid: { color: gc() },
          ticks: {
            color: tc(), font: { size: 10, family: 'Cairo' },
            callback: v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v
          }
        }
      },
      plugins: {
        legend: { labels: { color: tc(), font: { size: 11, family: 'Cairo' }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label || ''}: ${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ─── خطوط ──────────────────────────────────────────────────────
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
        x: { grid: { display: false }, ticks: { color: tc(), font: { size: 10, family: 'Cairo' }, maxTicksLimit: 8 } },
        y: {
          grid: { color: gc() },
          ticks: {
            color: tc(), font: { size: 10, family: 'Cairo' },
            callback: v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v
          }
        }
      },
      plugins: {
        legend: { labels: { color: tc(), font: { size: 11, family: 'Cairo' }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ─── أعمدة أفقية ───────────────────────────────────────────────
export function mkHBar(id, labels, data, colors) {
  destroyChart(id);
  if (!chartAvailable()) return;
  const cv = document.getElementById(id);
  if (!cv) return;

  CHARTS[id] = new window.Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { color: gc() },
          ticks: {
            color: tc(), font: { size: 10, family: 'Cairo' },
            callback: v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v
          }
        },
        y: { grid: { display: false }, ticks: { color: tc(), font: { size: 11, family: 'Cairo' } } }
      }
    }
  });
}
