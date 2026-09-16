'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import { useCartStore } from '@/features/cart/store';
import { useMenu } from '@/features/menu/components/MenuProvider';
import FoodDetailModal from '@/components/shared/FoodDetailModal';
import type { MenuItem } from '@/features/menu/data';

export default function SpecialsShelf() {
  const { addItem, items, setLastAddedRect, updateQuantity } = useCartStore();
  const { sections } = useMenu();
  const [selectedDish, setSelectedDish] = useState<MenuItem | null>(null);
  const specials = sections.flatMap((s) => s.items).filter((i) => i.popular);

  function getQty(id: string) {
    return items.find((i) => i.id === id)?.quantity ?? 0;
  }

  function handleAdd(dish: MenuItem, e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setLastAddedRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
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
    <>
      <section className="py-3 sm:py-5 bg-zbg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.8px] text-ztext">Chef&apos;s Specials</h2>
              <div className="mt-1.5 w-12 h-[3px] rounded-full bg-zred" />
            </div>
            <Link href="/menu" className="text-[11px] font-semibold text-zred hover:underline shrink-0">
              View all
            </Link>
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-hide px-0.5 sm:px-0 pb-1 max-w-full">
            {specials.map((dish) => {
              const qty = getQty(dish.id);
              return (
                <div
                  key={dish.id}
                  onClick={() => setSelectedDish(dish)}
                  className="w-32 sm:w-40 shrink-0 bg-zcard border border-zborder rounded-2xl overflow-hidden shadow-sm card-lift cursor-pointer group"
                >
                  <div className="relative h-20 sm:h-24 bg-zgray">
                    <Image
                      src={dish.img}
                      alt={dish.name}
                      fill
                      sizes="(max-width: 640px) 128px, 160px"
                      loading="lazy"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-xs font-bold text-ztext truncate group-hover:text-zred transition-colors">{dish.name}</h3>
                    <p className="text-[11px] font-bold text-ztext mt-0.5">₹{dish.price}</p>
                    <div onClick={(e) => e.stopPropagation()}>
                      {qty === 0 ? (
                        <button
                          onClick={(e) => handleAdd(dish, e)}
                          className="mt-2 w-full h-7 flex items-center justify-center gap-1 rounded-lg border border-zred bg-white text-zred text-[10px] font-extrabold hover:bg-zred hover:text-white transition-colors"
                        >
                          <Plus size={11} /> ADD
                        </button>
                      ) : (
                        <div className="mt-2 h-7 flex items-center justify-between bg-zred text-white rounded-lg px-1">
                          <button
                            onClick={() => updateQuantity(dish.id, qty - 1)}
                            aria-label={`Decrease ${dish.name}`}
                            className="w-6 h-full flex items-center justify-center hover:bg-white/20 rounded-l-lg"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="text-[11px] font-bold">{qty}</span>
                          <button
                            onClick={() => updateQuantity(dish.id, qty + 1)}
                            aria-label={`Increase ${dish.name}`}
                            className="w-6 h-full flex items-center justify-center hover:bg-white/20 rounded-r-lg"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <FoodDetailModal
        dish={selectedDish}
        isOpen={Boolean(selectedDish)}
        onClose={() => setSelectedDish(null)}
      />
    </>
  );
}
