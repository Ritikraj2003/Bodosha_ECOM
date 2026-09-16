-- ============================================================================
-- Payment methods: per-method enable toggles
-- Replaces the single "active gateway" model. Each method (wallet, razorpay,
-- phonepe, gpay, cod) is now toggled independently at checkout. Initial state
-- is derived from the legacy payment_gateway_active setting so existing stores
-- keep the same behavior after deploy.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('payment_method_wallet_enabled', 'true', 'boolean', false, 'Allow Wallet payments at checkout'),
  ('payment_method_cod_enabled', 'true', 'boolean', false, 'Allow Cash on Delivery at checkout')
on conflict (key) do nothing;

insert into public.system_settings (key, value, type, is_secret, description)
select
  'payment_method_razorpay_enabled',
  case when coalesce((select value from public.system_settings where key = 'payment_gateway_active'), 'razorpay') = 'razorpay' then 'true' else 'false' end,
  'boolean', false, 'Allow Razorpay payments at checkout'
on conflict (key) do nothing;

insert into public.system_settings (key, value, type, is_secret, description)
select
  'payment_method_phonepe_enabled',
  case when coalesce((select value from public.system_settings where key = 'payment_gateway_active'), 'razorpay') = 'phonepe' then 'true' else 'false' end,
  'boolean', false, 'Allow PhonePe payments at checkout'
on conflict (key) do nothing;

insert into public.system_settings (key, value, type, is_secret, description)
select
  'payment_method_gpay_enabled',
  case when coalesce((select value from public.system_settings where key = 'payment_gateway_active'), 'razorpay') = 'gpay' then 'true' else 'false' end,
  'boolean', false, 'Allow Google Pay payments at checkout'
on conflict (key) do nothing;