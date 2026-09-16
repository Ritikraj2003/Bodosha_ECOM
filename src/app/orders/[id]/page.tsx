'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, Loader2, ShoppingBag, XCircle, Timer, Bike, KeyRound, BadgeCheck } from 'lucide-react';
import HamsterLoader from '@/components/ui/HamsterLoader';
import Link from 'next/link';
import { getUserOrder, cancelUserOrder } from '@/features/orders/actions/customer';
import { getCustomerDeliveryInfo } from '@/features/delivery/actions';
import { getOrderTimelineEvent, orderTypeLabel } from '@/features/orders/types';
import { showToast } from '@/components/shared/Toast';
import { usePolling } from '@/hooks/usePolling';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import type { Order, OrderItem, OrderStatus } from '@/features/orders/types';
import { createClient } from '@/infrastructure/supabase/client';

const POLL_INTERVAL_MS = 15_000;

interface DeliveryInfo {
  hasDelivery: boolean;
  orderStatus: string;
  assignment: {
    status: string;
    otpValue: string | null;
    otpExpiresAt: string | null;
    otpVerifiedAt: string | null;
  } | null;
  partner: { fullName: string | null; phone: string | null } | null;
  payment: { method: string | null; status: string };
  total: number;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const publicSettings = usePublicSettings();
  const cancellationWindowMs = publicSettings.cancellationWindowMinutes * 60_000;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [showOtp, setShowOtp] = useState(false);

  const loadOrder = useCallback(async (silent = false) => {
    if (!id) return;
    const res = await getUserOrder(id);
    if (res.success && res.data) {
      setOrder(res.data);
      if (!silent) setRemaining(cancellationWindowMs - (Date.now() - new Date(res.data.created_at).getTime()));
    }
    const deliveryRes = await getCustomerDeliveryInfo(id);
    if (deliveryRes.success && deliveryRes.data) setDeliveryInfo(deliveryRes.data);
    setLoading(false);
  }, [id, cancellationWindowMs]);

  useEffect(() => {
    loadOrder();  
  }, [loadOrder]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order-details-${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => {
          loadOrder(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadOrder]);

  usePolling(() => { loadOrder(true); }, POLL_INTERVAL_MS, !!id);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        const next = Math.max(0, r - 1000);
        if (next <= 0) clearInterval(interval);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  async function handleCancel() {
    if (!order || cancelling) return;
    setCancelling(true);
    const res = await cancelUserOrder(order.id, cancelReason);
    if (res.success) {
      showToast('Order cancelled');
      setOrder({ ...order, status: 'cancelled', cancellation_reason: cancelReason || null });
      setShowCancelInput(false);
    } else {
      showToast(res.error ?? 'Failed to cancel');
    }
    setCancelling(false);
  }

  if (loading) {
    return (
      <div className="page-pad flex justify-center py-16">
        <HamsterLoader size="md" text="Loading order..." />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page-pad">
        <div className="container-z mx-auto max-w-lg text-center py-16">
          <ShoppingBag size={40} className="mx-auto mb-4 text-ztext-muted/30" />
          <h1 className="text-xl font-bold text-ztext mb-2">Order not found</h1>
          <Link href="/orders" className="button-z button-z-primary mt-4">My orders</Link>
        </div>
      </div>
    );
  }

  const address = order.delivery_address as Record<string, string> | null;
  const timeline = (order.status_history as Array<{ status: OrderStatus; timestamp: string }>) ?? [];

  return (
    <div className="page-pad pb-28">
      <div className="container-z mx-auto max-w-2xl">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-ztext-light hover:text-zred mb-4 transition-colors">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ztext">Order details</h1>
            <p className="text-xs text-ztext-light mt-0.5">{order.tracking_code}</p>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-green-500/15 text-green-500">
            {order.status === 'pending' ? 'Placed' : order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/_/g, ' ')}
          </span>
        </div>

        <div className="bg-zcard rounded-xl border border-zborder p-5">
          <p className="font-semibold text-ztext text-sm mb-3">Items</p>
          <div className="space-y-2">
            {order.order_items?.map((item: OrderItem) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-ztext">{item.quantity}x {item.product_name}</span>
                <span className="font-medium text-ztext">₹{item.subtotal}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-zborder mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-ztext-light"><span>Subtotal</span><span>₹{order.subtotal}</span></div>
            <div className="flex justify-between text-ztext-light"><span>Delivery</span><span>{order.delivery_fee > 0 ? `₹${order.delivery_fee}` : 'Free'}</span></div>
            <div className="flex justify-between text-ztext-light"><span>Maintenance fee</span><span>₹{order.tax_amount}</span></div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-green-500"><span>Discount</span><span>-₹{order.discount_amount}</span></div>
            )}
            <div className="border-t border-zborder pt-2 flex justify-between font-bold text-ztext"><span>Total</span><span>₹{order.total}</span></div>
          </div>
        </div>

        <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
          <p className="font-semibold text-ztext text-sm mb-3">Order details</p>
          <div className="space-y-1.5 text-sm">
            {order.order_type && (
              <div className="flex justify-between text-ztext-light"><span>Order type</span><span className="font-medium text-ztext">{orderTypeLabel(order.order_type)}</span></div>
            )}
            <div className="flex justify-between text-ztext-light"><span>Payment</span><span className="font-medium text-ztext capitalize">{order.payment_method ?? '-'}</span></div>
            <div className="flex justify-between text-ztext-light"><span>Status</span>
              <span className={`font-medium ${order.payment_status === 'confirmed' ? 'text-green-500' : order.payment_status === 'failed' ? 'text-red-500' : 'text-yellow-500'}`}>
                {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {order.order_type === 'takeaway' && (
          <div className="bg-zcard rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mt-4">
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin size={16} className="text-amber-500 shrink-0" />
              <div>
                <p className="font-semibold text-ztext">Store Pickup (Take Away)</p>
                <p className="text-xs text-ztext-light mt-0.5">Collect directly from store counter • Dilip Da Canteen</p>
              </div>
            </div>
          </div>
        )}

        {deliveryInfo?.hasDelivery && (!order.order_type || order.order_type === 'room_delivery') && (
          <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
            <div className="flex items-center gap-2 text-sm mb-3">
              <Bike size={16} className="text-zred" />
              <p className="font-semibold text-ztext">Delivery</p>
            </div>

            <div className="space-y-1.5 text-sm">
              {deliveryInfo.partner && (
                <div className="flex justify-between text-ztext-light">
                  <span>Partner</span>
                  <span className="font-medium text-ztext">
                    {deliveryInfo.partner.fullName ?? 'Assigned'}
                    {deliveryInfo.partner.phone && (
                      <a href={`tel:${deliveryInfo.partner.phone}`} className="ml-2 text-zred hover:underline">Call</a>
                    )}
                  </span>
                </div>
              )}
              {deliveryInfo.assignment && (
                <div className="flex justify-between text-ztext-light">
                  <span>Status</span>
                  <span className="font-medium text-ztext capitalize">{deliveryInfo.assignment.status.replace(/_/g, ' ')}</span>
                </div>
              )}

              {deliveryInfo.payment.method === 'cod' && (
                <div className="flex justify-between text-ztext-light">
                  <span>Payment at door</span>
                  {deliveryInfo.payment.status === 'confirmed' ? (
                    <span className="font-medium text-green-500 flex items-center gap-1"><BadgeCheck size={14} /> Collected</span>
                  ) : (
                    <span className="font-medium text-yellow-500">₹{deliveryInfo.total > 0 ? Number(deliveryInfo.total).toLocaleString('en-IN') : ''} — Cash / UPI / Card</span>
                  )}
                </div>
              )}

              {deliveryInfo.assignment?.otpValue && deliveryInfo.assignment.otpExpiresAt && new Date(deliveryInfo.assignment.otpExpiresAt) > new Date() && !deliveryInfo.assignment.otpVerifiedAt && (
                <div className="pt-2 mt-1 border-t border-zborder">
                  {showOtp ? (
                    <div className="text-center py-1">
                      <p className="font-mono text-3xl font-bold tracking-[0.3em] text-ztext">{deliveryInfo.assignment.otpValue}</p>
                      <p className="text-[11px] text-ztext-lighter mt-2">Share this code with your delivery partner to confirm delivery.</p>
                    </div>
                  ) : (
                    <button onClick={() => setShowOtp(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zred/30 text-sm font-medium text-zred hover:bg-red-500/5 transition-colors">
                      <KeyRound size={14} /> Show delivery OTP
                    </button>
                  )}
                </div>
              )}
              {deliveryInfo.assignment?.otpVerifiedAt && (
                <div className="flex justify-between text-ztext-light">
                  <span>OTP check</span>
                  <span className="font-medium text-green-500 flex items-center gap-1"><BadgeCheck size={14} /> Verified</span>
                </div>
              )}
            </div>
          </div>
        )}

        {address && (!order.order_type || order.order_type === 'room_delivery') && (
          <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin size={16} className="text-zred shrink-0" />
              <div>
                <p className="font-semibold text-ztext">Delivery address</p>
                <p className="text-xs text-ztext-light mt-0.5">
                  {address.address}{address.city ? `, ${address.city}` : ''}{address.pincode ? ` - ${address.pincode}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {timeline.length > 0 && (
        <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
          {(order.status === 'pending' || order.status === 'accepted') && (
            <div className="flex items-center gap-2 text-sm mb-4 pb-4 border-b border-zborder">
              <Timer size={16} className="text-zred shrink-0" />
              <div>
                <p className="font-semibold text-ztext text-xs">
                  {remaining > 0
                    ? `You have ${Math.floor(remaining / 60000)}m ${Math.floor((remaining % 60000) / 1000)}s remaining to cancel this order`
                    : 'Cancellation window has expired. This order can no longer be cancelled.'}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm mb-4">
            <Clock size={16} className="text-zred" />
            <p className="font-semibold text-ztext">Order timeline</p>
          </div>
            <div className="space-y-3">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-zred mt-1" />
                    {idx < timeline.length - 1 && <div className="w-px flex-1 bg-zborder my-0.5" />}
                  </div>
                  <div>
                    <p className="text-sm text-ztext">{getOrderTimelineEvent(event.status)}</p>
                    <p className="text-[10px] text-ztext-lighter mt-0.5">
                      {new Date(event.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(order.status === 'pending' || order.status === 'accepted') && remaining > 0 && !showCancelInput && (
          <button onClick={() => setShowCancelInput(true)} className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/5 transition-colors">
            <XCircle size={16} /> Cancel order
          </button>
        )}

        {showCancelInput && (
          <div className="mt-4 bg-zcard rounded-xl border border-red-500/30 p-4">
            <p className="text-xs font-semibold text-ztext mb-2">Reason for cancellation (optional)</p>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Changed my mind"
              className="input-z text-sm w-full"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCancel(); if (e.key === 'Escape') setShowCancelInput(false); }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setShowCancelInput(false); setCancelReason(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-ztext-light bg-zgray hover:bg-zsurface transition-colors">Back</button>
              <button onClick={handleCancel} disabled={cancelling} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : null}
                {cancelling ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Link href="/orders" className="button-z button-z-outline flex-1 h-11 text-sm">All orders</Link>
          <Link href="/menu" className="button-z button-z-primary flex-1 h-11 text-sm">Order again</Link>
        </div>
      </div>
    </div>
  );
}