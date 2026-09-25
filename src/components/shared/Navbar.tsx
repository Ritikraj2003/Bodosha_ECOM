'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRound, Home, UtensilsCrossed, ClipboardList, ChevronLeft, LayoutDashboard, ShoppingBag, LogOut } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';
import ThemeToggle from '@/components/shared/ThemeToggle';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const items = useCartStore((s) => s.items);
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const role = user?.role?.toLowerCase() || '';
  const isStaff = ['admin', 'super_admin', 'owner', 'employee', 'staff', 'manager'].includes(role);

  // Dynamic Navigation Links based on authentication & role
  let navLinks: Array<{ label: string; href: string; icon: React.ElementType }> = [];

  if (!isAuthenticated) {
    // Logged Out visitors only see public browsing links
    navLinks = [
      { label: 'Home', href: '/', icon: Home },
      { label: 'Menu', href: '/menu', icon: UtensilsCrossed },
    ];
  } else if (isStaff) {
    // Admin / Staff portal links
    navLinks = [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Admin Profile', href: '/admin/profile', icon: UserRound },
    ];
  } else {
    // Customer / Student links
    navLinks = [
      { label: 'Home', href: '/home/student', icon: Home },
      { label: 'Menu', href: '/student/menu', icon: UtensilsCrossed },
      { label: 'Cart', href: '/student/cart', icon: ShoppingBag },
      { label: 'Orders', href: '/student/orders', icon: ClipboardList },
      { label: 'Profile', href: '/student/profile', icon: UserRound },
    ];
  }

  function isActive(href: string): boolean {
    if (href === '/home/student') return pathname === '/home/student' || pathname === '/' || pathname === '/home';
    if (href === '/') return pathname === '/' || pathname === '/browser';
    return pathname.startsWith(href);
  }

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth/login';
  };

  return (
    <header className="nav-z relative z-50">
      <div className="container-z mx-auto nav-inner px-3 sm:px-4">
        {/* Logo or Back button */}
        {pathname === '/favorites' ? (
          <button onClick={() => router.back()} className="flex items-center gap-1 text-ztext hover:text-zred transition-colors shrink-0 font-semibold" aria-label="Go back">
            <ChevronLeft size={20} /> Back
          </button>
        ) : (
          <Link href={isStaff ? '/admin/dashboard' : (isAuthenticated ? '/home/student' : '/')} className="flex items-center gap-2.5 shrink-0 group" aria-label={process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'}>
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 border border-white/20 bg-black shadow-md flex items-center justify-center transition-transform group-hover:scale-105">
              <img src="/logo.png" alt={`${process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'} Logo`} className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-black tracking-tight leading-none text-white">
                <span className="text-zred font-extrabold tracking-wide">
                  {(process.env.NEXT_PUBLIC_APP_NAME || 'BADMAAS').split(' ')[0]}
                </span>
              </span>
              {(process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe').split(' ').slice(1).length > 0 && (
                <span className="text-[9px] font-bold text-ztext-lighter tracking-widest uppercase leading-tight mt-0.5">
                  {(process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe').split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </Link>
        )}

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-1 ml-auto" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`button-z button-z-ghost text-sm font-medium transition-colors relative ${
                isActive(link.href) ? '!text-zred font-bold' : ''
              }`}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              <link.icon size={14} className="mr-1" />
              {link.label}
              {link.label === 'Cart' && cartCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-zred text-white text-[10px] font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Desktop right icons */}
        <div className="hidden sm:flex items-center gap-1.5 ml-2">
          <ThemeToggle className="icon-button-z" />

          {/* Cart Icon: Only shown for authenticated customers */}
          {isAuthenticated && !isStaff && (
            <Link href="/student/cart" className="icon-button-z relative text-ztext hover:text-zred transition-colors" aria-label="Cart">
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-zred text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          )}

          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-zgray animate-pulse" />
          ) : !isAuthenticated ? (
            <Link href="/auth/login" className="button-z button-z-primary text-sm px-4">
              Sign in
            </Link>
          ) : (
            <button
              onClick={handleSignOut}
              className="button-z button-z-ghost text-xs text-ztext-light hover:text-zred flex items-center gap-1 px-2.5 py-1.5 ml-1"
              title="Sign out"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          )}
        </div>

        {/* Mobile: logo + theme + (cart if logged in) + Sign In button */}
        <div className="flex items-center gap-1.5 sm:hidden ml-auto">
          <ThemeToggle className="icon-button-z" />
          {isAuthenticated && !isStaff && (
            <Link href="/student/cart" className="icon-button-z relative text-ztext hover:text-zred transition-colors" aria-label="Cart">
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-zred text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          )}
          {!isAuthenticated && !isLoading && (
            <Link href="/auth/login" className="button-z button-z-primary text-xs px-3 py-1.5">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
