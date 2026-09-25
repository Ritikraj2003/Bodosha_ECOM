'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  Bike,
  MapPin,
  Loader2,
  Timer,
  AlertTriangle,
  X,
  Wallet,
  CreditCard,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import HamsterLoader from '@/components/ui/HamsterLoader';
import Link from 'next/link';
import { getUserOrder, cancelUserOrder } from '@/features/orders/actions/customer';
import type { Order, OrderItem } from '@/features/orders/types';
import { orderTypeLabel } from '@/features/orders/types';
import { usePublicSettings } from '@/hooks/usePublicSettings';

function OrderConfirmedContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!!orderId);

  // Cancellation & Timer states
  const publicSettings = usePublicSettings();
  const cancellationWindowMinutes = publicSettings.cancellationWindowMinutes || 2;
  const cancellationWindowMs = cancellationWindowMinutes * 60_000;

  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundChoice, setRefundChoice] = useState<'wallet' | 'original'>('wallet');
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    getUserOrder(orderId).then((res) => {
      if (res.success && res.data) {
        setOrder(res.data);
      }
      setLoading(false);
    });
  }, [orderId]);

  // Sync and countdown timer based on order creation time and general settings
  useEffect(() => {
    if (!order?.created_at || order.status === 'cancelled') {
      setRemainingMs(0);
      return;
    }

    const elapsed = Date.now() - new Date(order.created_at).getTime();
    const initialRemaining = Math.max(0, cancellationWindowMs - elapsed);
    setRemainingMs(initialRemaining);

    if (initialRemaining <= 0) return;

    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [order?.created_at, order?.status, cancellationWindowMs]);

  const handleConfirmCancel = async () => {
    if (!order || cancelling) return;
    setCancelling(true);
    setCancelError(null);

    const res = await cancelUserOrder(order.id, cancelReason, refundChoice);
    setCancelling(false);

    if (res.success) {
      setOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      setShowCancelModal(false);
      setRemainingMs(0);

      let msg = 'Your order has been cancelled.';
      if (res.refunded) {
        if (res.refundTarget === 'wallet') {
          msg = `Your order has been cancelled and ₹${order.total} has been instantly refunded to your ${process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas'} Wallet!`;
        } else {
          msg = `Your order has been cancelled and a refund of ₹${order.total} has been initiated back to your original payment source.`;
        }
      }
      setCancelSuccessMsg(msg);
    } else {
      setCancelError(res.error || 'Failed to cancel order. Please try again.');
    }
  };

  const address = order?.delivery_address as Record<string, string> | null;

  const isCancelled = order?.status === 'cancelled';
  const isCancellable =
    !isCancelled &&
    order &&
    (order.status === 'pending' || order.status === 'accepted' || order.status === 'placed') &&
    remainingMs > 0;

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const formattedCountdown = `${mins}:${secs.toString().padStart(2, '0')}`;
  const progressPercent = Math.min(100, Math.max(0, (remainingMs / cancellationWindowMs) * 100));

  const isOnlinePayment = order?.payment_method === 'razorpay' || order?.payment_method === 'upi';
  const isWalletPayment = order?.payment_method === 'wallet';
  const isCod = order?.payment_method === 'cod';

  return (
    <>
      {isCancelled ? (
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto text-red-500">
          <Ban size={40} />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto text-zgreen">
          <CheckCircle size={40} />
        </div>
      )}

      <h1 className="text-2xl font-bold text-ztext mt-6">
        {isCancelled ? 'Order Cancelled' : 'Order placed!'}
      </h1>
      <p className="text-ztext-light mt-2">
        {isCancelled
          ? 'This order has been cancelled and will not be prepared.'
          : 'Your order has been received and is being prepared.'}
      </p>

      {/* Cancellation Banner after successful cancel */}
      {cancelSuccessMsg && (
        <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-left text-xs space-y-1 animate-fade-in">
          <p className="font-bold text-amber-500 flex items-center gap-1.5 text-sm">
            <CheckCircle size={16} /> Order Cancelled Successfully
          </p>
          <p className="text-ztext leading-relaxed font-medium">{cancelSuccessMsg}</p>
        </div>
      )}

      {/* LIVE CANCELLATION TIMER CARD */}
      {!isCancelled && order && isCancellable && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 mt-6 text-left shadow-sm animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                <Timer size={20} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">
                  Cancellation Window
                </p>
                <p className="text-xs sm:text-sm font-semibold text-ztext">
                  You can cancel within <span className="font-mono text-amber-500 font-bold">{formattedCountdown}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setCancelError(null);
                setShowCancelModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/30 text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
              Cancel Order
            </button>
          </div>

          <div className="w-full bg-amber-500/20 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p className="text-[11px] text-ztext-light mt-2 leading-relaxed">
            Changed your mind or ordered by mistake? You can cancel your order before the timer expires.
          </p>
        </div>
      )}

      {/* Timer Expired Banner */}
      {!isCancelled && order && !isCancellable && remainingMs === 0 && (
        <div className="bg-zcard border border-zborder rounded-2xl p-3.5 mt-6 text-left flex items-center gap-2.5 text-xs text-ztext-light">
          <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
          <span>Cancellation window has ended. The kitchen has begun preparing your freshly cooked food.</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-ztext-lighter" />
        </div>
      ) : order ? (
        <>
          <div className="bg-zcard rounded-xl shadow-z p-6 mt-6 text-left">
            <p className="font-semibold text-ztext mb-3 text-sm">Items</p>
            <div className="space-y-2">
              {order.order_items?.map((item: OrderItem) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-ztext">
                    {item.quantity}x {item.product_name}
                  </span>
                  <span className="font-medium text-ztext">₹{item.subtotal}</span>
                </div>
              ))}
            </div>
            {order.order_type && (
              <div className="mt-2 text-xs text-ztext-muted font-medium">
                {orderTypeLabel(order.order_type)}
              </div>
            )}
            <div className="border-t border-zborder mt-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-ztext-light">
                <span>Subtotal</span>
                <span>₹{order.subtotal}</span>
              </div>
              <div className="flex justify-between text-ztext-light">
                <span>Delivery</span>
                <span>{order.delivery_fee > 0 ? `₹${order.delivery_fee}` : 'Free'}</span>
              </div>
              <div className="flex justify-between text-ztext-light">
                <span>Maintenance fee</span>
                <span>₹{order.tax_amount}</span>
              </div>
              <div className="flex justify-between font-bold text-ztext pt-1">
                <span>Total</span>
                <span>₹{order.total}</span>
              </div>
            </div>
          </div>

          {order.order_type === 'takeaway' ? (
            <div className="bg-zcard rounded-xl shadow-z p-6 mt-4 text-left border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="font-semibold text-ztext">Store Pickup (Take Away)</p>
                  <p className="text-xs text-ztext-light mt-0.5">
                    Please collect your freshly prepared order directly from the store counter.
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-500/15 text-xs text-ztext-lighter">
                📍 {process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'}, Near CIT Kokrajhar 2nd Gate
              </div>
            </div>
          ) : order.order_type === 'dine_in' || order.order_type === 'in_store' ? (
            <div className="bg-zcard rounded-xl shadow-z p-6 mt-4 text-left border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={18} className="text-purple-500 shrink-0" />
                <div>
                  <p className="font-semibold text-ztext">In-Store Order</p>
                  <p className="text-xs text-ztext-light mt-0.5">
                    Your order is being served at the canteen counter / table.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zcard rounded-xl shadow-z p-6 mt-4 text-left">
              <div className="flex items-center gap-3 text-sm">
                <Bike size={18} className="text-zred" />
                <div>
                  <p className="font-semibold text-ztext">
                    {isCancelled ? 'Delivery Cancelled' : 'Delivery partner will be assigned soon'}
                  </p>
                  <p className="text-xs text-ztext-light mt-0.5">
                    {isCancelled ? 'Order will not be dispatched.' : 'Expected delivery in 25–35 minutes'}
                  </p>
                </div>
              </div>
              {address && (
                <div className="flex items-center gap-3 text-sm mt-4 pt-4 border-t border-zborder">
                  <MapPin size={18} className="text-zred" />
                  <div>
                    <p className="font-semibold text-ztext">Delivering to</p>
                    <p className="text-xs text-ztext-light mt-0.5">
                      {address.address}
                      {address.city ? `, ${address.city}` : ''}
                      {address.pincode ? ` - ${address.pincode}` : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isCancelled && (
            <Link
              href={`/order/track?code=${encodeURIComponent(order.tracking_code)}`}
              className="bg-zcard rounded-xl shadow-z p-6 mt-4 block hover:border hover:border-zred/30 transition-colors"
            >
              <p className="text-sm text-ztext-light">Tracking code</p>
              <p className="text-2xl font-black text-ztext tracking-wider mt-1">{order.tracking_code}</p>
              <p className="text-xs text-zred mt-2 font-medium">Track order live →</p>
            </Link>
          )}
        </>
      ) : (
        <div className="bg-zcard rounded-xl shadow-z p-6 mt-8">
          <p className="text-ztext-light text-sm">
            Order details are being processed. Check your orders page for updates.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Link href="/orders" className="button-z button-z-primary flex-1 h-12">
          My orders
        </Link>
        <Link href="/" className="button-z button-z-outline flex-1 h-12">
          Order again
        </Link>
      </div>

      {/* CANCELLATION MODAL */}
      {showCancelModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-left">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-6 shadow-z-modal animate-scale-up">
            <div className="flex items-center justify-between pb-3.5 border-b border-zborder mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ztext">Cancel Order</h3>
                  <p className="text-xs text-ztext-light">Order #{order.tracking_code} • ₹{order.total}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zsurface transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {cancelError && (
              <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-medium">
                {cancelError}
              </div>
            )}

            <p className="text-xs text-ztext-light mb-4 leading-relaxed">
              Are you sure you want to cancel this order? Once cancelled, preparation will immediately stop.
            </p>

            {/* REFUND SELECTION SECTION */}
            <div className="space-y-3 mb-4">
              {isWalletPayment && (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-start gap-2.5">
                  <Wallet size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-500">Instant Wallet Refund</p>
                    <p className="text-[11px] text-ztext-light mt-0.5 leading-relaxed">
                      The amount of <strong className="text-ztext">₹{order.total}</strong> will be instantly refunded back to your {process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas'} Wallet balance.
                    </p>
                  </div>
                </div>
              )}

              {isOnlinePayment && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-ztext">
                    Choose where to receive your refund:
                  </label>

                  {/* Option 1: Wallet */}
                  <label
                    onClick={() => setRefundChoice('wallet')}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      refundChoice === 'wallet'
                        ? 'border-zred bg-zred/5 shadow-sm'
                        : 'border-zborder bg-zsurface hover:border-zborder-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="refundDest"
                      checked={refundChoice === 'wallet'}
                      onChange={() => setRefundChoice('wallet')}
                      className="mt-1 accent-zred"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <Wallet size={14} className="text-emerald-500" />
                        <span className="text-xs font-bold text-ztext">{process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas'} Wallet (Instant)</span>
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-500 font-bold px-1.5 py-0.2 rounded-full">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-ztext-light mt-0.5 leading-relaxed">
                        Instant refund of <strong>₹{order.total}</strong> credited to your wallet balance for immediate re-ordering.
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Original Payment Source */}
                  <label
                    onClick={() => setRefundChoice('original')}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      refundChoice === 'original'
                        ? 'border-zred bg-zred/5 shadow-sm'
                        : 'border-zborder bg-zsurface hover:border-zborder-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="refundDest"
                      checked={refundChoice === 'original'}
                      onChange={() => setRefundChoice('original')}
                      className="mt-1 accent-zred"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={14} className="text-blue-500" />
                        <span className="text-xs font-bold text-ztext">Original Payment Source</span>
                      </div>
                      <p className="text-[11px] text-ztext-light mt-0.5 leading-relaxed">
                        Refund of <strong>₹{order.total}</strong> sent back to your original bank/UPI via Razorpay (typically 3–5 business days).
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {isCod && (
                <div className="p-3 rounded-xl border border-zborder bg-zsurface text-xs text-ztext-light">
                  Cash on Delivery order. No payment was deducted, so no monetary refund is required.
                </div>
              )}
            </div>

            {/* Optional Reason Input */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-ztext mb-1.5">
                Reason for cancellation (optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Ordered by mistake, wrong items..."
                className="input-z w-full text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zborder">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="button-z button-z-secondary text-xs px-4 h-9"
                disabled={cancelling}
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="button-z button-z-primary text-xs px-4 h-9 font-bold bg-red-600 hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-50"
                disabled={cancelling}
              >
                {cancelling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function OrderConfirmedPage() {
  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-lg text-center py-12">
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <HamsterLoader size="lg" text="Loading order details..." />
            </div>
          }
        >
          <OrderConfirmedContent />
        </Suspense>
      </div>
    </div>
  );
}