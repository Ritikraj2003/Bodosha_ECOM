export interface CreditAccount {
  id: string;
  user_id: string;
  credit_limit: number;
  available_credit: number;
  outstanding: number;
  status: 'active' | 'suspended' | 'closed';
  verification_status: 'pending' | 'verified' | 'rejected';
  credit_score: number | null;
  interest_rate: number;
  late_fee_rate: number;
  due_days: number;
  last_repayment_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreditTransaction {
  id: string;
  credit_account_id: string;
  order_id: string | null;
  type: 'purchase' | 'repayment' | 'fee' | 'adjustment' | 'restoration';
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export interface CreditRepayment {
  id: string;
  credit_account_id: string;
  transaction_id: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  late_fee_applied: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  payment_method: 'razorpay' | 'wallet' | null;
  gateway_payment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditAuditLog {
  id: string;
  user_id: string;
  action: CreditAuditAction;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type CreditAuditAction =
  | 'credit_approved'
  | 'credit_rejected'
  | 'credit_limit_set'
  | 'credit_limit_changed'
  | 'bnpl_purchase'
  | 'repayment'
  | 'late_fee_applied'
  | 'manual_adjustment'
  | 'repayment_failed'
  | 'credit_restored'
  | 'account_suspended'
  | 'account_activated';

export interface LateFeeConfig {
  dailyRate?: number;
  weeklyRate?: number;
  percentageRate?: number;
  fixedAmount?: number;
  gracePeriodDays: number;
  maxFeeAmount?: number;
}

export interface RepaymentSchedule {
  dueDate: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
}

export interface CreditDashboardData {
  account: CreditAccount | null;
  recentTransactions: CreditTransaction[];
  upcomingRepayments: CreditRepayment[];
  overdueAmount: number;
  utilizationPercentage: number;
}

export interface BNPLCheckoutResult {
  success: boolean;
  orderId?: string;
  transactionId?: string;
  error?: string;
}

export interface RepaymentResult {
  success: boolean;
  transactionId?: string;
  remainingBalance?: number;
  error?: string;
}
