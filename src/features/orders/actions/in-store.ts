'use server';

import { query } from '@/infrastructure/db';
import { authorizeAdmin } from '@/features/admin/actions';
import { mapProductRow, mapCategoryRow } from '@/features/products/repositories';
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

    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    if (!cleanPhone || cleanPhone.length < 5) {
      return { success: true, data: null };
    }

    const res = await query<any>(
      `SELECT id, full_name, phone, email
       FROM public.profiles
       WHERE phone = $1 OR phone = $2 OR phone ILIKE $3
       LIMIT 1`,
      [cleanPhone, `+91${cleanPhone}`, `%${cleanPhone}%`]
    );

    const profile = res.rows[0];
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

    const [catRes, prodRes] = await Promise.all([
      query<any>(`
        SELECT id, restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at
        FROM public.categories
        WHERE is_active = true
        ORDER BY display_order ASC, name ASC
      `),
      query<any>(`
        SELECT *
        FROM public.products
        WHERE is_active = true AND is_available = true AND deleted_at IS NULL
        ORDER BY sort_order ASC, name ASC
      `),
    ]);

    const categories: Category[] = catRes.rows.map(mapCategoryRow);
    const products: Product[] = prodRes.rows.map(mapProductRow);

    return {
      success: true,
      data: {
        categories,
        products,
      },
    };
  } catch (err) {
    console.error('getInStoreCatalog error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch catalog' };
  }
}

export async function createInStoreOrder(params: InStoreOrderParams) {
  try {
    const { user: adminUser } = await authorizeAdmin();

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
    const restRes = await query<any>(
      `SELECT id FROM public.restaurants WHERE deleted_at IS NULL ORDER BY is_active DESC, created_at ASC LIMIT 1`
    );
    const restaurantId = restRes.rows[0]?.id || 'd1111111-1111-1111-1111-111111111111';

    // Lookup existing profile matching phone number to associate user_id if phone provided
    const cleanPhone = finalCustomerPhone ? finalCustomerPhone.replace(/[^\d+]/g, '') : '';
    let matchedUserId: string | null = null;
    if (cleanPhone && cleanPhone.length >= 5) {
      const profRes = await query<any>(
        `SELECT id FROM public.profiles WHERE phone = $1 OR phone = $2 LIMIT 1`,
        [cleanPhone, `+91${cleanPhone}`]
      );
      if (profRes.rows[0]?.id) matchedUserId = profRes.rows[0].id;
    }
    const finalUserId = matchedUserId || adminUser.id;

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

    const trackingCode = `DD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const deliveryAddressObj = { address: isTakeaway ? 'In Store Take Away' : 'In Store Counter Checkout' };
    const notesText = notes?.trim() || (isTakeaway ? 'In Store Take Away order' : 'In Store counter order');
    const orderStatus = isInstantSettled ? 'delivered' : 'placed';
    const paymentStatus = isInstantSettled ? 'confirmed' : 'pending';

    const orderInsert = await query<any>(`
      INSERT INTO public.orders (
        user_id, restaurant_id, tracking_code, status, order_type,
        subtotal, tax_amount, delivery_fee, discount_amount, total_amount, total,
        delivery_address, delivery_address_json, delivery_notes, special_instructions,
        customer_name, customer_phone, customer_email,
        payment_method, payment_status,
        accepted_at, confirmed_at, delivered_at, placed_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $10,
        $11, $11, $12, $12,
        $13, $14, $15,
        $16, $17,
        $18, $18, $19, NOW(), NOW(), NOW()
      )
      RETURNING id, tracking_code
    `, [
      finalUserId,
      restaurantId,
      trackingCode,
      orderStatus,
      finalOrderType,
      calculatedSubtotal,
      finalTaxAmount,
      0, // delivery_fee
      finalDiscountAmount,
      finalTotal, // total_amount & total
      JSON.stringify(deliveryAddressObj),
      notesText,
      finalCustomerName,
      finalCustomerPhone,
      finalCustomerEmail,
      paymentMethod,
      paymentStatus,
      isInstantSettled ? nowIso : null,
      isInstantSettled ? nowIso : null,
    ]);

    const order = orderInsert.rows[0];
    if (!order) {
      return { success: false, error: 'Failed to create order' };
    }

    // Insert line items
    for (const li of priceResolution.lineItems) {
      await query(`
        INSERT INTO public.order_items (
          order_id, product_id, product_name, product_price, unit_price, quantity, subtotal, item_total, notes, special_instructions, created_at
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
    }

    if (isInstantSettled) {
      // Record payment (cash or upi)
      await query(`
        INSERT INTO public.payments (
          order_id, amount, currency, payment_method, status, gateway_payment_id, created_at, updated_at
        ) VALUES ($1, $2, 'INR', $3, 'confirmed', $4, NOW(), NOW())
      `, [
        order.id,
        finalTotal,
        paymentMethod,
        isUpi ? 'in_store_upi' : 'in_store_cash',
      ]);

      // Audit log
      await query(`
        INSERT INTO public.audit_logs (
          table_name, record_id, action, user_id, new_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        'orders',
        order.id,
        'create_in_store_order',
        adminUser.id,
        JSON.stringify({ total: finalTotal, payment_method: paymentMethod, tracking_code: order.tracking_code, order_type: finalOrderType }),
      ]);

      // Trigger Telegram notification (NO email sent)
      sendInStoreNotification(order.id).catch(console.error);
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
    console.error('createInStoreOrder error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to place in-store order' };
  }
}

export async function getInStoreOrdersAndStats(filter: InStoreFilter = {}) {
  try {
    await authorizeAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { search, paymentMethod, orderType, fromDate, toDate, page = 1, pageSize = 20 } = filter;

    const conditions: string[] = [
      `(order_type IN ('in_store', 'takeaway') OR (delivery_address_json->>'address') ILIKE 'In Store%' OR delivery_notes ILIKE '%In Store%')`,
      `deleted_at IS NULL`,
    ];
    const params: any[] = [];
    let pIdx = 1;

    if (orderType && orderType !== 'all') {
      conditions.push(`order_type = $${pIdx++}`);
      params.push(orderType);
    }
    if (fromDate) {
      conditions.push(`created_at >= $${pIdx++}`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`created_at <= $${pIdx++}`);
      params.push(toDate);
    }

    const statsRes = await query<any>(`
      SELECT id, COALESCE(total, total_amount, 0)::numeric as total, payment_method, payment_status, created_at, order_type
      FROM public.orders
      WHERE ${conditions.join(' AND ')}
    `, params);

    const rows = statsRes.rows;
    const totalOrders = rows.length;
    const totalRevenue = rows
      .filter((r) => r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);
    const todayRevenue = rows
      .filter((r) => r.payment_status === 'confirmed' && String(r.created_at).slice(0, 10) >= today)
      .reduce((sum, r) => sum + Number(r.total || 0), 0);
    const cashRevenue = rows
      .filter((r) => r.payment_method === 'cash' && r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);
    const onlineRevenue = rows
      .filter((r) => (r.payment_method === 'razorpay' || r.payment_method === 'upi') && r.payment_status === 'confirmed')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);

    // Filter for paginated list
    const listConditions = [...conditions];
    const listParams = [...params];

    if (paymentMethod && paymentMethod !== 'all') {
      listConditions.push(`payment_method = $${pIdx++}`);
      listParams.push(paymentMethod);
    }
    if (search) {
      listConditions.push(`(tracking_code ILIKE $${pIdx} OR customer_name ILIKE $${pIdx} OR customer_phone ILIKE $${pIdx})`);
      listParams.push(`%${search}%`);
      pIdx++;
    }

    const countRes = await query<any>(`
      SELECT COUNT(*)::int as count
      FROM public.orders
      WHERE ${listConditions.join(' AND ')}
    `, listParams);
    const count = countRes.rows[0]?.count || 0;

    const offset = (page - 1) * pageSize;
    listParams.push(pageSize, offset);
    const ordersRes = await query<any>(`
      SELECT id, tracking_code, customer_name, customer_phone, customer_email,
             order_type, delivery_address, delivery_address_json, delivery_notes,
             subtotal, tax_amount, discount_amount, COALESCE(total, total_amount, 0)::numeric as total,
             payment_method, payment_status, status, created_at
      FROM public.orders
      WHERE ${listConditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `, listParams);

    const orderIds = ordersRes.rows.map((o) => o.id);
    const itemsMap: Record<string, any[]> = {};
    if (orderIds.length > 0) {
      const itemsRes = await query<any>(`
        SELECT id, order_id, product_name, quantity, COALESCE(unit_price, product_price, 0)::numeric as unit_price, COALESCE(subtotal, item_total, 0)::numeric as subtotal
        FROM public.order_items
        WHERE order_id = ANY($1::uuid[])
      `, [orderIds]);
      for (const it of itemsRes.rows) {
        if (!itemsMap[it.order_id]) itemsMap[it.order_id] = [];
        itemsMap[it.order_id].push(it);
      }
    }

    const formattedOrders = ordersRes.rows.map((o) => ({
      ...o,
      total: Number(o.total),
      subtotal: Number(o.subtotal),
      tax_amount: Number(o.tax_amount),
      discount_amount: Number(o.discount_amount),
      delivery_address: o.delivery_address || o.delivery_address_json || { address: 'In Store' },
      order_items: itemsMap[o.id] || [],
    }));

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
        orders: formattedOrders,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    };
  } catch (err) {
    console.error('getInStoreOrdersAndStats error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch in-store history' };
  }
}

async function sendInStoreNotification(orderId: string) {
  try {
    const oRes = await query<any>(`
      SELECT id, tracking_code, customer_name, customer_phone, order_type, total, total_amount, payment_method, status
      FROM public.orders
      WHERE id = $1
    `, [orderId]);
    const data = oRes.rows[0];
    if (!data) return;

    const itemsRes = await query<any>(`
      SELECT product_name, quantity, COALESCE(subtotal, item_total, 0)::numeric as subtotal
      FROM public.order_items
      WHERE order_id = $1
    `, [orderId]);

    const items = itemsRes.rows.map((i: any) => ({
      name: i.product_name,
      quantity: Number(i.quantity),
      price: Math.round(Number(i.subtotal) / Number(i.quantity || 1)),
    }));

    const { sendTelegramMessageWithButtons } = await import('@/lib/telegram');
    const { getStatusButtons } = await import('@/lib/notifications');
    const buttons = getStatusButtons(data.id, data.status);
    const isTakeaway = data.order_type === 'takeaway';
    const headerTitle = isTakeaway ? '🥡 New In-Store Take Away Order!' : '🏪 New In-Store Counter Order!';
    const typeBadge = isTakeaway ? '🥡 Take Away' : '🏪 In Store (Counter)';

    const itemsList = items.map((i: any) => `  • ${i.name} ×${i.quantity} — ₹${i.price * i.quantity}`).join('\n');

    const paymentLabel =
      data.payment_method === 'upi' ? 'UPI (In Store Counter)'
      : data.payment_method === 'razorpay' ? 'ONLINE / RAZORPAY (In Store Counter)'
      : 'CASH (In Store Counter)';

    const totalVal = data.total || data.total_amount || 0;
    const msg =
      `<b>${headerTitle}</b>\n` +
      `📦 <b>#${data.tracking_code}</b>\n` +
      `🏷️ Order Type: <b>${typeBadge}</b>\n` +
      (data.customer_name ? `👤 ${data.customer_name}\n` : '') +
      (data.customer_phone ? `📞 ${data.customer_phone}\n` : '') +
      `💳 <b>${paymentLabel}</b>\n` +
      `💰 <b>₹${totalVal}</b>\n\n` +
      `<b>Items:</b>\n` +
      itemsList;

    const statusLabel = data.status === 'delivered' ? '📦 Delivered' : '⏳ Pending';
    await sendTelegramMessageWithButtons(`${msg}\n\n${statusLabel}`, buttons);
  } catch (err) {
    console.error('sendInStoreNotification error:', err);
  }
}
