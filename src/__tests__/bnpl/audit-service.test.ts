import { vi } from 'vitest';

vi.mock('@/features/bnpl/repositories/credit-audit-repository', () => ({
  creditAuditRepository: {
    create: vi.fn(),
    findByUserId: vi.fn(),
  },
}));

import { auditService } from '@/features/bnpl/services/audit-service';
import { creditAuditRepository } from '@/features/bnpl/repositories/credit-audit-repository';

const mockAuditEntry = {
  id: 'audit-1',
  user_id: 'user-1',
  action: 'bnpl_purchase',
  previous_value: null,
  new_value: { amount: 1000 },
  reason: 'Test purchase',
  ip_address: null,
  user_agent: null,
  metadata: null,
  created_at: new Date().toISOString(),
};

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs an audit entry', async () => {
    vi.mocked(creditAuditRepository.create).mockResolvedValue(mockAuditEntry);

    const result = await auditService.log({
      userId: 'user-1',
      action: 'bnpl_purchase',
      newValue: { amount: 1000 },
      reason: 'Test purchase',
    });

    expect(result.id).toBe('audit-1');
    expect(creditAuditRepository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'bnpl_purchase',
      previousValue: undefined,
      newValue: { amount: 1000 },
      reason: 'Test purchase',
      ipAddress: undefined,
      userAgent: undefined,
      metadata: undefined,
    });
  });

  it('retrieves audit logs for a user', async () => {
    vi.mocked(creditAuditRepository.findByUserId).mockResolvedValue([mockAuditEntry]);

    const logs = await auditService.getAuditLogs('user-1');

    expect(logs).toHaveLength(1);
    expect(creditAuditRepository.findByUserId).toHaveBeenCalledWith('user-1', 50);
  });

  it('respects custom limit when retrieving logs', async () => {
    vi.mocked(creditAuditRepository.findByUserId).mockResolvedValue([]);

    await auditService.getAuditLogs('user-1', 10);

    expect(creditAuditRepository.findByUserId).toHaveBeenCalledWith('user-1', 10);
  });

  it('logs manual adjustment', async () => {
    vi.mocked(creditAuditRepository.create).mockResolvedValue({
      ...mockAuditEntry,
      action: 'manual_adjustment',
    });

    const result = await auditService.logManualAdjustment({
      userId: 'user-1',
      previousValue: { credit_limit: 5000 },
      newValue: { credit_limit: 10000 },
      reason: 'Admin adjustment',
    });

    expect(result.action).toBe('manual_adjustment');
    expect(creditAuditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manual_adjustment',
        reason: 'Admin adjustment',
      }),
    );
  });

  it('logs failed repayment', async () => {
    vi.mocked(creditAuditRepository.create).mockResolvedValue({
      ...mockAuditEntry,
      action: 'repayment_failed',
    });

    const result = await auditService.logFailedRepayment({
      userId: 'user-1',
      reason: 'Insufficient balance',
    });

    expect(result.action).toBe('repayment_failed');
    expect(creditAuditRepository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'repayment_failed',
      reason: 'Insufficient balance',
      metadata: null,
    });
  });
});
