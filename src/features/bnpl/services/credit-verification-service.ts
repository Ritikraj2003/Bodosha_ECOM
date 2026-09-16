import { creditAccountRepository } from '../repositories/credit-account-repository';
import { creditAuditRepository } from '../repositories/credit-audit-repository';
import { creditVerificationSchema } from '../schemas';
import type { CreditAccount } from '../types';
import { ValidationError } from '@/lib/errors';

export class CreditVerificationService {
  async verifyStudent(userId: string): Promise<CreditAccount> {
    let account = await creditAccountRepository.findByUserId(userId);
    if (!account) {
      account = await creditAccountRepository.create(userId, 5000);
    }
    return account;
  }

  async checkEligibility(userId: string): Promise<{
    eligible: boolean;
    reason?: string;
    account?: CreditAccount;
  }> {
    const account = await creditAccountRepository.findByUserId(userId);
    if (!account) {
      return { eligible: true, reason: 'New user, account can be created' };
    }
    if (account.verification_status === 'rejected') {
      return { eligible: false, reason: 'Credit verification was rejected', account };
    }
    if (account.status === 'suspended') {
      return { eligible: false, reason: 'Account is suspended', account };
    }
    if (account.status === 'closed') {
      return { eligible: false, reason: 'Account is closed', account };
    }
    return { eligible: true, account };
  }

  async approveCredit(input: { userId: string; reason?: string }): Promise<CreditAccount> {
    const parsed = creditVerificationSchema.parse({
      ...input,
      verificationStatus: 'verified',
    });
    const account = await creditAccountRepository.findByUserId(parsed.userId);
    if (!account) {
      throw new ValidationError('No credit account found for this user');
    }
    const prevStatus = account.verification_status;
    await creditAccountRepository.updateVerificationStatus(account.id, 'verified');
    await creditAuditRepository.create({
      userId: parsed.userId,
      action: 'credit_approved',
      previousValue: { verification_status: prevStatus },
      newValue: { verification_status: 'verified' },
      reason: parsed.reason || 'Manual approval',
    });
    const updated = await creditAccountRepository.findById(account.id);
    if (!updated) throw new ValidationError('Account not found after update');
    return updated;
  }

  async rejectCredit(input: { userId: string; reason: string }): Promise<CreditAccount> {
    const parsed = creditVerificationSchema.parse({
      ...input,
      verificationStatus: 'rejected',
    });
    const account = await creditAccountRepository.findByUserId(parsed.userId);
    if (!account) {
      throw new ValidationError('No credit account found for this user');
    }
    const prevStatus = account.verification_status;
    await creditAccountRepository.updateVerificationStatus(account.id, 'rejected');
    await creditAuditRepository.create({
      userId: parsed.userId,
      action: 'credit_rejected',
      previousValue: { verification_status: prevStatus },
      newValue: { verification_status: 'rejected' },
      reason: parsed.reason,
    });
    const updated = await creditAccountRepository.findById(account.id);
    if (!updated) throw new ValidationError('Account not found after update');
    return updated;
  }
}

export const creditVerificationService = new CreditVerificationService();
