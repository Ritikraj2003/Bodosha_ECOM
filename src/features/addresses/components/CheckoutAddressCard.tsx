'use client';

import { useState } from 'react';
import { MapPin, Edit2, Plus, Phone, CheckCircle2, Home, Briefcase, Tag, Navigation } from 'lucide-react';
import type { Address } from '@/types';
import AddressModal from './AddressModal';
import AddressSelectorModal from './AddressSelectorModal';
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
  const [showSelector, setShowSelector] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

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
    <>
      <div className="bg-zcard border border-zborder rounded-2xl p-4 sm:p-5 shadow-sm transition-all hover:border-zborder-hover">
        {/* Header matching screenshot 1 */}
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
            <button
              type="button"
              onClick={() => setShowSelector(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-xs font-bold transition-all cursor-pointer border border-blue-500/20 uppercase tracking-wider"
            >
              <Edit2 size={12} />
              <span>Change</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Address</span>
            </button>
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

              <div className="flex items-center gap-3 pt-1">
                {selectedAddress.latitude && selectedAddress.longitude ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    GPS Tagged ({selectedAddress.latitude.toFixed(4)}, {selectedAddress.longitude.toFixed(4)})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded-md">
                    No GPS Pin attached
                  </span>
                )}

                {addresses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowSelector(true)}
                    className="text-[11px] text-blue-500 hover:underline font-semibold"
                  >
                    Switch to another saved address ({addresses.length})
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowNewModal(true)}
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
            </div>
          )}
        </div>
      </div>

      {showSelector && (
        <AddressSelectorModal
          isOpen={showSelector}
          onClose={() => setShowSelector(false)}
          addresses={addresses}
          selectedAddressId={selectedAddress?.id}
          onSelectAddress={onSelectAddress}
          onSaveAddress={async (input) => {
            const res = await onSaveAddress(input);
            return res;
          }}
          onDeleteAddress={onDeleteAddress}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
        />
      )}

      {showNewModal && (
        <AddressModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onSave={async (input) => {
            const res = await onSaveAddress(input);
            if (res.success && res.address) {
              onSelectAddress(res.address);
            }
            return res;
          }}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
        />
      )}
    </>
  );
}
