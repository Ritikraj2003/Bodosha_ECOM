'use client';

import { useState } from 'react';
import { useCartStore } from '@/features/cart/store';
import { Search, Banknote, Star } from 'lucide-react';
import DishCard from '@/components/shared/DishCard';
import Reveal from '@/components/shared/Reveal';
import { useMenu } from '@/features/menu/components/MenuProvider';
import type { MenuItem } from '@/features/menu/data';

function initialFromUrl(): { category: string; vegOnly: boolean; priceCap: number | null; popularOnly: boolean } {
  if (typeof window === 'undefined') {
    return { category: 'All', vegOnly: false, priceCap: null, popularOnly: false };
  }
  const q = new URLSearchParams(window.location.search);
  const max = Number(q.get('max'));
  return {
    category: q.get('category') ?? 'All',
    vegOnly: q.get('veg') === '1',
    priceCap: max > 0 ? max : null,
    popularOnly: q.get('popular') === '1',
  };
}

export function MenuItems() {
  const store = useCartStore();
  const { items: cartItems, addItem, setLastAddedRect, updateQuantity } = store;
  const { sections } = useMenu();

  const initial = initialFromUrl();
  const [activeCategory, setActiveCategory] = useState(initial.category);
  const [vegOnly, setVegOnly] = useState(initial.vegOnly);
  const [priceCap, setPriceCap] = useState<number | null>(initial.priceCap);
  const [popularOnly, setPopularOnly] = useState(initial.popularOnly);
  const [searchQuery, setSearchQuery] = useState('');

  const categoryLabels: Record<string, string> = {
    All: 'All Dishes',
    Thali: 'Thali Specials',
    Gravy: 'Curries & Gravies',
  };

  function getQty(id: string) {
    return cartItems.find((i) => i.id === id)?.quantity ?? 0;
  }

  function handleAdd(item: MenuItem, e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      setLastAddedRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      veg: item.veg,
      image: item.img,
      packagingBigQty: item.packagingBigQty,
      packagingSmallQty: item.packagingSmallQty,
    });
  }

  function handleCategoryClick(category: string) {
    setActiveCategory(category);
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }

  const pillCls = (active: boolean) =>
    `shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
      active
        ? 'bg-ztext text-zcard shadow-sm'
        : 'bg-zcard border border-zborder text-ztext-light hover:border-ztext-lighter hover:text-ztext'
    }`;

  const baseSections = activeCategory === 'All'
    ? sections
    : sections.filter((s) => s.category === activeCategory);

  const filteredSections = baseSections.map((s) => ({
    ...s,
    items: s.items.filter((i) => {
      if (vegOnly && !i.veg) return false;
      if (priceCap && i.price > priceCap) return false;
      if (popularOnly && !i.popular) return false;
      if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  const allItems = filteredSections.flatMap((s) => s.items);

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ztext-muted" />
        <input
          type="text"
          placeholder="Search menu items, thalis, gravies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-zcard border border-zborder rounded-xl text-[10px] text-ztext shadow-sm focus:outline-none focus:border-zred focus:ring-[3px] focus:ring-zred/10 transition-all"
        />
      </div>

      {/* Filter header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold text-ztext uppercase tracking-wide">Categories</span>
        <button
          role="switch"
          aria-checked={vegOnly}
          aria-label="Toggle vegetarian only"
          onClick={() => setVegOnly(!vegOnly)}
          className="flex items-center gap-1.5 bg-zcard border border-zborder pl-2 pr-1.5 py-1 rounded-full text-[10px] font-semibold text-ztext"
        >
          Veg Only
          <span className={`relative w-5 h-3 rounded-full transition-colors ${vegOnly ? 'bg-green-500' : 'bg-ztext-muted'}`}>
            <span className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform duration-300 ${vegOnly ? 'translate-x-[8px]' : ''}`} />
          </span>
        </button>
      </div>

      {/* Category + filter pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        {['All', ...sections.map((s) => s.category)].map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryClick(cat)}
            className={pillCls(activeCategory === cat)}
          >
            {categoryLabels[cat] ?? cat}
          </button>
        ))}
        <button
          onClick={() => setPriceCap(priceCap ? null : 200)}
          className={pillCls(priceCap != null)}
        >
          <Banknote size={12} /> Under ₹200
        </button>
        <button
          onClick={() => setPopularOnly(!popularOnly)}
          className={pillCls(popularOnly)}
        >
          <Star size={12} /> Bestsellers
        </button>
      </div>

      {/* Menu items grid */}
      {allItems.length === 0 ? (
        <p className="text-sm text-ztext-light mt-4">No dishes match your filters.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4">
          {allItems.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i * 40, 240)} className="h-full">
              <DishCard
                variant="menu"
                dish={item}
                qty={getQty(item.id)}
                onAdd={(e) => handleAdd(item, e)}
                onUpdateQuantity={(delta) => updateQuantity(item.id, getQty(item.id) + delta)}
              />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
