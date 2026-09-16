-- ============================================================================
-- Store owner email (Dilip Da): read-only owner dashboard access.
-- Consumers: auth (client + server) and admin General Settings page.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('dilip_da_email', '', 'string', false, 'Store owner email (Dilip Da). Gets a read-only view of the dashboard.')
on conflict (key) do nothing;