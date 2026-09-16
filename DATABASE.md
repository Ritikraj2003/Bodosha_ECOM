# Database

PostgreSQL on Supabase with Row-Level Security. **`supabase/migrations/` is the source of truth** — the root `supabase/schema.sql` is a stale snapshot (missing CIT verification and `order_type`); use the migrations when applying SQL.

---

## Migration History (apply in this order — see SETUP.md)

| # | Migration | Contents |
|---|---|---|
| 1 | `20260719121605_initial_schema.sql` | Core schema: extensions, helpers, tables, **60 RLS policies**, triggers, RPCs |
| 2 | `20260719140000_system_settings.sql` | `system_settings` key-value store + admin settings |
| 3 | `20260720000000_optimization_indexes.sql` | Composite/covering indexes for common queries |
| 4 | `20260725150000_add_cit_student_verification.sql` | `profiles.is_cit_student` / `student_email` / `student_verified_at`, `cit_otp_requests` |
| 5 | `20260730000000_add_order_type.sql` | `orders.order_type` check constraint (`room_delivery` / `takeaway` / `dine_in` legacy) |

> ⚠ **Not idempotent:** `CREATE POLICY` (no `IF NOT EXISTS` in Postgres) — never re-run a migration on a database it has already been applied to. See SETUP.md for skip rules.

---

## Tables

| Table | Purpose |
|---|---|
| `profiles` | Users, extends `auth.users` (role, full_name, phone, CIT flags, is_active) |
| `restaurants` | Merchant restaurants + open/close status |
| `restaurant_settings` | Per-restaurant config |
| `categories` / `products` / `product_images` | Menu catalog (soft-delete via `deleted_at`) |
| `inventory_logs` | Stock change history |
| `addresses` | Saved delivery addresses |
| `orders` | Orders — status machine, timestamps, `order_type`, totals, tracking code |
| `order_items` | Line items |
| `payments` / `payment_logs` | Payment records + history |
| `notifications` | In-app notifications |
| `delivery_partners` / `delivery_assignments` | Delivery feature (unused — not implemented) |
| `reviews` / `ratings` | Customer feedback (unused) |
| `audit_logs` / `activity_logs` | Admin + system audit trails |
| `reports` / `analytics` | Reporting (unused) |
| `system_settings` | Key-value config store |
| `cit_otp_requests` | Hashed OTP requests for CIT signup/verification |

---

## RLS

- **60 policies** defined in migration 1, e.g.:
  - `profiles` — users read/update own profile; admins read all
  - `restaurants` / `categories` / `products` — anyone reads active rows; merchants manage own; admins manage any
  - `orders` / `order_items` — customers manage own; merchants own-restaurant scoped; admins all
  - `payments`, `notifications`, `audit_logs` — ownership-scoped with admin override
- The **service-role client bypasses RLS entirely** — used by checkout (`createOrder`), Telegram webhook, and admin repositories; callers re-authorize in code (e.g. `authorizeAdmin()`).

## RPCs

| Function | Purpose |
|---|---|
| `get_order_by_tracking(lookup_code)` | Public order lookup by tracking code |
| `get_merchant_dashboard(p_restaurant_id)` | Merchant stats aggregation |
| Helpers | `update_updated_at()` trigger fn, `generate_tracking_code()` (`DD-XXXXXXXX`), `handle_new_user()` (profile auto-create), `track_order_status()` |

## Triggers

- `trg_<table>_updated_at` — bump `updated_at` on change (profiles, restaurants, restaurant_settings, categories, products, addresses, orders, …)
- `handle_new_user` — create a `profiles` row when a new `auth.users` row appears
- `track_order_status` — status-change tracking hook

## Key Conventions

- Soft deletes: `deleted_at` (restaurants, products, profiles checks).
- Money: `numeric(10,2)` in **₹ (INR)**.
- IDs: UUIDs (`gen_random_uuid()`); product catalog uses fixed UUIDs (`00000000-0000-0000-0000-0000000000XX`) seeded in `createOrder`'s item map.
- Tracking codes: `DD-` + 8 chars from a 32-char alphabet (no vowels/0/1) — `generate_tracking_code()`.
- `orders.order_type` — `null` = legacy order, treated as `room_delivery` everywhere.
- Cancellation window is **frontend-only** (2 minutes) — no DB enforcement.
