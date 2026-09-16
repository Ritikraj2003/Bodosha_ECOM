-- ============================================================================
-- General Settings: gateway config, Telegram, owner links, SMTP, pricing
-- Adds is_secret flag + seeds new keys. Payment methods gain 'upi'.
-- ============================================================================

-- Secrets flag: marks fields treated as credentials (masked in admin UI)
alter table public.system_settings
  add column if not exists is_secret boolean not null default false;

-- Allow 'upi' as the persisted payment method for PhonePe / GPay UPI flows
alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('razorpay','bnpl','cod','upi'));

alter table public.payments
  drop constraint if exists payments_payment_method_check;
alter table public.payments
  add constraint payments_payment_method_check
  check (payment_method in ('razorpay','bnpl','cod','upi'));

-- Seed the new General Settings keys (idempotent)
insert into public.system_settings (key, value, type, is_secret, description) values
  -- Payment gateway (mutual exclusion - exactly one active gateway)
  ('payment_gateway_active', 'razorpay', 'string', false, 'Active payment gateway. Only one is used at a time: razorpay, phonepe, gpay or none'),
  ('razorpay_key_id', '', 'string', false, 'Razorpay Key ID (public)'),
  ('razorpay_key_secret', '', 'string', true, 'Razorpay Key Secret (confidential)'),
  ('phonepe_merchant_id', '', 'string', false, 'PhonePe merchant ID'),
  ('phonepe_salt_key', '', 'string', true, 'PhonePe salt key (confidential)'),
  ('phonepe_salt_index', '1', 'number', false, 'PhonePe salt index'),
  ('gpay_upi_id', '', 'string', false, 'Google Pay / UPI ID (name@bank)'),
  ('gpay_upi_name', '', 'string', false, 'Merchant name shown for Google Pay UPI'),

  -- Telegram connection
  ('telegram_enabled', 'true', 'boolean', false, 'Enable Telegram order notifications'),
  ('telegram_bot_token', '', 'string', true, 'Telegram bot token (confidential)'),
  ('telegram_chat_id', '', 'string', false, 'Telegram chat id to receive order updates'),
  
  -- Owner links / storefront
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
  -- SMTP
  ('smtp_host', '', 'string', false, 'SMTP host'),
  ('smtp_port', '', 'number', false, 'SMTP port'),
  ('smtp_user', '', 'string', true, 'SMTP username (confidential)'),
  ('smtp_pass', '', 'string', true, 'SMTP password (confidential)'),
  ('smtp_from', '', 'string', false, 'From address for outgoing mail'),
  -- Pricing (wired into cart at checkout)
  ('delivery_fee', '10', 'number', false, 'Flat delivery fee for hostel delivery'),
  ('tax_percentage', '', 'number', false, 'Tax percentage applied to orders')
on conflict (key) do nothing;