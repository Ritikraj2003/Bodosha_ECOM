-- ============================================================================
-- General Settings: connect order/cancellation + maintenance settings to app
-- Idempotent. Adds the customer cancellation window used by order flows and
-- guarantees maintenance_mode seed exists (already seeded by Phase 8).
-- ============================================================================

-- Customer cancellation window (minutes) after an order is placed.
-- Previously hard-coded to 2 minutes in code (CANCELLATION_WINDOW_MS = 120_000).
insert into public.system_settings (key, value, type, is_secret, description) values
  ('cancellation_window_minutes', '2', 'number', false, 'Minutes after placing an order during which the customer can cancel it')
on conflict (key) do nothing;

-- Guarantee the platform-level maintenance_mode toggle is present (seeded in
-- 20260719140000_system_settings.sql; idempotent re-insert only if missing).
insert into public.system_settings (key, value, type, is_secret, description) values
  ('maintenance_mode', 'false', 'boolean', false, 'Enable maintenance mode for the platform')
on conflict (key) do nothing;