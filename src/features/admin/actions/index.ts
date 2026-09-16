'use server';

import { adminRepository } from '../repositories';
import { getServerSession, getServerProfile } from '@/features/auth/actions';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { clearSettingsCache, getOwnerEmail } from '@/lib/settings';
import { revalidatePath } from 'next/cache';
import { isOwnerEmail } from '@/config/auth-access';
import type { AdminFilter, SystemSetting } from '../types';

import { getAdminEmails } from '@/lib/settings';
import { isAdminEmail } from '@/config/auth-access';
import { createServiceClient } from '@/infrastructure/supabase/service';

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
    const supabase = createServiceClient();
    if (supabase) {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role || 'admin',
        is_active: true,
      });
    }
  }

  const effectiveRole = profile?.role || user.role;
  const isAuthorized = ['admin', 'super_admin'].includes(effectiveRole ?? '') || isAdminByEmail || isOwner;

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
    
    const { createAdminClient } = await import('@/infrastructure/supabase/admin');
    const admin = createAdminClient();
    const { error } = await admin.from('wallets').update({ 
      status: 'active',
      credit_limit: creditLimit
    }).eq('id', w.id);
    if (error) throw new Error(error.message);

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
    const { createAdminClient } = await import('@/infrastructure/supabase/admin');
    const admin = createAdminClient();
    const { error } = await admin.from('wallets').update({ status: 'pending' }).eq('user_id', id);
    if (error) throw new Error(error.message);

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
      const admin = createAdminClient();
      const { error } = await admin
        .from('orders')
        .update({ pickup_qr_token: token })
        .eq('id', orderId);
      if (error) throw new Error(error.message);
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
  { key: 'packaging_charge', value: '0', type: 'number', description: 'Packaging charge (₹) applied per customer order at checkout' },
  { key: 'packaging_charge_enabled', value: 'true', type: 'boolean', description: 'Enable or disable dynamic packaging charge' },
  { key: 'packaging_big_packet_price', value: '3', type: 'number', description: 'Price per big packaging unit (₹)' },
  { key: 'packaging_small_packet_price', value: '2', type: 'number', description: 'Price per small packaging unit (₹)' },
  { key: 'telegram_qr_expiry_minutes', value: '30', type: 'number', description: 'Expiry duration for the Telegram pickup QR in minutes' },
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
      const { createAdminClient } = await import('@/infrastructure/supabase/admin');
      const admin = createAdminClient();
      const settingType = id.endsWith('_slots') || id.includes('locations') ? 'json'
        : id.includes('enabled') || id.includes('available') ? 'boolean'
        : 'string';
      const { data: created, error: createErr } = await admin
        .from('system_settings')
        .upsert({ key: id, value, type: settingType }, { onConflict: 'key' })
        .select()
        .single();
      if (!createErr && created) {
        setting = created as unknown as typeof all[0];
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
    const admin = createAdminClient();

    await admin.from('orders').update({ user_id: null }).eq('user_id', userId);
    await admin.from('orders').update({ delivery_partner_id: null }).eq('delivery_partner_id', userId);
    await admin.from('payments').update({ user_id: null }).eq('user_id', userId);
    await admin.from('restaurants').update({ owner_id: null }).eq('owner_id', userId);
    await admin.from('audit_logs').update({ changed_by: null }).eq('changed_by', userId);
    await admin.from('restaurant_settings').update({ created_by: null }).eq('created_by', userId);

    const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId);
    if (profileErr) throw new Error(profileErr.message);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
