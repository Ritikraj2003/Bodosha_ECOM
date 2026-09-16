'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { getServerSession } from '@/features/auth/actions';
import type { CartItem } from '@/features/cart/types';
import type { Order, OrderItem } from '../types';
import { notifyNewOrder } from '@/lib/notifications';
import { sendPushToUser, sendPushToAdmins } from '@/lib/push';
import { signQrToken, isQrConfigured } from '@/features/delivery/lib/security';
import { getNumericSetting, getBooleanSetting, getSetting, getPaymentMethodAvailability } from '@/lib/settings';
import { minutesOf, formatClock, temporaryCloseLabel } from '@/features/menu/lib/store-hours';

import { menuSections as fallbackMenuSections } from '@/features/menu/data';

const fallbackItemMap = new Map<string, { id: string; name: string; price: number; isAvailable?: boolean; packagingBigQty?: number; packagingSmallQty?: number }>();
for (const sec of fallbackMenuSections) {
  for (const it of sec.items) {
    fallbackItemMap.set(it.id, {
      id: it.id,
      name: it.name,
      price: it.price,
      isAvailable: it.isAvailable ?? true,
      packagingBigQty: it.packagingBigQty ?? 0,
      packagingSmallQty: it.packagingSmallQty ?? 0,
    });
  }
}

const STATIC_PRODUCT_IDS: Record<string, string> = {
  'biryani-1': '00000000-0000-0000-0000-000000000001',
  'biryani-2': '00000000-0000-0000-0000-000000000002',
  'biryani-3': '00000000-0000-0000-0000-000000000003',
  'rice-1': '00000000-0000-0000-0000-000000000004',
  'fish-1': '00000000-0000-0000-0000-000000000005',
  'fish-2': '00000000-0000-0000-0000-000000000006',
  'fish-3': '00000000-0000-0000-0000-000000000007',
  'fish-4': '00000000-0000-0000-0000-000000000008',
  'meat-1': '00000000-0000-0000-0000-000000000009',
  'meat-2': '00000000-0000-0000-0000-000000000010',
  'meat-3': '00000000-0000-0000-0000-000000000011',
  'meat-4': '00000000-0000-0000-0000-000000000012',
  'veg-1': '00000000-0000-0000-0000-000000000013',
  'veg-2': '00000000-0000-0000-0000-000000000014',
  'veg-3': '00000000-0000-0000-0000-000000000015',
  'veg-4': '00000000-0000-0000-0000-000000000016',
  'sweet-1': '00000000-0000-0000-0000-000000000017',
  'sweet-2': '00000000-0000-0000-0000-000000000018',
  'sweet-3': '00000000-0000-0000-0000-000000000019',
  'thali-chicken': '00000000-0000-0000-0000-000000000020',
  'thali-pork': '00000000-0000-0000-0000-000000000026',
  'thali-veg': '00000000-0000-0000-0000-000000000021',
  'gravy-chicken': '00000000-0000-0000-0000-000000000024',
  'gravy-pork': '00000000-0000-0000-0000-000000000025',
  'featured-1': '00000000-0000-0000-0000-000000000020',
  'featured-2': '00000000-0000-0000-0000-000000000021',
  'featured-3': '00000000-0000-0000-0000-000000000024',
  'featured-4': '00000000-0000-0000-0000-000000000025',
  'featured-5': '00000000-0000-0000-0000-000000000026',
  'offer-1': '00000000-0000-0000-0000-000000000020',
  'offer-2': '00000000-0000-0000-0000-000000000021',
  'offer-3': '00000000-0000-0000-0000-000000000024',
  'offer-4': '00000000-0000-0000-0000-000000000025',
  'offer-5': '00000000-0000-0000-0000-000000000026',
};

interface ResolvedLineItem {
  product_id: string | null;
  product_name: string;
  product_price: number;
  unit_price: number;
  quantity: number;
  subtotal: number;
  packaging_big_qty?: number;
  packaging_small_qty?: number;
  special_instructions?: string;
}

export async function resolveAuthoritativeLineItems(
  items: CartItem[]
): Promise<{ success: true; lineItems: ResolvedLineItem[]; subtotal: number; priceChanged: boolean } | { success: false; error: string }> {
  if (!items || items.length === 0) {
    return { success: false, error: 'Cannot place order with an empty bag' };
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return { success: false, error: 'Database service unavailable' };
  }

  // Collect candidate IDs to query DB
  const dbIdsToQuery: string[] = [];
  const rawIdToDbIdMap = new Map<string, string>();

  for (const item of items) {
    const mappedUuid = STATIC_PRODUCT_IDS[item.id] ?? item.id;
    rawIdToDbIdMap.set(item.id, mappedUuid);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mappedUuid);
    if (isUuid) {
      dbIdsToQuery.push(mappedUuid);
    }
  }

  // Fetch current authoritative product records from DB
  const dbProductMap = new Map<string, { id: string; name: string; price: number; is_active: boolean; is_available: boolean; deleted_at: string | null; packaging_big_qty: number; packaging_small_qty: number }>();

  if (dbIdsToQuery.length > 0) {
    let dbProducts: Array<{ id: string; name: string; price: number; is_active: boolean; is_available: boolean; deleted_at: string | null; packaging_big_qty?: number; packaging_small_qty?: number }> | null = null;
    const { data, error: prodErr } = await supabase
      .from('products')
      .select('id, name, price, is_active, is_available, deleted_at, packaging_big_qty, packaging_small_qty')
      .in('id', dbIdsToQuery);

    if (prodErr && String(prodErr.message).toLowerCase().includes('column')) {
      const fallbackRes = await supabase
        .from('products')
        .select('id, name, price, is_active, is_available, deleted_at')
        .in('id', dbIdsToQuery);
      dbProducts = fallbackRes.data;
    } else {
      dbProducts = data;
    }

    if (dbProducts) {
      for (const p of dbProducts) {
        dbProductMap.set(p.id, {
          id: p.id,
          name: p.name,
          price: Number(p.price),
          is_active: Boolean(p.is_active),
          is_available: p.is_available ?? true,
          deleted_at: p.deleted_at ?? null,
          packaging_big_qty: p.packaging_big_qty != null ? Number(p.packaging_big_qty) : 0,
          packaging_small_qty: p.packaging_small_qty != null ? Number(p.packaging_small_qty) : 0,
        });
      }
    }
  }

  const lineItems: ResolvedLineItem[] = [];
  let calculatedSubtotal = 0;
  let priceChanged = false;

  for (const item of items) {
    const resolvedDbId = rawIdToDbIdMap.get(item.id) ?? item.id;
    const dbProd = dbProductMap.get(resolvedDbId) || dbProductMap.get(item.id);
    const fallbackProd = fallbackItemMap.get(item.id);

    let authoritativePrice: number;
    let productName: string;
    let resolvedProductId: string | null = null;
    let packagingBigQty = 0;
    let packagingSmallQty = 0;

    if (dbProd) {
      if (!dbProd.is_active || dbProd.deleted_at) {
        return { success: false, error: `"${dbProd.name}" is no longer available on the menu.` };
      }
      if (!dbProd.is_available) {
        return { success: false, error: `"${dbProd.name}" is currently sold out.` };
      }
      authoritativePrice = dbProd.price;
      productName = dbProd.name;
      resolvedProductId = dbProd.id;
      packagingBigQty = dbProd.packaging_big_qty ?? 0;
      packagingSmallQty = dbProd.packaging_small_qty ?? 0;
    } else if (fallbackProd) {
      if (fallbackProd.isAvailable === false) {
        return { success: false, error: `"${fallbackProd.name}" is currently sold out.` };
      }
      authoritativePrice = fallbackProd.price;
      productName = fallbackProd.name;
      resolvedProductId = null;
      packagingBigQty = fallbackProd.packagingBigQty ?? 0;
      packagingSmallQty = fallbackProd.packagingSmallQty ?? 0;
    } else {
      return { success: false, error: `Product "${item.name || item.id}" was not found on the menu.` };
    }

    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (Math.abs(Number(item.price) - authoritativePrice) > 0.01) {
      priceChanged = true;
    }

    const itemSubtotal = authoritativePrice * qty;
    calculatedSubtotal += itemSubtotal;

    lineItems.push({
      product_id: resolvedProductId,
      product_name: productName,
      product_price: authoritativePrice,
      unit_price: authoritativePrice,
      quantity: qty,
      subtotal: itemSubtotal,
      packaging_big_qty: packagingBigQty,
      packaging_small_qty: packagingSmallQty,
      special_instructions: undefined,
    });
  }

  return {
    success: true,
    lineItems,
    subtotal: calculatedSubtotal,
    priceChanged,
  };
}

export async function validateAndQuoteOrder(input: {
  items: CartItem[];
  orderType?: string;
}): Promise<{
  success: boolean;
  error?: string;
  data?: {
    lineItems: ResolvedLineItem[];
    subtotal: number;
    deliveryFee: number;
    maintenanceFee: number;
    packagingCharge: number;
    total: number;
    priceChanged: boolean;
  };
}> {
  const { items, orderType } = input;
  const resolution = await resolveAuthoritativeLineItems(items);
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  const isTakeaway = orderType === 'takeaway' || orderType === 'dine_in' || orderType === 'in_store';
  const deliveryFeeSetting = await getNumericSetting('delivery_fee', 20);
  const maintenanceFeeSetting = await getNumericSetting('maintenance_fee', 1);
  const packagingChargeEnabled = (await getSetting('packaging_charge_enabled')) !== 'false';
  const packagingBigPacketPrice = await getNumericSetting('packaging_big_packet_price', 3);
  const packagingSmallPacketPrice = await getNumericSetting('packaging_small_packet_price', 2);

  const calculatedPackagingCharge = resolution.lineItems.reduce((sum, li) => {
    const bigQty = li.packaging_big_qty ?? 0;
    const smallQty = li.packaging_small_qty ?? 0;
    const perUnit = (bigQty * packagingBigPacketPrice) + (smallQty * packagingSmallPacketPrice);
    return sum + (perUnit * li.quantity);
  }, 0);

  const deliveryFee = isTakeaway ? 0 : deliveryFeeSetting;
  const maintenanceFee = maintenanceFeeSetting;
  const packagingCharge = packagingChargeEnabled ? calculatedPackagingCharge : 0;
  const total = resolution.subtotal + deliveryFee + maintenanceFee + packagingCharge;

  return {
    success: true,
    data: {
      lineItems: resolution.lineItems,
      subtotal: resolution.subtotal,
      deliveryFee,
      maintenanceFee,
      packagingCharge,
      total,
      priceChanged: resolution.priceChanged,
    },
  };
}

interface CreateOrderParams {
  items: CartItem[];
  subtotal?: number;
  deliveryFee?: number;
  maintenanceFee?: number;
  packagingCharge?: number;
  total?: number;
  paymentMethod: string;
  address: string;
  city?: string;
  pincode?: string;
  notes?: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  orderType?: string;
  deliverySlotId?: string;
}

export async function createOrder(params: CreateOrderParams) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Please sign in to place your order' };

  // Option 2 Enforcement: Check if user has an unpaid late fine
  const { data: userWallet } = await supabase
    .from('wallets')
    .select('balance, total_penalties')
    .eq('user_id', user.id)
    .maybeSingle();

  if (userWallet && Number(userWallet.balance) < 0 && Number(userWallet.total_penalties) > 0) {
    return {
      success: false,
      error: `You have an unpaid Late Repayment Fine of ₹${Number(userWallet.total_penalties).toLocaleString('en-IN')}. Please top up your wallet to clear pending dues before placing an order.`,
    };
  }

  const maintenanceMode = await getBooleanSetting('maintenance_mode', false);
  if (maintenanceMode) {
    return { success: false, error: 'The store is currently in maintenance mode. Please try again later.' };
  }

  // Store hours are compared in IST (UTC+5:30)
  const istNow = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const openTime = (await getSetting('store_hours_open')) || '10:00';
  const closeTime = (await getSetting('store_hours_close')) || '21:30';
  const istMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  const tempReopensAt = (await getSetting('store_temp_close_until')) || '';
  if (tempReopensAt && istMinutes < minutesOf(tempReopensAt)) {
    return {
      success: false,
      error: `${temporaryCloseLabel(tempReopensAt)} — please try again later.`,
    };
  }

  if (istMinutes < minutesOf(openTime) || istMinutes >= minutesOf(closeTime)) {
    return {
      success: false,
      error: `The store is currently closed. We open at ${formatClock(openTime)} — please try again later.`,
    };
  }

  let restaurantId: string;
  try {
    const res = await fetch(`${url}/rest/v1/restaurants?select=id,is_open&deleted_at=is.null&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) return { success: false, error: 'Restaurant not available' };
    const rows = await res.json();
    if (rows && rows.length > 0) {
      if (rows[0].is_open === false) {
        return { success: false, error: 'The store is currently closed. Please try again later.' };
      }
      restaurantId = rows[0].id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('restaurants')
        .insert({
          owner_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
          name: 'Dilip Da Main',
          slug: `dilip-da-main-${Date.now().toString(36)}`,
          address_line1: 'Near CIT Kokrajhar',
          city: 'Kokrajhar',
          state: 'Assam',
          postal_code: '783370',
          opening_time: '08:00',
          closing_time: '22:00',
          delivery_fee: 20,
          min_order_amount: 50,
          is_active: true,
          is_open: true,
          status: 'active',
        })
        .select('id')
        .maybeSingle();
      if (createErr || !created?.id) {
        console.error('Failed to create default restaurant:', createErr);
        return { success: false, error: 'Restaurant not available' };
      }
      restaurantId = created.id;
    }
  } catch {
    return { success: false, error: 'Restaurant not available' };
  }

  const { items, paymentMethod, address, notes, customerPhone, customerName, customerEmail, orderType } = params;

  if (!customerPhone || !/^[0-9]{10}$/.test(customerPhone)) {
    return { success: false, error: 'Phone number must be exactly 10 digits' };
  }

  if (paymentMethod === 'cod' && orderType && orderType !== 'room_delivery') {
    return { success: false, error: 'Pay on Delivery is only available for Hostel Delivery orders' };
  }

  // Calculate authoritative prices & line items strictly from DB
  const priceResolution = await resolveAuthoritativeLineItems(items);
  if (!priceResolution.success) {
    return { success: false, error: priceResolution.error };
  }

  const isTakeaway = orderType === 'takeaway' || orderType === 'dine_in' || orderType === 'in_store';
  const deliveryFeeSetting = await getNumericSetting('delivery_fee', 20);
  const maintenanceFeeSetting = await getNumericSetting('maintenance_fee', 1);
  const packagingChargeEnabled = (await getSetting('packaging_charge_enabled')) !== 'false';
  const packagingBigPacketPrice = await getNumericSetting('packaging_big_packet_price', 3);
  const packagingSmallPacketPrice = await getNumericSetting('packaging_small_packet_price', 2);

  const calculatedPackagingCharge = priceResolution.lineItems.reduce((sum, li) => {
    const bigQty = li.packaging_big_qty ?? 0;
    const smallQty = li.packaging_small_qty ?? 0;
    const perUnit = (bigQty * packagingBigPacketPrice) + (smallQty * packagingSmallPacketPrice);
    return sum + (perUnit * li.quantity);
  }, 0);

  const calculatedSubtotal = priceResolution.subtotal;
  const effectiveDeliveryFee = isTakeaway ? 0 : deliveryFeeSetting;
  const effectiveMaintenanceFee = maintenanceFeeSetting;
  const effectivePackagingCharge = packagingChargeEnabled ? calculatedPackagingCharge : 0;
  const effectiveTotal = calculatedSubtotal + effectiveDeliveryFee + effectiveMaintenanceFee + effectivePackagingCharge;

  const availability = await getPaymentMethodAvailability();
  const avail = availability.find((a) => a.id === paymentMethod);
  const isOnline = ['razorpay', 'phonepe', 'gpay'].includes(paymentMethod);
  if (!avail || !avail.enabled || (isOnline && !avail.configured)) {
    return { success: false, error: 'This payment method is currently unavailable. Please choose another.' };
  }

  const paymentMethodDb =
    paymentMethod === 'bnpl' ? 'bnpl'
    : paymentMethod === 'cod' ? 'cod'
    : paymentMethod === 'wallet' ? 'wallet'
    : paymentMethod === 'phonepe' || paymentMethod === 'gpay' ? 'upi'
    : 'razorpay';

  const isDeliveryOrder = !orderType || orderType === 'room_delivery';
  let slotPayload: Record<string, string | null> = {
    delivery_slot_id: null,
    delivery_slot_label: null,
    delivery_slot_time: null,
    delivery_slot_date: null,
    delivery_slot_cutoff: null,
  };

  if (isDeliveryOrder) {
    const deliveryAvailable = (await getSetting('delivery_available')) !== 'false';
    if (!deliveryAvailable) {
      const msg =
        (await getSetting('delivery_unavailable_message')) ||
        'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.';
      return { success: false, error: msg };
    }

    const fixedSlotsEnabled = (await getSetting('delivery_fixed_slots_enabled')) === 'true';
    if (fixedSlotsEnabled) {
      const { getJsonSetting } = await import('@/lib/settings');
      const { validateDeliverySlotServer, getCurrentISTDateString } = await import('@/features/delivery/lib/slots');
      const slots = await getJsonSetting<import('@/features/delivery/types/slots').DeliverySlot[]>('delivery_slots', []);
      const slotValidation = validateDeliverySlotServer(slots, params.deliverySlotId || '');

      if (!slotValidation.valid || !slotValidation.slot) {
        return {
          success: false,
          error: slotValidation.error || 'Please select a valid, unexpired delivery slot',
        };
      }

      const s = slotValidation.slot;
      slotPayload = {
        delivery_slot_id: s.id,
        delivery_slot_label: s.label,
        delivery_slot_time: s.delivery_time,
        delivery_slot_date: getCurrentISTDateString(),
        delivery_slot_cutoff: s.cutoff_time,
      };
    }
  }

  const orderPayload = {
    user_id: user?.id ?? null,
    restaurant_id: restaurantId,
    status: 'pending',
    payment_status: 'pending',
    payment_method: paymentMethodDb,
    subtotal: calculatedSubtotal,
    delivery_fee: effectiveDeliveryFee,
    tax_amount: effectiveMaintenanceFee + effectivePackagingCharge,
    discount_amount: 0,
    total: effectiveTotal,
    customer_name: customerName || user?.fullName || null,
    customer_email: customerEmail || user?.email || null,
    customer_phone: customerPhone || null,
    delivery_address: orderType === 'room_delivery' || !orderType
      ? { address, city: params.city ?? '', pincode: params.pincode ?? '' }
      : { address: 'Take away from restaurant' },
    delivery_notes: notes ?? null,
    order_type: orderType ?? null,
    ...slotPayload,
  };

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('id, tracking_code')
    .single();

  if (orderError || !order) {
    return { success: false, error: orderError?.message || 'Failed to create order' };
  }

  const orderItemsToInsert = priceResolution.lineItems.map((li) => ({
    order_id: order.id,
    product_id: li.product_id ?? null,
    product_name: li.product_name,
    product_price: li.product_price,
    unit_price: li.unit_price,
    quantity: li.quantity,
    subtotal: li.subtotal,
    special_instructions: li.special_instructions ?? null,
  }));

  let { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);

  // If FK fails due to any stale/static product_id, retry once with product_id set to null
  if (itemsError && String(itemsError.message || '').toLowerCase().includes('foreign key')) {
    const fallbackItems = orderItemsToInsert.map((it) => ({ ...it, product_id: null }));
    const retry = await supabase.from('order_items').insert(fallbackItems);
    itemsError = retry.error;
  }

  if (itemsError) {
    console.error('Failed to save order items:', itemsError);
    await supabase.from('orders').delete().eq('id', order.id);
    return { success: false, error: 'Failed to save order items' };
  }

  // QR token is strictly for delivery orders (room_delivery). Takeaway and dine-in must NEVER generate delivery QR.
  let qrToken: string | null = null;
  if (isDeliveryOrder) {
    try {
      if (isQrConfigured()) {
        const qrExpiryMinutes = await getNumericSetting('telegram_qr_expiry_minutes', 30);
        qrToken = signQrToken(order.tracking_code, qrExpiryMinutes);
        await supabase
          .from('orders')
          .update({ pickup_qr_token: qrToken })
          .eq('id', order.id);
      }
    } catch {}
  }

  return {
    success: true,
    data: {
      orderId: order.id,
      trackingCode: order.tracking_code,
      qrToken,
      calculatedTotal: effectiveTotal,
    },
  };
}

export async function sendOrderNotification(orderId: string, qrTokenOverride?: string | null) {
  const supabase = createServiceClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (!data) return;

  const items = (data.order_items ?? []).map((i: { product_name: string; quantity: number; subtotal: number }) => ({
    name: i.product_name,
    quantity: i.quantity,
    price: Math.round(i.subtotal / i.quantity),
  }));

  const address = (data.delivery_address as Record<string, string> | null)?.address ?? '';
  const isDelivery = !data.order_type || data.order_type === 'room_delivery';
  const effectiveQr = isDelivery ? (qrTokenOverride ?? data.pickup_qr_token ?? null) : null;

  await notifyNewOrder({
    id: data.id,
    trackingCode: data.tracking_code,
    items,
    total: data.total,
    paymentMethod: data.payment_method ?? 'cod',
    address,
    customerName: data.customer_name,
    customerPhone: data.customer_phone,
    orderType: data.order_type,
  }, data.status, effectiveQr);

  // Dispatch Native Web Push to student's registered devices
  if (data.user_id) {
    sendPushToUser(data.user_id, {
      title: 'Order Placed! 🍽️',
      body: `Your order #${data.tracking_code} (₹${data.total}) has been placed and is waiting for confirmation.`,
      url: `/orders/${data.id}`,
      tag: `order-${data.id}`,
    }).catch((err) => console.error('Error sending order placed push:', err));
  }

  // Dispatch Native Web Push to all Admins & Owner
  const itemCount = items.reduce((sum: number, it: { quantity: number }) => sum + (Number(it.quantity) || 1), 0);
  sendPushToAdmins({
    title: `🚨 New Order #${data.tracking_code} Received!`,
    body: `${data.customer_name || 'A customer'} placed an order for ₹${data.total} (${itemCount} item${itemCount > 1 ? 's' : ''}). Click to view.`,
    url: `/dashboard/admin/orders`,
    tag: `admin-new-order-${data.id}`,
  }).catch((err) => console.error('Error sending admin order push:', err));
}

export async function getOrderTrackingByCode(trackingCode: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Please sign in to track your order' };

  const code = (trackingCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(code)) {
    return { success: false, error: 'Enter a valid tracking code' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tracking_code', code)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!order) return { success: false, error: 'No order found with this tracking code' };

  const isDelivery = !order.order_type || order.order_type === 'room_delivery';

  // For takeaway, dine-in, and in-store, delivery assignments and partners must never be shown
  let assignment = null;
  let partner = null;

  if (isDelivery) {
    const { data: assignmentData } = await supabase
      .from('delivery_assignments')
      .select('*')
      .eq('order_id', order.id)
      .maybeSingle();

    const { data: partnerData } = order.delivery_partner_id
      ? await supabase.from('profiles').select('full_name, phone').eq('id', order.delivery_partner_id).maybeSingle()
      : { data: null };

    assignment = assignmentData
      ? {
          status: assignmentData.status,
          otpValue: assignmentData.otp_value ?? null,
          otpExpiresAt: assignmentData.otp_expires_at ?? null,
          otpVerifiedAt: assignmentData.otp_verified_at ?? null,
        }
      : null;

    partner = partnerData ? { fullName: partnerData.full_name ?? null, phone: partnerData.phone ?? null } : null;
  }

  return {
    success: true,
    data: {
      order: order as Order & { order_items?: OrderItem[] },
      assignment,
      partner,
    },
  };
}

export async function confirmPayment(
  orderId: string,
  gatewayInfo?: {
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySignature?: string;
  }
) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'confirmed' })
    .eq('id', orderId);

  if (error) return { success: false, error: 'Failed to confirm payment' };

  await recordPayment(orderId, gatewayInfo);
  return { success: true };
}

async function recordPayment(
  orderId: string,
  gatewayInfo?: {
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySignature?: string;
  }
) {
  const supabase = createServiceClient();
  if (!supabase) return;

  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, total, payment_method')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (gatewayInfo?.gatewayPaymentId || gatewayInfo?.gatewayOrderId) {
      await supabase.from('payments').update({
        gateway_payment_id: gatewayInfo.gatewayPaymentId ?? null,
        gateway_order_id: gatewayInfo.gatewayOrderId ?? null,
        gateway_signature: gatewayInfo.gatewaySignature ?? null,
      }).eq('id', existing.id);
    }
    return;
  }

  const method = order.payment_method ?? 'razorpay';
  const gateway =
    method === 'bnpl' ? 'bnpl'
    : method === 'cod' ? 'manual'
    : method === 'wallet' ? 'wallet'
    : method === 'upi' ? 'upi'
    : 'razorpay';

  await supabase.from('payments').insert({
    order_id: order.id,
    user_id: order.user_id ?? null,
    amount: order.total,
    currency: 'INR',
    payment_method: method,
    gateway,
    gateway_order_id: gatewayInfo?.gatewayOrderId ?? null,
    gateway_payment_id: gatewayInfo?.gatewayPaymentId ?? null,
    gateway_signature: gatewayInfo?.gatewaySignature ?? null,
    status: 'confirmed',
  });
}

export async function failPayment(orderId: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'failed' })
    .eq('id', orderId);

  if (error) return { success: false, error: 'Failed to update payment status' };
  return { success: true };
}

export async function cancelUnpaidOrder(orderId: string, reason = 'Payment not completed') {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq('id', orderId)
    .eq('status', 'pending');

  if (error) return { success: false, error: 'Failed to cancel order' };
  return { success: true };
}

export async function getUserOrders(page = 1, pageSize = 10) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return { success: false, error: 'Failed to fetch orders' };

  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return {
    success: true,
    data: {
      orders: data as unknown as Order[],
      total: count ?? 0,
      page,
      totalPages,
    },
  };
}

/**
 * Process automatic refund for an order if and ONLY if it was paid via Wallet or Razorpay/UPI.
 * Cash on Delivery (COD) and unpaid orders are strictly excluded from refunds.
 */
export async function processOrderRefundIfEligible(order: {
  id: string;
  user_id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  total: number;
  tracking_code: string;
}, reason = 'Order cancelled'): Promise<{ refunded: boolean; method: string | null }> {
  if (!order || order.payment_status !== 'confirmed') {
    return { refunded: false, method: order?.payment_method ?? null };
  }

  // Strictly ignore COD - COD NEVER issues refunds
  if (order.payment_method === 'cod') {
    return { refunded: false, method: 'cod' };
  }

  const supabase = createServiceClient();
  if (!supabase) return { refunded: false, method: null };

  let refunded = false;

  // 1. Wallet Refund: ONLY if paid via Wallet
  if (order.payment_method === 'wallet' && order.user_id) {
    try {
      const { refundWalletOrder } = await import('@/features/wallet/actions');
      await refundWalletOrder(
        order.user_id,
        Number(order.total) || 0,
        order.tracking_code,
        reason
      );
      refunded = true;
    } catch (err) {
      console.error('Wallet automatic refund error:', err);
    }
  }

  // 2. Razorpay / Online UPI Refund: ONLY if paid via Razorpay/UPI
  if (order.payment_method === 'razorpay' || order.payment_method === 'upi') {
    try {
      const { refundRazorpayPayment } = await import('@/features/payments/actions');
      const { data: payment } = await supabase
        .from('payments')
        .select('id, gateway_payment_id')
        .eq('order_id', order.id)
        .maybeSingle();

      if (payment?.gateway_payment_id) {
        await refundRazorpayPayment(
          payment.gateway_payment_id,
          Number(order.total) || 0,
          {
            order_id: order.id,
            tracking_code: order.tracking_code,
            reason,
          }
        );
        refunded = true;
      }
    } catch (err) {
      console.error('Razorpay automatic refund error:', err);
    }
  }

  // 3. Update payment record in database
  try {
    await supabase
      .from('payments')
      .update({
        status: 'refunded',
        refund_amount: Number(order.total) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', order.id);
  } catch (pErr) {
    console.error('Error updating payment status to refunded:', pErr);
  }

  return { refunded, method: order.payment_method ?? null };
}

export async function cancelUserOrder(orderId: string, reason: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, user_id, status, status_history, created_at, payment_method, payment_status, total, tracking_code')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchError || !order) return { success: false, error: 'Order not found' };
  if (order.user_id !== user.id) return { success: false, error: 'Unauthorized' };
  if (order.status !== 'pending' && order.status !== 'accepted') return { success: false, error: 'Order can no longer be cancelled' };

  const elapsed = Date.now() - new Date(order.created_at).getTime();
  const cancellationWindowMinutes = await getNumericSetting('cancellation_window_minutes', 2);
  const cancellationWindowMs = cancellationWindowMinutes * 60_000;
  if (elapsed > cancellationWindowMs) {
    return { success: false, error: `Cancellation window has expired (${cancellationWindowMinutes} minute${cancellationWindowMinutes === 1 ? '' : 's'})` };
  }

  const historyEntry = { status: 'cancelled', timestamp: new Date().toISOString(), note: reason || 'Cancelled by customer' };
  const existingHistory = (order.status_history ?? []) as Array<Record<string, unknown>>;
  const statusHistory = [...existingHistory, historyEntry];

  // Process refund: ONLY for confirmed Wallet or Razorpay/UPI payments; COD never refunds
  const isCod = order.payment_method === 'cod';
  let newPaymentStatus = isCod ? 'failed' : order.payment_status;

  if (order.payment_status === 'confirmed' && !isCod) {
    const refundResult = await processOrderRefundIfEligible(order, reason || 'Cancelled by customer');
    if (refundResult.refunded) {
      newPaymentStatus = 'refunded';
    }
  }

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      payment_status: newPaymentStatus,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || 'Cancelled by customer',
      status_history: statusHistory,
    })
    .eq('id', orderId);

  if (error) return { success: false, error: 'Failed to cancel order' };
  return { success: true, refunded: !isCod && order.payment_status === 'confirmed' };
}

export async function getUserOrder(orderId: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return { success: false, error: 'Order not found' };
  if (data.user_id !== user.id) return { success: false, error: 'Unauthorized' };

  return { success: true, data: data as unknown as Order };
}
