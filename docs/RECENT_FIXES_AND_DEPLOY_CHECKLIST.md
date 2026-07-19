# AVS Nova — Recent Fixes & Deployment / Verification Checklist

_Last updated: 2026-07-19 · Branch: `feature/sms-pools-rebuild`_

This document summarizes the fixes made in the latest sessions, **how each was verified live**, and the
exact steps to deploy and re-verify them on your cPanel / CloudLinux / LiteSpeed host.

---

## 1. What was fixed (with evidence)

| # | Problem you reported | Root cause (verified, not guessed) | Fix | Commit |
|---|----------------------|-----------------------------------|-----|--------|
| 1 | Admin login works but **admin panel doesn't render** until a page reload | `/api/auth/login` + `/api/auth/register` responses omitted `user.role`, so the client set `isAdmin=false` right after login. The panel only appeared after a reload (which uses `/api/auth/me`, which *does* return role). | Login/register now return `role` (+username/phone); `AuthModals` passes them through `onSuccess`. | `4a4d966` |
| 2 | **API keys kept disappearing** (SMTP, Paystack, Monnify, Paga, Grizzly, JAP, Telegram) | A boot seeder wrote `REPLACE_ME` placeholders into empty settings columns. All resolvers read **DB-first, env-second**, so once a placeholder was stored, a real key added to `.env` later was **permanently shadowed** by the placeholder. | `.env` is now **authoritative**: real keys are synced into the DB on boot and stale placeholders are healed; admin-typed DB values are preserved when env is empty; only truly-unconfigured fields get inert placeholders. Removed the hardcoded JAP key from source. | `4a4d966` |
| 3 | Repeated regressions ("third time this broke") | **Not** DB recreation and **not** `.env` being overwritten by the app (the app has zero `.env` write paths). It was the genuine placeholder-shadowing bug above, which re-triggered every boot. | Same as #2 — `.env` authoritative sync. | `4a4d966` |
| 4 | App **fails to start on cPanel/LiteSpeed** with `ERR_REQUIRE_ASYNC_MODULE` | Top-level `await` at `server/index.js:316` (`const conn = await verifyDbConnection()`) made the ESM graph async; LiteSpeed's `lsnode.js` loads the entry via `require()`, which rejects async ESM graphs. | Wrapped the DB-init/Telegram bootstrap in an async `bootstrapDatabase()` function that is *called* (fire-and-forget) — no bare top-level await. | `7734f98` |

### Live verification already performed (in a sandbox with real MySQL + your real SMTP/Telegram)
- **Admin panel render:** headless-Chrome test — first login via the real modal → "Admin Hub Console" appears → Command Center + all modules render, **0 console/page errors**, no reload needed.
- **Key sync:** proved a real env key syncs to DB and resolves; a stale placeholder heals to the real key; an admin-typed key survives reboot with empty env.
- **SMTP:** real send via Admin Email Center → **email actually arrived** (confirmed via IMAP on your SpaceMail inbox). SMTP + IMAP both authenticated.
- **Telegram:** bot token valid (`getMe`), real message delivered to your chat, webhook registration accepted by Telegram, and the **approve-order button flipped an order pending → delivered** through the live webhook handler.
- **cPanel start fix:** `require('./app.js')` and `require('./server/index.js')` load with **no** `ERR_REQUIRE_ASYNC_MODULE`; `node --experimental-print-required-tla` reports zero top-level awaits; `node server/index.js`, `node app.js`, and `npm start` all boot and serve `/api/health = ok`.

> ⚠️ **Not verifiable from the sandbox (needs your live server):** whether your public domain `avsnova.com`
> actually routes to a running instance for the Telegram webhook. The handler + registration are proven;
> only the public routing is on your side to confirm.

---

## 2. Deploy to cPanel / CloudLinux / LiteSpeed

1. **Pull the code** on the server:
   ```bash
   cd ~/your-app-dir
   git fetch origin
   git checkout feature/sms-pools-rebuild
   git pull
   ```
2. **Install deps & build the frontend:**
   ```bash
   npm install
   npm run build          # produces ./dist (served by the Node server in production)
   ```
3. **cPanel → Setup Node.js App:**
   - **Application startup file:** `app.js`
   - **Application mode:** `Production`
   - **Node version:** 20.x (matches local `v20.20.2`)
4. **Confirm `.env`** on the server has your real keys (the app NEVER writes to `.env`; you manage it).
   Make sure there is **no `NODE_ENV=` line** in `.env` (the npm scripts / Passenger set the mode).
5. **Restart** the app: click **Restart** in the cPanel Node.js App UI, or:
   ```bash
   mkdir -p tmp && touch tmp/restart.txt
   ```

---

## 3. Post-deploy verification (run these and confirm)

```bash
# a) Health — must return {"status":"ok","ready":true,...}
curl -s https://avsnova.com/api/health

# b) Admin login — must return HTTP 200 with a token AND "role":"Super Admin"
curl -s -X POST https://avsnova.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hello@avsnova.com","password":"<YOUR_SUPER_ADMIN_PASSWORD>"}'
```

- **c) Admin panel render:** log in through the website → the **Admin Hub Console** link must appear in the
  sidebar immediately (no reload) → open it → Command Center loads. Open the browser console (F12) — expect **0 errors**.
- **d) Integration keys:** Admin → System Settings → confirm your real keys are shown (not `REPLACE_ME`).
  Boot log should say `Integration keys: synced N real value(s) from .env`.
- **e) SMTP:** Admin → Email Center → **Test Connection** (SMTP + IMAP) then **Send Test** to yourself → confirm arrival.
- **f) Telegram (if using webhook):**
  ```bash
  curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
  ```
  `pending_update_count` should stay low and `last_error_message` empty after tapping a button.
  If you don't run a public webhook, the bot auto-falls back to long-polling and works without one.

---

## 4. Key operational notes

- **`.env` is authoritative for integration keys.** Any key set in `.env` is synced into the DB on boot
  and always wins. To manage a key from the Admin Panel instead, **leave it blank in `.env`** — an
  admin-typed value is then preserved across restarts. The app never writes back to `.env`.
- **Admin lockout recovery** (if ever locked out again): set `ADMIN_PASSWORD_RESET=true` and
  `SUPER_ADMIN_PASSWORD=...` in `.env`, restart once, log in, then **remove the flag** and restart again.
- **Payment keys are sandbox/test** currently (Paystack `pk_test`/`sk_test`, Monnify/Paga/Flutterwave
  sandbox). As you planned, run on test keys for a few days, then swap to live keys in `.env` (they'll
  sync to the DB on the next restart) and set `MONNIFY_ENVIRONMENT=live` etc.
- **No audit guarantees "unhackable"** — this is hardening, not a formal security audit.

---

## 5. Commits in this line of work

```
7734f98  Fix ERR_REQUIRE_ASYNC_MODULE on cPanel/LiteSpeed (lsnode.js): remove top-level await
4a4d966  Fix admin panel not rendering after first login + stop integration keys being shadowed by placeholders
1709168  Fix admin lockout recovery + editable placeholder integration keys + settings row-size bug
57ff8cd  Stabilize env config + fix MySQL self-referencing subquery bugs + reliable payment seed
d1c40c7  Production audit: guaranteed admin seed + fix real MySQL 8.0 schema/query incompatibilities
```
