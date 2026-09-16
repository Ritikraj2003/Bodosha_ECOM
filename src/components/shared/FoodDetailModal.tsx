'use client';

import { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  X, Plus, Minus, Star, Clock, Truck, Users, Check,
  Sparkles, AlertCircle, Flame, CheckCircle2, ShoppingBag, Package
} from 'lucide-react';
import FavoriteButton from '@/components/shared/FavoriteButton';
import { useCartStore } from '@/features/cart/store';
import type { MenuItem } from '@/features/menu/data';

export interface FoodDetailModalProps {
  dish: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FoodDetailModal({ dish, isOpen, onClose }: FoodDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const { items: cartItems, addItem, updateQuantity } = useCartStore();
  const [modalQty, setModalQty] = useState(1);
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [imgError, setImgError] = useState(false);
  const headingId = useId();

  useEffect(() => {
     
    setMounted(true);
  }, []);

  // Sync quantity and state when a dish is opened
  useEffect(() => {
    if (dish && isOpen) {
      const existingInCart = cartItems.find((i) => i.id === dish.id);
       
      setModalQty(existingInCart ? existingInCart.quantity : 1);
      setAddedAnimation(false);
      setImgError(false);
    }
  }, [dish, isOpen, cartItems]);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !dish || !mounted) return null;

  const displayImg = imgError || !dish.img ? '/images/Chicken Curry.jpg' : dish.img;
  const rating = dish.rating ?? 4.8;
  const descriptionText = dish.fullDesc || dish.desc;
  const totalPrice = dish.price * modalQty;
  const inCart = cartItems.some((i) => i.id === dish.id);

  function handleAddToCart() {
    if (!dish) return;
    const existing = cartItems.find((i) => i.id === dish.id);
    if (existing) {
      updateQuantity(dish.id, modalQty);
    } else {
      addItem(
        {
          id: dish.id,
          name: dish.name,
          price: dish.price,
          veg: dish.veg,
          image: displayImg,
          packagingBigQty: dish.packagingBigQty,
          packagingSmallQty: dish.packagingSmallQty,
        },
        modalQty
      );
    }

    setAddedAnimation(true);
    setTimeout(() => {
      setAddedAnimation(false);
      onClose();
    }, 500);
  }

  const modalContent = (
    /* 1. Centering & Backdrop: Centered overlay over the viewport */
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      {/* Backdrop Click Dismiss */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Modal Dimensions & Constraints: Compact max-w-sm / w-[90%], max-h-[85vh], rounded-2xl, bg-[#1C1D22] */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-[92%] max-w-sm sm:max-w-md bg-[#1C1D22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col z-10 animate-fade-up text-zinc-100"
      >
        {/* 3. Scrollable Modal Body */}
        <div className="overflow-y-auto flex-1 scrollbar-hide">
          {/* Header Image Container with Absolute Top Icons */}
          <div className="relative h-44 sm:h-52 w-full bg-zinc-900 overflow-hidden shrink-0">
            <Image
              src={displayImg}
              alt={dish.name}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 450px"
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1C1D22] via-transparent to-black/40" />

            {/* Top-Left: Veg / Non-Veg badge */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 shadow-md">
              <span
                className={`w-3.5 h-3.5 border p-[1.5px] rounded-[3px] flex items-center justify-center ${
                  dish.veg ? 'border-green-500' : 'border-red-500'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${dish.veg ? 'bg-green-500' : 'bg-red-500'}`} />
              </span>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${dish.veg ? 'text-green-400' : 'text-red-400'}`}>
                {dish.veg ? '100% Veg' : 'Non-Veg'}
              </span>
            </div>

            {/* Top-Right Action Icons: Favorite & Close */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <FavoriteButton item={{ id: dish.id, name: dish.name, price: dish.price, desc: dish.desc, veg: dish.veg, popular: dish.popular, img: dish.img }} />
              <button
                onClick={onClose}
                aria-label="Close details"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-all shadow-md active:scale-95 border border-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Bestseller Tag */}
            {dish.popular && (
              <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-lg">
                <Sparkles size={11} className="animate-pulse" />
                Bestseller
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-5 space-y-3.5">
            {/* Category & Rating */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/5">
                {dish.category || 'Special Dish'}
              </span>
              <div className="flex items-center gap-1 bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full text-xs font-extrabold">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {rating.toFixed(1)}
                <span className="text-[10px] text-zinc-400 font-normal">(50+)</span>
              </div>
            </div>

            {/* Dish Title & Price */}
            <div>
              <h2 id={headingId} className="text-lg sm:text-xl font text-white leading-tight">
                {dish.name}
              </h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font text-white">₹{dish.price}</span>
              </div>
            </div>

            {/* Description */}
            {descriptionText && (
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-800/50 p-3 rounded-xl border border-white/5">
                {descriptionText}
              </p>
            )}

            {/* Timing & Serving Specs */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {/* Servings / Pieces */}
              {(dish.servings || dish.pieces) && (
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/60 border border-white/5 text-xs text-zinc-300">
                  <Users size={14} className="text-blue-400 shrink-0" />
                  <span className="truncate">Serves: <strong className="text-white">{dish.servings || dish.pieces}</strong></span>
                </div>
              )}

              {/* Prep Time */}
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/60 border border-white/5 text-xs text-zinc-300">
                <Clock size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">Prep: <strong className="text-white">{dish.prepTime || 15} min</strong></span>
              </div>

              {/* Delivery Time */}
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/60 border border-white/5 text-xs text-zinc-300">
                <Truck size={14} className="text-green-400 shrink-0" />
                <span className="truncate">Delivery: <strong className="text-white">{dish.deliveryTime || '20–30 min'}</strong></span>
              </div>

              {/* Portion Size */}
              {dish.portionSize && (
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-800/60 border border-white/5 text-xs text-zinc-300">
                  <Package size={14} className="text-purple-400 shrink-0" />
                  <span className="truncate">Portion: <strong className="text-white">{dish.portionSize}</strong></span>
                </div>
              )}
            </div>

            {/* What's Included */}
            {dish.includedItems && dish.includedItems.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <h3 className="text-[11px] font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-green-400" />
                  What&apos;s Included
                </h3>
                <div className="bg-zinc-800/60 border border-white/5 rounded-xl p-2.5 space-y-1">
                  {dish.includedItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-zinc-300">
                      <Check size={12} className="text-green-400 mt-0.5 shrink-0" />
                      <span className="leading-tight">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ingredients */}
            {dish.ingredients && dish.ingredients.length > 0 && (
              <div className="space-y-1 pt-1">
                <h3 className="text-[11px] font-extrabold text-zinc-300 uppercase tracking-wider">Ingredients</h3>
                <div className="flex flex-wrap gap-1.5">
                  {dish.ingredients.map((ing, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md border border-white/5"
                    >
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Allergens & Spice Level */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {dish.allergens && dish.allergens.length > 0 && dish.allergens[0] !== 'None' && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  <AlertCircle size={11} className="shrink-0" />
                  <span>Contains: <strong>{dish.allergens.join(', ')}</strong></span>
                </div>
              )}

              {dish.spiceLevel != null && dish.spiceLevel > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                  <Flame size={11} className="shrink-0" />
                  <span>Spice: <strong>{'🌶️'.repeat(Math.min(dish.spiceLevel, 4))}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Quantity Counter & Add to Cart Button */}
        <div className="p-3 bg-[#161618] border-t border-white/10 flex items-center justify-between gap-2.5 shrink-0">
          {/* Quantity Counter */}
          <div className="flex items-center bg-zinc-800 rounded-xl p-1 border border-white/5 shrink-0">
            <button
              onClick={() => setModalQty((q) => Math.max(1, q - 1))}
              disabled={modalQty <= 1}
              aria-label="Decrease quantity"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-30 transition-all active:scale-95"
            >
              <Minus size={12} />
            </button>
            <span className="w-7 text-center font-extrabold text-xs text-white">
              {modalQty}
            </span>
            <button
              onClick={() => setModalQty((q) => Math.min(20, q + 1))}
              aria-label="Increase quantity"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-all active:scale-95"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            className={`flex-1 h-10 px-3 flex items-center justify-center gap-1.5 rounded-xl font-bold text-xs transition-all shadow-md active:scale-[0.98] whitespace-nowrap ${
              addedAnimation
                ? 'bg-green-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {addedAnimation ? (
              <>
                <Check size={15} className="animate-bounce" />
                <span>Added to Cart!</span>
              </>
            ) : (
              <>
                <ShoppingBag size={15} />
                <span>{inCart ? 'Update Cart' : 'Add to Cart'} • ₹{totalPrice}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
