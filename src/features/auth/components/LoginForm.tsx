'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../store';
import { loginWithCredentials } from '../actions/credentials';
import ForgotPasswordForm from './ForgotPasswordForm';
import type { Role } from '../types';
import { getFirstAllowedAdminPage, canAccessAdminPage } from '@/lib/permissions';

export default function LoginForm() {
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('email') || '';
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [registeredNotice, setRegisteredNotice] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('registered') === 'true'
        ? 'Account created successfully! Please sign in.'
        : '';
    }
    return '';
  });
  const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.toLowerCase().trim();
    setLoading(true);

    try {
      const res = await loginWithCredentials(normalizedEmail, password);
      setLoading(false);

      if (!res.success || !res.user) {
        setError(res.error || 'Sign-in failed. Please check your email and password.');
        return;
      }

      const user = res.user;
      const role = (user.role as Role) || null;

      useAuthStore.getState().setUser({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role,
        avatarUrl: user.avatarUrl ?? null,
        phone: user.phone ?? null,
        permissions: user.permissions ?? [],
      });

      const isEmployeeOrAdmin = role && role !== 'student' && role !== 'delivery' && role !== 'merchant';
      let defaultTarget = '/';

      if (isEmployeeOrAdmin) {
        defaultTarget = getFirstAllowedAdminPage(user.permissions, role);
      } else if (role === 'delivery') {
        defaultTarget = '/dashboard/delivery';
      } else if (role === 'merchant') {
        defaultTarget = '/dashboard/merchant';
      } else if (role === 'student') {
        defaultTarget = '/home/student';
      }

      if (role) {
        let target = defaultTarget;
        if (next && next.startsWith('/')) {
          if (isEmployeeOrAdmin) {
            if (canAccessAdminPage(user.permissions, next, role)) {
              target = next;
            }
          } else {
            target = next;
          }
        }
        window.location.href = target;
      } else {
        window.location.href = '/';
      }
    } catch (err: unknown) {
      setLoading(false);
      console.error('Login error:', err);
      setError('An unexpected error occurred while signing in. Please try again.');
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zcard rounded-xl shadow-z p-8">
        {showForgotPassword ? (
          <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-20 h-20 rounded-full overflow-hidden mb-3 border-2 border-white/20 shadow-xl bg-black p-1 flex items-center justify-center">
                <img src="/Logo/badmaas-logo.png" alt={`${process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'} Logo`} className="w-full h-full object-contain" />
              </div>
              <h1 className="text-2xl font-bold text-ztext">Welcome back</h1>
              <p className="text-ztext-light text-xs sm:text-sm mt-1">Sign in to {process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe'}</p>
            </div>

            {registeredNotice && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium mb-4 flex items-center gap-2">
                <span className="font-bold">✓</span>
                <span>{registeredNotice}</span>
              </div>
            )}

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
