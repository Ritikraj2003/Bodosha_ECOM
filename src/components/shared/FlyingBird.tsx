'use client';

import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '@/features/cart/store';

interface Bird {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export default function FlyingBird() {
  const lastAddedRect = useCartStore((s) => s.lastAddedRect);
  const [birds, setBirds] = useState<Bird[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!lastAddedRect) return;

    const x = lastAddedRect.left + lastAddedRect.width / 2 - 14;
    const y = lastAddedRect.top;
    const dx = (window.innerWidth / 2 - 100) - x;
    const dy = (window.innerHeight - 80) - y;

    const id = ++idRef.current;
    setBirds((prev) => [...prev, { id, x, y, dx, dy }]);

    const timer = setTimeout(() => {
      setBirds((prev) => prev.filter((b) => b.id !== id));
    }, 900);

    return () => clearTimeout(timer);
  }, [lastAddedRect]);

  if (birds.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes flyToCart {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          45% { transform: translate(calc(var(--dx) * 0.45), calc(var(--dy) * 0.25 - 60px)) scale(0.9); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.35); opacity: 0; }
        }
      `}</style>
      {birds.map((bird) => (
        <div
          key={bird.id}
          style={{
            position: 'fixed',
            left: bird.x,
            top: bird.y,
            zIndex: 9999,
            pointerEvents: 'none',
            fontSize: 28,
            lineHeight: 1,
            '--dx': `${bird.dx}px`,
            '--dy': `${bird.dy}px`,
            animation: 'flyToCart 800ms ease-in-out forwards',
          } as React.CSSProperties}
        >
          🐦
        </div>
      ))}
    </>
  );
}
