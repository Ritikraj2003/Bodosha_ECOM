import { creditAuditRepository } from '../repositories/credit-audit-repository';
import type { CreditAuditAction, CreditAuditLog } from '../types';

export class AuditService {
  async log(params: {
    userId: string;
    action: CreditAuditAction;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<CreditAuditLog> {
    return creditAuditRepository.create(params);
  }

  async getAuditLogs(userId: string, limit = 50): Promise<CreditAuditLog[]> {
    return creditAuditRepository.findByUserId(userId, limit);
  }

  async logManualAdjustment(params: {
    userId: string;
    previousValue: Record<string, unknown>;
    newValue: Record<string, unknown>;
    reason: string;
    ipAddress?: string;
  }): Promise<CreditAuditLog> {
    return creditAuditRepository.create({
      userId: params.userId,
      action: 'manual_adjustment',
      previousValue: params.previousValue,
      newValue: params.newValue,
      reason: params.reason,
      ipAddress: params.ipAddress || null,
    });
  }

  async logFailedRepayment(params: {
    userId: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditAuditLog> {
    return creditAuditRepository.create({
      userId: params.userId,
      action: 'repayment_failed',
      reason: params.reason,
      metadata: params.metadata || null,
    });
  }
}

export const auditService = new AuditService();
