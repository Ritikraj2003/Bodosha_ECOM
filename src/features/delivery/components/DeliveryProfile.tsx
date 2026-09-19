'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Phone, Mail, Bike, CreditCard, Star, LogOut, Pencil, Check, X, Loader2, ChevronLeft, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/components/shared/Toast';
import { updateServerProfile } from '@/features/auth/actions';
import { getDeliveryDashboard, updateDeliveryVehicleProfile } from '@/features/delivery/actions';
import type { DeliveryPartnerRow } from '@/features/delivery/types';

export default function DeliveryProfile() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const [partner, setPartner] = useState<DeliveryPartnerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<'name' | 'phone' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Vehicle Details state
  const [vehicleType, setVehicleType] = useState('Bike');
  const [licensePlate, setLicensePlate] = useState('');
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const load = useCallback(async () => {
    const res = await getDeliveryDashboard();
    if (res.success && res.data) {
      setPartner(res.data.partner);
      if (res.data.partner.vehicle_type) setVehicleType(res.data.partner.vehicle_type);
      if (res.data.partner.license_plate) setLicensePlate(res.data.partner.license_plate);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();  
  }, [load]);

  async function handleSave() {
    if (!editingField || !editValue.trim()) return;
    setSaving(true);
    const result = await updateServerProfile(
      editingField === 'name' ? { full_name: editValue } : { phone: editValue },
    );
    setSaving(false);
    if (result.error) {
      showToast(result.error);
    } else {
      await useAuthStore.getState().refresh();
      showToast(editingField === 'name' ? 'Name updated' : 'Phone updated');
      setEditingField(null);
      setEditValue('');
    }
  }

  async function handleSaveVehicle(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!licensePlate.trim()) {
      showToast('Please enter your license plate / vehicle number');
      return;
    }
    setSavingVehicle(true);
    const res = await updateDeliveryVehicleProfile({
      vehicleType,
      licensePlate: licensePlate.trim().toUpperCase(),
    });
    setSavingVehicle(false);
    if (res.success && res.data?.partner) {
      setPartner(res.data.partner);
      setEditingVehicle(false);
      showToast('Vehicle details updated successfully!');
    } else {
      showToast(res.error || 'Failed to update vehicle details');
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push('/auth/login');
    router.refresh();
  }

  const initials = (user?.fullName || user?.email || 'D')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="page-pad pb-28">
      <div className="container-z mx-auto max-w-lg">
        <button onClick={() => router.push('/dashboard/delivery')} className="flex items-center gap-1 text-sm text-ztext-light hover:text-zred transition-colors mb-4">
          <ChevronLeft size={16} /> Back to scanner
        </button>

        <h1 className="text-2xl font-bold text-ztext">Profile</h1>

        <div className="mt-5 bg-zcard rounded-xl border border-zborder p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zred/15 flex items-center justify-center text-zred font-bold text-lg shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ztext text-sm truncate">{user?.fullName || 'Delivery Partner'}</p>
            <p className="text-xs text-ztext-light truncate">{user?.email}</p>
            {partner && (
              <span className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${partner.is_available ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zgray text-ztext-light'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${partner.is_available ? 'bg-emerald-400' : 'bg-ztext-muted'}`} />
                {partner.is_available ? 'Available' : 'On delivery'}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { icon: Bike, label: 'Vehicle', value: partner ? (partner.vehicle_type || '—') : '—' },
            { icon: CreditCard, label: 'Deliveries', value: partner ? String(partner.total_deliveries) : '—' },
            { icon: Star, label: 'Rating', value: partner && partner.rating ? Number(partner.rating).toFixed(1) : '—' },
          ].map((s) => (
            <div key={s.label} className="bg-zcard rounded-xl shadow-z p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 shrink-0 text-zred">
                  <s.icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-ztext-light truncate">{s.label}</p>
                  <p className="font-bold text-ztext text-sm capitalize truncate">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Vehicle Registration & Details Section */}
        <div className="mt-4 bg-zcard rounded-xl border border-zborder p-4 shadow-z">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bike className="text-zred" size={20} />
              <h3 className="font-bold text-ztext text-sm">Vehicle Information</h3>
            </div>
            {partner?.license_plate && !editingVehicle && (
              <button
                onClick={() => {
                  setVehicleType(partner.vehicle_type || 'Bike');
                  setLicensePlate(partner.license_plate || '');
                  setEditingVehicle(true);
                }}
                className="size-7 grid place-items-center rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext transition-colors"
                title="Edit Vehicle"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>

          {!partner?.license_plate && !editingVehicle && (
            <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                <p className="font-semibold">Vehicle details needed</p>
                <p className="mt-0.5 text-amber-200/80">Please enter your vehicle type and number so orders can be assigned to you.</p>
              </div>
            </div>
          )}

          {!editingVehicle && partner?.license_plate ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-zgray/50 border border-zborder">
              <div>
                <p className="text-[11px] text-ztext-light">Vehicle Type & Number</p>
                <p className="font-bold text-ztext text-sm mt-0.5">
                  {partner.vehicle_type || 'Bike'} • <span className="font-mono text-zred">{partner.license_plate}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                <ShieldCheck size={12} />
                Verified
              </span>
            </div>
          ) : (
            <form onSubmit={handleSaveVehicle} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ztext-light mb-1.5">Vehicle Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'Bike', label: 'Bike 🏍️' },
                    { id: 'Scooter', label: 'Scooter 🛵' },
                    { id: 'Bicycle', label: 'Cycle 🚲' },
                    { id: 'EV', label: 'EV ⚡' },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVehicleType(v.id)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                        vehicleType === v.id
                          ? 'bg-zred text-white border-zred shadow-sm'
                          : 'bg-zgray border-zborder text-ztext-light hover:border-ztext-muted'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ztext-light mb-1.5">License Plate / Vehicle Number</label>
                <input
                  type="text"
                  placeholder="e.g. AS-26-A-1234"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  className="input-z text-sm font-mono tracking-wider uppercase w-full"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingVehicle || !licensePlate.trim()}
                  className="button-z button-z-primary text-xs font-bold px-4 py-2 flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {savingVehicle ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{partner?.license_plate ? 'Update Vehicle' : 'Save & Register Vehicle'}</span>
                </button>
                {partner?.license_plate && (
                  <button
                    type="button"
                    onClick={() => setEditingVehicle(false)}
                    className="button-z button-z-secondary text-xs px-3 py-2"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {loading && (
          <div className="mt-4 flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-ztext-lighter" />
          </div>
        )}

        <div className="mt-4 bg-zcard rounded-xl border border-zborder divide-y divide-zborder">
          <div className="p-4 flex items-center gap-3">
            <User size={18} className="text-zred shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ztext text-sm">Name</p>
              {editingField === 'name' ? (
                <input
                  className="input-z mt-1 text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditingField(null); }}
                />
              ) : (
                <p className="text-xs text-ztext-light mt-0.5 truncate">{user?.fullName || 'Not set'}</p>
              )}
            </div>
            {editingField === 'name' ? (
              <div className="flex items-center gap-1 shrink-0">
                {saving ? <Loader2 size={16} className="animate-spin text-ztext-muted" /> : (
                  <>
                    <button onClick={handleSave} className="size-7 grid place-items-center rounded-md hover:bg-zgreen/10 text-zgreen transition-colors"><Check size={15} /></button>
                    <button onClick={() => setEditingField(null)} className="size-7 grid place-items-center rounded-md hover:bg-zred/10 text-zred transition-colors"><X size={15} /></button>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => { setEditingField('name'); setEditValue(user?.fullName || ''); }} className="size-7 grid place-items-center rounded-md hover:bg-zgray text-ztext-muted transition-colors shrink-0">
                <Pencil size={14} />
              </button>
            )}
          </div>

          <div className="p-4 flex items-center gap-3">
            <Phone size={18} className="text-zred shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ztext text-sm">Phone</p>
              {editingField === 'phone' ? (
                <input
                  className="input-z mt-1 text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditingField(null); }}
                />
              ) : (
                <p className="text-xs text-ztext-light mt-0.5">{user?.phone || 'Not set'}</p>
              )}
            </div>
            {editingField === 'phone' ? (
              <div className="flex items-center gap-1 shrink-0">
                {saving ? <Loader2 size={16} className="animate-spin text-ztext-muted" /> : (
                  <>
                    <button onClick={handleSave} className="size-7 grid place-items-center rounded-md hover:bg-zgreen/10 text-zgreen transition-colors"><Check size={15} /></button>
                    <button onClick={() => setEditingField(null)} className="size-7 grid place-items-center rounded-md hover:bg-zred/10 text-zred transition-colors"><X size={15} /></button>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => { setEditingField('phone'); setEditValue(user?.phone || ''); }} className="size-7 grid place-items-center rounded-md hover:bg-zgray text-ztext-muted transition-colors shrink-0">
                <Pencil size={14} />
              </button>
            )}
          </div>

          <div className="p-4 flex items-center gap-3">
            <Mail size={18} className="text-zred shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ztext text-sm">Email</p>
              <p className="text-xs text-ztext-light mt-0.5 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="mt-4 w-full bg-zcard rounded-xl border border-zborder p-4 flex items-center gap-3 hover:bg-red-500/5 transition-colors"
        >
          <LogOut size={18} className="text-zred shrink-0" />
          <span className="font-semibold text-zred text-sm">Sign out</span>
        </button>
      </div>
    </div>
  );
}
