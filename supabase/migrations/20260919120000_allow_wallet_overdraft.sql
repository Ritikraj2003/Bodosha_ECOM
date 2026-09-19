-- ============================================================================
-- Migration: Allow Wallet Overdraft for Ethics Pay (BNPL)
-- Drops the legacy balance >= 0 check constraint that prevents negative balances
-- ============================================================================

ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_balance_check;
