# API Reference

All HTTP API routes, the server-action inventory (the app's internal "API"), and external API calls.

---

## 1. HTTP API Routes (`src/app/api/**`)

### `POST /api/telegram/webhook` — Telegram inline-button order control
- **Auth:** caller must be a callback from the registered bot; action allowed only when `from.id === TELEGRAM_CHAT_ID`.
- **Body:** Telegram `callback_query` update (`{ callback_query: { from, message, data, id } }`).
- **Action format:** `data = "<status>:<orderId>"` — statuses: `accepted | declined | preparing | ready | out_for_delivery | delivered | completed | cancelled` (legacy `accept` / `reject` are aliased).
- **Behavior:** updates the order status (appends `status_history`, sets timestamps), edits the Telegram order message with the new badge + next buttons, answers the callback with a toast.
- **Responses:** `200 {ok:true}` · `401 Unauthorized` (wrong chat) · `200 {ok:false, error}` on unknown action / missing order.
- **Env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### `GET /api/telegram/dev-callback` — dev-only status tester
- `?action=<status>&orderId=<uuid>` — updates status and sends a Telegram message. Returns `403` outside `NODE_ENV=development`.
- **Env:** same as webhook.

### `GET /api/auth/callback` — Supabase auth code exchange
- Exchanges `code` for a session (`exchangeCodeForSession`), redirects to `next` (default `/auth/onboarding`); on failure redirects to `/auth/login?error=...`.

---

## 2. External API Calls

| Call | Where | Auth |
|---|---|---|
| `POST https://api.razorpay.com/v1/orders` | `src/features/payments/actions/index.ts:15` (create Razorpay order for checkout) | Basic auth `NEXT_PUBLIC_RAZORPAY_KEY_ID`:`RAZORPAY_KEY_SECRET` |
| `https://checkout.razorpay.com/v1/checkout.js` | `src/features/payments/services/razorpay.ts:28` (payment modal script) | — |
| `POST https://api.telegram.org/bot<TOKEN>/<method>` | `src/lib/telegram.ts` — `sendMessage`, `sendMessage` with `reply_markup` (buttons), `editMessageText`, `answerCallbackQuery` | Bot token |
| `GET {SUPABASE_URL}/rest/v1/restaurants?...` | `src/features/orders/actions/customer.ts:37` (resolve restaurant at checkout) | Service-role key header |
| Supabase JS clients | all repositories | anon key (RLS) or service-role key |

---

## 3. Server Action Inventory (`'use server'`)

### auth (`src/features/auth/actions/index.ts`)
`getServerSession` · `getServerProfile` · `updateServerProfile` · `getServerAddress` · `updateServerAddress` · `completeOnboarding` · `sendPasswordResetEmail`

### admin (`src/features/admin/actions/index.ts`) — all gated by `authorizeAdmin()`
`getAdminDashboard` · `getAdminStudents` · `getAdminStudentById` · `suspendStudent` · `unsuspendStudent` · `verifyStudent` · `resetStudentVerification` · `getAdminMerchants` · `getAdminMerchantById` · `approveMerchant` · `rejectMerchant` · `suspendMerchant` · `restoreMerchant` · `updateMerchantCommission` · `getAdminOrders` · `getAdminOrderById` · `forceUpdateOrderStatus` · `cancelOrderByAdmin` · `getAdminPayments` · `processRefund` · `getSystemSettings` · `updateSystemSetting` · `getAuditLogs` · `getMerchantRevenue` · `getMerchantAnalytics` · `bulkSuspendStudents` · `bulkUnsuspendStudents` · `bulkSuspendMerchants` · `bulkRestoreMerchants` · `getLowStockProducts` · `getRecentPayments` · `getAdminUsers` · `deleteUser`

### orders — customer (`src/features/orders/actions/customer.ts`)
`createOrder` · `sendOrderNotification` · `confirmPayment` · `failPayment` · `getUserOrders` · `cancelUserOrder` (2-min window, pending/accepted only) · `getUserOrder`

### orders — merchant (`src/features/orders/actions/index.ts`)
`getOrders` · `getOrder` · `updateOrderStatus` · `getOrderCounts` · `acceptOrder` · `declineOrder` · `markPreparing` · `markReady` · `markCompleted` · `cancelOrder`

### cit-student (`src/features/cit-student/actions/index.ts`)
`getCitStudentStatus` · `sendCitOtp` · `verifyCitOtp` · `sendSignupOtp` · `verifySignupOtp`

### notifications (`src/features/notifications/actions/index.ts`)
`getMyNotifications` · `markNotificationRead` · `markAllNotificationsRead` · `getUnreadNotificationCount`

### payments (`src/features/payments/actions/index.ts`)
`createRazorpayOrder`

### products (`src/features/products/actions/index.ts`)
`getProducts` · `getProduct` · `createProduct` · `updateProduct` · `archiveProduct` · `restoreProduct` · `deleteProduct` · `updateProductStock` · `getCategories` · `createCategory` · `updateCategory` · `deleteCategory` · `reorderCategories`

### restaurants (`src/features/restaurants/actions/index.ts`)
`getMerchantRestaurant` · `getMerchantDashboard` · `getRevenueOverview` · `getRestaurantSettings` · `updateRestaurantSettings` · `toggleRestaurantOpen`

### cart / favorites — client stores, no server actions
`src/features/cart/store` · `src/features/favorites/store`

---

## 4. Key Payload Shapes

### Order (abridged — `src/features/orders/types/index.ts`)
```ts
{
  id, tracking_code: 'DD-XXXXXXXX', user_id, restaurant_id,
  status: 'pending'|'accepted'|'declined'|'preparing'|'ready'|'assigned'
        |'out_for_delivery'|'delivered'|'completed'|'cancelled',
  status_history: Array<{ status, timestamp, note? }>,
  subtotal, delivery_fee, tax_amount, discount_amount, total,
  customer_name, customer_email, customer_phone,
  delivery_address: object|null,      // room_delivery: {address,city,pincode}
                                      // takeaway: {address:'Take away from restaurant'}
  payment_method: 'razorpay'|'cod', payment_status: 'pending'|'confirmed'|'failed'|'refunded',
  order_type: 'room_delivery'|'takeaway'|null,   // null = legacy = room_delivery behavior
  scheduled_at, accepted_at, prepared_at, delivered_at, cancelled_at, cancellation_reason,
  created_at, updated_at
}
```

### Telegram callback (`data` payload)
```
accepted:<orderId>   declined:<orderId>   preparing:<orderId>   ready:<orderId>
out_for_delivery:<orderId>   delivered:<orderId>   completed:<orderId>   cancelled:<orderId>
```
Legacy: `accept:<orderId>` / `reject:<orderId>` (still handled via alias map).
