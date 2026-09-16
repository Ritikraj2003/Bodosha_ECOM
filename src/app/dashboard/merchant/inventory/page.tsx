'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, Package, RefreshCw, Save, X } from 'lucide-react';
import { getProducts, updateProductStock } from '@/features/products/actions';
import type { Product } from '@/features/products/types';
import { Skeleton, EmptyState } from '@/components/ui';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadInventory = useCallback(async () => {
    const res = await getProducts({ pageSize: 200 });
    if (res.success && res.data) setProducts(res.data);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await loadInventory();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [loadInventory]);

  const tracked = useMemo(() => products.filter((p) => p.track_inventory && !p.deleted_at), [products]);

  const filtered = useMemo(() => {
    let list = tracked;
    if (filter === 'low') list = list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5);
    if (filter === 'out') list = list.filter((p) => p.stock_quantity <= 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [tracked, filter, search]);

  const handleSaveStock = async (productId: string) => {
    setSaving(true);
    await updateProductStock(productId, editValue);
    setSaving(false);
    setEditing(null);
    loadInventory();
  };

  const lowStockCount = useMemo(() => tracked.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5).length, [tracked]);
  const outOfStockCount = useMemo(() => tracked.filter((p) => p.stock_quantity <= 0).length, [tracked]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">Inventory</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ztext-lighter">{tracked.length} tracked</span>
          {lowStockCount > 0 && <span className="text-amber-400 font-medium">{lowStockCount} low stock</span>}
          {outOfStockCount > 0 && <span className="text-red-400 font-medium">{outOfStockCount} out of stock</span>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zborder text-sm focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
        </div>
        <div className="flex gap-2">
          {(['all', 'low', 'out'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-zred text-white' : 'bg-zcard text-ztext-light border border-zborder hover:bg-zgray'}`}>
              {f === 'all' ? 'All' : f === 'low' ? 'Low stock' : 'Out of stock'}
            </button>
          ))}
        </div>
        <button onClick={loadInventory} aria-label="Refresh inventory" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors"><RefreshCw size={18} /></button>
      </div>

      {loading && tracked.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="No inventory items" description={filter !== 'all' ? 'No items match this filter.' : 'Enable inventory tracking on your products to see them here.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="bg-zcard rounded-xl border border-zborder p-4 flex items-center gap-4 hover:shadow-z transition-shadow">
              <div className="flex-1 min-w-0">
                <h2 className="font-medium text-ztext text-sm">{p.name}</h2>
                <p className="text-xs text-ztext-lighter mt-0.5">₹{p.price} • SKU: {p.slug}</p>
              </div>
              {editing === p.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <input type="number" min={0} value={editValue} onChange={(e) => setEditValue(Number(e.target.value))}
                    className="w-20 px-2.5 py-1.5 rounded-lg border border-zborder text-sm text-center focus:outline-none focus:ring-2 focus:ring-zred/20" />
                  <button onClick={() => handleSaveStock(p.id)} disabled={saving} aria-label={`Save stock for ${p.name}`} className="p-1.5 rounded-lg bg-zred text-white hover:bg-zred-dark transition-colors"><Save size={14} /></button>
                  <button onClick={() => setEditing(null)} aria-label="Cancel edit" className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold ${p.stock_quantity <= 0 ? 'text-red-400' : p.stock_quantity <= 5 ? 'text-amber-400' : 'text-ztext'}`}>
                      {p.stock_quantity}
                    </p>
                    {p.stock_quantity <= 0 && <span className="text-[10px] text-red-400 font-medium">Out of stock</span>}
                    {p.stock_quantity > 0 && p.stock_quantity <= 5 && <span className="text-[10px] text-amber-400 font-medium">Low stock</span>}
                  </div>
                  <button onClick={() => { setEditing(p.id); setEditValue(p.stock_quantity); }} className="px-3 py-1.5 text-xs font-medium text-zred border border-zred rounded-lg hover:bg-red-500/10 transition-colors">
                    Update
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
