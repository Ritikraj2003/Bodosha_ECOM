'use client';

import { useState } from 'react';
import { useCartStore } from '@/features/cart/store';
import { SlidersHorizontal, Banknote, Star, Leaf, X } from 'lucide-react';
import DishCard from '@/components/shared/DishCard';
import Reveal from '@/components/shared/Reveal';
import type { MenuItem } from '@/features/menu/data';

interface FeaturedDishesProps {
  dishes: MenuItem[];
  vegOnly: boolean;
  onVegOnly: (v: boolean) => void;
  priceCap: number | null;
  onPriceCap: (v: number | null) => void;
  popularOnly: boolean;
  onPopularOnly: (v: boolean) => void;
  onClear: () => void;
}

export default function FeaturedDishes({
  dishes,
  vegOnly,
  onVegOnly,
  priceCap,
  onPriceCap,
  popularOnly,
  onPopularOnly,
  onClear,
}: FeaturedDishesProps) {
  const { addItem, items, setLastAddedRect, updateQuantity } = useCartStore();
  const [filtersOpen, setFiltersOpen] = useState(false);

  function getQty(id: string) {
    return items.find((i) => i.id === id)?.quantity ?? 0;
  }

  function handleAdd(dish: MenuItem, e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      setLastAddedRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    addItem({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      veg: dish.veg,
      image: dish.img,
      packagingBigQty: dish.packagingBigQty,
      packagingSmallQty: dish.packagingSmallQty,
    });
  }

  const filterCount = (vegOnly ? 1 : 0) + (priceCap ? 1 : 0) + (popularOnly ? 1 : 0);

  return (
    <section id="recommended-grid" className="py-5 sm:py-8 bg-zgray scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filter chips */}
        <div className="chip-row">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={`pill ${filtersOpen || filterCount > 0 ? 'active' : ''}`}
          >
            <SlidersHorizontal size={12} /> Filters
            {filterCount > 0 && <span className="w-4 h-4 rounded-full bg-white/25 text-[9px] flex items-center justify-center">{filterCount}</span>}
          </button>
          <button onClick={() => onPriceCap(priceCap ? null : 200)} className={`pill ${priceCap ? 'active' : ''}`}>
            <Banknote size={12} /> Under ₹200
          </button>
          <button onClick={() => onPopularOnly(!popularOnly)} className={`pill ${popularOnly ? 'active' : ''}`}>
            <Star size={12} /> Bestsellers
          </button>
          <button onClick={() => onVegOnly(!vegOnly)} className={`pill ${vegOnly ? 'active' : ''}`}>
            <Leaf size={12} /> Veg only
          </button>
        </div>

        {/* Filters dropdown */}
        {filtersOpen && (
          <div className="mt-3 bg-zcard rounded-xl border border-zborder p-3 space-y-2 animate-fade-up">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-ztext">Filters</p>
              {filterCount > 0 && (
                <button onClick={onClear} className="text-[10px] font-semibold text-zred flex items-center gap-1 hover:underline">
                  <X size={11} /> Clear all
                </button>
              )}
            </div>
            {[
              { label: 'Veg only', active: vegOnly, toggle: () => onVegOnly(!vegOnly) },
              { label: 'Under ₹200', active: !!priceCap, toggle: () => onPriceCap(priceCap ? null : 200) },
              { label: 'Bestsellers only', active: popularOnly, toggle: () => onPopularOnly(!popularOnly) },
            ].map((f) => (
              <button
                key={f.label}
                onClick={f.toggle}
                className="w-full flex items-center justify-between py-2 text-sm text-ztext hover:text-ztext-light transition-colors"
              >
                <span>{f.label}</span>
                <span className={`w-8 h-[18px] rounded-full p-[2px] transition-colors ${f.active ? 'bg-zred' : 'bg-zgray border border-zborder'}`}>
                  <span className={`block w-3.5 h-3.5 bg-white rounded-full transition-transform ${f.active ? 'translate-x-4' : 'translate-x-0'}`} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Section title with red underline */}
        <div className="mt-6 sm:mt-8">
          <h2 className="text-[15px] font-extrabold uppercase tracking-[0.8px] text-ztext">Recommended for you</h2>
          <div className="mt-2 w-12 h-[3px] rounded-full bg-zred" />
          <p className="text-xs text-ztext-light mt-2">
            {dishes.length} dish{dishes.length === 1 ? '' : 'es'}
            {filterCount > 0 && ' • filtered'}
          </p>
        </div>

        {dishes.length === 0 ? (
          <div className="mt-4 bg-zcard rounded-xl border border-zborder p-8 text-center">
            <p className="text-sm font-bold text-ztext">No dishes match your filters</p>
            <p className="text-xs text-ztext-light mt-1">Try clearing a filter or searching for something else.</p>
            <button onClick={onClear} className="button-z button-z-primary mt-5 text-xs h-9 px-5">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="mt-4 sm:mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3.5 gap-y-5 sm:gap-y-6">
            {dishes.map((dish, i) => (
              <Reveal key={dish.id} delay={Math.min(i * 60, 300)}>
                <DishCard
                  dish={dish}
                  qty={getQty(dish.id)}
                  onAdd={(e) => handleAdd(dish, e)}
                  onUpdateQuantity={(delta) => updateQuantity(dish.id, getQty(dish.id) + delta)}
                />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
