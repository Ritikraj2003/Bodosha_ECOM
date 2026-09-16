'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../store';
import { authService } from '../services/auth-service';
import ForgotPasswordForm from './ForgotPasswordForm';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.toLowerCase().trim();
    setLoading(true);

    const { user, error: err } = await authService.signIn(normalizedEmail, password);
    setLoading(false);
    if (err) {
      if (err.toLowerCase().includes('email not confirmed')) {
        setError('Please verify your email. Check your inbox or sign up again to receive a new verification email.');
      } else {
        setError(err);
      }
      return;
    }
    if (!user) {
      setError('Sign-in failed. Please try again.');
      return;
    }

    let role = user.role;
    if (!role) {
      const { profile } = await authService.fetchProfile(user.id);
      role = profile?.role ?? null;
    }

    useAuthStore.getState().setUser({ ...user, role });

    const roleTarget: Record<string, string> = {
      admin: '/dashboard/admin',
      super_admin: '/dashboard/admin',
      owner: '/dashboard/owner',
      delivery: '/dashboard/delivery',
    };

    if (role) {
      const target = (next && next.startsWith('/') && !roleTarget[role])
        ? next
        : (roleTarget[role] ?? '/');
      window.location.href = target;
    } else {
      window.location.href = '/auth/onboarding';
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zcard rounded-xl shadow-z p-8">
        {showForgotPassword ? (
          <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-ztext mb-1">Welcome back</h1>
            <p className="text-ztext-light text-sm mb-6">Sign in to your Dilip Da account</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ztext mb-1.5">Email</label>
                <input id="email" type="email" className="input-z" placeholder="youremail@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ztext mb-1.5">Password</label>
                <input id="password" type="password" className="input-z" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="flex justify-end -mt-2">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-zred hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
              {error && <p className="text-sm text-zred">{error}</p>}
              <button type="submit" className="button-z button-z-primary w-full h-12 text-sm" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="text-center text-sm text-ztext-light mt-6">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="font-semibold text-zred">Sign up</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
