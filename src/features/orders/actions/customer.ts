'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { getServerSession } from '@/features/auth/actions';
import { query } from '@/infrastructure/db';
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
    try {
      const { query } = await import('@/infrastructure/db');
      const prodRes = await query<any>(
        `SELECT id, name, price, is_active, is_available, deleted_at, packaging_big_qty, packaging_small_qty
         FROM public.products
         WHERE id = ANY($1::uuid[])`,
        [dbIdsToQuery]
      );
      dbProducts = prodRes.rows;
    } catch {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, is_active, is_available, deleted_at, packaging_big_qty, packaging_small_qty')
        .in('id', dbIdsToQuery);
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
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Please sign in to place your order' };

  // Option 2 Enforcement: Check if user has an unpaid late fine
  let userWallet: { balance: number; total_penalties: number } | null = null;
  try {
    const walletRes = await query<any>(
      `SELECT balance, total_penalties FROM public.wallets WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    if (walletRes.rows.length > 0) userWallet = walletRes.rows[0];
  } catch {}

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
    // Query restaurant directly via PostgreSQL (no Supabase credentials needed)
    const restRes = await query<any>(
      `SELECT id, is_open FROM public.restaurants WHERE deleted_at IS NULL ORDER BY is_active DESC, created_at ASC LIMIT 1`
    );
    if (restRes.rows.length > 0) {
      if (restRes.rows[0].is_open === false) {
        return { success: false, error: 'The store is currently closed. Please try again later.' };
      }
      restaurantId = restRes.rows[0].id;
    } else {
      // Create default restaurant if none exists
      const slug = `dilip-da-main-${Date.now().toString(36)}`;
      const ownerId = user?.id ?? '5c262804-b3d8-4815-a41f-2ce1cab12fa1';
      const newRest = await query<any>(
        `INSERT INTO public.restaurants (
          id, owner_id, name, slug, address_line1, city, state, postal_code, is_active, is_open
        ) VALUES (
          'd1111111-1111-1111-1111-111111111111', $1, 'Dilip Da Main Store', $2,
          'Near CIT Kokrajhar Campus', 'Kokrajhar', 'Assam', '783370', true, true
        )
        ON CONFLICT (id) DO UPDATE SET is_active = true, is_open = true, deleted_at = NULL
        RETURNING id`,
        [ownerId, slug]
      );
      if (!newRest.rows[0]?.id) {
        return { success: false, error: 'Restaurant not available' };
      }
      restaurantId = newRest.rows[0].id;
    }
  } catch (restErr) {
    console.error('Restaurant lookup failed:', restErr);
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

  const deliveryAddressJson = orderType === 'room_delivery' || !orderType
    ? { address, city: params.city ?? '', pincode: params.pincode ?? '' }
    : { address: 'Take away from restaurant' };

  const trackingCode = `DD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Insert order via PostgreSQL directly
  let order: { id: string; tracking_code: string };
  try {
    const orderInsert = await query<any>(`
      INSERT INTO public.orders (
        user_id, restaurant_id, tracking_code, status, order_type,
        subtotal, tax_amount, delivery_fee, discount_amount, total_amount, total,
        delivery_address, delivery_address_json, delivery_notes, special_instructions,
        customer_name, customer_phone, customer_email,
        payment_method, payment_status,
        placed_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'placed', $4,
        $5, $6, $7, $8, $9, $9,
        $10, $10, $11, $11,
        $12, $13, $14,
        $15, 'pending',
        NOW(), NOW(), NOW()
      )
      RETURNING id, tracking_code
    `, [
      user?.id ?? null,
      restaurantId,
      trackingCode,
      orderType ?? null,
      calculatedSubtotal,
      effectiveMaintenanceFee + effectivePackagingCharge,
      effectiveDeliveryFee,
      0, // discount_amount
      effectiveTotal,
      JSON.stringify(deliveryAddressJson),
      notes ?? null,
      customerName || user?.fullName || null,
      customerPhone || null,
      customerEmail || user?.email || null,
      paymentMethodDb,
    ]);
    if (!orderInsert.rows[0]) {
      return { success: false, error: 'Failed to create order' };
    }
    order = orderInsert.rows[0];
  } catch (orderErr: any) {
    console.error('Order insert failed:', orderErr);
    return { success: false, error: orderErr?.message || 'Failed to create order' };
  }

  // Insert order items
  for (const li of priceResolution.lineItems) {
    try {
      await query(`
        INSERT INTO public.order_items (
          order_id, product_id, product_name, product_price, unit_price, quantity,
          subtotal, item_total, notes, special_instructions, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8, NOW())
      `, [
        order.id,
        li.product_id || null,
        li.product_name,
        li.product_price,
        li.unit_price,
        li.quantity,
        li.subtotal,
        li.special_instructions || null,
      ]);
    } catch (itemErr: any) {
      // retry without product_id if FK violation
      if (String(itemErr?.message || '').toLowerCase().includes('foreign key')) {
        await query(`
          INSERT INTO public.order_items (
            order_id, product_id, product_name, product_price, unit_price, quantity,
            subtotal, item_total, notes, special_instructions, created_at
          ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $6, $7, $7, NOW())
        `, [
          order.id,
          li.product_name,
          li.product_price,
          li.unit_price,
          li.quantity,
          li.subtotal,
          li.special_instructions || null,
        ]);
      } else {
        console.error('Failed to insert order item:', itemErr);
      }
    }
  }

  // QR token is strictly for delivery orders (room_delivery). Takeaway and dine-in must NEVER generate delivery QR.
  let qrToken: string | null = null;
  if (isDeliveryOrder) {
    try {
      if (isQrConfigured()) {
        const qrExpiryMinutes = await getNumericSetting('telegram_qr_expiry_minutes', 30);
        qrToken = signQrToken(order.tracking_code, qrExpiryMinutes);
        try {
          await query(
            `UPDATE public.orders SET pickup_qr_token = $1 WHERE id = $2`,
            [qrToken, order.id]
          );
        } catch {}
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
  try {
    const { user } = await getServerSession();

    const code = (trackingCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(code)) {
      return { success: false, error: 'Enter a valid tracking code' };
    }

    const orderRes = await query<any>(`
      SELECT 
        o.*,
        COALESCE(o.total, o.total_amount, 0) AS total,
        COALESCE(o.subtotal, 0) AS subtotal,
        COALESCE(o.delivery_fee, 0) AS delivery_fee,
        COALESCE(o.tax_amount, 0) AS tax_amount,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'order_id', oi.order_id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'product_price', COALESCE(oi.product_price, oi.unit_price, 0),
              'quantity', oi.quantity,
              'unit_price', COALESCE(oi.unit_price, oi.product_price, 0),
              'subtotal', COALESCE(oi.subtotal, oi.item_total, 0),
              'special_instructions', oi.special_instructions,
              'created_at', oi.created_at
            ))
            FROM public.order_items oi
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS order_items
      FROM public.orders o
      WHERE UPPER(o.tracking_code) = $1
      LIMIT 1;
    `, [code]);

    const row = orderRes.rows[0];
    if (!row) return { success: false, error: 'No order found with this tracking code' };

    if (user) {
      const isStaffOrAdmin = user.role ? ['admin', 'superadmin', 'manager', 'staff', 'delivery'].includes(user.role) : false;
      const isOwner = row.user_id === user.id || row.customer_email === user.email || row.customer_phone === user.phone;
      if (!isStaffOrAdmin && !isOwner) {
        return { success: false, error: 'Unauthorized to view this order' };
      }
    }

    const order = {
      ...row,
      subtotal: Number(row.subtotal) || 0,
      delivery_fee: Number(row.delivery_fee) || 0,
      tax_amount: Number(row.tax_amount) || 0,
      total: Number(row.total) || 0,
      delivery_address: row.delivery_address || row.delivery_address_json || null,
      order_items: (row.order_items || []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        product_price: Number(item.product_price) || 0,
        subtotal: Number(item.subtotal) || 0,
      })),
    };

    const isDelivery = !order.order_type || order.order_type === 'room_delivery';
    let assignment = null;
    let partner = null;

    if (isDelivery) {
      const assignRes = await query<any>(
        `SELECT * FROM public.delivery_assignments WHERE order_id = $1 LIMIT 1`,
        [order.id]
      );
      const assignmentData = assignRes.rows[0];

      let partnerData = null;
      if (order.delivery_partner_id) {
        const partRes = await query<{ full_name: string | null; phone: string | null }>(
          `SELECT full_name, phone FROM public.users WHERE id = $1 LIMIT 1`,
          [order.delivery_partner_id]
        );
        partnerData = partRes.rows[0] || null;
      }

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
  } catch (err: any) {
    console.error('getOrderTrackingByCode error:', err);
    return { success: false, error: 'Failed to track order' };
  }
}

export async function confirmPayment(
  orderId: string,
  gatewayInfo?: {
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySignature?: string;
  }
) {
  try {
    await query(
      `UPDATE public.orders SET payment_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    await recordPayment(orderId, gatewayInfo);
    return { success: true };
  } catch (err: any) {
    console.error('confirmPayment error:', err);
    return { success: false, error: 'Failed to confirm payment' };
  }
}

async function recordPayment(
  orderId: string,
  gatewayInfo?: {
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySignature?: string;
  }
) {
  try {
    const oRes = await query<any>(
      `SELECT id, user_id, COALESCE(total, total_amount, 0) as total, payment_method FROM public.orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const order = oRes.rows[0];
    if (!order) return;

    const existingRes = await query<any>(
      `SELECT id FROM public.payments WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    const existing = existingRes.rows[0];

    if (existing) {
      if (gatewayInfo?.gatewayPaymentId || gatewayInfo?.gatewayOrderId) {
        await query(
          `UPDATE public.payments 
           SET gateway_payment_id = COALESCE($1, gateway_payment_id),
               gateway_order_id = COALESCE($2, gateway_order_id),
               gateway_signature = COALESCE($3, gateway_signature),
               updated_at = NOW()
           WHERE id = $4`,
          [gatewayInfo.gatewayPaymentId ?? null, gatewayInfo.gatewayOrderId ?? null, gatewayInfo.gatewaySignature ?? null, existing.id]
        );
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

    await query(
      `INSERT INTO public.payments (
        order_id, user_id, amount, currency, payment_method, gateway,
        gateway_order_id, gateway_payment_id, gateway_signature, status, created_at, updated_at
      ) VALUES ($1, $2, $3, 'INR', $4, $5, $6, $7, $8, 'confirmed', NOW(), NOW())`,
      [
        order.id,
        order.user_id ?? null,
        Number(order.total) || 0,
        method,
        gateway,
        gatewayInfo?.gatewayOrderId ?? null,
        gatewayInfo?.gatewayPaymentId ?? null,
        gatewayInfo?.gatewaySignature ?? null,
      ]
    );
  } catch (pErr) {
    console.error('recordPayment error:', pErr);
  }
}

export async function failPayment(orderId: string) {
  try {
    await query(
      `UPDATE public.orders SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    return { success: true };
  } catch (err: any) {
    console.error('failPayment error:', err);
    return { success: false, error: 'Failed to update payment status' };
  }
}

export async function cancelUnpaidOrder(orderId: string, reason = 'Payment not completed') {
  try {
    await query(
      `UPDATE public.orders 
       SET status = 'cancelled', 
           cancelled_at = NOW(), 
           cancellation_reason = $2,
           updated_at = NOW() 
       WHERE id = $1 AND status = 'pending'`,
      [orderId, reason]
    );
    return { success: true };
  } catch (err: any) {
    console.error('cancelUnpaidOrder error:', err);
    return { success: false, error: 'Failed to cancel order' };
  }
}

export async function getUserOrders(page = 1, pageSize = 10) {
  try {
    const { user } = await getServerSession();
    if (!user) return { success: false, error: 'Not authenticated' };

    const from = (page - 1) * pageSize;

    const countRes = await query(
      'SELECT COUNT(*)::int AS total FROM public.orders WHERE user_id = $1',
      [user.id]
    );
    const total = countRes.rows[0]?.total ?? 0;

    const ordersRes = await query(`
      SELECT 
        o.*,
        COALESCE(o.total, o.total_amount, 0) AS total,
        COALESCE(o.subtotal, 0) AS subtotal,
        COALESCE(o.delivery_fee, 0) AS delivery_fee,
        COALESCE(o.tax_amount, 0) AS tax_amount,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'order_id', oi.order_id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'product_price', COALESCE(oi.product_price, oi.unit_price, 0),
              'quantity', oi.quantity,
              'unit_price', COALESCE(oi.unit_price, oi.product_price, 0),
              'subtotal', COALESCE(oi.subtotal, oi.item_total, 0),
              'special_instructions', oi.special_instructions,
              'created_at', oi.created_at
            ))
            FROM public.order_items oi
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS order_items
      FROM public.orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3;
    `, [user.id, pageSize, from]);

    const totalPages = Math.ceil(total / pageSize);

    const orders = ordersRes.rows.map((row: any) => ({
      ...row,
      subtotal: Number(row.subtotal) || 0,
      delivery_fee: Number(row.delivery_fee) || 0,
      tax_amount: Number(row.tax_amount) || 0,
      total: Number(row.total) || 0,
      delivery_address: row.delivery_address || row.delivery_address_json || null,
      order_items: (row.order_items || []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        product_price: Number(item.product_price) || 0,
        subtotal: Number(item.subtotal) || 0,
      })),
    }));

    return {
      success: true,
      data: {
        orders: orders as unknown as Order[],
        total,
        page,
        totalPages,
      },
    };
  } catch (err: any) {
    console.error('getUserOrders error:', err);
    return { success: false, error: 'Failed to fetch orders' };
  }
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
      const payRes = await query<{ id: string; gateway_payment_id: string }>(
        `SELECT id, gateway_payment_id FROM public.payments WHERE order_id = $1 LIMIT 1`,
        [order.id]
      );
      const payment = payRes.rows[0];

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
    await query(
      `UPDATE public.payments 
       SET status = 'refunded', refund_amount = $1, updated_at = NOW() 
       WHERE order_id = $2`,
      [Number(order.total) || 0, order.id]
    );
  } catch (pErr) {
    console.error('Error updating payment status to refunded:', pErr);
  }

  return { refunded, method: order.payment_method ?? null };
}

export async function cancelUserOrder(orderId: string, reason: string) {
  try {
    const { user } = await getServerSession();
    if (!user) return { success: false, error: 'Not authenticated' };

    const orderRes = await query<any>(
      `SELECT id, user_id, status, status_history, created_at, payment_method, payment_status, total, tracking_code 
       FROM public.orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const order = orderRes.rows[0];

    if (!order) return { success: false, error: 'Order not found' };
    if (order.user_id !== user.id && user.role !== 'admin' && user.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }
    if (order.status !== 'pending' && order.status !== 'accepted') {
      return { success: false, error: 'Order can no longer be cancelled' };
    }

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

    await query(
      `UPDATE public.orders 
       SET status = 'cancelled', 
           payment_status = $1, 
           cancelled_at = NOW(), 
           cancellation_reason = $2, 
           status_history = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newPaymentStatus, reason || 'Cancelled by customer', JSON.stringify(statusHistory), orderId]
    );

    return { success: true, refunded: !isCod && order.payment_status === 'confirmed' };
  } catch (err: any) {
    console.error('cancelUserOrder error:', err);
    return { success: false, error: 'Failed to cancel order' };
  }
}

export async function getUserOrder(orderId: string) {
  try {
    const { user } = await getServerSession();

    const orderRes = await query<any>(`
      SELECT 
        o.*,
        COALESCE(o.total, o.total_amount, 0) AS total,
        COALESCE(o.subtotal, 0) AS subtotal,
        COALESCE(o.delivery_fee, 0) AS delivery_fee,
        COALESCE(o.tax_amount, 0) AS tax_amount,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'order_id', oi.order_id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'product_price', COALESCE(oi.product_price, oi.unit_price, 0),
              'quantity', oi.quantity,
              'unit_price', COALESCE(oi.unit_price, oi.product_price, 0),
              'subtotal', COALESCE(oi.subtotal, oi.item_total, 0),
              'special_instructions', oi.special_instructions,
              'created_at', oi.created_at
            ))
            FROM public.order_items oi
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS order_items
      FROM public.orders o
      WHERE o.id = $1
      LIMIT 1;
    `, [orderId]);

    const row = orderRes.rows[0];
    if (!row) return { success: false, error: 'Order not found' };

    if (user) {
      const isStaffOrAdmin = user.role ? ['admin', 'superadmin', 'manager', 'staff', 'delivery'].includes(user.role) : false;
      const isOwner = row.user_id === user.id || row.customer_email === user.email || row.customer_phone === user.phone;
      if (!isStaffOrAdmin && !isOwner) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    const order = {
      ...row,
      subtotal: Number(row.subtotal) || 0,
      delivery_fee: Number(row.delivery_fee) || 0,
      tax_amount: Number(row.tax_amount) || 0,
      total: Number(row.total) || 0,
      delivery_address: row.delivery_address || row.delivery_address_json || null,
      order_items: (row.order_items || []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        product_price: Number(item.product_price) || 0,
        subtotal: Number(item.subtotal) || 0,
      })),
    };

    return { success: true, data: order as unknown as Order };
  } catch (err: any) {
    console.error('getUserOrder error:', err);
    return { success: false, error: 'Failed to fetch order' };
  }
}
