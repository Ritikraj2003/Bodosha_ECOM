import { dueDateService } from '@/features/bnpl/services/due-date-service';

describe('DueDateService', () => {
  describe('getDaysOverdue', () => {
    it('returns 0 for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const days = dueDateService.getDaysOverdue(futureDate.toISOString().split('T')[0]);
      expect(days).toBe(0);
    });

    it('returns positive days for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const days = dueDateService.getDaysOverdue(pastDate.toISOString().split('T')[0]);
      expect(days).toBeGreaterThanOrEqual(9);
      expect(days).toBeLessThanOrEqual(11);
    });
  });

  describe('isOverdue', () => {
    it('returns false for paid repayments', () => {
      const repayment = {
        id: 'r-1',
        status: 'paid' as const,
        due_date: '2020-01-01',
        amount: 1000,
        credit_account_id: 'acc-1',
        transaction_id: null,
        paid_at: '2020-01-02',
        late_fee_applied: 0,
        payment_method: null,
        gateway_payment_id: null,
        created_at: '2020-01-01',
        updated_at: '2020-01-02',
      };
      expect(dueDateService.isOverdue(repayment)).toBe(false);
    });

    it('returns true for unpaid past-due repayments beyond grace period', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      const repayment = {
        id: 'r-2',
        status: 'pending' as const,
        due_date: oldDate.toISOString().split('T')[0],
        amount: 1000,
        credit_account_id: 'acc-1',
        transaction_id: null,
        paid_at: null,
        late_fee_applied: 0,
        payment_method: null,
        gateway_payment_id: null,
        created_at: oldDate.toISOString(),
        updated_at: oldDate.toISOString(),
      };
      expect(dueDateService.isOverdue(repayment, 3)).toBe(true);
    });

    it('returns false for overdue within grace period', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);
      const repayment = {
        id: 'r-3',
        status: 'pending' as const,
        due_date: recentDate.toISOString().split('T')[0],
        amount: 1000,
        credit_account_id: 'acc-1',
        transaction_id: null,
        paid_at: null,
        late_fee_applied: 0,
        payment_method: null,
        gateway_payment_id: null,
        created_at: recentDate.toISOString(),
        updated_at: recentDate.toISOString(),
      };
      expect(dueDateService.isOverdue(repayment, 5)).toBe(false);
    });
  });
});
