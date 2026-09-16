'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Search, Banknote, ShieldCheck, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { PageHeader, ToastContainer, useToast } from '@/components/ui/data-table';
import DateFilter, { type DateFilterValue } from '@/components/ui/date-filter';
import { getAdminPayments, processRefund } from '@/features/admin/actions';
import type { PaymentAdmin } from '@/features/admin/types';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  collected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  refunded: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  partially_refunded: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  confirmed: 'Success',
  collected: 'Collected',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Part Refund',
  cancelled: 'Cancelled',
};

function getPaymentBadge(p: PaymentAdmin): { label: string; color: string } | null {
  if (p.order?.status === 'cancelled' || p.status === 'cancelled') {
    return { label: 'Canceled', color: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' };
  }
  if (p.status === 'refunded' || (p.refund_amount != null && p.refund_amount >= p.amount && p.amount > 0)) {
    return { label: 'Refunded', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' };
  }
  if (p.status === 'partially_refunded' || (p.refund_amount != null && p.refund_amount > 0)) {
    return { label: 'Part Refund', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400' };
  }
  return null;
}

function formatCurrency(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function paymentTitle(method: string): string {
  if (method === 'cod' || method === 'collected') return 'Cash on Delivery';
  if (method === 'bnpl') return 'BNPL / Credit';
  if (method === 'upi') return 'UPI Payment';
  return 'Online Payment';
}

import ExportDropdown from '@/components/admin/ExportDropdown';

const PAYMENT_EXPORT_HEADERS = [
  'Customer Name',
  'Wallet / Credit Ref',
  'Phone Number',
  'Email',
  'Payment ID',
  'Order Tracking Code',
  'Amount (₹)',
  'Payment Method',
  'Gateway',
  'Gateway Payment ID',
  'Payment Status',
  'Refund Amount',
  'Order Status',
  'Date',
];

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentMethodGroup, setPaymentMethodGroup] = useState<'all' | 'online' | 'wallet' | 'cod'>('all');
  const [dateRange, setDateRange] = useState<DateFilterValue>({});
  const [showTransactions, setShowTransactions] = useState<boolean>(false);
  const sortBy = 'created_at';
  const sortOrder: 'asc' | 'desc' = 'desc';
  const [refundModal, setRefundModal] = useState<{ id: string; amount: number; currentRefunded: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const { toasts, addToast, removeToast } = useToast();

  const pageRef = useRef(page);
  pageRef.current = page;

  const fetchPayments = useCallback(async (p?: number) => {
    setLoading(true);
    const targetPage = p ?? pageRef.current;
    const res = await getAdminPayments({
      search: search || undefined,
      status: status !== 'all' ? status : undefined,
      paymentMethodGroup: paymentMethodGroup !== 'all' ? paymentMethodGroup : undefined,
      ...dateRange,
      page: targetPage,
      pageSize: 50,
      sortBy,
      sortOrder,
    });
    if (res.success && res.data) {
      setPayments(res.data.data as PaymentAdmin[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    }
    setLoading(false);
  }, [search, status, paymentMethodGroup, dateRange]);

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  const stats = useMemo(() => {
    const completed = payments.filter(
      (p) => ['confirmed', 'collected'].includes(p.status) && !['cancelled', 'declined'].includes(p.order?.status ?? '') && p.status !== 'refunded'
    );
    const totalAmount = completed.reduce((sum, p) => sum + Number(p.amount), 0);
    const avg = completed.length > 0 ? totalAmount / completed.length : 0;
    return { count: completed.length, totalAmount, avg };
  }, [payments]);

  const handleRefund = async () => {
    if (!refundModal || !refundAmount || !refundReason) return;
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) { addToast('Invalid amount', 'error'); return; }
    if (amount > refundModal.amount - refundModal.currentRefunded) { addToast('Amount exceeds remaining refundable', 'error'); return; }
    const res = await processRefund(refundModal.id, amount, refundReason);
    if (res.success) { addToast('Refund processed', 'success'); setRefundModal(null); setRefundAmount(''); setRefundReason(''); fetchPayments(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const exportRows = useMemo(() => {
    return payments.map((p) => {
      const badge = getPaymentBadge(p);
      return [
        p.order?.customer_name || p.user?.full_name || 'Walk-in / Guest',
        p.wallet_info || 'N/A',
        p.order?.customer_phone || p.user?.phone || 'N/A',
        p.order?.customer_email || p.user?.email || 'N/A',
        p.id,
        p.order?.tracking_code || 'N/A',
        p.amount,
        paymentTitle(p.payment_method),
        p.gateway,
        p.gateway_payment_id || 'N/A',
        badge ? badge.label : 'Success',
        p.refund_amount ?? 0,
        p.order?.status ? p.order.status.replace(/_/g, ' ') : 'N/A',
        new Date(p.created_at).toLocaleString('en-IN'),
      ];
    });
  }, [payments]);

  return (
    <div>
      <PageHeader title="Payments & Billing" description={`${total} transaction${total !== 1 ? 's' : ''}`}>
        <button
          onClick={() => setShowTransactions((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zcard text-ztext border border-zborder rounded-xl hover:bg-zgray transition-colors"
        >
          {showTransactions ? (
            <>
              <EyeOff size={14} className="text-ztext-muted" />
              <span>Hide</span>
            </>
          ) : (
            <>
              <Eye size={14} className="text-zred" />
              <span>Show</span>
            </>
          )}
        </button>
        <ExportDropdown
          title="Payments & Billing Report"
          filenamePrefix="payments-export"
          headers={PAYMENT_EXPORT_HEADERS}
          rows={exportRows}
          disabled={payments.length === 0}
        />
        <button onClick={() => fetchPayments()} aria-label="Refresh payments" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </PageHeader>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-zcard border border-zborder rounded-2xl p-4">
          <p className="text-[11px] text-ztext-lighter font-medium">Total Collected</p>
          <p className="text-lg font-bold text-ztext mt-1">{formatCurrency(stats.totalAmount)}</p>
          <p className="text-[10px] text-emerald-500/80 font-semibold mt-1.5 flex items-center gap-0.5">
            <ShieldCheck size={11} /> {stats.count} paid order{stats.count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-zcard border border-zborder rounded-2xl p-4">
          <p className="text-[11px] text-ztext-lighter font-medium">Avg. Order Value</p>
          <p className="text-lg font-bold text-ztext mt-1">{formatCurrency(stats.avg)}</p>
          <p className="text-[10px] text-ztext-muted font-semibold mt-1.5">{stats.count} total order{stats.count !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Transaction list & controls */}
      {!showTransactions ? (
        <div className="text-center py-12 bg-zcard border border-zborder rounded-2xl p-6">
          <div className="w-12 h-12 rounded-xl bg-zgray flex items-center justify-center mx-auto mb-3 text-ztext-muted">
            <Eye size={22} className="text-zred" />
          </div>
          <p className="text-sm font-semibold text-ztext">Payment records are hidden</p>
          <p className="text-xs text-ztext-lighter mt-1">Click the Show button above to view all payments and filters.</p>
          <button
            onClick={() => setShowTransactions(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-zred/10 text-zred border border-zred/20 rounded-xl text-xs font-bold hover:bg-zred hover:text-white transition-all"
          >
            <Eye size={14} /> Show Payments
          </button>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ztext-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by customer name, phone, gateway ID or tracking code..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-zborder rounded-xl bg-zcard focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred placeholder-ztext-muted transition-all"
            />
          </div>

          {/* Payment Method Group Filter Tabs */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {[
              { value: 'all', label: 'All Methods' },
              { value: 'online', label: 'Online Payment (Razorpay, UPI)' },
              { value: 'wallet', label: 'Wallet' },
              { value: 'cod', label: 'COD' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setPaymentMethodGroup(opt.value as typeof paymentMethodGroup); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  paymentMethodGroup === opt.value
                    ? 'bg-zred text-white border-zred shadow-sm'
                    : 'bg-zcard border-zborder text-ztext-muted hover:border-ztext-light hover:text-ztext'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Status filter pills */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 [scrollbar-width:none]">
            {[
              { value: 'all', label: `All Status (${total})` },
              { value: 'confirmed', label: 'Success' },
              { value: 'pending', label: 'Pending' },
              { value: 'refunded', label: 'Refunds' },
              { value: 'failed', label: 'Failed' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setStatus(opt.value); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  status === opt.value
                    ? 'bg-ztext text-zbg border-ztext'
                    : 'bg-zcard border-zborder text-ztext-muted hover:border-ztext-light hover:text-ztext'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="mb-4">
            <DateFilter onChange={(v) => { setDateRange(v); setPage(1); }} />
          </div>

          {/* Transaction list */}
          {loading ? (
            <div className="flex items-center justify-center py-16 bg-zcard border border-zborder rounded-2xl">
              <Loader2 className="w-6 h-6 animate-spin text-ztext-muted" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-16 bg-zcard border border-zborder rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-zgray flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={24} className="text-ztext-muted" />
              </div>
              <p className="text-sm font-semibold text-ztext">No payments found</p>
              <p className="text-xs text-ztext-lighter mt-1">Payments matching your filters will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => {
                const m = p.payment_method;
                const customerName = p.order?.customer_name || p.user?.full_name || 'Walk-in / Guest';
                const customerPhone = p.order?.customer_phone || p.user?.phone || '—';
                const customerEmail = p.order?.customer_email || p.user?.email || null;
                const orderItems = p.order?.order_items ?? [];

                const badge = getPaymentBadge(p);

                return (
                  <div key={p.id} className="bg-zcard border border-zborder rounded-2xl p-4 hover:border-ztext/20 transition-all space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zborder/60">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-zgray border border-zborder flex items-center justify-center shrink-0 mt-0.5">
                          <Banknote size={18} className="text-ztext-light" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-ztext">{paymentTitle(m)}</p>
                            {p.order?.tracking_code && (
                              <span className="text-[11px] font-mono font-medium px-2 py-0.5 bg-zgray rounded-md text-ztext-light">
                                #{p.order.tracking_code}
                              </span>
                            )}
                            {p.order?.status && (
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                                p.order.status === 'delivered' || p.order.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : p.order.status === 'cancelled'
                                  ? 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              }`}>
                                Order: {p.order.status.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-ztext-muted flex-wrap">
                            <span>{formatDate(p.created_at)}</span>
                            {p.gateway_payment_id && (
                              <span className="font-mono text-[10px] bg-zgray px-1.5 py-0.5 rounded text-ztext-lighter truncate max-w-[140px]">
                                ID: {p.gateway_payment_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-left sm:text-right">
                          <p className="text-base font-bold text-ztext">{formatCurrency(p.amount)}</p>
                          {badge && (
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full mt-0.5 ${badge.color}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        {p.status === 'confirmed' && (p.refund_amount ?? 0) < p.amount && (
                          <button
                            onClick={() => setRefundModal({ id: p.id, amount: p.amount, currentRefunded: p.refund_amount ?? 0 })}
                            className="px-2.5 py-1 text-xs font-semibold text-ztext-light hover:text-ztext bg-zgray border border-zborder rounded-xl transition-colors"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Customer Info & Order Items */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Customer Details */}
                      <div className="bg-zgray/40 rounded-xl p-2.5 border border-zborder/50">
                        <p className="text-[10px] uppercase font-bold text-ztext-lighter tracking-wider mb-1">Customer Details</p>
                        <p className="font-semibold text-ztext text-xs">{customerName}</p>
                        <div className="flex items-center gap-2 text-ztext-lighter mt-0.5">
                          <span>Phone: <strong className="font-mono text-ztext-light">{customerPhone}</strong></span>
                          {customerEmail && <span className="truncate max-w-[150px]">({customerEmail})</span>}
                        </div>
                      </div>

                      {/* Ordered Items */}
                      <div className="bg-zgray/40 rounded-xl p-2.5 border border-zborder/50">
                        <p className="text-[10px] uppercase font-bold text-ztext-lighter tracking-wider mb-1">
                          Items Ordered ({orderItems.length})
                        </p>
                        {orderItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-0.5 max-h-16 overflow-y-auto">
                            {orderItems.map((item) => (
                              <span key={item.id} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-zcard border border-zborder text-ztext-light">
                                <span className="font-bold text-ztext mr-1">{item.quantity}×</span> {item.product_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-ztext-lighter text-[11px] italic">No item details recorded</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-zcard border border-zborder rounded-2xl">
                  <p className="text-xs text-ztext-lighter">
                    Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => fetchPayments(page - 1)} disabled={page <= 1} aria-label="Previous page" className="px-3 py-1.5 rounded-lg text-sm hover:bg-zgray disabled:opacity-30 transition-colors">Previous</button>
                    <button onClick={() => fetchPayments(page + 1)} disabled={page >= totalPages} aria-label="Next page" className="px-3 py-1.5 rounded-lg text-sm hover:bg-zgray disabled:opacity-30 transition-colors">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Refund modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setRefundModal(null)}>
          <div className="bg-zcard rounded-2xl p-6 max-w-sm w-full shadow-z-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-ztext">Process Refund</h3>
            <p className="text-sm text-ztext-lighter mt-1">Max refundable: ₹{Number(refundModal.amount - refundModal.currentRefunded).toLocaleString('en-IN')}</p>
            <input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Refund amount" min="0" step="0.01"
              className="w-full mt-4 px-3 py-2.5 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
            <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason for refund"
              className="w-full mt-3 px-3 py-2.5 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setRefundModal(null)} className="flex-1 px-4 py-2 text-sm font-medium text-ztext-light bg-zgray rounded-xl hover:bg-zsurface transition-colors">Cancel</button>
              <button onClick={handleRefund} disabled={!refundAmount || !refundReason} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-zred rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50">Refund</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}