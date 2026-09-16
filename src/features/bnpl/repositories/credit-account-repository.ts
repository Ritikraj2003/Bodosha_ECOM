import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import type { CreditAccount } from '../types';

const COLUMNS = 'id, user_id, credit_limit, available_credit, outstanding, status, verification_status, credit_score, interest_rate, late_fee_rate, due_days, last_repayment_at, activated_at, created_at, updated_at';

export class CreditAccountRepository {
  async findByUserId(userId: string): Promise<CreditAccount | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('credit_accounts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();
    return data as CreditAccount | null;
  }

  async findById(id: string): Promise<CreditAccount | null> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('credit_accounts')
      .select(COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    return data as CreditAccount | null;
  }

  async create(userId: string, creditLimit: number): Promise<CreditAccount> {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('initialize_credit_account', {
      p_user_id: userId,
      p_credit_limit: creditLimit,
    });
    if (error) throw new Error(error.message);
    return data as unknown as CreditAccount;
  }

  async updateCreditLimit(id: string, newLimit: number): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const account = await this.findById(id);
    if (!account) throw new Error('Credit account not found');
    const diff = newLimit - account.credit_limit;
    const { error } = await supabase
      .from('credit_accounts')
      .update({
        credit_limit: newLimit,
        available_credit: account.available_credit + diff,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async updateVerificationStatus(id: string, status: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const update: Record<string, unknown> = { verification_status: status };
    if (status === 'verified') {
      update.activated_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('credit_accounts')
      .update(update)
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const { error } = await supabase
      .from('credit_accounts')
      .update({ status })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async deductCredit(id: string, amount: number): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.rpc('record_bnpl_purchase', {
      p_credit_account_id: id,
      p_order_id: null,
      p_amount: amount,
    });
    if (error) throw new Error(error.message);
  }

  async restoreCredit(id: string, amount: number): Promise<void> {
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error('No server client');
    const account = await this.findById(id);
    if (!account) throw new Error('Credit account not found');
    const { error } = await supabase
      .from('credit_accounts')
      .update({
        available_credit: account.available_credit + amount,
        outstanding: account.outstanding - amount,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export const creditAccountRepository = new CreditAccountRepository();
