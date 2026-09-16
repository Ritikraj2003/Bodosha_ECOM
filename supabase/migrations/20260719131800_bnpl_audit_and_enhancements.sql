-- ============================================================================
-- BNPL: Credit Audit Logs & Enhanced RPCs for Phase 6
-- ============================================================================

-- 25. Credit Audit Logs (BNPL-specific immutable audit trail)
-- ============================================================================
create table if not exists public.credit_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  action          text not null check (action in (
    'credit_approved','credit_rejected','credit_limit_set','credit_limit_changed',
    'bnpl_purchase','repayment','late_fee_applied','manual_adjustment',
    'repayment_failed','credit_restored','account_suspended','account_activated'
  )),
  previous_value  jsonb,
  new_value       jsonb,
  reason          text,
  ip_address      inet,
  user_agent      text,
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now()
);

create index idx_credit_audit_user on public.credit_audit_logs(user_id, created_at desc);
create index idx_credit_audit_action on public.credit_audit_logs(action);

alter table public.credit_audit_logs enable row level security;

create policy "Users can read own credit audit logs"
  on public.credit_audit_logs for select
  using (user_id = auth.uid());

create policy "Admins can read all credit audit logs"
  on public.credit_audit_logs for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

-- Allow service role to insert audit logs
create policy "Service role can insert audit logs"
  on public.credit_audit_logs for insert
  with check (true);

-- ============================================================================
-- Enhanced: initialize_credit_account with verification support
-- ============================================================================
create or replace function public.initialize_credit_account(
  p_user_id uuid,
  p_credit_limit numeric default 5000,
  p_verification_status text default 'pending'
)
returns public.credit_accounts
language plpgsql security definer
as $$
declare
  v_account public.credit_accounts;
begin
  insert into public.credit_accounts (
    user_id, credit_limit, available_credit, outstanding,
    status, verification_status, due_days
  )
  values (
    p_user_id, p_credit_limit, p_credit_limit, 0,
    'active', p_verification_status, 15
  )
  returning * into v_account;
  return v_account;
end;
$$;

-- ============================================================================
-- Enhanced: process_repayment with partial support
-- ============================================================================
create or replace function public.process_repayment(
  p_repayment_id uuid,
  p_gateway_payment_id text default null,
  p_amount numeric default null
)
returns void
language plpgsql security definer
as $$
declare
  v_repayment public.credit_repayments;
  v_account public.credit_accounts;
  v_tx_id uuid;
  v_actual_amount numeric;
begin
  select * into v_repayment from public.credit_repayments where id = p_repayment_id;
  if not found then
    raise exception 'Repayment not found';
  end if;

  select * into v_account from public.credit_accounts where id = v_repayment.credit_account_id;
  if not found then
    raise exception 'Credit account not found';
  end if;

  v_actual_amount := coalesce(p_amount, v_repayment.amount);

  if v_actual_amount <= 0 then
    raise exception 'Repayment amount must be positive';
  end if;

  if v_actual_amount > v_account.outstanding then
    raise exception 'Repayment amount exceeds outstanding balance';
  end if;

  -- Create transaction record
  insert into public.credit_transactions (
    credit_account_id, type, amount,
    balance_before, balance_after,
    description
  ) values (
    v_account.id, 'repayment', v_actual_amount,
    v_account.outstanding, v_account.outstanding - v_actual_amount,
    'Repayment processed'
  ) returning id into v_tx_id;

  -- Update account
  update public.credit_accounts
  set
    outstanding = outstanding - v_actual_amount,
    available_credit = available_credit + v_actual_amount,
    last_repayment_at = now()
  where id = v_account.id;

  -- Update repayment
  update public.credit_repayments
  set
    status = case when v_actual_amount >= v_repayment.amount then 'paid' else 'partial' end,
    paid_at = now(),
    gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id),
    transaction_id = v_tx_id
  where id = p_repayment_id;
end;
$$;

-- ============================================================================
-- New: apply_late_fee RPC
-- ============================================================================
create or replace function public.apply_late_fee(
  p_credit_account_id uuid,
  p_amount numeric,
  p_description text default 'Late fee applied'
)
returns void
language plpgsql security definer
as $$
declare
  v_account public.credit_accounts;
  v_tx_id uuid;
begin
  select * into v_account from public.credit_accounts where id = p_credit_account_id;
  if not found then
    raise exception 'Credit account not found';
  end if;

  -- Create transaction record
  insert into public.credit_transactions (
    credit_account_id, type, amount,
    balance_before, balance_after,
    description
  ) values (
    p_credit_account_id, 'fee', p_amount,
    v_account.outstanding, v_account.outstanding + p_amount,
    p_description
  ) returning id into v_tx_id;

  -- Update account
  update public.credit_accounts
  set outstanding = outstanding + p_amount
  where id = p_credit_account_id;
end;
$$;

-- ============================================================================
-- New: record_bnpl_purchase RPC
-- ============================================================================
create or replace function public.record_bnpl_purchase(
  p_credit_account_id uuid,
  p_order_id uuid,
  p_amount numeric
)
returns void
language plpgsql security definer
as $$
declare
  v_account public.credit_accounts;
  v_tx_id uuid;
begin
  select * into v_account from public.credit_accounts where id = p_credit_account_id;
  if not found then
    raise exception 'Credit account not found';
  end if;

  if v_account.available_credit < p_amount then
    raise exception 'Insufficient available credit';
  end if;

  -- Create transaction record
  insert into public.credit_transactions (
    credit_account_id, order_id, type, amount,
    balance_before, balance_after,
    description
  ) values (
    p_credit_account_id, p_order_id, 'purchase', p_amount,
    v_account.available_credit, v_account.available_credit - p_amount,
    'BNPL purchase for order'
  ) returning id into v_tx_id;

  -- Update account
  update public.credit_accounts
  set
    available_credit = available_credit - p_amount,
    outstanding = outstanding + p_amount
  where id = p_credit_account_id;
end;
$$;

-- ============================================================================
-- New: get_student_credit_dashboard RPC
-- ============================================================================
create or replace function public.get_student_credit_dashboard(p_user_id uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'account', row_to_json(ca.*)::jsonb,
    'recent_transactions', coalesce(
      (select jsonb_agg(row_to_json(ct.*)::jsonb order by ct.created_at desc)
       from public.credit_transactions ct
       where ct.credit_account_id = ca.id
       limit 10), '[]'::jsonb
    ),
    'upcoming_repayments', coalesce(
      (select jsonb_agg(row_to_json(cr.*)::jsonb order by cr.due_date asc)
       from public.credit_repayments cr
       where cr.credit_account_id = ca.id and cr.status in ('pending','partial')
       limit 5), '[]'::jsonb
    ),
    'overdue_amount', coalesce(
      (select sum(cr.amount - coalesce(
        (select sum(ct2.amount) from public.credit_transactions ct2
         where ct2.reference = cr.id::text and ct2.type = 'repayment'), 0
      ))
       from public.credit_repayments cr
       where cr.credit_account_id = ca.id
       and cr.status in ('pending','partial')
       and cr.due_date < current_date), 0
    ),
    'utilization_percentage', case
      when ca.credit_limit > 0 then round((ca.used_credit / ca.credit_limit) * 100, 1)
      else 0
    end
  ) into v_result
  from public.credit_accounts ca
  where ca.user_id = p_user_id;

  return v_result;
end;
$$;
