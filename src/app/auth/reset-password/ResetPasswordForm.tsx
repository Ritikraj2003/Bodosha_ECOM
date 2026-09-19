'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';
import { verifyResetTokenAction, resetPasswordWithToken } from '@/features/auth/actions';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tokenParam = searchParams.get('token') || searchParams.get('token_hash') || searchParams.get('code');

    if (!tokenParam) {
      setError('Invalid or missing password reset link. Please request a new one.');
      return;
    }

    setToken(tokenParam);
    verifyResetTokenAction(tokenParam)
      .then((res) => {
        if (res.valid) {
          setReady(true);
          if (res.email) setEmail(res.email);
        } else {
          setError(res.error || 'Invalid or expired reset link. Please request a new one.');
        }
      })
      .catch(() => {
        setError('Failed to verify reset link. Please try again.');
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Missing reset token. Please request a new reset link.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await resetPasswordWithToken(token, password);
      setLoading(false);

      if (!res.success) {
        setError(res.error || 'Failed to reset password');
        return;
      }

      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'An error occurred while resetting your password');
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-zcard rounded-xl shadow-z p-8 text-center border border-zborder">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-ztext mb-1">Password reset successful!</h1>
          <p className="text-sm text-ztext-light mb-4">Your password has been updated. Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zcard rounded-xl shadow-z p-8 border border-zborder">
        <h1 className="text-xl font-bold text-ztext mb-1">Set new password</h1>
        <p className="text-ztext-light text-sm mb-6">
          {email ? `Enter a new password for ${email}.` : 'Enter your new password below.'}
        </p>

        {!ready && !error && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={18} className="animate-spin text-ztext-lighter" />
            <span className="text-sm text-ztext-light">Verifying reset link...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <p className="text-sm text-zred mb-4">{error}</p>
            <button
              type="button"
              onClick={() => router.push('/auth/login')}
              className="text-sm text-zred hover:underline font-semibold"
            >
              Back to sign in
            </button>
          </div>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-ztext mb-1.5">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                className="input-z w-full"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-ztext mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                className="input-z w-full"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-sm text-zred">{error}</p>}
            <button
              type="submit"
              className="button-z button-z-primary w-full h-12 text-sm flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
