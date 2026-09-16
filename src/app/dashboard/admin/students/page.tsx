'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

import { RefreshCw, Shield, ShieldOff, CheckCircle, Clock, Wallet, Loader2 } from 'lucide-react';
import { DataTable, SearchInput, StatusFilter, PageHeader, ConfirmDialog, ToastContainer, useToast } from '@/components/ui/data-table';
import ExportDropdown from '@/components/admin/ExportDropdown';
import { getAdminStudents, suspendStudent, unsuspendStudent, verifyStudent, resetStudentVerification, bulkSuspendStudents, bulkUnsuspendStudents } from '@/features/admin/actions';
import { adminCreditWallet, getAdminUserWalletBalance } from '@/features/wallet/actions';
import type { AdminStudent } from '@/features/admin/types';

const STUDENT_EXPORT_HEADERS = [
  'Student Name',
  'Email',
  'Phone Number',
  'Account Status',
  'Credit Limit (₹)',
  'Available Credit (₹)',
  'Outstanding (₹)',
  'BNPL Status',
  'Verification Status',
  'Joined Date',
];

export default function AdminStudentsPage() {

  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: string; id?: string; ids?: string[] } | null>(null);
  const [walletModal, setWalletModal] = useState<{ id: string; name: string } | null>(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletNote, setWalletNote] = useState('');
  const [walletCrediting, setWalletCrediting] = useState(false);
  const [verifyModal, setVerifyModal] = useState<{ id: string; name: string } | null>(null);
  const [verifyCreditLimit, setVerifyCreditLimit] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [walletCurrentBalance, setWalletCurrentBalance] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [fetchingWalletBalance, setFetchingWalletBalance] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    if (walletModal) {
       
      setFetchingWalletBalance(true);
      setWalletCurrentBalance(null);
      setWalletStatus(null);
      getAdminUserWalletBalance(walletModal.id).then(res => {
        if (res.success && typeof res.balance === 'number') {
          setWalletCurrentBalance(res.balance);
          setWalletStatus(res.status || 'unverified');
        }
        setFetchingWalletBalance(false);
      });
    }
  }, [walletModal]);

  const fetchStudents = useCallback(async (p?: number) => {
    setLoading(true);
    const targetPage = p ?? page;
    const res = await getAdminStudents({
      search: search.trim() || undefined,
      status: status !== 'all' ? status : undefined,
      page: targetPage,
      pageSize: 20,
      sortBy,
      sortOrder,
    });
    if (res.success && res.data) {
      setStudents(res.data.data as AdminStudent[]);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    }
    setLoading(false);
  }, [search, status, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents(page);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, sortBy, sortOrder, page, fetchStudents]);

  const handleSuspend = async (id: string) => {
    const res = await suspendStudent(id, 'Suspended by admin');
    if (res.success) { addToast('Student suspended', 'success'); fetchStudents(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const handleUnsuspend = async (id: string) => {
    const res = await unsuspendStudent(id, 'Restored by admin');
    if (res.success) { addToast('Student restored', 'success'); fetchStudents(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const submitVerify = async () => {
    if (!verifyModal) return;
    setVerifying(true);
    const limit = parseInt(verifyCreditLimit, 10) || 0;
    const res = await verifyStudent(verifyModal.id, limit);
    if (res.success) { 
      addToast('Student verified with credit limit', 'success'); 
      setVerifyModal(null);
      setVerifyCreditLimit('');
      fetchStudents(); 
    } else {
      addToast(res.error ?? 'Failed', 'error');
    }
    setVerifying(false);
  };

  const handleResetVerification = async (id: string) => {
    const res = await resetStudentVerification(id, 'Reset by admin');
    if (res.success) { addToast('Verification reset', 'success'); fetchStudents(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const handleCreditWallet = async () => {
    if (!walletModal) return;
    const amount = parseInt(walletAmount, 10);
    if (isNaN(amount) || amount <= 0) { addToast('Enter a valid amount', 'error'); return; }
    setWalletCrediting(true);
    const res = await adminCreditWallet(walletModal.id, amount, walletNote || 'Admin credit');
    if (res.success) { addToast(`₹${amount} credited to ${walletModal.name}`, 'success'); setWalletModal(null); setWalletAmount(''); setWalletNote(''); }
    else addToast(res.error ?? 'Failed', 'error');
    setWalletCrediting(false);
  };

  const handleBulkSuspend = async () => {
    const res = await bulkSuspendStudents(selectedIds, 'Bulk suspended by admin');
    if (res.success) { addToast(`Suspended ${res.count} students`, 'success'); setSelectedIds([]); fetchStudents(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const handleBulkUnsuspend = async () => {
    const res = await bulkUnsuspendStudents(selectedIds, 'Bulk restored by admin');
    if (res.success) { addToast(`Restored ${res.count} students`, 'success'); setSelectedIds([]); fetchStudents(); }
    else addToast(res.error ?? 'Failed', 'error');
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true, render: (s: AdminStudent) => (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-ztext-light">
          {s.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-ztext">{s.full_name}</p>
          <p className="text-xs text-ztext-lighter">{s.email}</p>
          {s.phone && <p className="text-[10px] text-ztext-muted sm:hidden font-mono">{s.phone}</p>}
        </div>
      </div>
    )},
    { key: 'phone', header: 'Phone', render: (s: AdminStudent) => (
      <span className="text-ztext-light font-mono text-xs">{s.phone || '-'}</span>
    ), hideOnMobile: true },
    { key: 'status', header: 'Status', render: (s: AdminStudent) => (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        s.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {s.is_active ? 'Active' : 'Suspended'}
      </span>
    )},
    { key: 'credit', header: 'Wallet / BNPL', render: (s: AdminStudent) => {
      const w = Array.isArray(s.wallet) ? s.wallet[0] : s.wallet;
      return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-ztext font-medium">
          {w ? `Bal: ₹${Number(w.balance).toLocaleString('en-IN')}` : 'No account'}
        </span>
        {w && (
          <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit mt-0.5">
            Limit: ₹{Number(w.credit_limit || 0).toLocaleString('en-IN')}
          </span>
        )}
        {w && Number(w.balance) < 0 && Number(w.total_penalties) > 0 && (
          <span className="text-[10px] text-rose-500 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded w-fit mt-0.5">
            Fine: ₹{Number(w.total_penalties).toLocaleString('en-IN')}
          </span>
        )}
      </div>
      );
    }, hideOnMobile: true },
    { key: 'verification', header: 'Verification', render: (s: AdminStudent) => {
      const w = Array.isArray(s.wallet) ? s.wallet[0] : s.wallet;
      const v = w?.status;
      const color = v === 'active' ? 'text-emerald-400 bg-emerald-500/10' : v === 'pending' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color} capitalize`}>
          {v ?? 'N/A'}
        </span>
      );
    }, hideOnMobile: true },
    { key: 'created', header: 'Joined', sortable: true, render: (s: AdminStudent) => (
      <span className="text-xs text-ztext-lighter">{new Date(s.created_at).toLocaleDateString()}</span>
    ), hideOnMobile: true },
    { key: 'actions', header: 'Actions', render: (s: AdminStudent) => {
      const w = Array.isArray(s.wallet) ? s.wallet[0] : s.wallet;
      return (
      <div className="flex items-center gap-1">
        <button onClick={() => setWalletModal({ id: s.id, name: s.full_name })} className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-ztext-muted hover:text-emerald-600 transition-colors" title="Credit wallet">
          <Wallet size={14} />
        </button>
        {s.is_active ? (
          <button onClick={() => setConfirmAction({ type: 'suspend', id: s.id })} className="p-1.5 hover:bg-red-500/10 rounded-lg text-ztext-muted hover:text-red-400 transition-colors" title="Suspend">
            <ShieldOff size={14} />
          </button>
        ) : (
          <button onClick={() => setConfirmAction({ type: 'unsuspend', id: s.id })} className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-ztext-muted hover:text-emerald-600 transition-colors" title="Restore">
            <Shield size={14} />
          </button>
        )}
        {w && w.status !== 'active' && (
          <button onClick={() => setVerifyModal({ id: s.id, name: s.full_name })} className="p-1.5 hover:bg-blue-500/10 rounded-lg text-ztext-muted hover:text-blue-600 transition-colors" title="Verify">
            <CheckCircle size={14} />
          </button>
        )}
        {w && w.status === 'active' && (
          <button onClick={() => setConfirmAction({ type: 'reset_verification', id: s.id })} className="p-1.5 hover:bg-amber-500/10 rounded-lg text-ztext-muted hover:text-amber-400 transition-colors" title="Reset verification">
            <Clock size={14} />
          </button>
        )}
      </div>
    )}},
  ];

  const exportRows = useMemo(() => {
    return students.map((s) => {
      const w = Array.isArray(s.wallet) ? s.wallet[0] : s.wallet;
      return [
        s.full_name || 'N/A',
        s.email || 'N/A',
        s.phone || 'N/A',
        s.is_active ? 'Active' : 'Suspended',
        w ? w.balance : 0,
        0, // available_credit not applicable for wallet
        0, // outstanding not applicable for wallet
        w ? w.status : 'No Account',
        w ? w.status : 'N/A',
        new Date(s.created_at).toLocaleString('en-IN'),
      ];
    });
  }, [students]);

  return (
    <div>
      <PageHeader title="Students" description={`${total} registered student${total !== 1 ? 's' : ''}`}>
        <ExportDropdown
          title="Students Directory Report"
          filenamePrefix="students-export"
          headers={STUDENT_EXPORT_HEADERS}
          rows={exportRows}
          disabled={students.length === 0}
        />
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ztext-lighter">{selectedIds.length} selected</span>
            <button onClick={() => setConfirmAction({ type: 'bulk_suspend', ids: selectedIds })} className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
              Suspend all
            </button>
            <button onClick={() => setConfirmAction({ type: 'bulk_unsuspend', ids: selectedIds })} className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-100 transition-colors">
              Restore all
            </button>
          </div>
        )}
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, email or phone..." />
        </div>
        <StatusFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { label: 'All status', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Suspended', value: 'suspended' },
        ]} />
        <button onClick={() => fetchStudents()} aria-label="Refresh students" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="bg-zcard rounded-xl border border-zborder">
        <DataTable
          columns={columns}
          data={students as unknown as Record<string, unknown>[]}
          total={total}
          page={page}
          pageSize={20}
          totalPages={totalPages}
          loading={loading}
          onPageChange={(p) => setPage(p)}
          onSort={(key, order) => { setSortBy(key); setSortOrder(order); setPage(1); }}
          sortBy={sortBy}
          sortOrder={sortOrder}
          keyExtractor={(s) => (s as unknown as AdminStudent).id}
          emptyMessage="No students found"
          selectable
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
        />
      </div>

      {walletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setWalletModal(null)}>
          <div className="bg-zcard rounded-2xl p-6 max-w-sm w-full shadow-z-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-ztext">Credit Bonus to Wallet</h3>
            <p className="text-xs text-ztext-lighter mt-1">Add bonus points to <span className="font-medium text-ztext">{walletModal.name}</span></p>
            
            {fetchingWalletBalance ? (
              <div className="flex justify-center my-8">
                <Loader2 size={24} className="animate-spin text-ztext-muted" />
              </div>
            ) : walletStatus === 'active' ? (
              <>
                <div className="mt-4 p-3 bg-zgray/30 rounded-xl border border-zborder flex justify-between items-center">
                  <span className="text-xs font-medium text-ztext-light">Current Balance</span>
                  <span className="font-black text-sm text-ztext">₹{walletCurrentBalance?.toLocaleString('en-IN') || 0}</span>
                </div>

                <input type="number" min="1" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} placeholder="Bonus Amount (₹)" className="input-z w-full mt-4 text-sm" autoFocus />
                <input value={walletNote} onChange={(e) => setWalletNote(e.target.value)} placeholder="Bonus Note (optional)" className="input-z w-full mt-3 text-sm" />
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setWalletModal(null); setWalletAmount(''); setWalletNote(''); }} className="flex-1 px-4 py-2 text-sm font-medium text-ztext-light bg-zgray rounded-xl hover:bg-zsurface transition-colors">Cancel</button>
                  <button onClick={handleCreditWallet} disabled={walletCrediting || !walletAmount} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-zred rounded-xl hover:bg-zred-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {walletCrediting ? <Loader2 size={14} className="animate-spin" /> : null}
                    {walletCrediting ? 'Crediting...' : 'Credit'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 text-orange-500 mb-3">
                  <ShieldOff size={24} />
                </div>
                <h4 className="text-sm font-bold text-ztext mb-1">Wallet Not Active</h4>
                <p className="text-xs text-ztext-muted mb-6">
                  This user&apos;s wallet is currently {walletStatus === 'unverified' ? 'not set up' : walletStatus}. They need an active wallet to receive bonuses.
                </p>
                <button onClick={() => setWalletModal(null)} className="w-full px-4 py-2 text-sm font-medium text-ztext-light bg-zgray rounded-xl hover:bg-zsurface transition-colors">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-ztext mb-2">Verify {verifyModal.name}</h3>
            <p className="text-sm text-ztext-light mb-6">Assign a BNPL credit limit for this student.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-emerald-500 mb-1.5">Credit Limit (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={verifyCreditLimit}
                  onChange={(e) => setVerifyCreditLimit(e.target.value)}
                  placeholder="e.g. 1000"
                  className="input-z w-full"
                />
                <p className="text-[10px] text-ztext-muted mt-1">Leave 0 to disable overdraft.</p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-zborder">
                <button
                  onClick={() => { setVerifyModal(null); setVerifyCreditLimit(''); }}
                  className="flex-1 py-2 bg-zgray text-ztext font-bold rounded-xl hover:bg-zborder transition-colors"
                  disabled={verifying}
                >
                  Cancel
                </button>
                <button
                  onClick={submitVerify}
                  disabled={verifying}
                  className="flex-1 py-2 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Verify Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'suspend' && confirmAction.id) handleSuspend(confirmAction.id);
          if (confirmAction.type === 'unsuspend' && confirmAction.id) handleUnsuspend(confirmAction.id);
          if (confirmAction.type === 'reset_verification' && confirmAction.id) handleResetVerification(confirmAction.id);
          if (confirmAction.type === 'bulk_suspend' && confirmAction.ids) handleBulkSuspend();
          if (confirmAction.type === 'bulk_unsuspend' && confirmAction.ids) handleBulkUnsuspend();
        }}
        title={
          confirmAction?.type === 'suspend' ? 'Suspend student' :
          confirmAction?.type === 'unsuspend' ? 'Restore student' :
          confirmAction?.type === 'reset_verification' ? 'Reset verification' :
          confirmAction?.type === 'bulk_suspend' ? 'Bulk suspend' :
          'Bulk restore'
        }
        message={
          confirmAction?.type === 'suspend' ? 'This student will lose access to their account.' :
          confirmAction?.type === 'unsuspend' ? 'This student will regain access.' :
          confirmAction?.type === 'reset_verification' ? 'The credit verification will be reset to pending.' :
          confirmAction?.type === 'bulk_suspend' ? `Suspend ${confirmAction?.ids?.length} students? They will lose access.` :
          `Restore ${confirmAction?.ids?.length} students?`
        }
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
