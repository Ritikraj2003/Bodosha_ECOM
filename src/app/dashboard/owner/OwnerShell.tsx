'use client';

import { useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, LogOut, Menu, X, ShoppingBag, Banknote, Bike,
  Store, UtensilsCrossed, Wallet,
} from 'lucide-react';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard/owner', icon: LayoutDashboard },
  { label: 'In-Store History', href: '/dashboard/owner/in-store', icon: Store },
  { label: 'Products', href: '/dashboard/owner/products', icon: UtensilsCrossed },
  { label: 'Orders', href: '/dashboard/owner/orders', icon: ShoppingBag },
  { label: 'Expenses', href: '/dashboard/owner/expenses', icon: Wallet },
  { label: 'Payments', href: '/dashboard/owner/payments', icon: Banknote },
  { label: 'Delivery Persons', href: '/dashboard/owner/delivery', icon: Bike },
];

export default function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = useCallback((href: string) => {
    if (href === '/dashboard/owner') return pathname === '/dashboard/owner';
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
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zcard border-r border-zborder transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:fixed lg:top-0 lg:bottom-0 lg:left-0 lg:z-30 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-zborder">
          <Link href="/dashboard/owner" className="flex items-center gap-1.5 shrink-0" aria-label="Dilip Da">
            <span className="text-xl font-black tracking-tight">
              <span className="text-ztext">Dilip</span> <span className="text-zred">Da</span>
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" className="lg:hidden p-1.5 hover:bg-zgray transition-colors">
            <X size={18} className="text-ztext-lighter" />
          </button>
        </div>

        <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-zred/10 text-zred'
                  : 'text-ztext-light hover:bg-zgray hover:text-ztext'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}

          <div className="pt-4 mt-4 border-t border-zborder">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-ztext-light hover:bg-zgray hover:text-red-400 transition-all"
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
        <header className="sticky top-0 z-30 bg-zcard border-b border-zborder">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" className="lg:hidden p-2 -ml-2 hover:bg-zgray transition-colors">
              <Menu size={20} className="text-ztext-light" />
            </button>

            <div className="hidden lg:flex items-center gap-2">
              <span className="text-xs font-medium text-ztext-muted">Dilip Da — Owner Dashboard</span>
            </div>

            <div className="flex items-center gap-3" />
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}