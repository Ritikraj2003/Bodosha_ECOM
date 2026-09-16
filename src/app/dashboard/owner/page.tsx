'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  IndianRupee, ShoppingBag, Calendar, Wallet, RefreshCw,
  Store, UtensilsCrossed, ArrowRight, Lock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/data-table';
import { getOwnerDashboard } from '@/features/owner/actions';
import { usePolling } from '@/hooks/usePolling';

const POLL_INTERVAL_MS = 30_000;

function formatCurrency(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function OwnerOverviewPage() {
  const [stats, setStats] = useState<{
    totalRevenue: number;
    todayRevenue: number;
    monthRevenue: number;
    totalOrders: number;
    activeOrders: number;
    completedOrders: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await getOwnerDashboard();
    if (res.success && res.data) {
      setStats({
        totalRevenue: res.data.total_revenue ?? 0,
        todayRevenue: res.data.today_revenue ?? 0,
        monthRevenue: res.data.monthly_revenue ?? 0,
        totalOrders: res.data.total_orders ?? 0,
        activeOrders: res.data.active_orders ?? 0,
        completedOrders: res.data.completed_orders ?? 0,
      });
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();  
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  usePolling(() => { load(true); }, POLL_INTERVAL_MS);

  const cards = [
    { label: 'Total Revenue', value: stats ? formatCurrency(stats.totalRevenue) : '—', icon: Wallet, hint: 'All time' },
    { label: "Today's Revenue", value: stats ? formatCurrency(stats.todayRevenue) : '—', icon: IndianRupee, hint: 'Since midnight' },
    { label: 'This Month', value: stats ? formatCurrency(stats.monthRevenue) : '—', icon: Calendar, hint: 'Monthly revenue' },
    { label: 'Total Orders', value: stats ? stats.totalOrders.toLocaleString('en-IN') : '—', icon: ShoppingBag, hint: `Active: ${stats?.activeOrders ?? 0} · Done: ${stats?.completedOrders ?? 0}` },
  ];

  const quickLinks = [
    {
      title: 'In-Store Counter',
      description: 'Manage counter orders, create POS transactions, and track daily cash/UPI sales.',
      href: '/dashboard/owner/in-store',
      icon: Store,
      badge: 'POS Counter',
    },
    {
      title: 'Products & Menu Catalog',
      description: 'Manage dishes, pricing, inventory stock, and packaging packet requirements.',
      href: '/dashboard/owner/products',
      icon: UtensilsCrossed,
      badge: 'Catalog',
    },
    {
      title: 'Orders & Deliveries',
      description: 'Manage online orders, update statuses, assign delivery partners, and track history.',
      href: '/dashboard/owner/orders',
      icon: ShoppingBag,
      badge: 'Online Orders',
    },
    {
      title: 'Expense Tracker',
      description: 'Review starting balance, expense records, net cash flow, and monthly trends.',
      href: '/dashboard/owner/expenses',
      icon: Wallet,
      badge: 'Financials',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Owner Dashboard" description="Business overview & analytics for Dilip Da" />
        <div className="flex items-center gap-3">
          <button onClick={() => load()} aria-label="Refresh" className="p-2.5 rounded-xl hover:bg-zgray border border-zborder text-ztext-lighter transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {cards.map((c) => (
          <div key={c.label} className="bg-zcard border border-zborder p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-ztext-muted uppercase tracking-wider">{c.label}</p>
              <c.icon size={18} className="text-zred" />
            </div>
            <p className="text-2xl font-black text-ztext mt-2">{c.value}</p>
            <p className="text-[11px] text-ztext-lighter mt-1">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* Quick Navigation Cards */}
      <div>
        <h2 className="text-sm font-bold text-ztext uppercase tracking-wider mb-3">Management Sections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-zcard p-5 rounded-2xl border border-zborder shadow-sm hover:border-zred/40 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zgray text-ztext-light border border-zborder">
                    <item.icon size={12} className="text-zred" />
                    {item.badge}
                  </span>
                  <ArrowRight size={16} className="text-ztext-lighter group-hover:text-zred group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-base font-bold text-ztext group-hover:text-zred transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-ztext-light mt-1 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-zborder/60 flex items-center justify-between text-xs font-semibold text-zred">
                <span>{item.href === '/dashboard/owner/expenses' ? 'View details' : 'Manage'}</span>
                {item.href === '/dashboard/owner/expenses' && (
                  <span className="text-[10px] font-normal text-ztext-muted flex items-center gap-1">
                    <Lock size={10} /> Read-only
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
