'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Package, FolderTree,
  BarChart3, Bell, Settings, Menu, X, LogOut, Store,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';

const navItems = [
  { label: 'Dashboard', href: '/dashboard/merchant', icon: LayoutDashboard },
  { label: 'Orders', href: '/dashboard/merchant/orders', icon: ShoppingBag },
  { label: 'Products', href: '/dashboard/merchant/products', icon: UtensilsCrossed },
  { label: 'Categories', href: '/dashboard/merchant/categories', icon: FolderTree },
  { label: 'Inventory', href: '/dashboard/merchant/inventory', icon: Package },
  { label: 'Analytics', href: '/dashboard/merchant/analytics', icon: BarChart3 },
  { label: 'Notifications', href: '/dashboard/merchant/notifications', icon: Bell },
  { label: 'Settings', href: '/dashboard/merchant/settings', icon: Settings },
];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, signOut } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth/login';
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/auth/login');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!isAuthenticated) window.location.href = '/auth/login';
    }, 4000);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-zgray flex flex-col lg:flex-row">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zcard border-r border-zborder transform transition-transform duration-300 lg:translate-x-0 lg:fixed lg:top-0 lg:bottom-0 lg:left-0 lg:z-30 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-zborder">
          <Link href="/dashboard/merchant" className="flex items-center gap-2.5 shrink-0 group" aria-label={process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'}>
            <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 border border-white/20 bg-black shadow-md flex items-center justify-center">
              <img src="/logo.png" alt={process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'} className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight leading-none text-white flex items-center gap-1">
                <span className="text-zred font-extrabold tracking-wide">
                  {(process.env.NEXT_PUBLIC_APP_NAME || 'BADMAAS').split(' ')[0]}
                </span>
              </span>
              <span className="text-[9px] font-bold text-zred-light tracking-wider uppercase leading-tight mt-0.5">Merchant Portal</span>
            </div>
          </Link>
          <button onClick={closeSidebar} aria-label="Close sidebar" className="lg:hidden p-1 rounded-lg hover:bg-zgray text-ztext-lighter">
            <X size={20} />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard/merchant' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={closeSidebar}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-zred text-white shadow-z' : 'text-ztext-light hover:bg-zgray'
                }`}>
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <div className="pt-4 mt-4 border-t border-zborder">
            <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ztext-light hover:bg-zgray transition-colors">
              <Store size={18} /> View store
            </Link>
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ztext-light hover:bg-zgray transition-colors">
              <LogOut size={18} /> Sign out
            </button>
          </div>
        </nav>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
        <header className="sticky top-0 z-30 bg-zcard sm:bg-zgray/80 sm:backdrop-blur-md border-b border-zborder h-16 flex items-center px-4 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" className="lg:hidden p-2 rounded-lg hover:bg-zgray text-ztext-light mr-3">
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <Link href="/dashboard/merchant/notifications" aria-label="Notifications" className="relative p-2 rounded-lg hover:bg-zgray text-ztext-light">
            <Bell size={20} />
          </Link>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
