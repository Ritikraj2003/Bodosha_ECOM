-- Add fixed delivery slot columns to public.orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_slot_id text,
  ADD COLUMN IF NOT EXISTS delivery_slot_label text,
  ADD COLUMN IF NOT EXISTS delivery_slot_time text,
  ADD COLUMN IF NOT EXISTS delivery_slot_date text,
  ADD COLUMN IF NOT EXISTS delivery_slot_cutoff text;

-- Index for querying and grouping orders by delivery slot
CREATE INDEX IF NOT EXISTS idx_orders_delivery_slot
  ON public.orders(delivery_slot_date, delivery_slot_time);

-- Seed Delivery Settings keys in public.system_settings
INSERT INTO public.system_settings (key, value, type, is_secret, description) VALUES
  ('delivery_available', 'true', 'boolean', false, 'Whether delivery is currently available (ON/OFF)'),
  ('delivery_unavailable_message', 'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.', 'string', false, 'Message displayed on storefront when delivery is unavailable'),
  ('delivery_person_name', 'Dilip Da Delivery', 'string', false, 'Delivery person name'),
  ('delivery_person_phone', '6000212823', 'string', false, 'Delivery person phone number'),
  ('delivery_fixed_slots_enabled', 'false', 'boolean', false, 'Enable fixed delivery slots system (ON/OFF)'),
  ('delivery_slots', '[{"id":"slot-1","label":"Slot 1","delivery_time":"13:30","cutoff_time":"13:15","is_enabled":true},{"id":"slot-2","label":"Slot 2","delivery_time":"15:00","cutoff_time":"14:45","is_enabled":true},{"id":"slot-3","label":"Slot 3","delivery_time":"16:30","cutoff_time":"16:15","is_enabled":true}]', 'json', false, 'Configured fixed delivery slots (JSON array)'),
  ('delivery_custom_message', 'Due to high demand, deliveries may take longer than usual today.', 'string', false, 'Custom delivery announcement message'),
  ('delivery_custom_message_enabled', 'false', 'boolean', false, 'Enable custom delivery announcement message (ON/OFF)')
ON CONFLICT (key) DO NOTHING;
