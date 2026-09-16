-- ============================================================================
-- Order notification recipient email
-- Used by the notification pipeline (lib/notifications.ts). When set, this
-- wins over store_support_email and the NOTIFICATION_EMAIL env fallback.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('notification_email', '', 'string', false, 'Email that receives order notifications (falls back to store support email / NOTIFICATION_EMAIL)')
on conflict (key) do nothing;