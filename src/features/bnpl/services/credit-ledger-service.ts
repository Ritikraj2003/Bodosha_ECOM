import { creditTransactionRepository } from '../repositories/credit-transaction-repository';
import { creditAccountRepository } from '../repositories/credit-account-repository';
import type { CreditTransaction, CreditAccount } from '../types';
import { NotFoundError, ValidationError } from '@/lib/errors';

export class CreditLedgerService {
  async recordTransaction(params: {
    creditAccountId: string;
    type: 'purchase' | 'repayment' | 'fee' | 'adjustment' | 'restoration';
    amount: number;
    orderId?: string;
    description?: string;
    reference?: string;
  }): Promise<CreditTransaction> {
    const account = await creditAccountRepository.findById(params.creditAccountId);
    if (!account) throw new NotFoundError('Credit account');

    const balanceBefore = this.getBalanceForType(account, params.type);
    const balanceAfter = this.calculateNewBalance(account, params.type, params.amount);

    const tx = await creditTransactionRepository.create({
      creditAccountId: params.creditAccountId,
      type: params.type,
      amount: params.amount,
      balanceBefore,
      balanceAfter,
      orderId: params.orderId,
      description: params.description,
      reference: params.reference,
    });

    const integrityCheck = this.verifyLedgerIntegrity(account, tx);
    if (!integrityCheck.valid) {
      throw new ValidationError(`Ledger integrity check failed: ${integrityCheck.reason}`);
    }

    return tx;
  }

  private getBalanceForType(account: CreditAccount, type: string): number {
    switch (type) {
      case 'purchase':
      case 'fee':
      case 'adjustment':
        return account.available_credit;
      case 'repayment':
      case 'restoration':
        return account.outstanding;
      default:
        return account.available_credit;
    }
  }

  private calculateNewBalance(account: CreditAccount, type: string, amount: number): number {
    switch (type) {
      case 'purchase':
        return account.available_credit - amount;
      case 'repayment':
        return account.outstanding - amount;
      case 'fee':
        return account.outstanding + amount;
      case 'adjustment':
        return account.available_credit - amount;
      case 'restoration':
        return account.available_credit + amount;
      default:
        return account.available_credit;
    }
  }

  verifyLedgerIntegrity(
    account: CreditAccount,
    transaction: CreditTransaction,
  ): { valid: boolean; reason?: string } {
    if (transaction.balance_before < 0) {
      return { valid: false, reason: 'Balance before cannot be negative' };
    }
    if (transaction.amount <= 0) {
      return { valid: false, reason: 'Transaction amount must be positive' };
    }
    if (transaction.type === 'purchase' && transaction.amount > account.available_credit) {
      return { valid: false, reason: 'Purchase amount exceeds available credit' };
    }
    if (transaction.type === 'repayment' && transaction.amount > account.outstanding) {
      return { valid: false, reason: 'Repayment amount exceeds outstanding balance' };
    }
    return { valid: true };
  }

  async getTransactionHistory(userId: string, limit = 20): Promise<CreditTransaction[]> {
    return creditTransactionRepository.findByUserId(userId, limit);
  }
}

export const creditLedgerService = new CreditLedgerService();
