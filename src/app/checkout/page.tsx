'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Phone, User, CreditCard, Banknote, ArrowLeft, Loader2, ShoppingBag, Shield, Wallet, CheckCircle2, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import HamsterLoader from '@/components/ui/HamsterLoader';
import { useCartStore } from '@/features/cart/store';
import { useAuthStore } from '@/features/auth/store';
import { loadRazorpayScript, openRazorpayCheckout } from '@/features/payments/services/razorpay';
import { createOrder, confirmPayment, sendOrderNotification, validateAndQuoteOrder } from '@/features/orders/actions/customer';
import { createRazorpayOrder, getAvailablePaymentMethods } from '@/features/payments/actions';
import type { PaymentMethodAvailability } from '@/lib/settings';
import { getWalletDetails, deductWalletBalance } from '@/features/wallet/actions';
import { canPayOnDelivery } from '@/features/orders/types';
import type { OrderType } from '@/features/orders/types';
import { OrderTypeSelector } from '@/components/shared/OrderTypeSelector';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { isStoreOpen, formatClock, isTemporarilyClosed, temporaryCloseLabel } from '@/features/menu/lib/store-hours';
import { getSlotAvailability, formatClock12h, minutesFromMidnight, getCurrentISTMinutes } from '@/features/delivery/lib/slots';

const basePaymentMethods = [
  { id: 'wallet', label: 'Ethics Pay', desc: 'Pay instantly using your wallet cash balance', icon: Wallet },
  { id: 'razorpay', label: 'Pay with Razorpay', desc: 'Credit/Debit card, UPI, Net Banking', icon: CreditCard },
  { id: 'phonepe', label: 'Pay with PhonePe', desc: 'Pay using PhonePe UPI', icon: CreditCard },
  { id: 'gpay', label: 'Pay with Google Pay', desc: 'Pay using GPay UPI', icon: CreditCard },
  { id: 'cod', label: 'Cash on Delivery', desc: 'Pay when your food arrives', icon: Banknote },
];

export default function CheckoutPage() {
  const router = useRouter();
  const store = useCartStore();
  const { items, subtotal, deliveryFee, maintenanceFee, packagingCharge, total, clearCart } = store;
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [orderType, setOrderType] = useState<OrderType | null>(() => useCartStore.getState().orderType);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [walletCreditLimit, setWalletCreditLimit] = useState<number>(0);
  const [walletTotalPenalties, setWalletTotalPenalties] = useState<number>(0);
  const [address, setAddress] = useState('');
  const [isCustomAddress, setIsCustomAddress] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState(user?.fullName ?? '');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const publicSettings = usePublicSettings();
  const razorpayKey = publicSettings.razorpayKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const [availableMethods, setAvailableMethods] = useState<PaymentMethodAvailability[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');

  // Fixed Delivery Slot availability calculation
  const slotData = getSlotAvailability(publicSettings.deliverySlots, new Date());
  const effectiveSlotId = selectedSlotId || slotData.nextAvailableSlot?.id || '';
  const paymentMethods = basePaymentMethods.filter((pm) => {
    const avail = availableMethods.find((a) => a.id === pm.id);
    if (!avail || !avail.enabled || !avail.configured) return false;
    if (pm.id === 'wallet' && walletStatus !== null && walletStatus !== 'active') return false;
    return true;
  });
  const selectedMethod = paymentMethods.some((pm) => pm.id === paymentMethod) ? paymentMethod : (paymentMethods[0]?.id ?? paymentMethod);
  const deliveryLocations = publicSettings.deliveryLocations.map((loc) => ({ value: loc, label: loc.split(',')[0] }));

  useEffect(() => {
    let cancelled = false;
    getAvailablePaymentMethods().then((methods) => {
      if (cancelled) return;
      setAvailableMethods(methods);
      setMethodsLoaded(true);
    }).catch(() => {
      if (!cancelled) setMethodsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    useCartStore.getState().setPricing({
      deliveryFee: publicSettings.deliveryFee,
      maintenanceFee: publicSettings.maintenanceFee,
      packagingCharge: publicSettings.packagingCharge,
      packagingBigPrice: publicSettings.packagingBigPrice,
      packagingSmallPrice: publicSettings.packagingSmallPrice,
    });
  }, [publicSettings.deliveryFee, publicSettings.maintenanceFee, publicSettings.packagingCharge, publicSettings.packagingBigPrice, publicSettings.packagingSmallPrice]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth/login?next=/checkout');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      getWalletDetails().then((res) => {
        if (res.success && res.data) {
          setWalletBalance(res.data.balance);
          setWalletStatus(res.data.wallet?.status ?? 'unverified');
          setWalletCreditLimit(res.data.wallet?.credit_limit ?? 0);
          setWalletTotalPenalties(Number(res.data.wallet?.total_penalties) || 0);
        } else {
          setWalletStatus('unverified');
          setWalletCreditLimit(0);
          setWalletTotalPenalties(0);
        }
      });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (user?.phone) {
      setCustomerPhone((prev) => prev || (user.phone ?? ''));
    }
    if (user?.fullName) {
      setCustomerName((prev) => prev || (user.fullName ?? ''));
    }
  }, [user?.phone, user?.fullName]);

  async function handleAuthRejected(errorMessage?: string | null) {
    if (!errorMessage) return false;
    const m = errorMessage.toLowerCase();
    if (!m.includes('sign in') && !m.includes('authenticated') && !m.includes('unauthorized') && !m.includes('session')) {
      return false;
    }
    setPlacing(false);
    await useAuthStore.getState().signOut();
    router.replace('/auth/login?next=/checkout');
    return true;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-zgray">
        <div className="page-pad">
          <div className="container-z mx-auto max-w-xl flex items-center justify-center py-24">
            <HamsterLoader size="md" text="Redirecting to login..." />
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-zgray">
        <div className="page-pad">
          <div className="container-z mx-auto max-w-xl text-center py-16">
            <h1 className="text-2xl font-bold text-ztext">Your bag is empty</h1>
            <p className="text-ztext-light mt-2">Add items before checking out.</p>
            <Link href="/" className="button-z button-z-primary mt-6">View menu</Link>
          </div>
        </div>
      </div>
    );
  }

  function buildOrderParams(pm: string) {
    const effectivePhone = (customerPhone || user?.phone || '').trim();
    return {
      items,
      subtotal: subtotal(),
      deliveryFee: deliveryFee(),
      maintenanceFee: maintenanceFee(),
      packagingCharge: packagingCharge(),
      total: total(),
      paymentMethod: pm,
      address,
      notes,
      customerPhone: effectivePhone,
      customerName: customerName || user?.fullName || undefined,
      orderType: orderType ?? undefined,
      deliverySlotId: effectiveSlotId || undefined,
    };
  }

  async function validateAndPlace(pm: string) {
    setError('');
    const now = new Date();
    if (hasPendingPenalty) {
      setError(`You have an unpaid Late Fine of ₹${walletTotalPenalties.toLocaleString('en-IN')}. Please top up your wallet to clear pending dues before placing an order.`);
      return false;
    }
    if (publicSettings.isOpen === false) {
      setError('The store is currently closed. Please try again later.');
      return false;
    }
    if (isTemporarilyClosed(publicSettings.tempReopensAt, now)) {
      setError(`${temporaryCloseLabel(publicSettings.tempReopensAt)} — please try again later.`);
      return false;
    }
    if (!isStoreOpen(publicSettings.hours, now)) {
      setError(`The store is currently closed. We open at ${formatClock(publicSettings.hours.open)} — please try again later.`);
      return false;
    }
    if (isDelivery && !publicSettings.deliveryAvailable) {
      setError(publicSettings.deliveryUnavailableMessage || 'Delivery is currently unavailable');
      return false;
    }
    if (isDelivery && publicSettings.deliveryFixedSlotsEnabled) {
      if (!effectiveSlotId) {
        setError('Please select a delivery time slot');
        return false;
      }
      const chosenSlot = publicSettings.deliverySlots.find((s) => s.id === effectiveSlotId && s.is_enabled);
      if (!chosenSlot) {
        setError('The selected delivery slot is not available');
        return false;
      }
      const nowMin = getCurrentISTMinutes();
      const cutoffMin = minutesFromMidnight(chosenSlot.cutoff_time);
      if (nowMin >= cutoffMin) {
        setError(`The cutoff time (${formatClock12h(chosenSlot.cutoff_time)}) for the ${formatClock12h(chosenSlot.delivery_time)} slot has passed. Please select another slot.`);
        return false;
      }
    }
    const isOnline = pm === 'razorpay' || pm === 'phonepe' || pm === 'gpay';
    if (isOnline && !razorpayKey) {
      setError('Online payments are not configured. Please choose Wallet or Cash on Delivery.');
      return false;
    }
    if (isDelivery && !address.trim()) { setError('Please enter your delivery address'); return false; }
    const cleanPhone = (customerPhone || user?.phone || '').trim();
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      setError('Phone number must be exactly 10 digits (0-9)');
      return false;
    }
    setPlacing(true);
    return true;
  }

  async function initiateRazorpayPayment(pm: string, opts?: { method?: string; description?: string }) {
    const loaded = await loadRazorpayScript();
    if (!loaded || !razorpayKey) {
      setError('Payment could not be initiated. Please try again.');
      setPlacing(false);
      return;
    }

    const quoteRes = await validateAndQuoteOrder({ items, orderType: orderType ?? undefined });
    if (!quoteRes.success || !quoteRes.data) {
      setError(quoteRes.error || 'Failed to validate bag prices. Please refresh your cart.');
      setPlacing(false);
      return;
    }

    const authoritativeTotal = quoteRes.data.total;
    const rzpResult = await createRazorpayOrder(authoritativeTotal * 100);
    if (!rzpResult.success) {
      setError(rzpResult.error || 'Failed to initiate payment');
      setPlacing(false);
      return;
    }

    const prefillPhone = (customerPhone || user?.phone || '').trim();
    const prefillName = customerName || user?.fullName || '';

    openRazorpayCheckout({
      key: razorpayKey,
      amount: rzpResult.data.amount,
      name: 'Ethics Pay',
      description: opts?.description ?? 'Food order',
      method: opts?.method,
      orderId: rzpResult.data.id,
      prefill: { contact: prefillPhone, name: prefillName },
      onSuccess: async (rzpRes) => {
        const orderResult = await createOrder(buildOrderParams(pm));
        if (!orderResult.success) {
          if (await handleAuthRejected(orderResult.error)) return;
          setError(orderResult.error ?? 'Payment succeeded but the order could not be saved. Please contact support.');
          setPlacing(false);
          return;
        }
        await confirmPayment(orderResult.data!.orderId, {
          gatewayOrderId: rzpRes?.razorpay_order_id,
          gatewayPaymentId: rzpRes?.razorpay_payment_id,
          gatewaySignature: rzpRes?.razorpay_signature,
        });
        await sendOrderNotification(orderResult.data!.orderId, orderResult.data!.qrToken ?? null);
        clearCart();
        router.push(`/order/confirmed?orderId=${orderResult.data!.orderId}`);
      },
      onFailure: (err) => {
        setError(err);
        setPlacing(false);
      },
    });
  }

  async function placeOrder(pm: string) {
    const valid = await validateAndPlace(pm);
    if (!valid) return;

    if (pm === 'wallet') {
      const quoteRes = await validateAndQuoteOrder({ items, orderType: orderType ?? undefined });
      if (!quoteRes.success || !quoteRes.data) {
        setError(quoteRes.error || 'Failed to validate bag prices.');
        setPlacing(false);
        return;
      }

      const orderTotal = quoteRes.data.total;
      const currentBalance = walletBalance ?? 0;

      if (currentBalance - orderTotal < -walletCreditLimit) {
        if (walletCreditLimit > 0) {
          setError(`Credit limit reached (Max overdraft: ₹${walletCreditLimit}). Current balance: ₹${currentBalance.toLocaleString('en-IN')}, Order Total: ₹${orderTotal.toLocaleString('en-IN')}. Please top up your wallet.`);
        } else {
          setError(`Insufficient balance. Current balance: ₹${currentBalance.toLocaleString('en-IN')}, Order Total: ₹${orderTotal.toLocaleString('en-IN')}. Please top up your wallet or change payment method.`);
        }
        setPlacing(false);
        return;
      }

      const orderResult = await createOrder(buildOrderParams('wallet'));
      if (!orderResult.success) {
        if (await handleAuthRejected(orderResult.error)) return;
        setError(orderResult.error ?? 'Failed to place order');
        setPlacing(false);
        return;
      }

      const finalAmountToDeduct = orderResult.data!.calculatedTotal ?? orderTotal;
      const deductRes = await deductWalletBalance(finalAmountToDeduct, orderResult.data!.orderId, `Order #${orderResult.data!.trackingCode}`);
      if (!deductRes.success) {
        setError(deductRes.error || 'Failed to deduct wallet balance');
        setPlacing(false);
        return;
      }

      await confirmPayment(orderResult.data!.orderId);
      await sendOrderNotification(orderResult.data!.orderId, orderResult.data!.qrToken ?? null);
      clearCart();
      router.push(`/order/confirmed?orderId=${orderResult.data!.orderId}`);
      return;
    }

    if (pm === 'razorpay' || pm === 'phonepe' || pm === 'gpay') {
      await initiateRazorpayPayment(pm, pm === 'razorpay' ? undefined : { method: 'upi', description: `Pay via ${pm === 'phonepe' ? 'PhonePe' : 'GPay'}` });
      return;
    }

    const orderResult = await createOrder(buildOrderParams(pm));
    if (!orderResult.success) {
      if (await handleAuthRejected(orderResult.error)) return;
      setError(orderResult.error ?? 'Failed to place order');
      setPlacing(false);
      return;
    }

    await confirmPayment(orderResult.data!.orderId);
    await sendOrderNotification(orderResult.data!.orderId, orderResult.data!.qrToken ?? null);
    clearCart();
    router.push(`/order/confirmed?orderId=${orderResult.data!.orderId}`);
  }

  async function handlePlaceOrder() {
    await placeOrder(selectedMethod);
  }

  async function handleUpiPayment() {
    const pm = selectedMethod;
    const valid = await validateAndPlace(pm);
    if (!valid) return;
    await initiateRazorpayPayment(pm, { method: 'upi', description: `Pay via ${pm === 'phonepe' ? 'PhonePe' : pm === 'gpay' ? 'GPay' : 'UPI'}` });
  }

  const isDelivery = orderType === 'room_delivery';
  const hasPendingPenalty = walletBalance !== null && walletBalance < 0 && walletTotalPenalties > 0;

  function handleLocationSelect(value: string) {
    setIsCustomAddress(false);
    setAddress(value);
  }

  function handleCustomToggle() {
    setIsCustomAddress(true);
    setAddress(customAddress);
  }

  return (
    <div className="min-h-screen bg-zgray">
      <div className="page-pad">
        <div className="container-z mx-auto max-w-4xl">
          <Link href="/cart" className="inline-flex items-center gap-1 text-xs text-ztext-light hover:text-zred mb-3 transition-colors">
            <ArrowLeft size={12} /> Back to bag
          </Link>
          <h1 className="text-lg font-bold text-ztext mb-4">Checkout</h1>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 space-y-3">
              {/* Option 2: Pending Late Fine Block Banner */}
              {hasPendingPenalty && (
                <div className="bg-rose-500/10 border-2 border-rose-500/30 rounded-2xl p-4 sm:p-5 text-rose-500 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={24} className="shrink-0 mt-0.5 text-rose-500" />
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-rose-500">
                        Order Blocked: Unpaid Late Fine (₹{walletTotalPenalties.toLocaleString('en-IN')})
                      </h3>
                      <p className="text-xs text-ztext-light mt-1">
                        You have an overdue late repayment fine on your account. To place any order, please clear your outstanding dues by topping up your wallet.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/student/wallet"
                    className="w-full sm:w-auto px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shrink-0 text-center shadow-md shadow-rose-500/20 whitespace-nowrap"
                  >
                    Clear Dues / Top Up
                  </Link>
                </div>
              )}

              {/* Custom Delivery Announcement Banner */}
              {publicSettings.deliveryCustomMessageEnabled && publicSettings.deliveryCustomMessage && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5 flex items-start gap-2 text-xs text-blue-500 font-semibold">
                  <Shield size={15} className="shrink-0 mt-0.5" />
                  <p>{publicSettings.deliveryCustomMessage}</p>
                </div>
              )}

              {/* Delivery Unavailable Warning */}
              {isDelivery && !publicSettings.deliveryAvailable && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-2.5 text-xs text-red-500 font-semibold">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <p>{publicSettings.deliveryUnavailableMessage || 'Delivery is temporarily unavailable.'}</p>
                </div>
              )}

              <div className="bg-zcard rounded-xl border border-zborder p-4">
                <h2 className="font-semibold text-ztext mb-3 flex items-center gap-1.5 text-sm">
                  <Phone size={15} className="text-zred shrink-0" /> Contact info
                </h2>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1 block">Phone number <span className="text-zred">*</span></label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Enter your phone number"
                      className="input-z text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1 block flex items-center gap-1">
                      <User size={11} /> Person Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Name of the person receiving the order"
                      className="input-z text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Address Section */}
              {isDelivery ? (
                <div className="bg-zcard rounded-xl border border-zborder p-4">
                  <h2 className="font-semibold text-ztext mb-3 flex items-center gap-1.5 text-sm">
                    <MapPin size={15} className="text-zred shrink-0" /> Delivery address
                  </h2>
                  <div>
                    <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1.5 block">Delivery location</label>
                    <div className="grid grid-cols-2 gap-2">
                      {deliveryLocations.length > 0 && deliveryLocations.map((opt) => (
                        <button key={opt.value} type="button" onClick={() => handleLocationSelect(opt.value)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                            address === opt.value && !isCustomAddress ? 'border-zred bg-red-500/10' : 'border-zborder hover:border-ztext-light'
                          }`}
                        >
                          <span className="font-medium text-ztext">{opt.label}</span>
                          {address === opt.value && !isCustomAddress && <span className="float-right w-3.5 h-3.5 rounded-full bg-zred flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-zcard" /></span>}
                        </button>
                      ))}
                      <div className="w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all border-zborder opacity-50">
                        <span className="text-ztext-light font-medium text-xs">Soon available for nearby PG</span>
                      </div>
                      <button type="button" onClick={handleCustomToggle}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all col-span-2 ${
                          isCustomAddress ? 'border-zred bg-red-500/10' : 'border-zborder hover:border-ztext-light'
                        }`}
                      >
                        <span className="font-medium text-ztext">Other (write your own)</span>
                        {isCustomAddress && <span className="float-right w-3.5 h-3.5 rounded-full bg-zred flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-zcard" /></span>}
                      </button>
                      {isCustomAddress && (
                        <input
                          type="text"
                          value={customAddress}
                          onChange={(e) => { setCustomAddress(e.target.value); setAddress(e.target.value); }}
                          placeholder="Type your full address..."
                          className="input-z text-sm col-span-2"
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-zcard rounded-xl border border-zborder p-4">
                  <h2 className="font-semibold text-ztext mb-1 flex items-center gap-1.5 text-sm">
                    <MapPin size={15} className="text-zred shrink-0" /> Pickup
                  </h2>
                  <p className="text-xs text-ztext-light">
                    Your order will be ready for pickup at the restaurant. We will notify you when it&apos;s ready.
                  </p>
                </div>
              )}

              {/* Delivery Time Slot Section (ONLY when Fixed Delivery Slots = ON and Order Type = Home/Hostel Delivery) */}
              {isDelivery && publicSettings.deliveryFixedSlotsEnabled && publicSettings.deliveryAvailable && (
                <div className="bg-zcard rounded-xl border border-zborder p-4">
                  <h2 className="font-semibold text-ztext mb-1 flex items-center gap-1.5 text-sm">
                    <Clock size={15} className="text-zred shrink-0" /> Delivery Time Slot <span className="text-zred">*</span>
                  </h2>
                  <p className="text-xs text-ztext-light mb-3">
                    Select your batch delivery time slot. Orders must be placed before the cutoff time.
                  </p>

                  {slotData.slots.length === 0 ? (
                    <p className="text-xs text-ztext-muted bg-zgray p-3 rounded-xl">
                      No delivery slots are currently configured.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {slotData.slots.map((slot) => {
                        const nowMin = getCurrentISTMinutes();
                        const cutoffMin = minutesFromMidnight(slot.cutoff_time);
                        const isExpired = nowMin >= cutoffMin;
                        const isSelected = effectiveSlotId === slot.id;

                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={isExpired}
                            onClick={() => setSelectedSlotId(slot.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isExpired
                                ? 'border-zborder/40 bg-zgray/30 opacity-50 cursor-not-allowed'
                                : isSelected
                                ? 'border-zred bg-red-500/10 shadow-z'
                                : 'border-zborder hover:border-ztext-light hover:bg-zgray'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-ztext">
                                  {formatClock12h(slot.delivery_time)}
                                </span>
                                {slot.label && (
                                  <span className="text-[10px] font-semibold text-ztext-muted">
                                    ({slot.label})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ztext-light">
                                Order before <strong className="text-amber-500">{formatClock12h(slot.cutoff_time)}</strong>
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {isExpired ? (
                                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                                  Cutoff Passed
                                </span>
                              ) : isSelected ? (
                                <span className="w-4 h-4 rounded-full bg-zred flex items-center justify-center shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zcard" />
                                </span>
                              ) : (
                                <span className="w-4 h-4 rounded-full border border-zborder shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {slotData.isExpiredForToday && (
                        <p className="text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-center gap-1.5 mt-2">
                          <AlertCircle size={14} className="shrink-0" />
                          All delivery slots for today have passed cutoff.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <OrderTypeSelector value={orderType} onChange={(v) => { setOrderType(v); useCartStore.getState().setOrderType(v); if (!canPayOnDelivery(v) && selectedMethod === 'cod') setPaymentMethod(paymentMethods.find((p) => p.id !== 'cod')?.id ?? 'wallet'); }} />

              <div className="bg-zcard rounded-xl border border-zborder p-4">
                <h2 className="font-semibold text-ztext mb-3 flex items-center gap-1.5 text-sm">
                  <CreditCard size={15} className="text-zred shrink-0" /> Payment method
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {!methodsLoaded ? (
                    <p className="text-xs text-ztext-lighter flex items-center gap-2 py-2 col-span-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading payment options...
                    </p>
                  ) : paymentMethods.filter((pm) => pm.id !== 'cod' || canPayOnDelivery(orderType)).map((pm) => (
                    <button key={pm.id} onClick={() => setPaymentMethod(pm.id)}
                      className={`w-full text-left px-2.5 py-2.5 rounded-xl border transition-all flex items-start gap-1.5 sm:px-3.5 sm:py-2.5 sm:gap-2.5 ${
                        selectedMethod === pm.id
                          ? 'border-zred bg-red-500/10 shadow-z'
                          : 'border-zborder hover:border-ztext-light hover:bg-zgray'
                      }`}
                    >
                      <pm.icon size={16} className={`mt-0.5 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4 ${selectedMethod === pm.id ? 'text-zred' : 'text-ztext-muted'}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-ztext text-[11px] sm:text-xs">{pm.label}</p>
                        <p className="text-[9px] sm:text-[10px] text-ztext-light mt-0.5 leading-tight">{pm.desc}</p>
                      </div>
                      {selectedMethod === pm.id && (
                        <span className="ml-auto w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-zred flex items-center justify-center shrink-0 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-zcard" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {selectedMethod === 'wallet' && (
                  <div className="mt-4 pt-4 border-t border-zborder">
                    <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      walletBalance !== null && (walletBalance - total()) >= -walletCreditLimit
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      <div>
                        <p className="text-xs font-bold flex items-center gap-1.5">
                          {walletBalance !== null && (walletBalance - total()) >= -walletCreditLimit ? (
                            <>
                              <CheckCircle2 size={15} /> Ethics Pay {walletCreditLimit > 0 ? `(₹${walletCreditLimit} Overdraft Allowed)` : ''}
                            </>
                          ) : (
                            <>
                              <AlertCircle size={15} /> {walletCreditLimit > 0 ? `Credit Limit Reached (Max Overdraft ₹${walletCreditLimit})` : 'Insufficient Wallet Balance'}
                            </>
                          )}
                        </p>
                        <p className="text-[11px] mt-0.5 opacity-90">
                          {walletBalance !== null && (walletBalance - total()) >= -walletCreditLimit
                            ? 'Amount will be deducted from your wallet balance.'
                            : `Current Balance: ₹${(walletBalance ?? 0).toLocaleString('en-IN')} • Order: ₹${total().toLocaleString('en-IN')}`}
                        </p>
                      </div>
                      <Link
                        href="/dashboard/student/wallet"
                        target="_blank"
                        className="px-3 py-1.5 bg-zcard text-ztext border border-zborder rounded-lg text-xs font-bold shrink-0 hover:bg-zgray transition-colors"
                      >
                        + Top Up
                      </Link>
                    </div>
                  </div>
                )}

                {selectedMethod === 'phonepe' && (
                  <div className="mt-4 pt-4 border-t border-zborder">
                    <p className="text-xs font-semibold text-ztext mb-3">Pay using UPI Apps</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={handleUpiPayment} disabled={placing}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zborder hover:border-zred hover:bg-red-500/5 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2">
                          <Image src="/images/Phonepay.png" alt="PhonePe" width={56} height={56} className="object-contain" />
                        </div>
                        <span className="text-xs font-medium text-ztext-light group-hover:text-ztext transition-colors">PhonePe</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-ztext-lighter text-center mt-3 flex items-center justify-center gap-1">
                      <Shield size={10} /> Secure payments powered by PhonePe
                    </p>
                  </div>
                )}

                {selectedMethod === 'gpay' && (
                  <div className="mt-4 pt-4 border-t border-zborder">
                    <p className="text-xs font-semibold text-ztext mb-3">Pay using UPI Apps</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={handleUpiPayment} disabled={placing}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zborder hover:border-zred hover:bg-red-500/5 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2">
                          <Image src="/images/gpay.jpg" alt="Google Pay" width={56} height={56} className="object-contain" />
                        </div>
                        <span className="text-xs font-medium text-ztext-light group-hover:text-ztext transition-colors">Google Pay</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-ztext-lighter text-center mt-3 flex items-center justify-center gap-1">
                      <Shield size={10} /> Secure payments powered by Google Pay
                    </p>
                  </div>
                )}

                {selectedMethod === 'razorpay' && (
                  <div className="mt-4 pt-4 border-t border-zborder">
                    <p className="text-xs font-semibold text-ztext mb-3">Pay using UPI Apps</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={handleUpiPayment} disabled={placing}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zborder hover:border-zred hover:bg-red-500/5 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2">
                          <Image src="/images/Phonepay.png" alt="PhonePe" width={56} height={56} className="object-contain" />
                        </div>
                        <span className="text-xs font-medium text-ztext-light group-hover:text-ztext transition-colors">PhonePe</span>
                      </button>
                      <button type="button" onClick={handleUpiPayment} disabled={placing}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zborder hover:border-zred hover:bg-red-500/5 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2">
                          <Image src="/images/gpay.jpg" alt="Google Pay" width={56} height={56} className="object-contain" />
                        </div>
                        <span className="text-xs font-medium text-ztext-light group-hover:text-ztext transition-colors">Google Pay</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-ztext-lighter text-center mt-3 flex items-center justify-center gap-1">
                      <Shield size={10} /> Secure payments powered by Razorpay
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-zcard rounded-xl border border-zborder p-4">
                <h2 className="font-semibold text-ztext mb-2 text-sm">Delivery notes (optional)</h2>
                <textarea className="input-z h-16 resize-none text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions for the restaurant..." />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-zcard rounded-xl border border-zborder p-5 sticky top-24 shadow-z">
                <h2 className="font-bold text-ztext mb-3 flex items-center gap-2 text-sm">
                  <ShoppingBag size={15} className="text-zred" /> Order summary
                </h2>
                <p className="text-xs text-ztext-light mb-2.5">Dilipda &bull; {items.length} item{items.length > 1 ? 's' : ''}</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs pr-1">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-ztext truncate mr-2">{item.quantity}x {item.name}</span>
                      <span className="font-medium text-ztext shrink-0">₹{item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zborder mt-3 pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-ztext-light"><span>Subtotal</span><span className="font-medium text-ztext">₹{subtotal()}</span></div>
                  {orderType === 'takeaway' ? (
                    <div className="flex justify-between text-ztext-light"><span>Delivery fee</span><span className="font-medium text-zgreen">Free (Take Away)</span></div>
                  ) : (
                    <div className="flex justify-between text-ztext-light"><span>Delivery fee</span><span className="font-medium text-ztext">{deliveryFee() > 0 ? `₹${deliveryFee()}` : 'Free'}</span></div>
                  )}
                  <div className="flex justify-between text-ztext-light"><span>Maintenance fee</span><span className="font-medium text-ztext">₹{maintenanceFee()}</span></div>
                  {packagingCharge() > 0 && (
                    <div className="flex justify-between text-ztext-light"><span>Packaging charge</span><span className="font-medium text-ztext">₹{packagingCharge()}</span></div>
                  )}
                  <div className="border-t border-zborder pt-2.5 flex justify-between font-bold text-ztext text-sm"><span>Total</span><span>₹{total()}</span></div>
                </div>
                {hasPendingPenalty && (
                  <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-500 font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>Unpaid Late Fine: ₹{walletTotalPenalties.toLocaleString('en-IN')}. Please top up to order.</span>
                  </div>
                )}
                {error && <p className="text-xs mt-2 flex items-center gap-1 text-zred"><span className="w-1.5 h-1.5 rounded-full bg-zred" />{error}</p>}
                <button 
                  onClick={handlePlaceOrder} 
                  disabled={placing || hasPendingPenalty || (isDelivery && !address.trim()) || !(customerPhone || user?.phone || '').trim()} 
                  className="button-z button-z-primary w-full mt-3 h-10 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed" 
                  style={{ opacity: (hasPendingPenalty || ((isDelivery && !address.trim()) || !(customerPhone || user?.phone || '').trim())) && !placing ? 0.6 : 1 }}
                >
                  {placing ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</span>
                  ) : hasPendingPenalty ? (
                    `Fine Pending (₹${walletTotalPenalties.toLocaleString('en-IN')}) • Top Up Required`
                  ) : (
                    `Place order • ₹${total()}`
                  )}
                </button>
                <p className="text-[10px] text-ztext-lighter text-center mt-2.5">By placing this order, you agree to our Terms of Service</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
