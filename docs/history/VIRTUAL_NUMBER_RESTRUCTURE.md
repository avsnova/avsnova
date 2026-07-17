# Virtual Number System Restructure — Progress Report

This is a large, multi-phase production refactor (spec has 22 sections). It is being delivered in
**verified, safe, feature-flagged phases** rather than one risky big-bang. Everything ships behind
flags defaulting to current behavior, with Git + migration rollback.

## Scope decisions (confirmed with product owner)
- **Provider masking:** customers NEVER see the provider name/logo (final instruction wins). Internally we still pick/record the real provider; admin sees everything.
- **Buy flow:** compare-and-choose for customers (masked) — planned Phase 2.
- **Sequencing:** Phase 1 = loss prevention + integrity + Git/migrations/flags (money-protecting core).
- **Back-compat:** new system behind feature flags; current flow stays default.

## ✅ Phase 1 delivered & verified

### Git version control + rollback (§17)
- Repo initialized; `.gitignore` excludes `.env`, `node_modules`, `database.sqlite`, logs, uploads.
- Branches: `main`, `develop`, `feature/virtual-number-restructure`. Tag `v1.0.0-baseline`.
- `ROLLBACK.md` documents one-click code/DB/flag rollback + pre-deploy checklist.

### Reversible DB migrations (§18)
- `server/migrations/runner.js` with `npm run migrate | migrate:down | migrate:status`.
- `0001_virtual_number_loss_prevention` — verified up→down→up round-trip.

### Feature flags (§19)
- `feature_flags` table + `server/services/featureFlags.js` (5s cache) + admin API
  `GET/POST /api/admin/feature-flags`. Flags: `sms_txn_safe_purchase`, `sms_safe_cancellation`,
  `sms_compare_and_choose`, `sms_mask_provider` (default 1). Live-toggle verified.

### Loss-prevention purchase engine (§7) — behind `sms_txn_safe_purchase`
- `server/services/sms/purchaseGuard.js` — saga pattern:
  1. **Atomic wallet debit** (guarded `UPDATE ... WHERE balance >= amount`; provider NEVER contacted if it fails).
  2. Create local order first (with unique **idempotency key**).
  3. Buy from provider (multi-provider failover, or Grizzly with country validation).
  4. Provider fails → **auto-refund exact amount + delete pending row**. Success → record ledger txn.
- **Order traceability (§7):** internal order id (`AVS-VN-…`) ≠ provider order id; both + txn ref stored.
- **Duplicate prevention:** client-supplied idempotency key (per click) + in-flight guard + DB unique index.
- **Provider masking:** allocate response returns only id/number — never the provider.

### Automated tests (§20 — partial)
- `server/services/sms/__tests__/purchaseGuard.test.mjs` — 4/4 pass:
  insufficient-funds-never-calls-provider, provider-failure-refunds-and-removes, success-debits-once,
  duplicate-prevented.

### Live verification (real APIs, real money, refunded)
- Insufficient funds → blocked pre-flight, provider not contacted.
- Real safe purchase: UK Telegram → **+44**7311502605; internal id ≠ provider id `533182058`;
  wallet debited exactly once (5000→2726); response masked the provider.
- Concurrent double-click (same idempotency key) → **1 success + 1 “already in progress”** (no double charge).
- All test orders cancelled/refunded; wallet reset; test flag disabled.

## Files added (Phase 1)
- `.gitignore`, `ROLLBACK.md`, `VIRTUAL_NUMBER_RESTRUCTURE.md`
- `server/services/featureFlags.js`
- `server/services/sms/purchaseGuard.js`
- `server/services/sms/__tests__/purchaseGuard.test.mjs`
- `server/migrations/runner.js`, `server/migrations/0001_virtual_number_loss_prevention.js`

## Files modified (Phase 1)
- `server/db.js` — feature_flags table, VN loss-prevention columns + idempotency index (additive).
- `server/routes/sms.js` — flagged safe-purchase path (legacy flow unchanged when flag off).
- `server/index.js` — feature-flags admin endpoints.
- `package.json` — migrate scripts.

## Already in place from earlier work (relevant to this spec)
- Universal mapping layer (§1) + 3 adapters with identical interface (§2) — `smsMappings.js`, `providers/*`.
- Multi-provider search/price + smart routing + failover (§3,4,12) — `providerRouter.js`.
- Country/service mismatch fix + validation (§13) — corrected authoritative maps + `validateNumberCountry`.
- Provider health monitor (§11) + logs (§16) + admin overview dashboard (§21) + SMS Config UI (§15 partial).

## Remaining (future phases — not yet built)
- §8 safe cancellation w/ admin-review queue (flag `sms_safe_cancellation` reserved).
- §3/5/14 customer compare-and-choose masked UI (flag `sms_compare_and_choose` reserved).
- §6 full markup matrix (flat/%/country/service/provider + min-profit + emergency override).
- §9 inventory cache, §10 background workers/queues, §22 API-key encryption.
- Broader automated test coverage (mapping, price/profit, cancellation, failover).
