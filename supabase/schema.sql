-- ============================================================================
-- 100% CLEAN PUBLIC SCHEMA FOR DILIP DA ECOM PLATFORM
-- STANDALONE POSTGRESQL (ZERO DEPENDENCY ON AUTH SCHEMA)
-- DYNAMIC RBAC: USERS, ROLES, PERMISSIONS, ROLE_PERMISSIONS, USER_ROLES
-- ============================================================================

-- Extensions in public
create extension if not exists "pgcrypto" schema public;
create extension if not exists "uuid-ossp" schema public;

-- Common updated_at trigger function
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. USERS (Master User Entity, Replaces auth.users)
-- ============================================================================
create table if not exists public.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  password_hash        text,
  full_name            text not null,
  phone                text,
  avatar_url           text,
  role                 text not null default 'student' check (role in ('student','merchant','delivery','admin','super_admin','owner')),
  is_active            boolean not null default true,
  is_cit_student       boolean not null default false,
  student_email        text,
  student_verified_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();

-- 2. DYNAMIC RBAC: ROLES, PERMISSIONS, ROLE_PERMISSIONS, USER_ROLES
-- ============================================================================
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.update_updated_at();

create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  module      text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id    uuid not null references public.users(id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- RBAC Helper Functions
create or replace function public.has_permission(p_user_id uuid, p_permission_code text)
returns boolean as $$
declare
  has_perm boolean;
begin
  -- Super admin has all permissions
  if exists (
    select 1 from public.user_roles ur
    join public.roles r on ur.role_id = r.id
    where ur.user_id = p_user_id and r.slug in ('super_admin', 'admin')
  ) or exists (
    select 1 from public.users where id = p_user_id and role in ('super_admin', 'admin')
  ) then
    return true;
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on ur.role_id = rp.role_id
    join public.permissions p on rp.permission_id = p.id
    where ur.user_id = p_user_id and p.code = p_permission_code
  ) into has_perm;

  return coalesce(has_perm, false);
end;
$$ language plpgsql security definer;

create or replace function public.get_user_permissions(p_user_id uuid)
returns table(permission_code text) as $$
begin
  return query
  select distinct p.code
  from public.user_roles ur
  join public.role_permissions rp on ur.role_id = rp.role_id
  join public.permissions p on rp.permission_id = p.id
  where ur.user_id = p_user_id;
end;
$$ language plpgsql security definer;

-- 3. PROFILES (Backward Compatibility Table Synced with users)
-- ============================================================================
create table if not exists public.profiles (
  id                  uuid primary key references public.users(id) on delete cascade,
  email               text not null,
  full_name           text not null,
  phone               text,
  avatar_url          text,
  role                text not null default 'student' check (role in ('student','merchant','delivery','admin','super_admin','owner')),
  is_active           boolean not null default true,
  is_cit_student      boolean not null default false,
  student_email       text,
  student_verified_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- Keep profiles synced with users
create or replace function public.sync_user_to_profile()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, phone, avatar_url, role, is_active, is_cit_student, student_email, student_verified_at, created_at, updated_at, deleted_at)
  values (new.id, new.email, new.full_name, new.phone, new.avatar_url, new.role, new.is_active, new.is_cit_student, new.student_email, new.student_verified_at, new.created_at, new.updated_at, new.deleted_at)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    avatar_url = excluded.avatar_url,
    role = excluded.role,
    is_active = excluded.is_active,
    is_cit_student = excluded.is_cit_student,
    student_email = excluded.student_email,
    student_verified_at = excluded.student_verified_at,
    updated_at = now(),
    deleted_at = excluded.deleted_at;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_user_to_profile
  after insert or update on public.users
  for each row execute function public.sync_user_to_profile();

-- 4. RESTAURANTS & SETTINGS
-- ============================================================================
create table if not exists public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users(id) on delete restrict,
  name            text not null,
  slug            text not null unique,
  description     text,
  cuisine_type    text,
  phone           text,
  email           text,
  address_line1   text not null,
  address_line2   text,
  city            text not null,
  state           text not null,
  postal_code     text not null,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  cover_image     text,
  logo_url        text,
  opening_time    time not null default '09:00',
  closing_time    time not null default '22:00',
  is_active       boolean not null default true,
  is_open         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create trigger trg_restaurants_updated_at
  before update on public.restaurants
  for each row execute function public.update_updated_at();

create table if not exists public.restaurant_settings (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null unique references public.restaurants(id) on delete cascade,
  min_order_amount      numeric(10,2) not null default 0,
  delivery_fee          numeric(10,2) not null default 0,
  free_delivery_above   numeric(10,2),
  max_delivery_distance numeric(6,2),
  estimated_prep_time   integer not null default 20,
  is_bnpl_enabled       boolean not null default true,
  bnpl_interest_rate    numeric(5,2) not null default 0,
  bnpl_max_term_days    integer not null default 15,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger trg_restaurant_settings_updated_at
  before update on public.restaurant_settings
  for each row execute function public.update_updated_at();

-- 5. CATEGORIES, PRODUCTS, PRODUCT_IMAGES, INVENTORY
-- ============================================================================
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  image_url       text,
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.update_updated_at();

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  category_id     uuid references public.categories(id) on delete set null,
  name            text not null,
  slug            text not null,
  description     text,
  price           numeric(10,2) not null check (price >= 0),
  compare_price   numeric(10,2) check (compare_price is null or compare_price >= price),
  cost_price      numeric(10,2),
  sku             text,
  is_veg          boolean not null default true,
  is_available    boolean not null default true,
  stock_quantity  integer not null default 0,
  low_stock_threshold integer not null default 5,
  track_inventory boolean not null default false,
  image_url       text,
  badge           text,
  weight          text,
  flavor          text,
  is_eggless      boolean,
  packaging_type  text not null default 'small' check (packaging_type in ('none', 'small', 'big')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (restaurant_id, slug)
);

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at();

create table if not exists public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  image_url     text not null,
  alt_text      text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.inventory_logs (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  change_amount integer not null,
  previous_stock integer not null,
  current_stock integer not null,
  reason        text not null,
  reference_id  uuid,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- 6. ADDRESSES
-- ============================================================================
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  label         text not null default 'Home',
  address_line1 text not null,
  address_line2 text,
  city          text not null,
  state         text not null,
  postal_code   text not null,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_addresses_updated_at
  before update on public.addresses
  for each row execute function public.update_updated_at();

-- 7. ORDERS & ORDER_ITEMS
-- ============================================================================
create or replace function public.generate_tracking_code()
returns text as $$
declare
  chars text[] := '{A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z,2,3,4,5,6,7,8,9}';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || chars[1 + floor(random() * array_length(chars, 1))::int];
  end loop;
  return 'DD-' || result;
end;
$$ language plpgsql;

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  tracking_code         text not null unique default public.generate_tracking_code(),
  user_id               uuid not null references public.users(id) on delete restrict,
  restaurant_id         uuid not null references public.restaurants(id) on delete restrict,
  delivery_partner_id   uuid references public.users(id) on delete set null,
  status                text not null default 'placed' check (status in (
    'placed','confirmed','preparing','ready_for_pickup',
    'out_for_delivery','delivered','cancelled','refunded'
  )),
  order_type            text check (order_type in ('room_delivery', 'takeaway', 'dine_in', 'in_store')),
  subtotal              numeric(10,2) not null check (subtotal >= 0),
  tax_amount            numeric(10,2) not null default 0,
  delivery_fee          numeric(10,2) not null default 0,
  discount_amount       numeric(10,2) not null default 0,
  total_amount          numeric(10,2) not null check (total_amount >= 0),
  delivery_address_id   uuid references public.addresses(id) on delete set null,
  delivery_address_json jsonb,
  special_instructions  text,
  cancellation_reason   text,
  placed_at             timestamptz not null default now(),
  confirmed_at          timestamptz,
  prepared_at           timestamptz,
  picked_up_at          timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_orders_user on public.orders(user_id);
create index if not exists idx_orders_restaurant on public.orders(restaurant_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_tracking on public.orders(tracking_code);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  product_price numeric(10,2) not null check (product_price >= 0),
  quantity      integer not null check (quantity > 0),
  item_total    numeric(10,2) not null check (item_total >= 0),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- 8. PAYMENTS & PAYMENT_LOGS
-- ============================================================================
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  amount              numeric(10,2) not null check (amount >= 0),
  currency            text not null default 'INR',
  payment_method      text not null check (payment_method in ('razorpay','cod','bnpl','phonepe','gpay','wallet','cash')),
  status              text not null default 'pending' check (status in ('pending','authorized','captured','failed','refunded')),
  gateway_payment_id  text,
  gateway_order_id    text,
  gateway_signature   text,
  error_code          text,
  error_description   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.update_updated_at();

create table if not exists public.payment_logs (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments(id) on delete cascade,
  event_type    text not null,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

-- 9. WALLETS & WALLET_TRANSACTIONS
-- ============================================================================
create table if not exists public.wallets (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid references public.restaurants(id) on delete set null,
  user_id               uuid not null references public.users(id) on delete cascade unique,
  balance               numeric(12,2) not null default 0.00 check (balance >= 0),
  total_credit          numeric(12,2) not null default 0.00,
  total_debit           numeric(12,2) not null default 0.00,
  credit_limit          numeric(12,2) not null default 0.00 check (credit_limit >= 0),
  credit_used           numeric(12,2) not null default 0.00,
  credit_used_at        timestamptz,
  late_fee_rate         numeric(12,2) not null default 50.00,
  total_penalties       numeric(12,2) not null default 0.00,
  status                text not null default 'unverified' check (status in ('unverified', 'pending', 'active', 'frozen', 'suspended', 'rejected')),
  kyc_name              text,
  kyc_email             text,
  document_type         text,
  kyc_photo_url         text,
  pan_card_url          text,
  kyc_submitted_at      timestamptz,
  kyc_approved_at       timestamptz,
  kyc_rejection_reason  text,
  is_frozen             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_wallets_status on public.wallets(status);

create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.update_updated_at();

create table if not exists public.wallet_transactions (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid references public.restaurants(id) on delete set null,
  wallet_id         uuid not null references public.wallets(id) on delete cascade,
  user_id           uuid references public.users(id) on delete cascade,
  type              text not null check (type in ('credit', 'debit', 'topup', 'payment', 'refund')),
  amount            numeric(12,2) not null check (amount > 0),
  balance_before    numeric(12,2) not null default 0.00,
  balance_after     numeric(12,2) not null,
  order_id          text,
  payment_reference text,
  reference_id      text,
  description       text not null,
  reference         text,
  note              text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_user on public.wallet_transactions(user_id);
create index if not exists idx_wallet_transactions_created on public.wallet_transactions(created_at desc);

-- 10. CREDIT / BNPL SYSTEM
-- ============================================================================
create table if not exists public.credit_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade unique,
  credit_limit  numeric(10,2) not null default 1000.00 check (credit_limit >= 0),
  used_credit   numeric(10,2) not null default 0.00 check (used_credit >= 0),
  is_locked     boolean not null default false,
  locked_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_credit_accounts_updated_at
  before update on public.credit_accounts
  for each row execute function public.update_updated_at();

create table if not exists public.credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  order_id          uuid references public.orders(id) on delete set null,
  amount            numeric(10,2) not null,
  type              text not null check (type in ('purchase','repayment','penalty','adjustment')),
  reference         text,
  created_at        timestamptz not null default now()
);

create table if not exists public.credit_repayments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  amount            numeric(10,2) not null check (amount > 0),
  due_date          date not null,
  status            text not null default 'pending' check (status in ('pending','paid','overdue','partially_paid')),
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.credit_audit_logs (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  action            text not null,
  previous_state    jsonb,
  new_state         jsonb,
  actor_id          uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- 11. NOTIFICATIONS & PUSH
-- ============================================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text not null default 'general',
  metadata    jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_user_push_subscriptions_updated_at
  before update on public.user_push_subscriptions
  for each row execute function public.update_updated_at();

-- 12. DELIVERY PARTNERS & ASSIGNMENTS
-- ============================================================================
create table if not exists public.delivery_partners (
  id          uuid primary key references public.users(id) on delete cascade,
  vehicle_type text,
  vehicle_no  text,
  is_available boolean not null default false,
  latitude    numeric(10,7),
  longitude   numeric(10,7),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.delivery_assignments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  delivery_partner_id uuid not null references public.users(id) on delete cascade,
  status              text not null default 'assigned' check (status in ('assigned','accepted','declined','picked_up','delivered')),
  assigned_at         timestamptz not null default now(),
  completed_at        timestamptz
);

-- 13. REVIEWS & RATINGS
-- ============================================================================
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rating        integer not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);

create table if not exists public.ratings (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  rating        integer not null check (rating between 1 and 5),
  review        text,
  created_at    timestamptz not null default now()
);

-- 14. AUDIT & ACTIVITY LOGS
-- ============================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,
  table_name  text not null,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  activity    text not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- 15. REPORTS & ANALYTICS
-- ============================================================================
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  report_type text not null,
  data        jsonb not null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.analytics (
  id          uuid primary key default gen_random_uuid(),
  metric      text not null,
  value       numeric(12,2) not null,
  period      text not null,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- 16. SYSTEM SETTINGS
-- ============================================================================
create table if not exists public.system_settings (
  key         text primary key,
  value       text,
  type        text not null default 'string' check (type in ('string', 'number', 'boolean', 'json')),
  is_secret   boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null
);

-- 17. CIT OTP REQUESTS & FAVORITES
-- ============================================================================
create table if not exists public.cit_otp_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  email       text not null,
  otp_hash    text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id, product_id)
);

-- 18. EXPENSE TRACKER
-- ============================================================================
create table if not exists public.expense_settings (
  id                  uuid primary key default gen_random_uuid(),
  is_active           boolean not null default true,
  daily_loss_limit    numeric(10,2) not null default 5000.00,
  notify_telegram     boolean not null default true,
  notify_email        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.expense_transactions (
  id                  uuid primary key default gen_random_uuid(),
  category            text not null,
  amount              numeric(10,2) not null check (amount > 0),
  description         text not null,
  payment_mode        text not null default 'cash',
  recorded_by         uuid references public.users(id) on delete set null,
  receipt_url         text,
  expense_date        date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 19. BUSINESS FUNCTIONS
-- ============================================================================
create or replace function public.get_order_by_tracking(lookup_code text)
returns table (
  order_id            uuid,
  tracking_code       text,
  status              text,
  order_type          text,
  restaurant_name     text,
  total_amount        numeric,
  placed_at           timestamptz,
  item_names          text[]
) as $$
begin
  return query
  select
    o.id,
    o.tracking_code,
    o.status,
    o.order_type,
    r.name,
    o.total_amount,
    o.placed_at,
    coalesce(array_agg(oi.product_name), '{}'::text[])
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.order_items oi on oi.order_id = o.id
  where o.tracking_code = lookup_code
  group by o.id, o.tracking_code, o.status, o.order_type, r.name, o.total_amount, o.placed_at;
end;
$$ language plpgsql security definer;

create or replace function public.get_merchant_dashboard(p_restaurant_id uuid)
returns jsonb as $$
declare
  v_total_orders      bigint;
  v_today_orders      bigint;
  v_total_revenue     numeric;
  v_today_revenue     numeric;
  v_active_products   bigint;
begin
  select count(*), coalesce(sum(total_amount), 0)
    into v_total_orders, v_total_revenue
    from public.orders
   where restaurant_id = p_restaurant_id and status != 'cancelled';

  select count(*), coalesce(sum(total_amount), 0)
    into v_today_orders, v_today_revenue
    from public.orders
   where restaurant_id = p_restaurant_id and status != 'cancelled'
     and placed_at >= current_date;

  select count(*) into v_active_products
    from public.products
   where restaurant_id = p_restaurant_id and is_available = true and deleted_at is null;

  return jsonb_build_object(
    'total_orders',     v_total_orders,
    'today_orders',     v_today_orders,
    'total_revenue',    v_total_revenue,
    'today_revenue',    v_today_revenue,
    'active_products',  v_active_products
  );
end;
$$ language plpgsql security definer;

-- 20. INITIAL SEED DATA: PERMISSIONS, ROLES, ROLE_PERMISSIONS
-- ============================================================================

-- Insert Standard Permissions
insert into public.permissions (code, module, description) values
  ('orders.view', 'Orders', 'View all customer and store orders'),
  ('orders.update_status', 'Orders', 'Update order progress (prep, ready, delivered)'),
  ('orders.cancel', 'Orders', 'Cancel orders and issue cancellations'),
  ('orders.refund', 'Orders', 'Issue refunds on paid orders'),
  ('products.view', 'Catalog', 'View menu items and categories'),
  ('products.create', 'Catalog', 'Add new products and items'),
  ('products.edit', 'Catalog', 'Edit product prices, details, and stock'),
  ('products.delete', 'Catalog', 'Delete or archive menu products'),
  ('categories.manage', 'Catalog', 'Create and modify food categories'),
  ('merchants.view', 'Merchants', 'View merchant restaurant profiles'),
  ('merchants.edit', 'Merchants', 'Edit restaurant timings, details, and settings'),
  ('merchants.approve', 'Merchants', 'Approve or disable merchant accounts'),
  ('wallet.view', 'Finance', 'View user wallets and balances'),
  ('wallet.credit_adjust', 'Finance', 'Manually credit or debit user wallets'),
  ('bnpl.manage', 'Finance', 'Manage student credit limits and overdue accounts'),
  ('expenses.manage', 'Finance', 'Record and audit store daily expenses'),
  ('delivery.view', 'Delivery', 'View delivery assignments and fleet'),
  ('delivery.assign', 'Delivery', 'Assign delivery partners to orders'),
  ('settings.view', 'Settings', 'View platform system settings'),
  ('settings.edit', 'Settings', 'Modify system settings, fees, and toggles'),
  ('roles.manage', 'Administration', 'Create, modify, and assign user roles & permissions'),
  ('users.view', 'Administration', 'View student and staff user profiles'),
  ('users.manage', 'Administration', 'Edit user roles, freeze, or activate accounts'),
  ('audit.view', 'Administration', 'View system audit logs and security events')
on conflict (code) do nothing;

-- Insert Default Roles
insert into public.roles (name, slug, description, is_system) values
  ('Super Administrator', 'super_admin', 'Full system access with all privileges', true),
  ('Store Administrator', 'admin', 'Store operations, catalog, orders, and user management', true),
  ('Store Owner (Dilip Da)', 'owner', 'Read-only store owner dashboard and financial overview', true),
  ('Merchant / Restaurant', 'merchant', 'Manage menu, timings, and incoming restaurant orders', true),
  ('Delivery Partner', 'delivery', 'Pick up and deliver assigned customer orders', true),
  ('Customer / Student', 'student', 'Browse menu, order food, and manage wallet', true)
on conflict (slug) do nothing;

-- Map All Permissions to Super Admin
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'super_admin'
on conflict (role_id, permission_id) do nothing;

-- Map Admin Permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'admin'
  and p.code in (
    'orders.view', 'orders.update_status', 'orders.cancel', 'orders.refund',
    'products.view', 'products.create', 'products.edit', 'products.delete', 'categories.manage',
    'merchants.view', 'merchants.edit',
    'wallet.view', 'wallet.credit_adjust', 'bnpl.manage', 'expenses.manage',
    'delivery.view', 'delivery.assign',
    'settings.view', 'settings.edit',
    'users.view', 'users.manage', 'audit.view'
  )
on conflict (role_id, permission_id) do nothing;

-- Map Merchant Permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'merchant'
  and p.code in (
    'orders.view', 'orders.update_status',
    'products.view', 'products.create', 'products.edit', 'categories.manage',
    'merchants.view', 'merchants.edit'
  )
on conflict (role_id, permission_id) do nothing;

-- Map Delivery Permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'delivery'
  and p.code in ('delivery.view', 'orders.view', 'orders.update_status')
on conflict (role_id, permission_id) do nothing;

-- 21. INITIAL SYSTEM SETTINGS SEED
-- ============================================================================
insert into public.system_settings (key, value, type, is_secret, description) values
  ('maintenance_mode', 'false', 'boolean', false, 'Enable platform maintenance mode'),
  ('cancellation_window_minutes', '2', 'number', false, 'Customer cancellation window in minutes'),
  ('payment_method_wallet_enabled', 'true', 'boolean', false, 'Enable Wallet payments'),
  ('payment_method_razorpay_enabled', 'true', 'boolean', false, 'Enable Razorpay payments'),
  ('payment_method_cod_enabled', 'true', 'boolean', false, 'Enable Cash on Delivery'),
  ('packaging_charge_enabled', 'true', 'boolean', false, 'Enable packaging charges'),
  ('packaging_small_packet_price', '5', 'number', false, 'Small packet packaging price (INR)'),
  ('packaging_big_packet_price', '10', 'number', false, 'Big packet packaging price (INR)'),
  ('delivery_available', 'true', 'boolean', false, 'Delivery availability toggle'),
  ('telegram_show_qr', 'true', 'boolean', false, 'Send pickup QR in Telegram'),
  ('telegram_qr_expiry_minutes', '15', 'number', false, 'Telegram pickup QR expiry minutes')
on conflict (key) do nothing;
