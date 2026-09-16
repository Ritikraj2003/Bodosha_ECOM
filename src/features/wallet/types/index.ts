export interface Wallet {
  id: string;
  restaurant_id?: string | null;
  user_id: string;
  balance: number;
  total_credit: number;
  total_debit: number;
  credit_limit: number;
  credit_used?: number;
  credit_used_at?: string | null;
  late_fee_rate?: number;
  total_penalties?: number;
  status: 'unverified' | 'pending' | 'active' | 'frozen' | 'suspended' | 'rejected';
  kyc_name?: string | null;
  kyc_email?: string | null;
  document_type?: string | null;
  kyc_photo_url?: string | null;
  pan_card_url?: string | null;
  kyc_submitted_at?: string | null;
  kyc_approved_at?: string | null;
  kyc_rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  restaurant_id?: string | null;
  wallet_id?: string | null;
  user_id: string;
  type: 'credit' | 'debit' | 'topup' | 'payment';
  amount: number;
  balance_before: number;
  balance_after: number;
  order_id?: string | null;
  payment_reference?: string | null;
  description?: string | null;
  reference?: string | null;
  reference_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface WalletSummary {
  wallet: Wallet | null;
  balance: number;
  totalCredit: number;
  totalDebit: number;
  creditLimit: number;
  transactions: WalletTransaction[];
}
