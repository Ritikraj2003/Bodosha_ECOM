'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

const IMAGE_DURATION_MS = 5000;

interface SliderItem {
  type: 'image' | 'video';
  url: string;
  alt?: string;
}

/** Full-screen lightbox shown when the user clicks a slide. */
function Lightbox({
  item,
  onClose,
}: {
  item: SliderItem;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen preview"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close fullscreen"
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 transition-colors text-white text-2xl leading-none"
      >
        ✕
      </button>

      {/* Media — stop propagation so clicking it doesn't close */}
      <div
        className="relative w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === 'image' ? (
          <Image
            src={item.url}
            alt={item.alt ?? 'Dilip Da offer'}
            fill
            className="object-contain"
            sizes="100vw"
          />
        ) : (
          <video
            src={item.url}
            className="max-w-full max-h-full rounded-xl"
            autoPlay
            controls
            playsInline
            preload="auto"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Home screen bumper offers slider.
 * - Images auto-advance after IMAGE_DURATION_MS.
 * - Videos play fully (muted, autoplay) before advancing via the "ended" event.
 * - Only one video is mounted at a time; other media stay unmounted/lazy.
 * - Restarts from the first item after the last one.
 * - A single healthy item renders statically without any timer.
 * - Failed/invalid media is removed from rotation gracefully.
 * - Clicking a slide opens it in a fullscreen lightbox.
 */
export default function BumperOffersSlider({ items }: { items: SliderItem[] }) {
  const [index, setIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(new Set());
  const [lightboxItem, setLightboxItem] = useState<SliderItem | null>(null);

  const valid = useMemo(
    () => items.filter((i) => !!i.url && !failedUrls.has(i.url)),
    [items, failedUrls],
  );

  // Derived (not synced) so shrinking the list never leaves an out-of-range index.
  const safeIndex = valid.length > 0 ? Math.min(index, valid.length - 1) : 0;
  const current = valid[safeIndex];

  const markFailed = useCallback((url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (valid.length > 0 ? (i + 1) % valid.length : 0));
  }, [valid.length]);

  // Auto-advance images only; videos advance via their own "ended" event.
  useEffect(() => {
    if (!current || current.type !== 'image' || valid.length < 2) return;
    const id = setTimeout(goNext, IMAGE_DURATION_MS);
    return () => clearTimeout(id);
  }, [current, safeIndex, valid.length, goNext]);

  if (valid.length === 0) return null;

  return (
    <>
      {/* Slider card */}
      <div
        className="relative rounded-2xl overflow-hidden h-32 sm:h-44 lg:h-56 shadow-z bg-zgray cursor-pointer"
        onClick={() => setLightboxItem(current)}
        title="Click to view fullscreen"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setLightboxItem(current);
        }}
        aria-label="Open fullscreen view"
      >
        {current.type === 'image' ? (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt ?? 'Dilip Da offer'}
            fill
            loading={safeIndex === 0 ? 'eager' : 'lazy'}
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 1200px"
            onError={() => markFailed(current.url)}
          />
        ) : (
          <video
            key={current.url}
            src={current.url}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            preload="auto"
            onError={() => markFailed(current.url)}
            onEnded={goNext}
          />
        )}

        {/* Fullscreen hint icon */}
        <div className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/40 text-white text-xs pointer-events-none">
          ⛶
        </div>

        {valid.length > 1 && (
          <div
            className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {valid.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                onClick={() => setIndex(i)}
                aria-label={`Slide ${i + 1}`}
                className={`slider-dot ${i === safeIndex ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}
    </>
  );
}
