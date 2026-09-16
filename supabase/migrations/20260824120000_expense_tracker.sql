-- Expense Settings (per-user starting balance)
CREATE TABLE IF NOT EXISTS public.expense_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  starting_balance numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Expense & Income Transactions
CREATE TABLE IF NOT EXISTS public.expense_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  description      text NOT NULL,
  amount           numeric(10,2) NOT NULL CHECK (amount > 0),
  type             text NOT NULL CHECK (type IN ('income', 'expense')),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_tx_user_date 
  ON public.expense_transactions(user_id, transaction_date DESC, created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_expense_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_settings_updated_at ON public.expense_settings;
CREATE TRIGGER trg_expense_settings_updated_at
  BEFORE UPDATE ON public.expense_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_expense_updated_at();

DROP TRIGGER IF EXISTS trg_expense_transactions_updated_at ON public.expense_transactions;
CREATE TRIGGER trg_expense_transactions_updated_at
  BEFORE UPDATE ON public.expense_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_expense_updated_at();

-- RLS Enablement
ALTER TABLE public.expense_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (idempotent: drop before create)
DROP POLICY IF EXISTS "expense_settings_owner_select" ON public.expense_settings;
CREATE POLICY "expense_settings_owner_select" ON public.expense_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "expense_settings_owner_all" ON public.expense_settings;
CREATE POLICY "expense_settings_owner_all" ON public.expense_settings
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "expense_transactions_owner_select" ON public.expense_transactions;
CREATE POLICY "expense_transactions_owner_select" ON public.expense_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "expense_transactions_owner_all" ON public.expense_transactions;
CREATE POLICY "expense_transactions_owner_all" ON public.expense_transactions
  FOR ALL USING (auth.uid() = user_id);
