# Security

Current security measures implemented across the platform.

## Transport & Headers (`vercel.json`)

- `X-Frame-Options: DENY` · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Static image caching (`max-age=31536000, immutable`) for `/images/*` and `/_next/static/*`

## CSRF — `src/lib/csrf.ts`

- `validateCsrf` compares `Origin` (or `Referer`) against the `Host` header; `csrfGuard` wraps API routes with a 403 on mismatch.
- Allow-list includes `NEXT_PUBLIC_APP_URL` origins.

## Rate Limiting — `src/lib/rate-limit.ts`

- Sliding-window counter; **Upstash Redis** when `UPSTASH_REDIS_REST_URL`/`TOKEN` are set, otherwise an **in-memory Map** (per-process; fine for single-instance dev, weak for multi-region scale).
- Presets: `strict` 10/min · `default` 30/min · `relaxed` 100/min · `generous` 300/min.
- Applied to: CIT OTP sending (3/hour, server action).

## Database & RLS

- 60 Row-Level Security policies (see DATABASE.md) — public reads limited to active rows; mutations ownership-scoped.
- **Service-role client** (`src/infrastructure/supabase/service.ts`, `admin.ts`) bypasses RLS and is server-only. Every code path using it re-authorizes:
  - Admin actions → `authorizeAdmin()` (role ∈ {admin, super_admin}).
  - Checkout/Telegram → operate on IDs the caller controls (order ids come from the DB/Telegram callback, never from unvalidated user input).
- Checkout uses the service key directly over Supabase REST (`/rest/v1/restaurants`) — the key is never exposed to the client.

## Authentication

- Supabase Auth + SSR cookies (`@supabase/ssr`); client Zustand session mirrors the auth state.
- **CIT email gate** on login (`@cit.ac.in` domain or hardcoded dev exception).
- Signup OTP: 6-digit code stored **SHA-256 hashed** in `cit_otp_requests` (10-min expiry, max 5 attempts, 3/hour rate limit); dev mode returns the OTP inline.
- Password reset via email link.

## Telegram Webhook

- **Authorization:** only callbacks with `from.id === TELEGRAM_CHAT_ID` are processed; others get `answerCallbackQuery('Unauthorized')` + 401.
- Status values whitelisted; unknown actions rejected.
- **⚠ Known exposure:** the bot token (`8257429384:...`) was shared in plaintext during debugging. **Rotate it** via @BotFather (`/revoke`), update `TELEGRAM_BOT_TOKEN` + Vercel env, and re-register the webhook (SETUP.md).

## Secrets Handling

- Service-role key and Razorpay secret live only in env vars (Vercel dashboard / `.env.local` gitignored).
- `src/lib/logger.ts` redacts known secret fields (passwords, tokens, razorpay ids) in log output.
- `src/config/env.ts` + `src/schemas/env.ts` fail fast in production when required vars are missing.

## Known Gaps (documented, not fixed)

- **No middleware/edge auth guard** — route protection is client-side + server-action checks; sensitive data actions all call `authorizeAdmin()`, but page-level reads can render for unauthenticated visitors until the client redirects.
- In-memory rate limiting is per-process, not shared across Vercel regions — enable Upstash for hard limits.
- Cancellation window (2 min) is frontend-only; a crafted request could bypass it (`cancelUserOrder` only checks status pending/accepted).
- `delivery_*` / `reviews` / `ratings` / `reports` / `analytics` tables exist but are unused by app code (schema surface, not an active risk).
