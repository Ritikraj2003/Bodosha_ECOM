'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCartStore } from '@/features/cart/store';
import { useAuthStore } from '@/features/auth/store';
import { useMaintenance } from '@/hooks/useMaintenance';

export default function FloatingCartBar() {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const [nearBottom, setNearBottom] = useState(false);
  const { enabled } = useMaintenance();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    const handleScroll = () => {
      const doc = document.documentElement;
      setNearBottom(window.innerHeight + window.scrollY >= doc.scrollHeight - 200);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  if (authLoading) return null;
  if (!isAuthenticated) return null;
  if (count === 0) return null;
  if (enabled) return null;
  if (nearBottom) return null;
  if (
    pathname?.startsWith('/cart') ||
    pathname?.startsWith('/orders') ||
    pathname?.startsWith('/checkout') ||
    pathname?.startsWith('/profile') ||
    pathname?.startsWith('/dashboard')
  ) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sticky-above-nav pointer-events-none">
      <Link
        href="/cart"
        className="mx-auto max-w-7xl flex items-center justify-between gap-3 rounded-2xl bg-slate-900 text-white px-4 py-3 border border-white/10 shadow-z-modal hover:brightness-125 transition-[filter] pointer-events-auto"
      >
        <div>
          <p className="text-xs font-bold leading-tight">
            {count} item{count > 1 ? 's' : ''} · ₹{total()}
          </p>
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Fees calculated at checkout</p>
        </div>
        <span className="shrink-0 inline-flex items-center justify-center bg-zred text-white text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-zred-dark transition-colors">
          View Cart
        </span>
      </Link>
    </div>
  );
}