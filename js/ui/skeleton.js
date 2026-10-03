// ══════════════════════════════════════════════════════════════════
//  skeleton.js — تحميل متدرج (Skeleton screens) بدل الشاشة الفارغة
// ══════════════════════════════════════════════════════════════════

// ─── Skeleton لبطاقة KPI ───────────────────────────────────────
export function kpiSkeleton(count = 4) {
  return Array(count).fill(0).map(() => `
    <div class="kpi" style="border-right:3px solid var(--border)">
      <div class="kpi-header">
        <div class="skel skel-icon"></div>
        <div class="skel skel-badge"></div>
      </div>
      <div class="skel skel-label"></div>
      <div class="skel skel-value"></div>
      <div class="skel skel-sub"></div>
    </div>
  `).join('');
}

// ─── Skeleton لبطاقة info (بنك/سهم/معدن) ──────────────────────
export function cardSkeleton(count = 4, minWidth = 260) {
  return Array(count).fill(0).map(() => `
    <div class="info-card" style="min-width:${minWidth}px">
      <div class="info-card-strip skel"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div style="flex:1">
            <div class="skel skel-title"></div>
            <div class="skel skel-sub-small" style="margin-top:6px"></div>
          </div>
          <div class="skel skel-badge-sm"></div>
        </div>
        <div class="skel skel-value-big"></div>
        <div class="skel skel-row-2"></div>
        <div class="skel skel-row-2"></div>
      </div>
    </div>
  `).join('');
}

// ─── Skeleton لصف جدول ─────────────────────────────────────────
export function tableRowSkeleton(cols = 6, rows = 5) {
  return Array(rows).fill(0).map(() =>
    `<tr>${Array(cols).fill(0).map(() => '<td><div class="skel skel-cell"></div></td>').join('')}</tr>`
  ).join('');
}

// ─── Skeleton لرسم بياني ───────────────────────────────────────
export function chartSkeleton(height = 240) {
  return `
    <div class="skel-chart" style="height:${height}px">
      <div class="skel-chart-bars">
        ${Array(12).fill(0).map((_, i) => {
          const h = 30 + Math.random() * 60;
          return `<div class="skel-chart-bar" style="height:${h}%"></div>`;
        }).join('')}
      </div>
    </div>`;
}

// ─── عرض skeletons في كل مكان ─────────────────────────────────
export function showAllSkeletons() {
  // KPIs
  const kpiEls = ['dash-kpis', 'bank-kpis', 'stock-kpis', 'metal-kpis', 'cert-kpis', 'debt-kpis', 'recurring-kpis', 'report-kpis', 'zakat-kpis'];
  kpiEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = kpiSkeleton(el.id === 'dash-kpis' ? 6 : 4);
  });

  // Cards
  const cardEls = ['bank-cards', 'holdings-cards', 'metal-holdings-cards', 'cert-cards', 'recurring-cards'];
  cardEls.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.innerHTML.trim()) el.innerHTML = cardSkeleton(4);
  });

  // Tables
  const tableBodies = [
    ['dash-recent', 6], ['bank-txns-tbody', 6], ['stock-txns-tbody', 12],
    ['metal-txns-tbody', 12], ['div-tbody', 5], ['zakat-history-tbody', 5]
  ];
  tableBodies.forEach(([id, cols]) => {
    const el = document.getElementById(id);
    if (el && !el.innerHTML.trim()) el.innerHTML = tableRowSkeleton(cols, 4);
  });

  // Charts
  const charts = ['dash-pie', 'dash-line', 'dash-stacked'];
  charts.forEach(id => {
    const cv = document.getElementById(id);
    if (cv && cv.parentElement && !cv.parentElement.querySelector('.skel-chart')) {
      const skel = document.createElement('div');
      skel.className = 'skel-overlay';
      skel.innerHTML = chartSkeleton(220);
      cv.parentElement.style.position = 'relative';
      cv.parentElement.appendChild(skel);
    }
  });

  // Sidebar
  const sidebarTotal = document.getElementById('sidebar-total');
  if (sidebarTotal) sidebarTotal.innerHTML = '<span class="skel skel-inline"></span>';
}

export function hideAllSkeletons() {
  document.querySelectorAll('.skel-overlay').forEach(el => el.remove());
}
