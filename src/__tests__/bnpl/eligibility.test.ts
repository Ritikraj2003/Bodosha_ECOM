import { creditVerificationService } from '@/features/bnpl/services/credit-verification-service';

import { vi } from 'vitest';

vi.mock('@/features/bnpl/repositories/credit-account-repository', () => ({
  creditAccountRepository: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    updateVerificationStatus: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('@/features/bnpl/repositories/credit-audit-repository', () => ({
  creditAuditRepository: {
    create: vi.fn(),
  },
}));

import { creditAccountRepository } from '@/features/bnpl/repositories/credit-account-repository';

describe('CreditVerificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns eligible for new users with no account', async () => {
    (creditAccountRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await creditVerificationService.checkEligibility('new-user');
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('New user, account can be created');
  });

  it('returns not eligible for rejected accounts', async () => {
    (creditAccountRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      user_id: 'user-1',
      verification_status: 'rejected',
      status: 'active',
    });
    const result = await creditVerificationService.checkEligibility('user-1');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Credit verification was rejected');
  });

  it('returns not eligible for suspended accounts', async () => {
    (creditAccountRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      user_id: 'user-1',
      verification_status: 'verified',
      status: 'suspended',
    });
    const result = await creditVerificationService.checkEligibility('user-1');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Account is suspended');
  });

  it('returns not eligible for closed accounts', async () => {
    (creditAccountRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      user_id: 'user-1',
      verification_status: 'verified',
      status: 'closed',
    });
    const result = await creditVerificationService.checkEligibility('user-1');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Account is closed');
  });

  it('returns eligible for verified active accounts', async () => {
    (creditAccountRepository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      user_id: 'user-1',
      verification_status: 'verified',
      status: 'active',
    });
    const result = await creditVerificationService.checkEligibility('user-1');
    expect(result.eligible).toBe(true);
  });
});
