'use client';

import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { getRestaurantSettings, updateRestaurantSettings, getMerchantRestaurant } from '@/features/restaurants/actions';
import { Skeleton } from '@/components/ui';

export default function SettingsPage() {
  const [restaurant, setRestaurant] = useState<{ name: string; is_open: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    prep_time_minutes: 15,
    max_orders_slot: 20,
    allow_preorder: false,
    allow_scheduled: false,
    commission_rate: 0,
    gst_number: '',
    fssai_license: '',
    upi_id: '',
  });

  const fetchSettings = async () => {
    setLoading(true);
    const [sRes, rRes] = await Promise.all([getRestaurantSettings(), getMerchantRestaurant()]);
    if (sRes.success && sRes.data) {
      const s = sRes.data;
      setForm({
        prep_time_minutes: s.prep_time_minutes,
        max_orders_slot: s.max_orders_slot,
        allow_preorder: s.allow_preorder,
        allow_scheduled: s.allow_scheduled,
        commission_rate: s.commission_rate,
        gst_number: s.gst_number ?? '',
        fssai_license: s.fssai_license ?? '',
        upi_id: s.upi_id ?? '',
      });
    }
    if (rRes.success && rRes.data) setRestaurant(rRes.data);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [sRes, rRes] = await Promise.all([getRestaurantSettings(), getMerchantRestaurant()]);
      if (!mounted) return;
      if (sRes.success && sRes.data) {
        const s = sRes.data;
        setForm({
          prep_time_minutes: s.prep_time_minutes,
          max_orders_slot: s.max_orders_slot,
          allow_preorder: s.allow_preorder,
          allow_scheduled: s.allow_scheduled,
          commission_rate: s.commission_rate,
          gst_number: s.gst_number ?? '',
          fssai_license: s.fssai_license ?? '',
          upi_id: s.upi_id ?? '',
        });
      }
      if (rRes.success && rRes.data) setRestaurant(rRes.data);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await updateRestaurantSettings({
      prep_time_minutes: form.prep_time_minutes,
      max_orders_slot: form.max_orders_slot,
      allow_preorder: form.allow_preorder,
      allow_scheduled: form.allow_scheduled,
      gst_number: form.gst_number || null,
      fssai_license: form.fssai_license || null,
      upi_id: form.upi_id || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ztext">Settings</h1>
          {restaurant && <p className="text-sm text-ztext-lighter mt-0.5">{restaurant.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSettings} aria-label="Refresh settings" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors"><RefreshCw size={18} /></button>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-zcard rounded-xl border border-zborder p-6">
          <h2 className="text-sm font-semibold text-ztext mb-4">Restaurant Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ztext-lighter">Prep time (minutes)</label>
              <input type="number" min={0} value={form.prep_time_minutes} onChange={(e) => update('prep_time_minutes', Number(e.target.value))} className="input-z mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ztext-lighter">Max orders per slot</label>
              <input type="number" min={1} value={form.max_orders_slot} onChange={(e) => update('max_orders_slot', Number(e.target.value))} className="input-z mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ztext-lighter">GST Number</label>
              <input value={form.gst_number} onChange={(e) => update('gst_number', e.target.value)} className="input-z mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ztext-lighter">FSSAI License</label>
              <input value={form.fssai_license} onChange={(e) => update('fssai_license', e.target.value)} className="input-z mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ztext-lighter">UPI ID</label>
              <input value={form.upi_id} onChange={(e) => update('upi_id', e.target.value)} className="input-z mt-1" placeholder="dilipda@upi" />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
              <input type="checkbox" checked={form.allow_preorder} onChange={(e) => update('allow_preorder', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
              Allow pre-orders
            </label>
            <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
              <input type="checkbox" checked={form.allow_scheduled} onChange={(e) => update('allow_scheduled', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
              Allow scheduled orders
            </label>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50">
              <Save size={16} /> {saving ? 'Saving...' : 'Save settings'}
            </button>
            {saved && <span className="text-xs text-green-400 font-medium">Saved!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
