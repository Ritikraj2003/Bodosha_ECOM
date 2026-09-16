-- ============================================================================
-- Phase 8: System Settings Table & Admin Enhancements
-- ============================================================================

-- 26. System Settings (key-value store for dynamic configuration)
-- ============================================================================
create table if not exists public.system_settings (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  value         text not null,
  type          text not null default 'string' check (type in ('string','number','boolean','json')),
  description   text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

create index idx_system_settings_key on public.system_settings(key);

alter table public.system_settings enable row level security;

create policy "Admins can read system settings"
  on public.system_settings for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Admins can insert system settings"
  on public.system_settings for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Admins can update system settings"
  on public.system_settings for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Admins can delete system settings"
  on public.system_settings for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

-- Seed default system settings
insert into public.system_settings (key, value, type, description) values
  ('late_fee_percentage', '5', 'number', 'Percentage of outstanding balance charged as late fee per period'),
  ('late_fee_type', 'percentage', 'string', 'Type of late fee: percentage or fixed'),
  ('grace_period_days', '3', 'number', 'Days after due date before late fee applies'),
  ('max_credit_limit', '50000', 'number', 'Maximum credit limit for BNPL accounts'),
  ('min_credit_limit', '1000', 'number', 'Minimum credit limit for BNPL accounts'),
  ('student_eligibility_min_age', '18', 'number', 'Minimum age for student BNPL eligibility'),
  ('student_eligibility_verified_email', 'true', 'boolean', 'Require verified email for BNPL'),
  ('merchant_commission_percentage', '5', 'number', 'Default commission percentage charged to merchants'),
  ('tax_percentage', '5', 'number', 'Default tax percentage on orders'),
  ('platform_fee_per_order', '0', 'number', 'Fixed platform fee per order'),
  ('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode for the platform'),
  ('order_timeout_minutes', '30', 'number', 'Minutes before pending orders are auto-cancelled'),
  ('inventory_threshold', '5', 'number', 'Stock level that triggers low inventory alert'),
  ('notify_admin_on_new_merchant', 'true', 'boolean', 'Send notification when new merchant registers'),
  ('notify_admin_on_new_order', 'true', 'boolean', 'Send notification on new orders')
on conflict (key) do nothing;

-- ============================================================================
-- Enhanced: get_admin_dashboard RPC for aggregating dashboard metrics
-- ============================================================================
create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql security definer
as $$
declare
  v_result jsonb;
  v_today date := current_date;
  v_week_start date := date_trunc('week', current_date)::date;
  v_month_start date := date_trunc('month', current_date)::date;
begin
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles where deleted_at is null),
    'total_students', (select count(*) from public.profiles where role = 'student' and deleted_at is null),
    'total_merchants', (select count(*) from public.profiles where role = 'merchant' and deleted_at is null),
    'total_restaurants', (select count(*) from public.restaurants where deleted_at is null),
    'total_orders', (select count(*) from public.orders where deleted_at is null),
    'active_orders', (select count(*) from public.orders where status not in ('completed','cancelled','delivered') and deleted_at is null),
    'completed_orders', (select count(*) from public.orders where status in ('completed','delivered') and deleted_at is null),
    'cancelled_orders', (select count(*) from public.orders where status = 'cancelled' and deleted_at is null),
    'total_revenue', coalesce((select sum(total) from public.orders where status in ('completed','delivered') and deleted_at is null), 0),
    'today_revenue', coalesce((select sum(total) from public.orders where status in ('completed','delivered') and created_at::date = v_today and deleted_at is null), 0),
    'weekly_revenue', coalesce((select sum(total) from public.orders where status in ('completed','delivered') and created_at::date >= v_week_start and deleted_at is null), 0),
    'monthly_revenue', coalesce((select sum(total) from public.orders where status in ('completed','delivered') and created_at::date >= v_month_start and deleted_at is null), 0),
    'bnpl_outstanding', coalesce((select sum(outstanding) from public.credit_accounts where deleted_at is null), 0),
    'total_credit_issued', coalesce((select sum(credit_limit) from public.credit_accounts where deleted_at is null), 0),
    'total_credit_repaid', coalesce((select sum(amount) from public.credit_transactions where type = 'repayment'), 0),
    'total_overdue_accounts', (select count(distinct ca.id) from public.credit_accounts ca join public.credit_repayments cr on cr.credit_account_id = ca.id where cr.due_date < current_date and cr.status = 'pending' and ca.deleted_at is null),
    'active_merchants', (select count(distinct r.owner_id) from public.restaurants r where r.status = 'active' and r.deleted_at is null),
    'pending_merchant_approvals', (select count(*) from public.restaurants where status = 'pending' and deleted_at is null),
    'recent_activity', coalesce((
      select jsonb_agg(sub.x)
      from (
        select jsonb_build_object(
          'id', al.id,
          'action', al.action,
          'entity_type', al.table_name,
          'entity_id', al.record_id,
          'user_name', coalesce(p.full_name, 'System'),
          'created_at', al.created_at
        ) as x
        from public.audit_logs al
        left join public.profiles p on p.id = al.changed_by
        order by al.created_at desc
        limit 10
      ) sub
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================================
-- Enhanced: get_admin_audit_logs RPC with search and pagination
-- ============================================================================
create or replace function public.get_admin_audit_logs(
  p_search text default null,
  p_table_name text default null,
  p_action text default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_page int default 1,
  p_page_size int default 50
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_offset int := (p_page - 1) * p_page_size;
  v_result jsonb;
begin
  with filtered as (
    select al.*, p.full_name as changed_by_name
    from public.audit_logs al
    left join public.profiles p on p.id = al.changed_by
    where (p_search is null or
      al.table_name ilike '%' || p_search || '%' or
      al.action ilike '%' || p_search || '%' or
      al.record_id::text ilike '%' || p_search || '%' or
      coalesce(p.full_name, '') ilike '%' || p_search || '%')
    and (p_table_name is null or al.table_name = p_table_name)
    and (p_action is null or al.action = p_action)
    and (p_from_date is null or al.created_at >= p_from_date)
    and (p_to_date is null or al.created_at <= p_to_date)
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(row_to_json(f.*)::jsonb order by f.created_at desc) from (select * from filtered order by created_at desc limit p_page_size offset v_offset) f), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', p_page,
    'pageSize', p_page_size,
    'totalPages', ceil((select count(*) from filtered)::numeric / p_page_size)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================================
-- RLS: Add admin full access policies for system_settings
-- ============================================================================

-- Already defined above with the table

-- ============================================================================
-- Credit audit logs: Add more supported actions
-- ============================================================================
-- Note: To add new action types to credit_audit_logs, alter the check constraint:
-- ALTER TABLE public.credit_audit_logs DROP CONSTRAINT IF EXISTS credit_audit_logs_action_check;
-- ALTER TABLE public.credit_audit_logs ADD CONSTRAINT credit_audit_logs_action_check
--   CHECK (action IN (
--     'credit_approved','credit_rejected','credit_limit_set','credit_limit_changed',
--     'bnpl_purchase','repayment','late_fee_applied','manual_adjustment',
--     'repayment_failed','credit_restored','account_suspended','account_activated',
--     'credit_frozen','credit_unfrozen','late_fee_waived','admin_adjustment'
--   ));

-- ============================================================================
-- Add admin order_override action to existing orders status_history constraint
-- ============================================================================
-- The orders table already uses jsonb for status_history, so no schema change needed.
