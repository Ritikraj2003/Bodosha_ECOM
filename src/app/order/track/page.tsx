'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PackageSearch, Bike, MapPin, Loader2, Phone, CheckCircle2, Clock, KeyRound, Search, BadgeCheck } from 'lucide-react';
import HamsterLoader from '@/components/ui/HamsterLoader';
import { getOrderTrackingByCode } from '@/features/orders/actions/customer';
import type { Order, OrderItem } from '@/features/orders/types';
import { orderTypeLabel } from '@/features/orders/types';
import { usePolling } from '@/hooks/usePolling';

const POLL_INTERVAL_MS = 15_000;

const DELIVERY_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'out_for_delivery', 'delivered'];
const TAKEAWAY_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'completed'];

const STEP_LABELS: Record<string, string> = {
  pending: 'Order placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  assigned: 'Partner assigned',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  completed: 'Collected',
  cancelled: 'Cancelled',
  declined: 'Declined',
};

interface TrackData {
  order: Order & { order_items?: OrderItem[] };
  assignment: {
    status: string;
    otpValue: string | null;
    otpExpiresAt: string | null;
    otpVerifiedAt: string | null;
  } | null;
  partner: { fullName: string | null; phone: string | null } | null;
}

function TrackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCode = (searchParams.get('code') ?? '').trim().toUpperCase();
  const [code, setCode] = useState(initialCode);
  const [input, setInput] = useState(initialCode);
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);

  const lookup = useCallback(async (silent = false) => {
    if (!code) return;
    if (!silent) { setLoading(true); setError(''); }
    const res = await getOrderTrackingByCode(code);
    if (!silent) setLoading(false);
    if (res.success && res.data) {
      setData(res.data as TrackData);
      setError('');
    } else if (!silent) {
      setData(null);
      setError(res.error ?? 'Could not track this order');
    }
  }, [code]);

  useEffect(() => {
    if (code) lookup();  
  }, [code, lookup]);

  usePolling(() => lookup(true), POLL_INTERVAL_MS, !!code && !!data);

  useEffect(() => {
    const otpExpiresAt = data?.assignment?.otpExpiresAt;
    if (!otpExpiresAt) return;
    const tick = () => setOtpSecondsLeft(Math.max(0, Math.floor((new Date(otpExpiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data?.assignment?.otpExpiresAt]);

  async function handleTrack() {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    if (data?.order.tracking_code !== trimmed) setData(null);
    setCode(trimmed);
    router.replace(`/order/track?code=${encodeURIComponent(trimmed)}`);
  }

  const isTakeaway = data?.order.order_type === 'takeaway' || data?.order.order_type === 'dine_in' || data?.order.order_type === 'in_store';
  const steps = isTakeaway ? TAKEAWAY_STEPS : DELIVERY_STEPS;
  const currentOrderStatus = data?.order.status === 'delivered' && isTakeaway ? 'completed' : (data?.order.status ?? '');
  const stepIndex = data ? steps.indexOf(currentOrderStatus) : -1;
  const isCancelled = data?.order.status === 'cancelled' || data?.order.status === 'declined';
  const isDelivered = data?.order.status === 'delivered' || data?.order.status === 'completed';
  const address = data?.order.delivery_address as Record<string, string> | null;

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-lg py-8">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-zred/10 flex items-center justify-center mx-auto text-zred">
            <PackageSearch size={40} />
          </div>
          <h1 className="text-2xl font-bold text-ztext mt-6">Track order</h1>
          <p className="text-ztext-light mt-2">Enter your tracking code to see live status.</p>
        </div>

        <div className="mt-6 flex gap-2">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTrack(); }}
            placeholder="e.g. DD-X7K2L9P"
            className="input-z flex-1 font-mono text-sm"
          />
          <button onClick={handleTrack} disabled={loading || input.trim().length === 0} className="button-z button-z-primary h-11 px-5 flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Track
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-zcard rounded-xl border border-zborder p-5 text-center">
            <p className="text-sm text-zred">{error}</p>
            <p className="text-xs text-ztext-light mt-2">Make sure you enter the code shown on your order confirmation, or check <Link href="/orders" className="text-zred hover:underline">My Orders</Link>.</p>
          </div>
        )}

        {loading && !data && !error && (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-ztext-lighter" /></div>
        )}

        {data && (
          <>
            <div className="mt-6 bg-zcard rounded-xl shadow-z p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ztext-light">Tracking code</p>
                  <p className="font-mono text-lg font-black text-ztext tracking-wider">{data.order.tracking_code}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                  isCancelled ? 'bg-red-500/10 text-red-400' : isDelivered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {STEP_LABELS[data.order.status] ?? data.order.status.replace(/_/g, ' ')}
                </span>
              </div>
              {data.order.order_type && (
                <p className="text-xs text-ztext-muted mt-1 font-medium">{orderTypeLabel(data.order.order_type)} • {data.order.payment_method?.toUpperCase()}</p>
              )}
            </div>

            {isCancelled ? (
              <div className="mt-4 bg-red-500/5 rounded-xl border border-red-500/20 p-5 text-center">
                <p className="text-sm font-semibold text-zred">This order was {data.order.status}</p>
                {data.order.cancellation_reason && <p className="text-xs text-ztext-light mt-1">{data.order.cancellation_reason}</p>}
              </div>
            ) : (
              <div className="mt-4 bg-zcard rounded-xl border border-zborder p-5">
                <p className="text-sm font-semibold text-ztext mb-4">Order status</p>
                <div className={`grid ${isTakeaway ? 'grid-cols-5' : 'grid-cols-7'} items-center`}>
                  {steps.map((step, i) => {
                    const done = i < stepIndex || (isDelivered && i === steps.length - 1);
                    const current = i === stepIndex && !isDelivered;
                    const leftDone = i > 0 && i <= stepIndex;
                    const rightDone = i < steps.length - 1 && i < stepIndex;
                    return (
                      <div key={step} className="flex items-center">
                        <div className={`h-0.5 flex-1 rounded ${leftDone ? 'bg-emerald-500/50' : 'bg-transparent'}`} />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 ${
                          done ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                          : current ? 'bg-zred/15 border-zred text-zred'
                          : 'border-zborder text-ztext-muted'
                        }`}>
                          {done ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                        </div>
                        <div className={`h-0.5 flex-1 rounded ${rightDone ? 'bg-emerald-500/50' : 'bg-transparent'}`} />
                      </div>
                    );
                  })}
                </div>
                <div className={`grid ${isTakeaway ? 'grid-cols-5' : 'grid-cols-7'} mt-2`}>
                  {steps.map((step, i) => {
                    const done = i < stepIndex || (isDelivered && i === steps.length - 1);
                    const current = i === stepIndex && !isDelivered;
                    return (
                      <span key={step} className={`text-[10px] font-medium text-center leading-tight px-0.5 ${done ? 'text-emerald-500' : current ? 'text-zred' : 'text-ztext-muted'}`}>
                        {STEP_LABELS[step]}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {data.order.order_items && data.order.order_items.length > 0 && (
              <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
                <p className="text-sm font-semibold text-ztext mb-3">Items</p>
                <div className="space-y-2">
                  {data.order.order_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-ztext">{item.quantity}x {item.product_name}</span>
                      <span className="font-medium text-ztext">₹{item.subtotal}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zborder mt-3 pt-3 flex justify-between text-sm">
                  <span className="text-ztext-light">Total</span>
                  <span className="font-bold text-ztext">₹{data.order.total}</span>
                </div>
              </div>
            )}

            {/* Takeaway Store Pickup Card */}
            {isTakeaway && !isCancelled && (
              <div className="bg-zcard rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mt-4">
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin size={16} className="text-amber-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-ztext">Store Pickup (Take Away)</p>
                    <p className="text-xs text-ztext-light mt-0.5">
                      {data.order.status === 'ready'
                        ? '🎉 Your order is ready for pickup! Please collect it from the store counter.'
                        : 'Your order is being freshly prepared. Please collect it from the store counter once ready.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-amber-500/15 text-xs text-ztext-lighter">
                  📍 Dilip Da Canteen, Near CIT Kokrajhar 2nd Gate
                </div>
              </div>
            )}

            {/* Delivery Card (Strictly for Delivery Orders) */}
            {!isTakeaway && !isCancelled && (
              <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
                <div className="flex items-center gap-2 text-sm mb-3">
                  <Bike size={16} className="text-zred" />
                  <p className="font-semibold text-ztext">Delivery</p>
                </div>
                <div className="space-y-1.5 text-sm">
                  {data.partner ? (
                    <div className="flex justify-between text-ztext-light">
                      <span>Partner</span>
                      <span className="font-medium text-ztext">
                        {data.partner.fullName ?? 'Assigned'}
                        {data.partner.phone && (
                          <a href={`tel:${data.partner.phone}`} className="ml-2 text-zred hover:underline inline-flex items-center gap-0.5"><Phone size={11} /> Call</a>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-ztext-light">
                      <span>Partner</span>
                      <span className="font-medium text-ztext">{isDelivered ? 'Delivered' : 'Will be assigned when your order is ready'}</span>
                    </div>
                  )}
                  {data.assignment && (
                    <div className="flex justify-between text-ztext-light">
                      <span>Status</span>
                      <span className="font-medium text-ztext capitalize">{data.assignment.status.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {data.order.payment_method === 'cod' && (
                    <div className="flex justify-between text-ztext-light">
                      <span>Payment at door</span>
                      {data.order.payment_status === 'confirmed' ? (
                        <span className="font-medium text-green-500 flex items-center gap-1"><BadgeCheck size={14} /> Collected</span>
                      ) : (
                        <span className="font-medium text-yellow-500">₹{Number(data.order.total).toLocaleString('en-IN')} — Cash / UPI / Card</span>
                      )}
                    </div>
                  )}

                  {data.assignment?.otpValue && data.assignment.otpExpiresAt && new Date(data.assignment.otpExpiresAt) > new Date() && !data.assignment.otpVerifiedAt && (
                    <div className="pt-2 mt-1 border-t border-zborder">
                      {showOtp ? (
                        <div className="text-center py-1">
                          <p className="font-mono text-3xl font-bold tracking-[0.3em] text-ztext">{data.assignment.otpValue}</p>
                          <p className="text-[11px] text-ztext-lighter mt-2">
                            Share this code with your delivery partner to confirm delivery.
                            {otpSecondsLeft > 0 && <span className="block mt-0.5 text-ztext-muted">Valid for {Math.floor(otpSecondsLeft / 60)}m {otpSecondsLeft % 60}s</span>}
                          </p>
                        </div>
                      ) : (
                        <button onClick={() => setShowOtp(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zred/30 text-sm font-medium text-zred hover:bg-red-500/5 transition-colors">
                          <KeyRound size={14} /> Show delivery OTP
                        </button>
                      )}
                    </div>
                  )}
                  {data.assignment?.otpVerifiedAt && (
                    <div className="flex justify-between text-ztext-light">
                      <span>OTP check</span>
                      <span className="font-medium text-green-500 flex items-center gap-1"><BadgeCheck size={14} /> Verified</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {address?.address && !isTakeaway && (
              <div className="bg-zcard rounded-xl border border-zborder p-5 mt-4">
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin size={16} className="text-zred shrink-0" />
                  <div>
                    <p className="font-semibold text-ztext">Delivering to</p>
                    <p className="text-xs text-ztext-light mt-0.5">
                      {address.address}{address.city ? `, ${address.city}` : ''}{address.pincode ? ` - ${address.pincode}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isDelivered && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ztext-light">
                <CheckCircle2 size={16} className="text-zgreen" />
                {isTakeaway ? 'Order completed / collected' : `Delivered${data.order.delivered_at ? ` on ${new Date(data.order.delivered_at).toLocaleString()}` : ''}`}
              </div>
            )}
          </>
        )}

        {!data && !error && !loading && (
          <div className="mt-6 bg-zcard rounded-xl border border-zborder p-6 text-center">
            <p className="text-sm text-ztext-light">No order tracked yet.</p>
            <p className="text-xs text-ztext-lighter mt-1">The tracking code is shown on your order confirmation page.</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link href="/orders" className="button-z button-z-primary flex-1 h-12 flex items-center justify-center">My orders</Link>
          <Link href="/" className="button-z button-z-outline flex-1 h-12 flex items-center justify-center">Back home</Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderTrackPage() {
  return (
    <Suspense fallback={
      <div className="page-pad">
        <div className="container-z mx-auto max-w-lg text-center py-16">
          <HamsterLoader size="lg" text="Loading tracking details..." />
        </div>
      </div>
    }>
      <TrackContent />
    </Suspense>
  );
}
