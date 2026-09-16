import { creditRepaymentRepository } from '../repositories/credit-repayment-repository';
import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { creditLedgerService } from './credit-ledger-service';
import { creditRestorationService } from './credit-restoration-service';
import type { RepaymentResult } from '../types';
import { NotFoundError, ValidationError } from '@/lib/errors';

export class RepaymentService {
  async processFullRepayment(repaymentId: string): Promise<RepaymentResult> {
    const repayment = await creditRepaymentRepository.findById(repaymentId);
    if (!repayment) throw new NotFoundError('Repayment');
    if (repayment.status === 'paid') {
      throw new ValidationError('Repayment already completed');
    }

    const account = await creditAccountRepository.findById(repayment.credit_account_id);
    if (!account) throw new NotFoundError('Credit account');

    const ledgerTx = await creditLedgerService.recordTransaction({
      creditAccountId: account.id,
      type: 'repayment',
      amount: repayment.amount,
      description: 'Full repayment',
      reference: repayment.id,
    });

    await creditRepaymentRepository.updateStatus(
      repaymentId,
      'paid',
      new Date().toISOString(),
      ledgerTx.id,
    );

    await creditRestorationService.restoreCredit(account.id, repayment.amount);

    await creditAuditRepository.create({
      userId: account.user_id,
      action: 'repayment',
      previousValue: { status: repayment.status, outstanding: account.outstanding },
      newValue: { status: 'paid', outstanding: account.outstanding - repayment.amount },
      reason: 'Full repayment processed',
      metadata: { repayment_id: repaymentId, amount: repayment.amount },
    });

    const updatedAccount = await creditAccountRepository.findById(account.id);

    return {
      success: true,
      transactionId: ledgerTx.id,
      remainingBalance: updatedAccount?.outstanding ?? 0,
    };
  }

  async processPartialRepayment(
    repaymentId: string,
    amount: number,
  ): Promise<RepaymentResult> {
    const repayment = await creditRepaymentRepository.findById(repaymentId);
    if (!repayment) throw new NotFoundError('Repayment');
    if (repayment.status === 'paid') {
      throw new ValidationError('Repayment already completed');
    }

    if (amount >= repayment.amount) {
      return this.processFullRepayment(repaymentId);
    }

    const account = await creditAccountRepository.findById(repayment.credit_account_id);
    if (!account) throw new NotFoundError('Credit account');

    if (amount > account.outstanding) {
      throw new ValidationError('Payment amount exceeds outstanding balance');
    }

    const ledgerTx = await creditLedgerService.recordTransaction({
      creditAccountId: account.id,
      type: 'repayment',
      amount,
      description: 'Partial repayment',
      reference: repayment.id,
    });

    await creditRepaymentRepository.updateStatus(
      repaymentId,
      'partial',
      new Date().toISOString(),
      ledgerTx.id,
    );

    await creditRestorationService.restoreCredit(account.id, amount);

    await creditAuditRepository.create({
      userId: account.user_id,
      action: 'repayment',
      previousValue: { outstanding: account.outstanding },
      newValue: { outstanding: account.outstanding - amount },
      reason: `Partial repayment of ₹${amount}`,
      metadata: { repayment_id: repaymentId, amount, partial: true },
    });

    const updatedAccount = await creditAccountRepository.findById(account.id);

    return {
      success: true,
      transactionId: ledgerTx.id,
      remainingBalance: updatedAccount?.outstanding ?? 0,
    };
  }

  async processRazorpayRepayment(
    repaymentId: string,
    gatewayPaymentId: string,
  ): Promise<RepaymentResult> {
    const repayment = await creditRepaymentRepository.findById(repaymentId);
    if (!repayment) throw new NotFoundError('Repayment');

    const result = await this.processFullRepayment(repaymentId);
    if (result.success) {
      await creditRepaymentRepository.updateStatus(
        repaymentId,
        'paid',
        undefined,
        undefined,
        gatewayPaymentId,
      );
    }

    return result;
  }

  getRemainingBalance(outstanding: number, paidAmounts: number[]): number {
    const totalPaid = paidAmounts.reduce((sum, amt) => sum + amt, 0);
    return Math.max(0, outstanding - totalPaid);
  }

  validateOverPayment(amount: number, outstanding: number): void {
    if (amount > outstanding) {
      throw new ValidationError(
        `Payment of ₹${amount} exceeds outstanding balance of ₹${outstanding}`,
      );
    }
  }
}

export const repaymentService = new RepaymentService();
