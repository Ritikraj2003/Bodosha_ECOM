-- ============================================================================
-- MASTER DATABASE SCHEMA & MIGRATION SCRIPT
-- Platform: Dilip Da / Bodosha E-Commerce Platform
-- Database: PostgreSQL (Neon / Supabase / Standalone Compatible)
-- Total Tables: 34 (Clean architecture, ordered by dependency)
-- ============================================================================

-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- ============================================================================
-- COMMON FUNCTIONS & TRIGGERS
-- ============================================================================

-- 1. Trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to generate human-readable tracking code for orders (e.g. DD-X8K2M9LP)
CREATE OR REPLACE FUNCTION public.generate_tracking_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT[] := '{A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z,2,3,4,5,6,7,8,9}';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || chars[1 + FLOOR(random() * array_length(chars, 1))::int];
  END LOOP;
  RETURN 'DD-' || result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. USERS (Master Auth & Identity Entity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'student',
  is_active            BOOLEAN NOT NULL DEFAULT true,
  is_cit_student       BOOLEAN NOT NULL DEFAULT false,
  student_email        TEXT,
  student_verified_at  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  wallet_balance       NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  isdeleted            BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON public.users(is_deleted);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. PROFILES (Public User Profile Mirror)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'student',
  is_active            BOOLEAN NOT NULL DEFAULT true,
  is_cit_student       BOOLEAN NOT NULL DEFAULT false,
  student_email        TEXT,
  student_verified_at  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  wallet_balance       NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  isdeleted            BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_deleted ON public.profiles(is_deleted);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto sync profile when users table is inserted or updated
CREATE OR REPLACE FUNCTION public.sync_user_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, phone, avatar_url, role, is_active,
    is_cit_student, student_email, student_verified_at,
    is_deleted, isdeleted, deleted_at, wallet_balance, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, NEW.full_name, NEW.phone, NEW.avatar_url, NEW.role, NEW.is_active,
    NEW.is_cit_student, NEW.student_email, NEW.student_verified_at,
    NEW.is_deleted, NEW.isdeleted, NEW.deleted_at, COALESCE(NEW.wallet_balance, 0.00), NEW.created_at, NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    is_cit_student = EXCLUDED.is_cit_student,
    student_email = EXCLUDED.student_email,
    student_verified_at = EXCLUDED.student_verified_at,
    wallet_balance = EXCLUDED.wallet_balance,
    is_deleted = EXCLUDED.is_deleted,
    isdeleted = EXCLUDED.isdeleted,
    deleted_at = EXCLUDED.deleted_at,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_to_profile ON public.users;
CREATE TRIGGER trg_sync_user_to_profile
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_to_profile();

-- ============================================================================
-- 3. RBAC: ROLES, PERMISSIONS, ROLE_PERMISSIONS, USER_ROLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.permissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_name  VARCHAR(150),
  permission_code  VARCHAR(50) UNIQUE,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_on       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_permission_code
  ON public.permissions (permission_code);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id)
);

-- RBAC Helper Functions
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND p.permission_code = p_permission_code
  ) INTO has_perm;
  RETURN has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE (permission_code VARCHAR(50), permission_name VARCHAR(150)) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.permission_code, p.permission_name
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role_id = rp.role_id
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. RESTAURANTS & RESTAURANT_SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restaurants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  cuisine_type  TEXT,
  phone         TEXT,
  email         TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  postal_code   TEXT NOT NULL,
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  cover_image   TEXT,
  logo_url      TEXT,
  opening_time  TIME NOT NULL DEFAULT '09:00:00'::TIME,
  closing_time  TIME NOT NULL DEFAULT '22:00:00'::TIME,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_open       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON public.restaurants;
CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  min_order_amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  delivery_fee          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  free_delivery_above   NUMERIC(10, 2),
  max_delivery_distance NUMERIC(6, 2),
  estimated_prep_time   INTEGER NOT NULL DEFAULT 20,
  is_bnpl_enabled       BOOLEAN NOT NULL DEFAULT true,
  bnpl_interest_rate    NUMERIC(5, 2) NOT NULL DEFAULT 0,
  bnpl_max_term_days    INTEGER NOT NULL DEFAULT 15,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_restaurant_settings_updated_at ON public.restaurant_settings;
CREATE TRIGGER trg_restaurant_settings_updated_at
  BEFORE UPDATE ON public.restaurant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 5. CATEGORIES & PRODUCTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  image         TEXT,
  CONSTRAINT categories_restaurant_id_slug_key UNIQUE (restaurant_id, slug)
);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id         UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  price               NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  compare_price       NUMERIC(10, 2),
  cost_price          NUMERIC(10, 2),
  sku                 TEXT,
  is_veg              BOOLEAN NOT NULL DEFAULT true,
  is_available        BOOLEAN NOT NULL DEFAULT true,
  stock_quantity      INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  track_inventory     BOOLEAN NOT NULL DEFAULT false,
  image_url           TEXT,
  badge               TEXT,
  weight              TEXT,
  flavor              TEXT,
  is_eggless          BOOLEAN,
  packaging_type      TEXT NOT NULL DEFAULT 'small' CHECK (packaging_type IN ('none', 'small', 'big')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  compare_at_price    NUMERIC(10, 2),
  cost_per_unit       NUMERIC(10, 2),
  unit                TEXT DEFAULT 'piece',
  full_description    TEXT,
  servings            TEXT,
  pieces              TEXT,
  portion_size        TEXT,
  included_items      TEXT[],
  ingredients         TEXT[],
  allergens           TEXT[],
  delivery_time       TEXT,
  is_vegetarian       BOOLEAN NOT NULL DEFAULT true,
  is_vegan            BOOLEAN NOT NULL DEFAULT false,
  is_gluten_free      BOOLEAN NOT NULL DEFAULT false,
  spice_level         INTEGER NOT NULL DEFAULT 0,
  preparation_time    INTEGER NOT NULL DEFAULT 15,
  image               TEXT,
  packaging_big_qty   INTEGER NOT NULL DEFAULT 0,
  packaging_small_qty INTEGER NOT NULL DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  tags                TEXT[],
  CONSTRAINT products_restaurant_id_slug_key UNIQUE (restaurant_id, slug),
  CONSTRAINT products_check CHECK (compare_price IS NULL OR compare_price >= price)
);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.product_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  alt_text      TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. ADDRESSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Home',
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  postal_code   TEXT NOT NULL,
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_address  TEXT
);

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 7. ORDERS & ORDER_ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code         TEXT NOT NULL UNIQUE DEFAULT public.generate_tracking_code(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  restaurant_id         UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  delivery_partner_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'placed' CHECK (
    status IN ('placed', 'pending', 'accepted', 'preparing', 'ready', 'ready_for_pickup', 'assigned', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'declined', 'refunded')
  ),
  order_type            TEXT CHECK (order_type IN ('room_delivery', 'takeaway', 'dine_in', 'in_store')),
  subtotal              NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax_amount            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  delivery_fee          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  delivery_address_id   UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  delivery_address_json JSONB,
  special_instructions  TEXT,
  cancellation_reason   TEXT,
  placed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  prepared_at           TIMESTAMPTZ,
  picked_up_at          TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_name         TEXT,
  customer_phone        TEXT,
  customer_email        TEXT,
  payment_method        TEXT,
  payment_status        TEXT DEFAULT 'pending',
  delivery_notes        TEXT,
  delivery_address      JSONB,
  total                 NUMERIC(10, 2),
  accepted_at           TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  status_history        JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON public.orders(tracking_code);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.order_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id           UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name         TEXT NOT NULL,
  product_price        NUMERIC(10, 2) NOT NULL CHECK (product_price >= 0),
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  item_total           NUMERIC(10, 2) NOT NULL CHECK (item_total >= 0),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  unit_price           NUMERIC(10, 2),
  subtotal             NUMERIC(10, 2),
  special_instructions TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ============================================================================
-- 8. DELIVERY PARTNERS & ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.delivery_partners (
  id               UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  user_id          UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  vehicle_type     TEXT,
  vehicle_no       TEXT,
  license_plate    TEXT,
  is_available     BOOLEAN NOT NULL DEFAULT false,
  is_online        BOOLEAN DEFAULT true,
  total_deliveries INTEGER DEFAULT 0,
  rating           NUMERIC DEFAULT 5.0,
  latitude         NUMERIC(10, 7),
  longitude        NUMERIC(10, 7),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_partners_user_id
  ON public.delivery_partners(user_id);

CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'assigned' CHECK (
    status IN ('assigned', 'accepted', 'declined', 'picked_up', 'delivered')
  ),
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  delivery_notes      TEXT,
  customer_rating     NUMERIC,
  qr_token_hash       TEXT,
  otp_value           TEXT,
  otp_hash            TEXT,
  otp_expires_at      TIMESTAMPTZ,
  otp_verified_at     TIMESTAMPTZ,
  otp_attempts        INTEGER DEFAULT 0
);

-- ============================================================================
-- 9. PAYMENTS & PAYMENT_LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount             NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'INR',
  payment_method     TEXT NOT NULL CHECK (
    payment_method IN ('razorpay', 'cod', 'bnpl', 'phonepe', 'gpay', 'wallet', 'cash', 'upi')
  ),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'confirmed')
  ),
  gateway_payment_id TEXT,
  gateway_order_id   TEXT,
  gateway_signature  TEXT,
  error_code         TEXT,
  error_description  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  refund_amount      NUMERIC DEFAULT 0
);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. REVIEWS & RATINGS & FAVORITES & INVENTORY LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT favorites_user_id_product_id_key UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  change_amount  INTEGER NOT NULL,
  previous_stock INTEGER NOT NULL,
  current_stock  INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  reference_id   UUID,
  created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. WALLETS & WALLET_TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id        UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  balance              NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  credit_limit         NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
  is_frozen            BOOLEAN NOT NULL DEFAULT false,
  total_credit         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_debit          NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  credit_used          NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  credit_used_at       TIMESTAMPTZ,
  late_fee_rate        NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
  total_penalties      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status               TEXT NOT NULL DEFAULT 'unverified' CHECK (
    status IN ('unverified', 'pending', 'active', 'frozen', 'suspended', 'rejected')
  ),
  kyc_name             TEXT,
  kyc_email            TEXT,
  document_type        TEXT,
  kyc_photo_url        TEXT,
  pan_card_url         TEXT,
  kyc_submitted_at     TIMESTAMPTZ,
  kyc_approved_at      TIMESTAMPTZ,
  kyc_rejection_reason TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_status ON public.wallets(status);

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id         UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id     UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'topup', 'payment', 'refund')),
  amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  balance_before    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  balance_after     NUMERIC(10, 2) NOT NULL,
  reference_id      TEXT,
  order_id          TEXT,
  payment_reference TEXT,
  reference         TEXT,
  description       TEXT NOT NULL,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON public.wallet_transactions(created_at DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON public.wallet_transactions(user_id);

-- ============================================================================
-- 12. CIT OTP REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cit_otp_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  otp_hash     TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 13. EXPENSES (EXPENSE_SETTINGS & EXPENSE_TRANSACTIONS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expense_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  starting_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT NOT NULL,
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type             TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  note             TEXT,
  category         TEXT,
  payment_mode     TEXT,
  receipt_url      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_tx_date
  ON public.expense_transactions(transaction_date DESC NULLS FIRST, created_at DESC NULLS FIRST);

-- ============================================================================
-- 14. NOTIFICATIONS & PUSH SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'general',
  metadata   JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_push_subscriptions_updated_at ON public.user_push_subscriptions;
CREATE TRIGGER trg_user_push_subscriptions_updated_at
  BEFORE UPDATE ON public.user_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 15. REPORTS, ACTIVITY LOGS & AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  report_type TEXT NOT NULL,
  data        JSONB NOT NULL,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activity   TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 16. SYSTEM SETTINGS & ANALYTICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  type        TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  id          UUID DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric     TEXT NOT NULL,
  value      NUMERIC(12, 2) NOT NULL,
  period     TEXT NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 17. INITIAL SYSTEM SEED: PERMISSIONS (All 41 Standard Permissions)
-- ============================================================================
INSERT INTO public.permissions (permission_name, permission_code, description) VALUES
  ('Dashboard', 'DASH', 'Access and view main dashboard overview'),
  ('Dashboard | Filter', 'DASHFL', 'Filter dashboard analytics by date range'),
  ('Expenses', 'EXPENSES', 'Access daily expenses tracker'),
  ('Expenses | Add', 'EXP_ADD', 'Record daily expenses'),
  ('Expenses | Invest', 'EXP_INVEST', 'Configure starting balance / investment funds'),
  ('In-Store', 'INSTORE', 'Access in-store POS counter'),
  ('In-Store | History', 'INSTORE_HIST', 'View in-store order history tab'),
  ('Orders', 'ORDERS', 'Access orders directory'),
  ('Orders | History', 'ORDERS_HIST', 'View delivered and cancelled order history'),
  ('Orders | Running', 'ORDERS_RUNNING', 'View and manage running active orders'),
  ('Payments', 'PAYMENTS', 'Access payments & billing section'),
  ('Payments | Export', 'PAYMENTS_EXPORT', 'Export payment reports to CSV or Excel'),
  ('Payments | Show/Hide', 'PAYMENTS_TOGGLE', 'Toggle show/hide payment records'),
  ('Setting | Audit Log', 'SET_AUDIT', 'View audit logs of employee actions'),
  ('Setting | Bumper Offer', 'SET_OFFERS', 'Manage promotional banners and bumper offers'),
  ('Setting | Category', 'SET_CAT', 'Access menu categories management'),
  ('Setting | Category | Add', 'SET_CAT_ADD', 'Add new category'),
  ('Setting | Category | Delete', 'SET_CAT_DEL', 'Delete category'),
  ('Setting | Category | Edit', 'SET_CAT_EDIT', 'Edit category details'),
  ('Setting | General Setting', 'SET_GEN', 'Access store general settings'),
  ('Setting | General Setting | Edit', 'SET_GEN_EDIT', 'Edit payment credentials, timings and store details'),
  ('Setting | Product', 'SET_PROD', 'Access menu products management'),
  ('Setting | Product | Add', 'SET_PROD_ADD', 'Add new food item or product'),
  ('Setting | Product | Delete', 'SET_PROD_DEL', 'Delete or archive product'),
  ('Setting | Product | Edit', 'SET_PROD_EDIT', 'Edit product details, price, and stock'),
  ('User Management | Customer', 'USER_CUST', 'Access customer directory'),
  ('User Management | Customer | Credit Wallet', 'USER_CUST_CREDIT', 'Adjust credit limit or top up customer wallet'),
  ('User Management | Customer | Suspend', 'USER_CUST_SUSPEND', 'Suspend or block customer account'),
  ('User Management | Employee', 'USER_EMP', 'Access employee directory'),
  ('User Management | Employee | Add', 'USER_EMP_ADD', 'Add new employee account'),
  ('User Management | Employee | Delete', 'USER_EMP_DEL', 'Delete / deactivate employee account'),
  ('User Management | Employee | Edit', 'USER_EMP_EDIT', 'Edit employee details, password, and role'),
  ('User Management | Roles & Permissions', 'USER_ROLES', 'Access roles & permissions management'),
  ('User Management | Roles & Permissions | Add', 'USER_ROLES_ADD', 'Create new custom role'),
  ('User Management | Roles & Permissions | Delete', 'USER_ROLES_DEL', 'Delete custom role'),
  ('User Management | Roles & Permissions | Edit', 'USER_ROLES_EDIT', 'Edit role permissions matrix'),
  ('Wallet KYC', 'WALLET_KYC', 'Access Wallet KYC tab'),
  ('Wallet KYC | Check Penalty', 'WALLET_KYC_PENALTY', 'Check and waive BNPL overdue penalties'),
  ('Wallet KYC | History', 'WALLET_KYC_HIST', 'View wallet credit and transaction history'),
  ('Wallet KYC | Set Limit', 'WALLET_KYC_LIMIT', 'Set and adjust student credit limits'),
  ('Wallet KYC | View', 'WALLET_KYC_VIEW', 'View student KYC submissions and documents')
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description = EXCLUDED.description;

-- ============================================================================
-- 18. INITIAL SYSTEM SEED: ROLES (Only Super Admin & Delivery Partner)
-- ============================================================================
INSERT INTO public.roles (name, slug, description, is_system) VALUES
  ('Super Administrator', 'super_admin', 'Full system access with all privileges', true),
  ('Delivery Partner', 'delivery', 'Pick up and deliver assigned customer orders', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system;

-- Map ALL permissions to Super Administrator
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 19. INITIAL SYSTEM SETTINGS & DEFAULT RESTAURANT SEED
-- ============================================================================
INSERT INTO public.system_settings (key, value, type, is_secret, description) VALUES
  -- Payment Methods toggles
  ('payment_method_wallet_enabled', 'true', 'boolean', false, 'Enable Wallet payment method'),
  ('payment_method_razorpay_enabled', 'true', 'boolean', false, 'Enable Razorpay payment method'),
  ('payment_method_upi_enabled', 'true', 'boolean', false, 'Enable UPI payment method'),
  ('payment_method_cod_enabled', 'true', 'boolean', false, 'Enable Cash on Delivery'),
  
  -- Payment Credentials
  ('razorpay_key_id', '', 'string', false, 'Razorpay API Key ID'),
  ('razorpay_key_secret', '', 'string', true, 'Razorpay API Key Secret'),
  ('store_upi_id', '', 'string', false, 'Store primary UPI ID'),
  ('store_upi_name', '', 'string', false, 'Store primary UPI Account Name'),
  ('gpay_upi_id', '', 'string', false, 'Google Pay UPI ID'),
  ('gpay_upi_name', '', 'string', false, 'Google Pay UPI Account Name'),

  -- Contact Details
  ('contact_enabled', 'true', 'boolean', false, 'Enable Contact Section'),
  ('store_support_phone', '', 'string', false, 'Store Support Phone'),
  ('store_support_email', '', 'string', false, 'Store Support Email'),
  ('notification_email', '', 'string', false, 'Admin order notification email'),
  ('store_address', '', 'string', false, 'Store physical address'),
  ('store_whatsapp', '', 'string', false, 'Store WhatsApp number/link'),
  ('store_instagram', '', 'string', false, 'Store Instagram profile link'),
  ('store_facebook', '', 'string', false, 'Store Facebook page link'),
  ('store_website', '', 'string', false, 'Store website link'),

  -- Delivery & Takeaway
  ('delivery_available', 'true', 'boolean', false, 'Master delivery switch'),
  ('takeaway_available', 'true', 'boolean', false, 'Master takeaway switch'),
  ('in_store_available', 'true', 'boolean', false, 'Master in-store POS switch'),
  ('delivery_unavailable_message', 'Delivery is temporarily unavailable because our delivery person is busy. Please try again later.', 'string', false, 'Message shown when delivery is disabled'),
  ('delivery_person_name', '', 'string', false, 'Delivery person name'),
  ('delivery_person_phone', '', 'string', false, 'Delivery person phone'),
  ('delivery_fixed_slots_enabled', 'false', 'boolean', false, 'Enable fixed delivery slots'),
  ('delivery_custom_message_enabled', 'false', 'boolean', false, 'Show custom delivery message'),
  ('delivery_custom_message', '', 'string', false, 'Custom delivery announcement message'),
  ('delivery_slots', '[]', 'json', false, 'Configured scheduled delivery time slots'),
  ('delivery_person_emails', '[]', 'json', false, 'List of delivery personnel email addresses'),
  ('store_delivery_locations', '[]', 'json', false, 'Available delivery locations list'),

  -- Telegram Notifications
  ('telegram_enabled', 'false', 'boolean', false, 'Enable Telegram notifications'),
  ('telegram_bot_token', '', 'string', true, 'Telegram bot token'),
  ('telegram_chat_id', '', 'string', false, 'Telegram chat ID'),
  ('telegram_show_qr', 'false', 'boolean', false, 'Show Telegram QR in receipts'),
  ('telegram_qr_expiry_minutes', '15', 'number', false, 'Telegram QR code expiry minutes'),

  -- SMTP / Email
  ('smtp_enabled', 'false', 'boolean', false, 'Enable SMTP email delivery'),
  ('smtp_host', '', 'string', false, 'SMTP server host'),
  ('smtp_port', '587', 'number', false, 'SMTP server port'),
  ('smtp_user', '', 'string', false, 'SMTP username'),
  ('smtp_pass', '', 'string', true, 'SMTP password'),
  ('smtp_from', '', 'string', false, 'SMTP From address'),

  -- Fees & Pricing
  ('pricing_enabled', 'true', 'boolean', false, 'Pricing rules enabled'),
  ('delivery_fee', '10', 'number', false, 'Flat delivery fee for orders'),
  ('maintenance_fee', '1', 'number', false, 'Standard platform maintenance charge'),
  ('min_order_amount', '0', 'number', false, 'Minimum order amount threshold'),
  ('wallet_credit_limit', '500', 'number', false, 'Maximum credit limit for customer wallet'),
  ('packaging_charge_enabled', 'true', 'boolean', false, 'Toggle dynamic packaging fee'),
  ('packaging_big_packet_price', '3', 'number', false, 'Price per big packaging packet (₹)'),
  ('packaging_small_packet_price', '2', 'number', false, 'Price per small packaging packet (₹)'),

  -- Store Hours & Status
  ('store_open_time', '09:00', 'string', false, 'Daily operating opening hour (HH:MM)'),
  ('store_close_time', '22:00', 'string', false, 'Daily operating closing hour (HH:MM)'),
  ('store_is_open', 'true', 'boolean', false, 'Manual store open override'),
  ('store_temp_close_until', '', 'string', false, 'Temporary close until timestamp/time'),
  ('store_order_cutoff_lunch', '', 'string', false, 'Lunch order cutoff time'),
  ('store_order_cutoff_dinner', '', 'string', false, 'Dinner order cutoff time'),
  ('cancellation_window_minutes', '2', 'number', false, 'Customer cancellation window in minutes'),
  ('maintenance_mode', 'false', 'boolean', false, 'Put site into maintenance mode'),
  ('other_enabled', 'true', 'boolean', false, 'Other settings section enabled'),

  -- Platform Administration & Promotions
  ('admin_emails', '["ane@gmail.com"]', 'json', false, 'List of admin email accounts'),
  ('owner_email', 'ane@gmail.com', 'string', false, 'Primary platform owner contact email'),
  ('bumper_offers_enabled', 'true', 'boolean', false, 'Toggle home banner bumper slider'),
  ('bumper_offers', '[]', 'json', false, 'List of home screen bumper media banners')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;

-- Initial default restaurant seed
INSERT INTO public.restaurants (
  id, owner_id, name, slug, description, cuisine_type, phone, email,
  address_line1, city, state, postal_code, is_active, is_open, opening_time, closing_time
) VALUES (
  'd1111111-1111-1111-1111-111111111111',
  '5c262804-b3d8-4815-a41f-2ce1cab12fa1',
  'Badmaas House Cafe',
  'badmaas-house-cafe',
  'Signature brews, specialty coffee, and mouth-watering bites cooked fresh with passion.',
  'Cafe, Fast Food, Snacks, Beverages',
  '',
  'ane@gmail.com',
  'BTM',
  'Bangalore',
  'Karnataka',
  '560076',
  true,
  true,
  '09:00:00'::TIME,
  '22:00:00'::TIME
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.restaurant_settings (
  restaurant_id, min_order_amount, delivery_fee, estimated_prep_time
) VALUES (
  'd1111111-1111-1111-1111-111111111111',
  0,
  10,
  20
) ON CONFLICT (restaurant_id) DO NOTHING;
