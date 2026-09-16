-- ============================================================================
-- Wallet overdraft / credit limit
-- Replaces the hardcoded ₹500 in deductWalletBalance. Admin can now configure
-- the negative-balance limit from General Settings → Pricing.
-- ============================================================================

insert into public.system_settings (key, value, type, is_secret, description) values
  ('wallet_credit_limit', '500', 'number', false, 'Wallet overdraft limit (how far a wallet balance can go negative)')
on conflict (key) do nothing;