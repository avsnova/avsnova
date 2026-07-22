# AVS Nova — cPanel (CloudLinux + Passenger) Git Deployment Guide

_Production: https://avsnova.com · Node v20.20.2 · App root: `avs-app` · Startup file: `app.js`_

---

## ROOT CAUSE of "Cannot GET /" (confirmed by reproduction)

The backend was healthy (`/api/health` = ok) but `https://avsnova.com/` returned **"Cannot GET /"**.

**Why:** the Node server only serves the React frontend when a built **`dist/index.html`** exists
(`server/index.js` gates all frontend serving behind `hasBuild = fs.existsSync(dist/index.html)`).
`dist/` is **git-ignored** (`.gitignore` line 5), so a Git-based deploy **never ships `dist/`** — it must
be generated on the server by **`npm run build`**. If that build step is skipped (or fails), there is no
`dist/`, so `GET /` has nothing to serve → Express returns "Cannot GET /".

**This is a build/deploy-step gap, NOT a code bug.** Verified live:
- No `dist/` → `GET /` = HTTP 404 "Cannot GET /", `/api/health` = ok (`frontend: missing`).
- After `npm run build` → `GET /` = HTTP 200 serving the React app; `/dashboard` deep-link = 200
  (SPA fallback); `/api/*` still routes correctly; unknown `/api/*` = clean JSON 404.

**The fix is operational: always run `npm run build` on the server after every deploy.**

---

## Deployment structure (verified present)

```
avs-app/
├── app.js                 # Passenger entry — imports ./server/index.js
├── server/                # Express backend (index.js, services, migrations)
├── src/                   # React source (compiled by Vite; NOT served directly)
├── dist/                  # BUILD OUTPUT (git-ignored) — created by `npm run build`, SERVED in prod
├── package.json
├── package-lock.json
└── .env.example           # copy to .env and fill real values (never commit .env)
```

- **Frontend serving:** exactly ONE `express.static(dist)` + ONE SPA fallback in `server/index.js`
  (no duplicates). `/uploads` is a separate, intentional static mount.
- `app.js` = `import "./server/index.js";` — Passenger sets `process.env.PORT`; the app listens on it.

---

## One-time cPanel setup

1. **cPanel → Git™ Version Control → Create:**
   - Clone URL: `https://github.com/avsnova/avsnova.git`
   - Repository Path: `/home/<cpaneluser>/avs-app`  (this becomes the Application Root)
2. **cPanel → Setup Node.js App → Create Application:**
   - Node.js version: **20.x** (matches v20.20.2; enforced by `engines` in package.json)
   - Application mode: **Production**
   - Application root: **`avs-app`**
   - Application startup file: **`app.js`**
   - Application URL: your domain (avsnova.com)
3. **Create `.env`** in `avs-app/` (copy from `.env.example`) and fill REAL values:
   - `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` (production DB)
   - `JWT_SECRET` (strong, ≥32 chars), `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`
   - Integrations you use: Paystack, Monnify, Paga, SMTP, Grizzly, 5SIM, JAP (SMM), Telegram
   - Do **NOT** put `NODE_ENV` in `.env` (Passenger/npm scripts set the mode).
   - The app **never writes to `.env`**; you manage it.

---

## Deploy / update workflow (every release)

> cPanel's "Run NPM Install" runs `npm install` ONLY — it does **NOT** build the frontend.
> You must also run the build. Use the Node App's **"Run JS script"** to run `build`, or the Terminal.

**GitHub → cPanel Git → install → build → restart**

1. **Pull latest code:** cPanel → Git Version Control → **Update from Remote** (or `Pull`).
2. **Install dependencies:** Setup Node.js App → **Run NPM Install**
   _(or Terminal: `cd ~/avs-app && npm install`)._
3. **Build the frontend (REQUIRED — this is what fixes "Cannot GET /"):**
   - Setup Node.js App → **Run JS script** → run the **`build`** script, **OR**
   - Terminal: `cd ~/avs-app && npm run build`
   - (Convenience: the **`deploy`** script does install + build in one: `npm run deploy`.)
4. **Restart the app:** Setup Node.js App → **Restart** (or `touch ~/avs-app/tmp/restart.txt`).
5. **Hard-refresh** the site in your browser (Ctrl/Cmd+Shift+R).

---

## Verify after deploy (do all four)

```bash
# 1. Frontend loads the React app (HTTP 200, HTML with <div id="root">)
curl -s -o /dev/null -w "GET / -> %{http_code}\n" https://avsnova.com/

# 2. SPA deep-link falls back to the app shell (HTTP 200)
curl -s -o /dev/null -w "GET /dashboard -> %{http_code}\n" https://avsnova.com/dashboard

# 3. API health returns JSON AND the deploy fingerprint (confirms build is live)
curl -s https://avsnova.com/api/health
#   Expect: "status":"ok" AND deploy.frontend_dist_index_html = a recent date,
#           deploy.frontend_dist_bytes > 0  (NOT "missing"/0)

# 4. Unknown API route returns clean JSON 404 (not the HTML shell)
curl -s -o /dev/null -w "GET /api/nope -> %{http_code}\n" https://avsnova.com/api/nope
```

If `/api/health` shows `deploy.frontend_dist_index_html: "missing"` → the build step didn't run;
repeat step 3 of the deploy workflow.

---

## Rollback

**Fast (revert to previous commit):**
```bash
cd ~/avs-app
git log --oneline -5            # find the last-known-good commit hash
git checkout <good-hash>        # or: git reset --hard <good-hash>
npm install && npm run build    # rebuild frontend for that version
# Setup Node.js App → Restart
```

**If a deploy left a broken/empty `dist/`:** just re-run `npm run build` and Restart — the server
auto-detects the rebuilt `dist/` on the next start.

**Emergency (backend up, frontend broken):** the API keeps serving even with no `dist/`
(`/api/health` stays ok). Rebuild `dist/` and restart to restore the homepage; no data is affected.

---

## Protected features (unchanged — verified routing intact)

Authentication, Admin panel, SMS pools, Grizzly SMS, 5SIM, SMS routing, SMM (JAP), Paystack,
Monnify, Paga, SMTP, Telegram alerts, and DB migrations are all untouched. This change is
deployment-only: it does not alter any feature logic.
