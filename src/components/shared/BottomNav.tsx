'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ClipboardList, User, LayoutDashboard, ShoppingBag, LogIn } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';

export default function BottomNav() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const items = useCartStore((s) => s.items);
  const markCartViewed = useCartStore((s) => s.markCartViewed);

  const role = user?.role?.toLowerCase() || '';
  const isStaff = ['admin', 'super_admin', 'owner', 'employee', 'staff', 'manager'].includes(role);

  useEffect(() => {
    if (pathname === '/cart' || pathname === '/orders') markCartViewed();
  }, [pathname, markCartViewed]);

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Suppress bottom nav on admin panel and delivery portal
  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/dashboard/admin')) return null;
  if (role === 'delivery') return null;

  // On auth pages (login/signup), always show only a "Home" tab → /browser
  if (pathname?.startsWith('/auth')) {
    return (
      <nav className="bottom-nav" aria-label="Bottom navigation">
        <Link href="/browser" className={`bottom-nav-item`} aria-current={undefined}>
          <span className="relative">
            <Home size={20} strokeWidth={2} />
          </span>
          <span>Home</span>
        </Link>
      </nav>
    );
  }

  let tabs: Array<{ label: string; href: string; icon: React.ElementType; isCart?: boolean }> = [];

  if (!isAuthenticated) {
    tabs = [
      { label: 'Home', href: '/', icon: Home },
      { label: 'Menu', href: '/menu', icon: UtensilsCrossed },
      { label: 'Sign In', href: '/auth/login', icon: LogIn },
    ];
  } else if (isStaff) {
    tabs = [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Admin Profile', href: '/admin/profile', icon: User },
    ];
  } else {
    tabs = [
      { label: 'Home', href: '/home/student', icon: Home },
      { label: 'Menu', href: '/student/menu', icon: UtensilsCrossed },
      { label: 'Cart', href: '/student/cart', icon: ShoppingBag, isCart: true },
      { label: 'Orders', href: '/student/orders', icon: ClipboardList },
      { label: 'Profile', href: '/student/profile', icon: User },
    ];
  }

  function isActive(href: string) {
    if (href === '/home/student') return pathname === '/home/student' || pathname === '/' || pathname === '/home';
    if (href === '/') return pathname === '/' || pathname === '/browser';
    return pathname.startsWith(href);
  }

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`bottom-nav-item ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative">
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {tab.isCart && cartCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-zred text-white text-[9px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
