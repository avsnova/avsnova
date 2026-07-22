# AVS Nova — Production Deployment (cPanel + CloudLinux Passenger)

**Stack:** React + Vite + Tailwind (frontend) · Node.js + Express (backend) · MySQL
**Host:** cPanel / CloudLinux Phusion Passenger (no PM2) · **Node:** 20.x
**Application Root:** `avs-app` · **Startup file:** `app.js` · **Repo:** https://github.com/avsnova/avsnova.git

---

## How it serves (the important part)

- `app.js` (Passenger startup file) simply does `import "./server/index.js"`.
- `server/index.js` is the Express app. Passenger provides `process.env.PORT`; the app calls
  `app.listen(PORT)`. TLS is terminated by the web server.
- **Frontend:** the Node server serves the compiled React bundle from **`dist/`** — but ONLY if a
  build exists. Serving is one `express.static(dist)` + one SPA fallback (no duplicates):
  - `GET /` and any non-`/api`, non-`/uploads` GET → `dist/index.html` (client-side routing works).
  - `GET /api/*` → the API; unknown `/api/*` → clean JSON 404 (never the HTML shell).
  - `GET /uploads/*` → uploaded media (absolute path, cwd-independent).
- **`dist/` is git-ignored**, so a Git deploy does NOT ship it. It MUST be generated on the server
  by **`npm run build`**. **Skipping the build is the sole cause of "Cannot GET /".**

`.env` and `uploads/` are loaded/served by **absolute paths anchored to the app root**, so the app
works regardless of the process working directory Passenger uses.

---

## One-time setup

1. **cPanel → Git™ Version Control → Create**
   - Clone URL: `https://github.com/avsnova/avsnova.git`
   - Repository Path: `/home/<cpaneluser>/avs-app`
2. **Create the MySQL database + user** (cPanel → MySQL® Databases) and grant ALL privileges.
   Use a **utf8mb4** database (the app also enforces utf8mb4 per-table).
3. **Create `.env`** in `avs-app/` (copy `.env.example` → `.env`) and fill REAL values:
   - `MYSQL_HOST` (usually `localhost`), `MYSQL_PORT` (3306), `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
   - `JWT_SECRET` (strong, ≥32 chars), `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`
   - Integrations you use: Paystack, Monnify, Paga, SMTP, Grizzly, 5SIM, SMSPool, JAP (SMM), Telegram
   - **Do NOT add a `NODE_ENV` line** to `.env` (Passenger/npm scripts set the mode).
   - The app **never writes to `.env`** — you own it. It is git-ignored; never commit it.
4. **cPanel → Setup Node.js App → Create Application**
   - Node.js version: **20.x**
   - Application mode: **Production**
   - Application root: **`avs-app`**
   - Application startup file: **`app.js`**
   - Application URL: your domain (`avsnova.com`)

---

## Deploy / update workflow

> ⚠️ cPanel's **"Run NPM Install"** runs `npm install` ONLY — it does **NOT** build the frontend.
> You must also run the build, or the homepage will show **"Cannot GET /"**.

**GitHub → cPanel Git Pull → npm install → npm run build → Restart Passenger → Verify**

1. **Push to GitHub** (from your machine).
2. **Pull on cPanel:** Git™ Version Control → **Update from Remote** (Pull).
3. **Install deps:** Setup Node.js App → **Run NPM Install**  _(or Terminal: `cd ~/avs-app && npm install`)._
4. **Build the frontend (REQUIRED):**
   - Setup Node.js App → **Run JS script** → run **`build`**, OR
   - Terminal: `cd ~/avs-app && npm run build`
   - Shortcut for steps 3–4: `npm run deploy`  (= `npm install && npm run build`).
5. **Restart Passenger:** Setup Node.js App → **Restart**  _(or `touch ~/avs-app/tmp/restart.txt`)._
6. **Hard-refresh** the browser (Ctrl/Cmd+Shift+R).

---

## Verification (run all — this is the production sign-off)

```bash
# 1. Homepage serves the React app
curl -s -o /dev/null -w "GET / -> %{http_code}\n" https://avsnova.com/            # expect 200

# 2. SPA deep-links fall back to the app shell
curl -s -o /dev/null -w "GET /dashboard -> %{http_code}\n" https://avsnova.com/dashboard  # expect 200

# 3. API health + deploy fingerprint (confirms the build is actually live)
curl -s https://avsnova.com/api/health
#   expect: "status":"ok","ready":true  AND
#           deploy.frontend_dist_index_html = a recent date, deploy.frontend_dist_bytes > 0
#   (if frontend shows "missing"/0 → the build step didn't run; repeat step 4)

# 4. Unknown API route returns JSON (not HTML)
curl -s -o /dev/null -w "GET /api/nope -> %{http_code}\n" https://avsnova.com/api/nope  # expect 404 JSON
```

Then log in to the Admin Panel and confirm your integrations (Paystack/Monnify/Paga/SMTP/Grizzly/
5SIM/SMM/Telegram) show the correct live keys (Admin → Settings). Keys live in the DB `settings`
table with `.env` as fallback — switching test→live keys needs no redeploy.

---

## Deployment checklist (copy/paste)

- [ ] `git push` to GitHub
- [ ] cPanel Git → Update from Remote (Pull)
- [ ] `.env` present in `avs-app/` with real MySQL + integration values (no `NODE_ENV` line)
- [ ] `npm install` (Run NPM Install)
- [ ] `npm run build`  ← **the step that prevents "Cannot GET /"**
- [ ] Restart the Node app (Passenger)
- [ ] `curl https://avsnova.com/` → 200
- [ ] `curl https://avsnova.com/api/health` → `status: ok`, `deploy.frontend_dist_bytes > 0`
- [ ] Admin Panel loads; integrations show correct keys
- [ ] Deployment complete ✅

---

## Protected features (unchanged by deployment work)

Authentication · Admin Panel · User Dashboard · Marketplace · SMS Pools · SMS Routing · Grizzly SMS ·
5SIM · SMSPool · JustAnotherPanel (SMM) · Paystack · Monnify · Paga · SMTP · Telegram · MySQL ·
Refunds · Orders · Wallet · Notifications · Uploads · Admin Analytics · DB migrations.

The deployment changes touch **only** env/uploads path resolution and packaging — **no feature
logic, no business logic, no routes were altered.**
