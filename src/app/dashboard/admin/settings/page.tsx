'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  CreditCard, Phone, Send, Mail, IndianRupee, SlidersHorizontal, Bike,
  RefreshCw, Loader2, Save, Pencil, Clock, Store, MapPin, Compass,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader, ToastContainer, useToast } from '@/components/ui/data-table';
import { getSystemSettings, updateSystemSetting, getAdminRestaurant, updateAdminRestaurant } from '@/features/admin/actions';
import { authService } from '@/features/auth/services/auth-service';
import type { SystemSetting } from '@/features/admin/types';
import type { Restaurant } from '@/features/restaurants/types';
import DeliverySlotsManagerModal from '@/features/admin/components/DeliverySlotsManagerModal';
import type { DeliverySlot } from '@/features/delivery/types/slots';
import { invalidatePublicSettingsCache } from '@/hooks/usePublicSettings';
import { useAuthStore } from '@/features/auth/store';
import { hasPermission, PERMISSION_CODES } from '@/lib/permissions';

const LABELS: Record<string, string> = {
  payment_method_wallet_enabled: 'Wallet',
  payment_method_razorpay_enabled: 'Razorpay',
  payment_method_upi_enabled: 'UPI',
  payment_method_cod_enabled: 'Cash on Delivery',
  store_upi_id: 'Store Upi Id',
  store_upi_name: 'Store Upi Name',
  maintenance_fee: 'Maintenance fee (₹)',
  packaging_charge: 'Packaging Charge (₹)',
  packaging_charge_enabled: 'Enable Packaging Charge',
  packaging_big_packet_price: 'Big Packet Price (₹)',
  packaging_small_packet_price: 'Small Packet Price (₹)',
  telegram_show_qr: 'Send pickup QR in Telegram',
  telegram_qr_expiry_minutes: 'Telegram QR Expiry Time (minutes)',
  dilip_da_email: "Owner's email (Dilip Da)",
  store_temp_close_until: 'Temporarily close until (HH:MM)',
  delivery_available: 'Delivery Available',
  delivery_unavailable_message: 'Unavailable Custom Message',
  delivery_person_name: 'Delivery Person Name',
  delivery_person_phone: 'Delivery Person Phone',
  delivery_fixed_slots_enabled: 'Enable Fixed Delivery Slots',
  delivery_custom_message: 'Delivery Custom Announcement Message',
  delivery_custom_message_enabled: 'Show Delivery Announcement Message',
};

const inputClass = 'w-full bg-zgray border border-zborder rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred';

export default function AdminSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canEditSettings = hasPermission(user?.permissions, PERMISSION_CODES.SET_GEN_EDIT, user?.role);

  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantForm, setRestaurantForm] = useState<Partial<Restaurant>>({});
  const [originalRestaurantForm, setOriginalRestaurantForm] = useState<Partial<Restaurant>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [isSlotsModalOpen, setIsSlotsModalOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const isRestaurantDirty = useCallback((): boolean => {
    if (!restaurant) return false;
    const keys: (keyof Restaurant)[] = [
      'name', 'slug', 'description', 'cuisine_type', 'phone', 'email',
      'address_line1', 'address_line2', 'city', 'state', 'postal_code',
      'latitude', 'longitude',
      'opening_time', 'closing_time', 'is_open', 'is_active'
    ];
    return keys.some((k) => {
      const cur = restaurantForm[k] ?? '';
      const orig = originalRestaurantForm[k] ?? '';
      return String(cur) !== String(orig);
    });
  }, [restaurant, restaurantForm, originalRestaurantForm]);

  const setRestVal = (key: keyof Restaurant, val: any) => {
    setRestaurantForm((prev) => ({ ...prev, [key]: val }));
  };

  const fetchSettings = useCallback(async () => {
    try {
      const [res, restRes] = await Promise.all([
        getSystemSettings(),
        getAdminRestaurant(),
      ]);
      if (res.success && res.data) {
        const data = res.data as SystemSetting[];
        setSettings(data);
        const values: Record<string, string> = {};
        data.forEach((s) => { values[s.key] = s.value ?? ''; });
        setEditingValues((prev) => (editing ? prev : values));
        setOriginalValues(values);
      }
      if (restRes.success && restRes.data) {
        const rData = restRes.data;
        setRestaurant(rData);
        const formValues: Partial<Restaurant> = {
          name: rData.name || '',
          slug: rData.slug || '',
          description: rData.description || '',
          cuisine_type: rData.cuisine_type || '',
          phone: rData.phone || '',
          email: rData.email || '',
          address_line1: rData.address_line1 || '',
          address_line2: rData.address_line2 || '',
          city: rData.city || '',
          state: rData.state || '',
          postal_code: rData.postal_code || '',
          latitude: rData.latitude !== null && rData.latitude !== undefined ? (rData.latitude as any) : '',
          longitude: rData.longitude !== null && rData.longitude !== undefined ? (rData.longitude as any) : '',
          opening_time: (rData.opening_time || '09:00').slice(0, 5),
          closing_time: (rData.closing_time || '22:00').slice(0, 5),
          is_open: rData.is_open ?? true,
          is_active: rData.is_active ?? true,
        };
        setRestaurantForm((prev) => (editing ? prev : formValues));
        setOriginalRestaurantForm(formValues);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, [editing]);

  useEffect(() => {
     
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = (s: SystemSetting): boolean => {
    const cur = editingValues[s.key] ?? '';
    return cur !== (originalValues[s.key] ?? s.value);
  };

  const handleSave = async () => {
    const session = await authService.getSession();
    if (!session.user) {
      addToast('Session expired — please sign in again', 'error');
      window.location.href = '/auth/login';
      return;
    }
    const dirty = settings.filter(isDirty);
    const restDirty = isRestaurantDirty();

    if (dirty.length === 0 && !restDirty) {
      addToast('No changes to save', 'info');
      return;
    }

    if (restDirty) {
      if (!restaurantForm.name?.trim()) {
        addToast('Store Name is required', 'error');
        return;
      }
      if (!restaurantForm.address_line1?.trim()) {
        addToast('Address Line 1 is required', 'error');
        return;
      }
    }

    for (const s of dirty) {
      if (s.key === 'telegram_qr_expiry_minutes') {
        const num = Number(editingValues[s.key]);
        if (!Number.isFinite(num) || num < 1 || num > 60) {
          addToast('Telegram QR Expiry Time must be between 1 and 60 minutes', 'error');
          return;
        }
      }
      if (s.type === 'json') {
        const val = editingValues[s.key] ?? '';
        if (!val.trim()) {
          addToast(`${s.key.replace(/_/g, ' ')} · empty value not allowed`, 'error');
          return;
        }
        try {
          JSON.parse(val);
        } catch {
          addToast(`${s.key.replace(/_/g, ' ')} · invalid JSON`, 'error');
          return;
        }
      }
    }

    setSaving(true);
    const errors: string[] = [];

    if (restDirty && restaurant?.id) {
      const restRes = await updateAdminRestaurant(restaurant.id, restaurantForm);
      if (!restRes.success) {
        errors.push(restRes.error || 'Failed to update store configuration');
      }
    }

    for (const s of dirty) {
      const res = await updateSystemSetting(s.id, editingValues[s.key] ?? '');
      if (!res.success) errors.push(res.error ?? s.key);
    }
    setSaving(false);
    if (errors.length) {
      addToast(`Saved with errors: ${errors.join('; ')}`, 'error');
      return;
    }
    const totalChanges = dirty.length + (restDirty ? 1 : 0);
    addToast(`Saved ${totalChanges} change${totalChanges > 1 ? 's' : ''}`, 'success');
    setEditing(false);
    invalidatePublicSettingsCache();
    fetchSettings();
  };

  const get = (key: string): SystemSetting | undefined => settings.find((s) => s.key === key);
  const setVal = (key: string, v: string) => setEditingValues((prev) => ({ ...prev, [key]: v }));

  const isEnabled = (key: string) => editingValues[key] === 'true';
  const paymentCredentialKeys = [
    ...(isEnabled('payment_method_razorpay_enabled') ? ['razorpay_key_id', 'razorpay_key_secret'] : []),
    ...(isEnabled('payment_method_upi_enabled') ? ['store_upi_id', 'store_upi_name'] : []),
  ];


  const getParsedSlots = (): DeliverySlot[] => {
    const raw = editingValues['delivery_slots'] ?? '';
    if (!raw) return [];
    try {
      return JSON.parse(raw) as DeliverySlot[];
    } catch {
      return [];
    }
  };

  const handleSaveSlots = (updated: DeliverySlot[]) => {
    const jsonStr = JSON.stringify(updated);
    setVal('delivery_slots', jsonStr);
  };

  const renderField = (settingKey: string) => {
    const setting = get(settingKey);
    const label = LABELS[settingKey] ?? (setting ? setting.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : settingKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    const val = editingValues[settingKey] ?? setting?.value ?? '';
    const disabled = saving || !editing;

    const isBoolean = setting ? setting.type === 'boolean' : (settingKey.endsWith('_enabled') || settingKey === 'delivery_available');
    const isNumber = setting ? setting.type === 'number' : (
      settingKey === 'maintenance_fee' || settingKey === 'delivery_fee' ||
      settingKey === 'telegram_qr_expiry_minutes' || settingKey.endsWith('_price') ||
      settingKey.endsWith('_charge') || settingKey.endsWith('_limit') || settingKey.endsWith('_port')
    );
    const isTextarea = settingKey === 'store_address' || settingKey === 'store_delivery_locations' ||
      settingKey === 'delivery_person_emails' || settingKey === 'admin_emails' ||
      settingKey === 'dilip_da_email' || settingKey === 'delivery_unavailable_message' ||
      settingKey === 'delivery_custom_message';
    const isTime = settingKey === 'store_temp_close_until';

    return (
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <label className="block text-sm font-semibold text-ztext">
              {label}
            </label>
            {setting?.description && <span className="text-xs text-ztext-lighter">{setting.description}</span>}
          </div>

          <div className="w-full sm:w-64 flex items-center justify-end shrink-0">
            {isBoolean ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ztext-lighter w-8">{val === 'true' ? 'On' : 'Off'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={val === 'true'}
                  disabled={disabled}
                  onClick={() => {
                    const newVal = val === 'true' ? 'false' : 'true';
                    setVal(settingKey, newVal);
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${val === 'true' ? 'bg-zred' : 'bg-zsurface'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${val === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ) : isNumber ? (
              <input
                type="number"
                value={val}
                min={settingKey === 'telegram_qr_expiry_minutes' ? 1 : undefined}
                max={settingKey === 'telegram_qr_expiry_minutes' ? 60 : undefined}
                disabled={disabled}
                placeholder="0"
                onChange={(e) => setVal(settingKey, e.target.value)}
                className={`${inputClass} text-right`}
              />
            ) : isTextarea ? (
              <textarea
                rows={2}
                value={val}
                disabled={disabled}
                placeholder="—"
                onChange={(e) => setVal(settingKey, e.target.value)}
                className={`${inputClass} resize-none`}
              />
            ) : isTime ? (
              <input
                type="time"
                value={val}
                disabled={disabled}
                placeholder="Leave empty to disable"
                onChange={(e) => setVal(settingKey, e.target.value)}
                className={inputClass}
              />
            ) : (
              <input
                type="text"
                value={val}
                disabled={disabled}
                placeholder="—"
                onChange={(e) => setVal(settingKey, e.target.value)}
                className={inputClass}
              />
            )}
          </div>
        </div>

        {/* Extra configurator button for Delivery Slots */}
        {settingKey === 'delivery_fixed_slots_enabled' && (
          <div className="pt-1 flex items-center justify-between bg-zgray/50 border border-zborder p-3 rounded-xl">
            <div className="text-xs">
              <span className="font-bold text-ztext">Configured Slots:</span>{' '}
              <span className="text-ztext-light font-medium">{getParsedSlots().length} slot(s)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSlotsModalOpen(true)}
              className="button-z button-z-ghost text-xs px-3 py-1.5 font-bold flex items-center gap-1.5 border border-zborder"
            >
              <Clock size={14} className="text-zred" /> Configure Delivery Slots
            </button>
          </div>
        )}
      </div>
    );
  };

  const sectionToggle = (key: string, on: boolean) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={saving || !editing}
      onClick={() => {
        const newVal = on ? 'false' : 'true';
        setVal(key, newVal);
      }}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'bg-zred' : 'bg-zsurface'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  const renderCard = ({ icon: Icon, title, subtitle, keys, toggleKey }: { icon: LucideIcon; title: string; subtitle: string; keys: string[]; toggleKey?: string }) => {
    const enabled = toggleKey ? (editingValues[toggleKey] ?? 'true') !== 'false' : true;

    if (toggleKey && !enabled) {
      return (
        <div className="bg-zcard/60 rounded-2xl border border-zborder/60 px-4 py-3">
          <div className="flex items-center gap-3">
            {sectionToggle(toggleKey, false)}
            <p className="text-sm font-semibold text-ztext-lighter">{title}</p>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-ztext-lighter">Hidden</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-zcard rounded-2xl p-6 border border-zborder shadow-sm">
        <div className="flex items-center gap-3 pb-4 border-b border-zborder mb-5">
          {toggleKey && sectionToggle(toggleKey, true)}
          <div className="p-2.5 bg-zsurface rounded-xl text-ztext-lighter">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ztext">{title}</h2>
            <p className="text-xs text-ztext-lighter">{subtitle}</p>
          </div>
        </div>
        <div className="space-y-4">
          {keys.map((k) => <Fragment key={k}>{renderField(k)}</Fragment>)}
        </div>
      </div>
    );
  };

  const dirtySettingsCount = settings.filter(isDirty).length;
  const restDirty = isRestaurantDirty();
  const dirtyCount = dirtySettingsCount + (restDirty ? 1 : 0);

  return (
    <div>
      <PageHeader title="General Settings" description="Payment methods, credentials, telegram, owner links and SMTP">
        {canEditSettings && (
          editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="button-z button-z-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {dirtyCount > 0 ? `Save Changes (${dirtyCount})` : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setRestaurantForm(originalRestaurantForm);
                  fetchSettings();
                }}
                disabled={saving}
                className="button-z button-z-ghost flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="button-z button-z-primary flex items-center gap-2 text-sm px-4 py-2"
            >
              <Pencil size={16} />
              Edit Settings
            </button>
          )
        )}
        <button onClick={() => { setLoading(true); fetchSettings(); }} aria-label="Refresh settings" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          {loading ? <Loader2 size={18} className="animate-spin text-zred" /> : <RefreshCw size={18} />}
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store Configuration Card (Directly reads/writes public.restaurants table) */}
        <div className="bg-zcard rounded-2xl p-6 border border-zborder shadow-sm lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zborder mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 text-zred rounded-xl">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-ztext">Store Configuration</h2>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zgray text-ztext-lighter border border-zborder font-mono">
                    public.restaurants
                  </span>
                  {restaurant && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      restaurantForm.is_open ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${restaurantForm.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {restaurantForm.is_open ? 'Store Open' : 'Store Closed'}
                    </span>
                  )}
                  {restaurant && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      restaurantForm.is_active ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                    }`}>
                      {restaurantForm.is_active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ztext-lighter mt-0.5">
                  Update store identity, contact info, operating hours, and physical address in the restaurant database table
                </p>
              </div>
            </div>

            {/* Quick Status Toggles in Header */}
            <div className="flex items-center gap-4 bg-zsurface/50 border border-zborder/80 px-3.5 py-2 rounded-xl shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ztext-lighter">Store Open:</span>
                <span className="text-xs font-semibold text-ztext">{restaurantForm.is_open ? 'Open' : 'Closed'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restaurantForm.is_open}
                  disabled={saving || !editing}
                  onClick={() => setRestVal('is_open', !restaurantForm.is_open)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${restaurantForm.is_open ? 'bg-emerald-500' : 'bg-zsurface'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${restaurantForm.is_open ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="w-[1px] h-4 bg-zborder" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ztext-lighter">Directory Active:</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restaurantForm.is_active}
                  disabled={saving || !editing}
                  onClick={() => setRestVal('is_active', !restaurantForm.is_active)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${restaurantForm.is_active ? 'bg-zred' : 'bg-zsurface'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${restaurantForm.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Identity & Basic Info */}
            <div>
              <h3 className="text-xs font-semibold text-ztext-lighter uppercase tracking-wider mb-3">Identity & Branding</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Store Name <span className="text-zred">*</span>
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.name ?? ''}
                    disabled={saving || !editing}
                    placeholder="e.g. Dilip Da Main Store"
                    onChange={(e) => setRestVal('name', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Store Slug / URL Key <span className="text-zred">*</span>
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.slug ?? ''}
                    disabled={saving || !editing}
                    placeholder="e.g. dilip-da-main"
                    onChange={(e) => setRestVal('slug', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Cuisine Type
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.cuisine_type ?? ''}
                    disabled={saving || !editing}
                    placeholder="e.g. Fast Food, Snacks, Rice Bowls"
                    onChange={(e) => setRestVal('cuisine_type', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Store Description
                  </label>
                  <textarea
                    rows={2}
                    value={restaurantForm.description ?? ''}
                    disabled={saving || !editing}
                    placeholder="Original Dilip Da Store at CIT Kokrajhar Campus"
                    onChange={(e) => setRestVal('description', e.target.value)}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>
            </div>

            {/* Contact & Operating Hours */}
            <div className="pt-4 border-t border-zborder/60">
              <h3 className="text-xs font-semibold text-ztext-lighter uppercase tracking-wider mb-3">Contact Details & Operating Hours</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Store Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={restaurantForm.phone ?? ''}
                    disabled={saving || !editing}
                    placeholder="+91 9876543210"
                    onChange={(e) => setRestVal('phone', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Store Contact Email
                  </label>
                  <input
                    type="email"
                    value={restaurantForm.email ?? ''}
                    disabled={saving || !editing}
                    placeholder="admin@dilipda.com"
                    onChange={(e) => setRestVal('email', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Opening Time (Daily)
                  </label>
                  <input
                    type="time"
                    value={restaurantForm.opening_time ?? '09:00'}
                    disabled={saving || !editing}
                    onChange={(e) => setRestVal('opening_time', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Closing Time (Daily)
                  </label>
                  <input
                    type="time"
                    value={restaurantForm.closing_time ?? '22:00'}
                    disabled={saving || !editing}
                    onChange={(e) => setRestVal('closing_time', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Physical Address */}
            <div className="pt-4 border-t border-zborder/60">
              <div className="flex items-center gap-1.5 mb-3">
                <MapPin className="w-3.5 h-3.5 text-zred" />
                <h3 className="text-xs font-semibold text-ztext-lighter uppercase tracking-wider">Physical Address & Location</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Address Line 1 <span className="text-zred">*</span>
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.address_line1 ?? ''}
                    disabled={saving || !editing}
                    placeholder="Near CIT Kokrajhar Campus"
                    onChange={(e) => setRestVal('address_line1', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Address Line 2 (Optional)
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.address_line2 ?? ''}
                    disabled={saving || !editing}
                    placeholder="Stall #4 / Ground Floor"
                    onChange={(e) => setRestVal('address_line2', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.city ?? ''}
                    disabled={saving || !editing}
                    placeholder="Kokrajhar"
                    onChange={(e) => setRestVal('city', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.state ?? ''}
                    disabled={saving || !editing}
                    placeholder="Assam"
                    onChange={(e) => setRestVal('state', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Postal / PIN Code
                  </label>
                  <input
                    type="text"
                    value={restaurantForm.postal_code ?? ''}
                    disabled={saving || !editing}
                    placeholder="783370"
                    onChange={(e) => setRestVal('postal_code', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* GPS Coordinates */}
            <div className="pt-4 border-t border-zborder/60">
              <div className="flex items-center gap-1.5 mb-3">
                <Compass className="w-3.5 h-3.5 text-zred" />
                <h3 className="text-xs font-semibold text-ztext-lighter uppercase tracking-wider">GPS Coordinates</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={restaurantForm.latitude ?? ''}
                    disabled={saving || !editing}
                    placeholder="e.g. 26.5025000"
                    onChange={(e) => setRestVal('latitude', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-ztext-lighter mt-1">Decimal coordinate (e.g. 26.5025)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ztext mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={restaurantForm.longitude ?? ''}
                    disabled={saving || !editing}
                    placeholder="e.g. 90.2718000"
                    onChange={(e) => setRestVal('longitude', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-ztext-lighter mt-1">Decimal coordinate (e.g. 90.2718)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {renderCard({
          icon: CreditCard,
          title: 'Payment Methods',
          subtitle: 'Choose which methods customers can use at checkout. A method is shown only when enabled and configured.',
          keys: [
            'payment_method_wallet_enabled',
            'payment_method_razorpay_enabled',
            'payment_method_upi_enabled',
            'payment_method_cod_enabled',
          ],
        })}

        {renderCard({
          icon: CreditCard,
          title: 'Payments',
          subtitle: 'Credentials for the enabled methods.',
          keys: paymentCredentialKeys,
        })}

        {renderCard({
          icon: Phone,
          title: 'Contact',
          subtitle: 'Links and details shown across the store (footer, contact, checkout).',
          toggleKey: 'contact_enabled',
          keys: [
            'store_support_phone', 'store_support_email', 'notification_email', 'store_address',
            'store_whatsapp', 'store_instagram', 'store_facebook', 'store_website',
          ],
        })}

        {renderCard({
          icon: Bike,
          title: 'Delivery Settings & Fixed Slots',
          subtitle: 'Configure delivery availability, fixed delivery slot timings, delivery person details and customer announcements.',
          keys: [
            'delivery_available',
            'delivery_unavailable_message',
            'delivery_person_name',
            'delivery_person_phone',
            'delivery_fixed_slots_enabled',
            'delivery_custom_message_enabled',
            'delivery_custom_message',
          ],
        })}

        {renderCard({
          icon: Send,
          title: 'Telegram',
          subtitle: 'Order notifications delivered to the owner chat.',
          toggleKey: 'telegram_enabled',
          keys: ['telegram_bot_token', 'telegram_chat_id', 'telegram_show_qr', 'telegram_qr_expiry_minutes'],
        })}

        {renderCard({
          icon: Mail,
          title: 'SMTP / Email',
          subtitle: 'Used for OTP and order emails.',
          toggleKey: 'smtp_enabled',
          keys: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'],
        })}

        {renderCard({
          icon: IndianRupee,
          title: 'Pricing',
          subtitle: 'Applied to cart at checkout, packaging charges and wallet overdraft.',
          toggleKey: 'pricing_enabled',
          keys: [
            'delivery_fee',
            'maintenance_fee',
            'wallet_credit_limit',
            'packaging_big_packet_price',
            'packaging_small_packet_price',
          ],
        })}

        {renderCard({
          icon: SlidersHorizontal,
          title: 'Other',
          subtitle: 'Storefront hours, delivery areas and platform rules.',
          toggleKey: 'other_enabled',
          keys: [
            'store_hours_open', 'store_hours_close',
            'store_temp_close_until',
            'store_order_cutoff_lunch', 'store_order_cutoff_dinner',
            'store_delivery_locations',
            'cancellation_window_minutes', 'maintenance_mode',
          ],
        })}
      </div>

      <DeliverySlotsManagerModal
        isOpen={isSlotsModalOpen}
        onClose={() => setIsSlotsModalOpen(false)}
        slots={getParsedSlots()}
        onSaveSlots={handleSaveSlots}
        disabled={saving || !editing}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
