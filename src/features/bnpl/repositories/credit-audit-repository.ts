import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import type { CreditAuditLog, CreditAuditAction } from '../types';

const COLUMNS = 'id, user_id, action, previous_value, new_value, reason, ip_address, user_agent, metadata, created_at';

export class CreditAuditRepository {
  async findByUserId(userId: string, limit = 50): Promise<CreditAuditLog[]> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('credit_audit_logs')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as CreditAuditLog[];
  }

  async create(log: {
    userId: string;
    action: CreditAuditAction;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<CreditAuditLog> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const { data, error } = await supabase
      .from('credit_audit_logs')
      .insert({
        user_id: log.userId,
        action: log.action,
        previous_value: log.previousValue || null,
        new_value: log.newValue || null,
        reason: log.reason || null,
        ip_address: log.ipAddress || null,
        user_agent: log.userAgent || null,
        metadata: log.metadata || null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as CreditAuditLog;
  }
}

export const creditAuditRepository = new CreditAuditRepository();
