# AVS Nova — Rollback Guide (cPanel + Passenger)

Use this if a deploy causes a regression. Rollbacks here are **code-only**; your MySQL data and
`.env` are never touched by these steps.

---

## Quick reference

| Symptom | Fastest fix |
|---|---|
| Homepage shows **"Cannot GET /"** | Frontend not built — just run `npm run build` + Restart (no rollback needed) |
| Bad code deployed | `git checkout <last-good-commit>` → `npm install && npm run build` → Restart |
| App won't boot (`/api/health` down) | Check `.env` (DB creds) + Node log; then rollback code if needed |
| Frontend broken, API fine | Rebuild `dist/` (`npm run build`) + Restart; API keeps serving meanwhile |

---

## A. Roll back to the previous good commit

```bash
cd ~/avs-app
git log --oneline -10                 # identify the last-known-good <hash>
git checkout <hash>                    # detached checkout of the good version
#   (or, to move the branch: git reset --hard <hash>)
npm install                            # deps for that version
npm run build                          # rebuild the frontend for that version
```
Then **Setup Node.js App → Restart** (or `touch ~/avs-app/tmp/restart.txt`) and hard-refresh.

Return to the latest branch tip later with: `git checkout <branch>` (e.g. `git checkout main`).

---

## B. "Cannot GET /" — not a rollback, just rebuild

This means `dist/` is missing (the build step was skipped). No code rollback needed:
```bash
cd ~/avs-app
npm run build
```
Restart the app. Confirm with:
```bash
curl -s https://avsnova.com/api/health   # deploy.frontend_dist_bytes should be > 0
```

---

## C. App fails to boot after deploy

1. Check the Node app's **stderr log** (Setup Node.js App → log, or `~/avs-app/stderr.log`).
2. Most common cause: **`.env`** missing/incorrect DB values →
   `[FATAL] Missing required database configuration`. Fix `.env`, Restart.
3. If it's a code fault, roll back with **Section A**.

---

## D. Verify after any rollback

```bash
curl -s -o /dev/null -w "GET / -> %{http_code}\n" https://avsnova.com/          # 200
curl -s https://avsnova.com/api/health                                          # status: ok
```
Confirm the Admin Panel loads and integrations still show correct keys.

---

## Safety notes

- **Data is safe:** rollbacks change code only. Never `DROP` the database to fix a deploy.
- **`.env` is preserved:** it's git-ignored and app-managed; rollbacks don't overwrite it.
- **Uploads are preserved:** `uploads/` lives in the app root, outside the build output.
- The backend keeps serving the API even when the frontend build is missing, so a rebuild fully
  restores the site with zero data impact.
