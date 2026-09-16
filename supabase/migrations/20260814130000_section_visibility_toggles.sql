-- ============================================================================
-- Admin settings: per-section visibility toggles
-- Toggle shown on the left of each settings section. When off, the section
-- body is hidden in the admin UI. Default on for all sections. telegram_enabled
-- already exists and doubles as the Telegram section toggle.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('contact_enabled', 'true', 'boolean', false, 'Show the Contact section in admin settings'),
  ('smtp_enabled', 'true', 'boolean', false, 'Show the SMTP / Email section in admin settings'),
  ('pricing_enabled', 'true', 'boolean', false, 'Show the Pricing section in admin settings'),
  ('other_enabled', 'true', 'boolean', false, 'Show the Other section in admin settings')
on conflict (key) do nothing;