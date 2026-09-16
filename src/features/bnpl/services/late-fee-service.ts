import { dueDateService } from './due-date-service';
import { creditRepaymentRepository } from '../repositories/credit-repayment-repository';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditLedgerService } from './credit-ledger-service';
import type { LateFeeConfig, CreditRepayment } from '../types';
import { ValidationError } from '@/lib/errors';

export class LateFeeService {
  async calculateAndApplyLateFees(
    repayment: CreditRepayment,
    config: LateFeeConfig,
  ): Promise<number> {
    const daysOverdue = dueDateService.getDaysOverdue(repayment.due_date);
    const graceDays = config.gracePeriodDays ?? 3;
    const effectiveOverdueDays = Math.max(0, daysOverdue - graceDays);

    if (effectiveOverdueDays <= 0) return 0;

    const fees: number[] = [];

    if (config.dailyRate) {
      fees.push(config.dailyRate * effectiveOverdueDays);
    }

    if (config.weeklyRate) {
      const weeks = Math.ceil(effectiveOverdueDays / 7);
      fees.push(config.weeklyRate * weeks);
    }

    if (config.percentageRate) {
      fees.push((repayment.amount * config.percentageRate) / 100);
    }

    if (config.fixedAmount) {
      fees.push(config.fixedAmount);
    }

    const totalFee = fees.length > 0 ? Math.max(...fees) : 0;

    if (totalFee <= 0) return 0;

    const cappedFee = config.maxFeeAmount
      ? Math.min(totalFee, config.maxFeeAmount)
      : totalFee;

    const account = await creditAccountRepository.findById(repayment.credit_account_id);
    if (!account) throw new ValidationError('Credit account not found');

    await creditLedgerService.recordTransaction({
      creditAccountId: repayment.credit_account_id,
      type: 'fee',
      amount: cappedFee,
      description: `Late fee: ${effectiveOverdueDays} days overdue`,
      reference: repayment.id,
    });

    await creditRepaymentRepository.applyLateFee(repayment.id, cappedFee);

    await creditAuditRepository.create({
      userId: account.user_id,
      action: 'late_fee_applied',
      previousValue: { late_fee_applied: repayment.late_fee_applied },
      newValue: { late_fee_applied: repayment.late_fee_applied + cappedFee },
      reason: `${effectiveOverdueDays} days overdue at ${config.dailyRate ? `${config.dailyRate}/day` : ''}${config.percentageRate ? ` ${config.percentageRate}%` : ''}`,
      metadata: {
        repayment_id: repayment.id,
        days_overdue: effectiveOverdueDays,
        fee_amount: cappedFee,
      },
    });

    return cappedFee;
  }

  async processAllOverdueFees(config: LateFeeConfig): Promise<number> {
    const overdueRepayments = await creditRepaymentRepository.findPendingDue();
    let totalFees = 0;

    for (const repayment of overdueRepayments) {
      const fee = await this.calculateAndApplyLateFees(repayment, config);
      totalFees += fee;
    }

    return totalFees;
  }
}

export const lateFeeService = new LateFeeService();
