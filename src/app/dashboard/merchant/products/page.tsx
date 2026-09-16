'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, UtensilsCrossed, Edit3, Archive, Eye } from 'lucide-react';
import { getProducts, archiveProduct, restoreProduct, getCategories } from '@/features/products/actions';
import type { Product, Category } from '@/features/products/types';
import { Skeleton, EmptyState } from '@/components/ui';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadProducts = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([getProducts({ pageSize: 200 }), getCategories()]);
    if (pRes.success && pRes.data) setProducts(pRes.data);
    if (cRes.success && cRes.data) setCategories(cRes.data);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await loadProducts();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [loadProducts]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => !p.deleted_at);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q)));
    }
    if (categoryFilter !== 'all') list = list.filter((p) => p.category_id === categoryFilter);
    return list;
  }, [products, search, categoryFilter]);

  const handleToggleActive = async (product: Product) => {
    if (product.is_active) await archiveProduct(product.id);
    else await restoreProduct(product.id);
    loadProducts();
  };

  if (loading && products.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 mb-3" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">Products</h1>
        <Link href="/dashboard/merchant/products/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors">
          <Plus size={16} /> Add product
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zborder text-sm focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-zborder text-sm focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No products found" description={search ? 'Try a different search.' : 'Add your first product to get started.'}
          action={!search ? <Link href="/dashboard/merchant/products/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-zred text-white text-sm font-medium rounded-xl hover:bg-zred-dark transition-colors"><Plus size={16} /> Add product</Link> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="bg-zcard rounded-xl border border-zborder p-4 flex items-center gap-4 hover:shadow-z transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-zgray overflow-hidden shrink-0 relative">
                {p.image ? (
                  <Image src={p.image} alt={p.name} fill sizes="48px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ztext-muted"><UtensilsCrossed size={18} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium text-ztext text-sm truncate">{p.name}</h2>
                  {!p.is_active && <span className="text-[10px] text-ztext-muted bg-zgray px-1.5 py-0.5 rounded">Archived</span>}
                  {p.is_vegetarian && <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Veg</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-ztext-lighter">
                  <span className="font-medium text-ztext">₹{p.price}</span>
                  {p.track_inventory && <span className={p.stock_quantity <= 5 ? 'text-red-400 font-medium' : ''}>Stock: {p.stock_quantity}</span>}
                  {p.category_id && <span>{categories.find((c) => c.id === p.category_id)?.name ?? 'Unknown'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggleActive(p)} className="p-2 rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext-light transition-colors" title={p.is_active ? 'Archive' : 'Restore'}>
                  {p.is_active ? <Archive size={15} /> : <Eye size={15} />}
                </button>
                <Link href={`/dashboard/merchant/products/${p.id}/edit`} aria-label={`Edit ${p.name}`} className="p-2 rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext-light transition-colors">
                  <Edit3 size={15} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
