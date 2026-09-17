'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound, Home, UtensilsCrossed, ClipboardList, Heart, ChevronLeft, LayoutDashboard, ShoppingBag } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/shared/ThemeToggle';

const customerLinks = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Menu', href: '/menu', icon: UtensilsCrossed },
  { label: 'Cart', href: '/cart', icon: ShoppingBag },
  { label: 'Orders', href: '/orders', icon: ClipboardList },
  { label: 'Profile', href: '/profile', icon: UserRound },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const isStaff = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'owner';
  const staffDashboard = user?.role === 'owner' ? '/dashboard/owner' : '/dashboard/admin';
  const navLinks = isStaff
    ? [
        { label: 'Profile', href: '/profile', icon: UserRound },
        { label: 'Dashboard', href: staffDashboard, icon: LayoutDashboard },
      ]
    : customerLinks;

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <header className="nav-z relative z-50">
      <div className="container-z mx-auto nav-inner px-3 sm:px-4">
        {/* Logo or Back button */}
        {pathname === '/favorites' ? (
          <button onClick={() => router.back()} className="flex items-center gap-1 text-ztext hover:text-zred transition-colors shrink-0 font-semibold" aria-label="Go back">
            <ChevronLeft size={20} /> Back
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-1.5 shrink-0" aria-label="Dilip Da">
            <span className="text-xl sm:text-2xl font-semibold tracking-tight">
              <span className="text-ztext">Dilip</span> <span className="text-zred">Da</span>
            </span>
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
        <div className="hidden sm:flex items-center gap-1">
          <ThemeToggle className="icon-button-z" />
          <Link href="/cart" className="icon-button-z relative text-ztext hover:text-zred transition-colors" aria-label="Cart">
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-zred text-white text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-zgray animate-pulse" />
          ) : !isAuthenticated ? (
            <Link href="/auth/login" className="button-z button-z-primary text-sm px-4">
              Sign in
            </Link>
          ) : null}
        </div>

        {/* Mobile: logo + theme + favorites + cart (bottom nav also handles navigation) */}
        <div className="flex items-center gap-1 sm:hidden ml-auto">
          <ThemeToggle className="icon-button-z" />
          <Link href="/cart" className="icon-button-z relative text-ztext hover:text-zred transition-colors" aria-label="Cart">
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-zred text-white text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/favorites" prefetch={false} className="icon-button-z text-zred" aria-label="Favorites">
            <Heart size={20} className="fill-zred/20" />
          </Link>
        </div>
      </div>
    </header>
  );
}
