'use server';

import { getServerSession } from '@/features/auth/actions';
import { notificationRepository } from '../repositories';
import type { NotificationsFilter, NotificationsResponse } from '../types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getMyNotifications(filter: NotificationsFilter = {}): Promise<ApiResponse<NotificationsResponse>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const result = await notificationRepository.findByUser(user.id, filter);
  return { success: true, data: result };
}

export async function markNotificationRead(notificationId: string): Promise<ApiResponse<void>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  await notificationRepository.markAsRead(notificationId, user.id);
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ApiResponse<void>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  await notificationRepository.markAllAsRead(user.id);
  return { success: true };
}

export async function getUnreadNotificationCount(): Promise<ApiResponse<number>> {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Unauthorized' };
  const count = await notificationRepository.getUnreadCount(user.id);
  return { success: true, data: count };
}
