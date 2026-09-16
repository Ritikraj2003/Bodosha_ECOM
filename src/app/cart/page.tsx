'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/features/cart/store';
import { useAuthStore } from '@/features/auth/store';
import { usePublicSettings } from '@/hooks/usePublicSettings';

export default function CartPage() {
  const router = useRouter();
  const store = useCartStore();
  const publicSettings = usePublicSettings();
  const { items, updateQuantity, removeItem, clearCart, subtotal, deliveryFee, maintenanceFee, packagingCharge, total, totalItems } = store;
  const { isAuthenticated, isLoading } = useAuthStore();
  const count = totalItems();

  useEffect(() => {
    useCartStore.getState().setPricing({
      deliveryFee: publicSettings.deliveryFee,
      maintenanceFee: publicSettings.maintenanceFee,
      packagingCharge: publicSettings.packagingCharge,
      packagingBigPrice: publicSettings.packagingBigPrice,
      packagingSmallPrice: publicSettings.packagingSmallPrice,
    });
  }, [publicSettings.deliveryFee, publicSettings.maintenanceFee, publicSettings.packagingCharge, publicSettings.packagingBigPrice, publicSettings.packagingSmallPrice]);

  function goToCheckout() {
    if (isLoading) return;
    router.push(isAuthenticated ? '/checkout' : '/auth/login?next=/checkout');
  }

  if (items.length === 0) {
    return (
      <div className="page-pad">
        <div className="container-z mx-auto max-w-3xl">
          <div className="bg-zcard rounded-2xl border border-zborder p-8 text-center max-w-md mx-auto my-12 shadow-z">
            <div className="w-16 h-16 rounded-2xl bg-zred/10 flex items-center justify-center mx-auto mb-4 text-zred">
              <ShoppingBag size={28} />
            </div>
            <h1 className="text-xl font-bold text-ztext">Your bag is empty</h1>
            <p className="text-xs text-ztext-light mt-1">Looks like you haven&apos;t added any delicious food yet.</p>
            <Link href="/menu" className="button-z button-z-primary inline-flex items-center gap-2 mt-5 text-xs font-bold px-6">
              Browse Menu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ztext">Your Bag</h1>
            <p className="text-xs text-ztext-light mt-0.5">{count} item{count > 1 ? 's' : ''} from Dilip Da</p>
          </div>
          <button onClick={clearCart} className="text-xs text-ztext-lighter hover:text-red-400 font-medium flex items-center gap-1 transition-colors">
            <Trash2 size={13} /> Clear Bag
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart items list */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="bg-zcard rounded-xl border border-zborder p-3.5 flex items-center gap-3.5 shadow-z">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-zsurface">
                  <Image src={item.image || '/images/food-placeholder.svg'} alt={item.name} fill sizes="64px" className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${item.veg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <h3 className="font-semibold text-ztext text-sm truncate">{item.name}</h3>
                  </div>
                  <p className="text-xs font-bold text-zred mt-0.5">₹{item.price}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-zsurface border border-zborder rounded-lg p-0.5">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-zcard rounded text-ztext-light hover:text-ztext transition-colors">
                      <Minus size={13} />
                    </button>
                    <span className="text-xs font-bold text-ztext px-1 min-w-[1.25rem] text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-zcard rounded text-ztext-light hover:text-ztext transition-colors">
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="p-1.5 text-ztext-lighter hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <Link href="/menu" className="inline-flex items-center gap-1 text-xs font-medium text-zred hover:underline mt-2">
              <ArrowLeft size={12} /> Add more items
            </Link>
          </div>

          {/* Bill summary — sticky on desktop, bottom bar on mobile */}
          <div className="hidden lg:block">
            <div className="bg-zcard rounded-xl shadow-z p-5 sticky top-24 border border-zborder">
              <h2 className="font-bold text-ztext text-sm mb-3">Bill details</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-ztext-light"><span>Item total</span><span className="font-medium text-ztext">₹{subtotal()}</span></div>
                <div className="flex justify-between text-ztext-light"><span>Delivery fee</span><span className="font-medium text-ztext">{deliveryFee() > 0 ? `₹${deliveryFee()}` : 'Free'}</span></div>
                <div className="flex justify-between text-ztext-light"><span>Maintenance fee</span><span className="font-medium text-ztext">₹{maintenanceFee()}</span></div>
                {packagingCharge() > 0 && (
                  <div className="flex justify-between text-ztext-light"><span>Packaging charge</span><span className="font-medium text-ztext">₹{packagingCharge()}</span></div>
                )}
                <div className="border-t border-zborder pt-2 flex justify-between font-bold text-ztext text-sm"><span>Total</span><span>₹{total()}</span></div>
              </div>
              <button onClick={goToCheckout} className="button-z button-z-primary w-full mt-4 h-10 text-sm font-bold">
                Proceed to checkout
              </button>
            </div>
          </div>
        </div>

        {/* Mobile sticky checkout bar */}
        <div className="lg:hidden sticky bottom-0 sticky-above-nav bg-zcard border-t border-zborder shadow-z-modal -mx-4 px-4 py-3 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-ztext-light">{count} item{count > 1 ? 's' : ''} • ₹{subtotal()} + ₹{deliveryFee() + maintenanceFee() + packagingCharge()} fees</p>
              <p className="text-sm font-bold text-ztext">₹{total()}</p>
            </div>
            <button onClick={goToCheckout} className="button-z button-z-primary text-xs font-bold px-5 h-9">
              Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
