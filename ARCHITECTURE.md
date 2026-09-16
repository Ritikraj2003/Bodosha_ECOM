# Architecture & Code Flow

High-level overview of how the Dilip Da platform is wired: routes, server actions, data layer, and every main business flow.

## Layers

```
Browser (React 19 client components, Zustand stores)
   │  server actions (src/features/*/actions) + API routes (src/app/api)
   ▼
Next.js 16 App Router (RSC pages, Server Actions)
   │  repositories (src/features/*/repositories) + lib (telegram/email/security)
   ▼
Supabase (PostgreSQL + RLS + Auth)   •   Razorpay   •   Telegram Bot API   •   SMTP
```

- **No middleware.ts** — route protection is client-side (layouts) + server-action authorization checks.
- **Data flow:** pages call server actions (`'use server'`) → actions authorize → call repositories → Supabase clients. Service-role clients bypass RLS, so every admin/merchant action re-checks the caller's role.
- **Realtime:** only merchant orders uses a Supabase realtime subscription; everything else refreshes via `usePolling`.

---

## 1. Checkout Flow

```
cart page → /checkout
  OrderTypeSelector  → 'room_delivery' (Hostel Delivery) | 'takeaway' (Take Away)
    · room_delivery → address section shown, COD allowed
    · takeaway      → pickup info card, COD hidden (Razorpay forced)
  Payment: Razorpay | COD (COD filtered by canPayOnDelivery)
  handlePlaceOrder()  [src/app/checkout/page.tsx:130]
    ├─ validateAndPlace(pm) → createOrder(...)  [src/features/orders/actions/customer.ts:26]
    │     · resolves restaurant via Supabase REST (service key)
    │     · rejects COD for non-room_delivery orders
    │     · inserts orders row (status=pending, payment_status=pending)
    │     · inserts order_items (hardcoded product-id map for seeded catalog)
    │     · returns { orderId }  — order deleted if item insert fails
    │
    ├─ Razorpay path → initiateRazorpayPayment(orderId)
    │     · loadRazorpayScript (checkout.razorpay.com/v1/checkout.js)
    │     · createRazorpayOrder(total*100)  [src/features/payments/actions]
    │         → POST https://api.razorpay.com/v1/orders (Basic auth)
    │     · openRazorpayCheckout modal  [src/features/payments/services/razorpay.ts:43]
    │         onSuccess → confirmPayment(orderId) + sendOrderNotification(orderId) + clearCart
    │         onFailure → failPayment(orderId)
    │
    └─ COD path → confirmPayment(orderId) + sendOrderNotification(orderId) + clearCart

/order/confirmed?orderId=…  → fetches order, shows tracking code
```

**Notification pipeline** — `sendOrderNotification` (customer.ts:143) loads order + items → `notifyNewOrder` (src/lib/notifications.ts:92):

```
formatTelegram(order) → sendTelegramMessageWithButtons(...)
                         # <STATUS_ACTIONS[pending]> → 3 inline buttons:
                         #   ✅ Accept | 👨🍳 Preparing | ❌ Reject
                       + sendOrderNotificationEmail (to NOTIFICATION_EMAIL)
```

---

## 2. Telegram Order Control (Webhook)

Production URL: `https://dilip-da-ecom-mu.vercel.app/api/telegram/webhook` (registered via `setWebhook`).

```
Telegram user clicks button → POST callback_query → webhook route  [src/app/api/telegram/webhook/route.ts]
  1. Parse body; ignore non-callback_query payloads                    (:62)
  2. Authorize: String(from.id) === TELEGRAM_CHAT_ID else
     answerCallbackQuery('Unauthorized') + 401                          (:70)
  3. Parse action: `data = "<status>:<orderId>"`                       (:76-81)
     · legacy aliases mapped: accept→accepted, reject→declined         (:19-22, :85)
  4. Validate status against whitelist (8 statuses)                    (:87-91)
  5. Lookup order by id; missing → callback alert                      (:99-108)
  6. updateOrderStatus(orderId, status, note:'Telegram update')        (:24-58)
     · appends {status, timestamp, note} to status_history
     · sets accepted_at / prepared_at / delivered_at / cancelled_at
  7. Edit the Telegram message in place:                               (:116-120)
     replaces trailing badge line (regex /\n\n[^\n]+$/) with the new
     status badge + next buttons via editTelegramMessage
  8. answerCallbackQuery(callbackId, toastLabel)                       (:122-132)
```

**Button state machine** — `STATUS_ACTIONS` (src/lib/notifications.ts:60-84) + `getStatusButtons` (:86-90):

| Current status | Buttons shown |
|---|---|
| `pending` | ✅ Accept / 👨🍳 Preparing / ❌ Reject |
| `accepted` | 👨🍳 Preparing / ❌ Cancel |
| `preparing` | 🍽️ Ready / ❌ Cancel |
| `ready` | 🚚 Out for Delivery / ✅ Complete |
| `out_for_delivery` | 📦 Delivered |
| `delivered` | ✅ Complete |
| `declined` / `completed` / `cancelled` | none (terminal) |

The same transitions are enforced app-side by `ORDER_TRANSITIONS` (src/features/orders/types/index.ts:88-99) + `canTransition`, checked in merchant `updateOrderStatus` (src/features/orders/actions/index.ts:49-51) and the order repository (`updateStatus`, src/features/orders/repositories/index.ts:41-71, which also flips COD payment_status to confirmed on completion).

**Dev-only tester:** `GET /api/telegram/dev-callback?action=<status>&orderId=<uuid>` (403 outside `NODE_ENV=development`).

---

## 3. Auth Flow

```
Signup (3 steps) — src/features/auth/components/SignupForm.tsx
  email → sendSignupOtp (src/features/cit-student/actions:164)
           · rate-limited 3/hour, 6-digit OTP stored SHA-256 hashed
             (cit_otp_requests, 10-min expiry, max 5 attempts)
           · dev mode returns the OTP inline
  OTP   → verifySignupOtp → marks verified_at, returns isCit flag
  account → authService.signUp (Supabase auth signUp + user_metadata)
           + service-role upsert of is_cit_student/student_email/student_verified_at

Login — LoginForm.tsx:21 — CIT-only gate:
  rejects email unless endsWith('@cit.ac.in') or lastw5232@gmail.com (dev exception)
  on success: admin → /admin, known role → /, else → /auth/onboarding

Session — src/features/auth/store.ts (Zustand, backed by AuthProvider
  subscribing to supabase.auth.onAuthStateChange)
Server session — getServerSession() (src/features/auth/actions/index.ts:6,
  via createServerSupabaseClient cookie client)

Route guards (client-side, no middleware):
  · /admin/layout.tsx           — redirects unless role === 'admin'
  · /dashboard/merchant/layout  — redirects unless authenticated (+ 4s hard redirect)
  · admin server actions        — authorizeAdmin(): role ∈ {admin, super_admin} else Forbidden
```

---

## 4. Auto-Refresh Polling

`usePolling(callback, intervalMs, enabled)` — src/hooks/usePolling.ts. Interval-driven, silent (no loading flicker), pauses when disabled, cleans up on unmount.

| Page | Interval | Refetches |
|---|---|---|
| `/orders/[id]` | 15s | `getUserOrder` (status/timeline/cancel window) |
| `/orders` | 30s | `getUserOrders` (orders tab only) |
| `/profile` (Dashboard tab) | 30s | `getAdminDashboard` + recent orders (admins only) |
| `/dashboard/merchant/orders` | 30s | `getOrders` + `getOrderCounts` (plus Supabase realtime INSERT) |
| `/dashboard/admin/orders` | 30s | `getAdminOrders` (silent) |

---

## 5. Data Layer

- **97 server actions** across 9 features (`src/features/*/actions`) — see API.md for the inventory.
- **Repositories** own every Supabase query (orders, admin, products, restaurants, notifications).
- **Supabase clients** (src/infrastructure/supabase/): browser/server (anon, RLS-respecting), service + admin (service-role, RLS-bypass — server-only, guarded by role checks).
- **Admin dashboard stats** (`AdminRepository.getDashboardStats`, src/features/admin/repositories/index.ts:9-108) — **19 parallel queries** in one `Promise.all`: user/student/merchant/restaurant counts, order counts by state, total/today/weekly/monthly revenue, active merchants, pending approvals, recent audit activity.
- **Order state machine** lives in `src/features/orders/types/index.ts` (`ORDER_TRANSITIONS`, `canTransition`, `getOrderTimelineEvent`) and is enforced on both merchant and Telegram paths.

---

## 6. UI & Loading State Architecture

- **Global Page Transitions & Fallbacks (`src/app/loading.tsx`)**
  - Uses `HamsterLoader` (`src/components/ui/HamsterLoader.tsx`), an ultra-lightweight, pure CSS keyframe animated hamster wheel spinner inspired by Uiverse (`wet-mayfly-23`).
  - Implements multi-tier responsive font-size scaling (`8.5px` base on desktop, scaled down 35% on `< 640px` and 45% on `< 480px` screens) to provide an engaging, zero-layout-shift loading experience.
  - Used in root `loading.tsx`, admin layout session checks, and available throughout the app for asynchronous suspense states.

---

## 7. Data Export Architecture

- **Multi-Format Export Engine (`src/components/admin/ExportDropdown.tsx` + `src/lib/exportUtils.ts`)**
  - Supports on-the-fly client generation of:
    - **Excel spreadsheets (`.xlsx`)** via `xlsx`
    - **Printable PDFs (`.pdf`)** with auto-table styling via `jspdf` & `jspdf-autotable`
    - **CSV files (`.csv`)** with UTF-8 BOM encoding for seamless spreadsheet opening
  - Standardized across admin domains:
    - **Students Directory** (`/dashboard/admin/students`): Student profile, account status, credit limit, available credit, balance, BNPL status, verification status, and registration date.
    - **Payments & Billing** (`/dashboard/admin/payments`): Customer info, amount, payment method, gateway IDs, refund details, and timestamps.
    - **Audit Logs** (`/dashboard/admin/audit-logs`): Action type, entity, changed by, IP address, and change records.

---

## Deployment at a glance

- Git integration: push to `main` → GitHub Actions CI (lint/typecheck/test/e2e/build) + Vercel auto production deploy → `https://dilip-da-ecom-mu.vercel.app`.
- `vercel --prod` deploys the local working tree and uploads local `.env.local` values — git builds only read env vars set in the Vercel dashboard.
- Full details: **DEPLOYMENT.md** · One-time setup: **SETUP.md**

