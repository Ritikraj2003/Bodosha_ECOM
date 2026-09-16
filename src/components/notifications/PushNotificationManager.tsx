'use client';

import { useEffect } from 'react';
import { savePushSubscription } from '@/features/notifications/actions/push';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as unknown as BufferSource;
}

export default function PushNotificationManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!isSupported) return;

    async function subscribeUser() {
      try {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        }

        if (sub) {
          const subJson = sub.toJSON();
          if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
            await savePushSubscription(
              {
                endpoint: subJson.endpoint,
                keys: {
                  p256dh: subJson.keys.p256dh,
                  auth: subJson.keys.auth,
                },
              },
              navigator.userAgent
            );
          }
        }
      } catch (err) {
        console.warn('Native push registration error:', err);
      }
    }

    // 1. If already granted, sync silently in background
    if (Notification.permission === 'granted') {
      subscribeUser();
      return;
    }

    // 2. If default (not yet decided), trigger native browser prompt directly
    if (Notification.permission === 'default') {
      const askNativePermission = async () => {
        try {
          const result = await Notification.requestPermission();
          if (result === 'granted') {
            await subscribeUser();
          }
        } catch (err) {
          console.warn('Error requesting native notification permission:', err);
        }
      };

      // Trigger native browser prompt
      askNativePermission();

      // Fallback: Also trigger on first user click if browser required user gesture
      const handleFirstInteraction = () => {
        if (Notification.permission === 'default') {
          askNativePermission();
        }
        window.removeEventListener('click', handleFirstInteraction);
        window.removeEventListener('touchstart', handleFirstInteraction);
      };

      window.addEventListener('click', handleFirstInteraction, { once: true });
      window.addEventListener('touchstart', handleFirstInteraction, { once: true });

      return () => {
        window.removeEventListener('click', handleFirstInteraction);
        window.removeEventListener('touchstart', handleFirstInteraction);
      };
    }
  }, []);

  // No custom popup or UI rendered at all — 100% native browser behavior
  return null;
}
