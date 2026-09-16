'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import { useAuthStore } from '@/features/auth/store';

export default function NavbarWrapper() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/dashboard/admin')) return null;
  if (user?.role === 'delivery') return null;
  return <Navbar />;
}
