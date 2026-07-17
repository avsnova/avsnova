# SpaceShip Shared Hosting — Deployment Guide (AUREVASHOP DIGITAL / avsnova.com)

SpaceShip Web Hosting runs Node.js apps through **cPanel → "Setup Node.js App"**, powered by
**CloudLinux + Phusion Passenger**. This means:

- **Passenger starts your app** — you do NOT use `npm start`, `node server.js`, PM2, or forever.
- You set an **Application startup file** (use **`app.js`**, already included).
- Passenger provides `process.env.PORT` and terminates HTTPS for you.
- Idle apps may be **spun down** and restarted on the next request (this app handles that fine).
- Use **MySQL** (SQLite is blocked in production by this app on purpose).

> This app is already prepared for all of the above. Follow the steps below in order.

---

## 0. What you need before starting
- SpaceShip hosting plan with cPanel access (Node.js 20 LTS available).
- Your domain **avsnova.com** managed in SpaceShip.
- The project files (zip **without** `node_modules`, `dist`, and `.env`).
- Real credentials: MySQL, SMTP (`hello@avsnova.com` / its password), payment keys.

---

## 1. Create the MySQL database
1. cPanel → **MySQL® Databases**.
2. Create a database, e.g. `avsnova_db` → becomes `cpuser_avsnova_db`.
3. Create a user, e.g. `avsnova_user` → `cpuser_avsnova_user`, with a strong password.
4. **Add user to database** → grant **ALL PRIVILEGES**.
5. Note: host `localhost`, port `3306`, and the prefixed db/user names.

---

## 2. Upload the project
1. cPanel → **File Manager**. Create a folder for the app, e.g. `/home/cpuser/avsnova`
   (this is the **Application root**, and does NOT need to be `public_html`).
2. Upload the project **.zip** there (exclude `node_modules`, `dist`, `.env`).
3. **Extract** it in File Manager.

---

## 3. Create the Node.js application
1. cPanel → **Setup Node.js App** → **Create Application**.
2. Configure:
   - **Node.js version:** 20 (LTS)
   - **Application mode:** Production
   - **Application root:** `avsnova` (the folder from step 2)
   - **Application URL:** `avsnova.com` (or a subdomain to test first)
   - **Application startup file:** `app.js`
3. Click **Create**. Passenger creates a Node virtual environment.

---

## 4. Configure environment variables (`.env`)
Two options — either works; `.env` is simplest:

**Option A — `.env` file (recommended):**
1. In File Manager, copy `.env.example` → `.env` in the Application root.
2. Fill in real values. Minimum required:
   ```env
   NODE_ENV=production
   PUBLIC_URL=https://avsnova.com
   CORS_ORIGINS=https://avsnova.com,https://www.avsnova.com
   JWT_SECRET=<paste a long random string>
   DB_TYPE=mysql
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=cpuser_avsnova_user
   MYSQL_PASSWORD=<db password>
   MYSQL_DATABASE=cpuser_avsnova_db
   SMTP_HOST=mail.avsnova.com        # or your SpaceShip mail host
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=hello@avsnova.com
   SMTP_PASS=<the SMTP password>
   SMTP_FROM="AUREVASHOP DIGITAL (AVS) Support" <hello@avsnova.com>
   SMTP_SENDER_NAME=AUREVASHOP DIGITAL (AVS)
   SMTP_REPLY_TO=hello@avsnova.com
   SUPER_ADMIN_EMAIL=hello@avsnova.com
   ```
   Generate `JWT_SECRET` in the cPanel Terminal:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

**Option B — cPanel UI:** In the Node.js App panel, add each variable under
**"Environment variables"**. (If you use this, you still don't commit secrets anywhere.)

> The app **refuses to boot in production without a strong `JWT_SECRET`** and **without MySQL** —
> this is intentional security.

---

## 5. Install dependencies & build the frontend
Open **cPanel → Terminal** (or use the "Run NPM Install" button), then from the Application root:
```bash
# Enter the app's Node virtual environment (cPanel shows the exact "source ..." line
# in the Node.js App panel — copy it). Then:
npm install --omit=dev     # install production dependencies
npm run build              # compile the React frontend into ./dist
```
- `npm install` downloads libraries. `npm run build` creates `./dist`, which the Node server
  serves automatically.

---

## 6. Import existing data (optional — only if migrating from SQLite)
If you have an old `database.sqlite` to migrate:
```bash
# upload database.sqlite to the app root, then:
node server/migrate-sqlite-to-mysql.js
```
It copies all rows into MySQL idempotently and prints per-table counts.
> If it's a brand-new install, skip this — the app creates all tables and seeds defaults on first boot.

---

## 7. Start / restart the app
- In **Setup Node.js App**, click **Restart**.
- Passenger boots `app.js`. First boot creates all tables and (on a fresh DB) seeds the Super Admin.

---

## 8. Point the domain & enable SSL
1. If `avsnova.com` is already on this hosting, the Node app URL mapping (step 3) handles routing.
   Otherwise set the domain's **A record / nameservers** to SpaceShip (cPanel → Zone Editor).
2. cPanel → **SSL/TLS Status** → select `avsnova.com` + `www` → **Run AutoSSL** (free Let's Encrypt).
3. Wait for DNS/SSL, then verify `https://avsnova.com` shows the padlock.

---

## 9. File permissions & storage
- Files: **644**, folders: **755** (File Manager default — usually fine).
- Ensure the **`uploads/`** folder exists and is writable (755). The app auto-creates it, but
  confirm it persists your uploaded media. Do NOT delete it during updates.
- No symlink/"storage linking" step is needed (this is not Laravel).

---

## 10. Cron jobs & background workers
- **Not required.** The app runs its own in-process schedulers (balance monitor, 6-hourly SMM
  catalog sync, health checks) while it's awake.
- Because Passenger may idle the app, add **ONE optional cron** to keep catalogs fresh and warm
  the app (cPanel → Cron Jobs), e.g. every 6 hours:
  ```
  0 */6 * * *  curl -s https://avsnova.com/api/health > /dev/null
  ```
- **Queues/workers:** none required — orders/payments are processed inline.

---

## 11. Cache clearing / rebuilding after an update
Passenger has no separate cache to clear. After deploying new code:
```bash
npm install --omit=dev   # if dependencies changed
npm run build            # rebuild the frontend
# then click "Restart" in Setup Node.js App
```
The service worker auto-invalidates old caches (bump `CACHE_VERSION` in
`public/service-worker.js` when you change cached assets).

---

## 12. Final production verification
- [ ] `https://avsnova.com` loads over HTTPS (padlock).
- [ ] `https://avsnova.com/api/health` → `{"status":"ok"}`.
- [ ] `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `service-worker.js` all load.
- [ ] Register a test account; receive the email; log in; log out.
- [ ] Log in as Super Admin (`hello@avsnova.com`); confirm admin panel loads.
- [ ] Fund-wallet dialog shows enabled gateways; a test payment credits the wallet.
- [ ] SMS panel lists channels/countries/services with no duplicates; buy → code → refund works.
- [ ] SMM panel shows services with correct (marked-up) prices; place a test order.
- [ ] Install the PWA on a phone (Add to Home Screen) and desktop (install icon).
- [ ] No errors in the browser console; no repeated errors in the Node app log.

*See `docs/SPACESHIP_TROUBLESHOOTING.md` if anything fails.*
