'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Home, ShoppingBag, Users, TrendingUp, Settings, LogOut, Bell, UtensilsCrossed } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { isOwnerSession } from '@/features/auth/actions';
import HamsterLoader from '@/components/ui/HamsterLoader';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/auth/login');
    }
  }, [isLoading, isAuthenticated, user, router]);

  // The store owner (Dilip Da) is view-only — never serve the legacy admin
  // console to them.
  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      isOwnerSession().then((isOwner) => {
        if (isOwner) router.replace('/dashboard/owner');
      });
    }
  }, [isAuthenticated, user?.role, router]);


  const tabs = [
    { label: 'Dashboard', href: '/admin', icon: Home },
    { label: 'Menu', href: '/admin/menu', icon: UtensilsCrossed },
    { label: 'Orders', href: '/admin/orders', icon: ShoppingBag },
    { label: 'Customers', href: '/admin/customers', icon: Users },
    { label: 'Analytics', href: '/admin/analytics', icon: TrendingUp },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  if (isLoading || (!isAuthenticated && typeof window !== 'undefined')) {
    return (
      <div className="flex h-screen items-center justify-center bg-zbg">
        <HamsterLoader />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zbg text-ztext overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-zcard border-r border-zborder shadow-z-modal z-20">
        <div className="p-6 flex items-center gap-3 border-b border-zborder">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zred to-orange-500 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Dilip Da Admin</span>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto scrollbar-hide">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                  active ? 'bg-zred/10 text-zred' : 'text-ztext-muted hover:bg-zgray hover:text-ztext'
                }`}
              >
                <tab.icon size={18} className={`transition-transform group-hover:scale-110 ${active ? 'text-zred' : ''}`} />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zborder">
          <button onClick={() => { useAuthStore.getState().signOut(); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-ztext-muted hover:text-zred hover:bg-zred/10 transition-colors">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zgray via-zbg to-zbg">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-zcard/50 backdrop-blur-xl border-b border-zborder/50 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold">Overview</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-full hover:bg-white/5 transition-colors text-ztext-light hover:text-ztext">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-zred rounded-full border border-zcard"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm border border-zborder overflow-hidden relative">
              <Image src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" alt="Admin avatar" fill sizes="32px" className="object-cover" />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
