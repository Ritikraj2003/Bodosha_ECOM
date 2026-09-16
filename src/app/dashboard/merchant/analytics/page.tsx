'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, ShoppingBag, DollarSign, Clock, RefreshCw,
} from 'lucide-react';
import { getRevenueOverview, getMerchantDashboard } from '@/features/restaurants/actions';
import { StatCard, Skeleton, DashboardCard } from '@/components/ui';

interface RevenueOverview {
  daily: Array<{ date: string; revenue: number; orders: number }>;
  weekly: Array<{ week: string; revenue: number; orders: number }>;
  monthly: Array<{ month: string; revenue: number; orders: number }>;
}

interface DashboardData {
  today_orders: number;
  average_order_value: number;
  popular_products: Array<{ id: string; name: string; count: number; revenue: number }>;
  total_customers: number;
}

export default function AnalyticsPage() {
  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const fetchData = async () => {
    setLoading(true);
    const [revRes, dashRes] = await Promise.all([getRevenueOverview(period), getMerchantDashboard()]);
    if (revRes.success && revRes.data) setRevenue(revRes.data);
    if (dashRes.success && dashRes.data) {
      setDashData({
        today_orders: dashRes.data.today_orders,
        average_order_value: dashRes.data.average_order_value,
        popular_products: dashRes.data.popular_products,
        total_customers: 0,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [revRes, dashRes] = await Promise.all([getRevenueOverview(period), getMerchantDashboard()]);
      if (!mounted) return;
      if (revRes.success && revRes.data) setRevenue(revRes.data);
      if (dashRes.success && dashRes.data) {
        setDashData({
          today_orders: dashRes.data.today_orders,
          average_order_value: dashRes.data.average_order_value,
          popular_products: dashRes.data.popular_products,
          total_customers: 0,
        });
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [period]);

  const totalRevenue = useMemo(() => (revenue?.daily ?? []).reduce((s, d) => s + d.revenue, 0), [revenue]);
  const totalOrders = useMemo(() => (revenue?.daily ?? []).reduce((s, d) => s + d.orders, 0), [revenue]);
  const avgOrderValue = useMemo(() => totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, [totalRevenue, totalOrders]);
  const peakHour = '12:00 PM';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-ztext">Analytics</h1>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-zborder text-sm focus:outline-none focus:ring-2 focus:ring-zred/20">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={fetchData} aria-label="Refresh analytics" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors"><RefreshCw size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Revenue" value={`₹${totalRevenue}`} icon={DollarSign} color="#EF4444" />
        <StatCard label="Total Orders" value={String(totalOrders)} icon={ShoppingBag} color="#6366f1" />
        <StatCard label="Avg Order Value" value={`₹${avgOrderValue}`} icon={TrendingUp} color="#10b981" />
        <StatCard label="Today's Orders" value={String(dashData?.today_orders ?? 0)} icon={Clock} color="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardCard title="Daily Revenue" className="lg:col-span-2">
          {loading && !revenue ? (
            <Skeleton className="h-48" />
          ) : !revenue || revenue.daily.length === 0 ? (
            <p className="text-xs text-ztext-lighter py-8 text-center">No revenue data for this period.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-end gap-1 h-40">
                {revenue.daily.slice(-14).map((d) => {
                  const max = Math.max(...revenue.daily.map((x) => x.revenue), 1);
                  const h = (d.revenue / max) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zcard text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        ₹{d.revenue} ({d.orders} orders)
                      </div>
                      <div className="w-full rounded-t-md transition-all hover:opacity-80" style={{ height: `${h}%`, minHeight: 4, backgroundColor: 'var(--color-zred)' }} />
                      <span className="text-[9px] text-ztext-muted -rotate-45 origin-left whitespace-nowrap">{new Date(d.date).getDate()}/{new Date(d.date).getMonth() + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Popular Products">
          {loading && !dashData ? <Skeleton className="h-32" /> : !dashData || dashData.popular_products.length === 0 ? (
            <p className="text-xs text-ztext-lighter py-4 text-center">No data yet</p>
          ) : (
            <div className="space-y-3">
              {dashData.popular_products.slice(0, 8).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-ztext-muted">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ztext truncate">{p.name}</p>
                    <div className="w-full bg-zgray rounded-full h-1.5 mt-1">
                      <div className="bg-zred h-1.5 rounded-full" style={{ width: `${Math.min(100, (p.count / Math.max(...dashData.popular_products.map((x) => x.count), 1)) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-ztext-lighter">{p.count} orders</span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Summary">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ztext-lighter">Average order value</span>
              <span className="font-semibold text-ztext">₹{avgOrderValue}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ztext-lighter">Daily average revenue</span>
              <span className="font-semibold text-ztext">₹{revenue?.daily.length ? Math.round(totalRevenue / revenue.daily.length) : 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ztext-lighter">Peak hour</span>
              <span className="font-semibold text-ztext">{peakHour}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ztext-lighter">Repeat customers</span>
              <span className="font-semibold text-ztext">--</span>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
