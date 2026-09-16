import { creditRepaymentRepository } from '../repositories/credit-repayment-repository';
import { creditAccountRepository } from '../repositories/credit-account-repository';
import { dueDateSchema } from '../schemas';
import type { CreditRepayment, RepaymentSchedule } from '../types';
import { NotFoundError } from '@/lib/errors';

export class DueDateService {
  async generateRepaymentSchedule(input: {
    creditAccountId: string;
    orderId: string;
    amount: number;
    dueDays?: number;
  }): Promise<CreditRepayment[]> {
    const parsed = dueDateSchema.parse(input);
    const account = await creditAccountRepository.findById(parsed.creditAccountId);
    if (!account) throw new NotFoundError('Credit account');

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + parsed.dueDays);

    const repayment = await creditRepaymentRepository.create({
      creditAccountId: parsed.creditAccountId,
      amount: parsed.amount,
      dueDate: dueDate.toISOString().split('T')[0],
    });

    return [repayment];
  }

  async getUpcomingRepayments(creditAccountId: string): Promise<CreditRepayment[]> {
    return creditRepaymentRepository.findUpcomingByAccountId(creditAccountId);
  }

  async checkOverdueAccounts(): Promise<CreditRepayment[]> {
    return creditRepaymentRepository.findPendingDue();
  }

  isOverdue(repayment: CreditRepayment, gracePeriodDays = 3): boolean {
    if (repayment.status === 'paid') return false;
    const dueDate = new Date(repayment.due_date);
    const graceDate = new Date(dueDate);
    graceDate.setDate(graceDate.getDate() + gracePeriodDays);
    return new Date() > graceDate;
  }

  getDaysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = now.getTime() - due.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  getRepaymentSchedule(repayments: CreditRepayment[]): RepaymentSchedule[] {
    return repayments.map((r) => ({
      dueDate: r.due_date,
      amount: r.amount,
      status: r.status as RepaymentSchedule['status'],
    }));
  }
}

export const dueDateService = new DueDateService();
