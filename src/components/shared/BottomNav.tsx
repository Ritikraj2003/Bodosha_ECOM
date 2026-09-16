'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ClipboardList, User, LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';

const customerTabs = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Menu', href: '/menu', icon: UtensilsCrossed },
  { label: 'Orders', href: '/orders', icon: ClipboardList },
  { label: 'Profile', href: '/profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const items = useCartStore((s) => s.items);
  const lastAddedAt = useCartStore((s) => s.lastAddedAt);
  const lastViewedAt = useCartStore((s) => s.lastViewedAt);
  const markCartViewed = useCartStore((s) => s.markCartViewed);

  const isStaff = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'owner';
  const staffDashboard = user?.role === 'owner' ? '/dashboard/owner' : '/dashboard/admin';
  const tabs = isStaff
    ? [
        { label: 'Profile', href: '/profile', icon: User },
        { label: 'Dashboard', href: staffDashboard, icon: LayoutDashboard },
      ]
    : customerTabs;

  useEffect(() => {
    if (pathname === '/cart' || pathname === '/orders') markCartViewed();
  }, [pathname, markCartViewed]);

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const hasUnviewedItems =
    cartCount > 0 && (lastAddedAt == null || lastViewedAt == null || lastAddedAt > lastViewedAt);
  const badgeCount = hasUnviewedItems ? cartCount : 0;

  if (pathname?.startsWith('/admin')) return null;
  if (user?.role === 'delivery') return null;

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        const Icon = tab.icon;
        const href =
          tab.label === 'Profile' && !isAuthenticated
            ? '/auth/login'
            : tab.href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={`bottom-nav-item ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative">
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {tab.label === 'Orders' && badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-0.5 rounded-full bg-zred text-white text-[9px] font-bold flex items-center justify-center">
                  {badgeCount}
                </span>
              )}
            </span>
            <span>{tab.label === 'Profile' && !isAuthenticated ? 'Sign In' : tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
