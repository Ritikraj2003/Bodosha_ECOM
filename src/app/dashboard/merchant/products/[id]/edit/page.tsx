'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { getProduct, updateProduct, getCategories } from '@/features/products/actions';
import type { Category } from '@/features/products/types';

const units = [
  { value: 'piece', label: 'Piece' },
  { value: 'plate', label: 'Plate' },
  { value: 'bowl', label: 'Bowl' },
  { value: 'kg', label: 'Kg' },
  { value: 'g', label: 'Gram' },
  { value: 'ml', label: 'Ml' },
  { value: 'l', label: 'Litre' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'box', label: 'Box' },
];

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{
    name: string; description: string; full_description: string;
    servings: string; pieces: string; portion_size: string;
    included_items: string; ingredients: string; allergens: string; delivery_time: string;
    price: number; compare_at_price: number; cost_per_unit: number;
    unit: 'piece' | 'plate' | 'kg' | 'g' | 'ml' | 'l' | 'dozen' | 'box';
    category_id: string; is_vegetarian: boolean; is_vegan: boolean;
    is_gluten_free: boolean; spice_level: number; preparation_time: number;
    stock_quantity: number; track_inventory: boolean;
    packaging_big_qty: number; packaging_small_qty: number;
    image: string; tags: string;
  }>({
    name: '', description: '', full_description: '',
    servings: '', pieces: '', portion_size: '',
    included_items: '', ingredients: '', allergens: '', delivery_time: '20–30 min',
    price: 0, compare_at_price: 0, cost_per_unit: 0,
    unit: 'piece', category_id: '', is_vegetarian: false, is_vegan: false,
    is_gluten_free: false, spice_level: 0, preparation_time: 10,
    stock_quantity: 0, track_inventory: false,
    packaging_big_qty: 0, packaging_small_qty: 0,
    image: '', tags: '',
  });

  useEffect(() => {
    Promise.all([getProduct(productId), getCategories()]).then(([pRes, cRes]) => {
      if (pRes.success && pRes.data) {
        const p = pRes.data;
        setForm({
          name: p.name,
          description: p.description ?? '',
          full_description: p.full_description ?? '',
          servings: p.servings ?? '',
          pieces: p.pieces ?? '',
          portion_size: p.portion_size ?? '',
          included_items: p.included_items ? p.included_items.join('\n') : '',
          ingredients: p.ingredients ? p.ingredients.join(', ') : '',
          allergens: p.allergens ? p.allergens.join(', ') : '',
          delivery_time: p.delivery_time ?? '20–30 min',
          price: p.price,
          compare_at_price: p.compare_at_price ?? 0,
          cost_per_unit: p.cost_per_unit ?? 0,
          unit: p.unit,
          category_id: p.category_id ?? '',
          is_vegetarian: p.is_vegetarian,
          is_vegan: p.is_vegan,
          is_gluten_free: p.is_gluten_free,
          spice_level: p.spice_level,
          preparation_time: p.preparation_time,
          stock_quantity: p.stock_quantity,
          track_inventory: p.track_inventory,
          packaging_big_qty: p.packaging_big_qty ?? 0,
          packaging_small_qty: p.packaging_small_qty ?? 0,
          image: p.image ?? '',
          tags: (p.tags ?? []).join(', '),
        });
      } else { setError('Product not found'); }
      if (cRes.success && cRes.data) setCategories(cRes.data);
      setLoading(false);
    });
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (form.price <= 0) { setError('Price must be greater than 0'); return; }
    setSaving(true);
    const res = await updateProduct(productId, {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      full_description: form.full_description.trim() || undefined,
      servings: form.servings.trim() || undefined,
      pieces: form.pieces.trim() || undefined,
      portion_size: form.portion_size.trim() || undefined,
      delivery_time: form.delivery_time.trim() || undefined,
      included_items: form.included_items ? form.included_items.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : undefined,
      ingredients: form.ingredients ? form.ingredients.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      allergens: form.allergens ? form.allergens.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      price: form.price,
      compare_at_price: form.compare_at_price || undefined,
      cost_per_unit: form.cost_per_unit || undefined,
      unit: form.unit,
      category_id: form.category_id || undefined,
      is_vegetarian: form.is_vegetarian,
      is_vegan: form.is_vegan,
      is_gluten_free: form.is_gluten_free,
      spice_level: form.spice_level,
      preparation_time: form.preparation_time || 10,
      image: form.image || undefined,
      stock_quantity: form.stock_quantity,
      track_inventory: form.track_inventory,
      packaging_big_qty: form.packaging_big_qty || 0,
      packaging_small_qty: form.packaging_small_qty || 0,
      tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
    });
    setSaving(false);
    if (res.success) { router.push('/dashboard/merchant/products'); }
    else { setError(res.error ?? 'Failed to update product'); }
  };

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-zsurface rounded w-48" /><div className="h-96 bg-zsurface rounded-xl" /></div>;

  return (
    <div>
      <Link href="/dashboard/merchant/products" className="inline-flex items-center gap-1 text-sm text-ztext-lighter hover:text-ztext-light mb-4">
        <ArrowLeft size={14} /> Back to products
      </Link>
      <h1 className="text-xl sm:text-2xl font-bold text-ztext mb-6">Edit product</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl bg-zcard rounded-xl border border-zborder p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ztext-lighter">Name *</label>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} className="input-z mt-1" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ztext-lighter">Short Description</label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className="input-z mt-1 h-16 resize-none" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ztext-lighter">Full Detailed Description (for Food Details View)</label>
            <textarea value={form.full_description} onChange={(e) => update('full_description', e.target.value)} className="input-z mt-1 h-20 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Price (₹) *</label>
            <input type="number" min={0} step={1} value={form.price} onChange={(e) => update('price', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Compare at price (₹)</label>
            <input type="number" min={0} value={form.compare_at_price} onChange={(e) => update('compare_at_price', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Servings</label>
            <input value={form.servings} onChange={(e) => update('servings', e.target.value)} className="input-z mt-1" placeholder="e.g. 1 person" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Pieces / Quantity</label>
            <input value={form.pieces} onChange={(e) => update('pieces', e.target.value)} className="input-z mt-1" placeholder="e.g. 5 pieces" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Portion Size</label>
            <input value={form.portion_size} onChange={(e) => update('portion_size', e.target.value)} className="input-z mt-1" placeholder="e.g. 1 plate (approx 450g)" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Est. Delivery Time</label>
            <input value={form.delivery_time} onChange={(e) => update('delivery_time', e.target.value)} className="input-z mt-1" placeholder="e.g. 20–30 min" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ztext-lighter">What&apos;s Included (one per line or comma-separated)</label>
            <textarea value={form.included_items} onChange={(e) => update('included_items', e.target.value)} className="input-z mt-1 h-20 resize-none font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Ingredients (comma-separated)</label>
            <input value={form.ingredients} onChange={(e) => update('ingredients', e.target.value)} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Allergens (comma-separated or None)</label>
            <input value={form.allergens} onChange={(e) => update('allergens', e.target.value)} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Unit</label>
            <select value={form.unit} onChange={(e) => update('unit', e.target.value)} className="input-z mt-1">
              {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Category</label>
            <select value={form.category_id} onChange={(e) => update('category_id', e.target.value)} className="input-z mt-1">
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Prep time (min)</label>
            <input type="number" min={0} value={form.preparation_time} onChange={(e) => update('preparation_time', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Big packets required</label>
            <input type="number" min={0} step={1} value={form.packaging_big_qty} onChange={(e) => update('packaging_big_qty', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Small packets required</label>
            <input type="number" min={0} step={1} value={form.packaging_small_qty} onChange={(e) => update('packaging_small_qty', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Spice level (0-5)</label>
            <input type="range" min={0} max={5} value={form.spice_level} onChange={(e) => update('spice_level', Number(e.target.value))} className="w-full mt-2" />
            <span className="text-xs text-ztext-muted">{form.spice_level}/5</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
            <input type="checkbox" checked={form.is_vegetarian} onChange={(e) => update('is_vegetarian', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
            Vegetarian
          </label>
          <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
            <input type="checkbox" checked={form.is_vegan} onChange={(e) => update('is_vegan', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
            Vegan
          </label>
          <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
            <input type="checkbox" checked={form.is_gluten_free} onChange={(e) => update('is_gluten_free', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
            Gluten free
          </label>
        </div>

        <div>
          <label className="text-xs font-medium text-ztext-lighter">Image URL</label>
          <input value={form.image} onChange={(e) => update('image', e.target.value)} className="input-z mt-1" placeholder="https://..." />
        </div>

        <div>
          <label className="text-xs font-medium text-ztext-lighter">Tags (comma separated)</label>
          <input value={form.tags} onChange={(e) => update('tags', e.target.value)} className="input-z mt-1" placeholder="bestseller, spicy" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-ztext-lighter">Stock quantity</label>
            <input type="number" min={0} value={form.stock_quantity} onChange={(e) => update('stock_quantity', Number(e.target.value))} className="input-z mt-1" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-ztext-light cursor-pointer">
              <input type="checkbox" checked={form.track_inventory} onChange={(e) => update('track_inventory', e.target.checked)} className="rounded border-gray-300 text-zred focus:ring-zred/30" />
              Track inventory
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving...' : 'Save changes'}
          </button>
          <Link href="/dashboard/merchant/products" className="inline-flex items-center px-5 py-2.5 bg-zcard text-ztext-light border border-zborder text-sm font-medium rounded-xl hover:bg-zgray transition-colors">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
