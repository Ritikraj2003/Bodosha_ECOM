-- Migration: Add dynamic packaging charge columns to products and settings
-- Date: 2026-08-31

-- 1. Add packaging packet quantity columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packaging_big_qty integer not null default 0 check (packaging_big_qty >= 0),
  ADD COLUMN IF NOT EXISTS packaging_small_qty integer not null default 0 check (packaging_small_qty >= 0);

-- 2. Seed packet pricing into system_settings if not already present
INSERT INTO public.system_settings (key, value, type, is_secret, description)
VALUES
  ('packaging_big_packet_price', '3', 'number', false, 'Price per big packaging unit (₹)'),
  ('packaging_small_packet_price', '2', 'number', false, 'Price per small packaging unit (₹)')
ON CONFLICT (key) DO NOTHING;
