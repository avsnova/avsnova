// ============================================================================
//  Feature Flags (§19) — runtime on/off switches, no redeploy required.
//  Cached in-memory (5s TTL) so hot paths don't hit the DB every call. Admin toggles via
//  /api/admin/feature-flags. Defaults are seeded in db.js and keep CURRENT behavior.
// ============================================================================
import { dbGet, dbAll, dbRun } from "../db.js";

let _cache = { at: 0, map: new Map() };
const TTL_MS = 5000;

async function refresh() {
  const rows = await dbAll("SELECT key, enabled FROM feature_flags").catch(() => []);
  const map = new Map();
  for (const r of rows) map.set(r.key, r.enabled === 1);
  _cache = { at: Date.now(), map };
  return map;
}

// Is a flag enabled? `fallback` is used if the flag row doesn't exist yet.
export async function isEnabled(key, fallback = false) {
  if (Date.now() - _cache.at > TTL_MS) await refresh();
  return _cache.map.has(key) ? _cache.map.get(key) : fallback;
}

export async function getAllFlags() {
  return dbAll("SELECT key, enabled, description, updated_at, updated_by FROM feature_flags ORDER BY key").catch(() => []);
}

export async function setFlag(key, enabled, actor = "system") {
  await dbRun(
    "INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    [key, enabled ? 1 : 0, new Date().toISOString(), actor]
  );
  await refresh();
  return isEnabled(key);
}
