# Deployment

## Overview

| Item | Value |
|---|---|
| Host | Vercel (region `bom1`) |
| Production URL | `https://dilip-da-ecom-mu.vercel.app` |
| Vercel project | `dilip-da-ecom` (team `itzsubham2006s-projects`) |
| Git integration | GitHub repo `itzsubham2006/Dilip-Da-Ecom`, production branch `main` |
| CI | GitHub Actions — `ci.yml` (lint, typecheck, tests, coverage, E2E, build) on push/PR; `deploy.yml` (lint + typecheck + tests) on push to main |

## Two ways to deploy

### 1. Git push (recommended for day-to-day)

```bash
git add .
git commit -m "description"
git push origin main
```

- Pushing to `main` triggers Vercel's Git integration → **production deployment** to `https://dilip-da-ecom-mu.vercel.app` (alias never changes, so the Telegram webhook URL stays valid).
- GitHub Actions CI runs in parallel (lint → typecheck → tests → coverage → E2E → build).

### 2. Vercel CLI (local files, without pushing)

```bash
vercel --prod
```

- Deploys the **local working tree** (uncommitted changes included).
- Uploads your local `.env.local` values into the build environment.

## ⚠ Critical: environment variables

- **Git builds only read env vars set in the Vercel dashboard** (Project → Settings → Environment Variables). They never see `.env.local`.
- `vercel --prod` **uploads local `.env.local` values** — this is why a CLI deploy can succeed while a git deploy lacks vars.
- **Rule:** keep the dashboard's Production (and Preview/Development) environments in sync with `.env.local`. Full checklist: SETUP.md → "Vercel Environment Variables".

## Rollout checklist (after any deploy)

1. Vercel dashboard → Deployments → newest commit shows `Ready`.
2. Open the production URL — homepage renders.
3. Place a test order (Razorpay or COD) → order appears in `/dashboard/admin/orders` and Telegram gets the message with buttons.
4. Click a button in Telegram → status updates on the site within 15–30s (polling).

## Not production-ready notes

- `/api/telegram/dev-callback` returns 403 unless `NODE_ENV=development` (never exposed on Vercel builds).
- Webhook re-registration after domain changes: see SETUP.md → Telegram webhook.
- The bot token used in SETUP.md was exposed in chat during debugging — **rotate it via @BotFather and update the webhook + `TELEGRAM_BOT_TOKEN` after any security review.**
