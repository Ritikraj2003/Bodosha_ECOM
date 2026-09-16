'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
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
  DELIVERY_QR_TTL_MS,
  DELIVERY_OTP_TTL_MS,
  DELIVERY_OTP_MAX_ATTEMPTS,
} from '../lib/security';

async function authorizeDeliveryPartner() {
  const { user } = await getServerSession();
  if (!user) return null;
  const { profile } = await getServerProfile();
  if (!profile || profile.role !== 'delivery') return null;
  return user;
}

export async function getDeliveryDashboard() {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized', data: null };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured', data: null };

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

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

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

  const order = await supabase
    .from('orders')
    .select('tracking_code, status, order_type')
    .eq('id', orderId)
    .maybeSingle();
  if (!order.data || order.data.status !== 'assigned') {
    return { success: false, error: 'Order is not ready for pickup' };
  }
  if (order.data.order_type === 'takeaway' || order.data.order_type === 'dine_in' || order.data.order_type === 'in_store') {
    return { success: false, error: 'Delivery QR is not available for takeaway or in-store orders' };
  }

  const { getNumericSetting } = await import('@/lib/settings');
  const qrExpiryMinutes = await getNumericSetting('telegram_qr_expiry_minutes', 30);
  const token = signQrToken(order.data.tracking_code, qrExpiryMinutes);
  const expiresAt = Date.now() + qrExpiryMinutes * 60 * 1000;

  await supabase
    .from('delivery_assignments')
    .update({ qr_token_hash: hashDeliveryOtp(token) })
    .eq('id', assignment.id);

  return { success: true, data: { token, expiresAt, trackingCode: order.data.tracking_code } };
}

async function claimOrderForPickup(
  supabase: NonNullable<ReturnType<typeof createServiceClient>>,
  user: { id: string },
  order: Pick<Order, 'id' | 'status' | 'delivery_partner_id'> & { order_type?: string | null },
  qrTokenHash?: string,
): Promise<{ success: boolean; error?: string; data?: { orderId: string } }> {
  if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
    return { success: false, error: 'Takeaway and in-store orders cannot be claimed by delivery partners' };
  }

  const claimable = ['pending', 'accepted', 'preparing', 'ready', 'assigned'];
  if (!claimable.includes(order.status)) {
    if (order.status === 'out_for_delivery') {
      return { success: false, error: 'The order has already been picked up by another delivery partner' };
    }
    if (order.status === 'delivered' || order.status === 'completed') {
      return { success: false, error: 'This order has already been delivered' };
    }
    if (order.status === 'cancelled') {
      return { success: false, error: 'This order has been cancelled' };
    }
    return { success: false, error: `Order is already ${order.status.replace(/_/g, ' ')} and can no longer be claimed` };
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

  if (!assignment) {
    const { error: insertError } = await supabase.from('delivery_assignments').insert({
      order_id: order.id,
      delivery_partner_id: user.id,
      status: 'assigned',
      assigned_at: now,
      ...(qrTokenHash ? { qr_token_hash: qrTokenHash } : {}),
    });
    if (insertError) return { success: false, error: 'Failed to claim the order' };
  }

  const { error: assignmentError } = await supabase
    .from('delivery_assignments')
    .update({ status: 'picked_up', picked_up_at: now })
    .eq('order_id', order.id)
    .eq('delivery_partner_id', user.id);
  if (assignmentError) return { success: false, error: 'Failed to start pickup' };

  const { error: orderError } = await supabase
    .from('orders')
    .update({ status: 'out_for_delivery', delivery_partner_id: user.id })
    .eq('id', order.id);
  if (orderError) return { success: false, error: 'Failed to start pickup' };

  const { error: partnerError } = await supabase
    .from('delivery_partners')
    .update({ is_online: true, is_available: false })
    .eq('id', user.id);
  if (partnerError) return { success: false, error: 'Failed to update your availability' };

  return { success: true, data: { orderId: order.id } };
}

export async function startPickupManual(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.status !== 'assigned') {
    return { success: false, error: 'Pickup can only be started for an assigned order' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('tracking_code, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.status !== 'assigned') {
    return { success: false, error: 'Order is not ready for pickup' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('delivery_assignments')
    .update({ status: 'picked_up', picked_up_at: now })
    .eq('id', assignment.id);
  if (error) return { success: false, error: 'Failed to start pickup' };

  await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId);
  await supabase.from('delivery_partners').update({ is_online: true }).eq('id', user.id);

  return { success: true };
}

export async function startPickupByToken(token: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const verified = verifyQrToken(token);
  if (!verified) return { success: false, error: 'QR/Order ID has expired — ask the store for a fresh QR.' };

  const order = await deliveryRepository.getOrderByTrackingCode(verified.trackingCode);
  if (!order) return { success: false, error: 'Order not found' };

  return claimOrderForPickup(supabase, user, order, hashDeliveryOtp(token));
}

export async function startPickupByTrackingCode(code: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const trimmed = (code || '').trim();
  if (!trimmed) return { success: false, error: 'Enter a tracking code or order ID' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const { data: order } = isUuid
    ? await supabase.from('orders').select('id, status, delivery_partner_id, order_type').eq('id', trimmed).maybeSingle()
    : await supabase.from('orders').select('id, status, delivery_partner_id, order_type').eq('tracking_code', trimmed.toUpperCase()).maybeSingle();
  if (!order) return { success: false, error: 'Order not found' };

  return claimOrderForPickup(supabase, user, order);
}

export async function generateOtpForOrder(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.otp_verified_at) {
    return { success: false, error: 'OTP for this order has already been verified' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('status, payment_method, payment_status, customer_email, user_id, tracking_code, order_type')
    .eq('id', orderId)
    .maybeSingle();
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

  const { error } = await supabase
    .from('delivery_assignments')
    .update({
      otp_value: otp,
      otp_hash: hashDeliveryOtp(otp),
      otp_expires_at: expiresAt,
      otp_attempts: 0,
    })
    .eq('id', assignment.id);

  if (error) return { success: false, error: 'Failed to generate delivery OTP' };

  let emailSent = false;
  try {
    let recipient = order.customer_email ?? null;
    if (!recipient && order.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', order.user_id)
        .maybeSingle();
      recipient = profile?.email ?? null;
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

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

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

  if (assignment.otp_attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
    return { success: false, error: 'Too many incorrect attempts. Please generate a new OTP.' };
  }

  const trimmed = (otp || '').trim();
  if (hashDeliveryOtp(trimmed) !== assignment.otp_hash) {
    const attempts = (assignment.otp_attempts ?? 0) + 1;
    await supabase
      .from('delivery_assignments')
      .update({ otp_attempts: attempts })
      .eq('id', assignment.id);
    return { success: false, error: `Incorrect OTP. ${DELIVERY_OTP_MAX_ATTEMPTS - attempts} attempt(s) left.` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('delivery_assignments')
    .update({ otp_verified_at: now, otp_value: null, otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
    .eq('id', assignment.id);

  if (error) return { success: false, error: 'Failed to verify OTP' };
  return { success: true };
}

export async function recordPaymentCollection(orderId: string, method: 'cash' | 'upi' | 'card') {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

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

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { success: false, error: 'Order not found' };
  if (order.payment_method !== 'cod') {
    return { success: false, error: 'Payment for this order was already collected online' };
  }
  if (order.payment_status === 'confirmed') {
    return { success: false, error: 'Payment for this order has already been collected' };
  }

  const now = new Date().toISOString();

  const { error: paymentError } = await supabase.from('payments').insert({
    order_id: orderId,
    user_id: order.user_id,
    amount: order.total,
    currency: 'INR',
    payment_method: 'cod',
    gateway: 'manual',
    status: 'collected',
    collected_at: now,
    collected_by: user.id,
    metadata: { collection_method: method, collected_by_name: user.fullName ?? null },
  });
  if (paymentError) return { success: false, error: 'Failed to record payment' };

  const { error: orderError } = await supabase
    .from('orders')
    .update({ payment_status: 'confirmed' })
    .eq('id', orderId);
  if (orderError) return { success: false, error: 'Failed to confirm payment' };

  return { success: true };
}

export async function markOrderDelivered(orderId: string) {
  const user = await authorizeDeliveryPartner();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  if (!assignment || assignment.delivery_partner_id !== user.id) {
    return { success: false, error: 'This order is not assigned to you' };
  }
  if (assignment.status === 'delivered') {
    return { success: false, error: 'Order has already been delivered' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
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

  const { error: assignmentError } = await supabase
    .from('delivery_assignments')
    .update({ status: 'delivered', delivered_at: now })
    .eq('id', assignment.id);
  if (assignmentError) return { success: false, error: 'Failed to mark delivered' };

  const { error: orderError } = await supabase
    .from('orders')
    .update({ status: 'delivered', delivered_at: now })
    .eq('id', orderId);
  if (orderError) return { success: false, error: 'Failed to mark delivered' };

  const partner = await deliveryRepository.getPartnerByUserId(user.id);
  await supabase
    .from('delivery_partners')
    .update({ is_online: false, total_deliveries: (partner?.total_deliveries ?? 0) + 1 })
    .eq('id', user.id);

  return { success: true };
}

export async function getCustomerDeliveryInfo(orderId: string) {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { data: order } = await supabase
    .from('orders')
    .select('user_id, status, payment_method, payment_status, delivery_partner_id, total, order_type')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.user_id !== user.id) return { success: false, error: 'Unauthorized' };

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
        total: order.total,
      },
    };
  }

  const assignment = await deliveryRepository.getAssignmentByOrderId(orderId);
  const partner = order.delivery_partner_id
    ? await supabase.from('profiles').select('full_name, phone').eq('id', order.delivery_partner_id).maybeSingle()
    : { data: null };

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
      partner: partner?.data
        ? { fullName: partner.data.full_name ?? null, phone: partner.data.phone ?? null }
        : null,
      payment: { method: order.payment_method, status: order.payment_status },
      total: order.total,
    },
  };
}
