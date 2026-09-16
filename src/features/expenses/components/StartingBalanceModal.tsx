'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, IndianRupee } from 'lucide-react';
import { updateStartingBalance } from '../actions';
import { showToast } from '@/components/shared/Toast';

interface StartingBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onSuccess: () => void;
}

export default function StartingBalanceModal({
  isOpen,
  onClose,
  currentBalance,
  onSuccess,
}: StartingBalanceModalProps) {
  const [amount, setAmount] = useState<string>(String(currentBalance));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

   
  useEffect(() => {
    setAmount(String(currentBalance));
    setError(null);
  }, [currentBalance, isOpen]);
   

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      setError('Please enter a valid non-negative starting balance');
      return;
    }

    setSubmitting(true);
    const res = await updateStartingBalance(numericAmount);
    setSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Failed to update starting balance');
    } else {
      showToast('Starting balance updated');
      onSuccess();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-zborder bg-zcard p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-zborder pb-3">
          <h2 className="text-lg font-bold text-ztext">Edit Starting Balance</h2>
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

          <div>
            <label className="block text-xs font-semibold text-ztext-light mb-1">
              Starting Balance Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-ztext-muted">
                <IndianRupee size={16} />
              </span>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                className="input-z pl-9 w-full text-sm font-semibold"
                disabled={submitting}
                autoFocus
              />
            </div>
            <p className="text-[11px] text-ztext-muted mt-1">
              Set your initial available capital before recording transactions.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
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
              className="button-z button-z-primary text-sm px-5 inline-flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving...
                </>
              ) : (
                'Save Balance'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
