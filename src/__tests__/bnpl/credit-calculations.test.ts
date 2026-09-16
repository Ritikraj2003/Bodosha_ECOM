import { creditLimitService } from '@/features/bnpl/services/credit-limit-service';
import type { CreditAccount } from '@/features/bnpl/types';

function makeAccount(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: 'test-id',
    user_id: 'user-id',
    credit_limit: 10000,
    available_credit: 7000,
    outstanding: 3000,
    status: 'active',
    verification_status: 'verified',
    credit_score: null,
    interest_rate: 0,
    late_fee_rate: 2,
    due_days: 15,
    last_repayment_at: null,
    activated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

describe('CreditLimitService', () => {
  it('returns available credit', () => {
    const account = makeAccount({ available_credit: 5000, outstanding: 5000 });
    expect(creditLimitService.getAvailableCredit(account)).toBe(5000);
  });

  it('returns used credit', () => {
    const account = makeAccount({ outstanding: 7500 });
    expect(creditLimitService.getUsedCredit(account)).toBe(7500);
  });

  it('returns remaining credit', () => {
    const account = makeAccount({ available_credit: 4000 });
    expect(creditLimitService.getRemainingCredit(account)).toBe(4000);
  });

  it('calculates utilization percentage', () => {
    const account = makeAccount({ outstanding: 2500, credit_limit: 10000 });
    expect(creditLimitService.getUtilizationPercentage(account)).toBe(25);
  });

  it('returns 0 utilization when limit is 0', () => {
    const account = makeAccount({ outstanding: 0, credit_limit: 0 });
    expect(creditLimitService.getUtilizationPercentage(account)).toBe(0);
  });

  it('returns 100 utilization when fully used', () => {
    const account = makeAccount({ outstanding: 10000, credit_limit: 10000, available_credit: 0 });
    expect(creditLimitService.getUtilizationPercentage(account)).toBe(100);
  });
});
