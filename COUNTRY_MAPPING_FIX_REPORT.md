# Critical Fix: Country Mapping, Sync & Order Integrity — Report

**Severity:** Release-blocking. **Status:** ✅ Fixed & verified with live API tests across multiple countries.

## Root causes found (two real bugs)

### Bug 1 — Wrong SMSPool country IDs (the "Germany → Philippines" bug)
The SMSPool `ISO_TO_SMSPOOL` map was built from **guessed** numeric IDs. Almost every entry was wrong:
- Germany was `6` (should be **24**), France was `78` (should be **23**), Italy `86`→`79`, Spain `56`→`55`, India `22`→`15`, Indonesia/Philippines/etc. all wrong.
- CA/CN/RU/AU were mapped to IDs that don't exist on SMSPool.

So selecting Germany sent SMSPool country `6` — a different country → a foreign number. **Fixed** by rebuilding the map from the authoritative live catalog (`GET /country/retrieve_all`).

### Bug 2 — SMSPool number field stripped the country code
SMSPool's purchase response returns both `number` (full E.164, e.g. `4915124409776`) and `phonenumber` (country code **stripped**, e.g. `15124409776`). The adapter used `phonenumber` first, so a valid German `+49…` number was displayed as `+15…` (looked American). **Fixed** to use the full `number` field (fallback: `cc` + `phonenumber`).

5SIM slugs were mostly correct; 5 non-existent slugs (russia/ukraine/china/myanmar/turkey — 5SIM no longer offers them) were removed so those countries route to other providers.

## Fixes implemented

1. **Accurate country mapping** — `smsMappings.js` rebuilt from live provider catalogs (authoritative, not guessed). Added `GRIZZLY_COUNTRY_DIALCODE` (expected dialing prefix per country).
2. **Order-integrity validation layer** — new `validateNumberCountry()` + `isValidPhoneFormat()`. Before delivering ANY number the engine verifies its prefix matches the requested country.
   - In the **routing engine**: a wrong-country number is **rejected**, cancelled upstream (best-effort), and the engine **fails over** to another provider. The customer never receives a wrong-country number.
   - In the **Grizzly-only path**: mismatch → cancel upstream + reject with "no charge, try again."
3. **Provider-truth expiration** — 5SIM (`expires`) and SMSPool (`expiration`/`expires_in`) real expiry is captured at purchase and shown in `/numbers` (`expires_at`/`remaining`). Grizzly (no expiry API) keeps the configured session window. Response shape unchanged (frontend untouched).
4. **Critical cancellation rule** (already correct, now hardened + audited) — provider is asked FIRST; the order is marked cancelled locally + refunded ONLY after the provider confirms. On rejection the line stays **active** and the user is told cancellation is still pending.
5. **Audit logging** — every purchase (`req_country` vs returned number), `validateNumber`, `routePlan`, and `cancel_request/cancel_confirmed/cancel_rejected` event is logged to `sms_provider_logs`.

## Files modified
- `server/services/sms/smsMappings.js` — corrected maps + dial codes + validators.
- `server/services/sms/providerRouter.js` — post-purchase country validation + reject/failover.
- `server/services/sms/providers/smspoolAdapter.js` — use full `number`; capture expiry.
- `server/services/sms/providers/fivesimAdapter.js` — capture `expires`.
- `server/routes/sms.js` — Grizzly-path validation, provider-truth expiry, cancel audit + clearer "still pending" message, purchase/validate audit.

No new tables. No frontend changes. Grizzly default preserved (new providers stay OFF).

## Live verification (real funded accounts — not simulated)

**Country accuracy — real purchases, verified prefix:**
| Country (requested) | 5SIM result | SMSPool result |
|---|---|---|
| Germany (+49) | +49 15124409944 ✅ | +49 17628364110 ✅ |
| France (+33) | +33 679278651 ✅ | — |
| UK (+44) | +44 7868223705 ✅ | +44 7449149943 ✅ |

**Validation logic (bug scenarios):** Germany-req + PH number → **REJECTED**; France-req + Indonesia number → **REJECTED**; correct-country numbers → **PASS**.

**End-to-end via `/api/sms/allocate`:** requested Germany → delivered **+49**1639375956, `country: Germany`, `provider: fivesim`, provider-truth `expires_at` + `remaining: 1199`.

**Cancellation rule:** audit showed `cancel_request → cancelActivation(provider) → cancel_confirmed`; 5SIM reported `status: CANCELED`; DB updated only after confirmation.

**No money lost:** all test orders cancelled/refunded — 5SIM back to $1.0218, SMSPool back to $0.78.

**Build:** `tsc --noEmit` = 0, `npm run build` OK. Server stopped, workspace clean, config reset to Grizzly-only.

## Note on same-dial-code countries
US/CA both use `+1` and RU/KZ both use `+7`, so a prefix check can't distinguish them (prefix passes for both). For those, the provider-level country selection is authoritative and the corrected ID/slug maps ensure correctness. The prefix validator fully catches all cross-region mismatches like the reported Germany/France cases.
