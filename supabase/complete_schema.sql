-- ============================================================================
-- BODOSA / DILIP DA ECOM PLATFORM - MASTER DATABASE SCHEMA
-- ALL TABLES, FIELDS, CONSTRAINTS, TRIGGERS, INDEXES & SEED SETTINGS
-- Standalone PostgreSQL (Zero Auth Schema Dependency)
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- Common updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. USERS (Master User Entity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','merchant','delivery','admin','super_admin','owner')),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  is_cit_student       BOOLEAN NOT NULL DEFAULT false,
  student_email        TEXT,
  student_verified_at  TIMESTAMPTZ,
  roll_no              TEXT,
  department           TEXT,
  batch                TEXT,
  is_verified          BOOLEAN NOT NULL DEFAULT false,
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  isdeleted            BOOLEAN NOT NULL DEFAULT false,
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON public.users(is_deleted);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. DYNAMIC RBAC: ROLES, PERMISSIONS, ROLE_PERMISSIONS, USER_ROLES
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
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  module      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- RBAC Helper Functions
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND r.slug IN ('super_admin', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.users WHERE id = p_user_id AND role IN ('super_admin', 'admin')
  ) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id AND p.code = p_permission_code
  ) INTO has_perm;

  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission_code TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.code
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role_id = rp.role_id
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. PROFILES (Backward Compatibility Table Synced with users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  phone               TEXT,
  avatar_url          TEXT,
  role                TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','merchant','delivery','admin','super_admin','owner')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  is_cit_student      BOOLEAN NOT NULL DEFAULT false,
  student_email       TEXT,
  student_verified_at TIMESTAMPTZ,
  roll_no             TEXT,
  department          TEXT,
  batch               TEXT,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  isdeleted           BOOLEAN NOT NULL DEFAULT false,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_is_deleted ON public.profiles(is_deleted);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto sync profile when users table is inserted/updated
CREATE OR REPLACE FUNCTION public.sync_user_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, phone, avatar_url, role, is_active,
    is_cit_student, student_email, student_verified_at,
    roll_no, department, batch, is_verified,
    is_deleted, isdeleted, deleted_at, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, NEW.full_name, NEW.phone, NEW.avatar_url, NEW.role, NEW.is_active,
    NEW.is_cit_student, NEW.student_email, NEW.student_verified_at,
    NEW.roll_no, NEW.department, NEW.batch, NEW.is_verified,
    NEW.is_deleted, NEW.isdeleted, NEW.deleted_at, NEW.created_at, NEW.updated_at
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
    roll_no = EXCLUDED.roll_no,
    department = EXCLUDED.department,
    batch = EXCLUDED.batch,
    is_verified = EXCLUDED.is_verified,
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

-- 4. RESTAURANTS & SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restaurants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT,
  cuisine_type    TEXT,
  phone           TEXT,
  email           TEXT,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  cover_image     TEXT,
  logo_url        TEXT,
  opening_time    TIME NOT NULL DEFAULT '09:00',
  closing_time    TIME NOT NULL DEFAULT '22:00',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_open         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON public.restaurants;
CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  min_order_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
  free_delivery_above   NUMERIC(10,2),
  max_delivery_distance NUMERIC(6,2),
  estimated_prep_time   INTEGER NOT NULL DEFAULT 20,
  is_bnpl_enabled       BOOLEAN NOT NULL DEFAULT true,
  bnpl_interest_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
  bnpl_max_term_days    INTEGER NOT NULL DEFAULT 15,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_restaurant_settings_updated_at ON public.restaurant_settings;
CREATE TRIGGER trg_restaurant_settings_updated_at
  BEFORE UPDATE ON public.restaurant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. CATEGORIES, PRODUCTS, PRODUCT_IMAGES, INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
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
  full_description    TEXT,
  price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  compare_price       NUMERIC(10,2) CHECK (compare_price IS NULL OR compare_price >= price),
  cost_price          NUMERIC(10,2),
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
  packaging_big_qty   INTEGER NOT NULL DEFAULT 0 CHECK (packaging_big_qty >= 0),
  packaging_small_qty INTEGER NOT NULL DEFAULT 0 CHECK (packaging_small_qty >= 0),
  servings            TEXT,
  pieces              TEXT,
  portion_size        TEXT,
  included_items      TEXT[] DEFAULT '{}',
  ingredients         TEXT[] DEFAULT '{}',
  allergens           TEXT[] DEFAULT '{}',
  delivery_time       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (restaurant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_restaurant ON public.products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);

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
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7. ORDERS & ORDER_ITEMS
-- ============================================================================
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

CREATE TABLE IF NOT EXISTS public.orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code         TEXT NOT NULL UNIQUE DEFAULT public.generate_tracking_code(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  restaurant_id         UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  delivery_partner_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'placed' CHECK (status IN (
    'placed','confirmed','pending','accepted','declined','preparing',
    'ready','ready_for_pickup','assigned','out_for_delivery','delivered','completed','cancelled','refunded'
  )),
  order_type            TEXT CHECK (order_type IN ('room_delivery', 'takeaway', 'dine_in', 'in_store')),
  subtotal              NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  delivery_address_id   UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  delivery_address_json JSONB,
  special_instructions  TEXT,
  cancellation_reason   TEXT,
  pickup_qr_token       TEXT,
  pickup_qr_expires_at  TIMESTAMPTZ,
  placed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  prepared_at           TIMESTAMPTZ,
  picked_up_at          TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
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
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name          TEXT NOT NULL,
  product_price         NUMERIC(10,2) NOT NULL CHECK (product_price >= 0),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  subtotal              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  item_total            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (item_total >= 0),
  notes                 TEXT,
  special_instructions  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- 8. PAYMENTS & PAYMENT_LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount              NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  payment_method      TEXT NOT NULL CHECK (payment_method IN ('razorpay','cod','bnpl','phonepe','gpay','wallet','cash','upi')),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','captured','failed','refunded','processing','confirmed','collected')),
  gateway_payment_id  TEXT,
  gateway_order_id    TEXT,
  gateway_signature   TEXT,
  error_code          TEXT,
  error_description   TEXT,
  collected_at        TIMESTAMPTZ,
  collected_by        UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. WALLETS & WALLET_TRANSACTIONS (Supports Ethics Pay BNPL Overdraft)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  balance               NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_credit          NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_debit           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_limit          NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
  credit_used           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_used_at        TIMESTAMPTZ,
  late_fee_rate         NUMERIC(12,2) NOT NULL DEFAULT 50.00,
  total_penalties       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status                TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'pending', 'active', 'frozen', 'suspended', 'rejected')),
  kyc_name              TEXT,
  kyc_email             TEXT,
  document_type         TEXT,
  kyc_photo_url         TEXT,
  pan_card_url          TEXT,
  kyc_submitted_at      TIMESTAMPTZ,
  kyc_approved_at       TIMESTAMPTZ,
  kyc_rejection_reason  TEXT,
  is_frozen             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON public.wallets(status);

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  wallet_id         UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'topup', 'payment', 'refund')),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  balance_before    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  balance_after     NUMERIC(12,2) NOT NULL,
  order_id          TEXT,
  payment_reference TEXT,
  reference_id      TEXT,
  description       TEXT NOT NULL,
  reference         TEXT,
  note              TEXT,
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON public.wallet_transactions(created_at DESC);

-- 10. CREDIT / BNPL SYSTEM
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.credit_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  credit_limit  NUMERIC(10,2) NOT NULL DEFAULT 1000.00 CHECK (credit_limit >= 0),
  used_credit   NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (used_credit >= 0),
  is_locked     BOOLEAN NOT NULL DEFAULT false,
  locked_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_credit_accounts_updated_at ON public.credit_accounts;
CREATE TRIGGER trg_credit_accounts_updated_at
  BEFORE UPDATE ON public.credit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount            NUMERIC(10,2) NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('purchase','repayment','penalty','adjustment')),
  reference         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_repayments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  due_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','partially_paid')),
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  previous_state    JSONB,
  new_state         JSONB,
  actor_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. NOTIFICATIONS & PUSH SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'general',
  metadata    JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.user_push_subscriptions(user_id);

DROP TRIGGER IF EXISTS trg_user_push_subscriptions_updated_at ON public.user_push_subscriptions;
CREATE TRIGGER trg_user_push_subscriptions_updated_at
  BEFORE UPDATE ON public.user_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 12. DELIVERY PARTNERS & ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.delivery_partners (
  id              UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  vehicle_type    TEXT,
  vehicle_no      TEXT,
  is_available    BOOLEAN NOT NULL DEFAULT false,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','declined','picked_up','delivered')),
  pickup_time         TIMESTAMPTZ,
  delivery_time       TIMESTAMPTZ,
  qr_token_hash       TEXT,
  otp_value           TEXT,
  otp_hash            TEXT,
  otp_expires_at      TIMESTAMPTZ,
  otp_verified_at     TIMESTAMPTZ,
  otp_attempts        INTEGER NOT NULL DEFAULT 0,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deliv_assign_order ON public.delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_deliv_assign_partner ON public.delivery_assignments(delivery_partner_id);

-- 13. REVIEWS & RATINGS & FAVORITES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 14. EXPENSES TRACKER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expense_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
  starting_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  daily_loss_limit NUMERIC(10,2) NOT NULL DEFAULT 5000.00,
  notify_telegram  BOOLEAN NOT NULL DEFAULT true,
  notify_email     BOOLEAN NOT NULL DEFAULT true,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description      TEXT NOT NULL,
  payment_mode     TEXT NOT NULL DEFAULT 'cash',
  type             TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('income', 'expense')),
  note             TEXT,
  receipt_url      TEXT,
  recorded_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_tx_date ON public.expense_transactions(expense_date DESC, created_at DESC);

-- 15. AUDIT & ACTIVITY LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activity    TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. SYSTEM SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  type        TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
  is_public   BOOLEAN NOT NULL DEFAULT true,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- 17. CIT OTP REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cit_otp_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  otp_hash    TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. INITIAL SYSTEM SEED: PERMISSIONS
-- ============================================================================
INSERT INTO public.permissions (code, module, description) VALUES
  ('orders.view', 'Orders', 'View all customer and store orders'),
  ('orders.update_status', 'Orders', 'Update order progress (prep, ready, delivered)'),
  ('orders.cancel', 'Orders', 'Cancel orders and issue cancellations'),
  ('products.view', 'Products', 'View menu catalogue and items'),
  ('products.create', 'Products', 'Create new food items'),
  ('products.edit', 'Products', 'Edit menu item descriptions, prices, flags'),
  ('products.delete', 'Products', 'Remove food items from catalogue'),
  ('products.toggle_availability', 'Products', 'Quickly toggle stock in/out'),
  ('categories.manage', 'Categories', 'Create, update, or remove menu categories'),
  ('users.view', 'Users', 'View customer, delivery, and merchant accounts'),
  ('users.edit', 'Users', 'Edit account profiles, roles, and statuses'),
  ('users.delete', 'Users', 'Soft or hard delete user accounts'),
  ('roles.manage', 'RBAC', 'Manage roles and granular permissions matrix'),
  ('settings.view', 'Settings', 'View platform-level operational parameters'),
  ('settings.edit', 'Settings', 'Update platform-wide settings (fees, schedules)'),
  ('dashboard.view', 'Dashboard', 'Access primary executive management view'),
  ('analytics.view', 'Analytics', 'Access platform metrics, reports, and insights'),
  ('wallets.manage', 'Wallets', 'Inspect user balances, grant credit, adjust balances'),
  ('expenses.manage', 'Expenses', 'Record daily store expenditures and balance sheets')
ON CONFLICT (code) DO NOTHING;

-- 19. INITIAL SYSTEM SEED: ROLES
-- ============================================================================
INSERT INTO public.roles (name, slug, description, is_system) VALUES
  ('Super Administrator', 'super_admin', 'Full system access across all tenants and functions', true),
  ('Administrator', 'admin', 'Store operational and menu manager', true),
  ('Merchant / Kitchen Staff', 'merchant', 'Kitchen order preparation and inventory operator', true),
  ('Delivery Partner', 'delivery', 'Order pickup, dispatch, and doorstep verification operator', true),
  ('Student / Customer', 'student', 'Standard customer ordering food and utilizing wallet', true),
  ('Owner', 'owner', 'Platform owner read-only overview access', true)
ON CONFLICT (slug) DO NOTHING;

-- Map All Permissions to super_admin and admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

-- Map Kitchen / Merchant Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'orders.view', 'orders.update_status',
  'products.view', 'products.toggle_availability',
  'dashboard.view'
)
WHERE r.slug = 'merchant'
ON CONFLICT DO NOTHING;

-- 20. INITIAL SYSTEM SETTINGS SEED
-- ============================================================================
INSERT INTO public.system_settings (key, value, type, is_secret, is_public, description) VALUES
  ('delivery_fee', '20', 'number', false, true, 'Flat delivery fee for orders'),
  ('maintenance_fee', '1', 'number', false, true, 'Standard platform maintenance charge'),
  ('packaging_charge_enabled', 'true', 'boolean', false, true, 'Toggle dynamic packaging fee'),
  ('packaging_big_packet_price', '3', 'number', false, true, 'Price per big packaging packet (₹)'),
  ('packaging_small_packet_price', '2', 'number', false, true, 'Price per small packaging packet (₹)'),
  ('min_order_amount', '0', 'number', false, true, 'Minimum order amount threshold'),
  ('delivery_available', 'true', 'boolean', false, true, 'Master delivery switch'),
  ('takeaway_available', 'true', 'boolean', false, true, 'Master takeaway switch'),
  ('in_store_available', 'true', 'boolean', false, true, 'Master in-store POS switch'),
  ('store_open_time', '09:00', 'string', false, true, 'Daily operating opening hour (HH:MM)'),
  ('store_close_time', '22:00', 'string', false, true, 'Daily operating closing hour (HH:MM)'),
  ('store_is_open', 'true', 'boolean', false, true, 'Manual store open override'),
  ('admin_emails', '["ane@gmail.com"]', 'json', false, false, 'List of admin email accounts'),
  ('owner_email', 'ane@gmail.com', 'string', false, false, 'Primary platform owner contact email'),
  ('bumper_offers_enabled', 'true', 'boolean', false, true, 'Toggle home banner bumper slider'),
  ('bumper_offers', '[]', 'json', false, true, 'List of home screen bumper media banners'),
  ('delivery_fixed_slots_enabled', 'false', 'boolean', false, true, 'Toggle fixed batch delivery intervals'),
  ('delivery_slots', '[]', 'json', false, true, 'Configured scheduled delivery time slots')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;
