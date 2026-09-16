'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/infrastructure/supabase/client';
import { Loader2, Check } from 'lucide-react';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: codeErr }) => {
        if (!codeErr) {
          setReady(true);
        } else {
          setError('Invalid or expired reset link. Please request a new one.');
        }
      });
      return () => { subscription.unsubscribe(); };
    }

    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error: otpErr }) => {
        if (!otpErr) {
          setReady(true);
        } else {
          setError('Invalid or expired reset link. Please request a new one.');
        }
      });
      return () => { subscription.unsubscribe(); };
    }

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && type === 'recovery') {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
        if (!sessionError) setReady(true);
        else setError('Invalid or expired reset link. Please request a new one.');
      });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else setError('Invalid or expired reset link. Please request a new one.');
      });
    }

    return () => { subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (err) { setError(err.message); return; }

    setDone(true);
    setTimeout(() => router.push('/auth/login'), 3000);
  }

  if (done) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-zcard rounded-xl shadow-z p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-zgreen/10 flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-zgreen" />
          </div>
          <h1 className="text-xl font-bold text-ztext mb-1">Password reset!</h1>
          <p className="text-sm text-ztext-light mb-4">Your password has been updated. Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zcard rounded-xl shadow-z p-8">
        <h1 className="text-xl font-bold text-ztext mb-1">Set new password</h1>
        <p className="text-ztext-light text-sm mb-6">Enter your new password below.</p>

        {!ready && !error && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={18} className="animate-spin text-ztext-lighter" />
            <span className="text-sm text-ztext-light">Verifying reset link...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <p className="text-sm text-zred mb-4">{error}</p>
            <button onClick={() => router.push('/auth/login')} className="text-sm text-zred hover:underline font-semibold">
              Back to sign in
            </button>
          </div>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-ztext mb-1.5">New password</label>
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
            {error && <p className="text-sm text-zred">{error}</p>}
            <button type="submit" className="button-z button-z-primary w-full h-12 text-sm flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
