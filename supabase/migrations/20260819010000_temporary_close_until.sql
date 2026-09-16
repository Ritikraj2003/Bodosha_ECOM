-- ============================================================================
-- Temporary close until today (HH:MM). Lets the owner pause the store for a
-- few hours and reopen the same day (instead of generic "opens tomorrow").
-- Empty value = disabled. Consumers: storefront StatusStrip, profile pill,
-- checkout guard, and order placement server check.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('store_temp_close_until', '', 'string', false, 'Temporarily close today until this time (HH:MM). Leave empty to disable.')
on conflict (key) do nothing;