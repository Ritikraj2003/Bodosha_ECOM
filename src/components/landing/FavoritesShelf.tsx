'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useFavoritesStore } from '@/features/favorites/store';
import { useCartStore } from '@/features/cart/store';
import DishCard from '@/components/shared/DishCard';

export default function FavoritesShelf() {
  const favorites = useFavoritesStore((s) => s.items);
  const { addItem, items, setLastAddedRect, updateQuantity } = useCartStore();

  if (favorites.length === 0) return null;

  function getQty(id: string) {
    return items.find((i) => i.id === id)?.quantity ?? 0;
  }

  function handleAdd(dish: { id: string; name: string; price: number; veg: boolean; img: string; packagingBigQty?: number; packagingSmallQty?: number }, e?: React.MouseEvent<HTMLButtonElement>) {
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

  return (
    <section className="py-5 sm:py-6 bg-zgray">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-extrabold uppercase tracking-[0.8px] text-ztext">Your favourites</h2>
            <div className="mt-2 w-12 h-[3px] rounded-full bg-zred" />
            <p className="text-xs text-ztext-light mt-2 flex items-center gap-1">
              <Heart size={11} className="text-zred fill-zred" /> Tap the ♥ on any dish to add it here
            </p>
          </div>
          <Link href="/favorites" className="text-[11px] font-semibold text-zred hover:underline shrink-0">
            View all
          </Link>
        </div>

        <div className="mt-4 flex gap-3.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
          {favorites.map((d, i) => (
            <div key={d.id} className="w-40 shrink-0 snap-start animate-fade-up" style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}>
              <DishCard
                dish={{ id: d.id, name: d.name, price: d.price, desc: d.desc, veg: d.veg, popular: d.popular ?? false, img: d.img || d.image || '' }}
                qty={getQty(d.id)}
                onAdd={(e) => handleAdd(d, e)}
                onUpdateQuantity={(delta) => updateQuantity(d.id, getQty(d.id) + delta)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
