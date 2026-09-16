'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, ShoppingBag, Banknote,
  LogOut, Menu, X, Bell, FolderTree, UtensilsCrossed,
  ClipboardList, Settings, Megaphone, Store, ShieldCheck, WalletCards
} from 'lucide-react';
import { getServerSession, isOwnerSession } from '@/features/auth/actions';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
}

const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'In Store', href: '/dashboard/admin/in-store', icon: Store },
  { label: 'Categories', href: '/dashboard/admin/categories', icon: FolderTree },
  { label: 'Products', href: '/dashboard/admin/products', icon: UtensilsCrossed },
  { label: 'Students', href: '/dashboard/admin/students', icon: Users },
  { label: 'Wallet KYC', href: '/dashboard/admin/wallet', icon: ShieldCheck },
  { label: 'Orders', href: '/dashboard/admin/orders', icon: ShoppingBag },
  { label: 'Payments', href: '/dashboard/admin/payments', icon: Banknote },
  { label: 'Expenses', href: '/dashboard/admin/expenses', icon: WalletCards },
  { label: 'Audit Logs', href: '/dashboard/admin/audit-logs', icon: ClipboardList },
  { label: 'General Settings', href: '/dashboard/admin/settings', icon: Settings },
  { label: 'Bumper Offers', href: '/dashboard/admin/bumper-offers', icon: Megaphone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState('Admin');
  const [adminRole, setAdminRole] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { user } = await getServerSession();
        if (user) {
          setAdminName(user.fullName);
          setAdminRole(user.role ?? '');
          // The store owner (Dilip Da) is view-only — never serve the admin
          // console to them, even if their role looks like admin.
          const owner = await isOwnerSession();
          if (owner) router.replace('/dashboard/owner');
        }
      } catch {}
    })();
  }, [router]);

  const isActive = useCallback((href: string) => {
    if (href === '/dashboard/admin') return pathname === '/dashboard/admin';
    return pathname.startsWith(href);
  }, [pathname]);

  const handleSignOut = async () => {
    const { createClient } = await import('@/infrastructure/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-zgray flex flex-col lg:flex-row">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zcard border-r border-zborder transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:fixed lg:top-0 lg:bottom-0 lg:left-0 lg:z-30 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-zborder">
          <Link href="/dashboard/admin" className="flex items-center gap-1.5 shrink-0" aria-label="Dilip Da">
            <span className="text-xl font-black tracking-tight">
              <span className="text-ztext">Dilip</span> <span className="text-zred">Da</span>
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" className="lg:hidden p-1.5 hover:bg-zgray rounded-lg transition-colors">
            <X size={18} className="text-ztext-lighter" />
          </button>
        </div>

        <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-zred/10 text-zred shadow-z'
                  : 'text-ztext-light hover:bg-zgray hover:text-ztext'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-[10px] font-bold bg-zred text-white px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}

          <div className="pt-4 mt-4 border-t border-zborder">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ztext-light hover:bg-zgray hover:text-red-400 transition-all"
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-zcard sm:bg-zgray/80 sm:backdrop-blur-lg border-b border-zborder">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" className="lg:hidden p-2 -ml-2 hover:bg-zgray rounded-lg transition-colors">
              <Menu size={20} className="text-ztext-light" />
            </button>

            <div className="hidden lg:flex items-center gap-2">
              <span className="text-xs text-ztext-muted">Super Admin</span>
            </div>

            <div className="flex items-center gap-3">
              <button aria-label="Notifications" className="relative p-2 hover:bg-zgray rounded-lg transition-colors">
                <Bell size={18} className="text-ztext-lighter" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-zred rounded-full" />
              </button>
              <div className="flex items-center gap-2.5 pl-3 border-l border-zborder">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zred to-red-400 flex items-center justify-center text-white text-xs font-bold">
                  {adminName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-ztext leading-tight">{adminName}</p>
                  <p className="text-[11px] text-ztext-lighter leading-tight capitalize">{adminRole.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
