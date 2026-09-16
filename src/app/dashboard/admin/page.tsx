'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Users, ShoppingBag, IndianRupee, TrendingUp, Clock, Store, AlertTriangle } from 'lucide-react';
import { getAdminDashboard, getAdminOrders } from '@/features/admin/actions';
import type { DashboardStats, AdminOrder } from '@/features/admin/types';
import Link from 'next/link';
import { createClient } from '@/infrastructure/supabase/client';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const supabase = createClient();
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        getAdminDashboard(),
        getAdminOrders({ page: 1, pageSize: 10, sortBy: 'created_at', sortOrder: 'desc' }),
      ]);
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      } else if (statsRes.error) {
        setError(statsRes.error);
      }
      if (ordersRes.success && ordersRes.data) setRecentOrders(ordersRes.data.data as AdminOrder[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

  if (loading) return <Skeleton />;

  const primaryCards = [
    { label: 'Total Users', value: stats?.total_users ?? 0, icon: Users, desc: 'Registered accounts' },
    { label: 'Total Orders', value: stats?.total_orders ?? 0, icon: ShoppingBag, desc: 'All time' },
    { label: 'Total Revenue', value: fmt(stats?.total_revenue ?? 0), icon: IndianRupee, desc: 'All time revenue' },
    // { label: 'BNPL Outstanding', value: fmt(stats?.bnpl_outstanding ?? 0), icon: Wallet, desc: 'Active credit' },
  ];

  const secondaryCards = [
    { label: "Today's Revenue", value: fmt(stats?.today_revenue ?? 0), icon: TrendingUp },
    { label: 'Active Orders', value: stats?.active_orders ?? 0, icon: Clock },
    { label: 'Pending Approvals', value: stats?.pending_merchant_approvals ?? 0, icon: Store },
    { label: 'Overdue Accounts', value: stats?.total_overdue_accounts ?? 0, icon: AlertTriangle },
  ];

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400', accepted: 'bg-blue-500/10 text-blue-400',
    preparing: 'bg-indigo-500/10 text-indigo-400', ready: 'bg-green-500/10 text-green-400',
    assigned: 'bg-purple-500/10 text-purple-400', out_for_delivery: 'bg-orange-500/10 text-orange-400',
    delivered: 'bg-emerald-500/10 text-emerald-400', completed: 'bg-emerald-500/10 text-emerald-400',
    cancelled: 'bg-red-500/10 text-red-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ztext">Dashboard</h1>
          <p className="text-sm text-ztext-light mt-0.5">Platform overview at a glance</p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors" aria-label="Refresh">
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-zred flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchData} className="px-3 py-1 bg-zred text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {primaryCards.map((card) => (
          <div key={card.label} className="bg-zcard rounded-xl shadow-z p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-ztext-lighter">{card.desc}</p>
              <card.icon size={18} className="text-ztext-muted" />
            </div>
            <p className="text-2xl font-bold text-ztext">{card.value}</p>
            <p className="text-sm text-ztext-light mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        {secondaryCards.map((card) => (
          <div key={card.label} className="bg-zcard rounded-xl shadow-z p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zred/10 flex items-center justify-center shrink-0">
              <card.icon size={18} className="text-zred" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-ztext">{card.value}</p>
              <p className="text-xs text-ztext-light truncate">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-zcard rounded-xl border border-zborder mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zborder">
          <h2 className="text-sm font-bold text-ztext">Recent Orders</h2>
          <Link href="/dashboard/admin/orders" className="text-xs font-medium text-zred hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zborder text-xs text-ztext-lighter">
                <th className="text-left px-5 py-3 font-medium">Tracking</th>
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-5 py-3 font-medium">Total</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-ztext-lighter">No orders yet</td></tr>
              ) : recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-zborder last:border-0 hover:bg-zgray/50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs font-medium text-ztext">{order.tracking_code}</span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm text-ztext-light">{order.user?.full_name ?? order.customer_name ?? 'Guest'}</p>
                    {/* BNPL badge — disabled
                    {order.payment_method === 'bnpl' && (
                      <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">BNPL</span>
                    )}
                    */}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-ztext">{fmt(Number(order.total))}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[order.status] ?? 'bg-zgray text-ztext-light'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className="text-xs text-ztext-lighter">{new Date(order.created_at).toLocaleDateString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats?.recent_activity && stats.recent_activity.length > 0 && (
        <div className="bg-zcard rounded-xl border border-zborder">
          <div className="px-5 py-4 border-b border-zborder">
            <h2 className="text-sm font-bold text-ztext">Recent Activity</h2>
          </div>
          <div className="divide-y divide-zborder">
            {stats.recent_activity.slice(0, 8).map((activity) => (
              <div key={activity.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-zred shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ztext-light">
                    <span className="font-medium text-ztext capitalize">{activity.action.replace(/_/g, ' ')}</span>
                    {' '}on <span className="font-medium text-ztext">{activity.entity_type}</span>
                  </p>
                  <p className="text-[11px] text-ztext-lighter">{activity.user_name}</p>
                </div>
                <span className="text-[11px] text-ztext-lighter shrink-0">{new Date(activity.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zcard rounded-xl shadow-z p-5">
            <div className="h-3 w-20 bg-zsurface rounded mb-3" />
            <div className="h-8 w-16 bg-zsurface rounded mb-2" />
            <div className="h-3 w-24 bg-zsurface rounded" />
          </div>
        ))}
      </div>
      <div className="bg-zcard rounded-xl border border-zborder p-5">
        <div className="h-4 w-24 bg-zsurface rounded mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-zsurface rounded mb-2" />
        ))}
      </div>
    </div>
  );
}
