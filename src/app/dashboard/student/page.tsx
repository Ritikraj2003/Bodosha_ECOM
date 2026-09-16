import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/features/auth/actions';
import { getUserOrders } from '@/features/orders/actions/customer';
import { getWalletDetails } from '@/features/wallet/actions';
import { getCreditAccount } from '@/features/bnpl/actions';
import { Clock, CreditCard, ShoppingBag, Wallet, ChevronRight, CheckCircle2 } from 'lucide-react';
import { orderTypeLabel, ACTIVE_ORDER_STATUSES } from '@/features/orders/types';

export default async function StudentDashboardPage() {
  const { user } = await getServerSession();
  if (!user) redirect('/auth/login');

  const [ordersRes, walletRes, creditRes] = await Promise.all([
    getUserOrders(1, 5).catch(() => ({ success: false, data: null })),
    getWalletDetails().catch(() => ({ success: false, data: null })),
    getCreditAccount().catch(() => ({ success: false, data: null })),
  ]);

  const orders = (ordersRes.success && ordersRes.data?.orders) ? ordersRes.data.orders : [];
  const totalOrders = (ordersRes.success && ordersRes.data?.total) ? ordersRes.data.total : 0;
  const activeOrders = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status as any));
  const pastOrdersCount = Math.max(0, totalOrders - activeOrders.length);

  const walletBalance = (walletRes.success && walletRes.data) ? walletRes.data.balance : 0;
  const creditLimit = (creditRes.success && creditRes.data) ? creditRes.data.credit_limit : 0;

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ztext tracking-tight">
              Welcome back{user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-1 text-ztext-light text-sm">Hungry? Let&apos;s find you something delicious.</p>
          </div>
          <Link href="/menu" className="button-z button-z-primary self-start sm:self-auto px-5 py-2.5 text-xs font-bold">
            Order Food Now
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShoppingBag,
              label: 'Active orders',
              value: `${activeOrders.length}`,
              sub: activeOrders.length > 0 ? 'In progress' : 'No active orders',
              href: '/orders',
              color: 'text-amber-500 bg-amber-500/10',
            },
            {
              icon: Wallet,
              label: 'Wallet Balance',
              value: `₹${walletBalance.toLocaleString('en-IN')}`,
              sub: 'Ethics Pay cash',
              href: '/dashboard/student/wallet',
              color: 'text-emerald-500 bg-emerald-500/10',
            },
            {
              icon: CreditCard,
              label: 'BNPL Credit',
              value: creditLimit > 0 ? `₹${creditLimit.toLocaleString('en-IN')}` : 'Apply',
              sub: creditLimit > 0 ? 'Pay Later active' : 'Get instant credit',
              href: '/dashboard/student/credit',
              color: 'text-blue-500 bg-blue-500/10',
            },
            {
              icon: Clock,
              label: 'Total Orders',
              value: `${totalOrders}`,
              sub: `${pastOrdersCount} completed`,
              href: '/orders',
              color: 'text-purple-500 bg-purple-500/10',
            },
          ].map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="bg-zcard rounded-2xl border border-zborder shadow-sm p-5 transition-all hover:shadow-z-hover hover:border-ztext-light/30"
            >
              <div className="flex items-center gap-3.5">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 ${s.color}`}>
                  <s.icon size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-ztext-light truncate font-medium">{s.label}</p>
                  <p className="font-extrabold text-ztext text-base mt-0.5">{s.value}</p>
                  <p className="text-[10px] text-ztext-lighter truncate">{s.sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-ztext">Recent Orders</h2>
            <Link href="/orders" className="text-xs font-semibold text-zred hover:underline inline-flex items-center gap-1">
              View all orders <ChevronRight size={14} />
            </Link>
          </div>

          {orders.length > 0 ? (
            <div className="space-y-3">
              {orders.slice(0, 3).map((order) => {
                const isDelivered = order.status === 'delivered' || order.status === 'completed';
                const isCancelled = order.status === 'cancelled';
                const statusColor = isDelivered ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : isCancelled ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20';

                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="bg-zcard border border-zborder rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-ztext-light/40 transition-all shadow-sm group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ztext group-hover:text-zred transition-colors">
                          Order #{order.tracking_code}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor} capitalize`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-ztext-light">
                        {orderTypeLabel(order.order_type)} • {order.order_items?.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ') || 'Food items'}
                      </p>
                      <p className="text-[10px] text-ztext-lighter">
                        {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • Payment: <strong className="capitalize">{order.payment_method || 'Online'}</strong> ({order.payment_status})
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span className="font-extrabold text-sm text-ztext">₹{order.total}</span>
                      <span className="text-xs font-semibold text-ztext-light group-hover:text-zred inline-flex items-center">
                        Details <ChevronRight size={14} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="bg-zcard rounded-2xl border border-zborder shadow-sm p-12 text-center">
              <ShoppingBag size={40} className="mx-auto mb-3 text-ztext-lighter" />
              <p className="font-bold text-ztext text-base">No orders yet</p>
              <p className="text-ztext-light text-xs mt-1 max-w-sm mx-auto">
                Explore our hot meals, quick bites, and combos. Place an order for hostel delivery or take away!
              </p>
              <Link href="/menu" className="button-z button-z-primary mt-5 px-6 py-2.5 text-xs font-bold inline-flex">
                Browse Menu
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
