'use server';

import { adminRepository } from '@/features/admin/repositories';
import { getExpenseSummary } from '@/features/expenses/actions';
import { getServerSession } from '@/features/auth/actions';
import { getOwnerEmail } from '@/lib/settings';
import { isOwnerEmail } from '@/config/auth-access';
import type { AdminFilter } from '@/features/admin/types';
import type { DateFilterType } from '@/features/expenses/types';

/**
 * Gate for the owner dashboard layout. Access is decided purely by the
 * owner email configured in General Settings (`dilip_da_email`).
 * The owner now has full admin access (via `authorizeAdmin`) except for
 * expenses which remain read-only on the frontend.
 */
export async function authorizeOwner() {
  const { user } = await getServerSession();
  if (!user) throw new Error('Unauthorized');
  if (!isOwnerEmail(user.email, await getOwnerEmail())) throw new Error('Forbidden');
  return { user };
}

export async function getOwnerDashboard() {
  try {
    await authorizeOwner();
    const stats = await adminRepository.getDashboardStats();
    return { success: true, data: stats };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getOwnerExpenseSummary(
  filter: DateFilterType = 'all',
  customStart?: string,
  customEnd?: string,
) {
  try {
    await authorizeOwner();
    return await getExpenseSummary(filter, customStart, customEnd);
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}

export async function getOwnerDeliveryPartners(filter: AdminFilter) {
  try {
    await authorizeOwner();
    const data = await adminRepository.getDeliveryPartners(filter);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message, data: null };
  }
}