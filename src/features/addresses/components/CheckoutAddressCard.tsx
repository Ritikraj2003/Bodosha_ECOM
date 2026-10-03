'use client';

import Link from 'next/link';
import { MapPin, Edit2, Plus, Phone, Home, Briefcase, Tag } from 'lucide-react';
import type { Address } from '@/types';
import type { AddressInput } from '../actions';

interface CheckoutAddressCardProps {
  addresses: Address[];
  selectedAddress: Address | null;
  onSelectAddress: (address: Address) => void;
  onSaveAddress: (input: AddressInput) => Promise<{ success: boolean; address?: Address; error?: string }>;
  onDeleteAddress: (addressId: string) => Promise<{ success: boolean; error?: string }>;
  defaultName?: string;
  defaultPhone?: string;
}

export default function CheckoutAddressCard({
  addresses,
  selectedAddress,
  onSelectAddress,
  onSaveAddress,
  onDeleteAddress,
  defaultName = '',
  defaultPhone = '',
}: CheckoutAddressCardProps) {
  const getLabelIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case 'home':
        return <Home size={12} className="text-blue-500" />;
      case 'work':
        return <Briefcase size={12} className="text-amber-500" />;
      default:
        return <Tag size={12} className="text-emerald-500" />;
    }
  };

  return (
    <div className="bg-zcard border border-zborder rounded-2xl p-4 sm:p-5 shadow-sm transition-all hover:border-zborder-hover">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zborder/50">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
            <MapPin size={16} />
          </span>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-ztext">
              Delivery address
            </h3>
          </div>
        </div>

        {selectedAddress ? (
          <Link
            href="/addresses?returnTo=/checkout"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-xs font-bold transition-all cursor-pointer border border-blue-500/20 uppercase tracking-wider"
          >
            <Edit2 size={12} />
            <span>Change</span>
          </Link>
        ) : (
          <Link
            href="/addresses?returnTo=/checkout&action=new"
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Address</span>
          </Link>
        )}
      </div>

      {/* Content */}
      <div className="pt-3">
        {selectedAddress ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-ztext">
                Deliver to: {selectedAddress.name || 'Recipient'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-zgray border border-zborder text-ztext-light">
                {getLabelIcon(selectedAddress.label)}
                {selectedAddress.label || 'Home'}
              </span>
              {selectedAddress.phone && (
                <span className="text-xs text-ztext-light font-medium flex items-center gap-1">
                  • <Phone size={11} className="text-ztext-muted" /> {selectedAddress.phone}
                </span>
              )}
            </div>

            <p className="text-xs text-ztext-light leading-relaxed">
              {selectedAddress.addressLine1 || selectedAddress.fullAddress}
              {selectedAddress.locality ? `, ${selectedAddress.locality}` : ''}
              {selectedAddress.city ? `, ${selectedAddress.city}` : ''}
              {selectedAddress.state ? `, ${selectedAddress.state}` : ''}
              {selectedAddress.postalCode ? ` - ${selectedAddress.postalCode}` : ''}
            </p>

            {selectedAddress.landmark && (
              <p className="text-[11px] text-ztext-muted italic">
                Landmark: {selectedAddress.landmark}
              </p>
            )}

            {selectedAddress.latitude && selectedAddress.longitude && (
              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>GPS Location Tagged</span>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/addresses?returnTo=/checkout&action=new"
            className="py-2 flex items-center justify-between text-xs text-ztext-light hover:text-ztext cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="text-ztext-muted group-hover:text-ztext transition-colors">
                No address saved
              </span>
              <span className="text-[11px] text-blue-500 font-semibold underline">
                Click to add address
              </span>
            </div>
            <Edit2 size={14} className="text-ztext-muted group-hover:text-blue-500 transition-colors" />
          </Link>
        )}
      </div>
    </div>
  );
}
