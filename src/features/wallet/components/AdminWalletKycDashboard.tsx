'use client';

import { useState, useEffect, Fragment } from 'react';
import { ShieldCheck, CheckCircle, XCircle, Search, Eye, AlertCircle, RefreshCw, X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { getAllWallets, approveWalletKyc, rejectWalletKyc, updateWalletStatus, getAdminWalletTransactions, updateWalletCreditLimit, processBnplPenalties } from '../actions';
import type { Wallet, WalletTransaction } from '../types';

export default function AdminWalletKycDashboard() {
  const [kycs, setKycs] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modal State
  const [selectedKyc, setSelectedKyc] = useState<Wallet | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  // History Modal State
  const [selectedHistoryWallet, setSelectedHistoryWallet] = useState<Wallet | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<WalletTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Update Limit Modal State
  const [updateLimitModal, setUpdateLimitModal] = useState<{ id: string, name: string, currentLimit: number } | null>(null);
  const [updateLimitValue, setUpdateLimitValue] = useState('');
  const [updatingLimit, setUpdatingLimit] = useState(false);

  const [processingPenalties, setProcessingPenalties] = useState(false);

  const fetchKycs = async () => {
    setLoading(true);
    const res = await getAllWallets();
    if (res.success && res.data) {
      setKycs(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
     
    fetchKycs();
  }, []);

  const handleViewHistory = async (wallet: Wallet) => {
    setSelectedHistoryWallet(wallet);
    setLoadingHistory(true);
    setHistoryTransactions([]);
    
    const res = await getAdminWalletTransactions(wallet.id);
    if (res.success && res.data) {
      setHistoryTransactions(res.data);
    }
    setLoadingHistory(false);
  };

  const handleApprove = async () => {
    if (!selectedKyc) return;
    setProcessing(true);
    setError('');
    
    const res = await approveWalletKyc(selectedKyc.id, Number(creditLimit) || 0);
    if (res.success) {
      setSelectedKyc(null);
      setCreditLimit('');
      fetchKycs();
    } else {
      setError(res.error || 'Failed to approve KYC');
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!selectedKyc) return;
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejection or deactivation.');
      return;
    }
    setProcessing(true);
    setError('');
    
    const res = await rejectWalletKyc(selectedKyc.id, rejectReason.trim());
    if (res.success) {
      setSelectedKyc(null);
      setRejectReason('');
      fetchKycs();
    } else {
      setError(res.error || 'Failed to reject KYC');
    }
    setProcessing(false);
  };

  const handleDeactivate = async () => {
    if (!selectedKyc) return;
    setProcessing(true);
    setError('');
    
    const res = await updateWalletStatus(selectedKyc.id, 'rejected');
    if (res.success) {
      setSelectedKyc(null);
      fetchKycs();
    } else {
      setError(res.error || 'Failed to deactivate wallet');
    }
    setProcessing(false);
  };

  const handleUpdateLimitSubmit = async () => {
    if (!updateLimitModal) return;
    setUpdatingLimit(true);
    const newLimit = Number(updateLimitValue) || 0;
    const res = await updateWalletCreditLimit(updateLimitModal.id, newLimit);
    if (res.success) {
      setUpdateLimitModal(null);
      setUpdateLimitValue('');
      fetchKycs();
    } else {
      // You can handle error here, e.g., with a toast or error state
      alert(res.error || 'Failed to update credit limit');
    }
    setUpdatingLimit(false);
  };

  const handleRunPenaltyCheck = async () => {
    if (processingPenalties) return;
    setProcessingPenalties(true);
    try {
      const res = await processBnplPenalties();
      if (res.success) {
        alert(`Penalty check complete! Applied penalties to ${res.processedCount} wallets.`);
        fetchKycs();
      } else {
        alert(res.error || 'Failed to process penalties');
      }
    } catch {
      alert('Error running penalty check');
    } finally {
      setProcessingPenalties(false);
    }
  };

  const pendingCount = kycs.filter((k) => k.status === 'pending').length;

  const filteredKycs = kycs.filter((k) => {
    const name = (k.kyc_name || '').toLowerCase();
    const email = (k.kyc_email || '').toLowerCase();
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || name.includes(q) || email.includes(q);
    const matchesStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'rejected'
        ? ['rejected', 'suspended', 'frozen'].includes(k.status)
        : k.status === filterStatus;
    return Boolean(matchesSearch && matchesStatus);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ztext flex items-center gap-2">
            <ShieldCheck className="text-amber-500 shrink-0" /> Wallet Management
          </h1>
          <p className="text-sm text-ztext-light mt-1">Review KYC submissions and manage student wallets.</p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-z pl-9 text-sm w-full"
            />
          </div>
          <button 
            onClick={handleRunPenaltyCheck}
            disabled={processingPenalties}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-500/10 text-rose-500 font-bold border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {processingPenalties ? <RefreshCw size={16} className="animate-spin shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
            Run Penalty Check
          </button>
          <button 
            onClick={fetchKycs}
            className="p-2.5 bg-zgray text-ztext border border-zborder rounded-xl hover:bg-zcard transition-colors shrink-0"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-zcard border border-zborder rounded-xl w-full sm:w-fit overflow-x-auto max-w-full">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${filterStatus === 'all' ? 'bg-zgray text-ztext' : 'text-ztext-light hover:text-ztext'}`}
        >
          All Requests ({kycs.length})
        </button>
        <button
          onClick={() => setFilterStatus('active')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${filterStatus === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'text-ztext-light hover:text-ztext'}`}
        >
          Active
        </button>
        <button
          onClick={() => setFilterStatus('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap flex items-center gap-2 ${filterStatus === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'text-ztext-light hover:text-ztext'}`}
        >
          Pending {pendingCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px]">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setFilterStatus('rejected')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${filterStatus === 'rejected' ? 'bg-red-500/10 text-red-500' : 'text-ztext-light hover:text-ztext'}`}
        >
          Rejected / Deactivated
        </button>
      </div>

      <div className="bg-zcard border border-zborder rounded-2xl overflow-hidden shadow-z">
        {loading ? (
          <div className="p-12 text-center text-ztext-light">Loading wallets...</div>
        ) : filteredKycs.length === 0 ? (
          <div className="p-12 text-center text-ztext-light">
            <Filter size={48} className="mx-auto mb-4 text-ztext-muted" />
            <p className="font-semibold">No wallets found</p>
            <p className="text-xs">Try changing your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zgray text-ztext-lighter text-xs uppercase font-bold border-b border-zborder">
                  <th className="px-6 py-4">User Details</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Fine</th>
                  <th className="px-6 py-4">Credit Used Date</th>
                  <th className="px-6 py-4">Submitted At</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zborder">
                {filteredKycs.map((kyc) => (
                  <Fragment key={kyc.id}>
                    <tr className="hover:bg-zgray/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-ztext flex items-center gap-2">
                          {kyc.kyc_name || 'N/A'}
                        </div>
                        <div className="text-xs text-ztext-light mt-0.5">{kyc.kyc_email || 'No email provided'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                          kyc.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                          kyc.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                          kyc.status === 'unverified' ? 'bg-blue-500/10 text-blue-500' :
                          kyc.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                          'bg-zgray border border-zborder text-ztext-muted'
                        }`}>
                          {kyc.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {Number(kyc.balance) < 0 && Number(kyc.total_penalties) > 0 ? (
                          <span className="text-xs text-rose-500 font-bold bg-rose-500/10 px-2 py-1 rounded-md">
                            ₹{Number(kyc.total_penalties).toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-xs text-ztext-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-ztext-light">
                        {kyc.credit_used_at ? new Date(kyc.credit_used_at).toLocaleDateString('en-IN') : <span className="text-ztext-muted">-</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-ztext-light">
                        {kyc.kyc_submitted_at ? new Date(kyc.kyc_submitted_at).toLocaleString('en-IN') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => selectedHistoryWallet?.id === kyc.id ? setSelectedHistoryWallet(null) : handleViewHistory(kyc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zgray text-ztext border border-zborder rounded-lg text-xs font-bold hover:bg-zcard hover:border-ztext-muted transition-colors shrink-0"
                          >
                            {selectedHistoryWallet?.id === kyc.id ? (
                              <><ChevronUp size={14} /> History</>
                            ) : (
                              <><ChevronDown size={14} /> History</>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setUpdateLimitModal({ id: kyc.id, name: kyc.kyc_name || 'User', currentLimit: Number(kyc.credit_limit) || 0 });
                              setUpdateLimitValue((kyc.credit_limit || 0).toString());
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zgray text-ztext border border-zborder rounded-lg text-xs font-bold hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30 transition-colors shrink-0"
                          >
                            Update Limit
                          </button>
                          <button
                            onClick={() => { setSelectedKyc(kyc); setRejectReason(''); setCreditLimit(''); setError(''); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zgray text-ztext border border-zborder rounded-lg text-xs font-bold hover:bg-zcard hover:border-ztext-muted transition-colors shrink-0"
                          >
                            <Eye size={14} /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {selectedHistoryWallet?.id === kyc.id && (
                      <tr className="bg-zcard/50">
                        <td colSpan={6} className="p-0 border-b border-zborder">
                          <div className="px-6 py-4 bg-zgray/20 shadow-inner">
                            {loadingHistory ? (
                              <div className="p-4 text-center flex flex-col items-center justify-center gap-2 text-ztext-light">
                                <RefreshCw className="animate-spin text-ztext-muted" size={20} />
                                <p className="text-xs">Loading transactions...</p>
                              </div>
                            ) : historyTransactions.length === 0 ? (
                              <div className="p-4 text-center text-ztext-light bg-zgray/50 rounded-xl border border-zborder text-sm">
                                No transactions found for this wallet.
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                {historyTransactions.map((tx) => (
                                  <div key={tx.id} className="p-3 bg-zcard rounded-lg border border-zborder flex items-center justify-between">
                                    <div>
                                      <p className="font-bold text-ztext text-sm">{tx.description || (tx.type === 'credit' ? 'Credited' : 'Debited')}</p>
                                      <p className="text-xs text-ztext-light mt-1">
                                        {new Date(tx.created_at).toLocaleString('en-IN')}
                                      </p>
                                      {tx.reference_id && <p className="text-[10px] text-ztext-muted mt-1 font-mono">Ref: {tx.reference_id}</p>}
                                    </div>
                                    <div className="text-right">
                                      <p className={`font-black text-sm ${tx.type === 'credit' ? 'text-emerald-500' : 'text-ztext'}`}>
                                        {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                                      </p>
                                      <p className="text-[10px] text-ztext-muted font-bold mt-0.5">
                                        Bal: ₹{tx.balance_after.toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedKyc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-start sm:items-center justify-between pb-4 border-b border-zborder mb-4 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-ztext break-words">
                  Wallet Details: {selectedKyc.kyc_name || 'User'}
                </h2>
                <span className={`px-2 py-0.5 sm:py-1 rounded-md text-[10px] font-black uppercase shrink-0 ${
                  selectedKyc.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                  selectedKyc.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                  selectedKyc.status === 'unverified' ? 'bg-blue-500/10 text-blue-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  {selectedKyc.status}
                </span>
              </div>
              <button 
                onClick={() => setSelectedKyc(null)}
                className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-zgray/30 p-3 sm:p-4 rounded-xl border border-zborder text-sm">
              <div className="break-words">
                <p className="text-xs font-bold text-ztext-light mb-1">KYC Email</p>
                <p className="font-medium text-xs sm:text-sm">{selectedKyc.kyc_email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ztext-light mb-1">Document Type</p>
                <p className="font-medium text-xs sm:text-sm">{selectedKyc.document_type || 'N/A'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
              <div>
                <label className="block text-xs font-semibold text-ztext-lighter mb-2">Live Photo / Selfie</label>
                {selectedKyc.kyc_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedKyc.kyc_photo_url} alt="Selfie" className="w-full h-44 sm:h-48 object-cover rounded-xl border border-zborder bg-zgray" />
                ) : (
                  <div className="w-full h-44 sm:h-48 bg-zgray rounded-xl border border-zborder flex items-center justify-center text-xs text-ztext-muted">No Image</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-ztext-lighter mb-2">Document Proof</label>
                {selectedKyc.pan_card_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedKyc.pan_card_url} alt="ID Document" className="w-full h-44 sm:h-48 object-contain rounded-xl border border-zborder bg-zgray" />
                ) : (
                  <div className="w-full h-44 sm:h-48 bg-zgray rounded-xl border border-zborder flex items-center justify-center text-xs text-ztext-muted">No Document</div>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" /> <span>{error}</span>
              </div>
            )}

            {selectedKyc.status === 'active' ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 sm:p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                  <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-500">Deactivate Wallet</h3>
                    <p className="text-xs text-ztext-light mt-1">If you deactivate this wallet, the user will no longer be able to use their balance until re-approved.</p>
                  </div>
                </div>
                <button
                  onClick={handleDeactivate}
                  disabled={processing}
                  className="w-full py-3 px-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <XCircle size={18} className="shrink-0" /> Deactivate Wallet
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-zgray/50 border border-zborder rounded-xl p-3 sm:p-4">
                    <label className="block text-xs font-semibold text-ztext-lighter mb-2">Rejection Reason (Optional for Approve)</label>
                    <input
                      type="text"
                      placeholder="Required if rejecting"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="input-z w-full text-sm"
                    />
                  </div>
                  
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 sm:p-4">
                    <label className="block text-xs font-semibold text-emerald-600 mb-2">Assign BNPL Credit Limit (₹)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 1000"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="input-z w-full text-sm !border-emerald-500/30 focus:!border-emerald-500"
                    />
                    <p className="text-[10px] text-ztext-muted mt-1">Leave 0 for no overdraft allowed.</p>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={handleReject}
                    disabled={processing}
                    className="w-full sm:flex-1 py-3 px-4 bg-zgray border border-red-500/30 text-red-400 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    <XCircle size={18} className="shrink-0" /> Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={processing}
                    className="w-full sm:flex-1 py-3 px-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-sm sm:text-base"
                  >
                    <CheckCircle size={18} className="shrink-0" /> {selectedKyc.status === 'rejected' ? 'Re-Approve KYC' : 'Approve KYC'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Update Limit Modal */}
      {updateLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-sm w-full p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zborder mb-4">
              <h2 className="text-base sm:text-lg font-bold text-ztext flex items-center gap-2 break-words">Update Limit: {updateLimitModal.name}</h2>
              <button 
                onClick={() => setUpdateLimitModal(null)}
                className="p-1.5 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-xs font-semibold text-emerald-500 mb-2">New BNPL Credit Limit (₹)</label>
              <input
                type="number"
                min="0"
                value={updateLimitValue}
                onChange={(e) => setUpdateLimitValue(e.target.value)}
                className="input-z w-full text-sm !border-emerald-500/30 focus:!border-emerald-500"
                placeholder="e.g. 1000"
              />
              <p className="text-[10px] text-ztext-muted mt-2">Current Limit: ₹{updateLimitModal.currentLimit}</p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={() => setUpdateLimitModal(null)}
                disabled={updatingLimit}
                className="w-full sm:flex-1 py-3 px-4 bg-zgray text-ztext font-bold rounded-xl hover:bg-zborder transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLimitSubmit}
                disabled={updatingLimit}
                className="w-full sm:flex-1 py-3 px-4 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                {updatingLimit ? 'Updating...' : 'Update Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
