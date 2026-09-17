'use server';

import { adminRepository } from '../repositories';
import { getServerSession, getServerProfile } from '@/features/auth/actions';
import { clearSettingsCache, getOwnerEmail } from '@/lib/settings';
import { revalidatePath } from 'next/cache';
import { isOwnerEmail } from '@/config/auth-access';
import type { AdminFilter, SystemSetting } from '../types';

import { getAdminEmails } from '@/lib/settings';
import { isAdminEmail } from '@/config/auth-access';
import { query } from '@/infrastructure/db';

export async function authorizeAdmin() {
  const { user } = await getServerSession();
  if (!user) throw new Error('Unauthorized');

  const { profile } = await getServerProfile();

  const adminEmails = await getAdminEmails();
  const isAdminByEmail = isAdminEmail(user.email, adminEmails);
  const isAdminBySession = user.role === 'admin' || user.role === 'super_admin';
  const ownerEmail = await getOwnerEmail();
  const isOwner = isOwnerEmail(user.email, ownerEmail);

  if (!profile && (isAdminByEmail || isAdminBySession || isOwner)) {
    try {
      await query(`
        INSERT INTO public.profiles (id, email, full_name, role, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
      `, [user.id, user.email, user.fullName, user.role || 'admin']);
    } catch {}
  }

  const effectiveRole = profile?.role || user.role;
  const isAuthorized =
    ['admin', 'super_admin', 'staff', 'manager', 'owner'].includes(effectiveRole ?? '') ||
    ((user as any).permissions && (user as any).permissions.length > 0) ||
    isAdminByEmail ||
    isOwner;

  if (!isAuthorized) throw new Error('Forbidden');
  return {
    user,
    profile: profile ?? {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: (effectiveRole as 'admin' | 'super_admin') || 'admin',
      is_active: true,
    },
  };
}

export async function getAdminDashboard() {
  try {
    await authorizeAdmin();
    const stats = await adminRepository.getDashboardStats();
    return { success: true, data: stats };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminStudents(filter: AdminFilter) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getStudents(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminStudentById(id: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getStudentById(id);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function suspendStudent(id: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.updateStudentStatus(id, false);
    await adminRepository.createAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'suspend',
      new_data: { is_active: false, reason },
      old_data: { is_active: true },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function unsuspendStudent(id: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.updateStudentStatus(id, true);
    await adminRepository.createAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'unsuspend',
      new_data: { is_active: true, reason },
      old_data: { is_active: false },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function verifyStudent(id: string, creditLimit: number = 0) {
  try {
    const { user } = await authorizeAdmin();
    const student = await adminRepository.getStudentById(id);
    if (!student) return { success: false, error: 'Student not found' };
    const w = Array.isArray(student.wallet) ? student.wallet[0] : student.wallet;
    if (!w) return { success: false, error: 'No wallet account' };
    
    await query(`UPDATE public.wallets SET status = 'active', credit_limit = $1, updated_at = NOW() WHERE id = $2`, [creditLimit, w.id]);

    await adminRepository.createAuditLog({
      table_name: 'wallets',
      record_id: w.id,
      action: 'verify',
      new_data: { status: 'active', credit_limit: creditLimit },
      old_data: { status: w.status },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function resetStudentVerification(id: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await query(`UPDATE public.wallets SET status = 'pending', updated_at = NOW() WHERE user_id = $1`, [id]);

    await adminRepository.createAuditLog({
      table_name: 'wallets',
      record_id: id,
      action: 'reset_verification',
      new_data: { status: 'pending', reason },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getAdminMerchants(filter: AdminFilter) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getMerchants(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminMerchantById(id: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getMerchantById(id);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function approveMerchant(merchantId: string, restaurantId: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.approveMerchant(merchantId, restaurantId);
    await adminRepository.createAuditLog({
      table_name: 'restaurants',
      record_id: restaurantId,
      action: 'approve',
      new_data: { status: 'active' },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rejectMerchant(merchantId: string, restaurantId: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.rejectMerchant(merchantId, restaurantId);
    await adminRepository.createAuditLog({
      table_name: 'restaurants',
      record_id: restaurantId,
      action: 'reject',
      new_data: { status: 'closed', reason },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function suspendMerchant(id: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.updateMerchantStatus(id, false);
    await adminRepository.createAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'suspend',
      new_data: { is_active: false, reason },
      old_data: { is_active: true },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function restoreMerchant(id: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.updateMerchantStatus(id, true);
    await adminRepository.createAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'restore',
      new_data: { is_active: true, reason },
      old_data: { is_active: false },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function updateMerchantCommission(merchantId: string, commissionRate: number) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.updateCommission(merchantId, commissionRate);
    await adminRepository.createAuditLog({
      table_name: 'restaurant_settings',
      record_id: merchantId,
      action: 'update_commission',
      new_data: { commission_rate: commissionRate },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getAdminOrders(filter: AdminFilter & { restaurantId?: string }) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getOrders(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminOrderById(id: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getOrderById(id);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAvailableDeliveryPartners() {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getAvailableDeliveryPartners();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function assignDeliveryPartner(orderId: string, partnerId: string) {
  try {
    const { user } = await authorizeAdmin();
    const order = await adminRepository.getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found' };
    if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
      return { success: false, error: 'Cannot assign delivery partner to takeaway or in-store orders' };
    }

    await adminRepository.assignDeliveryPartner(orderId, partnerId);
    await adminRepository.createAuditLog({
      table_name: 'orders',
      record_id: orderId,
      action: 'assign_delivery_partner',
      new_data: { delivery_partner_id: partnerId },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function regenerateOrderQr(orderId: string) {
  try {
    const { user } = await authorizeAdmin();
    const order = await adminRepository.getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found' };
    if (order.order_type === 'takeaway' || order.order_type === 'dine_in' || order.order_type === 'in_store') {
      return { success: false, error: 'Pickup QR is not applicable for takeaway or in-store orders' };
    }
    if (['delivered', 'completed', 'cancelled', 'declined'].includes(order.status)) {
      return { success: false, error: 'Order is already finished' };
    }

    const { signQrToken, isQrConfigured } = await import('@/features/delivery/lib/security');
    const { getNumericSetting } = await import('@/lib/settings');
    if (!isQrConfigured()) return { success: false, error: 'Delivery QR is not configured on the server' };

    const qrExpiryMinutes = await getNumericSetting('telegram_qr_expiry_minutes', 30);
    const token = signQrToken(order.tracking_code, qrExpiryMinutes);
    const expiresAt = new Date(Date.now() + qrExpiryMinutes * 60 * 1000).toISOString();

    // Persisting the token is best-effort (needs the pickup_qr_token column).
    try {
      await query(`UPDATE public.orders SET pickup_qr_token = $1 WHERE id = $2`, [token, orderId]);
    } catch {}

    await adminRepository.createAuditLog({
      table_name: 'orders',
      record_id: orderId,
      action: 'regenerate_pickup_qr',
      new_data: { expires_at: expiresAt },
      changed_by: user.id,
    }).catch(() => {});

    return { success: true, data: { token, expiresAt } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function forceUpdateOrderStatus(orderId: string, newStatus: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const order = await adminRepository.getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found' };
    await adminRepository.updateOrderStatus(orderId, newStatus, reason);
    await adminRepository.createAuditLog({
      table_name: 'orders',
      record_id: orderId,
      action: 'force_update',
      new_data: { status: newStatus, reason },
      old_data: { status: order.status },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function cancelOrderByAdmin(orderId: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const order = await adminRepository.getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found' };
    await adminRepository.updateOrderStatus(orderId, 'cancelled', reason);
    await adminRepository.createAuditLog({
      table_name: 'orders',
      record_id: orderId,
      action: 'cancel',
      new_data: { status: 'cancelled', reason },
      old_data: { status: order.status },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getAdminCreditAccounts(filter: AdminFilter) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getCreditAccounts(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminCreditAccountById(id: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getCreditAccountById(id);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function increaseCreditLimit(accountId: string, newLimit: number, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const account = await adminRepository.getCreditAccountById(accountId);
    if (!account) return { success: false, error: 'Account not found' };
    if (newLimit <= account.credit_limit) return { success: false, error: 'New limit must be higher' };
    const updated = await adminRepository.updateCreditLimit(accountId, newLimit);
    await adminRepository.createAuditLog({
      table_name: 'credit_accounts',
      record_id: accountId,
      action: 'credit_limit_increase',
      new_data: { credit_limit: newLimit, reason },
      old_data: { credit_limit: account.credit_limit },
      changed_by: user.id,
    });
    return { success: true, data: updated };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function reduceCreditLimit(accountId: string, newLimit: number, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const account = await adminRepository.getCreditAccountById(accountId);
    if (!account) return { success: false, error: 'Account not found' };
    if (newLimit >= account.credit_limit) return { success: false, error: 'New limit must be lower' };
    const updated = await adminRepository.updateCreditLimit(accountId, newLimit);
    await adminRepository.createAuditLog({
      table_name: 'credit_accounts',
      record_id: accountId,
      action: 'credit_limit_reduction',
      new_data: { credit_limit: newLimit, reason },
      old_data: { credit_limit: account.credit_limit },
      changed_by: user.id,
    });
    return { success: true, data: updated };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function freezeCredit(accountId: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const account = await adminRepository.getCreditAccountById(accountId);
    if (!account) return { success: false, error: 'Account not found' };
    await adminRepository.updateCreditStatus(accountId, 'frozen');
    await adminRepository.createAuditLog({
      table_name: 'credit_accounts',
      record_id: accountId,
      action: 'freeze',
      new_data: { status: 'frozen', reason },
      old_data: { status: account.status },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function unfreezeCredit(accountId: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    const account = await adminRepository.getCreditAccountById(accountId);
    if (!account) return { success: false, error: 'Account not found' };
    await adminRepository.updateCreditStatus(accountId, 'active');
    await adminRepository.createAuditLog({
      table_name: 'credit_accounts',
      record_id: accountId,
      action: 'unfreeze',
      new_data: { status: 'active', reason },
      old_data: { status: account.status },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function waiveLateFee(accountId: string, repaymentId: string, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.waiveLateFee(repaymentId);
    await adminRepository.createAuditLog({
      table_name: 'credit_repayments',
      record_id: repaymentId,
      action: 'waive_late_fee',
      new_data: { late_fee_applied: 0, reason },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getCreditTransactions(accountId: string, page = 1, pageSize = 50) {
  try {
    await authorizeAdmin();
    const offset = (page - 1) * pageSize;
    const { data, total } = await adminRepository.getCreditTransactions(accountId, pageSize, offset);
    return { success: true, data: { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminPayments(filter: AdminFilter) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getPayments(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function processRefund(paymentId: string, amount: number, reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.processRefund(paymentId, amount, reason);
    await adminRepository.createAuditLog({
      table_name: 'payments',
      record_id: paymentId,
      action: 'refund',
      new_data: { refund_amount: amount, reason },
      changed_by: user.id,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

const DEFAULT_SYSTEM_SETTINGS = [
  // Payment Methods
  { key: 'payment_method_wallet_enabled', value: 'true', type: 'boolean', description: 'Allow Wallet payments at checkout' },
  { key: 'payment_method_razorpay_enabled', value: 'true', type: 'boolean', description: 'Allow Razorpay payments at checkout' },
  { key: 'payment_method_phonepe_enabled', value: 'false', type: 'boolean', description: 'Allow PhonePe payments at checkout' },
  { key: 'payment_method_gpay_enabled', value: 'false', type: 'boolean', description: 'Allow Google Pay payments at checkout' },
  { key: 'payment_method_cod_enabled', value: 'true', type: 'boolean', description: 'Allow Cash on Delivery at checkout' },
  // Payment credentials
  { key: 'razorpay_key_id', value: 'rzp_live_TPjId0t9vHIcIt', type: 'string', description: 'Razorpay Key ID (public)' },
  { key: 'razorpay_key_secret', value: '86R3iHMLhSHdE95XKLMsSRCh', type: 'string', description: 'Razorpay Key Secret (confidential)' },
  { key: 'phonepe_merchant_id', value: '', type: 'string', description: 'PhonePe merchant ID' },
  { key: 'phonepe_salt_key', value: '', type: 'string', description: 'PhonePe salt key (confidential)' },
  { key: 'phonepe_salt_index', value: '1', type: 'number', description: 'PhonePe salt index' },
  { key: 'gpay_upi_id', value: '', type: 'string', description: 'Google Pay / UPI ID (name@bank)' },
  { key: 'gpay_upi_name', value: '', type: 'string', description: 'Merchant name shown for Google Pay UPI' },
  { key: 'store_upi_id', value: '', type: 'string', description: 'Direct UPI id for QR / intent payments' },
  { key: 'store_upi_name', value: '', type: 'string', description: 'UPI payee name' },
  // Contact
  { key: 'contact_enabled', value: 'true', type: 'boolean', description: 'Links and details shown across the store (footer, contact, checkout).' },
  { key: 'store_support_phone', value: '', type: 'string', description: 'Owner support phone shown across the store' },
  { key: 'store_support_email', value: '', type: 'string', description: 'Owner support email' },
  { key: 'notification_email', value: 'dilipda725@gmail.com', type: 'string', description: 'Email that receives order notifications (falls back to store support email / NOTIFICATION_EMAIL)' },
  { key: 'store_address', value: 'CIT, gate number 2', type: 'string', description: 'Store address shown in footer / contact' },
  { key: 'store_whatsapp', value: '', type: 'string', description: 'WhatsApp number or wa.me link' },
  { key: 'store_instagram', value: '', type: 'string', description: 'Instagram profile URL' },
  { key: 'store_facebook', value: '', type: 'string', description: 'Facebook page URL' },
  { key: 'store_website', value: '', type: 'string', description: 'Store website URL' },
  // Delivery
  { key: 'delivery_available', value: 'true', type: 'boolean', description: 'Whether delivery is currently available (ON/OFF)' },
  { key: 'delivery_unavailable_message', value: 'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.', type: 'string', description: 'Message displayed on storefront when delivery is unavailable' },
  { key: 'delivery_person_name', value: 'Dilip Da Delivery', type: 'string', description: 'Delivery person name' },
  { key: 'delivery_person_phone', value: '6000212823', type: 'string', description: 'Delivery person phone number' },
  { key: 'delivery_fixed_slots_enabled', value: 'true', type: 'boolean', description: 'Enable fixed delivery slots system (ON/OFF)' },
  { key: 'delivery_slots', value: '[{"id":"slot-1","label":"Slot 1","delivery_time":"13:30","cutoff_time":"13:15","is_enabled":true},{"id":"slot-2","label":"Slot 2","delivery_time":"15:00","cutoff_time":"14:45","is_enabled":true}]', type: 'json', description: 'Fixed delivery slot configuration (JSON)' },
  { key: 'delivery_custom_message_enabled', value: 'false', type: 'boolean', description: 'Enable custom delivery announcement message (ON/OFF)' },
  { key: 'delivery_custom_message', value: 'Due to high demand, deliveries may take longer than usual today.', type: 'string', description: 'Custom delivery announcement message' },
  { key: 'delivery_person_emails', value: '', type: 'string', description: 'Emails allowed to sign up as delivery partners. Separate multiple emails with commas or new lines.' },
  // Admin / Owner
  { key: 'admin_emails', value: 'lastw5232@gmail.com', type: 'string', description: 'Emails allowed to sign up as store administrators. Separate multiple emails with commas or new lines.' },
  { key: 'dilip_da_email', value: 'dronsharma9435@gmail.com , s02556646@gmail.com ,', type: 'string', description: 'Store owner email (Dilip Da). Gets a read-only view of the dashboard.' },
  // Telegram
  { key: 'telegram_enabled', value: 'true', type: 'boolean', description: 'Order notifications delivered to the owner chat.' },
  { key: 'telegram_bot_token', value: '8769690254:AAH7blyJZF1MuReE', type: 'string', description: 'Telegram bot token (confidential)' },
  { key: 'telegram_chat_id', value: '8955185773', type: 'string', description: 'Telegram chat id to receive order updates' },
  { key: 'telegram_show_qr', value: 'true', type: 'boolean', description: 'Send pickup QR image in Telegram order notifications' },
  { key: 'telegram_qr_expiry_minutes', value: '15', type: 'number', description: 'Expiry duration for the Telegram pickup QR in minutes' },
  // SMTP
  { key: 'smtp_enabled', value: 'true', type: 'boolean', description: 'Used for OTP and order emails.' },
  { key: 'smtp_host', value: 'smtp.gmail.com', type: 'string', description: 'SMTP host' },
  { key: 'smtp_port', value: '587', type: 'number', description: 'SMTP port' },
  { key: 'smtp_user', value: 'dilipda725@gmail.com', type: 'string', description: 'SMTP username (confidential)' },
  { key: 'smtp_pass', value: 'khzg kwar otjw wigu', type: 'string', description: 'SMTP password (confidential)' },
  { key: 'smtp_from', value: 'Dilip Da dilipda725@gmail.com', type: 'string', description: 'From address for outgoing mail' },
  // Pricing
  { key: 'pricing_enabled', value: 'true', type: 'boolean', description: 'Applied to cart at checkout and wallet overdraft.' },
  { key: 'delivery_fee', value: '10', type: 'number', description: 'Flat delivery fee for hostel delivery' },
  { key: 'maintenance_fee', value: '0', type: 'number', description: 'Flat maintenance fee charged per order' },
  { key: 'wallet_credit_limit', value: '0', type: 'number', description: 'Wallet overdraft limit (how far a wallet balance can go negative)' },
  // Packaging
  { key: 'packaging_charge', value: '0', type: 'number', description: 'Packaging charge applied per order at checkout' },
  { key: 'packaging_charge_enabled', value: 'true', type: 'boolean', description: 'Configure the cost per big and small packaging unit used per product.' },
  { key: 'packaging_big_packet_price', value: '0', type: 'number', description: 'Price per big packaging unit (₹)' },
  { key: 'packaging_small_packet_price', value: '0', type: 'number', description: 'Price per small packaging unit (₹)' },
  // Store hours & other
  { key: 'other_enabled', value: 'true', type: 'boolean', description: 'Storefront hours, delivery areas and platform rules.' },
  { key: 'store_hours_open', value: '16:00', type: 'string', description: 'Store opening time' },
  { key: 'store_hours_close', value: '21:30', type: 'string', description: 'Store closing time' },
  { key: 'store_temp_close_until', value: '', type: 'string', description: 'Temporarily close today until this time (HH:MM). Leave empty to disable.' },
  { key: 'store_order_cutoff_lunch', value: '', type: 'string', description: 'Order cutoff for lunch' },
  { key: 'store_order_cutoff_dinner', value: '', type: 'string', description: 'Order cutoff for dinner' },
  { key: 'store_delivery_locations', value: '["SNM, CIT Kokrajhar","SJ, CIT Kokrajhar","JD, CIT Kokrajhar","Staff Quarter, CIT Kokrajhar","Gambari Girls Hostel, CIT Kokrajhar","Mtech Quarter, CIT Kokrajhar"]', type: 'json', description: 'Delivery locations shown at checkout (JSON array)' },
  { key: 'cancellation_window_minutes', value: '2', type: 'number', description: 'Minutes after placing an order during which the customer can cancel it' },
  { key: 'maintenance_mode', value: 'false', type: 'boolean', description: 'Enable maintenance mode for the platform' },
];

export async function getSystemSettings() {
  try {
    await authorizeAdmin();
    const raw = await adminRepository.getSystemSettings();
    const keysPresent = new Set(raw.map((s) => s.key));
    const merged = [...raw];
    for (const def of DEFAULT_SYSTEM_SETTINGS) {
      if (!keysPresent.has(def.key)) {
        merged.push({
          id: def.key,
          key: def.key,
          value: def.value,
          type: def.type,
          is_secret: false,
          description: def.description,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as SystemSetting);
      }
    }
    const data = merged.map((s) => ({ ...s, has_value: !!s.value }));
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

function validateSettingValue(setting: { type: string }, value: string): string | null {
  const num = Number(value);
  switch (setting.type) {
    case 'number':
      if (value.trim() !== '' && (!Number.isFinite(num) || num < 0)) return 'Value must be a non-negative number';
      return null;
    case 'boolean':
      if (value.trim() !== '' && value !== 'true' && value !== 'false') return 'Value must be true or false';
      return null;
    case 'json':
      if (value.trim() === '') return null;
      try {
        JSON.parse(value);
      } catch {
        return 'Value must be valid JSON';
      }
      return null;
    default:
      return null;
  }
}

export async function updateSystemSetting(id: string, value: string) {
  try {
    const { user } = await authorizeAdmin();
    const all = await adminRepository.getSystemSettings();
    let setting = all.find((s) => s.id === id || s.key === id);

    if (!setting) {
      const settingType = id.endsWith('_slots') || id.includes('locations') ? 'json'
        : id.includes('enabled') || id.includes('available') ? 'boolean'
        : 'string';
      const createdRes = await query(`
        INSERT INTO public.system_settings (key, value, type)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        RETURNING *
      `, [id, value, settingType]);
      if (createdRes.rows.length > 0) {
        setting = createdRes.rows[0] as unknown as typeof all[0];
      }
    }

    if (!setting) return { success: false, error: 'Setting not found' };

    const validationError = validateSettingValue(setting, value);
    if (validationError) return { success: false, error: validationError };

    await adminRepository.updateSystemSetting(setting.id, value, user.id);
    await adminRepository.createAuditLog({
      table_name: 'system_settings',
      record_id: setting.key,
      action: 'update_setting',
      old_data: { key: setting.key, value: setting.value ?? '' },
      new_data: { key: setting.key, value },
      changed_by: user.id,
    });
    clearSettingsCache();
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getAuditLogs(filter: AdminFilter & { tableName?: string }) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getAuditLogs(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getUserOrderHistory(userId: string, page = 1) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getUserOrderHistory(userId, page);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getStudentCreditHistory(userId: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getStudentCreditHistory(userId);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getMerchantRevenue(merchantId: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getMerchantRevenue(merchantId);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getMerchantAnalytics(merchantId: string) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getMerchantAnalytics(merchantId);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getStudentPaymentHistory(userId: string, page = 1) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getStudentPaymentHistory(userId, page);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function bulkSuspendStudents(userIds: string[], reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.bulkUpdateStudentStatus(userIds, false);
    for (const id of userIds) {
      await adminRepository.createAuditLog({
        table_name: 'profiles',
        record_id: id,
        action: 'bulk_suspend',
        new_data: { is_active: false, reason },
        changed_by: user.id,
      });
    }
    return { success: true, count: userIds.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkUnsuspendStudents(userIds: string[], reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.bulkUpdateStudentStatus(userIds, true);
    for (const id of userIds) {
      await adminRepository.createAuditLog({
        table_name: 'profiles',
        record_id: id,
        action: 'bulk_unsuspend',
        new_data: { is_active: true, reason },
        changed_by: user.id,
      });
    }
    return { success: true, count: userIds.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkSuspendMerchants(userIds: string[], reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.bulkUpdateMerchantStatus(userIds, false);
    for (const id of userIds) {
      await adminRepository.createAuditLog({
        table_name: 'profiles',
        record_id: id,
        action: 'bulk_suspend',
        new_data: { is_active: false, reason },
        changed_by: user.id,
      });
    }
    return { success: true, count: userIds.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkRestoreMerchants(userIds: string[], reason: string) {
  try {
    const { user } = await authorizeAdmin();
    await adminRepository.bulkUpdateMerchantStatus(userIds, true);
    for (const id of userIds) {
      await adminRepository.createAuditLog({
        table_name: 'profiles',
        record_id: id,
        action: 'bulk_restore',
        new_data: { is_active: true, reason },
        changed_by: user.id,
      });
    }
    return { success: true, count: userIds.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getLowStockProducts() {
  try {
    await authorizeAdmin();
    const { getNumericSetting } = await import('@/lib/settings');
    const threshold = await getNumericSetting('inventory_threshold', 5);
    const data = await adminRepository.getLowStockProducts(threshold);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getRecentPayments() {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getRecentPayments(20);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getAdminUsers(filter: AdminFilter = {}) {
  try {
    await authorizeAdmin();
    const data = await adminRepository.getUsers(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function deleteUser(userId: string) {
  try {
    await authorizeAdmin();

    await query('UPDATE public.orders SET user_id = null WHERE user_id = $1', [userId]);
    await query('UPDATE public.orders SET delivery_partner_id = null WHERE delivery_partner_id = $1', [userId]);
    await query('UPDATE public.payments SET user_id = null WHERE user_id = $1', [userId]);
    await query('UPDATE public.restaurants SET owner_id = null WHERE owner_id = $1', [userId]);
    await query('UPDATE public.audit_logs SET user_id = null WHERE user_id = $1', [userId]);
    await query('UPDATE public.restaurant_settings SET created_by = null WHERE created_by = $1', [userId]);
    await query('DELETE FROM public.profiles WHERE id = $1', [userId]);
    await query('DELETE FROM public.users WHERE id = $1', [userId]);

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
