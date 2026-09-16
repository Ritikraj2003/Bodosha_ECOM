-- ============================================================================
-- Dilip Da Food Ordering Platform — PostgreSQL Schema
-- Supabase PostgreSQL with RLS
-- ============================================================================

-- 0. Extensions & Helpers
-- ============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function generate_tracking_code()
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

-- 1. Profiles (extends auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null,
  phone         text,
  avatar_url    text,
  role          text not null default 'student' check (role in ('student','merchant','delivery','admin','super_admin')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index idx_profiles_role on public.profiles(role);
create index idx_profiles_email on public.profiles(email);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Restaurants
-- ============================================================================
create table if not exists public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete restrict,
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
  delivery_fee    numeric(10,2) not null default 0 check (delivery_fee >= 0),
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),
  delivery_radius_km numeric(5,2) default 10,
  is_active       boolean not null default true,
  is_open         boolean not null default true,
  status          text not null default 'pending' check (status in ('pending','active','suspended','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_restaurants_owner on public.restaurants(owner_id);
create index idx_restaurants_slug on public.restaurants(slug);
create index idx_restaurants_city on public.restaurants(city);
create index idx_restaurants_status on public.restaurants(status);
create index idx_restaurants_cuisine on public.restaurants(cuisine_type);

create trigger trg_restaurants_updated_at
  before update on public.restaurants
  for each row execute function update_updated_at();

-- 3. Restaurant Settings
-- ============================================================================
create table if not exists public.restaurant_settings (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade unique,
  prep_time_minutes integer not null default 15 check (prep_time_minutes >= 5),
  max_orders_slot   integer not null default 50 check (max_orders_slot > 0),
  allow_preorder    boolean not null default false,
  allow_scheduled   boolean not null default false,
  gst_number        text,
  fssai_license     text,
  bank_account      text,
  upi_id            text,
  commission_rate   numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_restaurant_settings_updated_at
  before update on public.restaurant_settings
  for each row execute function update_updated_at();

-- 4. Categories
-- ============================================================================
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique(restaurant_id, slug)
);

create index idx_categories_restaurant on public.categories(restaurant_id);

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function update_updated_at();

-- 5. Products (Menu Items)
-- ============================================================================
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  category_id       uuid references public.categories(id) on delete set null,
  name              text not null,
  slug              text not null,
  description       text,
  price             numeric(10,2) not null check (price >= 0),
  compare_at_price  numeric(10,2) check (compare_at_price >= 0),
  cost_per_unit     numeric(10,2) check (cost_per_unit >= 0),
  unit              text not null default 'piece' check (unit in ('piece','plate','kg','g','ml','l','dozen','box')),
  is_vegetarian     boolean not null default false,
  is_vegan          boolean not null default false,
  is_gluten_free    boolean not null default false,
  spice_level       integer not null default 0 check (spice_level between 0 and 5),
  preparation_time  integer not null default 10 check (preparation_time >= 1),
  image             text,
  is_active         boolean not null default true,
  is_available      boolean not null default true,
  stock_quantity    integer not null default 0 check (stock_quantity >= 0),
  track_inventory   boolean not null default false,
  sort_order        integer not null default 0,
  tags              text[] default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique(restaurant_id, slug)
);

create index idx_products_restaurant on public.products(restaurant_id);
create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(is_active, is_available);
create index idx_products_tags on public.products using gin(tags);

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function update_updated_at();

-- 6. Product Images
-- ============================================================================
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt_text    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_product_images_product on public.product_images(product_id);

-- 7. Inventory Log
-- ============================================================================
create table if not exists public.inventory_logs (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  change      integer not null,
  reason      text not null,
  reference   text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index idx_inventory_logs_product on public.inventory_logs(product_id);

-- 8. Addresses
-- ============================================================================
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  label         text not null default 'Home',
  full_address  text not null,
  city          text not null,
  state         text not null,
  postal_code   text not null,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index idx_addresses_user on public.addresses(user_id);

create trigger trg_addresses_updated_at
  before update on public.addresses
  for each row execute function update_updated_at();

-- 9. Orders
-- ============================================================================
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  tracking_code     text not null unique default generate_tracking_code(),
  user_id           uuid references public.profiles(id),
  restaurant_id     uuid not null references public.restaurants(id) on delete restrict,
  delivery_address_id uuid references public.addresses(id) on delete set null,
  delivery_partner_id uuid references public.profiles(id),
  status            text not null default 'pending'
                    check (status in (
                      'pending','accepted','declined','preparing','ready',
                      'assigned','out_for_delivery','delivered','completed','cancelled'
                    )),
  status_history    jsonb[] default '{}',
  subtotal          numeric(10,2) not null check (subtotal >= 0),
  delivery_fee      numeric(10,2) not null default 0 check (delivery_fee >= 0),
  tax_amount        numeric(10,2) not null default 0 check (tax_amount >= 0),
  discount_amount   numeric(10,2) not null default 0 check (discount_amount >= 0),
  total             numeric(10,2) not null check (total >= 0),
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  delivery_address  jsonb,
  delivery_notes    text,
  payment_method    text check (payment_method in ('razorpay','bnpl','cod')),
  payment_status    text not null default 'pending' check (payment_status in ('pending','confirmed','failed','refunded')),
  scheduled_at      timestamptz,
  accepted_at       timestamptz,
  prepared_at       timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  cancellation_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index idx_orders_user on public.orders(user_id);
create index idx_orders_restaurant on public.orders(restaurant_id);
create index idx_orders_tracking on public.orders(tracking_code);
create index idx_orders_status on public.orders(status);
create index idx_orders_payment on public.orders(payment_status);
create index idx_orders_created on public.orders(created_at desc);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function update_updated_at();

-- Order status change tracking
create or replace function public.track_order_status()
returns trigger as $$
begin
  if old is null or old.status <> new.status then
    new.status_history = array_append(
      coalesce(new.status_history, '{}'),
      jsonb_build_object('status', new.status, 'timestamp', now(), 'note', new.delivery_notes)
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_orders_status_track
  before update on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.track_order_status();

-- 10. Order Items
-- ============================================================================
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete restrict,
  product_name  text not null,
  product_price numeric(10,2) not null check (product_price >= 0),
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  subtotal      numeric(10,2) not null check (subtotal >= 0),
  special_instructions text,
  created_at    timestamptz not null default now()
);

create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_product on public.order_items(product_id);

-- 11. Payments
-- ============================================================================
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  user_id         uuid references public.profiles(id),
  amount          numeric(10,2) not null check (amount > 0),
  currency        text not null default 'INR',
  payment_method  text not null check (payment_method in ('razorpay','bnpl','cod')),
  gateway         text not null default 'razorpay',
  gateway_order_id text,
  gateway_payment_id text,
  gateway_signature text,
  status          text not null default 'pending' check (status in ('pending','processing','confirmed','failed','refunded')),
  failure_reason  text,
  refund_amount   numeric(10,2) default 0 check (refund_amount >= 0),
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_payments_order on public.payments(order_id);
create index idx_payments_user on public.payments(user_id);
create index idx_payments_gateway on public.payments(gateway_order_id);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function update_updated_at();

-- 12. Payment Logs
-- ============================================================================
create table if not exists public.payment_logs (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid references public.payments(id) on delete cascade,
  event       text not null,
  payload     jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_payment_logs_payment on public.payment_logs(payment_id);

-- 13. Notifications
-- ============================================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('order','payment','bnpl','system','promo')),
  title       text not null,
  body        text,
  data        jsonb default '{}',
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, is_read);
create index idx_notifications_unread on public.notifications(user_id) where not is_read;

-- 14. BNPL — Credit Accounts
-- ============================================================================
create table if not exists public.credit_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade unique,
  credit_limit      numeric(10,2) not null check (credit_limit >= 0),
  available_credit  numeric(10,2) not null check (available_credit >= 0),
  outstanding       numeric(10,2) not null default 0 check (outstanding >= 0),
  status            text not null default 'active' check (status in ('active','suspended','closed')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  credit_score      integer check (credit_score between 300 and 900),
  interest_rate     numeric(5,2) not null default 0 check (interest_rate >= 0),
  late_fee_rate     numeric(5,2) not null default 2.0 check (late_fee_rate >= 0),
  due_days          integer not null default 15 check (due_days >= 1),
  last_repayment_at timestamptz,
  activated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint available_credit_check check (available_credit + outstanding <= credit_limit)
);

create index idx_credit_accounts_user on public.credit_accounts(user_id);
create index idx_credit_accounts_status on public.credit_accounts(status);

create trigger trg_credit_accounts_updated_at
  before update on public.credit_accounts
  for each row execute function update_updated_at();

-- 15. BNPL — Credit Transactions
-- ============================================================================
create table if not exists public.credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  order_id          uuid references public.orders(id) on delete set null,
  type              text not null check (type in ('purchase','repayment','fee','adjustment','restoration')),
  amount            numeric(10,2) not null check (amount > 0),
  balance_before    numeric(10,2) not null,
  balance_after     numeric(10,2) not null,
  description       text,
  reference         text,
  created_at        timestamptz not null default now()
);

create index idx_credit_tx_account on public.credit_transactions(credit_account_id);
create index idx_credit_tx_order on public.credit_transactions(order_id);
create index idx_credit_tx_type on public.credit_transactions(type);
create index idx_credit_tx_created on public.credit_transactions(created_at desc);

-- 16. BNPL — Repayments
-- ============================================================================
create table if not exists public.credit_repayments (
  id                uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  transaction_id    uuid references public.credit_transactions(id) on delete set null,
  amount            numeric(10,2) not null check (amount > 0),
  due_date          date not null,
  paid_at           timestamptz,
  late_fee_applied  numeric(10,2) not null default 0 check (late_fee_applied >= 0),
  status            text not null default 'pending' check (status in ('pending','paid','overdue','partial')),
  payment_method    text check (payment_method in ('razorpay','wallet')),
  gateway_payment_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_credit_repayments_account on public.credit_repayments(credit_account_id);
create index idx_credit_repayments_due on public.credit_repayments(due_date) where status = 'pending';
create index idx_credit_repayments_status on public.credit_repayments(status);

create trigger trg_credit_repayments_updated_at
  before update on public.credit_repayments
  for each row execute function update_updated_at();

-- 17. Delivery Partners
-- ============================================================================
create table if not exists public.delivery_partners (
  id                uuid primary key references public.profiles(id) on delete cascade,
  restaurant_id     uuid references public.restaurants(id) on delete set null,
  vehicle_type      text default 'bike',
  license_plate     text,
  is_available      boolean not null default true,
  is_online         boolean not null default false,
  current_latitude  numeric(10,7),
  current_longitude numeric(10,7),
  total_deliveries  integer not null default 0,
  rating            numeric(3,2) default 5.0 check (rating between 1.0 and 5.0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index idx_delivery_partners_available on public.delivery_partners(is_available, is_online);

create trigger trg_delivery_partners_updated_at
  before update on public.delivery_partners
  for each row execute function update_updated_at();

-- 18. Delivery Assignments
-- ============================================================================
create table if not exists public.delivery_assignments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  delivery_partner_id uuid not null references public.delivery_partners(id) on delete restrict,
  status              text not null default 'assigned' check (status in ('assigned','picked_up','in_transit','delivered','failed')),
  assigned_at         timestamptz not null default now(),
  picked_up_at        timestamptz,
  delivered_at        timestamptz,
  delivery_notes      text,
  customer_rating     integer check (customer_rating between 1 and 5),
  created_at          timestamptz not null default now()
);

create index idx_delivery_assignments_order on public.delivery_assignments(order_id);
create index idx_delivery_assignments_partner on public.delivery_assignments(delivery_partner_id);
create index idx_delivery_assignments_active on public.delivery_assignments(delivery_partner_id) where status in ('assigned','picked_up','in_transit');

-- 19. Reviews
-- ============================================================================
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  is_verified boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique(product_id, user_id)
);

create index idx_reviews_product on public.reviews(product_id);
create index idx_reviews_user on public.reviews(user_id);

-- 20. Ratings (Restaurant-level)
-- ============================================================================
create table if not exists public.ratings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  food_rating   integer check (food_rating between 1 and 5),
  delivery_rating integer check (delivery_rating between 1 and 5),
  overall_rating integer not null check (overall_rating between 1 and 5),
  body          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(restaurant_id, user_id)
);

create index idx_ratings_restaurant on public.ratings(restaurant_id);

-- 21. Audit Logs
-- ============================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert','update','delete','restore')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references public.profiles(id),
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_audit_logs_table on public.audit_logs(table_name, created_at desc);
create index idx_audit_logs_user on public.audit_logs(changed_by);

-- 22. Activity Logs
-- ============================================================================
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  action      text not null,
  resource    text,
  resource_id uuid,
  metadata    jsonb default '{}',
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_activity_logs_user on public.activity_logs(user_id, created_at desc);
create index idx_activity_logs_action on public.activity_logs(action);

-- 23. Reports
-- ============================================================================
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references public.restaurants(id) on delete cascade,
  generated_by    uuid not null references public.profiles(id),
  type            text not null check (type in ('sales','orders','payments','bnpl','delivery','custom')),
  date_range_from date not null,
  date_range_to   date not null,
  config          jsonb default '{}',
  data            jsonb,
  status          text not null default 'pending' check (status in ('pending','generating','completed','failed')),
  file_url        text,
  created_at      timestamptz not null default now()
);

create index idx_reports_type on public.reports(type, created_at desc);

-- 24. Analytics (Pre-computed)
-- ============================================================================
create table if not exists public.analytics (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references public.restaurants(id) on delete cascade,
  date            date not null,
  metric          text not null,
  value           numeric not null,
  dimensions      jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(restaurant_id, date, metric)
);

create index idx_analytics_restaurant_date on public.analytics(restaurant_id, date desc);

create trigger trg_analytics_updated_at
  before update on public.analytics
  for each row execute function update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_repayments enable row level security;
alter table public.delivery_partners enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.reviews enable row level security;
alter table public.ratings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.activity_logs enable row level security;

-- Profiles: users can read their own, admins can read all
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Restaurants: public read for active, merchants manage own
create policy "Anyone can read active restaurants"
  on public.restaurants for select
  using (is_active = true and status = 'active');

create policy "Merchants can read own restaurants"
  on public.restaurants for select
  using (owner_id = auth.uid());

create policy "Admins can read all restaurants"
  on public.restaurants for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Merchants can insert own restaurant"
  on public.restaurants for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'merchant'));

create policy "Merchants can update own restaurant"
  on public.restaurants for update
  using (owner_id = auth.uid());

create policy "Admins can update any restaurant"
  on public.restaurants for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

-- Categories: public read, merchant CRUD
create policy "Anyone can read active categories"
  on public.categories for select
  using (is_active = true);

create policy "Merchants can manage own categories"
  on public.categories for all
  using (exists (select 1 from public.restaurants where id = categories.restaurant_id and owner_id = auth.uid()));

-- Products: public read for active, merchant CRUD
create policy "Anyone can read active products"
  on public.products for select
  using (is_active = true and is_available = true);

create policy "Merchants can manage own products"
  on public.products for all
  using (exists (select 1 from public.restaurants where id = products.restaurant_id and owner_id = auth.uid()));

-- Orders: student sees own, merchant sees own restaurant orders, delivery sees assigned
create policy "Students can read own orders"
  on public.orders for select
  using (user_id = auth.uid());

create policy "Merchants can read own restaurant orders"
  on public.orders for select
  using (exists (select 1 from public.restaurants where id = orders.restaurant_id and owner_id = auth.uid()));

create policy "Delivery can read assigned orders"
  on public.orders for select
  using (delivery_partner_id = auth.uid() or exists (
    select 1 from public.delivery_assignments
    where delivery_assignments.order_id = orders.id and delivery_assignments.delivery_partner_id = auth.uid()
  ));

create policy "Students can create orders"
  on public.orders for insert
  with check (user_id = auth.uid());

create policy "Merchants can update own restaurant orders"
  on public.orders for update
  using (exists (select 1 from public.restaurants where id = orders.restaurant_id and owner_id = auth.uid()));

create policy "Delivery can update assigned orders"
  on public.orders for update
  using (delivery_partner_id = auth.uid() or exists (
    select 1 from public.delivery_assignments
    where delivery_assignments.order_id = orders.id and delivery_assignments.delivery_partner_id = auth.uid()
  ));

-- Order Items: parent order policies cascade
create policy "Order items readable via parent order"
  on public.order_items for select
  using (exists (select 1 from public.orders where id = order_items.order_id and (
    orders.user_id = auth.uid() or
    exists (select 1 from public.restaurants where id = orders.restaurant_id and owner_id = auth.uid()) or
    orders.delivery_partner_id = auth.uid()
  )));

create policy "Students can insert order items"
  on public.order_items for insert
  with check (exists (select 1 from public.orders where id = order_items.order_id and user_id = auth.uid()));

-- Addresses: user manages own
create policy "Users can manage own addresses"
  on public.addresses for all
  using (user_id = auth.uid());

-- Payments: user sees own, merchant sees own restaurant payments
create policy "Users can read own payments"
  on public.payments for select
  using (user_id = auth.uid());

create policy "Merchants can read own restaurant payments"
  on public.payments for select
  using (exists (select 1 from public.orders join public.restaurants on orders.restaurant_id = restaurants.id
    where orders.id = payments.order_id and restaurants.owner_id = auth.uid()));

-- Notifications: user owns
create policy "Users can manage own notifications"
  on public.notifications for all
  using (user_id = auth.uid());

-- BNPL: user owns, admin reads all
create policy "Users can read own credit account"
  on public.credit_accounts for select
  using (user_id = auth.uid());

create policy "Admins can read all credit accounts"
  on public.credit_accounts for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Users can read own credit transactions"
  on public.credit_transactions for select
  using (exists (select 1 from public.credit_accounts where id = credit_transactions.credit_account_id and user_id = auth.uid()));

create policy "Users can read own repayments"
  on public.credit_repayments for select
  using (exists (select 1 from public.credit_accounts where id = credit_repayments.credit_account_id and user_id = auth.uid()));

-- Delivery: partner reads own, merchant reads own assignments
create policy "Delivery partners read own profile"
  on public.delivery_partners for select
  using (id = auth.uid());

create policy "Delivery partners read own assignments"
  on public.delivery_assignments for select
  using (delivery_partner_id = auth.uid());

create policy "Merchants read delivery assignments for own orders"
  on public.delivery_assignments for select
  using (exists (select 1 from public.orders join public.restaurants on orders.restaurant_id = restaurants.id
    where orders.id = delivery_assignments.order_id and restaurants.owner_id = auth.uid()));

-- Reviews: public read, authenticated insert
create policy "Anyone can read reviews"
  on public.reviews for select
  using (true);

create policy "Users can create reviews"
  on public.reviews for insert
  with check (user_id = auth.uid());

-- Ratings: same as reviews
create policy "Anyone can read ratings"
  on public.ratings for select
  using (true);

create policy "Users can create ratings"
  on public.ratings for insert
  with check (user_id = auth.uid());

-- Admin full access on all tables
create policy "Admin full access to audit_logs"
  on public.audit_logs for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

create policy "Admin full access to activity_logs"
  on public.activity_logs for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

-- ============================================================================
-- HELPER FUNCTIONS (RPC)
-- ============================================================================

-- Get order by tracking code (public)
create or replace function public.get_order_by_tracking(lookup_code text)
returns setof public.orders
language plpgsql security definer
as $$
begin
  return query
  select * from public.orders
  where tracking_code = upper(trim(lookup_code))
  limit 1;
end;
$$;

-- Create a credit account for a user
create or replace function public.initialize_credit_account(
  p_user_id uuid,
  p_credit_limit numeric default 5000
)
returns public.credit_accounts
language plpgsql security definer
as $$
declare
  v_account public.credit_accounts;
begin
  insert into public.credit_accounts (user_id, credit_limit, available_credit, outstanding)
  values (p_user_id, p_credit_limit, p_credit_limit, 0)
  returning * into v_account;
  return v_account;
end;
$$;

-- Process BNPL repayment
create or replace function public.process_repayment(
  p_repayment_id uuid,
  p_gateway_payment_id text default null
)
returns void
language plpgsql security definer
as $$
declare
  v_repayment public.credit_repayments;
  v_account public.credit_accounts;
  v_tx_id uuid;
begin
  select * into v_repayment from public.credit_repayments where id = p_repayment_id;
  if not found then
    raise exception 'Repayment not found';
  end if;

  select * into v_account from public.credit_accounts where id = v_repayment.credit_account_id;
  if not found then
    raise exception 'Credit account not found';
  end if;

  -- Create transaction record
  insert into public.credit_transactions (
    credit_account_id, type, amount,
    balance_before, balance_after,
    description
  ) values (
    v_account.id, 'repayment', v_repayment.amount,
    v_account.outstanding, v_account.outstanding - v_repayment.amount,
    'Repayment processed'
  ) returning id into v_tx_id;

  -- Update account
  update public.credit_accounts
  set
    outstanding = outstanding - v_repayment.amount,
    available_credit = available_credit + v_repayment.amount,
    last_repayment_at = now()
  where id = v_account.id;

  -- Update repayment
  update public.credit_repayments
  set
    status = 'paid',
    paid_at = now(),
    gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id),
    transaction_id = v_tx_id
  where id = p_repayment_id;
end;
$$;

-- Dashboard metrics for merchant
create or replace function public.get_merchant_dashboard(p_restaurant_id uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_orders', (select count(*) from public.orders where restaurant_id = p_restaurant_id),
    'pending_orders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'pending'),
    'today_revenue', coalesce((select sum(total) from public.orders where restaurant_id = p_restaurant_id and created_at::date = current_date and status != 'cancelled'), 0),
    'active_products', (select count(*) from public.products where restaurant_id = p_restaurant_id and is_active = true)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================================
-- SEED DATA: Default admin user reference
-- ============================================================================
-- To create your first admin, run this AFTER the user has signed up:
-- insert into public.profiles (id, email, full_name, role)
-- values ('USER_ID_FROM_AUTH', 'admin@dilipda.com', 'Admin', 'super_admin')
-- on conflict (id) do update set role = 'super_admin';
