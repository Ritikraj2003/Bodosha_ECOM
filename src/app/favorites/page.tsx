'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Minus, Plus } from 'lucide-react';
import { useFavoritesStore, FavoriteItem } from '@/features/favorites/store';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';
import FavoriteButton from '@/components/shared/FavoriteButton';
import FoodDetailModal from '@/components/shared/FoodDetailModal';
import Reveal from '@/components/shared/Reveal';
import type { MenuItem } from '@/features/menu/data';
import HamsterLoader from '@/components/ui/HamsterLoader';

export default function FavoritesPage() {
  const { items } = useFavoritesStore();
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const { items: cartItems, addItem, setLastAddedRect, updateQuantity } = useCartStore();
  const [selectedDish, setSelectedDish] = useState<MenuItem | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/auth/login?next=${encodeURIComponent('/favorites')}`);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="page-pad flex justify-center py-16">
        <HamsterLoader size="md" text="Redirecting..." />
      </div>
    );
  }

  function getQty(id: string) {
    return cartItems.find((i) => i.id === id)?.quantity ?? 0;
  }

  function handleAdd(item: FavoriteItem, e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setLastAddedRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      veg: item.veg ?? false,
      image: item.img || item.image!,
      packagingBigQty: item.packagingBigQty,
      packagingSmallQty: item.packagingSmallQty,
    });
  }

  if (items.length === 0) {
    return (
      <div className="page-pad min-h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-zred/10 rounded-full flex items-center justify-center mb-6">
          <Heart size={40} className="text-zred" />
        </div>
        <h1 className="text-2xl font-black text-ztext mb-3">No favorites yet</h1>
        <p className="text-ztext-light max-w-sm mb-8">
          You haven&apos;t saved any dishes. Explore our menu and tap the heart icon on your favorite items to save them here!
        </p>
        <Link href="/menu" className="button-z button-z-primary px-8">
          Explore Menu
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-pad">
        <div className="container-z mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-6 mt-2">
            <Heart size={28} className="text-zred fill-zred/20" />
            <h1 className="text-2xl sm:text-3xl font-black text-ztext">My Favorites</h1>
          </div>
          
          <p className="text-ztext-light mb-8 font-medium">You have {items.length} saved dish{items.length > 1 ? 'es' : ''}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {items.map((item, i) => {
              const qty = getQty(item.id);
              const dishItem: MenuItem = {
                id: item.id,
                name: item.name,
                price: item.price,
                desc: item.desc,
                veg: item.veg ?? false,
                popular: item.popular ?? false,
                img: item.img || item.image || '/images/Chicken Curry.jpg',
              };

              return (
                <Reveal key={item.id} delay={Math.min(i * 60, 240)} className="h-full">
                  <div
                    onClick={() => setSelectedDish(dishItem)}
                    className="p-4 flex gap-4 bg-zcard rounded-xl border border-zborder card-lift h-full cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-3.5 h-3.5 flex items-center justify-center border ${item.veg ? 'border-green-500' : 'border-red-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${item.veg ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          </div>
                          {item.popular && <span className="text-[10px] font-bold text-zred bg-zred/10 px-1.5 py-0.5 rounded">Bestseller</span>}
                        </div>
                        <h3 className="font-semibold text-ztext text-sm sm:text-base mt-0.5 group-hover:text-zred transition-colors">{item.name}</h3>
                        <p className="text-sm font-bold text-ztext mt-1">₹{item.price}</p>
                      </div>
                      <p className="text-xs text-ztext-light mt-2 leading-relaxed line-clamp-2">{item.desc}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3 shrink-0">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-zgray relative shadow-sm">
                        <Image src={item.img || item.image!} alt={item.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 640px) 96px, 112px" />
                        <div onClick={(e) => e.stopPropagation()}>
                          <FavoriteButton item={item} />
                        </div>
                      </div>
                      <div className="-mt-7 z-10 relative bg-zcard rounded-lg shadow-sm border border-zborder overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {qty === 0 ? (
                          <button onClick={(e) => handleAdd(item, e)} className="w-20 h-8 flex items-center justify-center text-xs font-bold text-zred hover:bg-zred/10 transition-colors">
                            ADD
                          </button>
                        ) : (
                          <div className="w-20 h-8 flex items-center justify-between bg-zred text-white px-1">
                            <button onClick={() => updateQuantity(item.id, qty - 1)} aria-label={`Decrease quantity of ${item.name}`} className="p-1 hover:bg-white/20 rounded transition-colors flex items-center justify-center"><Minus size={14} /></button>
                            <span className="text-xs font-bold text-center">{qty}</span>
                            <button onClick={() => updateQuantity(item.id, qty + 1)} aria-label={`Increase quantity of ${item.name}`} className="p-1 hover:bg-white/20 rounded transition-colors flex items-center justify-center"><Plus size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>

      <FoodDetailModal
        dish={selectedDish}
        isOpen={Boolean(selectedDish)}
        onClose={() => setSelectedDish(null)}
      />
    </>
  );
}
