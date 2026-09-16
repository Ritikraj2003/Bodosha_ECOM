import { repaymentService } from '@/features/bnpl/services/repayment-service';

describe('RepaymentService', () => {
  describe('getRemainingBalance', () => {
    it('returns full outstanding when no payments made', () => {
      const remaining = repaymentService.getRemainingBalance(5000, []);
      expect(remaining).toBe(5000);
    });

    it('subtracts paid amounts from outstanding', () => {
      const remaining = repaymentService.getRemainingBalance(5000, [1000, 2000]);
      expect(remaining).toBe(2000);
    });

    it('returns 0 when overpaid', () => {
      const remaining = repaymentService.getRemainingBalance(3000, [2000, 1500]);
      expect(remaining).toBe(0);
    });

    it('handles single payment correctly', () => {
      const remaining = repaymentService.getRemainingBalance(10000, [5000]);
      expect(remaining).toBe(5000);
    });
  });

  describe('validateOverPayment', () => {
    it('does not throw when amount equals outstanding', () => {
      expect(() => repaymentService.validateOverPayment(5000, 5000)).not.toThrow();
    });

    it('does not throw when amount is less than outstanding', () => {
      expect(() => repaymentService.validateOverPayment(3000, 5000)).not.toThrow();
    });

    it('throws when amount exceeds outstanding', () => {
      expect(() => repaymentService.validateOverPayment(6000, 5000)).toThrow();
    });
  });
});
