'use server';

import { getServerSession } from '@/features/auth/actions';
import { query } from '@/infrastructure/db';
import { getAdminEmails } from '@/lib/settings';
import { isAdminEmail } from '@/config/auth-access';
import type { Wallet, WalletTransaction, WalletSummary } from '../types';
import { notifyBnplFinePush } from '@/lib/push';

async function checkAdminAuth() {
  const { user: admin } = await getServerSession();
  if (!admin) return { authorized: false, error: 'Not authenticated', admin: null };

  const adminEmails = await getAdminEmails();
  const isAdminByEmail = isAdminEmail(admin.email, adminEmails);

  const roleRes = await query<{ role: string }>(
    `SELECT role FROM public.users WHERE id = $1 LIMIT 1`,
    [admin.id]
  );
  const userRole = roleRes.rows[0]?.role || admin.role || '';
  const isAuthorized = ['admin', 'super_admin', 'owner'].includes(userRole) || isAdminByEmail;

  if (!isAuthorized) {
    return { authorized: false, error: 'Forbidden. Admin access required.', admin: null };
  }

  return { authorized: true, admin, userRole };
}

/**
 * Fetch full wallet details for current authenticated user
 */
export async function getWalletDetails(): Promise<{
  success: boolean;
  error?: string;
  data?: WalletSummary;
}> {
  try {
    const { user } = await getServerSession();
    if (!user) return { success: false, error: 'Not authenticated' };

    // 1. Fetch user profile balance
    const profileRes = await query<{ wallet_balance: number }>(
      'SELECT wallet_balance FROM public.profiles WHERE id = $1 LIMIT 1',
      [user.id]
    );
    const profileBalance = Number(profileRes.rows[0]?.wallet_balance) || 0;

    // 2. Fetch or auto-create unverified wallet in wallets table
    let walletRecord: Wallet | null = null;
    const walletRes = await query<Wallet>(
      'SELECT * FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [user.id]
    );

    if (walletRes.rows.length > 0) {
      walletRecord = walletRes.rows[0];
    } else {
      // Auto-create wallet row for the user with status 'unverified'
      const newWallet = await query<Wallet>(`
        INSERT INTO public.wallets (user_id, balance, status, created_at, updated_at)
        VALUES ($1, $2, 'unverified', NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
        RETURNING *;
      `, [user.id, profileBalance]);
      walletRecord = newWallet.rows[0] || null;
    }

    // 3. Fetch transaction history
    const txRes = await query(`
      SELECT * FROM public.wallet_transactions
      WHERE wallet_id = $1
      ORDER BY created_at DESC
      LIMIT 50;
    `, [walletRecord?.id || '00000000-0000-0000-0000-000000000000']);

    const rawTransactions = txRes.rows;

    // Normalize transaction list
    const transactions: WalletTransaction[] = rawTransactions.map((tx: any) => {
      const isCreditType = tx.type === 'debit' ? false : (['credit', 'topup'].includes(tx.type) || Number(tx.amount) > 0);
      return {
        id: tx.id,
        restaurant_id: tx.restaurant_id ?? null,
        wallet_id: tx.wallet_id ?? walletRecord?.id ?? null,
        user_id: user.id,
        type: isCreditType ? 'credit' : 'debit',
        amount: Math.abs(Number(tx.amount) || 0),
        balance_before: 0,
        balance_after: Number(tx.balance_after) || 0,
        order_id: tx.reference_id?.startsWith('ORD') ? tx.reference_id : null,
        payment_reference: tx.reference_id ?? null,
        description: tx.description ?? (isCreditType ? 'Wallet Top Up' : 'Order Payment'),
        reference: tx.reference_id ?? null,
        note: null,
        created_at: tx.created_at,
      };
    });

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
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!amount || amount <= 0) {
    return { success: false, error: 'Please enter a valid top-up amount' };
  }

  try {
    const existingRes = await query<Wallet>(
      'SELECT * FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    const existingWallet = existingRes.rows[0];

    if (!existingWallet || existingWallet.status !== 'active') {
      return { success: false, error: 'Your wallet is not active. Please complete KYC.' };
    }

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

    let creditUsedAt = existingWallet.credit_used_at;
    let totalPenalties = Number(existingWallet.total_penalties) || 0;
    if (balanceAfter >= 0) {
      creditUsedAt = null;
      totalPenalties = 0;
    }

    await query(
      `UPDATE public.wallets 
       SET balance = $1, total_credit = $2, credit_used_at = $3, total_penalties = $4, updated_at = NOW()
       WHERE id = $5`,
      [balanceAfter, updatedTotalCredit, creditUsedAt, totalPenalties, walletId]
    );

    await query(
      `UPDATE public.profiles SET wallet_balance = $1 WHERE id = $2`,
      [balanceAfter, user.id]
    );

    const txnRef = `TOPUP-${Date.now()}`;
    const descText = `Wallet Top Up (${paymentReference})`;

    await query(
      `INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id, created_at)
       VALUES ($1, 'credit', $2, $3, $4, $5, NOW())`,
      [walletId, amount, balanceAfter, descText, txnRef]
    );

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
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!amount || amount <= 0) return { success: false, error: 'Invalid amount' };

  try {
    const existingRes = await query<Wallet>(
      'SELECT * FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    const existingWallet = existingRes.rows[0];

    if (!existingWallet) {
      return { success: false, error: 'Wallet not found. Please activate your wallet.' };
    }

    if (existingWallet.status !== 'active') {
      return { success: false, error: 'Your wallet is not active.' };
    }

    if (Number(existingWallet.balance) < 0 && Number(existingWallet.total_penalties) > 0) {
      return {
        success: false,
        error: `You have an unpaid Late Repayment Penalty of ₹${Number(existingWallet.total_penalties).toLocaleString('en-IN')}. Please top up your wallet to clear pending dues before placing an order.`,
      };
    }

    const walletId = existingWallet.id;
    const userCreditLimit = Number(existingWallet.credit_limit) || 0;
    const balanceBeforeWallet = Number(existingWallet.balance) || 0;
    if (balanceBeforeWallet - amount < -userCreditLimit) {
      return {
        success: false,
        error: `Credit limit reached (Max Overdraft: -₹${userCreditLimit}). Available balance: ₹${balanceBeforeWallet.toLocaleString('en-IN')}`,
      };
    }

    const balanceAfterWallet = balanceBeforeWallet - amount;
    let creditUsedAt = existingWallet.credit_used_at;
    if (balanceAfterWallet < 0 && !creditUsedAt) {
      creditUsedAt = new Date().toISOString();
    }

    const updatedTotalDebit = (Number(existingWallet.total_debit) || 0) + amount;
    await query(
      `UPDATE public.wallets 
       SET balance = $1, total_debit = $2, credit_used_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [balanceAfterWallet, updatedTotalDebit, creditUsedAt, walletId]
    );

    await query(
      `UPDATE public.profiles SET wallet_balance = $1 WHERE id = $2`,
      [balanceAfterWallet, user.id]
    );

    const descText = description || `Payment for order ${orderId}`;
    await query(
      `INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id, created_at)
       VALUES ($1, 'debit', $2, $3, $4, $5, NOW())`,
      [walletId, amount, balanceAfterWallet, descText, orderId]
    );

    return { success: true, newBalance: balanceAfterWallet };
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
  if (!amount || amount <= 0) return { success: false, error: 'Invalid refund amount' };

  try {
    const existingRes = await query<Wallet>(
      'SELECT * FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    let existingWallet = existingRes.rows[0];
    if (!existingWallet) {
      const createRes = await query<Wallet>(
        `INSERT INTO public.wallets (user_id, balance, status, created_at, updated_at)
         VALUES ($1, 0, 'unverified', NOW(), NOW())
         RETURNING *`,
        [userId]
      );
      existingWallet = createRes.rows[0];
    }

    const balanceBefore = Number(existingWallet.balance) || 0;
    const balanceAfter = balanceBefore + amount;

    await query(
      `UPDATE public.wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [balanceAfter, existingWallet.id]
    );
    await query(
      `UPDATE public.profiles SET wallet_balance = $1 WHERE id = $2`,
      [balanceAfter, userId]
    );
    await query(
      `INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id, created_at)
       VALUES ($1, 'credit', $2, $3, $4, $5, NOW())`,
      [
        existingWallet.id,
        amount,
        balanceAfter,
        `Refund for order #${orderTrackingCode}: ${reason}`,
        `REFUND-${orderTrackingCode}-${Date.now()}`,
      ]
    );

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
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error || 'Forbidden' };

  if (amount <= 0) return { success: false, error: 'Amount must be positive' };

  try {
    const userProfileRes = await query<{ wallet_balance: number }>(
      'SELECT wallet_balance FROM public.profiles WHERE id = $1 LIMIT 1',
      [userId]
    );
    const wRes = await query<Wallet>(
      'SELECT id, balance, total_credit FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const w = wRes.rows[0];

    const balanceBefore = w ? (Number(w.balance) || 0) : (Number(userProfileRes.rows[0]?.wallet_balance) || 0);
    const balanceAfter = balanceBefore + amount;

    await query('UPDATE public.profiles SET wallet_balance = $1 WHERE id = $2', [balanceAfter, userId]);

    let walletId: string | null = null;
    if (w) {
      walletId = w.id;
      await query(
        `UPDATE public.wallets SET balance = $1, total_credit = (COALESCE(total_credit, 0) + $2), updated_at = NOW() WHERE id = $3`,
        [balanceAfter, amount, w.id]
      );
    } else {
      const insRes = await query<{ id: string }>(
        `INSERT INTO public.wallets (user_id, balance, total_credit, total_debit, status, created_at, updated_at)
         VALUES ($1, $2, $3, 0, 'active', NOW(), NOW())
         RETURNING id`,
        [userId, balanceAfter, amount]
      );
      walletId = insRes.rows[0]?.id || null;
    }

    const txnRef = `admin:${auth.admin?.id || 'admin'}`;
    const noteText = note ? `Bonus: ${note}` : 'Bonus credited by admin';

    if (walletId) {
      await query(
        `INSERT INTO public.wallet_transactions (wallet_id, amount, type, balance_after, description, reference_id, created_at)
         VALUES ($1, $2, 'credit', $3, $4, $5, NOW())`,
        [walletId, amount, balanceAfter, noteText, txnRef]
      );
    }

    return { success: true, balance: balanceAfter };
  } catch (err: unknown) {
    console.error('adminCreditWallet error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to credit wallet' };
  }
}

export async function getAdminUserWalletBalance(userId: string): Promise<{ success: boolean; balance?: number; status?: string; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error || 'Forbidden' };

  try {
    const res = await query<{ balance: number; status: string }>(
      'SELECT balance, status FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (res.rows.length === 0) {
      return { success: true, balance: 0, status: 'unverified' };
    }
    return { success: true, balance: Number(res.rows[0].balance) || 0, status: res.rows[0].status };
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
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const existingRes = await query<{ id: string; status: string }>(
      'SELECT id, status FROM public.wallets WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    const existingWallet = existingRes.rows[0];

    if (existingWallet && existingWallet.status === 'active') {
      return { success: false, error: 'Wallet is already active' };
    }

    if (existingWallet) {
      await query(
        `UPDATE public.wallets
         SET kyc_name = $1, kyc_email = $2, document_type = $3, kyc_photo_url = $4, pan_card_url = $5,
             status = 'pending', kyc_submitted_at = NOW(), updated_at = NOW()
         WHERE id = $6`,
        [data.kycName, data.kycEmail, data.documentType, data.kycPhotoUrl, data.panCardUrl, existingWallet.id]
      );
    } else {
      await query(
        `INSERT INTO public.wallets (
           user_id, balance, total_credit, total_debit, credit_limit, status,
           kyc_name, kyc_email, document_type, kyc_photo_url, pan_card_url, kyc_submitted_at, created_at, updated_at
         ) VALUES ($1, 0, 0, 0, 0, 'pending', $2, $3, $4, $5, $6, NOW(), NOW(), NOW())`,
        [user.id, data.kycName, data.kycEmail, data.documentType, data.kycPhotoUrl, data.panCardUrl]
      );
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
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    const res = await query<Wallet>(
      `SELECT * FROM public.wallets WHERE status = 'pending' ORDER BY kyc_submitted_at DESC NULLS LAST`
    );
    return { success: true, data: res.rows };
  } catch (err: unknown) {
    console.error('getPendingWalletKycs error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch pending KYCs' };
  }
}

export async function approveWalletKyc(walletId: string, creditLimit: number = 0): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    const res = await query(
      `UPDATE public.wallets
       SET status = 'active', credit_limit = $2, kyc_approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 OR user_id = $1`,
      [walletId, creditLimit]
    );

    if (res.rowCount === 0) {
      const pRes = await query<{ email: string; full_name: string }>(
        'SELECT email, full_name FROM public.profiles WHERE id = $1 LIMIT 1',
        [walletId]
      );
      const profile = pRes.rows[0];
      await query(
        `INSERT INTO public.wallets (
           user_id, balance, total_credit, total_debit, credit_limit, status,
           kyc_name, kyc_email, kyc_approved_at, created_at, updated_at
         ) VALUES ($1, 0, 0, 0, $2, 'active', $3, $4, NOW(), NOW(), NOW())`,
        [walletId, creditLimit, profile?.full_name || 'Student', profile?.email || '']
      );
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('approveWalletKyc error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to approve KYC' };
  }
}

export async function updateWalletCreditLimit(walletId: string, creditLimit: number): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    await query(
      `UPDATE public.wallets SET credit_limit = $2, updated_at = NOW() WHERE id = $1 OR user_id = $1`,
      [walletId, creditLimit]
    );
    return { success: true };
  } catch (err: unknown) {
    console.error('updateWalletCreditLimit error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update credit limit' };
  }
}

export async function rejectWalletKyc(walletId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    await query(
      `UPDATE public.wallets SET status = 'rejected', kyc_rejection_reason = $2, updated_at = NOW() WHERE id = $1 OR user_id = $1`,
      [walletId, reason]
    );
    return { success: true };
  } catch (err: unknown) {
    console.error('rejectWalletKyc error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reject KYC' };
  }
}

export async function processBnplPenalties(): Promise<{ success: boolean; processedCount?: number; error?: string }> {
  try {
    const overdueRes = await query<any>(`
      SELECT id, user_id, balance, credit_used_at, total_debit, total_penalties
      FROM public.wallets
      WHERE balance < 0 AND credit_used_at IS NOT NULL
    `);

    const overdueWallets = overdueRes.rows;
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
      const expectedPenaltyCount = Math.floor(diffDays / PENALTY_PERIOD_DAYS);

      if (expectedPenaltyCount > 0) {
        const existingTxRes = await query<{ amount: number }>(`
          SELECT amount FROM public.wallet_transactions
          WHERE wallet_id = $1 AND type = 'debit' AND description ILIKE 'Late Repayment Penalty%' AND created_at >= $2
        `, [wallet.id, wallet.credit_used_at]);

        const totalPenaltyAppliedAmount = existingTxRes.rows.reduce(
          (sum: number, tx: any) => sum + (Number(tx.amount) || 0),
          0
        );
        const appliedPenaltiesCount = Math.floor(totalPenaltyAppliedAmount / PENALTY_AMOUNT);
        const penaltiesToApply = expectedPenaltyCount - appliedPenaltiesCount;

        if (penaltiesToApply > 0) {
          const totalFine = penaltiesToApply * PENALTY_AMOUNT;
          const newBalance = Number(wallet.balance) - totalFine;
          const newTotalDebit = (Number(wallet.total_debit) || 0) + totalFine;
          const newTotalPenalties = (Number(wallet.total_penalties) || 0) + totalFine;

          await query(`
            UPDATE public.wallets
            SET balance = $1, total_debit = $2, total_penalties = $3, updated_at = NOW()
            WHERE id = $4
          `, [newBalance, newTotalDebit, newTotalPenalties, wallet.id]);

          if (wallet.user_id) {
            await query(`UPDATE public.profiles SET wallet_balance = $1 WHERE id = $2`, [newBalance, wallet.user_id]);
          }

          await query(`
            INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, description, created_at)
            VALUES ($1, 'debit', $2, $3, $4, NOW())
          `, [wallet.id, totalFine, newBalance, `Late Repayment Penalty (${penaltiesToApply}x period)`]);

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

    return { success: true, processedCount };
  } catch (err: unknown) {
    console.error('processBnplPenalties error:', err);
    return { success: false, error: 'Failed to process penalties' };
  }
}

export async function getAllWallets(): Promise<{ success: boolean; data?: Wallet[]; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    const walletsRes = await query<any>(`
      SELECT 
        w.*,
        COALESCE(w.kyc_name, p.full_name, u.full_name, 'Student') AS kyc_name,
        COALESCE(w.kyc_email, p.email, u.email, '') AS kyc_email
      FROM public.wallets w
      LEFT JOIN public.profiles p ON p.id = w.user_id
      LEFT JOIN public.users u ON u.id = w.user_id
      WHERE w.kyc_submitted_at IS NOT NULL OR w.status IN ('pending', 'active', 'rejected')
      ORDER BY w.kyc_submitted_at DESC NULLS LAST, w.created_at DESC;
    `);

    const enrichedWallets: Wallet[] = walletsRes.rows.map((w) => {
      let penalties = Number(w.total_penalties) || 0;
      if (Number(w.balance) >= 0 && penalties > 0) {
        penalties = 0;
      }
      return {
        ...w,
        total_penalties: penalties,
      };
    });

    return { success: true, data: enrichedWallets };
  } catch (err: unknown) {
    console.error('getAllWallets error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch all wallets' };
  }
}

export async function getAdminWalletTransactions(walletId: string): Promise<{ success: boolean; data?: WalletTransaction[]; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    const txRes = await query(
      `SELECT wt.* 
       FROM public.wallet_transactions wt
       JOIN public.wallets w ON wt.wallet_id = w.id
       WHERE w.id = $1 OR w.user_id = $1
       ORDER BY wt.created_at DESC`,
      [walletId]
    );

    const transactions = (txRes.rows || []).map((tx: any) => {
      const isCreditType = tx.type === 'debit' ? false : (['credit', 'topup'].includes(tx.type) || Number(tx.amount) > 0);
      return {
        ...tx,
        type: isCreditType ? 'credit' : 'debit',
        amount: Math.abs(Number(tx.amount) || 0),
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
  if (!auth.authorized) return { success: false, error: auth.error };

  try {
    await query(
      `UPDATE public.wallets SET status = $2, updated_at = NOW() WHERE id = $1 OR user_id = $1`,
      [walletId, status]
    );
    return { success: true };
  } catch (err: unknown) {
    console.error('updateWalletStatus error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update wallet status' };
  }
}
