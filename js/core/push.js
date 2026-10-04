// ══════════════════════════════════════════════════════════════════
//  push.js — إدارة اشتراكات Push Notifications
// ══════════════════════════════════════════════════════════════════
import { conn } from '../state.js';
import { sbGet, sbPost, sbPatch, sbDel } from './supabase.js';

// ⚠️ VAPID public key — يجب أن تُنشئها أنت (راجع الدليل)
// يمكنك توليدها من: https://web-push-codelab.glitch.me/
// أو من Supabase Edge Function (المذكور في الأدلة)
const VAPID_PUBLIC_KEY = 'BI6urLT4zrUygFKRvR4HxsdV7VAfTE9NS2YoSaTNwd_n4Xtstpwa8Yfe9AyuIb1eqm0ucOXgD1Qff5c1XLeHaUs';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isPushConfigured() {
  return VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.length > 20 && !VAPID_PUBLIC_KEY.includes('xxxxxxxx');
}

export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * يطلب الإذن ويشترك في Push.
 */
export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push غير مدعوم في هذا المتصفح');
  if (!isPushConfigured()) throw new Error('VAPID key غير مُعدّ — راجع التعليمات');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم منح الإذن');

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await saveSubscription(subscription);
  return subscription;
}

/**
 * يحفظ الاشتراك في قاعدة البيانات.
 */
async function saveSubscription(subscription) {
  const uid = conn.authSession?.user?.id;
  if (!uid) throw new Error('يجب تسجيل الدخول');

  const sub = subscription.toJSON();
  const payload = {
    endpoint: sub.endpoint,
    keys_p256dh: sub.keys.p256dh,
    keys_auth: sub.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString()
  };

  // حاول التحديث أولاً
  const existing = await sbGet('push_subscriptions', `?endpoint=eq.${encodeURIComponent(sub.endpoint)}&limit=1`);
  if (existing && existing.length) {
    await sbPatch('push_subscriptions', existing[0].id, payload);
    return existing[0];
  }
  return sbPost('push_subscriptions', [{ ...payload, user_id: uid }]);
}

/**
 * يلغي الاشتراك.
 */
export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  try {
    const existing = await sbGet('push_subscriptions', `?endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`);
    if (existing?.length) await sbDel('push_subscriptions', existing[0].id);
  } catch (e) {
    console.warn('[push] failed to delete from DB:', e.message);
  }
}

/**
 * يُرجع الاشتراك الحالي (أو null).
 */
export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * اختبار: أرسل إشعار تجريبي عبر Service Worker مباشرة.
 */
export async function sendTestNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('اختبار من محفظتي', {
    body: 'إذا رأيت هذا الإشعار، فالتطبيق جاهز للتنبيهات',
    icon: './icon.svg',
    tag: 'test',
    data: { url: './' }
  });
}
