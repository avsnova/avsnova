# SMS Module Rebuild — Provider-Independent "Pools" (Backend Foundation)

Per the directive: stop patching, rebuild provider-based. Each **pool** = one real provider behind
a neutral customer-facing label. Each pool loads ONLY its own provider's **native** catalog
(native country + service ids, live price, live stock) with **zero cross-provider translation** —
catalogs are never merged, so a country/service from one provider can never leak into another.
This structurally eliminates the mismatch class of bugs.

## FIRST RULE honored: never fabricate
Every country / service / price / stock returned comes directly from the provider API via the
adapter's native methods. On any provider failure the API returns an explicit error — never
cached-hardcoded or invented data. (The corrupt hardcoded frontend catalog that caused
"France→Indonesia" is already removed in the prior fix.)

## What was built (this phase — backend, verified live)

### Native, per-provider catalog methods (no translation)
Added to each adapter: `getNativeCountries()`, `getNativeServices(country)`,
`getNativePrice(country, service)`, `buyNative(country, service)` — all using the provider's OWN ids.
- **Grizzly**: native ids = Grizzly codes (pass-through of its own getPrices/getCountries).
- **SMSPool**: native numeric country/service ids; uses `/request/pricing?country=` (authoritative per-country services + live price in one call).
- **5SIM**: native country slug + product slug; uses `/guest/products/{country}/any` (live Qty + Price).

### Pool layer — `server/services/sms/pools.js`
Maps pool → provider, loads native catalog, applies per-pool markup (flat or %), and enforces
"buy only from the selected pool" (no silent switching). Poll/cancel/balance route to the pool's
own provider.

### DB — `sms_pools` table (additive)
`id, provider, label, enabled, hidden, sort_order, markup_type, markup_value`. Seeded:
Pool 1→Grizzly (enabled), Pool 2→SMSPool, Pool 3→5SIM (disabled until admin turns on).

### API endpoints
Customer (masked — never sees provider): `GET /api/sms/pools`, `/pools/:id/countries`,
`/pools/:id/services?country=`, `/pools/:id/price?country=&service=`, `POST /pools/:id/buy`.
Admin: `GET /api/admin/sms/pools`, `POST /api/admin/sms/pools/:id` (label/enable/hide/provider/markup),
`POST /api/admin/sms/pools/:id/test` (live balance + connectivity).

Buy uses the loss-prevention guard (atomic debit → local order → provider buy → auto-refund on
failure). Poll/cancel reuse the existing provider-aware `/numbers` + `/action` (dispatch by the
stored provider), so provider is always source of truth (real expiry, provider-first cancel).

## Live test results (real APIs, real money, all refunded)
Native catalog self-consistency (country→service→price with native ids):
- Grizzly UK(16)→Telegram(tg) $0.60 ✓ · SMSPool Germany(24)→Telegram(907) $1.94 ✓ · 5SIM germany→telegram $0.97 ✓

Real purchases — correct country every time:
- Grizzly (Pool 1) UK → **+44**7985710969 ✅
- SMSPool (Pool 2) Germany → **+49**15730260484 and **+49**15124409784 (full HTTP flow) ✅
- 5SIM (Pool 3) Germany → **+49**1639346571 ✅

Full HTTP customer flow: list pools (masked) → countries → services (price+markup breakdown) →
price → buy (correct +49, provider masked) → `/numbers` (provider-truth remaining) → cancel
(provider-first, refunded). Insufficient-balance and out-of-stock returned honest provider errors
(no switching, no faking). Balances restored; guard tests 4/4; tsc=0; build OK.

## Not yet built (next phases — honest status)
- **Customer UI**: the new provider-based "Buy Number" page (pick Pool → that pool's own
  countries/services → buy). Backend is ready; the React page is the next build.
- **Admin UI**: pool management screen (rename/enable/hide/markup/test) — endpoints ready.
- Optional "Auto Route" mode (explicit opt-in only) and multi-offer compare view.
- Retiring the old merged catalog once the pool page is the default.

The customer-facing page still uses the previous flow until the new pool page is built and enabled;
this phase delivered and proved the correctness-critical backend that makes the pool page safe.

## Phase 2 — Customer UI + provider-truth timers (DONE, verified live)

### New customer page: `src/components/views/PoolBuyNumber.tsx`
Modern, responsive, self-contained Buy Number experience:
- 3-step flow: pick Pool → that pool's OWN countries (searchable, favorites) → services
  (searchable, live price + stock, favorites). Provider is masked (only "Pool 1/2/3" shown).
- Loading skeletons, empty/out-of-stock/error states, retry buttons.
- Confirmation dialog before buying: pool, service, country, provider price, markup, final price.
- Double-click protection (in-flight lock + idempotency key + disabled button + spinner).
- Active orders: masked pool label, number, live status, remaining/cancel timers, last-sync time,
  OTP display + copy, confirm-before-cancel.
- Wired into `SMSPanelView` behind pools mode: if any customer-visible pool is enabled it renders
  the new page; otherwise the classic view (fully reversible by disabling pools).

### Provider-truth timers
- 5SIM (`/user/check` → `expires`,`created_at`) and SMSPool (`/sms/check` → `expiration`,`time_left`)
  expose real timers → surfaced exactly (`providerTimer: true`).
- Grizzly's `getStatus` exposes NO timer → we label it "estimated" and set `providerTimer: false`.
  We do NOT fabricate a provider timer for Grizzly (honest per the FIRST RULE).
- `/api/sms/numbers` now persists + returns provider expiry, `providerTimer` flag, `poolLabel`
  (masked), and `last_sync`.

### Live acceptance test results (real APIs, refunded)
- Masked pools list ✓ · 5SIM Germany services w/ live price+stock ✓
- Buy 5SIM Germany → +49 (correct country) ✓ · Grizzly UK → +44 ✓
- Duplicate idempotency key → "Duplicate purchase prevented" (no double charge) ✓
- providerTimer: true for 5SIM (exact), false for Grizzly (estimated, honest) ✓
- Provider masked in all customer responses ✓ · cancel = provider-first then local ✓
- Balances restored (no money lost); guard tests 4/4; tsc=0; build OK.

## Provider limitation (reported honestly, per spec)
**Grizzly SMS exposes no session/expiration/cancel timer** via its handler_api (`getStatus`
returns only WAIT/OK/CANCEL). Therefore "timer matches provider exactly" is IMPOSSIBLE for
Grizzly — there is no provider timer to match. We show Grizzly time as "estimated" (from the
admin session window) and flag it, rather than fabricate a value. 5SIM and SMSPool expose real
timers and are shown exactly. Options to resolve for Grizzly: (a) accept estimated+labeled (current),
(b) switch that pool's default to a provider with real timers, or (c) contact Grizzly for a
timer-bearing endpoint.

## Still open
- Admin pool-management UI screen (endpoints ready: list/update/test; label/enable/hide/markup).
- Optional explicit "Auto Route" mode + multi-offer compare view.
