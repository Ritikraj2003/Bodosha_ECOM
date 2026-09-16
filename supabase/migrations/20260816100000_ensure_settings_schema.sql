-- ============================================================================
-- REPAIR / ENSURE: General Settings schema + default seed
-- Safe to run on any DB (idempotent). Fixes a fresh DB where the
-- system_settings table is missing the is_secret column or is missing
-- default rows (General Settings showing empty cards).
--
-- Run in: Supabase Dashboard > SQL Editor > Run
-- ============================================================================

-- 1. Ensure the table exists
-- ============================================================================
create table if not exists public.system_settings (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  value         text not null,
  type          text not null default 'string' check (type in ('string','number','boolean','json')),
  description   text,
  is_secret     boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

-- 2. Ensure RLS is enabled (policies only matter for authenticated roles;
--    the admin page reads via the service role which bypasses RLS).
-- ============================================================================
alter table public.system_settings enable row level security;

-- 3. Ensure the is_secret column exists (migration 20260811120000).
-- ============================================================================
alter table public.system_settings add column if not exists is_secret boolean not null default false;

-- 4. Ensure all default settings are present (idempotent; never overwrites).
-- ============================================================================
insert into public.system_settings (key, value, type, is_secret, description) values
  -- Phase 8 defaults
  ('late_fee_percentage', '5', 'number', false, 'Percentage of outstanding balance charged as late fee per period'),
  ('late_fee_type', 'percentage', 'string', false, 'Type of late fee: percentage or fixed'),
  ('grace_period_days', '3', 'number', false, 'Days after due date before late fee applies'),
  ('max_credit_limit', '50000', 'number', false, 'Maximum credit limit for BNPL accounts'),
  ('min_credit_limit', '1000', 'number', false, 'Minimum credit limit for BNPL accounts'),
  ('student_eligibility_min_age', '18', 'number', false, 'Minimum age for student BNPL eligibility'),
  ('student_eligibility_verified_email', 'true', 'boolean', false, 'Require verified email for BNPL'),
  ('merchant_commission_percentage', '5', 'number', false, 'Default commission percentage charged to merchants'),
  ('tax_percentage', '5', 'number', false, 'Default tax percentage on orders'),
  ('maintenance_fee', '1', 'number', false, 'Flat maintenance fee charged per order'),
  ('platform_fee_per_order', '0', 'number', false, 'Fixed platform fee per order'),
  ('maintenance_mode', 'false', 'boolean', false, 'Enable maintenance mode for the platform'),
  ('order_timeout_minutes', '30', 'number', false, 'Minutes before pending orders are auto-cancelled'),
  ('inventory_threshold', '5', 'number', false, 'Stock level that triggers low inventory alert'),
  ('notify_admin_on_new_merchant', 'true', 'boolean', false, 'Send notification when new merchant registers'),
  ('notify_admin_on_new_order', 'true', 'boolean', false, 'Send notification on new orders'),
  -- General settings (gateway / telegram / owner / smtp / pricing)
  ('payment_gateway_active', 'razorpay', 'string', false, 'Active payment gateway. Only one is used at a time: razorpay, phonepe, gpay or none'),
  ('razorpay_key_id', '', 'string', false, 'Razorpay Key ID (public)'),
  ('razorpay_key_secret', '', 'string', true, 'Razorpay Key Secret (confidential)'),
  ('phonepe_merchant_id', '', 'string', false, 'PhonePe merchant ID'),
  ('phonepe_salt_key', '', 'string', true, 'PhonePe salt key (confidential)'),
  ('phonepe_salt_index', '1', 'number', false, 'PhonePe salt index'),
  ('gpay_upi_id', '', 'string', false, 'Google Pay / UPI ID (name@bank)'),
  ('gpay_upi_name', '', 'string', false, 'Merchant name shown for Google Pay UPI'),
  ('telegram_enabled', 'true', 'boolean', false, 'Enable Telegram order notifications'),
  ('telegram_bot_token', '', 'string', true, 'Telegram bot token (confidential)'),
  ('telegram_chat_id', '', 'string', false, 'Telegram chat id to receive order updates'),
  ('telegram_show_qr', 'true', 'boolean', false, 'Send pickup QR image in Telegram order notifications'),
  ('store_support_phone', '', 'string', false, 'Owner support phone shown across the store'),
  ('store_support_email', '', 'string', false, 'Owner support email'),
  ('store_address', '', 'string', false, 'Store address shown in footer / contact'),
  ('store_whatsapp', '', 'string', false, 'WhatsApp number or wa.me link'),
  ('store_instagram', '', 'string', false, 'Instagram profile URL'),
  ('store_facebook', '', 'string', false, 'Facebook page URL'),
  ('store_website', '', 'string', false, 'Store website URL'),
  ('store_upi_id', '', 'string', false, 'Direct UPI id for QR / intent payments'),
  ('store_upi_name', '', 'string', false, 'UPI payee name'),
  ('store_hours_open', '10:00', 'string', false, 'Store opening time'),
  ('store_hours_close', '21:30', 'string', false, 'Store closing time'),
  ('store_order_cutoff_lunch', '10:45', 'string', false, 'Order cutoff for lunch'),
  ('store_order_cutoff_dinner', '18:45', 'string', false, 'Order cutoff for dinner'),
  ('store_delivery_locations', '["SNM, CIT Kokrajhar","SJ, CIT Kokrajhar","JD, CIT Kokrajhar","Staff Quarter, CIT Kokrajhar","Gambari Girls Hostel, CIT Kokrajhar","Mtech Quarter, CIT Kokrajhar"]', 'json', false, 'Delivery locations shown at checkout (JSON array)'),
  ('smtp_host', '', 'string', false, 'SMTP host'),
  ('smtp_port', '', 'number', false, 'SMTP port'),
  ('smtp_user', '', 'string', true, 'SMTP username (confidential)'),
  ('smtp_pass', '', 'string', true, 'SMTP password (confidential)'),
  ('smtp_from', '', 'string', false, 'From address for outgoing mail'),
  ('delivery_fee', '10', 'number', false, 'Flat delivery fee for hostel delivery'),
  -- Connect order / maintenance
  ('cancellation_window_minutes', '2', 'number', false, 'Minutes after placing an order during which the customer can cancel it'),
  -- Payment method toggles
  ('payment_method_wallet_enabled', 'true', 'boolean', false, 'Allow Wallet payments at checkout'),
  ('payment_method_cod_enabled', 'true', 'boolean', false, 'Allow Cash on Delivery at checkout'),
  -- Section visibility toggles
  ('contact_enabled', 'true', 'boolean', false, 'Show the Contact section in admin settings'),
  ('smtp_enabled', 'true', 'boolean', false, 'Show the SMTP / Email section in admin settings'),
  ('pricing_enabled', 'true', 'boolean', false, 'Show the Pricing section in admin settings'),
  ('other_enabled', 'true', 'boolean', false, 'Show the Other section in admin settings'),
  -- Order notification recipient
  ('notification_email', '', 'string', false, 'Email that receives order notifications (falls back to store support email / NOTIFICATION_EMAIL)'),
  -- Wallet overdraft limit
  ('wallet_credit_limit', '500', 'number', false, 'Wallet overdraft limit (how far a wallet balance can go negative)'),
  -- Delivery person signup allowance
  ('delivery_person_emails', '', 'string', false, 'Delivery partner emails allowed to sign up (comma or newline separated)'),
  -- Admin signup allowance
  ('admin_emails', 'lastw5232@gmail.com', 'string', false, 'Administrator emails allowed to sign up (comma or newline separated)')
on conflict (key) do nothing;

-- 5. Razorpay / PhonePe / GPay toggles derive from payment_gateway_active.
--    Added separately so existing gateway values are respected.
-- ============================================================================
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
