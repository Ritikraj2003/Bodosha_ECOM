'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
import { getServerSession } from '@/features/auth/actions';
import { getAdminEmails } from '@/lib/settings';
import { isAdminEmail } from '@/config/auth-access';
import type { Wallet, WalletTransaction, WalletSummary } from '../types';
import { notifyBnplFinePush } from '@/lib/push';

async function checkAdminAuth() {
  const supabase = createServiceClient();
  if (!supabase) return { authorized: false, error: 'Database service unavailable', admin: null, supabase: null };

  const { user: admin } = await getServerSession();
  if (!admin) return { authorized: false, error: 'Not authenticated', admin: null, supabase: null };

  const adminEmails = await getAdminEmails();
  const isAdminByEmail = isAdminEmail(admin.email, adminEmails);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', admin.id).maybeSingle();
  const isAuthorized = ['admin', 'super_admin'].includes(profile?.role || admin.role || '') || isAdminByEmail;

  if (!isAuthorized) {
    return { authorized: false, error: 'Forbidden. Admin access required.', admin: null, supabase: null };
  }

  return { authorized: true, admin, profile, supabase };
}

/* 
// Legacy Global Limit Logic - Kept for reference
const DEFAULT_CREDIT_LIMIT = 500;
async function getCreditLimit(): Promise<number> {
  return getNumericSetting('wallet_credit_limit', DEFAULT_CREDIT_LIMIT);
}
*/



/**
 * Fetch full wallet details for current authenticated user
 */
export async function getWalletDetails(): Promise<{
  success: boolean;
  error?: string;
  data?: WalletSummary;
}> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Database service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    // 1. Fetch user's profile wallet balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', user.id)
      .maybeSingle();

    const profileBalance = Number(profile?.wallet_balance) || 0;

    // 2. Fetch record in `wallets` table
    let walletRecord: Wallet | null = null;
    try {
      const { data: walletData, error: walletErr } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletErr) {
        console.error('getWalletDetails error fetching wallets:', walletErr);
      } else if (walletData) {
        walletRecord = walletData as Wallet;
      }
    } catch (wErr) {
      console.error('getWalletDetails wallets table error:', wErr);
    }

    // 3. Fetch transaction history
    type RawTransaction = Omit<WalletTransaction, 'amount'> & { amount?: number | string | null; reference_id?: string | null };
    let rawTransactions: RawTransaction[] = [];
    try {
      const { data: txData } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletRecord?.id || '00000000-0000-0000-0000-000000000000')
        .order('created_at', { ascending: false });

      if (txData) rawTransactions = txData;
    } catch {
      // Table wallet_transactions issue
    }

    // Normalize transaction list
    const transactions: WalletTransaction[] = rawTransactions.map((tx) => {
      const isCreditType = tx.type === 'debit' ? false : (['credit', 'topup'].includes(tx.type) || Number(tx.amount) > 0);
      return {
        id: tx.id,
        restaurant_id: tx.restaurant_id ?? null,
        wallet_id: tx.wallet_id ?? walletRecord?.id ?? null,
        user_id: user.id, // User id is derived
        type: isCreditType ? 'credit' : 'debit',
        amount: Math.abs(Number(tx.amount) || 0),
        balance_before: 0, // No longer stored
        balance_after: Number(tx.balance_after) || 0,
        order_id: tx.reference_id?.startsWith('ORD') ? tx.reference_id : null,
        payment_reference: tx.reference_id ?? null,
        description: tx.description ?? (isCreditType ? 'Wallet Top Up' : 'Order Payment'),
        reference: tx.reference_id ?? null,
        note: null,
        created_at: tx.created_at,
      };
    });

    // Calculate sum of total credits and debits from transactions
    const creditSum = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const debitSum = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    const currentBalance = walletRecord ? Number(walletRecord.balance) : (profileBalance || 0);
    const totalCredit = Math.max(creditSum, currentBalance, Number(walletRecord?.total_credit) || 0);
    const totalDebit = Math.max(debitSum, Number(walletRecord?.total_debit) || 0);

    return {
      success: true,
      data: {
        wallet: walletRecord,
        balance: currentBalance,
        totalCredit,
        totalDebit,
        creditLimit: walletRecord ? Number(walletRecord.credit_limit) : 0,
        transactions,
      },
    };
  } catch (err: unknown) {
    console.error('getWalletDetails error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch wallet details' };
  }
}

/**
 * Top Up Wallet with a specific amount
 */
export async function topupWallet(
  amount: number,
  paymentReference = 'Instant UPI / GPay'
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!amount || amount <= 0) {
    return { success: false, error: 'Please enter a valid top-up amount' };
  }

  try {
    // 1. Fetch record in `wallets` table as Single Source of Truth
    const { data: existingWallet, error: walletFetchErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (walletFetchErr || !existingWallet) {
      return { success: false, error: 'Your wallet is not active. Please complete KYC.' };
    }

    if (existingWallet.status !== 'active') {
      return { success: false, error: 'Your wallet is not active. Please complete KYC.' };
    }

    // If user has an unpaid late fine, they must top up at least the outstanding debt amount
    if (Number(existingWallet.balance) < 0 && Number(existingWallet.total_penalties) > 0) {
      const minRequired = Math.ceil(Math.abs(Number(existingWallet.balance)));
      if (amount < minRequired) {
        return {
          success: false,
          error: `Minimum top-up of ₹${minRequired} is required to clear your outstanding debt and fine.`,
        };
      }
    }

    const walletId = existingWallet.id;
    const balanceBefore = Number(existingWallet.balance) || 0;
    const balanceAfter = balanceBefore + amount;
    const updatedTotalCredit = (Number(existingWallet.total_credit) || 0) + amount;

    // Retain credit timer if still in overdraft debt, only clear once balance >= 0
    let creditUsedAt = existingWallet.credit_used_at;
    let totalPenalties = Number(existingWallet.total_penalties) || 0;
    if (balanceAfter >= 0) {
      creditUsedAt = null;
      totalPenalties = 0; // Clear fine because the student has fully repaid debt & penalty
    }

    // 2. Update `wallets` table
    const { error: walletUpdateErr } = await supabase
      .from('wallets')
      .update({
        balance: balanceAfter,
        total_credit: updatedTotalCredit,
        credit_used_at: creditUsedAt,
        total_penalties: totalPenalties,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingWallet.id);

    if (walletUpdateErr) {
      console.error('Failed updating wallets table:', walletUpdateErr);
      return { success: false, error: 'Failed to update wallet balance' };
    }

    // 3. Keep `profiles` table in sync
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ wallet_balance: balanceAfter })
      .eq('id', user.id);

    if (profileErr) {
      console.error('Failed updating profile wallet balance:', profileErr);
    }

    // 3. Insert transaction record into `wallet_transactions`
    const txnRef = `TOPUP-${Date.now()}`;
    const descText = `Wallet Top Up (${paymentReference})`;

    if (walletId) {
      const { error: insertErr } = await supabase.from('wallet_transactions').insert({
        wallet_id: walletId,
        type: 'credit',
        amount: amount,
        balance_after: balanceAfter,
        description: descText,
        reference_id: txnRef,
      });

      if (insertErr) {
        console.error('Wallet transaction insert failed:', insertErr);
      }
    }

    return { success: true, newBalance: balanceAfter };
  } catch (err: unknown) {
    console.error('topupWallet error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to top up wallet' };
  }
}

/**
 * Top up wallet after verifying Razorpay payment signature & payment ID
 */
export async function verifyAndTopupWalletWithRazorpay({
  amount,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
}: {
  amount: number;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
}): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  if (!razorpayPaymentId) {
    return { success: false, error: 'Missing Razorpay Payment ID' };
  }

  const { verifyRazorpayPayment } = await import('@/features/payments/actions');

  // Verify Razorpay payment signature server-side
  const verification = await verifyRazorpayPayment(
    razorpayOrderId || '',
    razorpayPaymentId,
    razorpaySignature || ''
  );

  if (!verification.success) {
    return { success: false, error: verification.error || 'Payment verification failed' };
  }

  // Once verified, update wallet balance & insert into tables
  const paymentRef = `Razorpay ID: ${razorpayPaymentId}`;
  return topupWallet(amount, paymentRef);
}


/**
 * Deduct wallet balance (e.g. for order checkout)
 */
export async function deductWalletBalance(
  amount: number,
  orderId: string,
  description = 'Order Payment'
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!amount || amount <= 0) return { success: false, error: 'Invalid amount' };

  try {
    let walletId: string | null = null;
    let userCreditLimit = 0;
    let finalBalance = 0;
    
    try {
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingWallet) {
        if (existingWallet.status !== 'active') {
          return { success: false, error: 'Your wallet is not active.' };
        }

        // Block wallet usage if user has an unpaid late repayment penalty
        if (Number(existingWallet.balance) < 0 && Number(existingWallet.total_penalties) > 0) {
          return {
            success: false,
            error: `You have an unpaid Late Repayment Penalty of ₹${Number(existingWallet.total_penalties).toLocaleString('en-IN')}. Please top up your wallet to clear pending dues before placing an order.`,
          };
        }

        walletId = existingWallet.id;
        userCreditLimit = Number(existingWallet.credit_limit) || 0;
        
        const balanceBeforeWallet = Number(existingWallet.balance) || 0;
        if (balanceBeforeWallet - amount < -userCreditLimit) {
          return { success: false, error: `Credit limit reached (Max Overdraft: -₹${userCreditLimit}). Available balance: ₹${balanceBeforeWallet.toLocaleString('en-IN')}` };
        }

        const balanceAfterWallet = balanceBeforeWallet - amount;
        finalBalance = balanceAfterWallet;
        
        // Track credit_used_at when balance goes negative for the first time
        let creditUsedAt = existingWallet.credit_used_at;
        if (balanceAfterWallet < 0 && !creditUsedAt) {
           creditUsedAt = new Date().toISOString();
        }

        const updatedTotalDebit = (Number(existingWallet.total_debit) || 0) + amount;
        await supabase
          .from('wallets')
          .update({
            balance: balanceAfterWallet,
            total_debit: updatedTotalDebit,
            credit_used_at: creditUsedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingWallet.id);
          
        // 1. Sync profiles table
        await supabase
          .from('profiles')
          .update({ wallet_balance: balanceAfterWallet })
          .eq('id', user.id);
      } else {
        return { success: false, error: 'Wallet not found. Please activate your wallet.' };
      }
    } catch (e) {
      console.error('Error in wallet deduction:', e);
      return { success: false, error: 'Failed to deduct wallet balance.' };
    }

    // 3. Insert transaction record
    const descText = description || `Payment for order ${orderId}`;

    if (walletId) {
      const { error: insertErr } = await supabase.from('wallet_transactions').insert({
        wallet_id: walletId,
        type: 'debit',
        amount: amount,
        balance_after: finalBalance,
        description: descText,
        reference_id: orderId,
      });

      if (insertErr) {
        console.error('Wallet transaction insert failed:', insertErr);
      }
    }

    return { success: true, newBalance: finalBalance };
  } catch (err: unknown) {
    console.error('deductWalletBalance error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deduct wallet balance' };
  }
}

/**
 * Refund wallet balance when an order is cancelled
 */
export async function refundWalletOrder(
  userId: string,
  amount: number,
  orderTrackingCode: string,
  reason = 'Order cancelled'
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  if (!amount || amount <= 0) return { success: false, error: 'Invalid refund amount' };

  try {
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const balanceBefore = Number(existingWallet.balance) || 0;
    const balanceAfter = balanceBefore + amount;

    await supabase
      .from('wallets')
      .update({
        balance: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingWallet.id);

    await supabase
      .from('profiles')
      .update({ wallet_balance: balanceAfter })
      .eq('id', userId);

    await supabase.from('wallet_transactions').insert({
      wallet_id: existingWallet.id,
      type: 'credit',
      amount: amount,
      balance_after: balanceAfter,
      description: `Refund for order #${orderTrackingCode}: ${reason}`,
      reference_id: `REFUND-${orderTrackingCode}-${Date.now()}`,
    });

    return { success: true, newBalance: balanceAfter };
  } catch (err: unknown) {
    console.error('refundWalletOrder error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to process wallet refund' };
  }
}

/**
 * Legacy exports for backwards compatibility
 */
export async function getWalletBalance() {
  const res = await getWalletDetails();
  return { success: res.success, error: res.error, balance: res.data?.balance || 0 };
}

export async function getWalletTransactions() {
  const res = await getWalletDetails();
  return {
    success: res.success,
    error: res.error,
    data: res.data ? { transactions: res.data.transactions } : null,
  };
}

export async function adminCreditWallet(userId: string, amount: number, note: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user: admin } = await getServerSession();
  if (!admin) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', admin.id)
    .maybeSingle();

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { success: false, error: 'Forbidden' };
  }

  if (amount <= 0) return { success: false, error: 'Amount must be positive' };

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .maybeSingle();

  const { data: w } = await supabase.from('wallets').select('id, balance, total_credit').eq('user_id', userId).maybeSingle();
  
  const balanceBefore = w ? (Number(w.balance) || 0) : (Number(userProfile?.wallet_balance) || 0);
  const balanceAfter = balanceBefore + amount;

  await supabase.from('profiles').update({ wallet_balance: balanceAfter }).eq('id', userId);

  let walletId: string | null = null;
  try {
    if (w) {
      walletId = w.id;
      await supabase.from('wallets').update({
        balance: balanceAfter,
        total_credit: (Number(w.total_credit) || 0) + amount,
        updated_at: new Date().toISOString(),
      }).eq('id', w.id);
    } else {
      // Create a wallet so transactions have a valid wallet_id
      const { data: newW, error: createErr } = await supabase.from('wallets').insert({
        user_id: userId,
        balance: balanceAfter,
        total_credit: amount,
        total_debit: 0,
        status: 'active'
      }).select('id').single();
      
      if (!createErr && newW) {
        walletId = newW.id;
      }
    }
  } catch (err) {
    console.error('Wallet update/create error:', err);
  }

  const txnRef = `admin:${admin.id}`;
  const noteText = note ? `Bonus: ${note}` : 'Bonus credited by admin';

  const { error: fullInsertErr } = await supabase.from('wallet_transactions').insert({
    wallet_id: walletId,
    amount,
    type: 'credit',
    balance_after: balanceAfter,
    description: noteText,
    reference_id: txnRef,
  });

  if (fullInsertErr) {
    console.error('Failed full insert:', fullInsertErr);
    return { success: false, error: 'Failed to record transaction: ' + fullInsertErr.message };
  }

  return { success: true, balance: balanceAfter };
}

export async function getAdminUserWalletBalance(userId: string): Promise<{ success: boolean; balance?: number; status?: string; error?: string }> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  const { user: admin } = await getServerSession();
  if (!admin) return { success: false, error: 'Not authenticated' };

  try {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', admin.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return { success: false, error: 'Forbidden' };
    }

    const { data: wallet } = await supabase.from('wallets').select('balance, status').eq('user_id', userId).maybeSingle();
    
    if (!wallet) {
      return { success: true, balance: 0, status: 'unverified' };
    }

    return { success: true, balance: Number(wallet.balance) || 0, status: wallet.status };
  } catch (err: unknown) {
    console.error('getAdminUserWalletBalance error:', err);
    return { success: false, error: 'Failed to fetch balance' };
  }
}

/**
 * KYC Actions
 */
export async function submitWalletKyc(data: {
  kycName: string;
  kycEmail: string;
  documentType: string;
  kycPhotoUrl: string;
  panCardUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Database service unavailable' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { data: existingWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error('submitWalletKyc fetch error:', fetchErr);
    }

    if (existingWallet && existingWallet.status === 'active') {
      return { success: false, error: 'Wallet is already active' };
    }

    const now = new Date().toISOString();

    if (existingWallet) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          kyc_name: data.kycName,
          kyc_email: data.kycEmail,
          document_type: data.documentType,
          kyc_photo_url: data.kycPhotoUrl,
          pan_card_url: data.panCardUrl,
          status: 'pending',
          kyc_submitted_at: now,
          updated_at: now,
        })
        .eq('id', existingWallet.id);

      if (updateErr) {
        console.error('submitWalletKyc update error:', updateErr);
        return { success: false, error: updateErr.message || 'Failed to update KYC request' };
      }
    } else {
      const { error: insertErr } = await supabase.from('wallets').insert({
        user_id: user.id,
        balance: 0,
        total_credit: 0,
        total_debit: 0,
        credit_limit: 0,
        status: 'pending',
        kyc_name: data.kycName,
        kyc_email: data.kycEmail,
        document_type: data.documentType,
        kyc_photo_url: data.kycPhotoUrl,
        pan_card_url: data.panCardUrl,
        kyc_submitted_at: now,
      });

      if (insertErr) {
        console.error('submitWalletKyc insert error:', insertErr);
        return { success: false, error: insertErr.message || 'Failed to submit KYC request' };
      }
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('submitWalletKyc error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit KYC',
    };
  }
}

export async function getPendingWalletKycs(): Promise<{ success: boolean; data?: Wallet[]; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: kycs, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('status', 'pending')
      .order('kyc_submitted_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: kycs as Wallet[] };
  } catch (err: unknown) {
    console.error('getPendingWalletKycs error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch pending KYCs' };
  }
}

export async function approveWalletKyc(walletId: string, creditLimit: number = 0): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: existing } = await supabase
      .from('wallets')
      .select('id, user_id')
      .or(`id.eq.${walletId},user_id.eq.${walletId}`)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          status: 'active',
          credit_limit: creditLimit,
          kyc_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', walletId)
        .maybeSingle();

      const { error: insertErr } = await supabase.from('wallets').insert({
        user_id: walletId,
        balance: 0,
        total_credit: 0,
        total_debit: 0,
        credit_limit: creditLimit,
        status: 'active',
        kyc_name: profile?.full_name || 'Student',
        kyc_email: profile?.email || '',
        kyc_approved_at: new Date().toISOString(),
      });

      if (insertErr) throw insertErr;
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('approveWalletKyc error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to approve KYC' };
  }
}

export async function updateWalletCreditLimit(walletId: string, creditLimit: number): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: existing } = await supabase
      .from('wallets')
      .select('id, user_id')
      .or(`id.eq.${walletId},user_id.eq.${walletId}`)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          credit_limit: creditLimit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', walletId)
        .maybeSingle();

      const { error: insertErr } = await supabase.from('wallets').insert({
        user_id: walletId,
        balance: 0,
        total_credit: 0,
        total_debit: 0,
        credit_limit: creditLimit,
        status: 'active',
        kyc_name: profile?.full_name || 'Student',
        kyc_email: profile?.email || '',
      });

      if (insertErr) throw insertErr;
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('updateWalletCreditLimit error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update credit limit' };
  }
}

export async function rejectWalletKyc(walletId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: existing } = await supabase
      .from('wallets')
      .select('id, user_id')
      .or(`id.eq.${walletId},user_id.eq.${walletId}`)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          status: 'rejected',
          kyc_rejection_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', walletId)
        .maybeSingle();

      const { error: insertErr } = await supabase.from('wallets').insert({
        user_id: walletId,
        balance: 0,
        total_credit: 0,
        total_debit: 0,
        credit_limit: 0,
        status: 'rejected',
        kyc_rejection_reason: reason,
        kyc_name: profile?.full_name || 'Student',
        kyc_email: profile?.email || '',
      });

      if (insertErr) throw insertErr;
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('rejectWalletKyc error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reject KYC' };
  }
}

export async function processBnplPenalties(): Promise<{ success: boolean; processedCount?: number; error?: string }> {
  // This function should be called by a secure Cron endpoint.
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service unavailable' };

  try {
    // 1. Fetch all wallets that have a negative balance and a credit_used_at timestamp.
    // We only care about wallets that are currently in overdraft.
    const { data: overdueWallets, error: fetchErr } = await supabase
      .from('wallets')
      .select('id, user_id, balance, credit_used_at, total_debit, total_penalties')
      .lt('balance', 0)
      .not('credit_used_at', 'is', null);

    if (fetchErr) {
      console.error('Error fetching overdue wallets:', fetchErr);
      return { success: false, error: fetchErr.message };
    }

    if (!overdueWallets || overdueWallets.length === 0) {
      return { success: true, processedCount: 0 };
    }

    let processedCount = 0;
    const PENALTY_AMOUNT = 20;
    const PENALTY_PERIOD_DAYS = 30;
    const now = new Date();

    for (const wallet of overdueWallets) {
      if (!wallet.credit_used_at) continue;

      const creditUsedDate = new Date(wallet.credit_used_at);
      const diffTime = Math.abs(now.getTime() - creditUsedDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // How many 30-day periods have passed?
      const expectedPenaltyCount = Math.floor(diffDays / PENALTY_PERIOD_DAYS);

      if (expectedPenaltyCount > 0) {
        // Sum total penalty amount ALREADY applied in this specific debt cycle
        const { data: existingPenaltyTxs, error: txErr } = await supabase
          .from('wallet_transactions')
          .select('amount')
          .eq('wallet_id', wallet.id)
          .eq('type', 'debit')
          .ilike('description', 'Late Repayment Penalty%')
          .gte('created_at', wallet.credit_used_at);

        if (txErr) {
          console.error(`Error checking transactions for wallet ${wallet.id}:`, txErr);
          continue;
        }

        const totalPenaltyAppliedAmount = (existingPenaltyTxs || []).reduce(
          (sum, tx) => sum + (Number(tx.amount) || 0),
          0
        );
        const appliedPenaltiesCount = Math.floor(totalPenaltyAppliedAmount / PENALTY_AMOUNT);
        const penaltiesToApply = expectedPenaltyCount - appliedPenaltiesCount;

        if (penaltiesToApply > 0) {
          const totalFine = penaltiesToApply * PENALTY_AMOUNT;

          // Update Wallet Balance
          const newBalance = Number(wallet.balance) - totalFine;
          const newTotalDebit = (Number(wallet.total_debit) || 0) + totalFine;
          const newTotalPenalties = (Number(wallet.total_penalties) || 0) + totalFine;

          const { error: updateErr } = await supabase
            .from('wallets')
            .update({
              balance: newBalance,
              total_debit: newTotalDebit,
              total_penalties: newTotalPenalties,
              updated_at: new Date().toISOString(),
            })
            .eq('id', wallet.id);

          if (!updateErr) {
            // Also sync profiles table
            if (wallet.user_id) {
              await supabase
                .from('profiles')
                .update({ wallet_balance: newBalance })
                .eq('id', wallet.user_id);
            }

            // Insert Wallet Transaction
            await supabase.from('wallet_transactions').insert({
              wallet_id: wallet.id,
              type: 'debit',
              amount: totalFine,
              balance_after: newBalance,
              description: `Late Repayment Penalty (${penaltiesToApply}x period)`,
            });
            
            // Dispatch native Web Push to student's registered devices
            if (wallet.user_id) {
              notifyBnplFinePush({
                userId: wallet.user_id,
                amount: totalFine,
                newBalance,
              }).catch((err) => console.error('BNPL fine push error:', err));
            }

            processedCount++;
          }
        }
      }
    }

    return { success: true, processedCount };
  } catch (err: unknown) {
    console.error('processBnplPenalties error:', err);
    return { success: false, error: 'Failed to process penalties' };
  }
}

export async function getAllWallets(): Promise<{ success: boolean; data?: Wallet[]; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    // 1. Fetch only wallets with a submitted KYC / wallet request
    const { data: wallets, error: walletsErr } = await supabase
      .from('wallets')
      .select('*')
      .or('kyc_submitted_at.not.is.null,status.in.(pending,active,rejected)')
      .order('kyc_submitted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (walletsErr) {
      console.error('getAllWallets query error:', walletsErr);
      throw new Error(walletsErr.message);
    }

    const submittedWallets = (wallets || []).filter((w) => {
      // Only include students who have actually submitted a KYC wallet request
      return Boolean(w.kyc_submitted_at || w.kyc_photo_url || w.pan_card_url || ['pending', 'active', 'rejected'].includes(w.status));
    });

    // 2. Fetch profiles only for user details enrichment of those submitted wallets
    const userIds = submittedWallets.map((w) => w.user_id).filter(Boolean);
    let profilesMap = new Map<string, { id: string; email?: string; full_name?: string }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (profiles) {
        profilesMap = new Map(profiles.map((p) => [p.id, p]));
      }
    }

    // Enrich submitted wallets with student name/email and clear legacy paid fines
    const enrichedWallets: Wallet[] = [];
    for (const w of submittedWallets) {
      const p = profilesMap.get(w.user_id);
      let penalties = Number(w.total_penalties) || 0;
      if (Number(w.balance) >= 0 && penalties > 0) {
        // Debt is already repaid; reset legacy fine to 0 in DB
        penalties = 0;
        supabase.from('wallets').update({ total_penalties: 0 }).eq('id', w.id).then();
      }
      enrichedWallets.push({
        ...w,
        total_penalties: penalties,
        kyc_name: w.kyc_name || p?.full_name || 'Student',
        kyc_email: w.kyc_email || p?.email || '',
      });
    }

    return { success: true, data: enrichedWallets };
  } catch (err: unknown) {
    console.error('getAllWallets error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch all wallets' };
  }
}

export async function getAdminWalletTransactions(walletId: string): Promise<{ success: boolean; data?: WalletTransaction[]; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id')
      .or(`id.eq.${walletId},user_id.eq.${walletId}`)
      .maybeSingle();

    if (!wallet) {
      return { success: true, data: [] };
    }

    const { data: txData, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Normalize transactions similar to getWalletDetails
    const transactions = (txData || []).map(tx => {
      const isCreditType = tx.type === 'debit' ? false : (['credit', 'topup'].includes(tx.type) || Number(tx.amount) > 0);
      return {
        ...tx,
        type: isCreditType ? 'credit' : 'debit',
        amount: Math.abs(Number(tx.amount) || 0)
      };
    }) as WalletTransaction[];

    return { success: true, data: transactions };
  } catch (err: unknown) {
    console.error('getAdminWalletTransactions error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch transactions' };
  }
}

export async function updateWalletStatus(walletId: string, status: Wallet['status']): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.supabase) return { success: false, error: auth.error };
  const { supabase } = auth;

  try {
    const { data: existing } = await supabase
      .from('wallets')
      .select('id, user_id')
      .or(`id.eq.${walletId},user_id.eq.${walletId}`)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateErr) throw updateErr;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', walletId)
        .maybeSingle();

      const { error: insertErr } = await supabase.from('wallets').insert({
        user_id: walletId,
        balance: 0,
        total_credit: 0,
        total_debit: 0,
        credit_limit: 0,
        credit_used: 0,
        status,
        kyc_name: profile?.full_name || 'Student',
        kyc_email: profile?.email || '',
      });

      if (insertErr) throw insertErr;
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('updateWalletStatus error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update wallet status' };
  }
}
