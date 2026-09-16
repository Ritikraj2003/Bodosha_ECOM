'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  CreditCard, Phone, Send, Mail, IndianRupee, SlidersHorizontal, Bike,
  RefreshCw, Loader2, Save, Pencil, ShieldCheck, UserCog, Clock, Package,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader, ToastContainer, useToast, LoadingSkeleton } from '@/components/ui/data-table';
import { getSystemSettings, updateSystemSetting } from '@/features/admin/actions';
import { authService } from '@/features/auth/services/auth-service';
import type { SystemSetting } from '@/features/admin/types';
import DeliverySlotsManagerModal from '@/features/admin/components/DeliverySlotsManagerModal';
import type { DeliverySlot } from '@/features/delivery/types/slots';

const LABELS: Record<string, string> = {
  payment_method_wallet_enabled: 'Wallet',
  payment_method_razorpay_enabled: 'Razorpay',
  payment_method_phonepe_enabled: 'PhonePe',
  payment_method_gpay_enabled: 'Google Pay',
  payment_method_cod_enabled: 'Cash on Delivery',
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
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [isSlotsModalOpen, setIsSlotsModalOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const fetchSettings = useCallback(async () => {
    const res = await getSystemSettings();
    if (res.success && res.data) {
      const data = res.data as SystemSetting[];
      setSettings(data);
      const values: Record<string, string> = {};
      data.forEach((s) => { values[s.key] = s.value ?? ''; });
      setEditingValues(values);
      setOriginalValues({ ...values });
    }
    setLoading(false);
  }, []);

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
    if (dirty.length === 0) {
      addToast('No changes to save', 'info');
      return;
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
    for (const s of dirty) {
      const res = await updateSystemSetting(s.id, editingValues[s.key] ?? '');
      if (!res.success) errors.push(res.error ?? s.key);
    }
    setSaving(false);
    if (errors.length) {
      addToast(`Saved ${dirty.length - errors.length}/${dirty.length} · ${errors.join('; ')}`, 'error');
      return;
    }
    addToast(`Saved ${dirty.length} change${dirty.length > 1 ? 's' : ''}`, 'success');
    setEditing(false);
    fetchSettings();
  };

  const get = (key: string): SystemSetting | undefined => settings.find((s) => s.key === key);
  const setVal = (key: string, v: string) => setEditingValues((prev) => ({ ...prev, [key]: v }));

  const isEnabled = (key: string) => editingValues[key] === 'true';
  const paymentCredentialKeys = [
    ...(isEnabled('payment_method_razorpay_enabled') ? ['razorpay_key_id', 'razorpay_key_secret'] : []),
    ...(isEnabled('payment_method_phonepe_enabled') ? ['phonepe_merchant_id', 'phonepe_salt_key', 'phonepe_salt_index'] : []),
    ...(isEnabled('payment_method_gpay_enabled') ? ['gpay_upi_id', 'gpay_upi_name'] : []),
    'store_upi_id', 'store_upi_name',
  ];

  if (loading) {
    return (
      <div>
        <div className="h-8 w-48 bg-zgray rounded-lg animate-pulse mb-6" />
        <LoadingSkeleton rows={6} cols={2} />
      </div>
    );
  }

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
    if (!setting) return null;
    const label = LABELS[setting.key] ?? setting.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const val = editingValues[setting.key] ?? '';
    const disabled = saving || !editing;

    return (
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <label className="block text-sm font-semibold text-ztext">
              {label}
            </label>
            {setting.description && <span className="text-xs text-ztext-lighter">{setting.description}</span>}
          </div>

          <div className="w-full sm:w-64 flex items-center justify-end shrink-0">
            {setting.type === 'boolean' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ztext-lighter w-8">{val === 'true' ? 'On' : 'Off'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={val === 'true'}
                  disabled={disabled}
                  onClick={() => {
                    const newVal = val === 'true' ? 'false' : 'true';
                    setVal(setting.key, newVal);
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${val === 'true' ? 'bg-zred' : 'bg-zsurface'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${val === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ) : setting.type === 'number' ? (
              <input
                type="number"
                value={val}
                min={setting.key === 'telegram_qr_expiry_minutes' ? 1 : undefined}
                max={setting.key === 'telegram_qr_expiry_minutes' ? 60 : undefined}
                disabled={disabled}
                onChange={(e) => setVal(setting.key, e.target.value)}
                className={`${inputClass} text-right`}
              />
            ) : setting.key === 'store_address' || setting.key === 'store_delivery_locations' || setting.key === 'delivery_person_emails' || setting.key === 'admin_emails' || setting.key === 'dilip_da_email' || setting.key === 'delivery_unavailable_message' || setting.key === 'delivery_custom_message' ? (
              <textarea
                rows={2}
                value={val}
                disabled={disabled}
                onChange={(e) => setVal(setting.key, e.target.value)}
                className={`${inputClass} resize-none`}
              />
            ) : setting.key === 'store_temp_close_until' ? (
              <input
                type="time"
                value={val}
                disabled={disabled}
                placeholder="Leave empty to disable"
                onChange={(e) => setVal(setting.key, e.target.value)}
                className={inputClass}
              />
            ) : (
              <input
                type="text"
                value={val}
                disabled={disabled}
                onChange={(e) => setVal(setting.key, e.target.value)}
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

  const dirtyCount = settings.filter(isDirty).length;

  return (
    <div>
      <PageHeader title="General Settings" description="Payment methods, credentials, telegram, owner links and SMTP">
        {editing ? (
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
              onClick={() => { setEditing(false); fetchSettings(); }}
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
        )}
        <button onClick={() => { setLoading(true); fetchSettings(); }} aria-label="Refresh settings" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderCard({
          icon: CreditCard,
          title: 'Payment Methods',
          subtitle: 'Choose which methods customers can use at checkout. A method is shown only when enabled and configured.',
          keys: [
            'payment_method_wallet_enabled',
            'payment_method_razorpay_enabled',
            'payment_method_phonepe_enabled',
            'payment_method_gpay_enabled',
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
          icon: Bike,
          title: 'Delivery Personnel Emails',
          subtitle: 'Emails allowed to sign up as delivery partners. Separate multiple emails with commas or new lines.',
          keys: ['delivery_person_emails'],
        })}

        {renderCard({
          icon: ShieldCheck,
          title: 'Administrators',
          subtitle: 'Emails allowed to sign up as store administrators. Separate multiple emails with commas or new lines.',
          keys: ['admin_emails'],
        })}

        {renderCard({
          icon: UserCog,
          title: 'Store Owner',
          subtitle: 'Email(s) of the store owner (Dilip Da). Separate multiple emails with commas or new lines. Gets a read-only view of the dashboard.',
          keys: ['dilip_da_email'],
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
          subtitle: 'Applied to cart at checkout and wallet overdraft.',
          toggleKey: 'pricing_enabled',
          keys: ['delivery_fee', 'maintenance_fee', 'wallet_credit_limit'],
        })}

        {renderCard({
          icon: Package,
          title: 'Packaging Charges',
          subtitle: 'Configure the cost per big and small packaging unit used per product.',
          toggleKey: 'packaging_charge_enabled',
          keys: ['packaging_big_packet_price', 'packaging_small_packet_price'],
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
