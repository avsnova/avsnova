# Rollback & Recovery Guide (Virtual Number System)

This project uses Git + reversible DB migrations so any change has a recovery path.

## Branch model
- `main` — stable/production.
- `develop` — integration branch.
- `feature/*`, `bugfix/*`, `release/*` — work branches.
- Tag stable releases: `git tag -a vX.Y.Z -m "..."`.

## One-click code rollback
```bash
# See tags / history
git tag
git log --oneline

# Roll the working tree back to the known-good baseline
git checkout v1.0.0-baseline        # detached HEAD to inspect
# or hard reset a branch to it (DESTRUCTIVE to uncommitted work):
git reset --hard v1.0.0-baseline

# Roll back just the last commit but keep history:
git revert HEAD
```

`v1.0.0-baseline` = the state captured before the Virtual Number restructure.

## Database migration rollback
Migrations live in `server/migrations/` and are tracked in `schema_migrations`.
```bash
npm run migrate:status     # list applied [x] / pending [ ]
npm run migrate            # apply all pending (up)
npm run migrate:down       # roll back the most recent migration (down)
```
Each migration file exports `up()` and `down()`. `down()` reverses the change where safe.
> SQLite note: dropping columns is unsafe on older versions, so column-adding migrations keep
> the (nullable, harmless) columns on `down()` and drop only indexes/tables. For a *full* revert
> of columns, restore the DB file from backup (below).

## Database file backup/restore (full revert)
```bash
# Backup (do this before any migration / deploy)
cp database.sqlite database.sqlite.bak-$(date +%Y%m%d-%H%M%S)

# Restore
cp database.sqlite.bak-XXXX database.sqlite
```

## Feature-flag rollback (instant, no redeploy)
Every new Virtual-Number behavior is behind a flag (table `feature_flags`, admin UI/API
`/api/admin/feature-flags`). To instantly disable a new behavior:
```bash
# via admin API (admin token):
curl -X POST /api/admin/feature-flags -d '{"key":"sms_txn_safe_purchase","enabled":false}'
```
Flags default to the OLD proven behavior, so turning a flag OFF restores prior behavior.

## Pre-deploy checklist
1. `cp database.sqlite database.sqlite.bak-...`
2. `git commit` all changes; tag if releasing.
3. `npm run migrate:status` then `npm run migrate`.
4. `node server/services/sms/__tests__/purchaseGuard.test.mjs` (must pass).
5. `./node_modules/.bin/tsc --noEmit` and `npm run build` (must succeed).
