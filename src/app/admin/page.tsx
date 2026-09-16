'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import HamsterLoader from '@/components/ui/HamsterLoader';

export default function AdminDashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/auth/login');
      } else {
        router.replace('/dashboard/admin');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <HamsterLoader size="md" text="Redirecting..." />
    </div>
  );
}
