'use server';

import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { creditVerificationService } from '../services/credit-verification-service';
import { creditLimitService } from '../services/credit-limit-service';
import { bnplCheckoutService } from '../services/bnpl-checkout-service';
import { repaymentService } from '../services/repayment-service';
import { dueDateService } from '../services/due-date-service';
import { auditService } from '../services/audit-service';
import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditTransactionRepository } from '../repositories/credit-transaction-repository';
import { AuthenticationError } from '@/lib/errors';
import type { CreditDashboardData } from '../types';
import type { ApiResponse } from '@/types';

async function getCurrentUserId(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new AuthenticationError();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthenticationError();
  return user.id;
}

export async function getCreditDashboard(): Promise<ApiResponse<CreditDashboardData>> {
  try {
    const userId = await getCurrentUserId();
    const account = await creditAccountRepository.findByUserId(userId);
    if (!account) {
      return { success: true, data: {
        account: null,
        recentTransactions: [],
        upcomingRepayments: [],
        overdueAmount: 0,
        utilizationPercentage: 0,
      }};
    }
    const [transactions, repayments] = await Promise.all([
      creditTransactionRepository.findByAccountId(account.id, 10),
      dueDateService.getUpcomingRepayments(account.id),
    ]);
    const overdueAmount = repayments
      .filter((r) => r.status !== 'paid' && new Date(r.due_date) < new Date())
      .reduce((sum, r) => sum + r.amount, 0);
    const utilization = creditLimitService.getUtilizationPercentage(account);
    return {
      success: true,
      data: {
        account,
        recentTransactions: transactions,
        upcomingRepayments: repayments,
        overdueAmount,
        utilizationPercentage: utilization,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load dashboard' };
  }
}

export async function getCreditAccount() {
  try {
    const userId = await getCurrentUserId();
    const account = await creditAccountRepository.findByUserId(userId);
    if (!account) {
      return { success: true, data: null };
    }
    return { success: true, data: account };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load account' };
  }
}

export async function checkBNPLEligibility() {
  try {
    const userId = await getCurrentUserId();
    const eligibility = await creditVerificationService.checkEligibility(userId);
    return { success: true, data: eligibility };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Eligibility check failed' };
  }
}

export async function processBNPLCheckout(orderId: string, amount: number) {
  try {
    const userId = await getCurrentUserId();
    const result = await bnplCheckoutService.validateAndProcessCheckout({
      orderId,
      userId,
      amount,
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Checkout failed' };
  }
}

export async function processRepayment(repaymentId: string) {
  try {
    const result = await repaymentService.processFullRepayment(repaymentId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Repayment failed' };
  }
}

export async function getAuditLogs() {
  try {
    const userId = await getCurrentUserId();
    const logs = await auditService.getAuditLogs(userId);
    return { success: true, data: logs };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load audit logs' };
  }
}

export async function getCreditTransactions() {
  try {
    const userId = await getCurrentUserId();
    const account = await creditAccountRepository.findByUserId(userId);
    if (!account) return { success: true, data: [] };
    const transactions = await creditTransactionRepository.findByAccountId(account.id);
    return { success: true, data: transactions };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load transactions' };
  }
}
