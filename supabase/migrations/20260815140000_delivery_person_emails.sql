-- ============================================================================
-- Delivery personnels: comma/newline separated emails allowed to sign up as
-- delivery partners. Consumers: auth (client + server) and admin General
-- Settings page.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('delivery_person_emails', '', 'string', false, 'Delivery partner emails allowed to sign up (comma or newline separated)')
on conflict (key) do nothing;