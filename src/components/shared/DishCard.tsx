'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Minus, Plus, Star } from 'lucide-react';
import FavoriteButton from '@/components/shared/FavoriteButton';
import FoodDetailModal from '@/components/shared/FoodDetailModal';
import { menuSections, type MenuItem } from '@/features/menu/data';

const menuItemById = new Map(menuSections.flatMap((s) => s.items).map((i) => [i.id, i]));

export interface DishCardItem extends Partial<MenuItem> {
  id: string;
  name: string;
  price: number;
  desc: string;
  veg: boolean;
  popular: boolean;
  img: string;
  rating?: number;
}

interface DishCardProps {
  dish: DishCardItem;
  qty: number;
  onAdd: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  onUpdateQuantity: (delta: number) => void;
  variant?: 'default' | 'menu';
}

export default function DishCard({ dish, qty, onAdd, onUpdateQuantity, variant = 'default' }: DishCardProps) {
  const menu = menuItemById.get(dish.id);
  const rating = dish.rating ?? menu?.rating;
  const [imgError, setImgError] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const displayImg = imgError || !dish.img ? '/images/Chicken Curry.jpg' : dish.img;

  // Merge full data if available
  const fullDish: MenuItem = {
    ...menu,
    ...dish,
    img: displayImg,
    rating,
    fullDesc: dish.fullDesc || menu?.fullDesc || dish.desc,
    includedItems: dish.includedItems || menu?.includedItems,
    servings: dish.servings || menu?.servings,
    pieces: dish.pieces || menu?.pieces,
    portionSize: dish.portionSize || menu?.portionSize,
    ingredients: dish.ingredients || menu?.ingredients,
    allergens: dish.allergens || menu?.allergens,
    prepTime: dish.prepTime || menu?.prepTime || 15,
    deliveryTime: dish.deliveryTime || menu?.deliveryTime || '20–30 min',
  };

  if (variant === 'menu') {
    return (
      <>
        <div
          onClick={() => setShowDetail(true)}
          className="group flex flex-col h-full rounded-2xl border border-zborder bg-zcard overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-z hover:border-ztext-lighter cursor-pointer"
        >
          <div className="relative h-28 sm:h-32 bg-zgray overflow-hidden">
            <Image
              src={displayImg}
              alt={dish.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, 300px"
              loading="lazy"
              onError={() => setImgError(true)}
            />
            {dish.popular && (
              <span className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-sm text-white text-[9px] font-semibold px-1.5 py-0.5 rounded tracking-wide">
                Bestseller
              </span>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <FavoriteButton item={{ id: dish.id, name: dish.name, price: dish.price, desc: dish.desc, veg: dish.veg, popular: dish.popular, img: dish.img }} />
            </div>
          </div>
          <div className="p-3 flex flex-col flex-1">
            <div className="flex items-start gap-1.5">
              <span className={`w-3 h-3 border p-[1.5px] rounded-[2px] mt-0.5 shrink-0 flex ${dish.veg ? 'border-green-600' : 'border-red-600'}`}>
                <span className={`w-full h-full rounded-full ${dish.veg ? 'bg-green-600' : 'bg-red-600'}`} />
              </span>
              <h3 className="text-[13px] font-bold text-ztext leading-snug line-clamp-2 min-h-[2.6em] group-hover:text-zred transition-colors">{dish.name}</h3>
            </div>
            <div className="mt-auto pt-2 flex items-center justify-between gap-2">
              {rating != null ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-ztext">
                  <Star size={11} className="fill-amber-500 text-amber-500" />
                  {rating.toFixed(1)}
                </span>
              ) : (
                <span />
              )}
              <span className="text-[13px] font-bold text-ztext">₹{dish.price}</span>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {qty === 0 ? (
                <button
                  onClick={(e) => onAdd(e)}
                  className="mt-1.5 w-full h-7 flex items-center justify-center gap-1 rounded-md text-[12px] font-bold text-zred bg-zred/10 border border-zred/40 transition-all hover:bg-zred hover:text-white hover:shadow-z"
                >
                  <Plus size={12} /> Add
                </button>
              ) : (
                <div className="mt-1.5 w-full h-7 flex items-center justify-between bg-zred rounded-md px-1 text-white">
                  <button onClick={() => onUpdateQuantity(-1)} aria-label={`Decrease ${dish.name}`} className="w-6 h-full flex items-center justify-center hover:bg-white/20 rounded transition-colors">
                    <Minus size={11} />
                  </button>
                  <span className="text-[12px] font-bold">{qty}</span>
                  <button onClick={() => onUpdateQuantity(1)} aria-label={`Increase ${dish.name}`} className="w-6 h-full flex items-center justify-center hover:bg-white/20 rounded transition-colors">
                    <Plus size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <FoodDetailModal dish={fullDish} isOpen={showDetail} onClose={() => setShowDetail(false)} />
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className="group relative flex flex-col h-full cursor-pointer"
      >
        <div className="relative h-40 sm:h-44 rounded-2xl overflow-hidden bg-zgray shadow-z">
          <Image
            src={displayImg}
            alt={dish.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 300px"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <div className={`absolute top-2 left-2 flex items-center justify-center w-4 h-4 rounded-sm bg-white/90 backdrop-blur-sm shadow-sm border ${dish.veg ? 'border-green-600' : 'border-red-600'}`}>
            <div className={`w-2 h-2 rounded-full ${dish.veg ? 'bg-green-600' : 'bg-red-600'}`} />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <FavoriteButton item={{ id: dish.id, name: dish.name, price: dish.price, desc: dish.desc, veg: dish.veg, popular: dish.popular, img: dish.img }} />
          </div>
          {dish.popular && (
            <span className="absolute left-2 bottom-2 text-[9px] font-bold text-white bg-zred px-1.5 py-0.5 rounded-md shadow-md">
              Bestseller
            </span>
          )}
          <div className="absolute right-2 bottom-2 z-10" onClick={(e) => e.stopPropagation()}>
            {qty === 0 ? (
              <button
                onClick={(e) => onAdd(e)}
                className="h-7 min-w-[54px] px-2 flex items-center justify-center gap-1 text-[12px] font-bold text-zred bg-white rounded-md shadow-md hover:bg-zred/10 transition-colors"
              >
                <Plus size={12} /> ADD
              </button>
            ) : (
              <div className="h-7 flex items-center justify-between bg-white rounded-md shadow-md px-0.5">
                <button onClick={() => onUpdateQuantity(-1)} aria-label={`Decrease ${dish.name}`} className="w-6 h-full flex items-center justify-center text-zred hover:bg-zred/10 rounded transition-colors">
                  <Minus size={11} />
                </button>
                <span className="w-6 text-center text-[12px] font-bold text-zinc-800">{qty}</span>
                <button onClick={() => onUpdateQuantity(1)} aria-label={`Increase ${dish.name}`} className="w-6 h-full flex items-center justify-center text-zred hover:bg-zred/10 rounded transition-colors">
                  <Plus size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${dish.veg ? 'bg-zgreen/10 text-zgreen' : 'bg-zred/10 text-zred'}`}>
              {dish.veg ? 'VEG' : 'NON-VEG'}
            </span>
            {rating != null && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500 shrink-0">
                <Star size={10} className="fill-amber-500 text-amber-500" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-bold text-ztext leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-zred transition-colors">{dish.name}</h3>
          <p className="text-xs text-ztext-light mt-0.5 line-clamp-1">{dish.desc}</p>
          <p className="mt-1.5 text-sm font-bold text-ztext">₹{dish.price}</p>
        </div>
      </div>

      <FoodDetailModal dish={fullDish} isOpen={showDetail} onClose={() => setShowDetail(false)} />
    </>
  );
}
