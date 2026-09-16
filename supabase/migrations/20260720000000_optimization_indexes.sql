-- ============================================================================
-- Performance Optimization Indexes
-- Created: 2026-07-20
-- 
-- This migration adds composite and covering indexes for common query patterns
-- identified during the Batch 2 data layer audit.
-- 
-- IMPORTANT: On large production tables, run these with CREATE INDEX CONCURRENTLY
-- to avoid locking. E.g.:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_restaurant_status
--     ON public.orders(restaurant_id, status, created_at DESC);
-- ============================================================================

-- Orders: merchant dashboard queries (restaurant + status + date range)
create index if not exists idx_orders_restaurant_status
  on public.orders(restaurant_id, status, created_at desc);

-- Orders: tracking lookups (already has an index, but this covering index avoids heap lookups)
create index if not exists idx_orders_tracking_status
  on public.orders(tracking_code) include (status, total, restaurant_id);

-- Products: merchant catalog browsing with category + active filter
create index if not exists idx_products_restaurant_category
  on public.products(restaurant_id, category_id, is_active, sort_order);

-- Products: low-stock alerts (merchant dashboard)
create index if not exists idx_products_low_stock
  on public.products(restaurant_id, track_inventory, stock_quantity)
  where track_inventory = true and stock_quantity <= 5;

-- Categories: merchant sidebar ordering
create index if not exists idx_categories_restaurant_active_order
  on public.categories(restaurant_id, is_active, display_order);

-- Profiles: role-based lookups (admin panels, middleware)
create index if not exists idx_profiles_role_active
  on public.profiles(role, is_active) include (full_name, email);

-- Notifications: unread badge counts (very frequent query)
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, is_read, created_at desc);

-- Payments: payment dashboard filtering
create index if not exists idx_payments_status_created
  on public.payments(status, created_at desc);

-- Payments: refund processing lookups
create index if not exists idx_payments_order_method
  on public.payments(order_id, payment_method);

-- Credit transactions: user history pages
create index if not exists idx_credit_transactions_account_created
  on public.credit_transactions(credit_account_id, created_at desc);

-- Credit repayments: due-date processing (daily cron job)
create index if not exists idx_credit_repayments_due_status
  on public.credit_repayments(due_date, status)
  where status in ('pending', 'partial');

-- Addresses: user default address (checkout)
create index if not exists idx_addresses_user_default
  on public.addresses(user_id, is_default) where is_default = true;

-- Delivery assignments: active deliveries for tracking
create index if not exists idx_delivery_assignments_active
  on public.delivery_assignments(delivery_partner_id, status, assigned_at desc)
  where status in ('assigned', 'picked_up', 'in_transit');

-- Audit logs: admin panel filtering with date range
create index if not exists idx_audit_logs_table_created
  on public.audit_logs(table_name, created_at desc);

-- Reviews: product page aggregation
create index if not exists idx_reviews_product_rating
  on public.reviews(product_id, rating, created_at desc);
