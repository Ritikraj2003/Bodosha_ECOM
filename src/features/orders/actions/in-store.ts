'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { authorizeAdmin } from '@/features/admin/actions';
import type { CartItem } from '@/features/cart/types';
import type { Product, Category } from '@/features/products/types';

interface InStoreOrderParams {
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'razorpay' | 'upi';
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  notes?: string;
  orderType?: 'in_store' | 'takeaway';
}

export interface InStoreFilter {
  search?: string;
  paymentMethod?: string;
  orderType?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export async function searchCustomerByPhone(phone: string) {
  try {
    await authorizeAdmin();
    const supabase = createServiceClient();
    if (!supabase) return { success: false, error: 'Service client not configured' };

    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    if (!cleanPhone || cleanPhone.length < 5) {
      return { success: true, data: null };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email')
      .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone},phone.ilike.%${cleanPhone}%`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      return {
        success: true,
        data: {
          id: profile.id,
          fullName: profile.full_name,
          phone: profile.phone,
          email: profile.email,
        },
      };
    }

    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Customer search failed' };
  }
}

export async function getInStoreCatalog() {
  try {
    await authorizeAdmin();
    const supabase = createServiceClient();
    if (!supabase) return { success: false, error: 'Service client not configured' };

    const [catRes, prodRes] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).is('deleted_at', null).order('display_order', { ascending: true }),
      supabase.from('products').select('*').eq('is_active', true).eq('is_available', true).is('deleted_at', null).order('name', { ascending: true }),
    ]);

    return {
      success: true,
      data: {
        categories: (catRes.data ?? []) as Category[],
        products: (prodRes.data ?? []) as Product[],
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch catalog' };
  }
}

export async function createInStoreOrder(params: InStoreOrderParams) {
  try {
    const { user: adminUser } = await authorizeAdmin();
    const supabase = createServiceClient();
    if (!supabase) return { success: false, error: 'Service unavailable' };

    const { items, discountAmount = 0, paymentMethod, customerPhone, customerName, customerEmail, notes, orderType = 'in_store' } = params;

    if (!items || items.length === 0) {
      return { success: false, error: 'Cannot place order with an empty cart' };
    }

    const finalCustomerPhone = customerPhone?.trim() || null;
    if (finalCustomerPhone && !/^[0-9]{10}$/.test(finalCustomerPhone)) {
      return { success: false, error: 'Phone number must be exactly 10 digits' };
    }

    const finalCustomerName = customerName?.trim() || 'Walk-in Customer';
    const finalCustomerEmail = customerEmail?.trim() || null;
    const isTakeaway = orderType === 'takeaway';
    const finalOrderType = isTakeaway ? 'takeaway' : 'in_store';

    // Resolve active restaurant
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!restaurant) {
      return { success: false, error: 'No active restaurant found' };
    }

    // Lookup existing profile matching phone number to associate user_id if phone provided
    const cleanPhone = finalCustomerPhone ? finalCustomerPhone.replace(/[^\d+]/g, '') : '';
    let matchedUserId: string | null = null;
    if (cleanPhone && cleanPhone.length >= 5) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
        .limit(1)
        .maybeSingle();
      if (profile?.id) matchedUserId = profile.id;
    }

    const isCash = paymentMethod === 'cash';
    const isUpi = paymentMethod === 'upi';
    const isInstantSettled = isCash || isUpi;

    // Query DB for authoritative line items and prices
    const { resolveAuthoritativeLineItems } = await import('@/features/orders/actions/customer');
    const priceResolution = await resolveAuthoritativeLineItems(items);
    if (!priceResolution.success) {
      return { success: false, error: priceResolution.error };
    }

    const calculatedSubtotal = priceResolution.subtotal;

    // Calculate authoritative packaging charge & maintenance fee
    const { getNumericSetting, getSetting } = await import('@/lib/settings');
    const packagingChargeEnabled = (await getSetting('packaging_charge_enabled')) !== 'false';
    const packagingBigPacketPrice = await getNumericSetting('packaging_big_packet_price', 3);
    const packagingSmallPacketPrice = await getNumericSetting('packaging_small_packet_price', 2);
    const maintenanceFeeSetting = await getNumericSetting('maintenance_fee', 1);

    const calculatedPackagingCharge = isTakeaway && packagingChargeEnabled
      ? priceResolution.lineItems.reduce((sum, li) => {
          const bigQty = li.packaging_big_qty ?? 0;
          const smallQty = li.packaging_small_qty ?? 0;
          const perUnit = (bigQty * packagingBigPacketPrice) + (smallQty * packagingSmallPacketPrice);
          return sum + (perUnit * li.quantity);
        }, 0)
      : 0;

    const authoritativeMaintenanceFee = calculatedSubtotal > 0 ? maintenanceFeeSetting : 0;
    const finalTaxAmount = authoritativeMaintenanceFee + calculatedPackagingCharge;
    const finalDiscountAmount = Number(discountAmount) || 0;
    const finalTotal = Math.max(0, calculatedSubtotal + finalTaxAmount - finalDiscountAmount);
    const nowIso = new Date().toISOString();

    const orderPayload = {
      user_id: matchedUserId,
      restaurant_id: restaurant.id,
      status: isInstantSettled ? 'delivered' : 'pending',
      payment_status: isInstantSettled ? 'confirmed' : 'pending',
      payment_method: paymentMethod,
      order_type: finalOrderType,
      subtotal: calculatedSubtotal,
      delivery_fee: 0,
      tax_amount: finalTaxAmount,
      discount_amount: finalDiscountAmount,
      total: finalTotal,
      customer_name: finalCustomerName,
      customer_phone: finalCustomerPhone,
      customer_email: finalCustomerEmail,
      delivery_address: { address: isTakeaway ? 'In Store Take Away' : 'In Store Counter Checkout' },
      delivery_notes: notes?.trim() || (isTakeaway ? 'In Store Take Away order' : 'In Store counter order'),
      accepted_at: isInstantSettled ? nowIso : null,
      delivered_at: isInstantSettled ? nowIso : null,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id, tracking_code')
      .single();

    if (orderError || !order) {
      return { success: false, error: orderError?.message || 'Failed to create order' };
    }

    // Prepare line items with authoritative prices
    const orderItems = priceResolution.lineItems.map((li) => ({
      order_id: order.id,
      product_id: li.product_id ?? null,
      product_name: li.product_name,
      product_price: li.product_price,
      unit_price: li.unit_price,
      quantity: li.quantity,
      subtotal: li.subtotal,
      special_instructions: li.special_instructions ?? null,
    }));

    let { error: itemsError } = await supabase.from('order_items').insert(orderItems);

    if (itemsError && String(itemsError.message || '').toLowerCase().includes('foreign key')) {
      const fallbackItems = orderItems.map((it) => ({ ...it, product_id: null }));
      const retry = await supabase.from('order_items').insert(fallbackItems);
      itemsError = retry.error;
    }

    if (itemsError) {
      console.error('Failed to save in-store order line items:', itemsError);
      await supabase.from('orders').delete().eq('id', order.id);
      return { success: false, error: 'Failed to save order line items' };
    }

    if (isInstantSettled) {
      // Record payment (cash or upi)
      await supabase.from('payments').insert({
        order_id: order.id,
        user_id: matchedUserId,
        amount: finalTotal,
        currency: 'INR',
        payment_method: paymentMethod,
        gateway: isUpi ? 'upi' : 'manual',
        status: 'confirmed',
      });

      // Audit log
      await supabase.from('audit_logs').insert({
        table_name: 'orders',
        record_id: order.id,
        action: 'create_in_store_order',
        new_data: { total: finalTotal, payment_method: paymentMethod, tracking_code: order.tracking_code, order_type: finalOrderType },
        changed_by: adminUser.id,
      });

      // Trigger Telegram notification (NO email sent)
      await sendInStoreNotification(order.id);
    }

    return {
      success: true,
      data: {
        orderId: order.id,
        trackingCode: order.tracking_code,
        calculatedTotal: finalTotal,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to place in-store order' };
  }
}

export async function getInStoreOrdersAndStats(filter: InStoreFilter = {}) {
  try {
    await authorizeAdmin();
    const supabase = createServiceClient();
    if (!supabase) return { success: false, error: 'Service client not configured' };

    const today = new Date().toISOString().slice(0, 10);
    const { search, paymentMethod, orderType, fromDate, toDate, page = 1, pageSize = 20 } = filter;

    // Fetch stats for in-store orders (including in-store takeaways) matching date filter if provided
    let statsQuery = supabase
      .from('orders')
      .select('id, total, payment_method, payment_status, created_at, order_type, delivery_address')
      .or('order_type.eq.in_store,delivery_address->>address.ilike.In Store%')
      .is('deleted_at', null);

    if (orderType && orderType !== 'all') {
      statsQuery = statsQuery.eq('order_type', orderType);
    }

    if (fromDate) statsQuery = statsQuery.gte('created_at', fromDate);
    if (toDate) statsQuery = statsQuery.lte('created_at', toDate);

    const { data: allInStore } = await statsQuery;

    const rows = allInStore ?? [];

    const totalOrders = rows.length;
    const totalRevenue = rows
      .filter((r) => r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);

    const todayRevenue = rows
      .filter((r) => r.payment_status === 'confirmed' && r.created_at >= today)
      .reduce((sum, r) => sum + Number(r.total || 0), 0);

    const cashRevenue = rows
      .filter((r) => r.payment_method === 'cash' && r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);

    const onlineRevenue = rows
      .filter((r) => (r.payment_method === 'razorpay' || r.payment_method === 'upi') && r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);

    // Query paginated list
    let listQuery = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .or('order_type.eq.in_store,delivery_address->>address.ilike.In Store%')
      .is('deleted_at', null);

    if (paymentMethod && paymentMethod !== 'all') {
      listQuery = listQuery.eq('payment_method', paymentMethod);
    }

    if (orderType && orderType !== 'all') {
      listQuery = listQuery.eq('order_type', orderType);
    }

    if (search) {
      listQuery = listQuery.or(
        `tracking_code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
      );
    }

    if (fromDate) listQuery = listQuery.gte('created_at', fromDate);
    if (toDate) listQuery = listQuery.lte('created_at', toDate);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    listQuery = listQuery.order('created_at', { ascending: false }).range(from, to);

    const { data: orderList, count } = await listQuery;

    return {
      success: true,
      data: {
        stats: {
          totalOrders,
          totalRevenue,
          todayRevenue,
          cashRevenue,
          onlineRevenue,
        },
        orders: orderList ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch in-store history' };
  }
}

async function sendInStoreNotification(orderId: string) {
  try {
    const supabase = createServiceClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (!data) return;

    // Send Telegram notification ONLY. Do NOT send email ("i dont want to sent mail")
    const items = (data.order_items ?? []).map((i: { product_name: string; quantity: number; subtotal: number }) => ({
      name: i.product_name,
      quantity: i.quantity,
      price: Math.round(i.subtotal / i.quantity),
    }));

    const { sendTelegramMessageWithButtons } = await import('@/lib/telegram');
    const { getStatusButtons } = await import('@/lib/notifications');
    const buttons = getStatusButtons(data.id, data.status);
    const isTakeaway = data.order_type === 'takeaway';
    const headerTitle = isTakeaway ? '🥡 New In-Store Take Away Order!' : '🏪 New In-Store Counter Order!';
    const typeBadge = isTakeaway ? '🥡 Take Away' : '🏪 In Store (Counter)';

    const itemsList = items.map((i: { name: string; quantity: number; price: number }) => `  • ${i.name} ×${i.quantity} — ₹${i.price * i.quantity}`).join('\n');

    const paymentLabel =
      data.payment_method === 'upi' ? 'UPI (In Store Counter)'
      : data.payment_method === 'razorpay' ? 'ONLINE / RAZORPAY (In Store Counter)'
      : 'CASH (In Store Counter)';

    const msg =
      `<b>${headerTitle}</b>\n` +
      `📦 <b>#${data.tracking_code}</b>\n` +
      `🏷️ Order Type: <b>${typeBadge}</b>\n` +
      (data.customer_name ? `👤 ${data.customer_name}\n` : '') +
      (data.customer_phone ? `📞 ${data.customer_phone}\n` : '') +
      `💳 <b>${paymentLabel}</b>\n` +
      `💰 <b>₹${data.total}</b>\n\n` +
      `<b>Items:</b>\n` +
      itemsList;

    const statusLabel = data.status === 'delivered' ? '📦 Delivered' : '⏳ Pending';
    await sendTelegramMessageWithButtons(`${msg}\n\n${statusLabel}`, buttons);
  } catch {}
}
