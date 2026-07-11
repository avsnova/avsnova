// ============================================================================
//  Migration runner with rollback (§18).
//  Each migration is a module exporting { id, description, up(db), down(db) }.
//  Applied migrations are recorded in `schema_migrations` so `up` is idempotent and `down`
//  can safely roll back the most recent migration(s).
//
//  Usage:
//    node server/migrations/runner.js up        # apply all pending
//    node server/migrations/runner.js down      # roll back the most recent applied migration
//    node server/migrations/runner.js status    # list applied + pending
//
//  IMPORTANT: the app's initDb() already applies additive columns idempotently for zero-downtime
//  boots. These migrations exist to give an explicit, REVERSIBLE record + a rollback path for the
//  Virtual-Number-restructure schema changes (spec requirement: "migrations must support rollback").
// ============================================================================
import { dbRun, dbGet, dbAll, initDb } from "../db.js";
import { readdir } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureTable() {
  await dbRun(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(128) PRIMARY KEY,
    description TEXT,
    applied_at VARCHAR(255)
  )`);
}

async function loadMigrations() {
  const files = (await readdir(__dirname)).filter((f) => /^\d+_.*\.js$/.test(f)).sort();
  const mods = [];
  for (const f of files) {
    const m = await import(path.join(__dirname, f));
    if (m && m.id && typeof m.up === "function") mods.push(m);
  }
  return mods;
}

async function applied() {
  await ensureTable();
  const rows = await dbAll("SELECT id FROM schema_migrations ORDER BY id").catch(() => []);
  return new Set(rows.map((r) => r.id));
}

export async function up() {
  await ensureTable();
  const done = await applied();
  const migs = await loadMigrations();
  let n = 0;
  for (const m of migs) {
    if (done.has(m.id)) continue;
    console.log(`[migrate] applying ${m.id} — ${m.description}`);
    await m.up({ dbRun, dbGet, dbAll });
    await dbRun("INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)", [m.id, m.description || "", new Date().toISOString()]);
    n++;
  }
  console.log(n ? `[migrate] applied ${n} migration(s).` : "[migrate] nothing to apply.");
  return n;
}

export async function down() {
  await ensureTable();
  const last = await dbGet("SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1");
  if (!last) { console.log("[migrate] no applied migrations to roll back."); return 0; }
  const migs = await loadMigrations();
  const m = migs.find((x) => x.id === last.id);
  if (!m) { console.log(`[migrate] migration file for ${last.id} not found — cannot roll back safely.`); return 0; }
  if (typeof m.down !== "function") { console.log(`[migrate] ${last.id} has no down() — irreversible.`); return 0; }
  console.log(`[migrate] rolling back ${m.id} — ${m.description}`);
  await m.down({ dbRun, dbGet, dbAll });
  await dbRun("DELETE FROM schema_migrations WHERE id = ?", [last.id]);
  console.log(`[migrate] rolled back ${m.id}.`);
  return 1;
}

export async function status() {
  const done = await applied();
  const migs = await loadMigrations();
  for (const m of migs) console.log(`${done.has(m.id) ? "[x]" : "[ ]"} ${m.id} — ${m.description}`);
  const orphans = [...done].filter((id) => !migs.find((m) => m.id === id));
  if (orphans.length) console.log("applied-but-missing-file:", orphans.join(", "));
}

// CLI entry
const cmd = process.argv[2];
if (cmd) {
  (async () => {
    try {
      await initDb();
      if (cmd === "up") await up();
      else if (cmd === "down") await down();
      else if (cmd === "status") await status();
      else console.log("usage: node server/migrations/runner.js [up|down|status]");
    } catch (e) { console.error("[migrate] error:", e.message); process.exitCode = 1; }
    process.exit(process.exitCode || 0);
  })();
}
