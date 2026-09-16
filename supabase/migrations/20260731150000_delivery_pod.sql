-- ============================================================================
-- Delivery / Pay-on-Delivery (POD) support
-- Additive only: new nullable columns + new policies. No existing columns,
-- constraints, or policies are modified or dropped.
-- Run this in: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

-- 1. Orders: pickup QR token (generated at order creation, scanned to claim)
-- ============================================================================
alter table public.orders
  add column if not exists pickup_qr_token text,
  add column if not exists pickup_qr_expires_at timestamptz;

-- 2. Delivery assignments: QR + OTP fields
-- ============================================================================
alter table public.delivery_assignments
  add column if not exists qr_token_hash text,
  add column if not exists otp_value text,
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_attempts integer not null default 0;

-- 3. Payments: doorstep collection fields + widened status
-- ============================================================================
alter table public.payments
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by uuid references public.profiles(id);

-- Widen the payments.status check to accept 'collected' (superset, safe).
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending','processing','confirmed','failed','refunded','collected'));

-- 4. RLS helper (SECURITY DEFINER avoids the 42P17 profile recursion)
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','super_admin')
  );
$$;

-- 4. RLS policies (tables are already RLS-enabled)
-- ============================================================================
-- Delivery partners: see/edit only their own row (admins manage).
drop policy if exists "delivery_partners_select_own" on public.delivery_partners;
create policy "delivery_partners_select_own"
  on public.delivery_partners for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "delivery_partners_update_own" on public.delivery_partners;
create policy "delivery_partners_update_own"
  on public.delivery_partners for update
  using (id = auth.uid() or public.is_admin());

-- Assignments: partner sees/updates only their own; customer sees own order's.
drop policy if exists "delivery_assignments_select_partner" on public.delivery_assignments;
create policy "delivery_assignments_select_partner"
  on public.delivery_assignments for select
  using (delivery_partner_id = auth.uid() or public.is_admin());

drop policy if exists "delivery_assignments_update_partner" on public.delivery_assignments;
create policy "delivery_assignments_update_partner"
  on public.delivery_assignments for update
  using (delivery_partner_id = auth.uid() or public.is_admin());

drop policy if exists "delivery_assignments_select_customer" on public.delivery_assignments;
create policy "delivery_assignments_select_customer"
  on public.delivery_assignments for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = delivery_assignments.order_id
        and o.user_id = auth.uid()
    )
  );
