'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet as WalletIcon,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  X,
  CreditCard,
  QrCode,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';
import { getWalletDetails, topupWallet, verifyAndTopupWalletWithRazorpay } from '../actions';
import { loadRazorpayScript, openRazorpayCheckout } from '@/features/payments/services/razorpay';
import { createRazorpayOrder, getAvailablePaymentMethods } from '@/features/payments/actions';
import type { PaymentMethodAvailability } from '@/lib/settings';
import type { WalletSummary, WalletTransaction } from '../types';

export default function StudentWalletDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch] = useState('');

  // Top Up Modal State
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('500');
  const [paymentMethod, setPaymentMethod] = useState('Razorpay (UPI, Cards, NetBanking)');
  const [submittingTopup, setSubmittingTopup] = useState(false);
  const [modalError, setModalError] = useState('');
  const [availableMethods, setAvailableMethods] = useState<PaymentMethodAvailability[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);


  // Toast State
  const [toastMsg, setToastMsg] = useState('');

  const loadWallet = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    const res = await getWalletDetails();
    if (res.success && res.data) {
      setSummary(res.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const res = await getWalletDetails();
      if (!mounted) return;
      if (res.success && res.data) {
        setSummary(res.data);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAvailablePaymentMethods().then((methods) => {
      if (cancelled) return;
      setAvailableMethods(methods);
      setMethodsLoaded(true);
    }).catch(() => {
      if (!cancelled) setMethodsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const amt = Number(topupAmount);

    if (isNaN(amt) || amt <= 0) {
      setModalError('Please enter a valid top-up amount');
      return;
    }
    if (hasFine && amt < minDueAmount) {
      setModalError(`Minimum top-up of ₹${minDueAmount} is required to clear your outstanding debt and fine.`);
      return;
    }
    if (amt > 50000) {
      setModalError('Maximum single top-up limit is ₹50,000');
      return;
    }

    setSubmittingTopup(true);

    if (paymentMethod.startsWith('Razorpay')) {
      try {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          setModalError('Failed to load Razorpay gateway. Check your internet connection.');
          setSubmittingTopup(false);
          return;
        }

        const rzpOrder = await createRazorpayOrder(amt * 100);
        if (!rzpOrder.success) {
          setModalError(rzpOrder.error || 'Failed to initialize Razorpay order.');
          setSubmittingTopup(false);
          return;
        }

        openRazorpayCheckout({
          key: rzpOrder.data.keyId,
          amount: amt * 100,
          currency: 'INR',
          name: 'Ethics Pay',
          description: `Top Up Wallet ₹${amt}`,
          orderId: rzpOrder.data.id,
          onSuccess: async (response) => {
            try {
              const res = await verifyAndTopupWalletWithRazorpay({
                amount: amt,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              });

              if (res.success) {
                showToast(`Successfully added ₹${amt.toLocaleString('en-IN')} to your wallet via Razorpay!`);
                setShowTopupModal(false);
                setTopupAmount('500');
                setFilter('all');
                await loadWallet(true);
              } else {
                setModalError(res.error || 'Failed to verify Razorpay payment.');
              }
            } catch {
              setModalError('Error verifying payment with server.');
            } finally {
              setSubmittingTopup(false);
            }
          },
          onFailure: (err) => {
            setModalError(err || 'Payment cancelled');
            setSubmittingTopup(false);
          },
        });
      } catch {
        setModalError('Unexpected error during Razorpay checkout.');
        setSubmittingTopup(false);
      }
    } else {
      try {
        const res = await topupWallet(amt, paymentMethod);
        if (res.success) {
          showToast(`Successfully added ₹${amt.toLocaleString('en-IN')} to your wallet!`);
          setShowTopupModal(false);
          setTopupAmount('500');
          setFilter('all');
          await loadWallet(true);
        } else {
          setModalError(res.error || 'Failed to complete wallet top up');
        }
      } catch {
        setModalError('An unexpected error occurred. Please try again.');
      } finally {
        setSubmittingTopup(false);
      }
    }
  };

  const balance = summary?.balance ?? 0;
  const totalCredit = summary?.totalCredit ?? 0;
  const totalDebit = summary?.totalDebit ?? 0;
  const creditLimit = summary?.creditLimit ?? 500;
  const hasFine = balance < 0 && (Number(summary?.wallet?.total_penalties) > 0);
  const minDueAmount = hasFine ? Math.ceil(Math.abs(balance)) : 1;

  const isAvail = (id: string) => {
    const avail = availableMethods.find((a) => a.id === id);
    return avail ? avail.enabled && avail.configured : false;
  };

  const walletMethods = [
    { id: 'Razorpay (UPI, Cards, NetBanking)', label: 'Razorpay (UPI, Cards, NetBanking)', icon: CreditCard, badge: 'Instant & Verified', gate: () => isAvail('razorpay') },
    { id: 'UPI Direct (GPay, PhonePe, Paytm)', label: 'UPI Direct (GPay, PhonePe, Paytm)', icon: QrCode, gate: () => isAvail('gpay') || isAvail('phonepe') },
  ].filter((pm) => pm.gate());

  const hasPaymentMethods = methodsLoaded && walletMethods.length > 0;

  const filteredTransactions = (summary?.transactions || []).filter((tx) => {
    const matchesFilter = filter === 'all' || tx.type === filter;
    const query = search.toLowerCase();
    const matchesSearch =
      !search ||
      (tx.description && tx.description.toLowerCase().includes(query)) ||
      (tx.payment_reference && tx.payment_reference.toLowerCase().includes(query)) ||
      (tx.order_id && tx.order_id.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  const formatTxDescription = (tx: WalletTransaction) => {
    const isCredit = tx.type === 'credit';
    let text = tx.description || tx.note || (isCredit ? 'Wallet Top Up' : 'Order Payment');
    // Clean up long raw UUIDs: "Deducted ₹115 for order f3273f41-a45b-485f-acd8-3fd27cf7e25c" -> "Deducted ₹115 for Order #f3273f41"
    text = text.replace(/for order ([a-f0-9-]{36})/i, (match, uuid) => {
      return `for Order #${uuid.substring(0, 8)}`;
    });
    return text;
  };

  const walletStatus = summary?.wallet?.status || 'unverified';

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-zcard rounded-2xl border border-zborder p-6 h-48" />
        <div className="bg-zcard rounded-2xl border border-zborder p-6 h-64" />
      </div>
    );
  }

  if (walletStatus === 'pending') {
    return (
      <div className="bg-zcard rounded-2xl border border-zborder p-8 sm:p-12 text-center shadow-z flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
          <RefreshCw size={32} className="animate-spin" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-ztext mb-2">KYC Under Review</h2>
        <p className="text-sm text-ztext-light max-w-md mx-auto">
          Your wallet activation request is currently pending. Our admin team is reviewing your documents. Please check back later.
        </p>
      </div>
    );
  }

  if (walletStatus === 'unverified' || walletStatus === 'rejected') {
    return (
      <div className="bg-zcard rounded-2xl border border-zborder p-5 sm:p-8 shadow-z">
        <div className="flex items-center gap-3 mb-6 border-b border-zborder pb-4">
          <div className="w-10 h-10 rounded-xl bg-zred/10 flex items-center justify-center text-zred">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-ztext">Activate Your Wallet</h2>
            <p className="text-xs sm:text-sm text-ztext-light">Please complete your KYC to unlock wallet features.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center">
          <button
            onClick={() => router.push('/profile')}
            className="w-full py-3 bg-zred text-white rounded-xl text-sm font-bold hover:bg-zred-dark transition-all inline-flex items-center justify-center gap-2"
          >
            Go to Profile to Complete KYC
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 text-xs sm:text-sm font-semibold animate-fade-up">
          <CheckCircle size={18} />
          {toastMsg}
        </div>
      )}

      {/* TOP SECTION: Available Balance Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zcard via-zcard to-zred/10 rounded-2xl border border-zborder p-5 sm:p-7 shadow-z">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none text-zred hidden sm:block">
          <WalletIcon size={160} />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zred/10 border border-zred/20 text-zred text-[11px] sm:text-xs font-bold mb-2">
              <Sparkles size={12} /> Ethics Pay Balance
            </div>
            <p className="text-[10px] sm:text-xs text-ztext-lighter uppercase tracking-wider font-semibold">Total Available Balance</p>
            <h2 className={`text-3xl xs:text-4xl sm:text-5xl font-black tracking-tight ${balance < 0 ? 'text-red-400' : 'text-ztext'}`}>
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h2>
            {balance < 0 && (
              <p className="text-xs font-semibold text-red-400 pt-1 flex items-center gap-1">
                ⚠️ Negative Balance (Overdraft used: ₹{Math.abs(balance).toLocaleString('en-IN')}, limit ₹{creditLimit.toLocaleString('en-IN')})
              </p>
            )}

            {/* Credit / Debit Mini Stats */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 pt-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <ArrowDownLeft size={13} />
                <span>Total Added: +₹{totalCredit.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                <ArrowUpRight size={13} />
                <span>Total Spent: -₹{totalDebit.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zgray border border-zborder text-ztext-light text-xs font-semibold">
                <span>Credit Limit: ₹{creditLimit.toLocaleString('en-IN')}</span>
              </div>
              {Number(summary?.balance) < 0 && Number(summary?.wallet?.total_penalties) > 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
                  <span>Pending Fine: ₹{Number(summary?.wallet?.total_penalties).toLocaleString('en-IN')}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
            <button
              onClick={() => router.back()}
              className="sm:hidden p-3 rounded-xl bg-zgray hover:bg-zcard border border-zborder text-ztext-light hover:text-ztext transition-all flex items-center justify-center"
              title="Go Back"
            >
              <ArrowLeft size={18} />
            </button>

            <button
              onClick={() => loadWallet(true)}
              disabled={refreshing}
              className="p-3 rounded-xl bg-zgray hover:bg-zcard border border-zborder text-ztext-light hover:text-ztext transition-all flex items-center justify-center"
              title="Refresh Balance"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => {
                setModalError('');
                if (walletMethods[0] && !walletMethods.some((pm) => pm.id === paymentMethod)) {
                  setPaymentMethod(walletMethods[0].id);
                }
                setTopupAmount(hasFine ? minDueAmount.toString() : '500');
                setShowTopupModal(true);
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-zred to-zred-dark text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg hover:shadow-zred/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <PlusCircle size={17} /> Top Up Wallet
            </button>
          </div>
        </div>
      </div>

      {/* DOWNSIDE SECTION: Transaction History */}
      <div className="bg-zcard rounded-2xl border border-zborder overflow-hidden shadow-z">
        {/* Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-zborder flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-ztext flex items-center gap-2">
                <ShieldCheck size={17} className="text-zred" /> Transaction History
              </h3>
              <p className="text-[11px] sm:text-xs text-ztext-light mt-0.5">
                Showing all credit top-ups and debit purchases
              </p>
            </div>

            {/* Show / Hide Toggle on Mobile */}
            <button
              onClick={() => setShowHistory((prev) => !prev)}
              className="sm:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zgray hover:bg-zborder text-xs font-bold text-ztext transition-colors"
            >
              {showHistory ? (
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

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Show / Hide Toggle on Desktop */}
            <button
              onClick={() => setShowHistory((prev) => !prev)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zgray hover:bg-zborder text-xs font-bold text-ztext transition-colors"
            >
              {showHistory ? (
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
          </div>
        </div>

        {showHistory && (
          <>
            {/* Filters & Search */}
            <div className="p-4 bg-zgray/30 border-b border-zborder flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
              <div className="relative flex-1 sm:w-44">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search txns..."
                  className="input-z pl-8 py-1.5 text-xs w-full"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center justify-between bg-zgray p-1 rounded-xl border border-zborder text-xs font-semibold">
                <button
                  onClick={() => setFilter('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                    filter === 'all' ? 'bg-zcard text-ztext shadow-sm' : 'text-ztext-lighter hover:text-ztext'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('credit')}
                  className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                    filter === 'credit' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-ztext-lighter hover:text-ztext'
                  }`}
                >
                  Credit (+)
                </button>
                <button
                  onClick={() => setFilter('debit')}
                  className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                    filter === 'debit' ? 'bg-red-500/20 text-red-400 shadow-sm' : 'text-ztext-lighter hover:text-ztext'
                  }`}
                >
                  Debit (-)
                </button>
              </div>
            </div>

            {/* Transactions List */}
            {filteredTransactions.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="w-11 h-11 rounded-full bg-zgray flex items-center justify-center mx-auto mb-3 text-ztext-muted">
                  <WalletIcon size={22} />
                </div>
                <p className="font-semibold text-ztext text-xs sm:text-sm">No transactions found</p>
                <p className="text-[11px] sm:text-xs text-ztext-light mt-1">
                  {search ? 'Try clearing your search terms.' : 'Top up your wallet to start using instant one-click payments.'}
                </p>
                {!search && (
                  <button
                    onClick={() => {
                      setModalError('');
                      setTopupAmount(hasFine ? minDueAmount.toString() : '500');
                      setShowTopupModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-zred/10 text-zred border border-zred/20 rounded-xl text-xs font-bold hover:bg-zred hover:text-white transition-all"
                  >
                    <PlusCircle size={14} /> Top Up Now
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-zborder">
                {filteredTransactions.map((tx) => {
                  const isCredit = tx.type === 'credit';
                  const dateStr = new Date(tx.created_at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const descriptionText = formatTxDescription(tx);

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 sm:px-6 flex items-center justify-between gap-3 sm:gap-4 hover:bg-zgray/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isCredit
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}
                        >
                          {isCredit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-bold text-ztext text-xs sm:text-sm leading-snug truncate">
                            {descriptionText}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ztext-lighter mt-0.5">
                            <span>{dateStr}</span>
                            {tx.payment_reference && (
                              <span className="font-mono text-[10px] bg-zgray px-1.5 py-0.5 rounded border border-zborder max-w-[120px] sm:max-w-none truncate">
                                {tx.payment_reference}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={`font-extrabold text-sm sm:text-base ${
                            isCredit ? 'text-emerald-400' : 'text-ztext'
                          }`}
                        >
                          {isCredit ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        {tx.balance_after > 0 && (
                          <p className="text-[10px] sm:text-[11px] text-ztext-lighter mt-0.5">
                            Bal: ₹{tx.balance_after.toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* TOP UP MODAL */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-z-modal animate-scale-up">
            <div className="flex items-center justify-between pb-3.5 border-b border-zborder">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zred/10 border border-zred/20 flex items-center justify-center text-zred">
                  <PlusCircle size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ztext text-sm sm:text-base">Top Up Wallet</h3>
                  <p className="text-[11px] text-ztext-lighter">Instant credit added to your account</p>
                </div>
              </div>
              <button
                onClick={() => setShowTopupModal(false)}
                className="p-1 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTopupSubmit} className="mt-4 space-y-4">
              {/* Alert if user has fine / overdue debt */}
              {hasFine && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-500 flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-xs sm:text-sm">Overdue Debt & Fine: ₹{minDueAmount.toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-ztext-light mt-0.5 leading-relaxed">
                      You must top up at least <strong className="text-rose-500 font-bold">₹{minDueAmount.toLocaleString('en-IN')}</strong> to clear your outstanding dues. Preset options are disabled. You can add more money, but not less.
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Amount Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-ztext-lighter">Select Amount</label>
                  {hasFine && (
                    <span className="text-[10px] font-semibold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">
                      Presets disabled
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['100', '200', '500', '1000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      disabled={hasFine}
                      onClick={() => !hasFine && setTopupAmount(amt)}
                      className={`py-2 px-2 sm:px-3 rounded-xl border text-xs font-bold transition-all ${
                        hasFine
                          ? 'bg-zgray/40 border-zborder/50 text-ztext-muted/40 cursor-not-allowed opacity-40'
                          : topupAmount === amt
                          ? 'bg-zred text-white border-zred shadow-md'
                          : 'bg-zgray border-zborder text-ztext hover:border-zred/40'
                      }`}
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount Input */}
              <div>
                <label className="text-[11px] font-semibold text-ztext-lighter block mb-1">
                  {hasFine ? `Top Up Amount (Minimum ₹${minDueAmount.toLocaleString('en-IN')})` : 'Or Enter Custom Amount (₹)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ztext-light font-bold text-xs sm:text-sm">₹</span>
                  <input
                    type="number"
                    value={topupAmount}
                    onChange={(e) => {
                      setTopupAmount(e.target.value);
                      if (modalError) setModalError('');
                    }}
                    onBlur={() => {
                      if (hasFine && (Number(topupAmount) < minDueAmount || isNaN(Number(topupAmount)))) {
                        setTopupAmount(minDueAmount.toString());
                      }
                    }}
                    placeholder={`Enter amount (min ₹${hasFine ? minDueAmount : 1})`}
                    min={hasFine ? minDueAmount : 1}
                    max="50000"
                    className={`input-z pl-8 text-xs sm:text-sm font-bold ${
                      hasFine && Number(topupAmount) < minDueAmount ? '!border-rose-500 text-rose-500' : ''
                    }`}
                    autoFocus
                  />
                </div>
                {hasFine && (
                  <p className="text-[10px] text-ztext-muted mt-1.5 flex items-center justify-between">
                    <span>Minimum required: <strong className="text-rose-500 font-bold">₹{minDueAmount.toLocaleString('en-IN')}</strong></span>
                    <span className="text-ztext-lighter font-medium">Cannot decrease</span>
                  </p>
                )}
              </div>

              {/* Payment Method Selector */}
              {methodsLoaded && walletMethods.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-ztext-lighter block mb-1.5">Payment Method</label>
                  <div className="space-y-2">
                    {walletMethods.map((pm) => (
                      <label
                        key={pm.id}
                        onClick={() => setPaymentMethod(pm.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          paymentMethod === pm.id
                            ? 'bg-zred/10 border-zred text-ztext'
                            : 'bg-zgray border-zborder text-ztext-light hover:text-ztext'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <pm.icon size={16} className="text-zred shrink-0" />
                          <span className="text-xs font-semibold">{pm.label}</span>
                          {pm.badge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zred/20 text-zred font-bold">
                              {pm.badge}
                            </span>
                          )}
                        </div>
                        <input
                          type="radio"
                          name="payment_method"
                          checked={paymentMethod === pm.id}
                          onChange={() => setPaymentMethod(pm.id)}
                          className="accent-zred shrink-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {methodsLoaded && walletMethods.length === 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>No payment methods are enabled by the store. Contact the owner to enable wallet top-ups.</span>
                </div>
              )}

              {!methodsLoaded && (
                <div className="p-3 bg-zgray rounded-xl text-xs text-ztext-lighter flex items-center gap-2 animate-pulse">
                  Loading payment options…
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-3 border-t border-zborder">
                <button
                  type="button"
                  onClick={() => setShowTopupModal(false)}
                  className="flex-1 py-2.5 bg-zgray text-ztext-light border border-zborder rounded-xl text-xs font-bold hover:bg-zcard transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingTopup || !hasPaymentMethods}
                  className="flex-1 py-2.5 bg-zred text-white rounded-xl text-xs font-bold hover:bg-zred-dark transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-z"
                >
                  {submittingTopup ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <PlusCircle size={14} /> Add ₹{Number(topupAmount) || 0}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
