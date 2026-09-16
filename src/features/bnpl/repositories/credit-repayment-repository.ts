import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import type { CreditRepayment } from '../types';

const COLUMNS = 'id, credit_account_id, transaction_id, amount, due_date, paid_at, late_fee_applied, status, payment_method, gateway_payment_id, created_at, updated_at';

export class CreditRepaymentRepository {
  async findByAccountId(accountId: string): Promise<CreditRepayment[]> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('credit_repayments')
      .select(COLUMNS)
      .eq('credit_account_id', accountId)
      .order('due_date', { ascending: true });
    return (data || []) as CreditRepayment[];
  }

  async findById(id: string): Promise<CreditRepayment | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('credit_repayments')
      .select(COLUMNS)
      .eq('id', id)
      .single();
    return data as CreditRepayment | null;
  }

  async findPendingDue(): Promise<CreditRepayment[]> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('credit_repayments')
      .select(COLUMNS)
      .in('status', ['pending', 'partial'])
      .lt('due_date', new Date().toISOString().split('T')[0])
      .order('due_date', { ascending: true });
    return (data || []) as CreditRepayment[];
  }

  async create(repayment: {
    creditAccountId: string;
    amount: number;
    dueDate: string;
  }): Promise<CreditRepayment> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const { data, error } = await supabase
      .from('credit_repayments')
      .insert({
        credit_account_id: repayment.creditAccountId,
        amount: repayment.amount,
        due_date: repayment.dueDate,
        status: 'pending',
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as CreditRepayment;
  }

  async updateStatus(
    id: string,
    status: string,
    paidAt?: string,
    transactionId?: string,
    gatewayPaymentId?: string,
  ): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const update: Record<string, unknown> = { status };
    if (paidAt) update.paid_at = paidAt;
    if (transactionId) update.transaction_id = transactionId;
    if (gatewayPaymentId) update.gateway_payment_id = gatewayPaymentId;
    const { error } = await supabase
      .from('credit_repayments')
      .update(update)
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async applyLateFee(id: string, lateFee: number): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const repayment = await this.findById(id);
    if (!repayment) throw new Error('Repayment not found');
    const { error } = await supabase
      .from('credit_repayments')
      .update({ late_fee_applied: repayment.late_fee_applied + lateFee })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async findUpcomingByAccountId(accountId: string): Promise<CreditRepayment[]> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('credit_repayments')
      .select(COLUMNS)
      .eq('credit_account_id', accountId)
      .in('status', ['pending', 'partial'])
      .order('due_date', { ascending: true })
      .limit(5);
    return (data || []) as CreditRepayment[];
  }
}

export const creditRepaymentRepository = new CreditRepaymentRepository();
