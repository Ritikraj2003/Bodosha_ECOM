import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditVerificationService } from './credit-verification-service';
import { creditLedgerService } from './credit-ledger-service';
import { dueDateService } from './due-date-service';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { bnplCheckoutSchema } from '../schemas';
import type { BNPLCheckoutResult } from '../types';
import { ValidationError } from '@/lib/errors';

export class BNPLCheckoutService {
  async validateAndProcessCheckout(input: {
    orderId: string;
    userId: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }): Promise<BNPLCheckoutResult> {
    const parsed = bnplCheckoutSchema.parse(input);

    const eligibility = await creditVerificationService.checkEligibility(parsed.userId);
    if (!eligibility.eligible) {
      throw new ValidationError(eligibility.reason || 'Not eligible for BNPL');
    }

    let account = eligibility.account;
    if (!account) {
      account = await creditVerificationService.verifyStudent(parsed.userId);
    }

    if (account.verification_status !== 'verified') {
      throw new ValidationError(
        'Credit account is not verified. Please complete verification first.',
      );
    }

    if (account.status !== 'active') {
      throw new ValidationError('Credit account is not active');
    }

    if (account.available_credit < parsed.amount) {
      throw new ValidationError(
        `Insufficient credit. Available: ₹${account.available_credit}, Required: ₹${parsed.amount}`,
      );
    }

    const ledgerTx = await creditLedgerService.recordTransaction({
      creditAccountId: account.id,
      type: 'purchase',
      amount: parsed.amount,
      orderId: parsed.orderId,
      description: 'BNPL purchase',
    });

    await creditAccountRepository.deductCredit(account.id, parsed.amount);

    const dueDays = account.due_days || 15;
    await dueDateService.generateRepaymentSchedule({
      creditAccountId: account.id,
      orderId: parsed.orderId,
      amount: parsed.amount,
      dueDays,
    });

    await creditAuditRepository.create({
      userId: parsed.userId,
      action: 'bnpl_purchase',
      newValue: {
        order_id: parsed.orderId,
        amount: parsed.amount,
        available_credit_before: account.available_credit,
        available_credit_after: account.available_credit - parsed.amount,
      },
      reason: 'BNPL checkout completed',
      metadata: parsed.metadata || null,
    });

    return {
      success: true,
      orderId: parsed.orderId,
      transactionId: ledgerTx.id,
    };
  }

  async checkAvailableCredit(userId: string): Promise<{
    available: number;
    limit: number;
    outstanding: number;
    sufficient: boolean;
  }> {
    const account = await creditAccountRepository.findByUserId(userId);
    if (!account) {
      return { available: 0, limit: 0, outstanding: 0, sufficient: false };
    }
    return {
      available: account.available_credit,
      limit: account.credit_limit,
      outstanding: account.outstanding,
      sufficient: account.available_credit > 0,
    };
  }
}

export const bnplCheckoutService = new BNPLCheckoutService();
