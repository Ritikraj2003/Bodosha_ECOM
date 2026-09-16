'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, ChefHat, ShoppingBag, Loader2, XCircle, Clock, Search, MapPin, ChevronDown, ChevronRight, Wallet, UserRound, MoreVertical, X, Copy, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/store';
import { useCartStore } from '@/features/cart/store';
import { getUserOrders, cancelUserOrder } from '@/features/orders/actions/customer';
import type { Order } from '@/features/orders/types';
import { orderTypeLabel } from '@/features/orders/types';
import { menuSections } from '@/features/menu/data';
import { showToast } from '@/components/shared/Toast';
import { usePolling } from '@/hooks/usePolling';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import HamsterLoader from '@/components/ui/HamsterLoader';

const POLL_INTERVAL_MS = 30_000;
const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery'];
const allMenuItems = menuSections.flatMap((s) => s.items);

function foodImageFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const q = name.toLowerCase();
  return allMenuItems.find((i) => q.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(q))?.img;
}

function useCountdown(createdAt: string, windowMs: number) {
  const [remaining, setRemaining] = useState(() => windowMs - (Date.now() - new Date(createdAt).getTime()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = windowMs - (Date.now() - new Date(createdAt).getTime());
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt, remaining, windowMs]);

  return Math.max(0, remaining);
}

function canCancelByTime(createdAt: string, windowMs: number): boolean {
  return Date.now() - new Date(createdAt).getTime() < windowMs;
}

const statusTextColors: Record<string, string> = {
  pending: 'text-yellow-500',
  accepted: 'text-blue-500',
  preparing: 'text-orange-500',
  ready: 'text-green-500',
  out_for_delivery: 'text-blue-500',
  delivered: 'text-green-600',
  completed: 'text-green-600',
  cancelled: 'text-red-500',
};

function statusLabel(status: string): string {
  if (status === 'pending') return 'Placed';
  if (status === 'out_for_delivery') return 'Out for delivery';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

function OrderCard({ order, index, onCancel, cancellationWindowMs }: { order: Order; index: number; onCancel: (id: string, reason: string) => void; cancellationWindowMs: number }) {
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const remaining = useCountdown(order.created_at, cancellationWindowMs);
  const timeCanCancel = canCancelByTime(order.created_at, cancellationWindowMs);
  const canCancel = timeCanCancel && (order.status === 'pending' || order.status === 'accepted');
  const items = order.order_items ?? [];
  const first = items[0];
  const firstImg = foodImageFor(first?.product_name);

  const placedOn = `${new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${new Date(order.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;

  async function handleConfirm() {
    setCancelling(true);
    await onCancel(order.id, cancelReason);
    setCancelling(false);
    setShowConfirm(false);
  }

  async function copyTracking() {
    try {
      await navigator.clipboard.writeText(order.tracking_code);
      showToast('Tracking code copied');
    } catch {
      showToast('Could not copy code');
    }
  }

  return (
    <div className="bg-zcard rounded-[20px] border border-zborder overflow-hidden shadow-sm hover:shadow-z-hover transition-shadow animate-fade-up" style={{ animationDelay: `${Math.min(index * 80, 400)}ms` }}>
      <div className="flex items-center gap-3 p-3.5">
        <div className="w-14 h-14 rounded-xl overflow-hidden border border-zborder bg-zgray relative shrink-0">
          {firstImg ? (
            <Image src={firstImg} alt={first?.product_name ?? 'Food'} fill sizes="56px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ChefHat size={18} className="text-zred" />
            </div>
          )}
          {items.length > 1 && (
            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 leading-4 rounded-tl-lg">+{items.length - 1}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-ztext text-[13px] leading-tight">Dilip Da</h3>
          <p className="text-[10px] text-ztext-lighter mt-0.5 truncate">{orderTypeLabel(order.order_type) || 'Hostel Delivery'}</p>
          <Link href="/menu" className="text-[10px] font-semibold text-zred hover:underline inline-flex items-center gap-1 mt-0.5">
            View menu <ChevronDown size={9} />
          </Link>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copyTracking} className="text-ztext-lighter hover:text-zred transition-colors p-1" aria-label="Copy tracking code" title={order.tracking_code}>
            <Copy size={13} />
          </button>
          <Link href={`/orders/${order.id}`} className="text-ztext-lighter hover:text-zred transition-colors p-1" aria-label="Order details">
            <MoreVertical size={15} />
          </Link>
        </div>
      </div>

      <hr className="border-zborder" />

      <Link href={`/orders/${order.id}`} className="block px-3.5 py-2.5">
        {first && (
          <div>
            <h4 className="font-semibold text-ztext text-[13px] leading-snug">{first.quantity} × {first.product_name}</h4>
            <p className="text-[11px] text-ztext-lighter mt-0.5 truncate">₹{first.unit_price} each{first.special_instructions ? ` · ${first.special_instructions}` : ''}</p>
          </div>
        )}
        {items.length > 1 && (
          <p className="text-[10px] font-medium text-ztext-light mt-1">+{items.length - 1} more item{items.length > 2 ? 's' : ''}</p>
        )}
      </Link>

      <hr className="border-zborder" />

      <Link href={`/orders/${order.id}`} className="flex items-center justify-between px-3.5 py-2.5">
        <div>
          <p className="text-[10px] text-ztext-lighter">Order placed on {placedOn}</p>
          <h4 className={`font-bold text-[13px] mt-0.5 ${statusTextColors[order.status] ?? 'text-ztext'}`}>{statusLabel(order.status)}</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-ztext text-[15px]">₹{order.total}</span>
          <ChevronRight size={13} className="text-ztext-lighter" />
        </div>
      </Link>

      <hr className="border-zborder" />

      <div className="p-3.5 pt-3">
        {canCancel && !showConfirm && (
          <button onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-500/25 text-[11px] font-semibold text-red-400 hover:bg-red-500/5 transition-colors">
            <XCircle size={12} /> Cancel order
          </button>
        )}
        {!canCancel && (
          <div className="flex gap-2">
            {(order.status === 'delivered' || order.status === 'completed') && (
              <Link href="/menu" className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-zred/30 text-[11px] font-semibold text-zred hover:bg-red-500/5 transition-colors">
                <RotateCcw size={11} /> Reorder
              </Link>
            )}
            <Link href={order.status === 'cancelled' ? `/orders/${order.id}` : `/order/track?code=${order.tracking_code}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-zborder text-[11px] font-semibold text-ztext-light hover:border-zred/40 hover:text-zred transition-colors">
              {order.status === 'cancelled' ? 'View details' : 'Track order'} <ChevronRight size={11} />
            </Link>
          </div>
        )}

        {(order.status === 'pending' || order.status === 'accepted') && (
          <p className="text-[10px] text-ztext-lighter flex items-center gap-1 mt-2">
            <Clock size={9} />
            {timeCanCancel
              ? `You have ${Math.floor(remaining / 60000)}m ${Math.floor((remaining % 60000) / 1000)}s remaining to cancel`
              : 'Cancellation window has expired. This order can no longer be cancelled.'}
          </p>
        )}

        {showConfirm && (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              className="input-z text-xs w-full"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setShowConfirm(false); setCancelReason(''); }} className="flex-1 py-2 rounded-xl text-xs font-medium text-ztext-light bg-zgray hover:bg-zsurface transition-colors">Back</button>
              <button onClick={handleConfirm} disabled={cancelling} className="flex-1 py-2 rounded-xl text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                {cancelling ? <Loader2 size={12} className="animate-spin" /> : null}
                {cancelling ? 'Cancelling...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<'cart' | 'orders'>('orders');
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const { items: cartItems, updateQuantity, removeItem, clearCart, deliveryFee, maintenanceFee, total, totalItems } = useCartStore();
  const publicSettings = usePublicSettings();
  const cancellationWindowMs = publicSettings.cancellationWindowMinutes * 60_000;
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [orderQuery, setOrderQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered' | 'cancelled'>('all');
  const loading = !ordersLoaded && activeTab === 'orders';
  const cartCount = totalItems();

  const loadOrders = useCallback(async () => {
    if (activeTab !== 'orders' || !isAuthenticated) return;
    const res = await getUserOrders(page, 5);
    if (res.success && res.data) {
      setOrders(res.data.orders);
      setTotalPages(res.data.totalPages);
    }
    setOrdersLoaded(true);
  }, [activeTab, page, isAuthenticated]);

  useEffect(() => {
    loadOrders();  
  }, [loadOrders]);

  usePolling(loadOrders, POLL_INTERVAL_MS, activeTab === 'orders' && isAuthenticated);

  async function handleCancelOrder(orderId: string, reason: string) {
    const res = await cancelUserOrder(orderId, reason);
    if (res.success) {
      showToast('Order cancelled');
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'cancelled' as const } : o));
    } else {
      showToast(res.error ?? 'Failed to cancel');
    }
  }

  const q = orderQuery.trim().toLowerCase();
  const statusFilteredOrders = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return ACTIVE_STATUSES.includes(o.status);
    if (statusFilter === 'delivered') return o.status === 'delivered' || o.status === 'completed';
    return o.status === 'cancelled';
  });
  const filteredOrders = q
    ? statusFilteredOrders.filter((o) =>
        o.tracking_code.toLowerCase().includes(q) ||
        o.order_items?.some((i) => i.product_name.toLowerCase().includes(q)) ||
        o.customer_name?.toLowerCase().includes(q)
      )
    : statusFilteredOrders;

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center page-pad">
        <HamsterLoader size="md" text="Loading orders..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="page-pad">
        <div className="container-z mx-auto max-w-lg text-center py-16">
          <ClipboardList size={48} className="mx-auto mb-4 text-ztext-muted" />
          <h1 className="text-xl font-bold text-ztext">Sign in to view orders</h1>
          <p className="text-sm text-ztext-light mt-2">
            Log in to see your order history and active cart.
          </p>
          <Link href="/auth/login" className="button-z button-z-primary mt-6">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad pb-28">
      <div className="container-z mx-auto max-w-3xl">

        <div className="flex items-center gap-2 mb-8 bg-zcard p-1 rounded-2xl border border-zborder max-w-xs mx-auto">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'orders'
                ? 'bg-zgray text-ztext shadow-sm'
                : 'text-ztext-muted hover:text-ztext-light'
            }`}
          >
            <ClipboardList size={16} /> Orders
          </button>
          <button
            onClick={() => setActiveTab('cart')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'cart'
                ? 'bg-zgray text-ztext shadow-sm'
                : 'text-ztext-muted hover:text-ztext-light'
            }`}
          >
            <ShoppingBag size={16} /> Cart {cartCount > 0 && <span className="w-5 h-5 rounded-full bg-zred text-white text-[10px] flex items-center justify-center ml-1">{cartCount}</span>}
          </button>
        </div>

        {activeTab === 'cart' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {cartItems.length > 0 ? (
              <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-xl font-bold text-ztext">Active Cart</h1>
                    <p className="text-ztext-light text-xs mt-0.5">{cartCount} item{cartCount > 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={clearCart} className="text-xs text-ztext-lighter hover:text-zred transition-colors">Clear</button>
                </div>

                <div className="bg-zcard rounded-xl border border-zborder p-4 shadow-sm">
                <div className="space-y-3">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex gap-3 items-center">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-zgray shrink-0 relative">
                          <Image src={item.image} alt={item.name} fill sizes="(max-width: 640px) 56px, 64px" className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="font-semibold text-ztext text-sm truncate">{item.name}</h2>
                          <p className="text-xs font-medium text-ztext-light mt-0.5">₹{item.price}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex items-center gap-1 border border-zborder rounded-lg">
                            <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1.5 hover:bg-zgray transition-colors rounded-l-lg">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <span className="text-xs font-semibold w-4 text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1.5 hover:bg-zgray transition-colors rounded-r-lg">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                          </div>
                          <p className="font-bold text-ztext w-12 text-right text-xs sm:text-sm">₹{item.price * item.quantity}</p>
                          <button onClick={() => removeItem(item.id)} className="p-1 text-ztext-lighter hover:text-zred transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-zborder flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-ztext">Total: ₹{total()}</p>
                      <p className="text-[10px] text-ztext-light mt-0.5">Includes ₹{deliveryFee() + maintenanceFee()} fees</p>
                    </div>
                    <Link
                      href={isAuthenticated ? '/checkout' : '/auth/login?next=/checkout'}
                      className="button-z button-z-primary text-sm font-bold px-8 h-10 w-full sm:w-auto"
                    >
                      Checkout
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zcard rounded-xl border border-zborder p-8 text-center mt-4">
                <ShoppingBag size={40} className="mx-auto mb-4 text-ztext-muted/30" />
                <h1 className="text-xl font-bold text-ztext mb-2">Your cart is empty</h1>
                <p className="text-sm text-ztext-light mb-6">Looks like you haven&apos;t added anything to your cart yet.</p>
                <Link href="/menu" className="button-z button-z-primary px-8">
                  Browse Menu
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="flex items-center gap-1.5 text-base font-bold text-ztext">
                  <MapPin size={14} className="text-zred" /> Dilip Da <ChevronDown size={12} className="text-ztext-lighter" />
                </h1>
                <p className="text-[11px] text-ztext-light mt-0.5">Near CIT Kokrajhar, 2nd Gate</p>
              </div>
              <div className="flex items-center gap-2">
                {/* <Link href="/dashboard/student/credit" aria-label="Ethics Pay credit" title="Ethics Pay credit" className="w-9 h-9 rounded-full border border-zborder bg-zcard flex items-center justify-center text-ztext-light shadow-sm hover:border-zred/40 hover:text-zred transition-colors">
                  <Wallet size={15} />
                </Link> */}
                <Link href="/profile" aria-label="Profile" title="Profile" className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-blue-700 bg-blue-100/80 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 shadow-sm hover:shadow-z-hover transition-shadow">
                  {user?.fullName
                    ? user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
                    : <UserRound size={15} />}
                </Link>
              </div>
            </div>

            <div className="relative mb-4">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zred" />
              <input
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="Search by dish or order code..."
                className="w-full bg-zcard border border-zborder h-14 rounded-[18px] pl-11 pr-10 text-sm text-ztext placeholder:text-ztext-lighter outline-none focus:border-zred focus:ring-2 focus:ring-zred/20 transition-all shadow-sm"
              />
              {orderQuery && (
                <button onClick={() => setOrderQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ztext-lighter hover:text-zred transition-colors" aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {(['all', 'active', 'delivered', 'cancelled'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                    statusFilter === f
                      ? 'bg-zred text-white border-zred'
                      : 'bg-zcard text-ztext-light border-zborder hover:border-zred/40 hover:text-zred'
                  }`}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ztext-lighter" /></div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-zcard rounded-2xl border border-zborder p-8 text-center mt-4">
                <ClipboardList size={40} className="mx-auto mb-4 text-ztext-muted/30" />
                <p className="text-xl font-bold text-ztext mb-2">{orders.length === 0 ? 'No past orders' : 'No matching orders'}</p>
                <p className="text-sm text-ztext-light mt-1 mb-6">
                  {orders.length === 0 ? "You haven't placed any orders yet." : 'Try a different dish or order code.'}
                </p>
                {orders.length === 0 ? (
                  <button onClick={() => setActiveTab('cart')} className="button-z button-z-primary px-8">
                    View Cart
                  </button>
                ) : (
                  <button onClick={() => setOrderQuery('')} className="button-z button-z-outline px-8">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {filteredOrders.map((order, index) => (
                    <OrderCard key={order.id} order={order} index={index} onCancel={handleCancelOrder} cancellationWindowMs={cancellationWindowMs} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                      className="button-z button-z-outline text-xs h-8 px-4 disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-ztext-light">{page} of {totalPages}</span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="button-z button-z-outline text-xs h-8 px-4 disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
