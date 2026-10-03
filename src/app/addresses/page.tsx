'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, MapPin, Phone, Home, Briefcase, Tag, Edit3, Trash2, Loader2 } from 'lucide-react';
import type { Address } from '@/types';
import { getUserAddresses, saveUserAddress, deleteUserAddress, setDefaultUserAddress, type AddressInput } from '@/features/addresses/actions';
import AddressModal from '@/features/addresses/components/AddressModal';
import Link from 'next/link';

export default function AddressesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zgray flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      }
    >
      <AddressesContent />
    </Suspense>
  );
}

function AddressesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/checkout';
  const action = searchParams.get('action');

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const res = await getUserAddresses();
      if (res.success && res.addresses) {
        setAddresses(res.addresses);
        const def = res.addresses.find((a) => a.isDefault) || res.addresses[0];
        if (def) setSelectedAddressId(def.id);
      }
    } catch (err) {
      console.error('Failed to load addresses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  useEffect(() => {
    if (action === 'new') {
      setEditingAddress(null);
      setIsFormOpen(true);
    }
  }, [action]);

  const handleAddNew = () => {
    setEditingAddress(null);
    setIsFormOpen(true);
  };

  const handleEdit = (addr: Address) => {
    setEditingAddress(addr);
    setIsFormOpen(true);
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    setDeletingId(addressId);
    try {
      const res = await deleteUserAddress(addressId);
      if (res.success) {
        setAddresses((prev) => prev.filter((a) => a.id !== addressId));
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      const res = await setDefaultUserAddress(addressId);
      if (res.success) {
        setAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            isDefault: a.id === addressId,
          }))
        );
        setSelectedAddressId(addressId);
      }
    } catch (err) {
      console.error('Set default error:', err);
    }
  };

  const handleDeliverHere = async (addr: Address) => {
    try {
      await setDefaultUserAddress(addr.id);
      router.push(returnTo);
    } catch (err) {
      console.error('Deliver here error:', err);
      router.push(returnTo);
    }
  };

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
    <div className="min-h-screen bg-zgray">
      <div className="page-pad pb-24">
        <div className="container-z mx-auto max-w-3xl">
          {/* Back link breadcrumb */}
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ztext-light hover:text-zred mb-4 transition-colors group cursor-pointer"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to {returnTo.includes('checkout') ? 'Checkout' : 'Profile'}</span>
          </Link>

          {!isFormOpen ? (
            <div className="space-y-4">
              {/* Header inside page content */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zcard border border-zborder rounded-2xl p-5 shadow-sm">
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-ztext flex items-center gap-2">
                    <MapPin size={22} className="text-zred" />
                    Select Delivery Address
                  </h1>
                  <p className="text-xs text-ztext-light mt-0.5">
                    Choose an existing address or add a new delivery location
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddNew}
                  className="self-start sm:self-auto flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                  <span>ADD A NEW ADDRESS</span>
                </button>
              </div>

              {/* Count */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-ztext uppercase tracking-wider">
                  {addresses.length} saved {addresses.length === 1 ? 'address' : 'addresses'}
                </span>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-ztext-light bg-zcard rounded-2xl border border-zborder">
                  <Loader2 size={28} className="animate-spin text-blue-500" />
                  <span className="text-xs font-medium">Loading your saved addresses...</span>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-16 px-4 bg-zcard border border-zborder rounded-2xl space-y-4 shadow-sm">
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
                    const isSelected = selectedAddressId === addr.id || (!selectedAddressId && addr.isDefault);
                    return (
                      <div
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-3 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-500/5 shadow-md shadow-blue-500/10'
                            : 'border-zborder hover:border-zborder-hover bg-zcard'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
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
                            <span className="font-bold text-sm text-ztext">
                              {addr.name || 'Recipient'}
                            </span>

                            {/* Label Badge */}
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-zgray border border-zborder text-ztext-light">
                              {getLabelIcon(addr.label)}
                              {addr.label || 'Home'}
                            </span>

                            {addr.isDefault && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-500">
                                DEFAULT
                              </span>
                            )}
                          </div>

                          {/* Edit & Delete Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(addr);
                              }}
                              title="Edit address"
                              className="p-1.5 rounded-lg text-ztext-light hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === addr.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(addr.id);
                              }}
                              title="Delete address"
                              className="p-1.5 rounded-lg text-ztext-light hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
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

                        {/* Phone & GPS */}
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

                        {/* Card Buttons */}
                        <div className="pl-6 pt-2 flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeliverHere(addr);
                            }}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                          >
                            DELIVER HERE
                          </button>

                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefault(addr.id);
                              }}
                              className="text-xs font-semibold text-ztext-light hover:text-blue-500 hover:underline cursor-pointer"
                            >
                              Set as default
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <AddressModal
              isOpen={isFormOpen}
              inPage={true}
              onClose={() => setIsFormOpen(false)}
              onSave={async (input) => {
                const res = await saveUserAddress(input);
                if (res.success && res.address) {
                  await fetchAddresses();
                  setIsFormOpen(false);
                  if (returnTo) {
                    await setDefaultUserAddress(res.address.id);
                    router.push(returnTo);
                  }
                }
                return res;
              }}
              initialData={editingAddress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
