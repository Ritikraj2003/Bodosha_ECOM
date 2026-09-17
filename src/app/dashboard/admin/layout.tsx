'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, ShoppingBag, Banknote,
  LogOut, Menu, X, Bell, FolderTree, UtensilsCrossed,
  ClipboardList, Settings, Megaphone, Store, ShieldCheck, WalletCards,
  UserCog, KeyRound, ShieldAlert, ArrowRight
} from 'lucide-react';
import { getServerSession } from '@/features/auth/actions';
import { canAccessAdminPage, getFirstAllowedAdminPage } from '@/lib/permissions';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
}

const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'All Users', href: '/dashboard/admin/users', icon: UserCog },
  { label: 'Roles & Permissions', href: '/dashboard/admin/roles', icon: KeyRound },
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
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.user && mounted) {
            setAdminName(data.user.fullName || 'Admin');
            const role = data.user.role || '';
            setAdminRole(role);
            setPermissions(data.user.permissions || []);
            setIsLoaded(true);
            return;
          }
        }

        const { user } = await getServerSession();
        if (user && mounted) {
          setAdminName(user.fullName);
          const role = user.role ?? '';
          setAdminRole(role);
          setPermissions((user as any).permissions || []);
        }
      } catch {}
      if (mounted) setIsLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isActive = useCallback((href: string) => {
    if (href === '/dashboard/admin') return pathname === '/dashboard/admin';
    return pathname.startsWith(href);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      const { logoutAction } = await import('@/features/auth/actions/credentials');
      await logoutAction();
    } catch {}
    router.push('/auth/login');
  };

  const visibleSidebarItems = sidebarItems.filter((item) =>
    canAccessAdminPage(permissions, item.href, adminRole)
  );

  const isAllowed = !isLoaded || canAccessAdminPage(permissions, pathname, adminRole);

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
          {visibleSidebarItems.map((item) => (
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
              <span className="text-xs text-ztext-muted capitalize">
                {adminRole ? adminRole.replace(/_/g, ' ') : 'Admin'}
              </span>
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
                  <p className="text-[11px] text-ztext-lighter leading-tight capitalize">{adminRole ? adminRole.replace(/_/g, ' ') : 'Staff'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {isAllowed ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-zcard rounded-2xl border border-zborder max-w-md mx-auto mt-12 shadow-z">
              <div className="w-16 h-16 rounded-2xl bg-zred/10 text-zred flex items-center justify-center mb-4">
                <ShieldAlert size={32} />
              </div>
              <h2 className="text-xl font-bold text-ztext mb-2">Access Denied</h2>
              <p className="text-sm text-ztext-light mb-6">
                You do not have permission to access this page. If you need access, please contact your Super Admin.
              </p>
              <Link
                href={getFirstAllowedAdminPage(permissions, adminRole)}
                className="button-z button-z-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm"
              >
                <span>Go to Allowed Page</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
