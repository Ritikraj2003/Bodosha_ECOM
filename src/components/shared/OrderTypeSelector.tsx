'use client';

import type { OrderType } from '@/features/orders/types';
import { ORDER_TYPES } from '@/features/orders/types';

interface OrderTypeSelectorProps {
  value: OrderType | null;
  onChange: (value: 'room_delivery' | 'takeaway') => void;
}

export function OrderTypeSelector({ value, onChange }: OrderTypeSelectorProps) {
  const customerOrderTypes = ORDER_TYPES.filter((ot) => ot.id === 'room_delivery' || ot.id === 'takeaway');

  return (
    <div className="bg-zcard rounded-xl border border-zborder p-4">
      <h2 className="font-semibold text-ztext mb-3 text-sm">
        How would you like to receive your order?
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {customerOrderTypes.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id as 'room_delivery' | 'takeaway')}
              className={`w-full text-left px-2.5 py-2.5 sm:px-3.5 sm:py-3 rounded-xl border transition-all flex items-start gap-1.5 sm:gap-2.5 ${
                selected
                  ? 'border-zred bg-red-500/10 shadow-z'
                  : 'border-zborder hover:border-ztext-light hover:bg-zgray'
              }`}
            >
              <span className="text-base sm:text-lg shrink-0 mt-0.5">{opt.icon}</span>
              <div className="min-w-0">
                <p className={`font-semibold text-[11px] sm:text-xs ${selected ? 'text-zred' : 'text-ztext'}`}>
                  {opt.label}
                </p>
                <p className="text-[9px] sm:text-[10px] text-ztext-light mt-0.5 leading-tight">
                  {opt.description}
                </p>
              </div>
              {selected && (
                <span className="ml-auto w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-zred flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zcard" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
