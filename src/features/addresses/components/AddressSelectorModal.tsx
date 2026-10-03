'use client';

import { useState } from 'react';
import { X, Plus, CheckCircle, Edit3, Trash2, MapPin, Navigation, Phone, User, Home, Briefcase, Tag, ArrowLeft } from 'lucide-react';
import type { Address } from '@/types';
import AddressModal from './AddressModal';
import type { AddressInput } from '../actions';

interface AddressSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  addresses: Address[];
  selectedAddressId?: string | null;
  onSelectAddress: (address: Address) => void;
  onSaveAddress: (input: AddressInput) => Promise<{ success: boolean; address?: Address; error?: string }>;
  onDeleteAddress: (addressId: string) => Promise<{ success: boolean; error?: string }>;
  defaultName?: string;
  defaultPhone?: string;
}

export default function AddressSelectorModal({
  isOpen,
  onClose,
  addresses,
  selectedAddressId,
  onSelectAddress,
  onSaveAddress,
  onDeleteAddress,
  defaultName = '',
  defaultPhone = '',
}: AddressSelectorModalProps) {
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAddNew() {
    setEditingAddress(null);
    setIsFormOpen(true);
  }

  function handleEdit(addr: Address, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingAddress(addr);
    setIsFormOpen(true);
  }

  async function handleDelete(addressId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this address?')) return;
    setDeletingId(addressId);
    await onDeleteAddress(addressId);
    setDeletingId(null);
  }

  const getLabelIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case 'home':
        return <Home size={13} className="text-blue-500" />;
      case 'work':
        return <Briefcase size={13} className="text-amber-500" />;
      default:
        return <Tag size={13} className="text-emerald-500" />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 top-16 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
        <div className="bg-zcard border border-zborder rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[calc(100vh-5rem)] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-zborder flex items-center justify-between bg-zcard-inner shrink-0">
            <div>
              <h2 className="text-base font-bold text-ztext flex items-center gap-2">
                <MapPin size={18} className="text-zred" />
                Select Delivery Address
              </h2>
              <p className="text-xs text-ztext-light mt-0.5">
                Choose an existing address or add a new delivery location
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zgray transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-5 py-3 bg-blue-500/5 border-b border-zborder flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-ztext">
              {addresses.length} saved {addresses.length === 1 ? 'address' : 'addresses'}
            </span>
            <button
              type="button"
              onClick={handleAddNew}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <Plus size={14} />
              <span>ADD A NEW ADDRESS</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">

          {/* Address List */}
          {addresses.length === 0 ? (
            <div className="text-center py-16 px-4 bg-zcard border border-zborder rounded-2xl space-y-4">
              <div className="w-16 h-16 rounded-full bg-zgray flex items-center justify-center mx-auto text-ztext-light">
                <MapPin size={32} />
              </div>
              <div className="max-w-sm mx-auto">
                <h3 className="text-base font-bold text-ztext">No addresses saved yet</h3>
                <p className="text-xs text-ztext-light mt-1.5">
                  Add your delivery address for fast 1-click checkout.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddNew}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all inline-flex items-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer"
              >
                <Plus size={16} /> Add Your First Address
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {addresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <div
                    key={addr.id}
                    onClick={() => {
                      onSelectAddress(addr);
                      onClose();
                    }}
                    className={`relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-2.5 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-500/5 shadow-md shadow-blue-500/10'
                        : 'border-zborder hover:border-zborder-hover bg-zcard'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Radio indicator */}
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-zborder-hover bg-zcard'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>

                        {/* Recipient Name */}
                        <span className="font-bold text-sm text-ztext flex items-center gap-1.5">
                          {addr.name || 'Recipient'}
                        </span>

                        {/* Label Badge (Home / Work) */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-zgray border border-zborder text-ztext-light">
                          {getLabelIcon(addr.label)}
                          {addr.label || 'Home'}
                        </span>

                        {addr.isDefault && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-500">
                            DEFAULT
                          </span>
                        )}
                      </div>

                      {/* Edit & Delete Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleEdit(addr, e)}
                          title="Edit address"
                          className="p-1.5 rounded-lg text-ztext-light hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === addr.id}
                          onClick={(e) => handleDelete(addr.id, e)}
                          title="Delete address"
                          className="p-1.5 rounded-lg text-ztext-light hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Address details */}
                    <p className="text-xs sm:text-sm text-ztext-light pl-6 leading-relaxed">
                      {addr.addressLine1 || addr.fullAddress}
                      {addr.locality ? `, ${addr.locality}` : ''}
                      {addr.city ? `, ${addr.city}` : ''}
                      {addr.state ? `, ${addr.state}` : ''}
                      {addr.postalCode ? ` - ${addr.postalCode}` : ''}
                    </p>

                    {addr.landmark && (
                      <p className="text-xs text-ztext-muted pl-6 italic">
                        Landmark: {addr.landmark}
                      </p>
                    )}

                    {/* Phone & GPS badge */}
                    <div className="flex items-center gap-4 pl-6 pt-1 text-xs text-ztext-muted flex-wrap">
                      {addr.phone && (
                        <span className="flex items-center gap-1.5 text-ztext font-medium">
                          <Phone size={12} className="text-ztext-light" />
                          {addr.phone}
                          {addr.alternatePhone && ` (Alt: ${addr.alternatePhone})`}
                        </span>
                      )}

                      {addr.latitude && addr.longitude && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          GPS Tagged ({Number(addr.latitude).toFixed(4)}, {Number(addr.longitude).toFixed(4)})
                        </span>
                      )}
                    </div>

                    {/* Button on selected item */}
                    {isSelected && (
                      <div className="pl-6 pt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAddress(addr);
                            onClose();
                          }}
                          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition-all text-center cursor-pointer"
                        >
                          DELIVER HERE
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zborder bg-zcard-inner flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-ztext-light hover:text-ztext transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleAddNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>Add New Address</span>
          </button>
        </div>
      </div>
    </div>

      {isFormOpen && (
        <AddressModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSave={async (input) => {
            const res = await onSaveAddress(input);
            if (res.success && res.address) {
              onSelectAddress(res.address);
            }
            return res;
          }}
          initialData={editingAddress}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
        />
      )}
    </>
  );
}
