-- ============================================================================
-- Migration: Wallets & Wallet Transactions
-- Consolidates and standardizes wallets and wallet_transactions schema
-- ============================================================================

-- 1. Create Wallets Table
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL,
  balance numeric(12, 2) NOT NULL DEFAULT 0.00,
  total_credit numeric(12, 2) NOT NULL DEFAULT 0.00,
  total_debit numeric(12, 2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'unverified'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  kyc_name text NULL,
  kyc_email text NULL,
  document_type text NULL,
  kyc_photo_url text NULL,
  pan_card_url text NULL,
  kyc_submitted_at timestamp with time zone NULL,
  kyc_approved_at timestamp with time zone NULL,
  kyc_rejection_reason text NULL,
  credit_limit numeric(12, 2) NOT NULL DEFAULT 0,
  credit_used_at timestamp with time zone NULL,
  late_fee_rate numeric(12, 2) NOT NULL DEFAULT 50,
  total_penalties numeric(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT wallets_pkey PRIMARY KEY (id),
  CONSTRAINT wallets_user_id_key UNIQUE (user_id),
  CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Ensure all columns exist if table was already created with partial schema
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS balance numeric(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS total_credit numeric(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS total_debit numeric(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unverified';
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_name text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_email text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS document_type text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_photo_url text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS pan_card_url text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamp with time zone;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_approved_at timestamp with time zone;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kyc_rejection_reason text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS credit_limit numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS credit_used_at timestamp with time zone;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS late_fee_rate numeric(12, 2) NOT NULL DEFAULT 50;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS total_penalties numeric(12, 2) NOT NULL DEFAULT 0;

-- 2. Create Wallet Transactions Table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  wallet_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  balance_after numeric(12, 2) NOT NULL,
  description text NULL,
  reference_id text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets (id) ON DELETE CASCADE,
  CONSTRAINT wallet_transactions_type_check CHECK (type IN ('credit', 'debit'))
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON public.wallets (status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions (wallet_id, created_at DESC);

-- 4. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_timestamp();

-- 5. Row Level Security (RLS)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_owner_select" ON public.wallets;
CREATE POLICY "wallets_owner_select" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_owner_all" ON public.wallets;
CREATE POLICY "wallets_owner_all" ON public.wallets
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_transactions_owner_select" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_owner_select" ON public.wallet_transactions
  FOR SELECT USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wallet_transactions_owner_all" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_owner_all" ON public.wallet_transactions
  FOR ALL USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
  );
