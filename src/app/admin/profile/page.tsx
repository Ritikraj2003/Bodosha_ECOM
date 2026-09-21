'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User, ShieldCheck, Mail, Phone, KeyRound, LogOut,
  LayoutDashboard, ArrowRight, CheckCircle2, Lock, ArrowLeft
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { getFirstAllowedAdminPage } from '@/lib/permissions';

export default function AdminProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const permissions = (user as any)?.permissions || [];

  const adminRole = user?.role || 'staff';
  const dashboardHref = getFirstAllowedAdminPage(permissions, adminRole);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen bg-zbg text-ztext py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation bar / Back */}
        <div className="flex items-center justify-between">
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-2 text-sm text-ztext-light hover:text-ztext font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="button-z button-z-ghost text-xs text-ztext-light hover:text-zred flex items-center gap-1.5 px-3 py-1.5"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Profile Card Header */}
        <div className="bg-zcard border border-zborder rounded-2xl p-6 sm:p-8 shadow-z">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zred to-red-400 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-zred/20 shrink-0">
              {user?.fullName?.charAt(0).toUpperCase() || 'A'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h1 className="text-2xl font-black text-ztext tracking-tight truncate">
                  {user?.fullName || 'Administrator'}
                </h1>
                <span className="inline-flex items-center self-center sm:self-auto gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-zred/10 text-zred border border-zred/20">
                  <ShieldCheck size={13} />
                  <span>{adminRole.replace(/_/g, ' ')}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-ztext-light">
                <span className="flex items-center gap-1.5">
                  <Mail size={15} className="text-ztext-lighter" />
                  <span className="truncate">{user?.email}</span>
                </span>
                {user?.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={15} className="text-ztext-lighter" />
                    <span>{user.phone}</span>
                  </span>
                )}
              </div>
            </div>

            <Link
              href={dashboardHref}
              className="button-z button-z-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shrink-0 shadow-md"
            >
              <LayoutDashboard size={16} />
              <span>Admin Console</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Permissions & Security Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Permissions Overview */}
          <div className="bg-zcard border border-zborder rounded-2xl p-6 shadow-z space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-zborder">
              <div className="p-2 rounded-xl bg-zred/10 text-zred">
                <KeyRound size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-ztext">Assigned Privileges</h3>
                <p className="text-xs text-ztext-light">Roles and granted system capabilities</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-ztext-lighter">
                <span>Active Permissions</span>
                <span className="font-semibold text-ztext">{permissions.length === 0 ? 'Full Bypass / Role Based' : `${permissions.length} granted`}</span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {permissions.includes('*') ? (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>SUPER ADMIN (FULL ACCESS)</span>
                  </span>
                ) : permissions.length > 0 ? (
                  permissions.map((perm: string) => (
                    <span
                      key={perm}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-zsurface text-ztext-light border border-zborder"
                    >
                      {perm}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ztext-lighter italic">
                    Inherited from assigned role ({adminRole})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Account Security */}
          <div className="bg-zcard border border-zborder rounded-2xl p-6 shadow-z space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-zborder">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Lock size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-ztext">Account Security</h3>
                <p className="text-xs text-ztext-light">Credentials and session security</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3 bg-zsurface rounded-xl border border-zborder flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ztext">Password</p>
                  <p className="text-[11px] text-ztext-lighter">Protected with bcrypt authentication</p>
                </div>
                <Link
                  href="/auth/reset-password"
                  className="button-z button-z-ghost text-xs px-3 py-1.5 text-zred hover:bg-zred/10"
                >
                  Change
                </Link>
              </div>

              <div className="p-3 bg-zsurface rounded-xl border border-zborder flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ztext">Session State</p>
                  <p className="text-[11px] text-ztext-lighter">Stored in secure session storage</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
