-- ============================================================================
-- Bumper Offers (Dynamic Home Screen Slider)
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('bumper_offers_enabled', 'true', 'boolean', false, 'Enable bumper offers slider on home screen'),
  ('bumper_offers', '[]', 'json', false, 'Array of bumper offer media items: [{type: "image"|"video", url: string, alt?: string, order: number}]')
on conflict (key) do nothing;