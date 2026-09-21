'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, ShoppingBag, Banknote,
  LogOut, Menu, X, Bell, FolderTree, UtensilsCrossed,
  ClipboardList, Settings, Megaphone, Store, ShieldCheck, WalletCards,
  UserCog, KeyRound, ShieldAlert, ArrowRight, ChevronDown, GraduationCap,
  Loader2
} from 'lucide-react';
import { getServerSession } from '@/features/auth/actions';
import { canAccessAdminPage, getFirstAllowedAdminPage } from '@/lib/permissions';
import { useAuthStore } from '@/features/auth/store';

interface SidebarSubItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
}

interface SidebarGroup {
  type: 'group';
  label: string;
  icon: React.ElementType;
  children: SidebarSubItem[];
}

interface SidebarSingleItem {
  type: 'item';
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
}

type SidebarEntry = SidebarSingleItem | SidebarGroup;

const sidebarEntries: SidebarEntry[] = [
  { type: 'item', label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { type: 'item', label: 'In Store', href: '/dashboard/admin/in-store', icon: Store },
  { type: 'item', label: 'Wallet KYC', href: '/dashboard/admin/wallet', icon: ShieldCheck },
  { type: 'item', label: 'Orders', href: '/dashboard/admin/orders', icon: ShoppingBag },
  { type: 'item', label: 'Payments', href: '/dashboard/admin/payments', icon: Banknote },
  { type: 'item', label: 'Expenses', href: '/dashboard/admin/expenses', icon: WalletCards },
  {
    type: 'group',
    label: 'Settings',
    icon: Settings,
    children: [
      { label: 'Categories', href: '/dashboard/admin/categories', icon: FolderTree },
      { label: 'Products', href: '/dashboard/admin/products', icon: UtensilsCrossed },
      { label: 'General Settings', href: '/dashboard/admin/settings', icon: Settings },
      { label: 'Audit Logs', href: '/dashboard/admin/audit-logs', icon: ClipboardList },
      { label: 'Bumper Offers', href: '/dashboard/admin/bumper-offers', icon: Megaphone },
    ],
  },
  {
    type: 'group',
    label: 'User Management',
    icon: Users,
    children: [
      { label: 'Employee', href: '/dashboard/admin/users', icon: UserCog },
      { label: 'Roles & Permissions', href: '/dashboard/admin/roles', icon: KeyRound },
      { label: 'Customer', href: '/dashboard/admin/students', icon: Users },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState(() => authUser?.fullName || 'Admin');
  const [adminRole, setAdminRole] = useState(() => authUser?.role || '');
  const [permissions, setPermissions] = useState<string[]>(() => (authUser as any)?.permissions || []);
  const [isLoaded, setIsLoaded] = useState(() => !!authUser);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  useEffect(() => {
    if (authUser) {
      setAdminName(authUser.fullName || 'Admin');
      setAdminRole(authUser.role || '');
      setPermissions((authUser as any).permissions || []);
      setIsLoaded(true);
    }
  }, [authUser]);

  useEffect(() => {
    sidebarEntries.forEach((entry) => {
      if (entry.type === 'group') {
        const isChildActive = entry.children.some((c) => pathname.startsWith(c.href));
        if (isChildActive) {
          setOpenGroups((prev) => ({ ...prev, [entry.label]: true }));
        }
      }
    });
  }, [pathname]);

  useEffect(() => {
    if (authUser) {
      setAdminName(authUser.fullName || 'Admin');
      setAdminRole(authUser.role || '');
      setPermissions((authUser as any).permissions || []);
      setIsLoaded(true);
      return;
    }

    let mounted = true;
    (async () => {
      try {
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
  }, [authUser]);

  const isActive = useCallback((href: string) => {
    if (href === '/dashboard/admin') return pathname === '/dashboard/admin';
    return pathname.startsWith(href);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await useAuthStore.getState().signOut();
    } catch {}
    window.location.href = '/auth/login';
  };

  const visibleSidebarEntries = (!isLoaded && !adminRole)
    ? sidebarEntries
    : sidebarEntries
        .map((entry) => {
          if (entry.type === 'item') {
            return canAccessAdminPage(permissions, entry.href, adminRole) ? entry : null;
          }
          const visibleChildren = entry.children.filter((child) =>
            canAccessAdminPage(permissions, child.href, adminRole)
          );
          if (visibleChildren.length === 0) return null;
          return { ...entry, children: visibleChildren };
        })
        .filter(Boolean) as SidebarEntry[];

  const isAllowed = !isLoaded || canAccessAdminPage(permissions, pathname, adminRole);

  useEffect(() => {
    if (!isLoaded) return;
    const allowed = canAccessAdminPage(permissions, pathname, adminRole);
    if (!allowed) {
      const targetPage = getFirstAllowedAdminPage(permissions, adminRole);
      if (targetPage && targetPage !== pathname && targetPage !== '/auth/login') {
        router.replace(targetPage);
      }
    }
  }, [isLoaded, permissions, pathname, adminRole, router]);

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
          <Link href={getFirstAllowedAdminPage(permissions, adminRole)} className="flex items-center gap-2 shrink-0 group" aria-label="Bodosa">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-black/40 flex items-center justify-center">
              <img src="/logo.png" alt="Bodosa" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight leading-none">
                <span className="text-ztext">Bodo</span><span className="text-zred">sa</span>
              </span>
              <span className="text-[8px] font-semibold text-zred-light tracking-wider uppercase leading-tight">Admin Portal</span>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" className="lg:hidden p-1.5 hover:bg-zgray rounded-lg transition-colors">
            <X size={18} className="text-ztext-lighter" />
          </button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {visibleSidebarEntries.map((entry) => {
            if (entry.type === 'item') {
              const active = isActive(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-zred/10 text-zred shadow-z'
                      : 'text-ztext-light hover:bg-zgray hover:text-ztext'
                  }`}
                >
                  <entry.icon size={18} />
                  <span>{entry.label}</span>
                  {entry.badge && (
                    <span className="ml-auto text-[10px] font-bold bg-zred text-white px-1.5 py-0.5 rounded-full">
                      {entry.badge}
                    </span>
                  )}
                </Link>
              );
            }

            // Group (User Management, Settings)
            const isGroupActive = entry.children.some((child) => isActive(child.href));
            const isGroupOpen = openGroups[entry.label] ?? false;

            return (
              <div key={entry.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  className={`flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isGroupActive
                      ? 'text-ztext font-semibold bg-zsurface/50'
                      : 'text-ztext-light hover:bg-zgray hover:text-ztext'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <entry.icon size={18} className={isGroupActive ? 'text-zred' : ''} />
                    <span>{entry.label}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-ztext-lighter transition-transform duration-200 ${
                      isGroupOpen ? 'rotate-180 text-ztext' : ''
                    }`}
                  />
                </button>

                {isGroupOpen && (
                  <div className="ml-4 pl-2.5 border-l border-zborder/80 space-y-0.5 pt-0.5 pb-1">
                    {entry.children.map((child) => {
                      const childActive = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            childActive
                              ? 'bg-zred/10 text-zred font-bold'
                              : 'text-ztext-light hover:bg-zgray hover:text-ztext'
                          }`}
                        >
                          <child.icon size={15} />
                          <span>{child.label}</span>
                          {child.badge && (
                            <span className="ml-auto text-[10px] font-bold bg-zred text-white px-1.5 py-0.5 rounded-full">
                              {child.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

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
              <Link
                href="/admin/profile"
                className="flex items-center gap-2.5 pl-3 border-l border-zborder hover:opacity-80 transition-opacity cursor-pointer"
                title="View Profile"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zred to-red-400 flex items-center justify-center text-white text-xs font-bold ring-2 ring-transparent hover:ring-zred/40 transition-all">
                  {adminName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-ztext leading-tight">{adminName}</p>
                  <p className="text-[11px] text-ztext-lighter leading-tight capitalize">{adminRole ? adminRole.replace(/_/g, ' ') : 'Staff'}</p>
                </div>
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {isAllowed ? (
            children
          ) : (
            (() => {
              const targetPage = getFirstAllowedAdminPage(permissions, adminRole);
              const isRedirecting = Boolean(targetPage && targetPage !== pathname && targetPage !== '/auth/login');

              if (isRedirecting) {
                return (
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                    <Loader2 size={36} className="animate-spin text-zred mb-3" />
                    <p className="text-sm font-medium text-ztext">Redirecting...</p>
                    <p className="text-xs text-ztext-lighter mt-1">Navigating to your authorized page</p>
                  </div>
                );
              }

              return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-zcard rounded-2xl border border-zborder max-w-md mx-auto mt-12 shadow-z">
                  <div className="w-16 h-16 rounded-2xl bg-zred/10 text-zred flex items-center justify-center mb-4">
                    <ShieldAlert size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-ztext mb-2">Access Denied</h2>
                  <p className="text-sm text-ztext-light mb-6">
                    You do not have permission to access this page. If you need access, please contact your Super Admin.
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="button-z button-z-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm"
                  >
                    <span>Sign Out</span>
                    <LogOut size={16} />
                  </button>
                </div>
              );
            })()
          )}
        </main>
      </div>
    </div>
  );
}
