# Aurevashop — Production Deployment Guide

> 📌 **For the current, beginner-friendly, step-by-step deployment guide, see
> [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)** (cPanel + Node.js + MySQL, domain/DNS/SSL,
> env config, safe updates, rollback, and payment key setup). A full production-readiness report
> is in [`docs/PRODUCTION_READINESS_FINAL_REPORT.md`](docs/PRODUCTION_READINESS_FINAL_REPORT.md).
> The notes below are retained as background/reference.

This guide covers deploying the AVS Marketplace to production. The stack is:
- **Frontend:** React 19 + Vite, built to a single `dist/index.html` plus PWA assets in `dist/`.
- **Backend:** Node/Express (`server/index.js`), SQLite (`database.sqlite`).
- **Node:** v20.x (tested on v20.20.2).

> **Zero-code payment switch:** All payment provider keys (Paystack, Monnify, Paga,
> Flutterwave) and integration keys (JAP/SMM, GrizzlySMS, SMTP/IMAP) are read from the
> **Admin Panel → Settings** (DB `settings` table) with `.env` as fallback. Switching from
> test → live keys is done entirely in the Admin Panel — **no code changes or redeploy
> required.**

---

## 1. Prerequisites
- A Linux server (Ubuntu 22.04+ recommended) or a Node host (Render, Railway, Fly.io, VPS).
- Node.js 20.x and npm.
- A domain name with DNS access.
- (Recommended) A process manager: **PM2** or systemd.
- (Recommended) **Nginx** or **Caddy** as a reverse proxy for SSL + static hosting.

---

## 2. Environment Variables (`.env`)
Create `/path/to/app/.env`. These are **fallbacks** — anything set in Admin → Settings
overrides them at runtime. Never commit `.env` (it is git-ignored and excluded from snapshots).

```
# Core
PORT=5000
JWT_SECRET=<long-random-string>          # REQUIRED — use `openssl rand -hex 48`

# Payments (test values shown; enter LIVE values in Admin Panel for production)
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_SECRET_KEY=sk_test_xxx
MONNIFY_API_KEY=MK_TEST_xxx
MONNIFY_SECRET_KEY=xxx
MONNIFY_CONTRACT_CODE=xxx
MONNIFY_ENVIRONMENT=sandbox              # 'live' in production
MONNIFY_CURRENCY=NGN
PAGA_PUBLIC_KEY=xxx
PAGA_SECRET_KEY=xxx
PAGA_HASH_KEY=xxx
PAGA_BASE_URL=https://beta-collect.paga.com/   # https://collect.paga.com/ in production

# Integrations
GRIZZLY_SMS_API_KEY=xxx
JAP_API_URL=https://justanotherpanel.com/api/v2
JAP_API_KEY=xxx
GEMINI_API_KEY=xxx                       # optional (AI assistant)

# Telegram bot (optional real-time staff alerts + interactive actions)
TELEGRAM_BOT_TOKEN=xxx                    # from @BotFather; enables the bot when set
TELEGRAM_WEBHOOK_SECRET=xxx              # optional but recommended — verifies inbound webhooks

# Email (SMTP send + IMAP fetch for OTP retrieval)
SMTP_HOST=smtp.spacemail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=hello@yourdomain.com
SMTP_PASS=xxx
SMTP_FROM="Aurevashop <hello@yourdomain.com>"
SMTP_SENDER_NAME=Aurevashop
SMTP_REPLY_TO=hello@yourdomain.com
IMAP_HOST=imap.spacemail.com
IMAP_PORT=993
IMAP_SECURE=true
```

**Generate a strong JWT secret:** `openssl rand -hex 48`

---

## 3. Install & Build

```bash
# 1. Install dependencies
npm install

# 2. Type-check (must pass with exit 0)
./node_modules/.bin/tsc --noEmit

# 3. Build the frontend (outputs dist/index.html + PWA assets)
npm run build
```

The build produces:
- `dist/index.html` — the entire app (single-file, ~1.9 MB / ~418 KB gzip)
- `dist/manifest.webmanifest`, `dist/service-worker.js`, `dist/offline.html`
- `dist/icon-*.png`, `dist/apple-touch-icon.png`, `dist/favicon*` — PWA/app icons

---

## 4. Database Migration
The database is **self-migrating**. On first boot, `server/db.js` creates all tables and runs
idempotent `ALTER TABLE ... ADD COLUMN` migrations (wrapped in try/catch — safe to re-run).
No manual migration step is needed.

- **Fresh install:** `database.sqlite` is created automatically on first server start.
- **Existing DB:** new columns are added automatically; existing data is preserved.
- **First admin:** create/seed your Super Admin (see project README). Default admin login is
  configured via the users table; change the password immediately after first login.

---

## 5. Running in Production

### Option A — PM2 (recommended)
```bash
npm install -g pm2
pm2 start server/index.js --name avs-api --time
pm2 save
pm2 startup      # follow the printed command to enable boot persistence
```

### Option B — systemd
Create `/etc/systemd/system/avs.service`:
```ini
[Unit]
Description=Aurevashop API
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/app
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
EnvironmentFile=/path/to/app/.env
User=www-data

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now avs
```

The API listens on `PORT` (default 5000). Verify: `curl http://127.0.0.1:5000/api/health`
→ `{"status":"ok","ready":true}`.

---

## 6. Reverse Proxy, Static Hosting & SSL

The frontend (`dist/`) is served as static files; `/api/*` and `/uploads/*` proxy to the
Node backend. Example **Nginx**:

```nginx
server {
  listen 80;
  server_name yourdomain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name yourdomain.com;

  ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

  root /path/to/app/dist;
  index index.html;

  # PWA service worker must be served from the root scope with no long cache.
  location = /service-worker.js {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
  }
  location = /manifest.webmanifest { try_files $uri =404; }

  # API + uploads → Node backend
  location /api/     { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
  location /uploads/ { proxy_pass http://127.0.0.1:5000; }

  # SPA fallback
  location / { try_files $uri $uri/ /index.html; }
}
```

**SSL (Let's Encrypt):**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
Certbot auto-renews via its systemd timer. **Caddy** users get automatic HTTPS with a
2-line Caddyfile — no manual certs.

---

## 7. Payment Provider Setup (Webhooks & Callbacks)

After going live, in each provider dashboard set the webhook/callback URLs to your domain:

| Provider   | Webhook / Callback URL (set in provider dashboard)     | Signature verified |
|------------|--------------------------------------------------------|--------------------|
| Monnify    | `https://yourdomain.com/api/monnify/webhook`           | HMAC-SHA512 (raw body) |
| Paga       | `https://yourdomain.com/api/webhooks/paga/funding`     | SHA-512 hash |
| Flutterwave| `https://yourdomain.com/api/flutterwave/webhook`       | `verif-hash` + independent API re-verify |
| Paystack   | Verified via `GET /api/paystack/verify/:reference`     | server-side verify on redirect |

**Audited & production-ready (verified live):** every webhook verifies its provider signature
and **rejects invalid signatures (401)**; all wallet credits go through `creditWalletOnce()`
which is **idempotent** (atomic conditional insert keyed on the provider transaction
reference), so duplicate callbacks, retries, and concurrent deliveries **can never
double-credit**. Missing/short payloads are handled gracefully (200 ignore / 400) without
crashing. Failed/cancelled/refund events downgrade status safely.

Then in **Admin Panel → Settings**:
1. Paste the **LIVE** public/secret/contract/hash keys for each provider.
2. Set `MONNIFY_ENVIRONMENT=live` and Paga `PAGA_BASE_URL=https://collect.paga.com/`
   (or set via Admin Panel).
3. Save. Live payments work immediately — **no redeploy**.

Signature verification, duplicate-callback protection (idempotent wallet credit keyed on
reference), retries, and timeouts are already implemented server-side.

---

## 7b. Telegram Bot Setup (optional)

Real-time staff alerts (new orders, wallet funding, payments, support tickets, marketplace
purchases, API failures, system errors) with interactive inline buttons (approve orders,
update ticket status, view order details) and role-based access control.

1. Create a bot via **@BotFather** on Telegram → copy the token.
2. Set `TELEGRAM_BOT_TOKEN` (and recommended `TELEGRAM_WEBHOOK_SECRET`) in the server env; restart.
3. In **Admin Panel → System → Telegram Bot**, register the webhook URL:
   `https://yourdomain.com/api/telegram/webhook` (must be public HTTPS).
4. Each staff member opens the bot and sends **/start** to get their Chat ID.
5. Add each Chat ID in the panel with a role:
   - **viewer** — receives alerts + can view order details
   - **support** — + update support-ticket status
   - **manager** — + approve/deliver orders
   - **admin** — all capabilities
6. Use **Send test** to confirm delivery.

All Telegram actions are logged (activity log + audit log) and stay synchronized with the admin
dashboard in real time (SSE `broadcastAdminEvent`). The webhook rejects requests without the
correct secret header, and unauthorized/insufficient-role actions are denied and logged.

## 8. Cron Jobs / Background Tasks
The server runs its own in-process background workers on boot (SMM catalog sync, SMS catalog
preload, notification purge). **No external cron is required.** Optionally, for extra
resilience you may add:
- A daily DB backup cron (see §9).
- An uptime healthcheck hitting `/api/health`.

---

## 9. Backup & Restore Strategy

**What to back up:**
- `database.sqlite` — all app data (users, orders, inventory, settings).
- `uploads/` — user/admin uploaded files.
- `.env` — credentials (store securely, encrypted).
- `server/email-template.html` + `server/email-config.json` — email branding.

**Backup (daily cron example):**
```bash
0 2 * * * cd /path/to/app && sqlite3 database.sqlite ".backup '/backups/db-$(date +\%F).sqlite'" && tar czf /backups/uploads-$(date +\%F).tar.gz uploads/
```
Use `.backup` (not a raw file copy) for a consistent snapshot while the app is running.
Rotate/retain 14–30 days; ship copies off-server (S3/Backblaze).

**Restore:**
```bash
pm2 stop avs-api
cp /backups/db-YYYY-MM-DD.sqlite database.sqlite
tar xzf /backups/uploads-YYYY-MM-DD.tar.gz
pm2 start avs-api
```

---

## 10. Monitoring & Logging
- **App logs:** `pm2 logs avs-api` (or `journalctl -u avs`). The server logs email delivery,
  audit actions, payment processing, and SMM/SMS sync.
- **Email log:** `emails.log` records every outbound email (audit trail).
- **Health:** poll `GET /api/health` for readiness.
- **Recommended:** UptimeRobot/BetterStack on `/api/health`; optionally pipe logs to a
  aggregator (Grafana Loki, Papertrail).

---

## 11. Deployment Checklist
- [ ] `.env` created with a strong `JWT_SECRET`.
- [ ] `npm install` completed.
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` succeeded; `dist/` contains `index.html` + PWA assets.
- [ ] Backend running under PM2/systemd; `/api/health` returns ready.
- [ ] Nginx/Caddy serving `dist/` + proxying `/api` and `/uploads`.
- [ ] SSL certificate installed and auto-renewing.
- [ ] Domain DNS pointing at the server.
- [ ] Super Admin password changed from default.
- [ ] Payment provider LIVE keys entered in Admin Panel (when ready).
- [ ] Payment webhook/callback URLs configured in provider dashboards.
- [ ] SMTP/IMAP verified (Admin → Email Center → Test SMTP/IMAP).
- [ ] Daily backup cron configured and tested (restore drill).
- [ ] Health monitoring configured.
- [ ] No test/demo data left (see §13).

---

## 12. Rollback Procedure
- **App code:** keep the previous `dist/` build and `server/` as a tagged release/backup;
  to roll back, restore the previous folder and restart the process manager.
- **Settings:** the Admin Panel includes a **Settings Snapshot / Restore** feature — restore
  a previous configuration in one click without touching the DB (see Admin → Settings).
- **Database:** restore from the most recent `.backup` snapshot (§9).

---

## 13. Post-Deployment Verification
1. `curl https://yourdomain.com/api/health` → `{"status":"ok","ready":true}`.
2. Load the site in a browser; confirm the app renders and the **Install App** prompt appears
   (PWA installable).
3. Register a test user; confirm the welcome email arrives (check inbox + `emails.log`).
4. Fund a wallet via a live payment (small amount); confirm wallet credit + confirmation email.
5. Place one order per module (Marketplace, eSIM, Physical SIM, Gift, SMM); confirm each
   appears in the correct admin dashboard and fulfils correctly.
6. Confirm SMM catalog synced (Admin → SMM) and prices are ≥ provider cost (pricing protection).
7. Run the Admin **Email Center** SMTP + IMAP tests.
8. Verify **no test/demo data** remains (`UPDATE users SET wallet_balance=0` for any test
   accounts; remove test products/orders/credentials).
9. Install the PWA on a phone; verify icon, splash, and standalone launch.

---

## 14. Security Notes
- Serve everything over HTTPS only (redirect 80 → 443).
- Keep `.env`, `database.sqlite`, and `uploads/` outside the web root (they are, by default —
  only `dist/` is web-served).
- Rotate `JWT_SECRET` only during a maintenance window (invalidates all sessions).
- Restrict server SSH; keep the OS and Node patched.
- Provider secret keys live in the DB (`settings`) — ensure DB backups are encrypted at rest.
