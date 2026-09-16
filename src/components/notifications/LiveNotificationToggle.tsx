'use client';

import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, X, Sliders, CheckCircle2, RotateCw } from 'lucide-react';
import { savePushSubscription, removePushSubscription, sendTestPushNotification } from '@/features/notifications/actions/push';

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

export default function LiveNotificationToggle() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [showBlockedGuide, setShowBlockedGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      setIsSupported(false);
      return;
    }

    async function checkStatus() {
      try {
        if (Notification.permission !== 'granted') {
          setIsEnabled(false);
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsEnabled(Boolean(sub));
      } catch {
        setIsEnabled(Notification.permission === 'granted');
      }
    }

    checkStatus();

    // Listen to browser permission state changes in real-time
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((permissionStatus) => {
          permissionStatus.onchange = () => {
            if (permissionStatus.state === 'granted') {
              setShowBlockedGuide(false);
              activateSubscription();
            } else if (permissionStatus.state === 'denied') {
              setIsEnabled(false);
            } else {
              setIsEnabled(false);
            }
          };
        })
        .catch(() => { });
    }
  }, []);

  async function activateSubscription() {
    setLoading(true);
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

      setIsEnabled(true);
      setShowBlockedGuide(false);

      // Trigger instant test notification
      setTimeout(() => {
        sendTestPushNotification();
      }, 500);
    } catch (err) {
      console.error('Error activating subscription:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (!isSupported || loading) return;

    // If permission is currently denied by browser settings, show the interactive guide
    if (Notification.permission === 'denied') {
      setShowBlockedGuide(true);
      return;
    }

    setLoading(true);

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (isEnabled) {
        // Turn OFF
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setIsEnabled(false);
      } else {
        // Turn ON
        const perm = await Notification.requestPermission();
        if (perm === 'denied') {
          setIsEnabled(false);
          setShowBlockedGuide(true);
          setLoading(false);
          return;
        }

        if (perm !== 'granted') {
          setIsEnabled(false);
          setLoading(false);
          return;
        }

        await activateSubscription();
      }
    } catch (err) {
      console.error('Failed to toggle notification:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isSupported) return null;

  const enabled = isEnabled === true;

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        title={enabled ? 'Live Notifications: Enabled (Click to turn off)' : 'Live Notifications: Disabled (Click to turn on)'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-all duration-200 border shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer ${enabled
            ? 'bg-emerald-950/50 text-emerald-300 border-emerald-400/50 hover:bg-emerald-900/60 shadow-emerald-500/10'
            : 'bg-red-950/60 text-red-200 border-red-400/50 hover:bg-red-900/70 shadow-red-500/10'
          }`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : enabled ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
        ) : (
          <span className="inline-flex rounded-full h-2 w-2 bg-red-400 shrink-0"></span>
        )}

        <span>Live Notification</span>

        <span
          className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>

      {/* Interactive Unblock Guide Modal when browser has blocked permission */}
      {showBlockedGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-black text-white p-5 sm:p-6 rounded-3xl border border-amber-500/40 shadow-2xl max-w-sm w-full flex flex-col gap-4 relative">
            <button
              onClick={() => setShowBlockedGuide(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-500/10">
              <BellOff className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-gray-100">Notifications are Blocked</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Browser security ne is website ke notifications block kar diye hain. Allow karne ke liye bas 2 aasan steps follow karein:
              </p>
            </div>

            <div className="bg-gray-800/60 rounded-2xl p-3.5 border border-gray-700/60 flex flex-col gap-3 text-xs text-gray-200">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span className="leading-relaxed">
                  Address bar me <code className="bg-gray-900 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[11px]">localhost:3000</code> ke theek baayein (left) <b>Tune / Sliders icon (🎛️)</b> par click karein.
                </span>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span className="leading-relaxed">
                  <b>Notifications</b> switch ko <b>&ldquo;Allow&rdquo;</b> ya <b>&ldquo;Reset permission&rdquo;</b> karein.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowBlockedGuide(false);
                  window.location.reload();
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-gray-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-yellow-300 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>I have Allowed — Refresh Page</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBlockedGuide(false)}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
