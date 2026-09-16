import { vi } from 'vitest';

vi.mock('@/features/bnpl/services/credit-verification-service', () => ({
  creditVerificationService: {
    checkEligibility: vi.fn(),
    verifyStudent: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/services/credit-ledger-service', () => ({
  creditLedgerService: {
    recordTransaction: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/services/due-date-service', () => ({
  dueDateService: {
    generateRepaymentSchedule: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-account-repository', () => ({
  creditAccountRepository: {
    deductCredit: vi.fn(),
    findByUserId: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-audit-repository', () => ({
  creditAuditRepository: {
    create: vi.fn(),
  },
}));

import { bnplCheckoutService } from '@/features/bnpl/services/bnpl-checkout-service';
import { creditVerificationService } from '@/features/bnpl/services/credit-verification-service';
import { creditLedgerService } from '@/features/bnpl/services/credit-ledger-service';
import { dueDateService } from '@/features/bnpl/services/due-date-service';
import { creditAccountRepository } from '@/features/bnpl/repositories/credit-account-repository';

const validInput = {
  orderId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  amount: 1000,
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

describe('BNPLCheckoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndProcessCheckout', () => {
    it('completes checkout for eligible verified active account', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: true,
        account: mockAccount,
      });
      vi.mocked(creditLedgerService.recordTransaction).mockResolvedValue({
        id: 'tx-1',
        credit_account_id: 'acc-1',
        order_id: null,
        type: 'purchase',
        amount: 1000,
        balance_before: 5000,
        balance_after: 4000,
        description: null,
        reference: null,
        created_at: new Date().toISOString(),
      });

      const result = await bnplCheckoutService.validateAndProcessCheckout(validInput);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(validInput.orderId);
      expect(result.transactionId).toBe('tx-1');
      expect(creditAccountRepository.deductCredit).toHaveBeenCalledWith('acc-1', 1000);
      expect(dueDateService.generateRepaymentSchedule).toHaveBeenCalled();
    });

    it('throws when not eligible for BNPL', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: false,
        reason: 'Account is suspended',
      });

      await expect(bnplCheckoutService.validateAndProcessCheckout(validInput)).rejects.toThrow(
        'Account is suspended',
      );
    });

    it('throws when account is not verified', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: true,
        account: { ...mockAccount, verification_status: 'rejected' as const },
      });

      await expect(bnplCheckoutService.validateAndProcessCheckout(validInput)).rejects.toThrow(
        'not verified',
      );
    });

    it('throws when account is not active', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: true,
        account: { ...mockAccount, status: 'frozen' as const },
      });

      await expect(bnplCheckoutService.validateAndProcessCheckout(validInput)).rejects.toThrow(
        'not active',
      );
    });

    it('throws when insufficient available credit', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: true,
        account: { ...mockAccount, available_credit: 500 },
      });

      await expect(bnplCheckoutService.validateAndProcessCheckout(validInput)).rejects.toThrow(
        'Insufficient credit',
      );
    });

    it('throws for invalid input (missing orderId)', async () => {
      await expect(
        bnplCheckoutService.validateAndProcessCheckout({
          orderId: '',
          userId: validInput.userId,
          amount: 1000,
        }),
      ).rejects.toThrow();
    });

    it('creates account via verifyStudent when no existing account', async () => {
      vi.mocked(creditVerificationService.checkEligibility).mockResolvedValue({
        eligible: true,
        account: null,
      });
      vi.mocked(creditVerificationService.verifyStudent).mockResolvedValue(mockAccount);
      vi.mocked(creditLedgerService.recordTransaction).mockResolvedValue({
        id: 'tx-2',
        credit_account_id: 'acc-1',
        order_id: null,
        type: 'purchase',
        amount: 1000,
        balance_before: 5000,
        balance_after: 4000,
        description: null,
        reference: null,
        created_at: new Date().toISOString(),
      });

      const result = await bnplCheckoutService.validateAndProcessCheckout(validInput);

      expect(result.success).toBe(true);
      expect(creditVerificationService.verifyStudent).toHaveBeenCalledWith(validInput.userId);
    });
  });

  describe('checkAvailableCredit', () => {
    it('returns credit info when account exists', async () => {
      vi.mocked(creditAccountRepository.findByUserId).mockResolvedValue(mockAccount);

      const result = await bnplCheckoutService.checkAvailableCredit('user-1');

      expect(result.available).toBe(5000);
      expect(result.limit).toBe(10000);
      expect(result.outstanding).toBe(5000);
      expect(result.sufficient).toBe(true);
    });

    it('returns zeroes when no account', async () => {
      vi.mocked(creditAccountRepository.findByUserId).mockResolvedValue(null);

      const result = await bnplCheckoutService.checkAvailableCredit('unknown-user');

      expect(result.available).toBe(0);
      expect(result.limit).toBe(0);
      expect(result.outstanding).toBe(0);
      expect(result.sufficient).toBe(false);
    });
  });
});
