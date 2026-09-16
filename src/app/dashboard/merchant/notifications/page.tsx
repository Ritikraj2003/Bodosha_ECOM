'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, MailOpen } from 'lucide-react';
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from '@/features/notifications/actions';
import type { Notification, NotificationsFilter } from '@/features/notifications/types';
import { Skeleton, EmptyState } from '@/components/ui';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<NotificationsFilter['type'] | 'all'>('all');
  const [pageSize] = useState(20);

const loadNotifications = async () => {
    setLoading(true);
    const res = await getMyNotifications({ type: filter, page, pageSize });
    if (res.success && res.data) {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
      setTotal(res.data.total);
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadNotifications();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    loadNotifications();
  };

  const typeColors: Record<string, string> = {
    order: '#EF4444', payment: '#10b981', bnpl: '#6366f1', system: '#f59e0b', promo: '#8b5cf6',
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ztext">Notifications</h1>
          {unreadCount > 0 && <p className="text-xs text-ztext-lighter mt-0.5">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="inline-flex items-center gap-1.5 px-4 py-2 bg-zgray text-ztext-light text-sm font-medium rounded-xl hover:bg-zsurface transition-colors">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {(['all', 'order', 'payment', 'bnpl', 'system'] as const).map((t) => (
          <button key={t} onClick={() => { setFilter(t); setPage(1); }}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === t ? 'bg-zred text-white' : 'bg-zcard text-ztext-light border border-zborder hover:bg-zgray'
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description={filter !== 'all' ? `No ${filter} notifications.` : 'You\'re all caught up!'} />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} onClick={() => !n.is_read && handleMarkRead(n.id)}
              className={`bg-zcard rounded-xl border p-4 flex items-start gap-3 cursor-pointer transition-all hover:shadow-z ${
                !n.is_read ? 'border-zred/20 bg-red-500/10/30' : 'border-zborder'
              }`}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${typeColors[n.type]}15` }}>
                <Bell size={16} style={{ color: typeColors[n.type] }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm ${!n.is_read ? 'font-semibold text-ztext' : 'font-medium text-ztext-light'}`}>{n.title}</h2>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-zred shrink-0" />}
                </div>
                {n.body && <p className="text-xs text-ztext-lighter mt-0.5">{n.body}</p>}
                <p className="text-[10px] text-ztext-muted mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.is_read && (
                <button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }} className="p-1.5 rounded-lg hover:bg-zgray text-ztext-muted hover:text-ztext-light transition-colors shrink-0">
                  <MailOpen size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
