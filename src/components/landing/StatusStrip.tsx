'use client';

import { useEffect, useState } from 'react';
import { Clock, Truck, AlertTriangle, Info } from 'lucide-react';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import {
  isStoreOpen,
  nextOrderByCutoff,
  isTemporarilyClosed,
  temporaryCloseLabel,
  formatClock,
} from '@/features/menu/lib/store-hours';
import { getSlotAvailability, formatClock12h } from '@/features/delivery/lib/slots';

export default function StatusStrip() {
  const [now, setNow] = useState<Date | null>(null);
  const settings = usePublicSettings();

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const hours = { open: settings.hours.open, close: settings.hours.close };
  const tempClosed = now ? isTemporarilyClosed(settings.tempReopensAt, now) : false;
  const open = now ? !tempClosed && isStoreOpen(hours, now) : false;
  const cutoff = now && open ? nextOrderByCutoff(settings.orderByCutoffs, now) : null;

  // Fixed Delivery Slots calculation
  const slotData = now && settings.deliveryFixedSlotsEnabled
    ? getSlotAvailability(settings.deliverySlots, now)
    : null;

  const nextSlot = slotData?.nextAvailableSlot;

  return (
    <div className="bg-zbg space-y-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-1 space-y-2">
        {/* Main Store Status Strip */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-zborder bg-zcard px-4 py-2.5 shadow-sm animate-fade-up">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              now ? (open ? 'bg-zgreen' : 'bg-amber-500') : 'bg-zgray'
            }`}
          />
          <p className="text-xs font-semibold text-ztext truncate">
            {now
              ? tempClosed
                ? temporaryCloseLabel(settings.tempReopensAt)
                : open
                ? `Open now · Kitchen closes ${formatClock(hours.close)}`
                : `Closed now · Opens tomorrow ${formatClock(hours.open)}`
              : ''}
          </p>
          {cutoff && (
            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
              <Clock size={10} />
              {cutoff.minutesLeft <= 15
                ? `${cutoff.label} orders close in ${cutoff.minutesLeft}m`
                : `Order by ${formatClock(cutoff.time)} for ${cutoff.label}`}
            </span>
          )}
        </div>

        {/* 1. Delivery Unavailable Banner */}
        {!settings.deliveryAvailable && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 shadow-sm text-xs font-semibold text-red-500 animate-fade-up">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{settings.deliveryUnavailableMessage}</span>
          </div>
        )}

        {/* 2. Custom Delivery Announcement Banner */}
        {settings.deliveryAvailable && settings.deliveryCustomMessageEnabled && settings.deliveryCustomMessage && (
          <div className="flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 shadow-sm text-xs font-semibold text-blue-500 animate-fade-up">
            <Info size={16} className="shrink-0 text-blue-500" />
            <span>{settings.deliveryCustomMessage}</span>
          </div>
        )}

        {/* 3. Next Delivery Slot Banner (ONLY when Fixed Delivery Slots = ON and Delivery = ON) */}
        {settings.deliveryAvailable && settings.deliveryFixedSlotsEnabled && slotData && (
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 shadow-sm text-xs font-semibold text-emerald-600 animate-fade-up">
            <div className="flex items-center gap-2 truncate">
              <Truck size={16} className="shrink-0 text-emerald-600" />
              {nextSlot ? (
                <span className="truncate">
                  <strong>Next Delivery: {formatClock12h(nextSlot.delivery_time)}</strong>
                  <span className="hidden sm:inline text-emerald-600/80">
                    {' '}(Orders placed before {formatClock12h(nextSlot.cutoff_time)} will be delivered in this slot)
                  </span>
                </span>
              ) : (
                <span className="truncate">
                  Delivery slots for today are closed. Next slots available tomorrow.
                </span>
              )}
            </div>

            {nextSlot && (
              <span className="shrink-0 text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                Cutoff: {formatClock12h(nextSlot.cutoff_time)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
