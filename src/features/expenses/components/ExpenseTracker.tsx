'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Loader2,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { getExpenseSummary, deleteExpenseTransaction } from '../actions';
import { showToast } from '@/components/shared/Toast';
import StartingBalanceModal from './StartingBalanceModal';
import AddEditExpenseModal from './AddEditExpenseModal';
import type { ExpenseSummary, DateFilterType, ExpenseTransaction, ExpenseType } from '../types';

function getPastWeekRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { startDate: format(start), endDate: format(end) };
}

export default function ExpenseTracker({ readOnly = false }: { readOnly?: boolean }) {
  const defaultRange = getPastWeekRange();

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state — defaults to past 1 week on page load
  const [activeFilter, setActiveFilter] = useState<DateFilterType>('custom');
  const [customStart, setCustomStart] = useState<string>(defaultRange.startDate);
  const [customEnd, setCustomEnd] = useState<string>(defaultRange.endDate);

  // Transaction history show/hide state (default to false: only show when clicked)
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Modals state
  const [isStartingBalanceOpen, setIsStartingBalanceOpen] = useState<boolean>(false);
  const [isAddEditOpen, setIsAddEditOpen] = useState<boolean>(false);
  const [modalInitialType, setModalInitialType] = useState<ExpenseType>('expense');
  const [editingTransaction, setEditingTransaction] = useState<ExpenseTransaction | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // If custom dates are empty, fetch all-time data
    const filterToUse: DateFilterType =
      activeFilter === 'custom' && (!customStart || !customEnd) ? 'all' : activeFilter;

    const res = await getExpenseSummary(filterToUse, customStart, customEnd);
    setLoading(false);

    if (res.success && res.data) {
      setSummary(res.data);
    } else {
      setError(res.error || 'Failed to load expense data');
    }
  }, [activeFilter, customStart, customEnd]);

  useEffect(() => {
    loadData();  
  }, [loadData]);

  const handleOpenAddExpense = () => {
    setModalInitialType('expense');
    setEditingTransaction(null);
    setIsAddEditOpen(true);
  };

  const handleOpenAddMoney = () => {
    setModalInitialType('income');
    setEditingTransaction(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (tx: ExpenseTransaction) => {
    setModalInitialType(tx.type);
    setEditingTransaction(tx);
    setIsAddEditOpen(true);
  };

  const handleResetFilter = () => {
    setCustomStart('');
    setCustomEnd('');
    setActiveFilter('all');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;

    setDeletingId(id);
    const res = await deleteExpenseTransaction(id);
    setDeletingId(null);

    if (!res.success) {
      showToast(res.error || 'Failed to delete transaction');
    } else {
      showToast('Transaction deleted');
      loadData();
    }
  };

  const formatCurrency = (val: number) => {
    return `₹${Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatBalanceDisplay = (val: number) => {
    const isPositive = val >= 0;
    const sign = isPositive ? '+' : '−';
    const formatted = formatCurrency(val);
    return {
      isPositive,
      sign,
      fullText: `${sign} ${formatted}`,
    };
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Determine active date range metrics
  const isCustomActive = activeFilter === 'custom' && Boolean(customStart && customEnd);
  const currentIncome = isCustomActive ? (summary?.periodIncome ?? 0) : (summary?.totalIncome ?? 0);
  const currentExpenses = isCustomActive ? (summary?.periodExpenses ?? 0) : (summary?.totalExpenses ?? 0);
  const calculatedAvailableBalance =
    (summary?.startingBalance ?? 0) + currentIncome - currentExpenses;
  const balanceFormat = formatBalanceDisplay(calculatedAvailableBalance);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs sm:text-sm text-red-400 font-medium flex items-center justify-between gap-3">
          <p>{error}</p>
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 font-bold hover:bg-red-500/30 transition-colors shrink-0 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header & Main Button Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-normal text-ztext tracking-tight flex items-center gap-2">
            <Wallet className="text-zred" size={24} />
            Expenses
          </h1>
        </div>

        {/* Button Row [Add Money] [Add Expense] or Read-Only Badge */}
        {readOnly ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ztext-muted bg-zcard rounded-xl border border-zborder shrink-0">
            <Lock size={13} />
            <span>Read-only view</span>
          </div>
        ) : (
          <div className="flex flex-row items-center gap-2.5 w-full sm:w-auto shrink-0">
            {/* Add Money Button */}
            <button
              onClick={handleOpenAddMoney}
              className="flex-1 sm:flex-initial min-h-[44px] button-z bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-5 py-2.5 shadow-md flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98]"
            >
              <ArrowDownLeft size={18} strokeWidth={2.5} />
              <span>Add Money</span>
            </button>

            {/* Add Expense Button */}
            <button
              onClick={handleOpenAddExpense}
              className="flex-1 sm:flex-initial min-h-[44px] button-z button-z-primary text-sm px-5 py-2.5 shadow-md flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98]"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>Add Expense</span>
            </button>
          </div>
        )}
      </div>

      {/* Task A1: Filter Transactions Control Section (Start Date | End Date | Reset in ONE SINGLE ROW) */}
      <div className="bg-zcard rounded-2xl border border-zborder p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-ztext">
            <Filter size={16} className="text-zred" />
            <span>Filter Transactions:</span>
          </div>

          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-1.5 rounded-lg text-ztext-muted hover:bg-zgray hover:text-ztext transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Task A1 Requirement: Start Date | End Date | Reset all in ONE SINGLE ROW (desktop & mobile) */}
        <div className="grid grid-cols-3 gap-2 items-end w-full">
          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-ztext-muted mb-1 truncate">
              Start Date
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setActiveFilter('custom');
              }}
              className="input-z text-xs p-1.5 sm:p-2 w-full text-ztext"
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-[11px] font-semibold text-ztext-muted mb-1 truncate">
              End Date
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setActiveFilter('custom');
              }}
              className="input-z text-xs p-1.5 sm:p-2 w-full text-ztext"
            />
          </div>

          <div>
            <button
              onClick={handleResetFilter}
              className="w-full h-[34px] sm:h-[38px] text-xs font-bold text-ztext-light hover:text-ztext px-2 sm:px-3 rounded-xl bg-zgray hover:bg-zborder transition-colors flex items-center justify-center gap-1 shrink-0"
              title="Clear date range and show all transactions"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards: Available Balance & Total Expenses in ONE SAME ROW on all screens with compact size on mobile */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
        {/* Card 1: Available Balance */}
        <div className="bg-zcard rounded-xl sm:rounded-2xl border border-zborder p-3 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-ztext-muted truncate">
                  Available Balance
                </p>
                <span
                  className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border uppercase ${
                    balanceFormat.isPositive
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}
                >
                  {balanceFormat.isPositive ? 'Credit' : 'Deficit'}
                </span>
              </div>
              <div
                className={`mt-1 sm:mt-2 text-base sm:text-3xl font-bold sm:font-black truncate ${
                  balanceFormat.isPositive ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {loading && !summary ? (
                  <div className="h-6 sm:h-9 w-20 sm:w-32 bg-zgray animate-pulse rounded-lg" />
                ) : (
                  balanceFormat.fullText
                )}
              </div>
            </div>
            <div
              className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 ${
                balanceFormat.isPositive
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-red-500/10 text-red-500'
              }`}
            >
              <Wallet size={16} className="sm:w-[22px] sm:h-[22px]" />
            </div>
          </div>

          <div className="mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-zborder flex flex-col xs:flex-row xs:items-center justify-between gap-1 text-[10px] sm:text-xs">
            <span className="text-ztext-light font-medium truncate">
              Starting: {formatCurrency(summary?.startingBalance ?? 0)}
            </span>
            {!readOnly && (
              <button
                onClick={() => setIsStartingBalanceOpen(true)}
                className="text-zred font-bold hover:underline flex items-center gap-1 shrink-0"
              >
                <Pencil size={11} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Total Expenses */}
        <div className="bg-zcard rounded-xl sm:rounded-2xl border border-zborder p-3 sm:p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-red-500 flex items-center gap-1 truncate">
                <ArrowUpRight size={12} className="sm:w-3.5 sm:h-3.5 shrink-0" /> Total Expenses
              </p>
              <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-bold sm:font-black text-red-500 truncate">
                {loading && !summary ? (
                  <div className="h-6 sm:h-8 w-16 sm:w-28 bg-zgray animate-pulse rounded-lg" />
                ) : (
                  `− ${formatCurrency(currentExpenses)}`
                )}
              </div>
            </div>
            <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-red-500/10 text-red-500 shrink-0">
              <ArrowUpRight size={16} className="sm:w-[22px] sm:h-[22px]" />
            </div>
          </div>
          <p className="mt-2 sm:mt-3 text-[9px] sm:text-[11px] text-ztext-muted truncate">
            {isCustomActive ? 'Expenses in range' : 'All Time Expenses'}
          </p>
        </div>
      </div>

      {/* Transaction History Section with Show / Hide Toggle Button */}
      <div className="bg-zcard rounded-2xl border border-zborder shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zborder flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-zred" />
            <h2 className="text-sm font-bold text-ztext">Transaction History</h2>
            <span className="text-xs font-semibold text-ztext-muted">
              ({summary?.transactions.length || 0})
            </span>
          </div>

          {/* Show / Hide Button */}
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zgray hover:bg-zborder text-xs font-bold text-ztext transition-colors"
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

        {showHistory && (
          <div>
            {error && (
              <div className="p-6 text-center">
                <p className="text-xs font-semibold text-red-500">{error}</p>
                <button onClick={loadData} className="mt-2 button-z button-z-ghost text-xs">
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                <Loader2 size={24} className="animate-spin text-zred" />
                <p className="text-xs text-ztext-muted font-medium">Loading transaction records...</p>
              </div>
            ) : summary?.transactions.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zgray flex items-center justify-center text-ztext-muted mb-1">
                  <SlidersHorizontal size={20} />
                </div>
                <p className="text-sm font-bold text-ztext">No transactions found</p>
                <p className="text-xs text-ztext-muted max-w-sm">
                  No income or expense records found for the selected period. Click below to add an expense or money entry.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleOpenAddMoney}
                    className="button-z bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5"
                  >
                    <ArrowDownLeft size={14} /> Add Money
                  </button>
                  <button
                    onClick={handleOpenAddExpense}
                    className="button-z button-z-primary text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Expense
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-zborder overflow-x-auto">
                {/* Desktop Header */}
                <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-zgray/50 text-[11px] font-bold text-ztext-muted uppercase tracking-wider">
                  <div className="col-span-2">Date</div>
                  <div className="col-span-4">Category / Description</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-2 text-right">Running Balance</div>
                  <div className="col-span-2 text-center">Actions</div>
                </div>

                {/* Transaction Rows */}
                {summary?.transactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const isDeleting = deletingId === tx.id;

                  return (
                    <div
                      key={tx.id}
                      className="p-3 sm:p-4 md:px-4 md:py-3 hover:bg-zgray/40 transition-colors flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-3 items-stretch md:items-center"
                    >
                      {/* Row Top: Date & Type Badge */}
                      <div className="flex items-center justify-between md:col-span-2">
                        <span className="text-xs font-semibold text-ztext-light whitespace-nowrap">
                          {formatDateLabel(tx.transaction_date)}
                        </span>
                        <span
                          className={`md:hidden text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase ${
                            isIncome
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}
                        >
                          {isIncome ? '+' : '−'} {tx.type}
                        </span>
                      </div>

                      {/* Description / Category & Note */}
                      <div className="md:col-span-4 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`hidden md:inline-flex w-2 h-2 rounded-full shrink-0 ${
                              isIncome ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <p className="text-xs sm:text-sm font-bold text-ztext truncate">
                            {tx.description}
                          </p>
                        </div>
                        {tx.note && (
                          <p className="text-[11px] text-ztext-muted mt-0.5 truncate md:pl-4">
                            {tx.note}
                          </p>
                        )}
                      </div>

                      {/* Amount & Running Balance Row on Mobile */}
                      <div className="flex items-center justify-between md:contents pt-1 md:pt-0 border-t md:border-t-0 border-zborder/40">
                        {/* Amount */}
                        <div className="md:col-span-2 md:text-right">
                          <span className="md:hidden text-[11px] text-ztext-muted mr-1">Amount:</span>
                          <span
                            className={`text-xs sm:text-sm font-extrabold ${
                              isIncome ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {isIncome ? '+ ' : '− '}
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>

                        {/* Running Balance */}
                        <div className="md:col-span-2 md:text-right">
                          <span className="md:hidden text-[11px] text-ztext-muted mr-1">Balance:</span>
                          <span className="text-xs font-bold text-ztext">
                            {formatCurrency(tx.running_balance)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      {!readOnly ? (
                        <div className="md:col-span-2 flex items-center justify-end md:justify-center gap-1 pt-1 md:pt-0">
                          <button
                            onClick={() => handleOpenEdit(tx)}
                            disabled={isDeleting}
                            title="Edit Entry"
                            className="p-1.5 rounded-lg text-ztext-muted hover:bg-zgray hover:text-ztext transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(tx.id)}
                            disabled={isDeleting}
                            title="Delete Entry"
                            className="p-1.5 rounded-lg text-ztext-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          >
                            {isDeleting ? (
                              <Loader2 size={14} className="animate-spin text-red-500" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="hidden md:flex md:col-span-2 items-center justify-center text-xs text-ztext-muted">
                          —
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals only mounted for editable admin mode */}
      {!readOnly && (
        <>
          <StartingBalanceModal
            isOpen={isStartingBalanceOpen}
            onClose={() => setIsStartingBalanceOpen(false)}
            currentBalance={summary?.startingBalance ?? 0}
            onSuccess={loadData}
          />

          <AddEditExpenseModal
            isOpen={isAddEditOpen}
            onClose={() => {
              setIsAddEditOpen(false);
              setEditingTransaction(null);
            }}
            initialType={modalInitialType}
            transaction={editingTransaction}
            onSuccess={loadData}
          />
        </>
      )}
    </div>
  );
}
