-- Migration: 20260926100000_ensure_all_system_settings_and_default_store.sql
-- Description: Ensures all standard General Settings keys and a default restaurant record exist.

-- 1. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'string',
  is_secret BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Seed all standard system settings (idempotent, safe on new and existing databases)
INSERT INTO public.system_settings (key, value, type, is_secret, description) VALUES
  -- Payment Methods toggles
  ('payment_method_wallet_enabled', 'true', 'boolean', false, 'Enable Wallet payment method'),
  ('payment_method_razorpay_enabled', 'true', 'boolean', false, 'Enable Razorpay payment method'),
  ('payment_method_upi_enabled', 'true', 'boolean', false, 'Enable UPI payment method'),
  ('payment_method_cod_enabled', 'true', 'boolean', false, 'Enable Cash on Delivery'),
  
  -- Payment Credentials
  ('razorpay_key_id', '', 'string', false, 'Razorpay API Key ID'),
  ('razorpay_key_secret', '', 'string', true, 'Razorpay API Key Secret'),
  ('store_upi_id', '', 'string', false, 'Store primary UPI ID'),
  ('store_upi_name', '', 'string', false, 'Store primary UPI Account Name'),
  ('gpay_upi_id', '', 'string', false, 'Google Pay UPI ID'),
  ('gpay_upi_name', '', 'string', false, 'Google Pay UPI Account Name'),

  -- Contact Details
  ('contact_enabled', 'true', 'boolean', false, 'Enable Contact Section'),
  ('store_support_phone', '', 'string', false, 'Store Support Phone'),
  ('store_support_email', '', 'string', false, 'Store Support Email'),
  ('notification_email', '', 'string', false, 'Admin order notification email'),
  ('store_address', '', 'string', false, 'Store physical address'),
  ('store_whatsapp', '', 'string', false, 'Store WhatsApp number/link'),
  ('store_instagram', '', 'string', false, 'Store Instagram profile link'),
  ('store_facebook', '', 'string', false, 'Store Facebook page link'),
  ('store_website', '', 'string', false, 'Store website link'),

  -- Delivery & Takeaway
  ('delivery_available', 'true', 'boolean', false, 'Master delivery switch'),
  ('takeaway_available', 'true', 'boolean', false, 'Master takeaway switch'),
  ('in_store_available', 'true', 'boolean', false, 'Master in-store POS switch'),
  ('delivery_unavailable_message', 'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.', 'string', false, 'Message shown when delivery is disabled'),
  ('delivery_person_name', '', 'string', false, 'Delivery person name'),
  ('delivery_person_phone', '', 'string', false, 'Delivery person phone'),
  ('delivery_fixed_slots_enabled', 'false', 'boolean', false, 'Enable fixed delivery slots'),
  ('delivery_custom_message_enabled', 'false', 'boolean', false, 'Show custom delivery message'),
  ('delivery_custom_message', '', 'string', false, 'Custom delivery announcement message'),
  ('delivery_slots', '[]', 'json', false, 'Configured scheduled delivery time slots'),
  ('delivery_person_emails', '[]', 'json', false, 'List of delivery personnel email addresses'),
  ('store_delivery_locations', '[]', 'json', false, 'Available delivery locations list'),

  -- Telegram Notifications
  ('telegram_enabled', 'false', 'boolean', false, 'Enable Telegram notifications'),
  ('telegram_bot_token', '', 'string', true, 'Telegram bot token'),
  ('telegram_chat_id', '', 'string', false, 'Telegram chat ID'),
  ('telegram_show_qr', 'false', 'boolean', false, 'Show Telegram QR in receipts'),
  ('telegram_qr_expiry_minutes', '15', 'number', false, 'Telegram QR code expiry minutes'),

  -- SMTP / Email
  ('smtp_enabled', 'false', 'boolean', false, 'Enable SMTP email delivery'),
  ('smtp_host', '', 'string', false, 'SMTP server host'),
  ('smtp_port', '587', 'number', false, 'SMTP server port'),
  ('smtp_user', '', 'string', false, 'SMTP username'),
  ('smtp_pass', '', 'string', true, 'SMTP password'),
  ('smtp_from', '', 'string', false, 'SMTP From address'),

  -- Fees & Pricing
  ('pricing_enabled', 'true', 'boolean', false, 'Pricing rules enabled'),
  ('delivery_fee', '10', 'number', false, 'Flat delivery fee for orders'),
  ('maintenance_fee', '1', 'number', false, 'Standard platform maintenance charge'),
  ('min_order_amount', '0', 'number', false, 'Minimum order amount threshold'),
  ('wallet_credit_limit', '500', 'number', false, 'Maximum credit limit for customer wallet'),
  ('packaging_charge_enabled', 'true', 'boolean', false, 'Toggle dynamic packaging fee'),
  ('packaging_big_packet_price', '3', 'number', false, 'Price per big packaging packet (₹)'),
  ('packaging_small_packet_price', '2', 'number', false, 'Price per small packaging packet (₹)'),

  -- Store Hours & Status
  ('store_open_time', '09:00', 'string', false, 'Daily operating opening hour (HH:MM)'),
  ('store_close_time', '22:00', 'string', false, 'Daily operating closing hour (HH:MM)'),
  ('store_is_open', 'true', 'boolean', false, 'Manual store open override'),
  ('store_temp_close_until', '', 'string', false, 'Temporary close until timestamp/time'),
  ('store_order_cutoff_lunch', '', 'string', false, 'Lunch order cutoff time'),
  ('store_order_cutoff_dinner', '', 'string', false, 'Dinner order cutoff time'),
  ('cancellation_window_minutes', '2', 'number', false, 'Customer cancellation window in minutes'),
  ('maintenance_mode', 'false', 'boolean', false, 'Put site into maintenance mode'),
  ('other_enabled', 'true', 'boolean', false, 'Other settings section enabled'),

  -- Platform Administration & Promotions
  ('admin_emails', '["ane@gmail.com"]', 'json', false, 'List of admin email accounts'),
  ('owner_email', 'ane@gmail.com', 'string', false, 'Primary platform owner contact email'),
  ('bumper_offers_enabled', 'true', 'boolean', false, 'Toggle home banner bumper slider'),
  ('bumper_offers', '[]', 'json', false, 'List of home screen bumper media banners')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;

-- 3. Ensure a default store exists in public.restaurants
DO $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Look for an existing super_admin or admin user
  SELECT id INTO v_owner_id FROM public.users WHERE role IN ('super_admin', 'admin') ORDER BY created_at ASC LIMIT 1;
  IF v_owner_id IS NULL THEN
    v_owner_id := '5c262804-b3d8-4815-a41f-2ce1cab12fa1'::UUID;
  END IF;

  INSERT INTO public.restaurants (
    id, owner_id, name, slug, description, cuisine_type, phone, email,
    address_line1, city, state, postal_code, is_active, is_open, opening_time, closing_time
  ) VALUES (
    'd1111111-1111-1111-1111-111111111111',
    v_owner_id,
    'Badmaas House Cafe',
    'badmaas-house-cafe',
    'Signature brews, specialty coffee, and mouth-watering bites cooked fresh with passion.',
    'Cafe, Fast Food, Snacks, Beverages',
    '',
    'ane@gmail.com',
    'BTM',
    'Bangalore',
    'Karnataka',
    '560076',
    true,
    true,
    '09:00:00'::TIME,
    '22:00:00'::TIME
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.restaurant_settings (
    restaurant_id, min_order_amount, delivery_fee, estimated_prep_time
  ) VALUES (
    'd1111111-1111-1111-1111-111111111111',
    0,
    10,
    20
  ) ON CONFLICT (restaurant_id) DO NOTHING;
END $$;
