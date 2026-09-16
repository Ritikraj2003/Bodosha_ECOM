'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Eye, EyeOff, Snowflake, Thermometer, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { DataTable, SearchInput, StatusFilter, PageHeader, ConfirmDialog, ToastContainer, useToast } from '@/components/ui/data-table';
import { getAdminCreditAccounts, getAdminCreditAccountById, getCreditTransactions, increaseCreditLimit, reduceCreditLimit, freezeCredit, unfreezeCredit } from '@/features/admin/actions';
import type { CreditAccountAdmin } from '@/features/admin/types';

export default function AdminBNPLPage() {
  const [accounts, setAccounts] = useState<CreditAccountAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string } | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<CreditAccountAdmin | null>(null);
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [limitModal, setLimitModal] = useState<{ id: string; action: 'increase' | 'reduce'; current: number } | null>(null);
  const [limitValue, setLimitValue] = useState('');
  const [reasonValue, setReasonValue] = useState('');
  const [showModalTransactions, setShowModalTransactions] = useState<boolean>(false);
  const { toasts, addToast, removeToast } = useToast();

  const fetchAccounts = useCallback(async (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    const res = await getAdminCreditAccounts({
      search: search.trim() || undefined,
      status: status !== 'all' ? status : undefined,
      page: targetPage,
      pageSize: 20,
      sortBy,
      sortOrder,
    });
    if (res.success && res.data) {
      setAccounts(res.data.data as CreditAccountAdmin[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    }
    setLoading(false);
  }, [search, status, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAccounts(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, sortBy, sortOrder, page, fetchAccounts]);

  const viewAccount = async (id: string) => {
    const res = await getAdminCreditAccountById(id);
    if (res.success && res.data) {
      setSelectedAccount(res.data as CreditAccountAdmin);
      loadTransactions(id);
    }
  };

  const loadTransactions = async (accountId: string, p = 1) => {
    const res = await getCreditTransactions(accountId, p, 20);
    if (res.success && res.data) {
      setTransactions(res.data.data as Array<Record<string, unknown>>);
      setTxTotal(res.data.total);
      setTxPage(res.data.page);
    }
  };

  const handleLimitChange = async () => {
    if (!limitModal || !limitValue) return;
    const newLimit = parseFloat(limitValue);
    if (isNaN(newLimit) || newLimit <= 0) { addToast('Invalid limit', 'error'); return; }
    const res = limitModal.action === 'increase'
      ? await increaseCreditLimit(limitModal.id, newLimit, reasonValue || 'Admin adjustment')
      : await reduceCreditLimit(limitModal.id, newLimit, reasonValue || 'Admin adjustment');
    if (res.success) { addToast('Credit limit updated', 'success'); setLimitModal(null); setLimitValue(''); setReasonValue(''); fetchAccounts(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const handleFreeze = async (id: string) => {
    const res = await freezeCredit(id, reasonValue || 'Frozen by admin');
    if (res.success) { addToast('Account frozen', 'success'); fetchAccounts(); if (selectedAccount?.id === id) setSelectedAccount(null); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const handleUnfreeze = async (id: string) => {
    const res = await unfreezeCredit(id, reasonValue || 'Unfrozen by admin');
    if (res.success) { addToast('Account unfrozen', 'success'); fetchAccounts(); if (selectedAccount?.id === id) setSelectedAccount(null); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const columns = [
    { key: 'user', header: 'User', render: (a: CreditAccountAdmin) => (
      <div>
        <p className="text-sm font-medium text-ztext-light">{a.user?.full_name ?? 'Unknown'}</p>
        <p className="text-xs text-ztext-lighter">{a.user?.email ?? ''}</p>
      </div>
    )},
    { key: 'limit', header: 'Limit', render: (a: CreditAccountAdmin) => (
      <span className="font-medium text-ztext">₹{Number(a.credit_limit).toLocaleString('en-IN')}</span>
    )},
    { key: 'available', header: 'Available', render: (a: CreditAccountAdmin) => (
      <span className="font-medium text-emerald-600">₹{Number(a.available_credit).toLocaleString('en-IN')}</span>
    )},
    { key: 'outstanding', header: 'Outstanding', render: (a: CreditAccountAdmin) => (
      <span className={`font-medium ${a.outstanding > 0 ? 'text-red-400' : 'text-ztext-light'}`}>₹{Number(a.outstanding).toLocaleString('en-IN')}</span>
    )},
    { key: 'utilization', header: 'Utilization', render: (a: CreditAccountAdmin) => {
      const pct = a.credit_limit > 0 ? Math.round((a.outstanding / a.credit_limit) * 100) : 0;
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-zgray rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-ztext-lighter">{pct}%</span>
        </div>
      );
    }, hideOnMobile: true},
    { key: 'status', header: 'Status', render: (a: CreditAccountAdmin) => {
      const colors: Record<string, string> = {
        active: 'bg-emerald-500/10 text-emerald-400', frozen: 'bg-blue-500/10 text-blue-400',
        suspended: 'bg-red-500/10 text-red-400', closed: 'bg-zgray text-ztext-light',
      };
      return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colors[a.status] ?? 'bg-zgray text-ztext-light'}`}>{a.status}</span>;
    }},
    { key: 'verification', header: 'Verification', render: (a: CreditAccountAdmin) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        a.verification_status === 'verified' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
      }`}>{a.verification_status}</span>
    ), hideOnMobile: true},
    { key: 'actions', header: 'Actions', render: (a: CreditAccountAdmin) => (
      <div className="flex items-center gap-1">
        <button onClick={() => viewAccount(a.id)} className="p-1.5 hover:bg-zgray rounded-lg text-ztext-muted hover:text-ztext-light transition-colors" title="View details">
          <Eye size={14} />
        </button>
        <button onClick={() => setLimitModal({ id: a.id, action: 'increase', current: a.credit_limit })} className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-ztext-muted hover:text-emerald-600 transition-colors" title="Increase limit">
          <ArrowUpCircle size={14} />
        </button>
        <button onClick={() => setLimitModal({ id: a.id, action: 'reduce', current: a.credit_limit })} className="p-1.5 hover:bg-red-500/10 rounded-lg text-ztext-muted hover:text-red-400 transition-colors" title="Reduce limit">
          <ArrowDownCircle size={14} />
        </button>
        {a.status === 'active' ? (
          <button onClick={() => { setConfirmAction({ type: 'freeze', id: a.id }); }} className="p-1.5 hover:bg-blue-500/10 rounded-lg text-ztext-muted hover:text-blue-600 transition-colors" title="Freeze">
            <Snowflake size={14} />
          </button>
        ) : a.status === 'frozen' ? (
          <button onClick={() => { setConfirmAction({ type: 'unfreeze', id: a.id }); }} className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-ztext-muted hover:text-emerald-600 transition-colors" title="Unfreeze">
            <Thermometer size={14} />
          </button>
        ) : null}
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="BNPL Administration" description={`${total} credit account${total !== 1 ? 's' : ''}`} />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by user name or email..." />
        </div>
        <StatusFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { label: 'All', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Frozen', value: 'frozen' },
          { label: 'Suspended', value: 'suspended' },
        ]} />
        <button onClick={() => fetchAccounts()} aria-label="Refresh accounts" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="bg-zcard rounded-xl border border-zborder">
        <DataTable
          columns={columns}
          data={accounts as unknown as Record<string, unknown>[]}
          total={total}
          page={page}
          pageSize={20}
          totalPages={totalPages}
          loading={loading}
          onPageChange={(p) => setPage(p)}
          onSort={(key, order) => { setSortBy(key); setSortOrder(order); setPage(1); }}
          sortBy={sortBy}
          sortOrder={sortOrder}
          keyExtractor={(a) => (a as unknown as CreditAccountAdmin).id}
          emptyMessage="No credit accounts found"
        />
      </div>

      {/* Account detail modal */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto" onClick={() => setSelectedAccount(null)}>
          <div className="bg-zcard rounded-2xl p-6 max-w-2xl w-full shadow-z-modal my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-ztext">Credit Account</h3>
                <p className="text-sm text-ztext-lighter">{selectedAccount.user?.full_name} ({selectedAccount.user?.email})</p>
              </div>
              <button onClick={() => setSelectedAccount(null)} aria-label="Close details" className="p-1 hover:bg-zgray rounded-lg">&times;</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-zgray rounded-xl p-3">
                <p className="text-[10px] text-ztext-lighter uppercase tracking-wider">Limit</p>
                <p className="text-sm font-bold text-ztext">₹{Number(selectedAccount.credit_limit).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-zgray rounded-xl p-3">
                <p className="text-[10px] text-ztext-lighter uppercase tracking-wider">Available</p>
                <p className="text-sm font-bold text-emerald-600">₹{Number(selectedAccount.available_credit).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-zgray rounded-xl p-3">
                <p className="text-[10px] text-ztext-lighter uppercase tracking-wider">Outstanding</p>
                <p className="text-sm font-bold text-red-400">₹{Number(selectedAccount.outstanding).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-zgray rounded-xl p-3">
                <p className="text-[10px] text-ztext-lighter uppercase tracking-wider">Status</p>
                <p className="text-sm font-bold text-ztext capitalize">{selectedAccount.status}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm mb-6">
              <div className="flex justify-between"><span className="text-ztext-lighter">Interest Rate</span><span>{selectedAccount.interest_rate}%</span></div>
              <div className="flex justify-between"><span className="text-ztext-lighter">Late Fee Rate</span><span>{selectedAccount.late_fee_rate}%</span></div>
              <div className="flex justify-between"><span className="text-ztext-lighter">Due Days</span><span>{selectedAccount.due_days} days</span></div>
              <div className="flex justify-between"><span className="text-ztext-lighter">Verification</span><span>{selectedAccount.verification_status}</span></div>
              <div className="flex justify-between"><span className="text-ztext-lighter">Activated</span><span>{selectedAccount.activated_at ? new Date(selectedAccount.activated_at).toLocaleDateString() : 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-ztext-lighter">Last Repayment</span><span>{selectedAccount.last_repayment_at ? new Date(selectedAccount.last_repayment_at).toLocaleDateString() : 'Never'}</span></div>
            </div>

            <div className="flex gap-2 mb-6">
              {selectedAccount.status === 'active' ? (
                <button onClick={() => handleFreeze(selectedAccount.id)} className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-100 transition-colors">Freeze</button>
              ) : selectedAccount.status === 'frozen' ? (
                <button onClick={() => handleUnfreeze(selectedAccount.id)} className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-100 transition-colors">Unfreeze</button>
              ) : null}
            </div>

            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-ztext">Recent Transactions</h4>
              <button
                onClick={() => setShowModalTransactions((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zgray hover:bg-zborder text-xs font-bold text-ztext transition-colors"
              >
                {showModalTransactions ? (
                  <>
                    <EyeOff size={13} className="text-ztext-muted" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye size={13} className="text-zred" />
                    <span>Show</span>
                  </>
                )}
              </button>
            </div>

            {showModalTransactions && (
              <>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {transactions.length === 0 ? (
                    <p className="text-xs text-ztext-lighter text-center py-4">No transactions</p>
                  ) : transactions.map((tx: Record<string, unknown>) => (
                    <div key={tx.id as string} className="flex items-center justify-between py-2 border-b border-zborder last:border-0">
                      <div>
                        <p className="text-sm text-ztext-light capitalize">{(tx.type as string).replace(/_/g, ' ')}</p>
                        <p className="text-xs text-ztext-muted">{new Date(tx.created_at as string).toLocaleString()}</p>
                      </div>
                      <span className={`font-medium text-sm ${(tx.amount as number) > 0 && tx.type === 'repayment' ? 'text-emerald-600' : (tx.amount as number) > 0 ? 'text-red-400' : 'text-ztext-light'}`}>
                        {(tx.type as string) === 'repayment' ? '-' : '+'}₹{Number(tx.amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
                {txTotal > 20 && (
                  <div className="flex justify-center gap-2 mt-3">
                    <button onClick={() => loadTransactions(selectedAccount.id, txPage - 1)} disabled={txPage <= 1} className="text-xs text-ztext-lighter hover:text-ztext-light disabled:opacity-30">Prev</button>
                    <button onClick={() => loadTransactions(selectedAccount.id, txPage + 1)} disabled={txPage * 20 >= txTotal} className="text-xs text-ztext-lighter hover:text-ztext-light disabled:opacity-30">Next</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Limit change modal */}
      {limitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setLimitModal(null)}>
          <div className="bg-zcard rounded-2xl p-6 max-w-sm w-full shadow-z-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-ztext capitalize">{limitModal.action} Credit Limit</h3>
            <p className="text-sm text-ztext-lighter mt-1">Current limit: ₹{Number(limitModal.current).toLocaleString('en-IN')}</p>
            <input type="number" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="New credit limit" min="0"
              className="w-full mt-4 px-3 py-2.5 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
            <input value={reasonValue} onChange={(e) => setReasonValue(e.target.value)} placeholder="Reason for change"
              className="w-full mt-3 px-3 py-2.5 text-sm border border-zborder rounded-xl focus:outline-none focus:ring-2 focus:ring-zred/20 focus:border-zred" />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setLimitModal(null)} className="flex-1 px-4 py-2 text-sm font-medium text-ztext-light bg-zgray rounded-xl hover:bg-zsurface transition-colors">Cancel</button>
              <button onClick={handleLimitChange} disabled={!limitValue} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-zred rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50">Update</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmAction?.type === 'freeze' || confirmAction?.type === 'unfreeze'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'freeze') handleFreeze(confirmAction.id);
          if (confirmAction.type === 'unfreeze') handleUnfreeze(confirmAction.id);
        }}
        title={confirmAction?.type === 'freeze' ? 'Freeze credit' : 'Unfreeze credit'}
        message={confirmAction?.type === 'freeze' ? 'This account will not be able to use BNPL.' : 'This account will regain BNPL access.'}
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
