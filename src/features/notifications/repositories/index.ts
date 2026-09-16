import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import type { Notification, NotificationsFilter, NotificationsResponse } from '../types';

export class NotificationRepository {
  async findByUser(userId: string, filter: NotificationsFilter = {}): Promise<NotificationsResponse> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return { notifications: [], total: 0, unread_count: 0, page: 1, pageSize: 20, totalPages: 0 };
    const { type, is_read, page = 1, pageSize = 20 } = filter;
    let query = supabase
      .from('notifications')
      .select('id, user_id, type, title, body, data, is_read, read_at, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (type && type !== 'all') query = query.eq('type', type);
    if (is_read !== undefined) query = query.eq('is_read', is_read);
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);
    const { data, count } = await query;
    const { count: unread } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    return {
      notifications: (data ?? []) as Notification[],
      total: count ?? 0,
      unread_count: unread ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);
    return !error;
  }

  async markAllAsRead(userId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    return !error;
  }

  async create(notification: {
    user_id: string;
    type: Notification['type'];
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Promise<Notification | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('notifications')
      .insert({
        user_id: notification.user_id,
        type: notification.type,
        title: notification.title,
        body: notification.body ?? null,
        data: notification.data ?? null,
      })
      .select('id, user_id, type, title, body, data, is_read, read_at, created_at')
      .single();
    return data as Notification | null;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return 0;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    return count ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
