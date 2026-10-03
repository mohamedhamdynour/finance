// ══════════════════════════════════════════════════════════════════
//  network-indicator.js — مؤشر حالة الشبكة في الشريط العلوي
// ══════════════════════════════════════════════════════════════════
import { onNetworkChange, getNetworkState, isOnline } from '../core/network.js';
import { toast } from './toast.js';

let _el = null;

export function installNetworkIndicator() {
  // أنشئ عنصر المؤشر
  _el = document.createElement('div');
  _el.id = 'network-indicator';
  _el.style.cssText = `
    display: flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: 20px;
    font-size: 10.5px; font-weight: 800;
    background: var(--green-l); color: var(--green-d);
    border: .5px solid var(--green);
    transition: all .25s;
    white-space: nowrap;
    user-select: none;
  `;
  _el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 2s infinite"></span><span id="net-ind-text">متصل</span>`;

  // أضفه قبل زر التنبيهات
  const bell = document.getElementById('notif-bell');
  const topbarActions = bell?.parentElement;
  if (topbarActions) {
    topbarActions.insertBefore(_el, bell);
  }

  // استمع للتغيرات
  onNetworkChange(updateIndicator);
  updateIndicator(getNetworkState());
}

function updateIndicator(net) {
  if (!_el) return;
  const text = _el.querySelector('#net-ind-text');
  const dot = _el.querySelector('span:first-child');

  if (net.online) {
    _el.style.background = 'var(--green-l)';
    _el.style.color = 'var(--green-d)';
    _el.style.borderColor = 'var(--green)';
    if (dot) { dot.style.background = 'var(--green)'; dot.style.animation = 'pulse 2s infinite'; }
    if (text) text.textContent = 'متصل';
  } else {
    _el.style.background = 'var(--red-l)';
    _el.style.color = 'var(--red-d)';
    _el.style.borderColor = 'var(--red)';
    if (dot) { dot.style.background = 'var(--red)'; dot.style.animation = 'none'; }
    if (text) text.textContent = 'غير متصل';
  }
}

// ══════════════════ Toast عند تغيير الحالة ══════════════════

let _lastState = null;
export function setupNetworkToasts() {
  onNetworkChange(net => {
    if (_lastState === null) { _lastState = net.online; return; }
    if (net.online !== _lastState) {
      _lastState = net.online;
      if (net.online) {
        toast('عدت متصلاً بالإنترنت ✓', true);
      } else {
        toast('لا يوجد اتصال — التطبيق يعمل من الكاش', false);
      }
    }
  });
}
