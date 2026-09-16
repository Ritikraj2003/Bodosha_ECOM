import { vi } from 'vitest';

vi.mock('@/features/bnpl/services/due-date-service', () => ({
  dueDateService: {
    getDaysOverdue: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-account-repository', () => ({
  creditAccountRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-repayment-repository', () => ({
  creditRepaymentRepository: {
    applyLateFee: vi.fn(),
    findPendingDue: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/services/credit-ledger-service', () => ({
  creditLedgerService: {
    recordTransaction: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-audit-repository', () => ({
  creditAuditRepository: {
    create: vi.fn(),
  },
}));

import { lateFeeService } from '@/features/bnpl/services/late-fee-service';
import { dueDateService } from '@/features/bnpl/services/due-date-service';
import { creditAccountRepository } from '@/features/bnpl/repositories/credit-account-repository';
import { creditRepaymentRepository } from '@/features/bnpl/repositories/credit-repayment-repository';
import { creditLedgerService } from '@/features/bnpl/services/credit-ledger-service';

const mockRepayment = {
  id: 'rp-1',
  credit_account_id: 'acc-1',
  amount: 5000,
  due_date: '2026-06-15',
  status: 'pending' as const,
  transaction_id: null,
  paid_at: null,
  late_fee_applied: 0,
  payment_method: null,
  gateway_payment_id: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const mockAccount = {
  id: 'acc-1',
  user_id: 'user-1',
  credit_limit: 10000,
  available_credit: 5000,
  outstanding: 5000,
  status: 'active' as const,
  verification_status: 'verified' as const,
  credit_score: null,
  interest_rate: 0,
  late_fee_rate: 2,
  due_days: 15,
  last_repayment_at: null,
  activated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

describe('LateFeeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateAndApplyLateFees', () => {
    it('returns 0 when repayment is within grace period', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(1);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(fee).toBe(0);
    });

    it('returns 0 when repayment is exactly on due date', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(0);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(fee).toBe(0);
    });

    it('calculates daily rate fee for overdue repayment', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(10);
      vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(fee).toBe(70); // (10 - 3) * 10 = 70
      expect(creditLedgerService.recordTransaction).toHaveBeenCalled();
      expect(creditRepaymentRepository.applyLateFee).toHaveBeenCalledWith('rp-1', 70);
    });

    it('applies the maximum of all configured fee types', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(10);
      vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 10,        // (10-3)*10 = 70
        weeklyRate: 50,       // ceil(7/7)*50 = 50
        percentageRate: 2,    // 5000*2/100 = 100
        fixedAmount: 200,     // 200
      });

      expect(fee).toBe(200); // max(70, 50, 100, 200) = 200
    });

    it('caps fee at maxFeeAmount', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(30);
      vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 50,       // (30-3)*50 = 1350
        maxFeeAmount: 500,
      });

      expect(fee).toBe(500);
    });

    it('processes zero-amount repayment without charging fee', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(5);

      const fee = await lateFeeService.calculateAndApplyLateFees(
        { ...mockRepayment, amount: 0 },
        { gracePeriodDays: 3, percentageRate: 5 },
      );

      expect(fee).toBe(0);
    });

    it('charges a fee even for 1 day overdue (past grace period)', async () => {
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(4);
      vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

      const fee = await lateFeeService.calculateAndApplyLateFees(mockRepayment, {
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(fee).toBe(10); // (4-3) * 10 = 10
    });
  });

  describe('processAllOverdueFees', () => {
    it('processes all overdue repayments and returns total fees', async () => {
      vi.mocked(creditRepaymentRepository.findPendingDue).mockResolvedValue([
        mockRepayment,
        { ...mockRepayment, id: 'rp-2', amount: 3000 },
      ]);
      vi.mocked(dueDateService.getDaysOverdue).mockReturnValue(10);
      vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

      const total = await lateFeeService.processAllOverdueFees({
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(total).toBe(140); // 70 + 70
    });

    it('returns 0 when no overdue repayments', async () => {
      vi.mocked(creditRepaymentRepository.findPendingDue).mockResolvedValue([]);

      const total = await lateFeeService.processAllOverdueFees({
        gracePeriodDays: 3,
        dailyRate: 10,
      });

      expect(total).toBe(0);
    });
  });
});
