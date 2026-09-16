import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { creditLimitSchema } from '../schemas';
import type { CreditAccount } from '../types';
import { ValidationError } from '@/lib/errors';

const MAX_CREDIT_LIMIT = 50000;

export class CreditLimitService {
  async assignLimit(input: { userId: string; creditLimit: number; reason: string }): Promise<CreditAccount> {
    const parsed = creditLimitSchema.parse(input);
    if (parsed.creditLimit > MAX_CREDIT_LIMIT) {
      throw new ValidationError(`Credit limit cannot exceed ₹${MAX_CREDIT_LIMIT.toLocaleString()}`);
    }
    let account = await creditAccountRepository.findByUserId(parsed.userId);
    if (!account) {
      account = await creditAccountRepository.create(parsed.userId, parsed.creditLimit);
      await creditAuditRepository.create({
        userId: parsed.userId,
        action: 'credit_limit_set',
        newValue: { credit_limit: parsed.creditLimit },
        reason: parsed.reason,
      });
    } else {
      const prevLimit = account.credit_limit;
      await creditAccountRepository.updateCreditLimit(account.id, parsed.creditLimit);
      await creditAuditRepository.create({
        userId: parsed.userId,
        action: 'credit_limit_changed',
        previousValue: { credit_limit: prevLimit },
        newValue: { credit_limit: parsed.creditLimit },
        reason: parsed.reason,
      });
    }
    const updated = await creditAccountRepository.findByUserId(parsed.userId);
    if (!updated) throw new ValidationError('Account not found after update');
    return updated;
  }

  getAvailableCredit(account: CreditAccount): number {
    return account.available_credit;
  }

  getUsedCredit(account: CreditAccount): number {
    return account.outstanding;
  }

  getRemainingCredit(account: CreditAccount): number {
    return account.available_credit;
  }

  getUtilizationPercentage(account: CreditAccount): number {
    if (account.credit_limit <= 0) return 0;
    return Math.round((account.outstanding / account.credit_limit) * 100 * 10) / 10;
  }
}

export const creditLimitService = new CreditLimitService();
