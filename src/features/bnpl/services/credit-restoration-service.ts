import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { creditLedgerService } from './credit-ledger-service';
import { NotFoundError, ValidationError } from '@/lib/errors';

export class CreditRestorationService {
  async restoreCredit(creditAccountId: string, amount: number): Promise<void> {
    const account = await creditAccountRepository.findById(creditAccountId);
    if (!account) throw new NotFoundError('Credit account');

    if (amount <= 0) {
      throw new ValidationError('Restoration amount must be positive');
    }

    if (account.outstanding < amount) {
      throw new ValidationError(
        `Cannot restore ₹${amount}: only ₹${account.outstanding} outstanding`,
      );
    }

    const newAvailable = account.available_credit + amount;
    const newOutstanding = account.outstanding - amount;

    await creditLedgerService.recordTransaction({
      creditAccountId,
      type: 'restoration',
      amount,
      description: 'Credit restored after repayment',
    });

    await creditAuditRepository.create({
      userId: account.user_id,
      action: 'credit_restored',
      previousValue: {
        available_credit: account.available_credit,
        outstanding: account.outstanding,
      },
      newValue: {
        available_credit: newAvailable,
        outstanding: newOutstanding,
      },
      reason: `Credit restored: ₹${amount}`,
      metadata: { restored_amount: amount },
    });
  }
}

export const creditRestorationService = new CreditRestorationService();
