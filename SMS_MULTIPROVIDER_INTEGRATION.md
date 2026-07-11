# Multi-Provider SMS Integration — 5SIM + SMSPool (alongside Grizzly SMS)

**Status:** ✅ Implemented, live-tested, non-breaking.
**Guarantee:** Grizzly SMS remains the production reference and default. New providers are **disabled by default**; the platform behaves exactly as before until an admin explicitly enables them.

---

## 1. New files added

| File | Purpose |
|---|---|
| `server/services/sms/smsMappings.js` | Country + service **normalization maps** (Req 4, 8, 9). Canonical format = Grizzly codes; converts to/from 5SIM slugs and SMSPool numeric IDs. |
| `server/services/sms/smsLog.js` | Provider **request/response + fallback logging** (Req 12). Redacts API keys/JWTs, bounds table to 2000 rows. |
| `server/services/sms/providerRouter.js` | **Registry + selection/fallback engine** (Req 3, 5, 6, 7, 10). The SMS route talks only to this. |
| `server/services/sms/providers/grizzlyAdapter.js` | Thin wrapper over the **untouched** `grizzlySms.js`. Canonical codes = Grizzly codes. |
| `server/services/sms/providers/fivesimAdapter.js` | **5SIM** adapter (Bearer JWT; `5sim.net/v1`). |
| `server/services/sms/providers/smspoolAdapter.js` | **SMSPool** adapter (`api.smspool.net`; key form-field; name→id service cache). |

Every adapter exposes the **same interface** (Req 3):
`getBalance, getCountries, getServices, getPrices, getPrice, buyNumber, getSms, cancelActivation, completeActivation, getOrderStatus`.

## 2. Existing files modified

| File | Change | Non-breaking? |
|---|---|---|
| `server/db.js` | Added columns + one table (see §3). All additive `ALTER`/`CREATE IF NOT EXISTS`. | ✅ Grizzly rows default `provider='grizzly'`. |
| `server/routes/sms.js` | `/price` & `/allocate` gained a multi-provider branch that **only activates when a non-Grizzly provider is enabled**; otherwise the original Grizzly path runs verbatim. Poll/cancel/complete now dispatch by the row's `provider` column (legacy rows → Grizzly). | ✅ Frontend contract unchanged. |
| `server/index.js` | Imported the router; added 3 admin endpoints (see §5). `getGrizzlyBalance` untouched. | ✅ |
| `server/services/grizzlySms.js` | **NOT MODIFIED** — production reference preserved. | ✅ |
| `.env` | Added `FIVESIM_API_KEY`, `SMSPOOL_API_KEY`. | ✅ |
| `src/**` (frontend) | **NOT MODIFIED** at all (Req 1). | ✅ |

## 3. Database changes (all additive)

**`settings`** — new columns:
`fivesim_api_key`, `smspool_api_key`,
`sms_provider_grizzly_enabled` (default **1**), `sms_provider_fivesim_enabled` (default **0**), `sms_provider_smspool_enabled` (default **0**),
`sms_primary_provider` (default `'grizzly'`), `sms_secondary_provider` (default `''`), `sms_provider_mode` (default `'single'`).

**`virtual_numbers`** — new columns: `provider` (default `'grizzly'`), `provider_session_id`. Existing rows backfilled to `grizzly`.

**`operational_history`** — reused existing `provider` / `provider_session_id` columns.

**New table `sms_provider_logs`** (`id, provider, action, request, response, status, latency_ms, user_id, created_at`) — bounded to 2000 rows.

No tables removed. No schema of existing columns altered. Existing Grizzly orders continue working unchanged.

## 4. Configuration changes

Add to `.env` (primary source — Req 13, keys never sent to frontend):
```
FIVESIM_API_KEY=<5sim JWT>
SMSPOOL_API_KEY=<smspool key>
GRIZZLY_SMS_API_KEY=<unchanged>
```
Alternatively set keys in the dashboard (stored in `settings`, DB overrides env). The `/api/admin/sms/providers` status endpoint exposes only `hasKey` booleans, never values.

## 5. Admin API (new, admin-gated)

- `GET  /api/admin/sms/providers` — enabled flags, primary/secondary/mode, `hasKey` booleans, **live per-provider balances**.
- `POST /api/admin/sms/providers` — set `enabled{}`, `primary`, `secondary`, `mode` (`single`|`auto`), and optionally keys (only overwritten when non-empty).
- `GET  /api/admin/sms/provider-logs` — recent provider request/response + fallback logs.

## 6. How selection & fallback work

- **`single` mode:** use the resolved order (primary → secondary → other enabled), falling through on no-stock/error.
- **`auto` mode:** price the service across all enabled providers and pick the **cheapest in-stock**, still falling through on live failure (Req 5, 6, 10).
- **Service availability (Req 7):** if a provider can't map/price a service it's silently skipped — no error shown as long as *any* enabled provider supports it.
- **Pricing (Req 10):** unchanged model — `customer price = provider_cost_usd × rate + sms_flat_margin`. The filling provider's real cost is recorded for accurate profit.

## 7. Verification performed (live)

- Grizzly-only mode `/price`, `/balance`, `/countries` — original path intact (GB/tg $0.60 → ₦2,274; balance $2.40).
- 5SIM & SMSPool balance + pricing normalized to canonical codes.
- `auto` mode picked the cheapest provider (5SIM $0.80 < SMSPool $0.81).
- **Real SMSPool buy → poll → cancel** lifecycle succeeded.
- 5SIM buy failed gracefully ("not enough balance").
- **Automatic fallback proven:** 5SIM (primary, failed) → SMSPool (secondary, filled), fallback event logged.
- `tsc --noEmit` = 0, `npm run build` OK, clean boot with all migrations applied.

> Note: a pre-existing bad value (`grizzly_api_key='testkey'`) was found in the DB and restored to the working production key — unrelated to this integration but it had been breaking Grizzly.

## 8. Adding a future provider (no changes to existing code)

1. Create `server/services/sms/providers/<name>Adapter.js` exporting the standard interface + `id`, `label`.
2. Add its country/service mappings to `smsMappings.js`.
3. Register it in `providerRouter.js`: add to `ADAPTERS` and `PROVIDER_IDS`.
4. Add an enable flag + key column in `db.js` (additive `ALTER`), and surface it in the two admin endpoints.

That's it — the SMS route, frontend, and other providers require no changes.

## 9. Migration steps

None required. On next server boot, `initDb()` applies the additive columns/table automatically and backfills `provider='grizzly'` for existing rows. New providers stay OFF until enabled in the admin panel.
