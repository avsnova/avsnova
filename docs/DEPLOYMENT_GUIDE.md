# AUREVASHOP DIGITAL (AVS) — Beginner Deployment Guide

This guide walks you through deploying **this exact project** to a live server (cPanel with
Node.js), connecting your domain **avsnova.com**, setting up the database, going live, and
updating safely afterward. It assumes **no prior deployment experience**. Follow it one step at
a time — there is a checklist at the very bottom you can tick off.

> Two golden rules:
> 1. **Never commit or upload your real `.env` file** (it holds your secrets).
> 2. **Never overwrite `database.sqlite` / your MySQL data or `uploads/`** during updates.

---

## PART A — Before you deploy (prerequisites)

You need:
- [ ] A **cPanel hosting account** that supports **Node.js** (look for "Setup Node.js App" in cPanel). Node **v20 or newer**.
- [ ] A **MySQL database** (cPanel → "MySQL Databases"). Recommended over SQLite for a live site.
- [ ] Your **domain** `avsnova.com` pointed at this hosting account.
- [ ] Your **production credentials** ready: SMTP email login, and payment keys (Paystack/Flutterwave/Monnify/Paga; PalmPay/Nomba later).
- [ ] The project files (this repository).

Verify the project is production-ready locally first (optional but recommended):
```bash
npm install       # install dependencies
npm run typecheck # should report no errors
npm run build     # should create the ./dist folder
```

---

## PART B — Domain & Hosting (DNS + SSL)

1. **Point the domain to your host.** In your domain registrar (where you bought avsnova.com),
   set the **nameservers** to the ones your cPanel host gave you, OR create an **A record** for
   `@` (and `www`) pointing to your server's IP address (cPanel → "Zone Editor").
2. **Wait for DNS to propagate** (minutes to a few hours). Check with https://dnschecker.org.
3. **Enable SSL/HTTPS.** In cPanel → "SSL/TLS Status" → select `avsnova.com` and `www.avsnova.com`
   → click **Run AutoSSL**. This installs a free Let's Encrypt certificate.
4. **Verify:** visiting `https://avsnova.com` should show a padlock (even before the app is up,
   you'll at least get the host's default page).

---

## PART C — Create the production database (MySQL)

1. cPanel → **MySQL Databases**.
2. **Create a database**, e.g. `avsnova_db`. cPanel prefixes it with your account name
   (e.g. `cpaneluser_avsnova_db`).
3. **Create a database user**, e.g. `avsnova_user`, with a strong password. **Save these.**
4. **Add the user to the database** and grant **ALL PRIVILEGES**.
5. Note these four values — you'll put them in `.env`:
   - Host: usually `localhost`
   - Database name: `cpaneluser_avsnova_db`
   - Username: `cpaneluser_avsnova_user`
   - Password: (the one you set)

---

## PART D — Upload the project

1. cPanel → **File Manager**. Go to a folder **outside** `public_html` if your host supports it
   (e.g. `/home/cpaneluser/avsnova`), or into a subfolder — your Node app root does **not** have
   to be `public_html` (this app serves its own frontend from `./dist`).
2. Upload the project as a **.zip** (everything **except** `node_modules`, `dist`, and `.env`).
3. **Extract** the zip in File Manager.

---

## PART E — Configure environment variables (`.env`)

1. In File Manager, copy `.env.example` to a new file named **`.env`** (in the project root).
2. Edit `.env` and fill in **real** values. The important ones:

```env
NODE_ENV=production
PORT=5000                       # cPanel may override/assign this automatically
PUBLIC_URL=https://avsnova.com
CORS_ORIGINS=https://avsnova.com,https://www.avsnova.com

# Generate a strong secret (see command below) and paste it here:
JWT_SECRET=PASTE_A_LONG_RANDOM_STRING_HERE

DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=cpaneluser_avsnova_user
MYSQL_PASSWORD=your_db_password
MYSQL_DATABASE=cpaneluser_avsnova_db

SMTP_HOST=mail.avsnova.com
SMTP_PORT=587
SMTP_USER=hello@avsnova.com
SMTP_PASS=your_email_password
SMTP_FROM="AUREVASHOP DIGITAL (AVS) Support" <hello@avsnova.com>
SMTP_REPLY_TO=support@avsnova.com

# Payment keys — paste when you have them (see PART J):
PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=
# ...etc (see .env.example for the full list)
```

**Generate a strong `JWT_SECRET`** — run this on your computer (or in the cPanel terminal) and
paste the output:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> ⚠️ The app **will refuse to start in production** if `JWT_SECRET` is missing or shorter than 32
> characters. This is intentional security.

---

## PART F — Node.js deployment (cPanel "Setup Node.js App")

1. cPanel → **Setup Node.js App** → **Create Application**.
2. Set:
   - **Node.js version:** 20 (or newer)
   - **Application mode:** Production
   - **Application root:** the folder you extracted to (e.g. `avsnova`)
   - **Application URL:** `avsnova.com`
   - **Application startup file:** `server/index.js`
3. Click **Create**.
4. In the app's panel, find **"Detected configuration files"** / **"Run NPM Install"** and click
   it — OR open the **Terminal** (cPanel → Terminal) and run, from the app root:
   ```bash
   npm install --omit=dev   # installs dependencies
   npm run build            # builds the frontend into ./dist
   ```
   > What each does: `npm install` downloads the libraries the app needs; `npm run build`
   > compiles the React frontend into `./dist`, which the Node server then serves.
5. In the Node App panel, add your **Environment Variables** if you prefer the UI instead of the
   `.env` file (either works — `.env` is simplest). At minimum ensure `NODE_ENV=production`.
6. Click **Restart** to start the app.
7. **Verify the database connection & boot:** open cPanel Terminal and check the log, or visit
   `https://avsnova.com/api/health` — it should return `{"status":"ok","ready":true,...}`.

> The first boot automatically **creates all database tables** and seeds a Super Admin.

---

## PART G — First-run verification (do this once, live)

Open `https://avsnova.com` and confirm:
- [ ] Homepage loads (with the padlock / HTTPS).
- [ ] `https://avsnova.com/api/health` returns `status: ok`.
- [ ] `https://avsnova.com/robots.txt` and `/sitemap.xml` load.
- [ ] You can **register** a test account and **log in**.
- [ ] Log in as the **Super Admin** — `hello@avsnova.com` (see note) with the seeded password,
      then **immediately change the password** in the admin panel.

> **Super Admin note:** the seeded admin email may still be `hello@avslogs.org` on an existing
> database, or `hello@avsnova.com` on a fresh one. Log in with whichever exists, then update the
> email + password from the admin Users panel. **Do not leave the default password in place.**

---

## PART H — Migrating existing data from SQLite → MySQL (only if you have old data)

If you were previously running on SQLite (`database.sqlite`) and want to move that data to MySQL:

1. Make sure the MySQL app has **booted at least once** (so the tables exist).
2. Upload your old `database.sqlite` to the project root.
3. In cPanel Terminal, from the app root, run:
   ```bash
   node server/migrate-sqlite-to-mysql.js
   ```
   It reads your `.env` MySQL settings and copies all rows (idempotently — safe to re-run).
4. It prints per-table row counts. Spot-check important tables (users, orders, transactions).

---

## PART I — Updating the website safely (after go-live)

**Files you must NEVER overwrite on the server:**
- `.env` (your secrets)
- `database.sqlite` (if you use SQLite) / your MySQL data
- `uploads/` (customer/admin uploaded media)

**Files that are safe to replace on an update:** everything in `src/`, `server/`, `public/`,
`index.html`, `package.json`, etc. — i.e. the code.

**Safe update procedure:**
1. **Back up first** (see PART K rollback): copy the current app folder and export the DB.
2. Upload the new code (zip **without** `.env`, `node_modules`, `dist`, `uploads`, `database.sqlite`).
3. Extract, overwriting the old **code** files only.
4. In Terminal, from the app root:
   ```bash
   npm install --omit=dev   # in case dependencies changed
   npm run build            # rebuild the frontend
   ```
5. **Restart** the Node app (Setup Node.js App → Restart).
6. Verify `https://avsnova.com/api/health` and click through a couple of pages.

**Test before going live (recommended):** create a second Node app / subdomain (e.g.
`staging.avsnova.com`) pointing to a copy of the code + a separate test database, deploy there
first, verify, then repeat on production.

---

## PART J — Payment API keys (sandbox → production)

When you receive production keys from a provider (PalmPay, Monnify, Paystack, Flutterwave, Nomba):

1. **Where they go:** put them in `.env` (or the admin **Settings**, which override `.env`).
   **Never hard-code keys in the source.** See `.env.example` for the exact variable names.
2. **Switch sandbox → live:** set the provider's environment variable to production, e.g.
   `MONNIFY_ENVIRONMENT=production`, `PALMPAY_ENVIRONMENT=production`, `NOMBA_ENVIRONMENT=production`.
   (Paystack/Flutterwave use live vs test **keys** — just paste the `..._live_...` keys.)
3. **Restart** the app.
4. **Verify readiness:** as an admin, call `GET /api/admin/payments/providers` (or view it in the
   admin panel). Each provider shows `configured`, `environment`, and which keys are set —
   **without ever revealing the secret values.**
5. **Enable the method** so customers see it: admin → payment methods toggle.
6. PalmPay & Nomba also need their adapter REST calls filled in (`server/services/payments/adapters/`)
   — the `TODO`s are marked. Paystack/Flutterwave/Monnify/Paga are already fully integrated.

---

## PART K — Git: version history & rollback (plain-English)

Git is your "undo button" for the whole project. Basic commands:

```bash
# See what changed
git status

# Save a snapshot (a "commit") with a message
git add -A
git commit -m "Describe what you changed"

# Send your commits to a remote (e.g. GitHub) — set 'origin' up once
git push origin main

# Get the latest code from the remote
git pull origin main
```

**Undo / roll back to a previous working version:**
```bash
# See recent snapshots (newest first)
git log --oneline

# TEMPORARILY look at an older version (read-only)
git checkout <commit-id>

# Go back to the latest
git checkout main

# PERMANENTLY revert a bad commit while KEEPING history (safest)
git revert <commit-id>

# HARD reset to a known-good commit (dangerous — discards later work)
git reset --hard <commit-id>
```

**Recover from a mistake:**
- Deleted a file but not committed yet: `git checkout -- path/to/file`
- Committed something bad: `git revert <commit-id>` (creates a new commit that undoes it).
- "I broke everything": `git reflog` shows every recent state; `git reset --hard <id>` returns to it.

> On the server, the simplest rollback is: keep a **dated backup copy** of the app folder + a DB
> export before each update. If an update fails, restore the folder copy and re-import the DB.

---

## PART L — Final verification (before you call it done)

- [ ] `https://avsnova.com` loads over HTTPS with no certificate warning.
- [ ] `https://avsnova.com/api/health` → `status: ok`.
- [ ] Register a new account, receive the verification/welcome email, log in, log out.
- [ ] Password reset email arrives and works.
- [ ] Fund-wallet dialog shows your enabled payment methods; a test payment completes and credits the wallet.
- [ ] Buy a product / SMS number end-to-end; it appears in orders/inventory.
- [ ] Admin panel loads; you changed the Super Admin password.
- [ ] Add a couple of **Social Links** in the admin → they appear in the footer; remove them → the footer social section disappears.
- [ ] No errors in the browser console (F12) and no repeated errors in the server log.

---

## STEP-BY-STEP CHECKLIST (tick one at a time)

1. [ ] Confirm host has Node v20+ and MySQL.
2. [ ] Point `avsnova.com` DNS to the host; run AutoSSL; confirm HTTPS.
3. [ ] Create MySQL database + user; grant all privileges; save the 4 values.
4. [ ] Upload & extract the project (no `.env` / `node_modules` / `dist`).
5. [ ] Create `.env` from `.env.example`; fill real values; generate a strong `JWT_SECRET`.
6. [ ] Setup Node.js App: root, startup file `server/index.js`, mode Production.
7. [ ] Run `npm install --omit=dev` then `npm run build`.
8. [ ] Restart the app; check `/api/health`.
9. [ ] (If migrating) run `node server/migrate-sqlite-to-mysql.js`; verify row counts.
10. [ ] Log in as Super Admin; **change the password**; set branding/social links.
11. [ ] Add production payment keys; set environments to production; enable methods; verify via admin.
12. [ ] Run the Final Verification list above.
13. [ ] Set up regular DB backups.

*You're live. For future updates, follow PART I. For rollbacks, PART K.*
