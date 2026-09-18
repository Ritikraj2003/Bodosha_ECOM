'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../store';
import { loginWithCredentials } from '../actions/credentials';
import ForgotPasswordForm from './ForgotPasswordForm';
import type { Role } from '../types';

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

      const roleTarget: Record<string, string> = {
        admin: '/dashboard/admin',
        super_admin: '/dashboard/admin',
        owner: '/dashboard/admin',
        delivery: '/dashboard/delivery',
        merchant: '/dashboard/merchant',
        staff: '/dashboard/admin',
        manager: '/dashboard/admin',
      };

      if (role) {
        // If it's not student/delivery/merchant, default to /dashboard/admin
        const isEmployeeOrAdmin = role !== 'student' && role !== 'delivery' && role !== 'merchant';
        const defaultTarget = roleTarget[role] || (isEmployeeOrAdmin ? '/dashboard/admin' : '/');
        const target = (next && next.startsWith('/') && !roleTarget[role])
          ? next
          : defaultTarget;
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
            <h1 className="text-2xl font-bold text-ztext mb-1">Welcome back</h1>
            <p className="text-ztext-light text-sm mb-6">Sign in to your Bodosa account</p>

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
