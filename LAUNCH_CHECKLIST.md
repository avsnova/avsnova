# AVS Marketplace — Launch Checklist (Item 14)

**Date:** 2026-07-10 · **Status:** Production-ready pending live payment credentials.

This checklist maps to the 14 production-readiness requirements. Each item notes what was
implemented and how it was verified. Live verification was done against a running server with
real SMTP/IMAP credentials.

---

## ✅ Feature Completeness

| # | Requirement | Status | Verification |
|---|-------------|--------|--------------|
| 1 | Complete order details (all order types) | ✅ Done | `GET /api/admin/orders/:id/details` returns customer/delivery/payment/custom-fields/timeline/txn-ref/internal notes; admin modal + Details button; live-tested |
| 2 | Dynamic checkout fields (no code changes) | ✅ Done | Admin CRUD + reorder + 10 field types; wired into customer checkout; answers persist on order; live-tested |
| 3 | SMM full sync audit (auto, retry, log, alert) | ✅ Done | `japRequest` retry/backoff; `sync_log`; 6h auto-sync; admin alert after 3 fails; health panel; synced 5,747 services live |
| 4 | Pricing protection (never below cost) | ✅ Done | `enforcePriceFloor` on display + order paths; `smm_min_profit`; unit + live tested |
| 5 | Guided SMM ordering flow | ✅ Done | Platform→Type→Service→Link→Qty→Review wizard; real brand logos; reuses existing submit; live grouping verified |
| 6 | Editable SMM instructions | ✅ Done | Admin CRUD/enable/reorder; public endpoint; shown on guided flow; live-tested |
| 7 | Payment gateway production audit | ✅ Done | Signature verify (Monnify/Paga/Flutterwave/Paystack) → 401 on bad sig; idempotent credits; zero-code live-key switch; live-tested |
| 8 | Security audit | ✅ Done | SQLi-safe (allow-lists); no secret leakage; rate limiting (login/forgot/forms) → 429; security headers; live-tested |
| 9 | API audit | ✅ Done | 0 broken links (254 checked); all async routes try/catch; consistent errors; 401/403 guards |
| 10 | Error/bug/perf audit | ✅ Done | 40+ DB indexes (+3 new); admin ledgers capped at 5k; clean build (no warnings); tsc 0 |
| 11 | Settings rollback | ✅ Done | Auto-snapshot before every change; one-click restore (reversible); live-tested |
| 12 | PWA (installable) | ✅ Done | Manifest + service worker + offline page + icons + install prompt; SW never caches /api |
| 13 | Hosting & deployment docs | ✅ Done | `DEPLOYMENT.md` (env, build, DB, PM2/Nginx/SSL, webhooks, backup/restore, rollback) |
| 14 | Launch checklist | ✅ This document | Final end-to-end verification below |

---

## ✅ Final End-to-End Verification (executed live)

- [x] `/api/health` → `{ready:true}`
- [x] Admin login works
- [x] Core admin APIs operational: users, orders, manual-fulfillment, inventory summary,
      email dashboard, sync-log, settings snapshots, checkout-fields, smm-instructions — all **200**
- [x] Public APIs operational: marketplace products, SMM services, checkout-fields,
      smm-instructions — all **200**
- [x] **SMTP live connection** → success
- [x] **IMAP live connection** → success
- [x] Auth guard: admin endpoint without token → **401**
- [x] Security header present: `X-Frame-Options: DENY`
- [x] Login brute-force → **429** after cap
- [x] Payment webhooks reject invalid signatures → **401** (Monnify, Paga); graceful ignore on no-ref (Flutterwave)
- [x] Pricing floor prevents below-cost sales (unit + live)
- [x] Marketplace order captures shipping + custom fields; appears complete in admin details
- [x] Credential assign is idempotent (no double-assign / double-credit)
- [x] `tsc --noEmit` → exit 0
- [x] `npm run build` → success, no warnings (~1.9 MB / ~425 KB gzip)
- [x] No test/demo data left; admin wallet ₦0
- [x] No server processes or stray files left in workspace

---

## 🔴 Before Go-Live (requires YOU / live credentials)

These cannot be completed from the dev environment and are the only remaining launch steps:

1. **Enter LIVE payment keys** in Admin Panel → Settings (Paystack, Monnify, Paga,
   Flutterwave). Set Monnify env → `live`, Paga base URL → `https://collect.paga.com/`.
   *(No code change or redeploy needed — architecture verified.)*
2. **Configure provider webhook URLs** in each provider dashboard (see DEPLOYMENT.md §7):
   - Monnify → `/api/monnify/webhook`
   - Paga → `/api/webhooks/paga/funding`
   - Flutterwave → `/api/flutterwave/webhook`
3. **Run one small real transaction** per method to confirm live crediting + confirmation email.
4. **Set a strong `JWT_SECRET`** and change the Super Admin password from the default.
5. **Deploy** per DEPLOYMENT.md (build, PM2/systemd, Nginx/Caddy + SSL, DNS).
6. **Configure daily DB + uploads backups** and health monitoring on `/api/health`.
7. **Verify SPF/DKIM/DMARC** for the sending domain (see DELIVERABILITY.md).
8. **Install the PWA** on a phone to confirm icon/splash/standalone launch (needs the live
   HTTPS domain — service worker only registers in production over HTTPS).

---

## ⚠️ Items that could not be fully tested from the dev sandbox (disclosed)

- **Live payment provider callbacks** — no live keys / sandbox transaction executed here; code
  paths, signature verification, and idempotency were verified at the code + unit + mocked-
  webhook level.
- **Mobile responsiveness, browser console errors, rendered broken links, PWA install UX** —
  require a real browser DOM; no headless browser is available/persisted in this sandbox.
  Static verification (route/link cross-check, build integrity, single-file inline assets) was
  done instead.
- **Third-party inbox OTP retrieval** — the IMAP engine + parser are verified against the live
  inbox (33 messages) and realistic parser cases; a specific provider's live code email
  wasn't simulated.

---

## Recommendations (non-blocking)

- Add a scheduled off-server backup shipment (S3/Backblaze) for `database.sqlite` + `uploads/`.
- Consider migrating SQLite → Postgres if concurrency/scale grows substantially.
- Add uptime + error-rate alerting (e.g. BetterStack) on `/api/health`.
- Periodically review `sync_log` (SMM Sync Health panel) for provider drift.
