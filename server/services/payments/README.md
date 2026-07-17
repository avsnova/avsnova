# Payment Providers — Modular Integration Guide

This platform supports multiple payment gateways through a small, consistent pattern. Adding a
new provider (or activating a scaffolded one like **PalmPay** or **Nomba**) is a localized change
— you never touch the working gateways.

## Currently integrated (live endpoints)
- **Paystack** — `/api/paystack/*`
- **Flutterwave** — `/api/flutterwave/*`
- **Monnify** — `/api/monnify/*`
- **Paga** — reserved accounts (`/api/profile/paga`, webhooks)

## Scaffolded (ready to wire when you get keys)
- **PalmPay** — `adapters/palmpayAdapter.js`
- **Nomba** — `adapters/nombaAdapter.js`

## How credentials are resolved (NEVER hardcode secrets)
Every provider's config is resolved by `registry.js` in this order:
1. **Admin `settings` DB column** (operator can rotate keys from the panel)
2. **Environment variable** (the server's `.env`)
3. **Safe default / empty** (the provider simply stays inactive until configured)

`environment` (`sandbox` vs `production`/`live`) is resolved the same way, so switching from
sandbox to live is a **credentials-only change** — no code edits.

## Standard adapter interface
Each adapter exposes:
- `getConfig()` → resolved config `{ credentials, environment, configured, ... }`
- `initializePayment({ amount, email, reference, redirectUrl })` → start a payment
- `verifyPayment(reference)` → server-side confirmation `{ success, amount, currency, raw }`
- `verifyWebhook(rawBody, headers)` → validate + parse an inbound webhook

Adapters throw errors with a `.code` of `NOT_CONFIGURED` (no keys yet) or `NOT_IMPLEMENTED`
(REST calls not filled in) — they never fake a success.

## Adding / activating a provider — 4 steps
1. **Register it** — add/confirm the entry in `registry.js` `PROVIDERS` (credential field → `{ db, env }`).
2. **Add credentials** — put the keys in `.env` (see `.env.example`) or the admin settings.
   Set `<PROVIDER>_ENVIRONMENT=production` when going live.
3. **Implement the adapter** — fill in the `TODO`s in `adapters/<provider>Adapter.js` with the
   provider's real initialize/verify/webhook REST calls.
4. **Expose endpoints** — add `/api/<provider>/initialize`, `/verify`, `/webhook` in `server/index.js`
   (copy the shape of the Paystack/Monnify handlers) and a `payment_methods` row so it can be toggled.

## Verifying readiness
`GET /api/admin/payments/providers` (admin) returns every provider with:
`{ configured, environment, enabled, hasKey: { field: true/false } }` — **no secrets**, just booleans.
Use it to confirm production keys are in place before switching a gateway live.
