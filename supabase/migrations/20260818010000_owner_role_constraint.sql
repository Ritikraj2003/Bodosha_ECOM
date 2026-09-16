-- ============================================================================
-- Allow the read-only store owner role on profiles.
--
-- The owner (Dilip Da) signs up through the Administrator flow but is granted
-- the read-only `owner` role. The `on_auth_user_created` trigger copies
-- `raw_user_meta_data.role` into profiles.role, so the CHECK constraint on
-- profiles.role must accept `owner` — otherwise GoTrue's admin.createUser
-- fails with HTTP 500 (the signup form shows the raw `{}` error body).
--
-- Run in: Supabase Dashboard > SQL Editor > Run
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'merchant', 'delivery', 'admin', 'super_admin', 'owner'));
