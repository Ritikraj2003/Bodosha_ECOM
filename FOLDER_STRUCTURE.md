# Folder Structure

Actual project tree with purpose annotations. Empty directories noted at the bottom are intentional scaffolding.

```
dilip-da/
├── .env.example                  # Documented env template (required + optional vars)
├── .env.local                    # Local env (gitignored) — loaded by scripts & `vercel --prod`
├── .env.staging / .env.production # Env snapshots (not auto-loaded by Next)
├── .github/workflows/
│   ├── ci.yml                     # Lint, typecheck, unit tests, coverage, E2E, build (push/PR)
│   └── deploy.yml                 # Lint + typecheck + tests on push to main
├── .vercel/repo.json              # Vercel Git-link config (project dilip-da-ecom)
├── e2e/                           # Playwright specs
│   ├── auth.spec.ts               #   login/signup flows
│   ├── cart.spec.ts               #   cart add/remove
│   ├── dashboard-merchant.spec.ts #   merchant dashboard
│   ├── home.spec.ts               #   homepage
│   └── menu.spec.ts               #   menu browsing
├── public/                        # Static assets (images, Phonepay.png, gpay.jpg, favicon)
├── scripts/
│   └── seed-admin.mjs             # npm run seed:admin <email> — promote user to admin
├── src/
│   ├── app/                       # Next.js App Router (pages + API)
│   ├── components/                # Shared UI components
│   ├── config/                    # env.ts — cached validated env accessor
│   ├── features/                  # Feature-sliced modules (actions/repositories/services/types)
│   ├── hooks/                     # Client hooks: usePolling, useServerAction
│   ├── infrastructure/            # Supabase clients + DB schema types
│   ├── lib/                       # Telegram, email, notifications, security utilities
│   ├── schemas/                   # Zod schemas: env.ts, api.ts
│   ├── types/                     # Global types (Role, UserProfile, Address, ApiResponse…)
│   └── __tests__/                 # Vitest unit tests (214 tests, 30 files)
├── supabase/
│   ├── migrations/                # SQL migrations — SOURCE OF TRUTH for the DB
│   ├── schema.sql                 # ⚠ STALE full-schema snapshot (missing CIT/order_type)
│   └── config.toml                # Local Supabase CLI config
├── e2e/ (see above)
├── next.config.ts
├── vercel.json                    # Security headers, image config, redirect /home → /, region bom1
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```

## src/app — Routes

```
src/app/
├── layout.tsx                     # Root layout (fonts, AuthProvider, NavbarWrapper, Toasts)
├── page.tsx                       # Homepage (hero, featured dishes, offer cards)
├── loading.tsx                    # Global loading UI
├── globals.css                    # Tailwind 4 + theme tokens
│
├── (auth)/, (public)/, (dashboard)/admin|delivery|merchant|student   # EMPTY route groups (scaffolding)
├── (menu)/MenuItems.tsx           # Shared menu item component
│
├── auth/
│   ├── login/page.tsx             # Login (CIT email gate)
│   ├── signup/page.tsx            # 3-step OTP signup
│   ├── onboarding/page.tsx        # Post-login role onboarding (student/merchant/delivery)
│   ├── reset-password/page.tsx    # Password reset
│   └── callback/route.ts          # Supabase auth code exchange (GET)
│
├── cart/page.tsx                  # Cart view
├── checkout/page.tsx              # Checkout: order type, address, contact, payment
├── favorites/page.tsx             # Wishlist page
├── menu/page.tsx                  # Full menu listing
├── profile/page.tsx               # Profile + admin dashboard stats tab
├── orders/
│   ├── page.tsx                   # My orders (30s polling)
│   └── [id]/page.tsx              # Order detail + timeline + cancel (15s polling)
├── order/
│   ├── confirmed/page.tsx         # Order confirmation (tracking code)
│   └── track/page.tsx             # Track by tracking code
│
├── admin/page.tsx                 # Legacy admin shell (redirects to /dashboard/admin)
├── admin/menu/                    # Legacy admin menu editor
│
├── dashboard/
│   ├── layout.tsx                 # Dashboard shell (role tabs, navbar)
│   ├── page.tsx                   # Role-based redirect
│   ├── admin/                     # Admin dashboard + stats
│   │   ├── page.tsx
│   │   ├── orders/                #   All orders, force status, cancel (30s polling)
│   │   ├── users/, students/, merchants/, payments/, audit-logs/, settings/
│   ├── merchant/
│   │   ├── page.tsx               #   Merchant dashboard (revenue overview)
│   │   ├── orders/                #   Order queue + status buttons + realtime (30s polling)
│   │   ├── products/ (+ new, [id], [id]/edit)
│   │   ├── categories/, inventory/, analytics/, notifications/, settings/
│   └── delivery/                  #   (empty — feature not implemented)
│
└── api/
    ├── telegram/
    │   ├── webhook/route.ts       # POST — Telegram inline-button status control (PRODUCTION)
    │   └── dev-callback/route.ts  # GET — dev-only status tester (?action=&orderId=)
```

## src/components — UI & Presentation

| Folder / File | Purpose |
|---|---|
| `ui/HamsterLoader.tsx` | Reusable pure CSS animated Hamster Wheel loader (presets `xs`-`xl`, responsive mobile scaling) |
| `ui/HamsterLoader.module.css` | Scoped CSS animation module with all hamster & wheel `@keyframes` |
| `ui/data-table.tsx` | Reusable generic data table with search, status filtering, pagination & modal dialogs |
| `ui/date-filter.tsx` | Date range selector component for reporting & analytics |
| `ui/index.tsx` | Common UI exports (Skeleton, StatCard, DashboardCard, StatusBadge, EmptyState, HamsterLoader) |
| `admin/ExportDropdown.tsx` | Multi-format data export dropdown (Excel `.xlsx`, PDF `.pdf`, CSV `.csv`) with click-outside listener |
| `shared/` | Layout & global components: `Navbar`, `Footer`, `BottomNav`, `FlyingBird`, `LoadingSkeleton`, `Toast`, `MaintenanceGate`, `ThemeToggle`, `FoodDetailModal` |
| `landing/` | Landing page cards & FloatingCartBar |

## src/features — Feature Slices

| Folder | Purpose |
|---|---|
| `auth/` | Session store (Zustand), AuthProvider, login/signup/onboarding/forgot forms, server session actions, OTP auth service |
| `admin/` | 44 super-admin actions + `AdminRepository` (dashboard stats, users, students, merchants, orders, refunds, audit, settings) |
| `cart/` | Zustand persisted cart store (fee ₹10, 5% tax, fly animation) |
| `cit-student/` | CIT college verification: send/verify OTP, signup OTP flow, status checks |
| `delivery/` | Delivery partner claim order, active order tracking, pickup/delivery confirmation |
| `favorites/` | Zustand persisted wishlist store |
| `notifications/` | In-app notifications table (list, mark read, unread count) |
| `orders/` | Customer actions (`customer.ts`), merchant actions, order repository, types (state machine, order types) |
| `payments/` | Razorpay client service + `createRazorpayOrder` server action |
| `products/` | Product/category CRUD, stock, low-stock, reorder |
| `restaurants/` | Restaurant settings, open/close toggle, merchant dashboard via RPC |
| `bnpl/` | Student credit / BNPL dashboard & repayment components |
| `wallet/` | Wallet actions (credit wallet, balance lookup, KYC status) |

Each slice follows `actions/` (server actions) → `repositories/` (Supabase queries) → `services/` (business logic) → `types/`.

## src/lib — Utilities

| File | Purpose |
|---|---|
| `exportUtils.ts` | Multi-format data export utility (`exportToCSV`, `exportToExcel`, `exportToPDF` via jspdf-autotable) |
| `telegram.ts` | Telegram Bot API helpers (send message, buttons, edit message, answer callback) |
| `email.ts` | Nodemailer SMTP (OTP email + order notification email) |
| `notifications.ts` | `notifyNewOrder` — Telegram message + buttons + email; `STATUS_ACTIONS` button map |
| `csrf.ts` | Origin/Host CSRF check (`validateCsrf`, `csrfGuard`) |
| `rate-limit.ts` | Sliding-window limiter (Upstash Redis or in-memory fallback) |
| `errors.ts` | AppError hierarchy (Validation, Auth, Authorization, NotFound, Conflict, RateLimit) |
| `logger.ts` | JSON/pretty logger with secret redaction |
| `utils.ts` | `cn`, `formatCurrency`, `slugify`, `generateId` |
| `useServerAction.ts` | Client hook wrapper for server actions |


## src/infrastructure — Supabase Clients

| File | Env | Misconfig |
|---|---|---|
| `client.ts` | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Throws (browser) |
| `server.ts` | same anon pair | Returns `null` (server, cookie-based SSR) |
| `service.ts` | URL + `SUPABASE_SERVICE_ROLE_KEY` | Returns `null`; **not** in barrel export |
| `admin.ts` | URL + service role (via `@/config/env`) | Throws; no session persistence |

## src/schemas — Zod Validation

- `env.ts` — env var schema (validated by `src/config/env.ts`)
- `api.ts` — role, profile update, pagination, product schemas

## Empty Scaffolding (intentional)

```
src/app/(auth)/, (public)/, (dashboard)/{admin,delivery,merchant,student}
src/features/{delivery/services, delivery/types, auth/repositories, admin/services,
              notifications/components, products/components, products/schemas,
              payments/repositories, payments/types, restaurants/schemas, orders/schemas}
src/infrastructure/{payments, storage}
```
