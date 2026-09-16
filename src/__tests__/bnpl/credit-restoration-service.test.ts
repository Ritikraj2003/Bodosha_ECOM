import { vi } from 'vitest';

vi.mock('@/features/bnpl/repositories/credit-account-repository', () => ({
  creditAccountRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-audit-repository', () => ({
  creditAuditRepository: {
    create: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/services/credit-ledger-service', () => ({
  creditLedgerService: {
    recordTransaction: vi.fn(),
  },
}));

import { creditRestorationService } from '@/features/bnpl/services/credit-restoration-service';
import { creditAccountRepository } from '@/features/bnpl/repositories/credit-account-repository';

const mockAccount = {
  id: 'acc-1',
  user_id: 'user-1',
  credit_limit: 10000,
  available_credit: 2000,
  outstanding: 8000,
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

describe('CreditRestorationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores credit after repayment', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

    await creditRestorationService.restoreCredit('acc-1', 3000);

    expect(creditAccountRepository.findById).toHaveBeenCalledWith('acc-1');
  });

  it('throws NotFoundError when account does not exist', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(null);

    await expect(creditRestorationService.restoreCredit('nonexistent', 1000)).rejects.toThrow(
      'not found',
    );
  });

  it('throws ValidationError when amount is zero', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

    await expect(creditRestorationService.restoreCredit('acc-1', 0)).rejects.toThrow(
      'must be positive',
    );
  });

  it('throws ValidationError when amount is negative', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

    await expect(creditRestorationService.restoreCredit('acc-1', -500)).rejects.toThrow(
      'must be positive',
    );
  });

  it('throws ValidationError when amount exceeds outstanding', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

    await expect(creditRestorationService.restoreCredit('acc-1', 9999)).rejects.toThrow(
      'Cannot restore',
    );
  });

  it('restores full outstanding amount correctly', async () => {
    vi.mocked(creditAccountRepository.findById).mockResolvedValue(mockAccount);

    await creditRestorationService.restoreCredit('acc-1', 8000);

    expect(creditAccountRepository.findById).toHaveBeenCalledWith('acc-1');
  });
});
