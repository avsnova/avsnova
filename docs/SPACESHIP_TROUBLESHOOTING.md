# SpaceShip Deployment — Troubleshooting Guide

Common issues when deploying this app to SpaceShip (cPanel + Passenger), with likely causes and
fixes. Check the Node app log first: **Setup Node.js App → your app → open the log**, or the
`stderr.log` in the app root.

---

### 1. 500 Internal Server Error / 503 Service Unavailable
**Likely causes & fixes**
- **App failed to boot.** Open the Node app log. The most common reasons:
  - `JWT_SECRET` missing/short → set a 32+ char `JWT_SECRET` in `.env`, restart.
  - `DB_TYPE=mysql but MYSQL_DATABASE is not set` → fill all `MYSQL_*` vars.
  - `SQLite is not permitted in production` → set `DB_TYPE=mysql` (never SQLite in prod).
- **Wrong startup file.** cPanel "Application startup file" must be **`app.js`**.
- **Dependencies not installed.** Run `npm install --omit=dev` in the app's virtualenv, restart.
- **Node version mismatch.** Select Node **20 LTS** in the Node.js App panel.
- After fixing, always click **Restart**.

### 2. 404 on page refresh / deep links (e.g. /dashboard)
- **Cause:** the built frontend isn't present, so the SPA catch-all can't serve `index.html`.
- **Fix:** run `npm run build` (creates `./dist`), then Restart. Confirm `dist/index.html` exists.

### 3. Database connection problems
- **`ER_ACCESS_DENIED` / `ECONNREFUSED`:** wrong `MYSQL_USER/PASSWORD/DATABASE/HOST`. On cPanel the
  db + user names are **prefixed** (`cpuser_...`). Host is usually `localhost`.
- **User not authorized:** in MySQL Databases, ensure the user is **added to** the database with
  **ALL PRIVILEGES**.
- **`ER_BAD_DB_ERROR`:** the database doesn't exist — create it in MySQL Databases.
- Test: the app logs `Production database initialized successfully (MySQL).` on a good boot.

### 4. File permission issues
- Folders **755**, files **644**. If uploads fail or the app can't write, check the **`uploads/`**
  folder is **755** and owned by your cPanel user.
- Never set anything to 777.

### 5. Storage problems (uploaded images/media disappear)
- **Cause:** `uploads/` was overwritten/deleted during a code update.
- **Fix:** never include/overwrite `uploads/` when uploading new code. Back it up before updates.

### 6. Email delivery failures
- **Auth failed (EAUTH/535):** wrong `SMTP_USER`/`SMTP_PASS`. Confirm `hello@avsnova.com` and its
  password; make sure the mailbox exists in cPanel → Email Accounts.
- **Wrong port/TLS:** use `SMTP_PORT=465` + `SMTP_SECURE=true` (SSL) or `587` + `SMTP_SECURE=false`
  (STARTTLS). Match what SpaceShip mail provides.
- **Emails go to spam:** set up SPF/DKIM/DMARC for avsnova.com in cPanel → Email Deliverability.
- **Sender still shows old address:** the app syncs the persisted SMTP sender from `.env` on boot —
  update `.env` and Restart. You can also edit it in the admin Email settings.
- Test from the admin panel's email/test feature, or trigger a password-reset email.

### 7. SSL / HTTPS configuration issues
- **No padlock / cert error:** cPanel → SSL/TLS Status → Run **AutoSSL** for `avsnova.com` + `www`.
- **Mixed content:** ensure `PUBLIC_URL=https://avsnova.com` (https, no trailing slash) so email
  and canonical links use https.
- **HSTS only after HTTPS:** the app sets HSTS only when it sees `x-forwarded-proto: https` (Passenger
  provides this) — normal.

### 8. Missing assets (icons, CSS, JS)
- **Cause:** frontend not built or `dist/` incomplete.
- **Fix:** `npm run build`, Restart. Confirm `/manifest.webmanifest` and `/service-worker.js` return 200.
- **Old cached assets:** bump `CACHE_VERSION` in `public/service-worker.js`, rebuild; users get the
  update on next visit (network-first navigations mean no hard refresh needed).

### 9. CORS issues
- **"Not allowed by CORS":** `CORS_ORIGINS` doesn't include the origin the browser used. Set
  `CORS_ORIGINS=https://avsnova.com,https://www.avsnova.com` and Restart.
- When the frontend is served by the same app (normal here), requests are same-origin and CORS
  rarely applies — a CORS error usually means the site was opened on a non-listed hostname/IP.

### 10. Session / login issues
- **"Invalid or expired session token":** the JWT was signed with a different `JWT_SECRET`.
  Changing `JWT_SECRET` invalidates all existing logins — users just log in again.
- **Can't log in as admin:** the admin email is **hello@avsnova.com** (migrated automatically).
  The password is unchanged from before. If forgotten, use "Forgot password".
- **Logged out on every request behind proxy:** ensure `trust proxy` (already set) and that
  Passenger forwards headers (default).

### 11. OTP failures (email verification / password reset)
- OTP is delivered by email → if OTPs don't arrive, it's an **email** problem (see #6).
- Check the code hasn't expired (short TTL); request a new one.
- Verify the mailbox isn't rate-limited by the mail host.

### 12. SMS synchronization failures
- **Provider errors / empty catalog:** confirm the provider API keys in `.env`
  (`GRIZZLY_SMS_API_KEY`, `FIVESIM_API_KEY`, `SMSPOOL_API_KEY`) or admin SMS settings.
- **Duplicate services:** fixed in code (SMSPool responses are de-duplicated by service id). If you
  still see dupes, they're cached client-side — hard refresh; the server now returns unique services.
- **Countries/prices/stock look wrong:** each pool loads its OWN provider's native catalog live;
  use the admin "SMS Pools" test/refresh. Balances/health show per provider.
- **Timers/refunds:** cancellations are provider-first; refunds are idempotent. Check the provider
  actually released the number (some enforce a cooldown before cancel).

### 13. SMM synchronization failures
- **Prices not updating:** prices are computed live on read (wholesale × exchange rate × markup +
  flat fee, floored at cost+min profit). Update the multiplier/flat fee in admin settings — it
  applies immediately. If the wholesale price is stale, run the admin **SMM catalog sync**.
- **Sync failing:** check `JAP_API_KEY`/`JAP_API_URL` in `.env` or admin. After 3 consecutive
  auto-sync failures the app alerts admins; check the JustAnotherPanel key/connection.
- **Exchange rate:** cached with fallback; a temporary outage won't break prices.

---

### General recovery
- **Restart** the app after any `.env` or dependency change.
- Keep a **dated backup** of the app folder + a **mysqldump** before each update, so you can roll
  back by restoring the folder and re-importing the SQL.
