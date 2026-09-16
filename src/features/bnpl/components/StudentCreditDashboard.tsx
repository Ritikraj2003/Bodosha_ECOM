'use client';

import { useState } from 'react';
import {
 Wallet,
 CreditCard,
 TrendingUp,
 CalendarClock,
 AlertTriangle,
 ArrowRight,
 Loader2,
 IndianRupee,
 Clock,
 CheckCircle2,
 XCircle,
 Eye,
 EyeOff,
} from 'lucide-react';
import { getCreditDashboard, getAuditLogs } from '../actions';
import { formatCurrency } from '@/lib/utils';
import { useServerAction } from '@/lib/useServerAction';

function statusBadge(status: string) {
 const styles: Record<string, string> = {
 active: 'bg-green-500/20 text-green-400 ',
 suspended: 'bg-red-500/20 text-red-400 ',
 closed: 'bg-zgray text-ztext-light ',
 verified: 'bg-blue-100 text-blue-400 ',
 pending: 'bg-yellow-100 text-yellow-400 ',
 rejected: 'bg-red-500/20 text-red-400 ',
 paid: 'bg-green-500/20 text-green-400 ',
 overdue: 'bg-red-500/20 text-red-400 ',
 partial: 'bg-yellow-100 text-yellow-400 ',
 };
 return styles[status] || 'bg-zgray text-ztext-light ';
}

export default function StudentCreditDashboard() {
 const [showTransactions, setShowTransactions] = useState<boolean>(false);
 const { data: dashboard, isLoading, error } = useServerAction(getCreditDashboard);
 const { data: auditData } = useServerAction(getAuditLogs);

 if (isLoading) {
 return (
 <div className="flex items-center justify-center py-16">
 <Loader2 className="w-8 h-8 animate-spin text-zred" />
 </div>
 );
 }

 if (error) {
 return (
 <div className="text-center py-16">
 <XCircle className="w-12 h-12 text-zred mx-auto mb-4" />
 <p className="text-ztext-light">{error || 'Failed to load dashboard'}</p>
 </div>
 );
 }

 if (!dashboard || !dashboard.account) {
 return (
 <div className="text-center py-16">
 <Wallet className="w-12 h-12 text-ztext-lighter mx-auto mb-4" />
 <h2 className="text-xl font-bold text-ztext mb-2">No Credit Account Yet</h2>
 <p className="text-ztext-light mb-6">You haven&apos;t set up an Ethics Pay account.</p>
 <p className="text-sm text-ztext-lighter">Complete your profile and place an order to get started.</p>
 </div>
 );
 }

 const { account, recentTransactions, upcomingRepayments, overdueAmount, utilizationPercentage } = dashboard;

 return (
 <div className="space-y-6">
 {/* Summary Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 <div className="bg-zcard rounded-xl shadow-z p-5">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm text-ztext-light font-medium">Available Credit</span>
 <Wallet className="w-5 h-5 text-zgreen" />
 </div>
 <p className="text-2xl font-bold text-ztext">{formatCurrency(account.available_credit)}</p>
 </div>

 <div className="bg-zcard rounded-xl shadow-z p-5">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm text-ztext-light font-medium">Used Credit</span>
 <CreditCard className="w-5 h-5 text-zred" />
 </div>
 <p className="text-2xl font-bold text-ztext">{formatCurrency(account.outstanding)}</p>
 </div>

 <div className="bg-zcard rounded-xl shadow-z p-5">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm text-ztext-light font-medium">Total Limit</span>
 <TrendingUp className="w-5 h-5 text-blue-500" />
 </div>
 <p className="text-2xl font-bold text-ztext">{formatCurrency(account.credit_limit)}</p>
 </div>

 <div className="bg-zcard rounded-xl shadow-z p-5">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm text-ztext-light font-medium">Utilization</span>
 <div className={`w-5 h-5 ${utilizationPercentage > 80 ? 'text-zred' : 'text-zgreen'}`}>
 <div className="w-full h-full rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">
 {utilizationPercentage}%
 </div>
 </div>
 </div>
 <div className="w-full bg-zgray rounded-full h-2 mt-2">
 <div
 className={`h-2 rounded-full transition-all ${
 utilizationPercentage > 80 ? 'bg-zred' : utilizationPercentage > 50 ? 'bg-yellow-500' : 'bg-zgreen'
 }`}
 style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
 />
 </div>
 </div>
 </div>

 {/* Status & Details */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Account Details */}
 <div className="bg-zcard rounded-xl shadow-z p-6">
 <h2 className="font-bold text-ztext mb-4">Account Details</h2>
 <div className="space-y-3 text-sm">
 <div className="flex justify-between">
 <span className="text-ztext-light">Status</span>
 <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(account.status)}`}>
 {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-ztext-light">Verification</span>
 <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(account.verification_status)}`}>
 {account.verification_status.charAt(0).toUpperCase() + account.verification_status.slice(1)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-ztext-light">Due Days</span>
 <span className="font-medium text-ztext">{account.due_days} days</span>
 </div>
 <div className="flex justify-between">
 <span className="text-ztext-light">Late Fee Rate</span>
 <span className="font-medium text-ztext">{account.late_fee_rate}%</span>
 </div>
 {account.activated_at && (
 <div className="flex justify-between">
 <span className="text-ztext-light">Activated</span>
 <span className="font-medium text-ztext">
 {new Date(account.activated_at).toLocaleDateString()}
 </span>
 </div>
 )}
 </div>
 </div>

 {/* Upcoming Repayments */}
 <div className="bg-zcard rounded-xl shadow-z p-6">
 <h2 className="font-bold text-ztext mb-4 flex items-center gap-2">
 <CalendarClock className="w-4 h-4 text-zred" />
 Upcoming Payments
 </h2>
 {upcomingRepayments.length === 0 ? (
 <div className="text-center py-8">
 <CheckCircle2 className="w-8 h-8 text-zgreen mx-auto mb-2" />
 <p className="text-sm text-ztext-light">No pending payments</p>
 </div>
 ) : (
 <div className="space-y-3">
 {upcomingRepayments.map((repayment) => {
 const isOverdue = new Date(repayment.due_date) < new Date() && repayment.status !== 'paid';
 return (
 <div
 key={repayment.id}
 className={`p-3 rounded-xl border ${
 isOverdue
 ? 'border-red-500/20 bg-red-500/10 '
 : 'border-zborder '
 }`}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="font-semibold text-ztext text-sm">{formatCurrency(repayment.amount)}</p>
 <p className="text-xs text-ztext-light mt-0.5">
 Due: {new Date(repayment.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
 </p>
 </div>
 <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(repayment.status)}`}>
 {repayment.status.charAt(0).toUpperCase() + repayment.status.slice(1)}
 </span>
 </div>
 {isOverdue && (
 <div className="flex items-center gap-1 mt-2 text-xs text-zred">
 <AlertTriangle className="w-3 h-3" />
 Overdue
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 {overdueAmount > 0 && (
 <div className="mt-4 p-3 bg-red-500/10 rounded-xl border border-red-500/20 ">
 <div className="flex items-center gap-2">
 <AlertTriangle className="w-4 h-4 text-zred shrink-0" />
 <div>
 <p className="text-sm font-semibold text-red-400 ">Overdue Amount</p>
 <p className="text-sm font-bold text-zred">{formatCurrency(overdueAmount)}</p>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Recent Transactions */}
  <div className="bg-zcard rounded-xl shadow-z p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-bold text-ztext">Recent Transactions</h2>
      <button
        onClick={() => setShowTransactions((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zgray hover:bg-zborder text-xs font-bold text-ztext transition-colors"
      >
        {showTransactions ? (
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

    {showTransactions && (
      <>
        {recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-ztext-light">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-zborder last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.type === 'purchase' ? 'bg-red-500/20 ' :
                    tx.type === 'repayment' ? 'bg-green-500/20 ' :
                    tx.type === 'fee' ? 'bg-yellow-100 ' :
                    'bg-blue-100 '
                  }`}>
                    {tx.type === 'purchase' ? <ArrowRight className="w-4 h-4 text-zred" /> :
                    tx.type === 'repayment' ? <CheckCircle2 className="w-4 h-4 text-zgreen" /> :
                    tx.type === 'fee' ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> :
                    <IndianRupee className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ztext capitalize">{tx.type}</p>
                    <p className="text-xs text-ztext-light">{new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    tx.type === 'purchase' || tx.type === 'fee' ? 'text-zred' : 'text-zgreen'
                  }`}>
                    {tx.type === 'purchase' || tx.type === 'fee' ? '-' : '+'}{formatCurrency(tx.amount)}
                  </p>
                  {tx.description && (
                    <p className="text-xs text-ztext-lighter">{tx.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    )}
  </div>

 {/* Audit Trail */}
 {auditData && auditData.length > 0 && (
 <div className="bg-zcard rounded-xl shadow-z p-6">
 <h2 className="font-bold text-ztext mb-4">Activity Log</h2>
 <div className="space-y-2">
 {auditData.slice(0, 10).map((log) => (
 <div key={log.id} className="flex items-start gap-3 py-2 border-b border-zborder last:border-0">
 <Clock className="w-4 h-4 text-ztext-lighter mt-0.5 shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-ztext capitalize">
 {log.action.replace(/_/g, ' ')}
 </p>
 {log.reason && (
 <p className="text-xs text-ztext-light truncate">{log.reason}</p>
 )}
 </div>
 <span className="text-xs text-ztext-lighter shrink-0">
 {new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}
