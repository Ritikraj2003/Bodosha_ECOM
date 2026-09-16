'use client';

import Link from 'next/link';
import { Bike, MapPin } from 'lucide-react';
import type { AuthUser } from '@/features/auth/types';
import type { Order } from '@/features/orders/types';
import LiveNotificationToggle from '@/components/notifications/LiveNotificationToggle';

interface HomeHeaderProps {
  user: AuthUser | null;
  liveOrder: Order | null;
}

export default function HomeHeader({ user, liveOrder }: HomeHeaderProps) {
  const firstName = user?.fullName?.split(' ')[0] || 'Foodie';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 animate-hero-in overflow-hidden max-w-full">
      <div className="mx-auto max-w-7xl hero-band rounded-2xl shadow-z overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Hello, {firstName}!</h1>
            <p className="mt-0.5 text-xs font-medium text-white/90">Dilip Da · Homestyle meals</p>
          </div>
          <div className="shrink-0 pt-0.5">
            <LiveNotificationToggle />
          </div>
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-white/90">
          <MapPin size={13} className="text-white/85 shrink-0" />
          Near CIT Kokrajhar, 2nd Gate
        </p>

        {liveOrder && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-zcard border border-zborder px-3 py-2 shadow-sm">
            <span className="flex items-center gap-2 text-xs font-bold text-ztext min-w-0">
              <Bike size={16} className="text-zred shrink-0" />
              <span className="truncate">Your live order is arriving!</span>
            </span>
            <Link
              href={`/order/track?code=${liveOrder.tracking_code}`}
              className="shrink-0 rounded-lg bg-zred px-3 py-1.5 text-[11px] font-bold text-white hover:bg-zred-dark transition-colors"
            >
              View Details
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
