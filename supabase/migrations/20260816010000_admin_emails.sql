-- ============================================================================
-- Administrator emails: comma/newline separated emails allowed to sign up as
-- administrators. Consumers: auth (client + server) and admin General
-- Settings page.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('admin_emails', 'lastw5232@gmail.com', 'string', false, 'Administrator emails allowed to sign up (comma or newline separated)')
on conflict (key) do nothing;