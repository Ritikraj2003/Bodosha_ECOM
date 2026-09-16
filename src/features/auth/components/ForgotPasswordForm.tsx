'use client';

import { useState } from 'react';
import { ArrowLeft, Mail, Check } from 'lucide-react';
import { sendPasswordResetEmail } from '../actions';

interface Props {
  onBack: () => void;
}

export default function ForgotPasswordForm({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await sendPasswordResetEmail(email);
      if (res?.error) {
        setError(res.error);
      } else {
        setSent(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full bg-zgreen/10 flex items-center justify-center mx-auto mb-3">
          <Check size={24} className="text-zgreen" />
        </div>
        <p className="text-sm text-ztext font-medium mb-1">Check your email</p>
        <p className="text-xs text-ztext-light">
          We sent a password reset link to <span className="font-medium text-ztext">{email}</span>
        </p>
        <button onClick={onBack} className="text-xs text-zred hover:underline mt-4">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-zgray text-ztext-light transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-bold text-ztext">Reset password</h2>
      </div>
      <p className="text-ztext-light text-sm mb-6">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-ztext mb-1.5">Email</label>
          <input
            id="reset-email"
            type="email"
            className="input-z w-full"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-zred">{error}</p>}
        <button type="submit" className="button-z button-z-primary w-full h-11 text-sm flex items-center justify-center gap-2" disabled={loading || !email.trim()}>
          <Mail size={16} />
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
    </div>
  );
}
