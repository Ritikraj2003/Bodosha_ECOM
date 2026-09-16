'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, ShoppingBag, RefreshCw, Check, X, ChefHat, PackageCheck, Ban } from 'lucide-react';
import { getOrders, updateOrderStatus, getOrderCounts } from '@/features/orders/actions';
import type { Order, OrderStatus, OrdersFilter } from '@/features/orders/types';
import { canTransition, orderTypeLabel } from '@/features/orders/types';
import { Skeleton, EmptyState, StatusBadge } from '@/components/ui';
import { getMerchantRestaurant } from '@/features/restaurants/actions';
import { createClient } from '@/infrastructure/supabase/client';
import { usePolling } from '@/hooks/usePolling';

const POLL_INTERVAL_MS = 30_000;

const statusTabs: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const actionsList: { label: string; status: OrderStatus; icon: React.ElementType; color: string }[] = [
  { label: 'Accept', status: 'accepted', icon: Check, color: 'bg-green-500 hover:bg-green-600' },
  { label: 'Preparing', status: 'preparing', icon: ChefHat, color: 'bg-indigo-500 hover:bg-indigo-600' },
  { label: 'Ready', status: 'ready', icon: PackageCheck, color: 'bg-emerald-500 hover:bg-emerald-600' },
  { label: 'Complete', status: 'completed', icon: Check, color: 'bg-green-600 hover:bg-green-700' },
  { label: 'Decline', status: 'declined', icon: X, color: 'bg-red-500 hover:bg-red-600' },
  { label: 'Cancel', status: 'cancelled', icon: Ban, color: 'bg-red-600 hover:bg-red-700' },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<OrderStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const showToastRef = useRef<(msg: string) => void>(() => {});
  const silentFetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchOrders = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    const filter: OrdersFilter = { status: currentTab, page, pageSize: 20, sortBy: 'created_at', sortOrder: 'desc' };
    if (search) filter.search = search;
    const [oRes, cRes] = await Promise.all([getOrders(filter), getOrderCounts()]);
    if (oRes.success && oRes.data) { setOrders(oRes.data.orders); setTotalPages(oRes.data.totalPages); }
    if (cRes.success && cRes.data) setCounts(cRes.data);
    if (isInitial) setIsLoading(false);
  }, [currentTab, page, search]);

  useEffect(() => {
    showToastRef.current = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    };
  });

  useEffect(() => {
    silentFetchRef.current = async () => {
      const filter: OrdersFilter = { status: currentTab, page, pageSize: 20, sortBy: 'created_at', sortOrder: 'desc' };
      if (search) filter.search = search;
      const [oRes, cRes] = await Promise.all([getOrders(filter), getOrderCounts()]);
      if (oRes.success && oRes.data) { setOrders(oRes.data.orders); setTotalPages(oRes.data.totalPages); }
      if (cRes.success && cRes.data) setCounts(cRes.data);
    };
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchOrders(true);
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [fetchOrders]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await getMerchantRestaurant();
      if (!mounted) return;
      if (res.success && res.data) setRestaurantId(res.data.id);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel('merchant-orders-page')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          showToastRef.current('New order received!');
          silentFetchRef.current();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId]);

  usePolling(() => { silentFetchRef.current(); }, POLL_INTERVAL_MS);

  const handleAction = async (orderId: string, status: OrderStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    if ((status === 'declined' || status === 'cancelled') && !prompt(`Reason for ${status}? (optional)`)) return;
    setActionLoading(orderId);
    await updateOrderStatus(orderId, status);
    setActionLoading(null);
    fetchOrders();
  };

  const tabCount = (tab: string) => {
    if (tab === 'all') return Object.values(counts).reduce((a, b) => a + b, 0);
    return counts[tab] ?? 0;
  };

  const getAvailableActions = (order: Order) => {
    return actionsList.filter((a) => canTransition(order.status, a.status));
  };

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-zred text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">Orders</h1>
        <button onClick={() => fetchOrders()} aria-label="Refresh orders" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {statusTabs.map((tab) => (
          <button key={tab.value} onClick={() => { setCurrentTab(tab.value); setPage(1); }}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === tab.value ? 'bg-zred text-white shadow-z' : 'bg-zcard text-ztext-light hover:bg-zgray border border-zborder'
            }`}>
            {tab.label} {tabCount(tab.value) > 0 && <span className="ml-1.5 text-xs opacity-70">({tabCount(tab.value)})</span>}
          </button>
        ))}
      </div>

      <div className="relative max-w-xs mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by tracking code..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zborder text-sm focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No orders found" description={currentTab !== 'all' ? `No ${currentTab} orders.` : 'No orders yet.'} />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="bg-zcard rounded-xl border border-zborder p-4 hover:shadow-z transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ztext">{order.tracking_code}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-ztext-lighter">
                    <span>₹{order.total}</span>
                    <span>{order.order_items?.length ?? 0} items</span>
                    <span>{order.payment_method?.toUpperCase() ?? 'N/A'}</span>
                    {order.order_type && <span className="text-ztext-muted">{orderTypeLabel(order.order_type)}</span>}
                    {order.customer_name && <span className="truncate">{order.customer_name}</span>}
                  </div>
                  <p className="text-xs text-ztext-muted mt-1.5">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {getAvailableActions(order).map((action) => (
                    <button key={action.status} onClick={(e) => handleAction(order.id, action.status, e)}
                      disabled={actionLoading === order.id}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${action.color}`}>
                      <action.icon size={12} />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              {order.delivery_notes && (
                <p className="mt-2 text-xs text-ztext-muted bg-zgray rounded-lg px-3 py-1.5">
                  Note: {order.delivery_notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm rounded-lg border border-zborder hover:bg-zgray disabled:opacity-40">Previous</button>
          <span className="text-xs text-ztext-lighter">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm rounded-lg border border-zborder hover:bg-zgray disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
