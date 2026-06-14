// ── WEB PUSH УВЕДОМЛЕНИЯ ─────────────────────────────────
// Замени на свой публичный VAPID-ключ после запуска scripts/generate-vapid.js
const VAPID_PUBLIC_KEY = 'BJcNWkRkHFnHyB3Nz0ohowUJt6VefHImAIaOp3gLlNaaq3iwFKLEbp3Dz698HWje40Ydp2ysJT4PotKhQ1luyiY';

function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initPush() {
  if (!currentUser || !('PushManager' in window) || VAPID_PUBLIC_KEY.startsWith('REPLACE')) return;
  if (Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({
           userVisibleOnly: true,
           applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
         });
    await sb.from('profiles').update({ push_subscription: sub.toJSON() }).eq('id', currentUser.id);
  } catch (e) {
    console.warn('Push init:', e);
  }
}

async function requestPushPermission() {
  if (VAPID_PUBLIC_KEY.startsWith('REPLACE')) {
    alert('VAPID ключ не настроен — запусти node scripts/generate-vapid.js');
    return;
  }
  if (!('PushManager' in window)) {
    alert('Уведомления недоступны. Открой приложение через иконку на рабочем столе.');
    return;
  }

  const btn = document.getElementById('push-btn');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    if (btn) btn.textContent = 'Доступ запрещён';
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    // Отписываемся от старой подписки если есть (нужно при смене VAPID ключа)
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
    });
    await sb.from('profiles').update({ push_subscription: sub.toJSON() }).eq('id', currentUser.id);
    if (btn) { btn.textContent = '✓ Уведомления включены'; btn.disabled = true; btn.style.color = 'var(--green)'; }
  } catch (e) {
    console.error('Push subscribe:', e);
    if (btn) btn.textContent = 'Ошибка — попробуй ещё раз';
  }
}
