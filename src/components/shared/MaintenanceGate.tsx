'use client';

import { usePathname } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { useMaintenance } from '@/hooks/useMaintenance';

const STAFF_PREFIXES = ['/dashboard/admin', '/dashboard/merchant', '/dashboard/delivery', '/admin'];

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showMaintenance } = useMaintenance();

  const isStaffRoute = STAFF_PREFIXES.some((p) => pathname.startsWith(p));
  if (!showMaintenance || isStaffRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-zred/10 text-zred flex items-center justify-center">
          <Wrench size={30} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-ztext">App is under maintenance</h1>
        <p className="mt-2 text-sm text-ztext-light">
          We&apos;re doing a quick tune-up to serve you better. Please check back shortly.
        </p>
      </div>
    </div>
  );
}
