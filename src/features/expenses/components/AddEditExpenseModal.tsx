'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, IndianRupee, Pencil, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { addExpenseTransaction, updateExpenseTransaction } from '../actions';
import { showToast } from '@/components/shared/Toast';
import type { ExpenseTransaction, ExpenseType } from '../types';

interface AddEditExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: ExpenseTransaction | null;
  initialType?: ExpenseType;
  onSuccess: () => void;
}

export default function AddEditExpenseModal({
  isOpen,
  onClose,
  transaction,
  initialType = 'expense',
  onSuccess,
}: AddEditExpenseModalProps) {
  const isEditing = Boolean(transaction);

  const getTodayISO = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState<string>(getTodayISO());
  const [type, setType] = useState<ExpenseType>(initialType);
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

   
  useEffect(() => {
    if (transaction) {
      setDate(transaction.transaction_date);
      setType(transaction.type);
      setDescription(transaction.description);
      setAmount(String(transaction.amount));
      setNote(transaction.note || '');
    } else {
      setDate(getTodayISO());
      setType(initialType);
      setDescription('');
      setAmount('');
      setNote('');
    }
    setError(null);
  }, [transaction, isOpen, initialType]);
   

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than ₹0');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a category or description');
      return;
    }

    setSubmitting(true);

    if (isEditing && transaction) {
      const res = await updateExpenseTransaction(transaction.id, {
        transaction_date: date,
        type,
        description: description.trim(),
        amount: numericAmount,
        note: note.trim() || null,
      });

      setSubmitting(false);

      if (!res.success) {
        setError(res.error || 'Failed to update entry');
      } else {
        showToast('Transaction updated');
        onSuccess();
        onClose();
      }
    } else {
      const res = await addExpenseTransaction({
        transaction_date: date,
        type,
        description: description.trim(),
        amount: numericAmount,
        note: note.trim() || null,
      });

      setSubmitting(false);

      if (!res.success) {
        setError(res.error || 'Failed to add entry');
      } else {
        showToast(type === 'income' ? 'Money added successfully' : 'Expense added successfully');
        onSuccess();
        onClose();
      }
    }
  }

  const getModalTitle = () => {
    if (isEditing) return 'Edit Entry';
    return type === 'income' ? 'Add Money' : 'Add Expense';
  };

  const getSubmitLabel = () => {
    if (submitting) return 'Saving...';
    if (isEditing) return 'Update Entry';
    return type === 'income' ? 'Add Money' : 'Add Expense';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-zborder bg-zcard p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zborder pb-3">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <Pencil size={20} className="text-zred" />
            ) : type === 'income' ? (
              <ArrowDownLeft size={20} className="text-emerald-500" />
            ) : (
              <ArrowUpRight size={20} className="text-zred" />
            )}
            <h2 className="text-lg font-bold text-ztext">
              {getModalTitle()}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-ztext-muted hover:bg-zgray transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* Amount & Date row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ztext-light mb-1">
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-ztext-muted">
                  <IndianRupee size={15} />
                </span>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="150"
                  className="input-z pl-9 w-full text-sm font-semibold"
                  disabled={submitting}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ztext-light mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-z w-full text-sm font-medium"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Free-Text Category / Description Input */}
          <div>
            <label className="block text-xs font-semibold text-ztext-light mb-1">
              {type === 'income' ? 'Source / Income Description *' : 'Category / Expense Description *'}
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'income'
                  ? 'e.g. Sales Revenue, Freelance Payment, Capital Add'
                  : 'e.g. Food, Supplies, Utility, Rent'
              }
              className="input-z w-full text-sm"
              disabled={submitting}
            />
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-semibold text-ztext-light mb-1">
              Optional Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Additional details, reference, etc."
              rows={2}
              className="input-z w-full text-sm resize-none"
              disabled={submitting}
            />
          </div>

          {/* Form buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zborder">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="button-z button-z-ghost text-sm px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`button-z text-sm px-5 inline-flex items-center justify-center gap-1.5 text-white font-bold ${
                type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'button-z-primary'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving...
                </>
              ) : (
                getSubmitLabel()
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
