import { creditLedgerService } from '@/features/bnpl/services/credit-ledger-service';
import type { CreditAccount, CreditTransaction } from '@/features/bnpl/types';

function makeAccount(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: 'acc-1',
    user_id: 'user-1',
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

function makeTransaction(overrides: Partial<CreditTransaction> = {}): CreditTransaction {
  return {
    id: 'tx-1',
    credit_account_id: 'acc-1',
    order_id: null,
    type: 'purchase',
    amount: 1000,
    balance_before: 7000,
    balance_after: 6000,
    description: null,
    reference: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('CreditLedgerService - Integrity Checks', () => {
  it('validates a proper purchase transaction', () => {
    const account = makeAccount();
    const tx = makeTransaction({ type: 'purchase', amount: 1000, balance_before: 7000, balance_after: 6000 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(true);
  });

  it('rejects transaction with negative balance_before', () => {
    const account = makeAccount();
    const tx = makeTransaction({ balance_before: -100 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Balance before cannot be negative');
  });

  it('rejects transaction with zero amount', () => {
    const account = makeAccount();
    const tx = makeTransaction({ amount: 0 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(false);
  });

  it('rejects purchase exceeding available credit', () => {
    const account = makeAccount({ available_credit: 500 });
    const tx = makeTransaction({ type: 'purchase', amount: 1000 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Purchase amount exceeds available credit');
  });

  it('rejects repayment exceeding outstanding balance', () => {
    const account = makeAccount({ outstanding: 500 });
    const tx = makeTransaction({ type: 'repayment', amount: 1000 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Repayment amount exceeds outstanding balance');
  });

  it('validates a proper repayment', () => {
    const account = makeAccount({ outstanding: 5000 });
    const tx = makeTransaction({ type: 'repayment', amount: 2000, balance_before: 5000, balance_after: 3000 });
    const result = creditLedgerService.verifyLedgerIntegrity(account, tx);
    expect(result.valid).toBe(true);
  });
});
