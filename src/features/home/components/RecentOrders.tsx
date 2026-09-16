'use client';

import Image from 'next/image';
import Link from 'next/link';
import { RotateCcw, ChefHat } from 'lucide-react';
import type { Order } from '@/features/orders/types';
import { useCartStore } from '@/features/cart/store';
import { matchMenuItem } from '@/features/home/lib/useHomeOrders';
import { showToast } from '@/components/shared/Toast';

import { useMenu } from '@/features/menu/components/MenuProvider';

export default function RecentOrders({ orders }: { orders: Order[] }) {
  const { addItem, setLastAddedRect } = useCartStore();
  const { allItems } = useMenu();

  if (orders.length === 0) return null;

  function handleReorder(order: Order, e: React.MouseEvent<HTMLButtonElement>) {
    const items = order.order_items ?? [];
    if (items.length === 0) {
      showToast('Nothing to reorder');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setLastAddedRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    for (const oi of items) {
      const matched = allItems.find((m) => m.id === oi.product_id || m.name.toLowerCase() === oi.product_name.toLowerCase()) || matchMenuItem(oi.product_name);
      addItem({
        id: matched?.id ?? oi.product_id,
        name: matched?.name ?? oi.product_name,
        price: matched ? Number(matched.price) : Number(oi.product_price ?? oi.unit_price),
        veg: matched?.veg ?? false,
        image: matched?.img ?? '/images/Chicken Curry.jpg',
        packagingBigQty: matched?.packagingBigQty,
        packagingSmallQty: matched?.packagingSmallQty,
      }, oi.quantity || 1);
    }
    showToast(`Added ${items.length} item${items.length > 1 ? 's' : ''} to cart`);
  }

  return (
    <section className="py-3 sm:py-5 bg-zbg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-extrabold uppercase tracking-[0.8px] text-ztext">Recent Orders</h2>
            <div className="mt-1.5 w-12 h-[3px] rounded-full bg-zred" />
          </div>
          <Link href="/orders" className="text-[11px] font-semibold text-zred hover:underline shrink-0">
            View all
          </Link>
        </div>

        <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-hide px-0.5 sm:px-0 pb-1 max-w-full">
          {orders.map((order) => {
            const first = order.order_items?.[0];
            const firstImg = matchMenuItem(first?.product_name)?.img;
            const placedOn = new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return (
              <div key={order.id} className="w-44 shrink-0 bg-zcard border border-zborder rounded-2xl overflow-hidden shadow-sm card-lift">
                <div className="flex items-center gap-2.5 p-2.5">
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-zgray relative shrink-0">
                    {firstImg ? (
                      <Image src={firstImg} alt={first?.product_name ?? 'Food'} fill sizes="44px" className="object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center">
                        <ChefHat size={14} className="text-zred" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-ztext truncate">
                      {first ? `${first.quantity} × ${first.product_name}` : 'Order'}
                    </p>
                    <p className="text-[10px] text-ztext-lighter mt-0.5">{placedOn}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => handleReorder(order, e)}
                  className="w-full flex items-center justify-center gap-1.5 h-8 text-[10px] font-bold text-zred border-t border-zborder hover:bg-zred hover:text-white transition-colors"
                >
                  <RotateCcw size={11} /> Reorder
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
