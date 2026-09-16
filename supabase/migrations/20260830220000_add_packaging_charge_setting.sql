-- Seed Packaging Charge setting in public.system_settings
insert into public.system_settings (key, value, type, is_secret, description) values
  ('packaging_charge', '0', 'number', false, 'Packaging charge (₹) applied per customer order at checkout'),
  ('packaging_charge_enabled', 'true', 'boolean', false, 'Enable or disable dynamic packaging charge')
on conflict (key) do update set
  description = excluded.description,
  type = excluded.type;
