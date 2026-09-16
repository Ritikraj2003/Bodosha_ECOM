'use client';

import { useEffect, useState } from 'react';
import HamsterLoader from '@/components/ui/HamsterLoader';
import { useAuthStore } from '@/features/auth/store';

/**
 * Global page loader — stays visible until:
 *   1. document.readyState === 'complete'  (all assets loaded)
 *   2. auth session is resolved (isLoading === false)
 *
 * Fades out smoothly when both conditions are satisfied.
 */
export default function PageLoader() {
  const authLoading = useAuthStore((s) => s.isLoading);
  const [docReady, setDocReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  // Track document readyState
  useEffect(() => {
    if (document.readyState === 'complete') {
      setDocReady(true);
      return;
    }
    const onLoad = () => setDocReady(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // Once both auth is resolved AND doc is ready → fade out then unmount
  useEffect(() => {
    if (!authLoading && docReady) {
      setFadeOut(true);
      const timer = setTimeout(() => setVisible(false), 400); // fade duration
      return () => clearTimeout(timer);
    }
  }, [authLoading, docReady]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-zbg, #0f0f0f)',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.4s ease',
        pointerEvents: fadeOut ? 'none' : 'all',
      }}
      aria-live="polite"
      aria-label="Loading page"
    >
      <HamsterLoader size="lg" />
    </div>
  );
}
