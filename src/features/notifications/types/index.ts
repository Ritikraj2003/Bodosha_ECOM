export interface Notification {
  id: string;
  user_id: string;
  type: 'order' | 'payment' | 'bnpl' | 'system' | 'promo';
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsFilter {
  type?: Notification['type'] | 'all';
  is_read?: boolean;
  page?: number;
  pageSize?: number;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
