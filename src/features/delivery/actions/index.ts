'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { query } from '@/infrastructure/db';
import { getServerSession, getServerProfile } from '@/features/auth/actions';
import { sendDeliveryOtpEmail } from '@/lib/email';
import { deliveryRepository } from '../repositories';
import type { Order } from '@/features/orders/types';
import {
  isQrConfigured,
  signQrToken,
  verifyQrToken,
  generateDeliveryOtp,
  hashDeliveryOtp,
  DELIVERY_OTP_TTL_MS,
  DELIVERY_OTP_MAX_ATTEMPTS,
} from '../lib/security';

async function authorizeDeliveryPartner() {
  const { user } = await getServerSession();
  if (!user) return null;
  const { profile } = await getServerProfile();
  const effectiveRole = profile?.role || user.role;
  if (effectiveRole !== 'delivery' && user.role !== 'delivery') return null;
  return user;
}

export async function getDeliveryDashboard() {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized', data: null };

  const partner = await deliveryRepository.getPartnerByUserId(user.id);
  if (!partner) return { success: false, error: 'Delivery partner profile not found', data: null };

  const [activeRows, today, stats] = await Promise.all([
    deliveryRepository.getActiveAssignments(user.id),
    deliveryRepository.getDeliveredToday(user.id),
    deliveryRepository.getDeliveryStats(user.id),
  ]);

  const active = activeRows.map((row) => {
    const { orders, ...assignment } = row;
    return { assignment, order: orders };
  });

  const deliveredToday = today.rows.map((row) => {
    const { orders, ...assignment } = row;
    return { assignment, order: orders };
  });

  return {
    success: true,
    data: {
      partner,
      active,
      deliveredToday,
      deliveredTodayCount: today.count,
      deliveredTodayValue: today.value,
      stats,
    },
  };
}

export async function getDeliveryHistory() {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized', data: null };

  const rows = await deliveryRepository.getDeliveredHistory(user.id);
  const entries = rows.map((row) => {
    const { orders, ...assignment } = row;
    return { assignment, order: orders };
  });

  return { success: true, data: { entries } };
}

export async function generateDeliveryQr(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!isQrConfigured()) {
    return { success: false, error: 'Delivery QR is not configured on the server' };
  }

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.status !== 'assigned') {
    return { success: false, error: 'Pickup QR is only available before pickup' };
  }

  let order: { tracking_code: string; status: string; order_type: string | null } | null = null;
  try {
    const res = await query<{ tracking_code: string; status: string; order_type: string | null }>(
      `SELECT tracking_code, status, order_type FROM public.orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (res?.rows?.[0]) order = res.rows[0];
  } catch {}

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data } = await supabase
          .from('orders')
          .select('tracking_code, status, order_type')
          .eq('id', orderId)
          .maybeSingle();
        if (data && !Array.isArray(data) && data.tracking_code) order = data;
      }
    } catch {}
  }

  if (!order || order.status !== 'assigned') {
    return { success: false, error: 'Order is not ready for pickup' };
  }
  if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
    return { success: false, error: 'Delivery QR is not available for takeaway or in-store orders' };
  }

  const { getNumericSetting } = await import('@/lib/settings');
  const qrExpiryMinutes = await getNumericSetting('telegram_qr_expiry_minutes', 30);
  const token = signQrToken(order.tracking_code, qrExpiryMinutes);
  const expiresAt = Date.now() + qrExpiryMinutes * 60 * 1000;
  const tokenHash = hashDeliveryOtp(token);

  try {
    await query(`UPDATE public.delivery_assignments SET qr_token_hash = $1 WHERE id = $2`, [tokenHash, assignment.id]);
  } catch {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        await supabase.from('delivery_assignments').update({ qr_token_hash: tokenHash }).eq('id', assignment.id);
      }
    } catch {}
  }

  return { success: true, data: { token, expiresAt, trackingCode: order.tracking_code } };
}

async function claimOrderForPickup(
  user: { id: string },
  order: Pick<Order, 'id' | 'status' | 'delivery_partner_id'> & { order_type?: string | null },
  qrTokenHash?: string,
): Promise<{ success: boolean; error?: string; data?: { orderId: string } }> {
  if (!order || !order.id) {
    return { success: false, error: 'Order not found' };
  }

  if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
    return { success: false, error: 'Takeaway and in-store orders cannot be claimed by delivery partners' };
  }

  const claimable = ['pending', 'accepted', 'preparing', 'ready', 'assigned'];
  const currentStatus = order.status || '';
  if (!claimable.includes(currentStatus)) {
    if (currentStatus === 'out_for_delivery') {
      return { success: false, error: 'The order has already been picked up by another delivery partner' };
    }
    if (currentStatus === 'delivered' || currentStatus === 'completed') {
      return { success: false, error: 'This order has already been delivered' };
    }
    if (currentStatus === 'cancelled') {
      return { success: false, error: 'This order has been cancelled' };
    }
    return { success: false, error: `Order is already ${currentStatus ? currentStatus.replace(/_/g, ' ') : 'processed'} and can no longer be claimed` };
  }

  if (order.delivery_partner_id && order.delivery_partner_id !== user.id) {
    return { success: false, error: 'The order has already been picked up by another delivery partner' };
  }

  const assignment = await deliveryRepository.getAssignmentByOrderId(order.id);
  if (assignment && assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'The order has already been picked up by another delivery partner' };
  }
  if (assignment && assignment.status !== 'assigned') {
    return { success: false, error: 'The order has already been picked up by another delivery partner' };
  }

  const now = new Date().toISOString();

  // Try direct Postgres update first
  try {
    if (!assignment) {
      await query(
        `INSERT INTO public.delivery_assignments (order_id, delivery_partner_id, status, assigned_at, qr_token_hash)
         VALUES ($1, $2, 'assigned', $3, $4)`,
        [order.id, user.id, now, qrTokenHash || null]
      );
    }
    await query(
      `UPDATE public.delivery_assignments SET status = 'picked_up', picked_up_at = $1 WHERE order_id = $2 AND delivery_partner_id = $3`,
      [now, order.id, user.id]
    );
    await query(
      `UPDATE public.orders SET status = 'out_for_delivery', delivery_partner_id = $1, picked_up_at = $2 WHERE id = $3`,
      [user.id, now, order.id]
    );
    await query(
      `UPDATE public.delivery_partners SET is_online = true, is_available = false WHERE user_id = $1 OR id = $1`,
      [user.id]
    );
    return { success: true, data: { orderId: order.id } };
  } catch (dbErr) {
    console.error('Postgres claimOrderForPickup error:', dbErr);
  }

  // Fallback to Supabase if mock / configured
  try {
    const supabase = createServiceClient();
    if (supabase && typeof supabase.from === 'function') {
      if (!assignment) {
        await supabase.from('delivery_assignments').insert({
          order_id: order.id,
          delivery_partner_id: user.id,
          status: 'assigned',
          assigned_at: now,
          ...(qrTokenHash ? { qr_token_hash: qrTokenHash } : {}),
        });
      }
      await supabase
        .from('delivery_assignments')
        .update({ status: 'picked_up', picked_up_at: now })
        .eq('order_id', order.id)
        .eq('delivery_partner_id', user.id);
      await supabase
        .from('orders')
        .update({ status: 'out_for_delivery', delivery_partner_id: user.id })
        .eq('id', order.id);
      await supabase
        .from('delivery_partners')
        .update({ is_online: true, is_available: false })
        .eq('id', user.id);
      return { success: true, data: { orderId: order.id } };
    }
  } catch (sbErr) {
    console.error('Supabase claimOrderForPickup error:', sbErr);
  }

  return { success: false, error: 'Failed to start pickup' };
}

export async function startPickupManual(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.status !== 'assigned') {
    return { success: false, error: 'Pickup can only be started for an assigned order' };
  }

  let order: any = null;
  try {
    const res = await query<{ tracking_code: string; status: string }>(
      `SELECT tracking_code, status FROM public.orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (res?.rows?.[0]) order = res.rows[0];
  } catch {}

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data } = await supabase.from('orders').select('tracking_code, status').eq('id', orderId).maybeSingle();
        if (data && !Array.isArray(data) && data.status) order = data;
      }
    } catch {}
  }

  const claimable = ['pending', 'accepted', 'preparing', 'ready', 'assigned'];
  if (!order || !claimable.includes(order.status)) {
    return { success: false, error: 'Order is not ready for pickup' };
  }

  const now = new Date().toISOString();
  try {
    await query(
      `UPDATE public.delivery_assignments SET status = 'picked_up', picked_up_at = $1 WHERE id = $2`,
      [now, assignment.id]
    );
    await query(`UPDATE public.orders SET status = 'out_for_delivery', picked_up_at = $1 WHERE id = $2`, [now, orderId]);
    await query(`UPDATE public.delivery_partners SET is_online = true WHERE user_id = $1 OR id = $1`, [user.id]);
    return { success: true };
  } catch (err) {
    console.error('startPickupManual db error:', err);
  }

  try {
    const supabase = createServiceClient();
    if (supabase && typeof supabase.from === 'function') {
      await supabase.from('delivery_assignments').update({ status: 'picked_up', picked_up_at: now }).eq('id', assignment.id);
      await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId);
      await supabase.from('delivery_partners').update({ is_online: true }).eq('id', user.id);
      return { success: true };
    }
  } catch {}

  return { success: false, error: 'Failed to start pickup' };
}

export async function startPickupByToken(token: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const verified = verifyQrToken(token);
  if (!verified) return { success: false, error: 'QR/Order ID has expired — ask the store for a fresh QR.' };

  const order = await deliveryRepository.getOrderByTrackingCode(verified.trackingCode);
  if (!order) return { success: false, error: 'Order not found' };

  return claimOrderForPickup(user, order, hashDeliveryOtp(token));
}

export async function startPickupByTrackingCode(code: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const trimmed = (code || '').trim();
  if (!trimmed) return { success: false, error: 'Enter a tracking code or order ID' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  let order: any = null;
  try {
    const res = isUuid
      ? await query<any>(`SELECT id, status, delivery_partner_id, order_type FROM public.orders WHERE id = $1 LIMIT 1`, [trimmed])
      : await query<any>(`SELECT id, status, delivery_partner_id, order_type FROM public.orders WHERE UPPER(tracking_code) = UPPER($1) LIMIT 1`, [trimmed]);
    if (res?.rows?.[0]) {
      order = res.rows[0];
    }
  } catch (err) {
    console.error('query order error:', err);
  }

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const queryBuilder = supabase.from('orders').select('id, status, delivery_partner_id, order_type');
        const { data } = isUuid
          ? await queryBuilder.eq('id', trimmed).maybeSingle()
          : await queryBuilder.eq('tracking_code', trimmed.toUpperCase()).maybeSingle();
        if (data && !Array.isArray(data) && data.id) {
          order = data;
        }
      }
    } catch {}
  }

  if (!order || !order.id) {
    return { success: false, error: 'Order not found' };
  }

  return claimOrderForPickup(user, order);
}

export async function generateOtpForOrder(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.otp_verified_at) {
    return { success: false, error: 'OTP for this order has already been verified' };
  }

  let order: any = null;
  try {
    const orderRes = await query<{
      status: string;
      payment_method: string | null;
      payment_status: string | null;
      customer_email: string | null;
      user_id: string | null;
      tracking_code: string;
      order_type: string | null;
    }>(
      `SELECT status, payment_method, payment_status, customer_email, user_id, tracking_code, order_type 
       FROM public.orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (orderRes?.rows?.[0]) order = orderRes.rows[0];
  } catch {}

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data } = await supabase
          .from('orders')
          .select('status, payment_method, payment_status, customer_email, user_id, tracking_code, order_type')
          .eq('id', orderId)
          .maybeSingle();
        if (data && !Array.isArray(data) && data.status) order = data;
      }
    } catch {}
  }

  if (!order) return { success: false, error: 'Order not found' };
  if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
    return { success: false, error: 'OTP generation is not applicable for takeaway or in-store orders' };
  }
  if (order.status !== 'out_for_delivery') {
    return { success: false, error: 'Generate the OTP after picking up the order' };
  }
  if (order.payment_method !== 'cod' && order.payment_status !== 'confirmed') {
    return { success: false, error: 'Confirm the door payment first (show the payment QR, then mark payment received)' };
  }

  const otp = generateDeliveryOtp();
  const expiresAt = new Date(Date.now() + DELIVERY_OTP_TTL_MS).toISOString();

  let updated = false;
  try {
    await query(
      `UPDATE public.delivery_assignments 
       SET otp_value = $1, otp_hash = $2, otp_expires_at = $3, otp_attempts = 0 
       WHERE id = $4`,
      [otp, hashDeliveryOtp(otp), expiresAt, assignment.id]
    );
    updated = true;
  } catch {}

  if (!updated) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { error } = await supabase
          .from('delivery_assignments')
          .update({
            otp_value: otp,
            otp_hash: hashDeliveryOtp(otp),
            otp_expires_at: expiresAt,
            otp_attempts: 0,
          })
          .eq('id', assignment.id);
        if (!error) updated = true;
      }
    } catch {}
  }

  if (!updated) return { success: false, error: 'Failed to generate delivery OTP' };

  let emailSent = false;
  try {
    let recipient = order.customer_email ?? null;
    if (!recipient && order.user_id) {
      const uRes = await query<{ email: string }>(`SELECT email FROM public.users WHERE id = $1 LIMIT 1`, [order.user_id]);
      recipient = uRes.rows[0]?.email ?? null;
    }
    if (recipient) {
      emailSent = await sendDeliveryOtpEmail(recipient, otp, order.tracking_code);
    }
  } catch {}

  return { success: true, data: { otp, expiresAt, emailSent } };
}

export async function verifyOtpForDelivery(orderId: string, otp: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!otp || !/^\d{6}$/.test(otp)) {
    return { success: false, error: 'Enter the 6-digit OTP shown to the customer' };
  }

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.otp_verified_at) {
    return { success: false, error: 'OTP has already been verified' };
  }
  if (!assignment.otp_hash || !assignment.otp_value) {
    return { success: false, error: 'No OTP has been generated for this order yet' };
  }

  if (assignment.otp_expires_at && new Date(assignment.otp_expires_at) < new Date()) {
    return { success: false, error: 'OTP has expired. Please generate a new one.' };
  }

  if ((assignment.otp_attempts ?? 0) >= DELIVERY_OTP_MAX_ATTEMPTS) {
    return { success: false, error: 'Too many incorrect attempts. Please generate a new OTP.' };
  }

  const trimmed = (otp || '').trim();
  if (hashDeliveryOtp(trimmed) !== assignment.otp_hash) {
    const attempts = (assignment.otp_attempts ?? 0) + 1;
    try {
      await query(`UPDATE public.delivery_assignments SET otp_attempts = $1 WHERE id = $2`, [attempts, assignment.id]);
    } catch {
      try {
        const supabase = createServiceClient();
        if (supabase && typeof supabase.from === 'function') {
          await supabase.from('delivery_assignments').update({ otp_attempts: attempts }).eq('id', assignment.id);
        }
      } catch {}
    }
    return { success: false, error: `Incorrect OTP. ${DELIVERY_OTP_MAX_ATTEMPTS - attempts} attempt(s) left.` };
  }

  const now = new Date().toISOString();
  let verified = false;
  try {
    await query(
      `UPDATE public.delivery_assignments 
       SET otp_verified_at = $1, otp_value = null, otp_hash = null, otp_expires_at = null, otp_attempts = 0 
       WHERE id = $2`,
      [now, assignment.id]
    );
    verified = true;
  } catch {}

  if (!verified) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { error } = await supabase
          .from('delivery_assignments')
          .update({ otp_verified_at: now, otp_value: null, otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
          .eq('id', assignment.id);
        if (!error) verified = true;
      }
    } catch {}
  }

  if (!verified) return { success: false, error: 'Failed to verify OTP' };
  return { success: true };
}

export async function recordPaymentCollection(orderId: string, method: 'cash' | 'upi' | 'card') {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!['cash', 'upi', 'card'].includes(method)) {
    return { success: false, error: 'Invalid collection method' };
  }

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (!assignment.otp_verified_at) {
    return { success: false, error: 'Verify the customer OTP before collecting payment' };
  }

  let order: any = null;
  try {
    const orderRes = await query<{
      id: string;
      user_id: string | null;
      total: number | string | null;
      total_amount: number | string | null;
      payment_method: string | null;
      payment_status: string | null;
    }>(`SELECT id, user_id, total, total_amount, payment_method, payment_status FROM public.orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (orderRes?.rows?.[0]) order = orderRes.rows[0];
  } catch {}

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
        if (data && !Array.isArray(data) && data.id) order = data;
      }
    } catch {}
  }

  if (!order) return { success: false, error: 'Order not found' };
  if (order.payment_method !== 'cod') {
    return { success: false, error: 'Payment for this order was already collected online' };
  }
  if (order.payment_status === 'confirmed') {
    return { success: false, error: 'Payment for this order has already been collected' };
  }

  const amount = Number(order.total ?? order.total_amount ?? 0);

  let recorded = false;
  try {
    await query(
      `INSERT INTO public.payments (order_id, amount, currency, payment_method, status, created_at, updated_at)
       VALUES ($1, $2, 'INR', 'cod', 'captured', NOW(), NOW())`,
      [orderId, amount]
    );
    await query(
      `UPDATE public.orders SET payment_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    recorded = true;
  } catch (err) {
    console.error('recordPaymentCollection db error:', err);
  }

  if (!recorded) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        await supabase.from('payments').insert({
          order_id: orderId,
          amount,
          currency: 'INR',
          payment_method: 'cod',
          status: 'captured',
        });
        await supabase.from('orders').update({ payment_status: 'confirmed' }).eq('id', orderId);
        recorded = true;
      }
    } catch {}
  }

  if (!recorded) return { success: false, error: 'Failed to record payment' };
  return { success: true };
}

export async function markOrderDelivered(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.status === 'delivered') {
    return { success: false, error: 'Order has already been delivered' };
  }

  let order: any = null;
  try {
    const orderRes = await query<{
      payment_method: string | null;
      payment_status: string | null;
    }>(`SELECT payment_method, payment_status FROM public.orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (orderRes?.rows?.[0]) order = orderRes.rows[0];
  } catch {}

  if (!order) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
        if (data && !Array.isArray(data) && data.id) order = data;
      }
    } catch {}
  }

  if (!order) return { success: false, error: 'Order not found' };

  if (!assignment.otp_verified_at) {
    return { success: false, error: 'Customer OTP not verified yet. Ask for the code and verify it first.' };
  }

  const isCod = order.payment_method === 'cod';
  if (isCod && order.payment_status !== 'confirmed') {
    return { success: false, error: 'Payment not collected yet. Collect the payment at the door first.' };
  }
  if (!isCod && order.payment_status !== 'confirmed') {
    return { success: false, error: 'Order payment is not confirmed' };
  }

  const now = new Date().toISOString();
  let delivered = false;

  try {
    await query(
      `UPDATE public.delivery_assignments SET status = 'delivered', delivered_at = $1, completed_at = $1 WHERE id = $2`,
      [now, assignment.id]
    );
    await query(
      `UPDATE public.orders SET status = 'delivered', delivered_at = $1, updated_at = NOW() WHERE id = $2`,
      [now, orderId]
    );
    await query(
      `UPDATE public.delivery_partners 
       SET is_online = false, total_deliveries = COALESCE(total_deliveries, 0) + 1, updated_at = NOW() 
       WHERE user_id = $1 OR id = $1`,
      [user.id]
    );
    delivered = true;
  } catch (err) {
    console.error('markOrderDelivered db error:', err);
  }

  if (!delivered) {
    try {
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        await supabase.from('delivery_assignments').update({ status: 'delivered', delivered_at: now }).eq('id', assignment.id);
        await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', orderId);
        const partner = await deliveryRepository.getPartnerByUserId(user.id);
        await supabase.from('delivery_partners').update({ is_online: false, total_deliveries: (partner?.total_deliveries ?? 0) + 1 }).eq('id', user.id);
        delivered = true;
      }
    } catch {}
  }

  if (!delivered) return { success: false, error: 'Failed to mark delivered' };
  return { success: true };
}

export async function getCustomerDeliveryInfo(orderId: string) {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    let order: any = null;
    try {
      const orderRes = await query<any>(
        `SELECT user_id, status, payment_method, payment_status, delivery_partner_id, 
                COALESCE(total, total_amount, 0) as total, order_type 
         FROM public.orders WHERE id = $1 LIMIT 1`,
        [orderId]
      );
      if (orderRes?.rows?.[0]) order = orderRes.rows[0];
    } catch {}

    if (!order) {
      try {
        const supabase = createServiceClient();
        if (supabase && typeof supabase.from === 'function') {
          const { data } = await supabase
            .from('orders')
            .select('user_id, status, payment_method, payment_status, delivery_partner_id, total, order_type')
            .eq('id', orderId)
            .maybeSingle();
          if (data && !Array.isArray(data) && data.user_id) order = data;
        }
      } catch {}
    }

    if (!order || (order.user_id !== user.id && user.role !== 'admin' && user.role !== 'superadmin')) {
      return { success: false, error: 'Unauthorized' };
    }

    const isTakeaway = order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store';
    if (isTakeaway) {
      return {
        success: true,
        data: {
          hasDelivery: false,
          orderStatus: order.status,
          assignment: null,
          partner: null,
          payment: { method: order.payment_method, status: order.payment_status },
          total: Number(order.total) || 0,
        },
      };
    }

    const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
    let partnerData: { full_name?: string | null; phone?: string | null } | null = null;
    if (order.delivery_partner_id) {
      const pRes = await query<{ full_name: string | null; phone: string | null }>(
        `SELECT full_name, phone FROM public.users WHERE id = $1 LIMIT 1`,
        [order.delivery_partner_id]
      );
      partnerData = pRes.rows[0] || null;
    }

    return {
      success: true,
      data: {
        hasDelivery: !!(assignment || order.delivery_partner_id),
        orderStatus: order.status,
        assignment: assignment
          ? {
              status: assignment.status,
              otpValue: assignment.otp_value ?? null,
              otpExpiresAt: assignment.otp_expires_at ?? null,
              otpVerifiedAt: assignment.otp_verified_at ?? null,
            }
          : null,
        partner: partnerData
          ? { fullName: partnerData.full_name ?? null, phone: partnerData.phone ?? null }
          : null,
        payment: { method: order.payment_method, status: order.payment_status },
        total: Number(order.total) || 0,
      },
    };
  } catch (err) {
    console.error('getCustomerDeliveryInfo error:', err);
    return { success: false, error: 'Failed to fetch delivery info' };
  }
}

export async function updateDeliveryVehicleProfile(data: {
  vehicleType: string;
  licensePlate: string;
}) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const partner = await deliveryRepository.updatePartnerVehicle(
    user.id,
    data.vehicleType,
    data.licensePlate
  );

  if (!partner) {
    return { success: false, error: 'Failed to update vehicle details' };
  }

  return { success: true, data: { partner } };
}
