import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

// ─── Database engine: MySQL / MariaDB ONLY ───────────────────────────────────
// This project uses MySQL as its single database engine in every environment (development AND
// production). SQLite has been removed entirely — there is no file-DB fallback. Configure the
// connection with MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE in .env
// (see .env.example). For local development, run a local MySQL/MariaDB and point .env at it.
export const DB_TYPE = "mysql";

// Required connection variables must be present — refuse to start with a clear message otherwise,
// so misconfiguration is caught immediately instead of failing on the first query.
const REQUIRED_DB_VARS = ["MYSQL_DATABASE", "MYSQL_USER"];
const missing = REQUIRED_DB_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`[FATAL] Missing required database configuration: ${missing.join(", ")}.`);
  console.error("        Set MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE in .env (see .env.example).");
  process.exit(1);
}

console.log("[AVS Database] Connecting in high-concurrency MySQL mode...");
const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.MYSQL_POOL_LIMIT || "20"),
  queueLimit: 0,
  charset: "utf8mb4",
});
// MySQL 8.0 enables ONLY_FULL_GROUP_BY by default, which rejects several of the app's legacy
// GROUP BY queries (they group by the primary key / a single column and select related fields).
// Relax just that one mode on every fresh physical connection so behaviour is consistent with
// MariaDB and older MySQL. All other strict-mode protections stay on.
mysqlPool.on("connection", (conn) => {
  conn.query("SET SESSION sql_mode = REPLACE(@@SESSION.sql_mode, 'ONLY_FULL_GROUP_BY', '')");
});

// DDL (schema) statements can't run through mysql2's prepared-statement `execute()`; they must
// use `query()`. This detects the schema verbs so dbRun can route them correctly on MySQL.
const isDdl = (sql) => /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(sql);

// The database engine actually in use (always "mysql").
export const getActiveDbType = () => DB_TYPE;

// Verify the database is actually reachable before we try to build the schema. This turns the
// cryptic, repeating "ECONNREFUSED" crash loop into a single, clear, actionable message and lets
// the caller fail fast. Returns { ok:true } or { ok:false, message } — never throws.
export const verifyDbConnection = async () => {
  const host = process.env.MYSQL_HOST || "localhost";
  const port = parseInt(process.env.MYSQL_PORT || "3306");
  const db = process.env.MYSQL_DATABASE;
  try {
    const conn = await mysqlPool.getConnection();
    try { await conn.ping(); } finally { conn.release(); }
    return { ok: true };
  } catch (err) {
    const code = err && err.code;
    const lines = [
      `Could not connect to MySQL at ${host}:${port} (database "${db}").`,
      `Reason: ${code || err.message}`,
      "",
      "How to fix:",
    ];
    if (code === "ECONNREFUSED") {
      lines.push(
        `  • No MySQL server is listening on ${host}:${port}.`,
        "  • Make sure MySQL/MariaDB is installed AND running:",
        "      Linux:   sudo service mysql start   (or mariadb)",
        "      macOS:   brew services start mysql",
        "      Windows: start the MySQL service from Services",
        `  • Confirm the port — standard MySQL is 3306. Set MYSQL_PORT in .env to match your server.`,
      );
    } else if (code === "ER_ACCESS_DENIED_ERROR") {
      lines.push("  • MYSQL_USER / MYSQL_PASSWORD are wrong, or the user lacks access to the database.");
    } else if (code === "ER_BAD_DB_ERROR") {
      lines.push(`  • The database "${db}" does not exist yet. Create it:  CREATE DATABASE \`${db}\`;`);
    } else if (code === "ENOTFOUND") {
      lines.push(`  • The host "${host}" could not be resolved. Check MYSQL_HOST in .env.`);
    } else {
      lines.push("  • Check MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE in .env.");
    }
    lines.push("", "See .env.example for the full list of database settings.");
    return { ok: false, message: lines.join("\n") };
  }
};

// Helper to run a write/DDL query. The result is normalized so callers can rely on `.lastID`
// and `.changes` (mysql2 exposes insertId/affectedRows).
export const dbRun = (query, params = []) => {
  const finalQuery = translateSql(query);
  return new Promise((resolve, reject) => {
    // DDL → query() (mysql2 can't prepare DDL); parameterized DML → execute().
    const runner = isDdl(finalQuery)
      ? mysqlPool.query(finalQuery)
      : mysqlPool.execute(finalQuery, params);
    runner
      .then(([result]) => resolve({
        lastID: result && result.insertId,
        changes: result && result.affectedRows,
        insertId: result && result.insertId,
        affectedRows: result && result.affectedRows,
        raw: result,
      }))
      .catch(reject);
  });
};

// Helper to get a single row (or null).
export const dbGet = (query, params = []) => {
  const finalQuery = translateSql(query);
  return new Promise((resolve, reject) => {
    mysqlPool.execute(finalQuery, params)
      .then(([rows]) => resolve(rows[0] || null))
      .catch(reject);
  });
};

// Helper to get all rows.
export const dbAll = (query, params = []) => {
  const finalQuery = translateSql(query);
  return new Promise((resolve, reject) => {
    mysqlPool.execute(finalQuery, params)
      .then(([rows]) => resolve(rows))
      .catch(reject);
  });
};

// ---------------------------------------------------------------------------
// Dialect Translator: maps SQLite SQL (the source dialect used throughout the app)
// to MySQL when DB_TYPE=mysql. Kept generic so new queries work without special-casing.
//
// Handled conversions (SQLite -> MySQL):
//   • AUTOINCREMENT                     -> AUTO_INCREMENT
//   • datetime('now')                   -> NOW()
//   • INSERT OR IGNORE INTO ...         -> INSERT IGNORE INTO ...
//   • INSERT OR REPLACE INTO ...        -> REPLACE INTO ...
//   • INSERT ... ON CONFLICT(...) DO UPDATE SET a = excluded.a, ...
//                                       -> INSERT ... ON DUPLICATE KEY UPDATE a = VALUES(a), ...
//   • INSERT ... ON CONFLICT(...) DO NOTHING
//                                       -> INSERT IGNORE ... (conflict target dropped)
// The reverse (MySQL -> SQLite) only needs AUTO_INCREMENT -> AUTOINCREMENT.
// ---------------------------------------------------------------------------
function translateSql(query) {
  let q = query;

  // Type/keyword fixes.
  q = q.replace(/AUTOINCREMENT/gi, "AUTO_INCREMENT");
  q = q.replace(/datetime\('now'\)/gi, "NOW()");
  // MySQL cannot put a UNIQUE/index on a bare TEXT column without a key length. These columns
  // hold short references, so VARCHAR(255) is the correct, index-friendly equivalent.
  q = q.replace(/\bTEXT\s+UNIQUE\b/gi, "VARCHAR(255) UNIQUE");
  // MySQL 8.0 forbids a literal DEFAULT on TEXT/BLOB columns (ER 1101). MariaDB allows it, which
  // masks the bug — so we ALWAYS convert `TEXT DEFAULT '<literal>'` to a VARCHAR of adequate size
  // that CAN hold a default. 1024 comfortably covers our defaulted text columns (statuses, short
  // messages, JSON snippets like '[]' / '{}'). Columns without a default keep TEXT unchanged.
  // MySQL 8.0 forbids a literal DEFAULT on TEXT/BLOB columns (ER 1101). Convert to a modest
  // VARCHAR that CAN hold a default. Keep it SMALL (191) so many such columns don't blow past
  // MySQL's ~65,535-byte per-row limit (each VARCHAR counts toward it in-row; TEXT barely does).
  // 191 chars is ample for our defaulted fields (statuses, short messages, '[]' / '{}' / URLs).
  q = q.replace(/\bTEXT\s+DEFAULT\s+('(?:[^'\\]|\\.)*')/gi, "VARCHAR(191) DEFAULT $1");
  // Older MySQL/MariaDB reject "CREATE INDEX IF NOT EXISTS". These are wrapped in try/catch at
  // the call sites (re-running is harmless), so we drop the unsupported clause.
  q = q.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi, "CREATE $1INDEX");

  // INSERT OR IGNORE / INSERT OR REPLACE  ->  INSERT IGNORE / REPLACE
  q = q.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO");
  q = q.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "REPLACE INTO");

  // `rowid` is a SQLite-only pseudo-column (has no MySQL equivalent). Every table that used it
  // for ins's insertion-order sorting has an AUTO_INCREMENT `id`, which is the correct MySQL
  // equivalent. Map bare `rowid` (optionally table-qualified) to `id`.
  q = q.replace(/\b([A-Za-z_][A-Za-z0-9_]*\.)?rowid\b/gi, "$1id");

  // UPSERT: ON CONFLICT (...) DO NOTHING  ->  INSERT IGNORE (drop the conflict clause).
  if (/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+NOTHING/is.test(q)) {
    q = q.replace(/\s*ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+NOTHING/is, "");
    q = q.replace(/^(\s*)INSERT\s+INTO/i, "$1INSERT IGNORE INTO");
  }

  // UPSERT: ON CONFLICT (...) DO UPDATE SET <assignments>  ->  ON DUPLICATE KEY UPDATE <assignments>
  // First rewrite every `excluded.col` reference to MySQL's `VALUES(col)`, then swap the clause head.
  if (/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/is.test(q)) {
    q = q.replace(/\bexcluded\.([a-zA-Z_][a-zA-Z0-9_]*)/gi, "VALUES($1)");
    q = q.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/is, "ON DUPLICATE KEY UPDATE");
  }

  return q;
}

export const initDb = async () => {
  // 1. Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) UNIQUE,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      wallet_balance REAL DEFAULT 0.0,
      referral_code VARCHAR(255),
      phone VARCHAR(255),
      frozen INTEGER DEFAULT 0,
      banned INTEGER DEFAULT 0,
      reset_code VARCHAR(255),
      reset_expires BIGINT,
      role VARCHAR(255) DEFAULT 'Customer',
      status_2fa INTEGER DEFAULT 0,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until BIGINT DEFAULT 0,
      notif_service INTEGER DEFAULT 1,
      notif_payment INTEGER DEFAULT 1,
      notif_refund INTEGER DEFAULT 1,
      notif_market INTEGER DEFAULT 0
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE users ADD COLUMN username TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN reset_code TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN reset_expires INTEGER"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN notif_service INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN notif_payment INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN notif_refund INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN notif_market INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'Support Staff'"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN status_2fa INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0"); } catch (err) {}
    // User analytics (FEATURE 8): registration date + last login timestamp
    try { await dbRun("ALTER TABLE users ADD COLUMN created_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN last_login TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN locked_until INTEGER DEFAULT 0"); } catch (err) {}
  }

  // 2. Virtual Numbers Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS virtual_numbers (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER,
      number VARCHAR(255) NOT NULL,
      country VARCHAR(255) NOT NULL,
      flag VARCHAR(255) NOT NULL,
      service VARCHAR(255) NOT NULL,
      status VARCHAR(255) DEFAULT 'active',
      cost REAL,
      otp_received VARCHAR(255),
      expires_at VARCHAR(255),
      created_at VARCHAR(255)
    )
  `);

  // Original provider codes for one-click "Purchase Again" (re-select country+service).
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN country_code VARCHAR(32)"); } catch (err) {}
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN service_code VARCHAR(32)"); } catch (err) {}
  // Multi-provider SMS (5SIM / SMSPool alongside Grizzly). `provider` records which upstream
  // filled the order; defaults to 'grizzly' so ALL existing rows remain correct & pollable.
  // `provider_session_id` stores the upstream activation/order id when it differs from our
  // internal primary key (Grizzly reuses its id as our PK, so it stays null there).
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN provider VARCHAR(32) DEFAULT 'grizzly'"); } catch (err) {}
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN provider_session_id VARCHAR(128)"); } catch (err) {}
  // Backfill any legacy rows created before this column existed.
  try { await dbRun("UPDATE virtual_numbers SET provider = 'grizzly' WHERE provider IS NULL"); } catch (err) {}

  // 2A. Operational History (Requirement 10) — PERMANENT SMS verification record.
  // Never cleared on refresh; the active terminal clears but this history persists.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS operational_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      number_id VARCHAR(255),
      number VARCHAR(255),
      country VARCHAR(255),
      flag VARCHAR(255),
      service VARCHAR(255),
      code VARCHAR(255),
      cost REAL,
      status VARCHAR(255) DEFAULT 'completed',
      created_at VARCHAR(255)
    )
  `);
  // Provider identifier columns for enterprise idempotency (additive, backward-compatible).
  try { await dbRun("ALTER TABLE operational_history ADD COLUMN provider VARCHAR(64) DEFAULT 'grizzly'"); } catch (err) {}
  try { await dbRun("ALTER TABLE operational_history ADD COLUMN provider_session_id VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE operational_history ADD COLUMN country_code VARCHAR(32)"); } catch (err) {}
  try { await dbRun("ALTER TABLE operational_history ADD COLUMN service_code VARCHAR(32)"); } catch (err) {}
  // Backfill provider_session_id from the legacy number_id (they are the same activation id).
  try { await dbRun("UPDATE operational_history SET provider_session_id = number_id WHERE (provider_session_id IS NULL OR provider_session_id = '') AND number_id IS NOT NULL"); } catch (err) {}
  // De-duplicate any pre-existing duplicate history rows, keeping the earliest per session,
  // BEFORE creating the unique index (otherwise index creation would fail).
  try {
    // MySQL forbids referencing the DELETE target table directly inside a subquery's FROM
    // ("You can't specify target table ... for update in FROM clause"). Wrapping the subquery in a
    // derived table with an alias (SELECT ... FROM ( ... ) AS keep) materializes it first, which
    // MySQL allows. This keeps the earliest (MIN id) row per (provider, provider_session_id).
    await dbRun(`DELETE FROM operational_history WHERE id NOT IN (
      SELECT keep_id FROM (
        SELECT MIN(id) AS keep_id FROM operational_history GROUP BY provider, provider_session_id
      ) AS keep
    ) AND provider_session_id IS NOT NULL`);
  } catch (err) { console.warn("operational_history dedupe skipped:", err.message); }
  // Enforce exactly one completed history record per (provider, session) — DB-level guarantee
  // that survives webhook double-fires, refreshes, provider retries, and backend retries.
  try { await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS uniq_ophist_provider_session ON operational_history(provider, provider_session_id)"); } catch (err) { console.warn("uniq_ophist index skipped:", err.message); }

  // 2A-b. Multi-provider SMS request/response log (Requirement 12 — logging & debugging).
  // Captures every provider API call (action, request summary, response summary, ok/fail,
  // latency) plus fallback events. Bounded to the most recent rows to stay lightweight.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_provider_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider VARCHAR(32),
      action VARCHAR(64),
      request TEXT,
      response TEXT,
      status VARCHAR(16),
      latency_ms INTEGER,
      user_id INTEGER,
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_provider_logs_created ON sms_provider_logs(created_at)"); } catch (err) {}

  // 2A-c. Per-provider health snapshot (routing engine — latency, success/failure, balance,
  // online/offline, last success). Updated passively on every real API call + by a periodic
  // background check. One row per provider id.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_provider_health (
      provider VARCHAR(32) PRIMARY KEY,
      online INTEGER DEFAULT 1,
      last_latency_ms INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_success_at VARCHAR(255),
      last_failure_at VARCHAR(255),
      last_error TEXT,
      balance REAL,
      balance_checked_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  for (const p of ["grizzly", "fivesim", "smspool"]) {
    try { await dbRun("INSERT INTO sms_provider_health (provider, online, updated_at) VALUES (?, 1, ?) ON CONFLICT(provider) DO NOTHING", [p, new Date().toISOString()]); } catch (err) {}
  }

  // 2A-d. Feature flags (§19). Runtime on/off switches so major features can be toggled without
  // a redeploy. Every new Virtual-Number-restructure behavior is gated here; defaults keep the
  // CURRENT proven behavior so nothing changes until an admin explicitly opts in.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      \`key\` VARCHAR(64) PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      description TEXT,
      updated_at VARCHAR(255),
      updated_by VARCHAR(128)
    )
  `);
  const DEFAULT_FLAGS = [
    ["sms_txn_safe_purchase", 0, "Transaction-safe purchase: wallet+order+provider are all-or-nothing with auto-refund on provider failure."],
    ["sms_safe_cancellation", 0, "Safe cancellation: only refund when the provider confirms; otherwise flag for admin review."],
    ["sms_compare_and_choose", 0, "Customer compare-and-choose screen (masked providers) instead of auto-routing."],
    ["sms_mask_provider", 1, "Hide the upstream provider identity from customers (provider name/logo never exposed)."],
  ];
  for (const [k, en, desc] of DEFAULT_FLAGS) {
    try { await dbRun("INSERT INTO feature_flags (`key`, enabled, description, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET description = excluded.description", [k, en, desc, new Date().toISOString()]); } catch (err) {}
  }

  // SMS POOLS (provider-independent rebuild). Each pool = one real provider behind a neutral
  // label the customer sees ("Pool 1"). Each pool loads ONLY its own provider's native catalog —
  // catalogs are NEVER merged, so a country/service from one provider can never leak into another.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_pools (
      id VARCHAR(32) PRIMARY KEY,
      provider VARCHAR(32) NOT NULL,
      label VARCHAR(64) NOT NULL,
      enabled INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      markup_type VARCHAR(16) DEFAULT 'flat',
      markup_value REAL DEFAULT 1300,
      updated_at VARCHAR(255)
    )
  `);
  // Seed one pool per provider. No provider is special/protected: all three are ENABLED by
  // default and equally toggleable from the admin panel (Grizzly can be turned OFF like any other).
  const DEFAULT_POOLS = [
    ["pool1", "grizzly", "Pool 1", 1, 1],
    ["pool2", "smspool", "Pool 2", 1, 2],
    ["pool3", "fivesim", "Pool 3", 1, 3],
  ];
  for (const [pid, prov, label, en, ord] of DEFAULT_POOLS) {
    try { await dbRun("INSERT INTO sms_pools (id, provider, label, enabled, hidden, sort_order, markup_type, markup_value, updated_at) VALUES (?, ?, ?, ?, 0, ?, 'flat', 1300, ?) ON CONFLICT(id) DO NOTHING", [pid, prov, label, en, ord, new Date().toISOString()]); } catch (err) {}
  }
  // Per-pool MANUAL timer config (additive). Used only when the provider does NOT expose its own
  // timers (e.g. Grizzly). session_seconds = how long the number stays active before auto-expire;
  // cancel_lock_seconds = wait before the Cancel/Release button unlocks. Providers that expose
  // real timers (5SIM/SMSPool) use those for expiry and keep a short cancel lock.
  try { await dbRun("ALTER TABLE sms_pools ADD COLUMN session_seconds INTEGER DEFAULT 1200"); } catch (err) {}
  try { await dbRun("ALTER TABLE sms_pools ADD COLUMN cancel_lock_seconds INTEGER DEFAULT 120"); } catch (err) {}
  // Grizzly requirement: 20-minute session, 5-minute cancel lock. Set as its manual defaults.
  try { await dbRun("UPDATE sms_pools SET session_seconds = 1200, cancel_lock_seconds = 300 WHERE provider = 'grizzly' AND (session_seconds IS NULL OR session_seconds = 0)"); } catch (err) {}
  try { await dbRun("UPDATE sms_pools SET cancel_lock_seconds = 300 WHERE provider = 'grizzly' AND cancel_lock_seconds = 120"); } catch (err) {}

  // 2A-e. Loss-prevention columns on virtual_numbers (§7). Idempotency + traceability so a
  // purchase can never double-charge and every order links wallet↔local↔provider. Additive.
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN transaction_ref VARCHAR(128)"); } catch (err) {}
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN provider_order_id VARCHAR(128)"); } catch (err) {}
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN idempotency_key VARCHAR(128)"); } catch (err) {}
  try { await dbRun("ALTER TABLE virtual_numbers ADD COLUMN review_status VARCHAR(32)"); } catch (err) {}
  // Unique idempotency key prevents duplicate purchases from double-clicks/retries at the DB level.
  try { await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS uniq_vn_idempotency ON virtual_numbers(idempotency_key)"); } catch (err) {}

  // 2B. Grizzly SMS Preloaded Countries (Requirement 5!)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_countries (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      flag VARCHAR(255) NOT NULL,
      active INTEGER DEFAULT 1
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_countries_name ON sms_countries(name)"); } catch (err) {}
  // SMS country enrichment: dialing code + ISO code for premium display & search (additive).
  try { await dbRun("ALTER TABLE sms_countries ADD COLUMN dial_code VARCHAR(16) DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE sms_countries ADD COLUMN iso VARCHAR(8) DEFAULT ''"); } catch (err) {}
  // Backfill dial code / ISO / correct flag for known GrizzlySMS country IDs so every row
  // shows a flag, full name and (+code). Idempotent — only fills rows that need it.
  try {
    const SMS_COUNTRY_META = {
      "0": { iso: "RU", dial: "+7", flag: "🇷🇺", name: "Russia" },
      "1": { iso: "UA", dial: "+380", flag: "🇺🇦", name: "Ukraine" },
      "2": { iso: "KZ", dial: "+7", flag: "🇰🇿", name: "Kazakhstan" },
      "3": { iso: "CN", dial: "+86", flag: "🇨🇳", name: "China" },
      "4": { iso: "PH", dial: "+63", flag: "🇵🇭", name: "Philippines" },
      "5": { iso: "MM", dial: "+95", flag: "🇲🇲", name: "Myanmar" },
      "6": { iso: "ID", dial: "+62", flag: "🇮🇩", name: "Indonesia" },
      "7": { iso: "MY", dial: "+60", flag: "🇲🇾", name: "Malaysia" },
      "8": { iso: "KE", dial: "+254", flag: "🇰🇪", name: "Kenya" },
      "9": { iso: "TZ", dial: "+255", flag: "🇹🇿", name: "Tanzania" },
      "10": { iso: "VN", dial: "+84", flag: "🇻🇳", name: "Vietnam" },
      "11": { iso: "KG", dial: "+996", flag: "🇰🇬", name: "Kyrgyzstan" },
      "12": { iso: "US", dial: "+1", flag: "🇺🇸", name: "USA" },
      "13": { iso: "IL", dial: "+972", flag: "🇮🇱", name: "Israel" },
      "14": { iso: "HK", dial: "+852", flag: "🇭🇰", name: "Hong Kong" },
      "15": { iso: "PL", dial: "+48", flag: "🇵🇱", name: "Poland" },
      "16": { iso: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
      "17": { iso: "MG", dial: "+261", flag: "🇲🇬", name: "Madagascar" },
      "18": { iso: "CD", dial: "+243", flag: "🇨🇩", name: "DR Congo" },
      "19": { iso: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria" },
      "21": { iso: "EG", dial: "+20", flag: "🇪🇬", name: "Egypt" },
      "22": { iso: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
      "23": { iso: "IE", dial: "+353", flag: "🇮🇪", name: "Ireland" },
      "24": { iso: "KH", dial: "+855", flag: "🇰🇭", name: "Cambodia" },
      "31": { iso: "ZA", dial: "+27", flag: "🇿🇦", name: "South Africa" },
      "32": { iso: "RO", dial: "+40", flag: "🇷🇴", name: "Romania" },
      "33": { iso: "CO", dial: "+57", flag: "🇨🇴", name: "Colombia" },
      "36": { iso: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
      "38": { iso: "GH", dial: "+233", flag: "🇬🇭", name: "Ghana" },
      "39": { iso: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
      "43": { iso: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
      "44": { iso: "LT", dial: "+370", flag: "🇱🇹", name: "Lithuania" },
      "48": { iso: "SL", dial: "+232", flag: "🇸🇱", name: "Sierra Leone" },
      "50": { iso: "AT", dial: "+43", flag: "🇦🇹", name: "Austria" },
      "51": { iso: "GR", dial: "+30", flag: "🇬🇷", name: "Greece" },
      "52": { iso: "TR", dial: "+90", flag: "🇹🇷", name: "Turkey" },
      "54": { iso: "MX", dial: "+52", flag: "🇲🇽", name: "Mexico" },
      "56": { iso: "ES", dial: "+34", flag: "🇪🇸", name: "Spain" },
      "62": { iso: "TH", dial: "+66", flag: "🇹🇭", name: "Thailand" },
      "63": { iso: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh" },
      "66": { iso: "PK", dial: "+92", flag: "🇵🇰", name: "Pakistan" },
      "73": { iso: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
      "78": { iso: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
      "82": { iso: "BE", dial: "+32", flag: "🇧🇪", name: "Belgium" },
      "86": { iso: "IT", dial: "+39", flag: "🇮🇹", name: "Italy" },
      "117": { iso: "PT", dial: "+351", flag: "🇵🇹", name: "Portugal" },
      "175": { iso: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
      "187": { iso: "US", dial: "+1", flag: "🇺🇸", name: "USA" },
    };
    for (const [id, meta] of Object.entries(SMS_COUNTRY_META)) {
      // Only touch rows that exist; fill dial/iso always, fix flag if it's the generic globe.
      await dbRun(
        "UPDATE sms_countries SET dial_code = ?, iso = ?, flag = CASE WHEN flag = '🌐' OR flag IS NULL OR flag = '' THEN ? ELSE flag END WHERE id = ?",
        [meta.dial, meta.iso, meta.flag, id]
      );
    }
  } catch (err) { console.warn("SMS country enrichment failed:", err.message); }

  // 2C. Grizzly SMS Preloaded Services (Requirement 5!)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_services (
      id VARCHAR(255) NOT NULL,
      country_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(255) NOT NULL,
      price REAL NOT NULL,
      count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      PRIMARY KEY (id, country_id)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_services_country_name ON sms_services(country_id, name)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_services_active ON sms_services(active)"); } catch (err) {}

  // 3. Transactions Table (Financial Ledger)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER,
      reference VARCHAR(255) UNIQUE NOT NULL,
      amount REAL NOT NULL,
      status VARCHAR(255) DEFAULT 'pending',
      type VARCHAR(255) NOT NULL,
      category VARCHAR(255) NOT NULL,
      description TEXT,
      payment_method VARCHAR(255),
      created_at VARCHAR(255) NOT NULL,
      updated_at VARCHAR(255) NOT NULL
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE transactions ADD COLUMN payment_method TEXT"); } catch (err) {}
    // Profit/cost tracking for accurate revenue reporting (Requirement 7 & 12)
    try { await dbRun("ALTER TABLE transactions ADD COLUMN profit REAL DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE transactions ADD COLUMN cost REAL DEFAULT 0"); } catch (err) {}
  }

  // 4. Categories Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL,
      icon VARCHAR(255),
      banner VARCHAR(255),
      order_index INTEGER DEFAULT 0,
      markup_multiplier REAL
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE categories ADD COLUMN icon TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE categories ADD COLUMN banner TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE categories ADD COLUMN order_index INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE categories ADD COLUMN markup_multiplier REAL"); } catch (err) {}
  }

  // Category "featured" flag (admin can highlight top categories). Additive, safe.
  try { await dbRun("ALTER TABLE categories ADD COLUMN featured INTEGER DEFAULT 0"); } catch (err) {}

  // Subcategories (a.k.a. product variants/collections) — a real second level under a
  // category, fully admin-managed. Products reference these by name via products.subcategory
  // (backward compatible with the existing free-text field).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      category_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(255) DEFAULT '',
      description TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_subcat_category ON subcategories(category_id)"); } catch (err) {}


  // 5. Services Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category_id VARCHAR(255),
      type VARCHAR(255) NOT NULL,
      price REAL NOT NULL,
      api_service_id VARCHAR(255),
      description TEXT,
      instructions TEXT,
      status VARCHAR(255) DEFAULT 'active',
      min_order INTEGER DEFAULT 100,
      max_order INTEGER DEFAULT 50000,
      refill_support INTEGER DEFAULT 0,
      cancel_support INTEGER DEFAULT 0,
      markup_multiplier REAL,
      fixed_markup REAL,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE services ADD COLUMN min_order INTEGER DEFAULT 100"); } catch (err) {}
    try { await dbRun("ALTER TABLE services ADD COLUMN max_order INTEGER DEFAULT 50000"); } catch (err) {}
    try { await dbRun("ALTER TABLE services ADD COLUMN refill_support INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE services ADD COLUMN cancel_support INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE services ADD COLUMN markup_multiplier REAL"); } catch (err) {}
  }

  // 6. Orders Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER,
      product_id VARCHAR(255),
      service_id VARCHAR(255),
      category VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      target_link TEXT,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      currency VARCHAR(255) DEFAULT 'NGN',
      status VARCHAR(255) DEFAULT 'pending',
      delivery_type VARCHAR(255) DEFAULT 'instant',
      tracking_number VARCHAR(255),
      shipping_cost REAL DEFAULT 0.0,
      shipping_method VARCHAR(255),
      custom_credentials TEXT,
      details TEXT,
      esim_qr_code TEXT,
      esim_activation_code TEXT,
      esim_instructions TEXT,
      esim_expiry TEXT,
      esim_fulfilled_by VARCHAR(255),
      esim_fulfilled_at VARCHAR(255),
      esim_viewed_status INTEGER DEFAULT 0,
      provider_charge REAL DEFAULT 0.0,
      created_at VARCHAR(255) NOT NULL,
      updated_at VARCHAR(255) NOT NULL
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE orders ADD COLUMN product_id TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN service_id TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN category TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN name TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN target_link TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN price REAL"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'NGN'"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN delivery_type TEXT DEFAULT 'instant'"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN tracking_number TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0.0"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN shipping_method TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN custom_credentials TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN details TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_qr_code TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_activation_code TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_instructions TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_expiry TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_fulfilled_by TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_fulfilled_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN esim_viewed_status INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN provider_charge REAL DEFAULT 0.0"); } catch (err) {}
    // SMM admin-controlled funding workflow (Requirement 13)
    try { await dbRun("ALTER TABLE orders ADD COLUMN provider_order_id TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN provider_status TEXT DEFAULT 'awaiting_funding'"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN admin_approved INTEGER DEFAULT 0"); } catch (err) {}
    // Cost/profit tracking per order for accurate revenue (Requirement 7)
    try { await dbRun("ALTER TABLE orders ADD COLUMN cost_price REAL DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN profit REAL DEFAULT 0"); } catch (err) {}
    // Structured checkout data (Item 1 & 2): delivery info + dynamic checkout-field answers
    // captured at purchase time, stored as JSON so admin order details show everything.
    try { await dbRun("ALTER TABLE orders ADD COLUMN shipping_info TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE orders ADD COLUMN checkout_answers TEXT"); } catch (err) {}
    // Internal admin-only notes on an order (never shown to the customer).
    try { await dbRun("ALTER TABLE orders ADD COLUMN admin_notes TEXT"); } catch (err) {}
  }

  // 7. Products Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255) NOT NULL,
      subcategory VARCHAR(255),
      price REAL NOT NULL,
      rating REAL DEFAULT 5.0,
      sales INTEGER DEFAULT 0,
      icon VARCHAR(255),
      description TEXT,
      type VARCHAR(255) DEFAULT 'digital',
      delivery_type VARCHAR(255) DEFAULT 'instant',
      stock INTEGER DEFAULT 100,
      file_url TEXT,
      custom_fields TEXT,
      setup_guide TEXT,
      featured INTEGER DEFAULT 0,
      newest INTEGER DEFAULT 0,
      popular INTEGER DEFAULT 0
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE products ADD COLUMN custom_fields TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN setup_guide TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN newest INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN popular INTEGER DEFAULT 0"); } catch (err) {}
  }

  // 8. Inventory Pool Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS inventory_pool (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      product_id VARCHAR(255) NOT NULL,
      credentials TEXT NOT NULL,
      status VARCHAR(255) DEFAULT 'available',
      sold_to_user_id INTEGER,
      sold_at VARCHAR(255)
    )
  `);

  // --- Credential Inventory Manager migrations (additive, backward-compatible) ---
  // Extends the legacy inventory_pool into a full credential inventory system.
  // Statuses supported: available | reserved | sold | archived | disabled
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN label VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN notes TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN region VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN country VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN expiry VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN is_warranty INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN reserved_for_order_id VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN reserved_at VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN order_id VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN delivered_at VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN created_at VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN updated_at VARCHAR(255)"); } catch (err) {}
  // Backfill created_at for legacy rows so they sort/display sensibly.
  try { await dbRun("UPDATE inventory_pool SET created_at = ? WHERE created_at IS NULL OR created_at = ''", [new Date().toISOString()]); } catch (err) {}

  // --- Inventory & Account Management module: structured credential fields, workflow
  //     lifecycle, testing metadata, and shared-account tracking. All additive/backward
  //     compatible — legacy rows keep their free-text `credentials` string intact. ---
  // Structured login-account fields (parsed on delivery; free-text `credentials` still works).
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN username VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN password VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN twofa VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN recovery_email VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN recovery_phone VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN supplier VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN tags VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN attachments TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN license_key VARCHAR(255)"); } catch (err) {}
  // Workflow lifecycle: draft → testing → ready → published → sold → archived.
  // Distinct from the sales `status` column (available/reserved/sold/...) which drives delivery.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN workflow VARCHAR(64) DEFAULT 'ready'"); } catch (err) {}
  // Shared-account seat tracking (Netflix/Spotify/etc.).
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN max_users INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN current_users INTEGER DEFAULT 0"); } catch (err) {}
  // Account testing metadata.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN test_result VARCHAR(64)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN test_flags TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN tested_by VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN tested_at VARCHAR(255)"); } catch (err) {}
  // Security Center — TOTP authenticator (Phase 1). Secret stored ENCRYPTED, never plaintext.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN auth_enabled INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN auth_type VARCHAR(32) DEFAULT 'none'"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN totp_secret_enc TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN totp_last_used VARCHAR(255)"); } catch (err) {}
  // TOTP usage limits (Phase 1 mgmt): per-credential override (-1 = inherit global, 0 = unlimited, N = max requests).
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN totp_usage_limit INTEGER DEFAULT -1"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN totp_usage_count INTEGER DEFAULT 0"); } catch (err) {}
  // Credential allocation multiplier (#4): a single credential can be sold N times.
  // multiplier = total sale slots (default 1); multiplier_used = slots consumed.
  // Remaining = multiplier - multiplier_used. NOT a product/credential duplication.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN multiplier INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN multiplier_used INTEGER DEFAULT 0"); } catch (err) {}
  // Backfill: existing rows behave as single-use (multiplier 1) unless already sold.
  try { await dbRun("UPDATE inventory_pool SET multiplier = 1 WHERE multiplier IS NULL"); } catch (err) {}
  try { await dbRun("UPDATE inventory_pool SET multiplier_used = 0 WHERE multiplier_used IS NULL"); } catch (err) {}
  // Existing legacy rows are already live/sellable → default their workflow to 'published'
  // so they remain deliverable (new rows default to 'ready' and require explicit publish).
  try { await dbRun("UPDATE inventory_pool SET workflow = 'published' WHERE workflow IS NULL OR workflow = ''"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_inv_workflow ON inventory_pool(workflow)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_inv_supplier ON inventory_pool(supplier)"); } catch (err) {}

  // Product-type taxonomy for the Inventory module (login/shared/license/download/physical/service).
  // Backward compatible: existing `type` (digital/physical) stays; `inventory_type` refines it.
  try { await dbRun("ALTER TABLE products ADD COLUMN inventory_type VARCHAR(64) DEFAULT 'login'"); } catch (err) {}
  try { await dbRun("ALTER TABLE products ADD COLUMN shared_max_users INTEGER DEFAULT 0"); } catch (err) {}

  // Helpful indexes for the manager's filters/search & the checkout picker.
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_inv_product_status ON inventory_pool(product_id, status)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_inv_status ON inventory_pool(status)"); } catch (err) {}

  // --- Hot-path indexes for high-traffic tables (Priority: DB review). Additive, safe. ---
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_orders_category ON orders(category)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(id)"); } catch (err) {}

  // Credential audit history (immutable log of every action against a credential).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS credential_audit (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      credential_id INTEGER,
      product_id VARCHAR(255),
      action VARCHAR(255) NOT NULL,
      detail TEXT,
      actor_id INTEGER,
      actor_name VARCHAR(255),
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_credaudit_cred ON credential_audit(credential_id)"); } catch (err) {}

  // 8b. Privileged-action audit trail (Admin Authorization Code). Records every unlock attempt
  // and every high-risk action, with actor / action / result / ip / device, on BOTH web + Telegram.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS privileged_audit (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      actor_id INTEGER,
      actor_name VARCHAR(255),
      channel VARCHAR(32),
      action VARCHAR(255) NOT NULL,
      detail TEXT,
      status VARCHAR(32) NOT NULL,
      ip_address VARCHAR(255),
      device VARCHAR(255),
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_privaudit_created ON privileged_audit(created_at)"); } catch (err) {}

  // 9. Permissions Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      role VARCHAR(255) UNIQUE NOT NULL,
      can_users INTEGER DEFAULT 1,
      can_wallet INTEGER DEFAULT 1,
      can_orders INTEGER DEFAULT 1,
      can_sms INTEGER DEFAULT 1,
      can_smm INTEGER DEFAULT 1,
      can_api INTEGER DEFAULT 1,
      can_logs INTEGER DEFAULT 1,
      can_delete INTEGER DEFAULT 1,
      can_settings INTEGER DEFAULT 1,
      can_broadcast INTEGER DEFAULT 1,
      can_profit INTEGER DEFAULT 1,
      created_at VARCHAR(255) NOT NULL
    )
  `);

  // 10. Audit Logs Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      username VARCHAR(255) NOT NULL,
      action TEXT NOT NULL,
      ip_address VARCHAR(255),
      created_at VARCHAR(255) NOT NULL
    )
  `);

  // 11. API Health Monitor Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS api_health (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      provider VARCHAR(255) UNIQUE NOT NULL,
      response_time INTEGER DEFAULT 0,
      status VARCHAR(255) DEFAULT 'Healthy',
      balance REAL DEFAULT 0.0,
      uptime REAL DEFAULT 100.0,
      priority INTEGER DEFAULT 1,
      last_checked VARCHAR(255) NOT NULL
    )
  `);

  // 12. Backups Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      filename VARCHAR(255) UNIQUE NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at VARCHAR(255) NOT NULL
    )
  `);

  // 13. Notifications Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      type VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at VARCHAR(255) NOT NULL
    )
  `);

  // 14. Support Tickets Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER,
      subject VARCHAR(255),
      priority VARCHAR(255),
      status VARCHAR(255) DEFAULT 'open',
      created_at VARCHAR(255)
    )
  `);

  // 15. Support Messages Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      ticket_id VARCHAR(255),
      sender VARCHAR(255),
      message TEXT,
      is_internal INTEGER DEFAULT 0,
      attachment_url TEXT,
      created_at VARCHAR(255)
    )
  `);

  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE support_messages ADD COLUMN is_internal INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE support_messages ADD COLUMN attachment_url TEXT"); } catch (err) {}
  }

  // 16. Reviews Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      product_id VARCHAR(255),
      user_id INTEGER,
      rating INTEGER,
      comment TEXT,
      created_at VARCHAR(255)
    )
  `);

  // Banners Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS banners (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      image_url TEXT,
      cta_text VARCHAR(255),
      cta_url TEXT,
      order_index INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )
  `);
  // Advanced Marketplace Banner columns (#11)
  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE banners ADD COLUMN banner_type TEXT DEFAULT 'image'"); } catch (err) {} // image | gif | video | html
    try { await dbRun("ALTER TABLE banners ADD COLUMN video_url TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN html_content TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN position TEXT DEFAULT 'marketplace'"); } catch (err) {} // homepage|marketplace|dashboard|product|category|checkout|wallet
    try { await dbRun("ALTER TABLE banners ADD COLUMN bg_color TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN text_color TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN priority INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN status TEXT DEFAULT 'published'"); } catch (err) {} // published|draft|archived
    try { await dbRun("ALTER TABLE banners ADD COLUMN dismissible INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN frequency TEXT DEFAULT 'always'"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN frequency_hours INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN target_audience TEXT DEFAULT 'all'"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN target_roles TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN target_countries TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN target_users TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN start_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN end_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN transition TEXT DEFAULT 'slide'"); } catch (err) {} // slide|fade|zoom
    try { await dbRun("ALTER TABLE banners ADD COLUMN autoplay_ms INTEGER DEFAULT 5000"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN ab_enabled INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN variant_b TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN views INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN clicks INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN dismissals INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN views_b INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN clicks_b INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN created_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE banners ADD COLUMN updated_at TEXT"); } catch (err) {}
  }
  await dbRun(`
    CREATE TABLE IF NOT EXISTS banner_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banner_id VARCHAR(255) NOT NULL,
      snapshot TEXT NOT NULL,
      changed_by VARCHAR(255),
      change_note VARCHAR(255),
      created_at TEXT
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS banner_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banner_id VARCHAR(255) NOT NULL,
      variant VARCHAR(16) DEFAULT 'A',
      event_type VARCHAR(32) NOT NULL,
      day TEXT NOT NULL,
      count INTEGER DEFAULT 0
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS banner_dismissals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banner_id VARCHAR(255) NOT NULL,
      user_id INTEGER,
      created_at TEXT
    )
  `);

  // Support Links Table (Requirement 22)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS support_links (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      icon VARCHAR(255),
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0
    )
  `);

  // Sidebar Items Table (Requirement 9)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sidebar_items (
      id VARCHAR(255) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      icon VARCHAR(255),
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0
    )
  `);

  // ——— Support Module (Item 3): contact methods, community links, FAQs ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS contact_methods (
      id VARCHAR(255) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      value VARCHAR(255) NOT NULL,
      type VARCHAR(255) DEFAULT 'link',
      icon VARCHAR(255),
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0
    )
  `);
  // Fully admin-managed social media links. Each row = one social/platform link the footer and
  // emails render. `platform` is a known key (facebook, instagram, x, tiktok, linkedin, youtube,
  // telegram, whatsapp, discord, github) or "custom". `active=0` hides a link without deleting it.
  // When no active rows exist, the frontend hides the entire social section (no empty icons).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS social_links (
      id VARCHAR(255) PRIMARY KEY,
      platform VARCHAR(32) NOT NULL,
      label VARCHAR(255) DEFAULT '',
      url TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS community_links (
      id VARCHAR(255) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      icon VARCHAR(255),
      description TEXT,
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS faqs (
      id VARCHAR(255) PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0
    )
  `);

  // ——— Admin Announcement System (#10) ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      category VARCHAR(255) DEFAULT 'news',
      display_type VARCHAR(255) DEFAULT 'banner',
      images TEXT,
      cta_text VARCHAR(255),
      cta_url TEXT,
      icon VARCHAR(255),
      bg_color VARCHAR(255),
      text_color VARCHAR(255),
      priority INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      status VARCHAR(255) DEFAULT 'published',
      dismissible INTEGER DEFAULT 1,
      frequency VARCHAR(255) DEFAULT 'always',
      frequency_hours INTEGER DEFAULT 0,
      target_audience VARCHAR(255) DEFAULT 'all',
      target_roles TEXT,
      target_countries TEXT,
      target_pages TEXT,
      target_categories TEXT,
      target_users TEXT,
      start_at TEXT,
      end_at TEXT,
      timezone VARCHAR(255) DEFAULT 'Africa/Lagos',
      recurring VARCHAR(255) DEFAULT 'none',
      views INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      dismissals INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS announcement_dismissals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id VARCHAR(255) NOT NULL,
      user_id INTEGER,
      created_at TEXT
    )
  `);
  // Version history for announcements (#12)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS announcement_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id VARCHAR(255) NOT NULL,
      snapshot TEXT NOT NULL,
      changed_by VARCHAR(255),
      change_note VARCHAR(255),
      created_at TEXT
    )
  `);
  // Per-day analytics events for the analytics dashboard (#9)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS announcement_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id VARCHAR(255) NOT NULL,
      variant VARCHAR(16) DEFAULT 'A',
      event_type VARCHAR(32) NOT NULL,
      day TEXT NOT NULL,
      count INTEGER DEFAULT 0
    )
  `);
  // A/B variant + video columns on announcements (#3, #11)
  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE announcements ADD COLUMN video_url TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE announcements ADD COLUMN ab_enabled INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE announcements ADD COLUMN variant_b TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE announcements ADD COLUMN views_b INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE announcements ADD COLUMN clicks_b INTEGER DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE announcements ADD COLUMN dismissals_b INTEGER DEFAULT 0"); } catch (err) {}
  }

  // Tutorials / Guides Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tutorials (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL,
      product_id VARCHAR(255),
      video_url TEXT,
      written_guide TEXT,
      image_url TEXT,
      faq_json TEXT,
      order_index INTEGER DEFAULT 0
    )
  `);

  // Additional columns on products & categories
  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE products ADD COLUMN multiple_images TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN specifications TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN status INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN youtube_url TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN how_to_buy_guide TEXT"); } catch (err) {}
    // Physical goods shipping type: 'local' (default) or 'international'
    try { await dbRun("ALTER TABLE products ADD COLUMN shipping_type TEXT DEFAULT 'local'"); } catch (err) {}
    // Manually curated related products: comma-separated product IDs. Empty = none (no auto-generation)
    try { await dbRun("ALTER TABLE products ADD COLUMN related_products TEXT DEFAULT ''"); } catch (err) {}
    // Admin-only pricing system (Requirement 6): cost price, selling price, markup(profit)
    try { await dbRun("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN markup REAL DEFAULT 0"); } catch (err) {}
    // Creation timestamp so lists can be ordered newest-first (Requirement 4)
    try { await dbRun("ALTER TABLE products ADD COLUMN created_at TEXT"); } catch (err) {}
    // Gift/physical logistics fields (editable from Admin Panel; no code change needed)
    try { await dbRun("ALTER TABLE products ADD COLUMN sku TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN delivery_countries TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN delivery_estimate TEXT DEFAULT ''"); } catch (err) {}
    // Product Wizard additive columns (SEO, variants, draft state) — backward-compatible.
    try { await dbRun("ALTER TABLE products ADD COLUMN seo_title TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN seo_description TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN seo_keywords TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN variants TEXT DEFAULT ''"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN is_draft INTEGER DEFAULT 0"); } catch (err) {}
    // Display Location / Product Section (Sidebar architecture): decides which dedicated
    // module surfaces the product — 'marketplace' (default), 'esim', 'physical-sim', or
    // 'gift'. Independent of `category` (categories organize; display_location routes).
    try { await dbRun("ALTER TABLE products ADD COLUMN display_location TEXT DEFAULT 'marketplace'"); } catch (err) {}
    // Backfill: legacy rows with no value behave as main Marketplace items.
    try { await dbRun("UPDATE products SET display_location = 'marketplace' WHERE display_location IS NULL OR display_location = ''"); } catch (err) {}
    // Gift-category products belong to the Gift Delivery module by default.
    try { await dbRun("UPDATE products SET display_location = 'gift' WHERE category = 'gifts' AND (display_location IS NULL OR display_location = '' OR display_location = 'marketplace')"); } catch (err) {}

    // ——— Marketplace restructure: auto-route SIM / eSIM products into their modules ———
    // Each business line owns its checkout form; the module is decided by display_location.
    // eSIM must be matched BEFORE physical SIM (so "eSIM" isn't caught by the SIM rule).
    // eSIM products → 'esim' module (digital, manual fulfilment, no stock).
    try {
      await dbRun(
        "UPDATE products SET display_location = 'esim' WHERE (display_location IS NULL OR display_location = '' OR display_location = 'marketplace') AND (LOWER(name) LIKE '%esim%' OR LOWER(name) LIKE '%e-sim%' OR LOWER(subcategory) = 'esim')"
      );
    } catch (err) {}
    // Physical SIM cards → 'physical-sim' module (shipped in Nigeria, manual, no stock).
    // Exclude anything already routed to eSIM.
    try {
      await dbRun(
        "UPDATE products SET display_location = 'physical-sim' WHERE (display_location IS NULL OR display_location = '' OR display_location = 'marketplace') AND display_location != 'esim' AND (LOWER(name) LIKE '%physical sim%' OR LOWER(name) LIKE '%sim card%' OR LOWER(subcategory) = 'sim cards') AND LOWER(name) NOT LIKE '%esim%'"
      );
    } catch (err) {}

    // Multi-section visibility (Req 8): a product has ONE primary module (display_location,
    // which drives its checkout + fulfilment) and may ALSO be surfaced in other sections.
    // Stored as a JSON array of location keys; defaults to just the primary location.
    try { await dbRun("ALTER TABLE products ADD COLUMN display_locations TEXT DEFAULT ''"); } catch (err) {}
    // Item 6: connection/condition assignment. A product may optionally have a connection
    // (email_providers.id) attached. condition_status tracks its readiness so admins can
    // filter (none | raw | ready). Products without a connection default to Out of Stock.
    try { await dbRun("ALTER TABLE products ADD COLUMN connection_id INTEGER DEFAULT NULL"); } catch (err) {}
    try { await dbRun("ALTER TABLE products ADD COLUMN condition_status TEXT DEFAULT 'none'"); } catch (err) {}
    try { await dbRun("UPDATE products SET display_locations = '[\"' || display_location || '\"]' WHERE display_locations IS NULL OR display_locations = ''"); } catch (err) {}

    // Remove leftover test/junk products so the marketplace only shows real inventory.
    // (Safe: these are throwaway dev rows — dbg/E2E/CB4/RF/SC drafts and duplicates.)
    try {
      await dbRun(
        "DELETE FROM products WHERE id LIKE 'dbg-%' OR id LIKE 'e2e-%' OR id LIKE 'cb4-%' OR id LIKE 'cb4draft-%' OR id LIKE 'cb4oos-%' OR id LIKE 'rf-%' OR id LIKE 'sc-%' OR id LIKE 'fix3-%'"
      );
    } catch (err) {}
    try { await dbRun("ALTER TABLE categories ADD COLUMN status INTEGER DEFAULT 1"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN paga_account_number TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN paga_account_reference TEXT"); } catch (err) {}
  }

  // Payment Methods Configuration Table (Paga Subsidiary Accounts Integration)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      name VARCHAR(255) PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      updated_by VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // 17. Settings Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      site_name VARCHAR(255) DEFAULT 'AUREVASHOP DIGITAL (AVS)',
      whatsapp_number VARCHAR(255) DEFAULT '+2349016075160',
      external_support_url VARCHAR(255) DEFAULT 'https://avsnova.com',
      site_logo VARCHAR(255) DEFAULT '🛡️',
      maintenance_mode INTEGER DEFAULT 0,
      smm_multiplier REAL DEFAULT 1.35,
      smm_flat_addition REAL DEFAULT 500.0,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_pass TEXT,
      smtp_from TEXT,
      shipping_cost_sim_esim REAL DEFAULT 6000.0,
      shipping_cost_lagos REAL DEFAULT 2000.0,
      shipping_cost_abuja REAL DEFAULT 3500.0,
      shipping_cost_national REAL DEFAULT 5000.0,
      paystack_public_key TEXT,
      paystack_secret_key TEXT,
      jap_api_url TEXT,
      jap_api_key TEXT,
      sms_flat_margin REAL DEFAULT 1300.0,
      grizzly_api_key TEXT,
      sms_api_url TEXT DEFAULT 'https://api.grizzlysms.com/stubs/handler_api.php',
      paga_public_key TEXT,
      paga_secret_key TEXT,
      paga_hash_key TEXT,
      paga_base_url TEXT DEFAULT 'https://beta-collect.paga.com/'
    )
  `);

  // Run settings migrations
  try { await dbRun("ALTER TABLE settings ADD COLUMN site_favicon TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN shipping_cost_sim_esim REAL DEFAULT 6000.0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN shipping_cost_lagos REAL DEFAULT 2000.0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN shipping_cost_abuja REAL DEFAULT 3500.0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN shipping_cost_national REAL DEFAULT 5000.0"); } catch (err) {}
  // Physical SIM module — dedicated "Local Shipping" cost. Defaults to ₦0 (admin-configurable).
  try { await dbRun("ALTER TABLE settings ADD COLUMN shipping_cost_physical_sim REAL DEFAULT 0.0"); } catch (err) {}
  // International Gifting — dedicated international delivery fee (module-specific).
  try { await dbRun("ALTER TABLE settings ADD COLUMN gift_delivery_fee REAL DEFAULT 0.0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smm_multiplier REAL DEFAULT 1.35"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paga_public_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paga_secret_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paga_hash_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paga_base_url TEXT DEFAULT 'https://beta-collect.paga.com/'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smm_flat_addition REAL DEFAULT 500.0"); } catch (err) {}
  // Pricing protection (Item 4): guaranteed minimum profit per 1000 units on SMM. The sell
  // price is floored at (providerCost + smm_min_profit) so nothing ever sells below cost.
  try { await dbRun("ALTER TABLE settings ADD COLUMN smm_min_profit REAL DEFAULT 100.0"); } catch (err) {}
  // Referral / affiliate program configuration (admin-tunable; nothing hardcoded).
  try { await dbRun("ALTER TABLE settings ADD COLUMN referral_enabled INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN referral_referrer_bonus REAL DEFAULT 500.0"); } catch (err) {}   // ₦ credited to the inviter when a referral qualifies
  try { await dbRun("ALTER TABLE settings ADD COLUMN referral_signup_bonus REAL DEFAULT 0.0"); } catch (err) {}       // ₦ credited to the new user on signup with a code
  try { await dbRun("ALTER TABLE settings ADD COLUMN referral_qualify_amount REAL DEFAULT 1000.0"); } catch (err) {}  // min first-purchase (₦) that qualifies a referral
  // Telegram Operations Center — dashboard-managed config (DB wins over env). The token is
  // stored so the Super Admin can manage it from the panel; env remains a fallback.
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_enabled INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_bot_token TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_webhook_secret TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_group_chat_id TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_disabled_categories TEXT DEFAULT ''"); } catch (err) {}  // CSV of muted alert keys
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_digest_hour INTEGER DEFAULT 20"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN telegram_min_severity VARCHAR(16) DEFAULT 'info'"); } catch (err) {}
  // ——— Admin Authorization Code (second layer for high-risk actions) ———
  // Stored as scrypt hash (salt:hash), NEVER plaintext. enabled flag lets the Super Admin
  // temporarily disable it without wiping the hash.
  try { await dbRun("ALTER TABLE settings ADD COLUMN admin_auth_code_hash TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN admin_auth_code_enabled INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN admin_auth_code_updated_at TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN admin_auth_code_updated_by TEXT"); } catch (err) {}
  // Per-staff granular permissions (CSV of capability keys). Empty = fall back to role tier.
  try { await dbRun("ALTER TABLE telegram_staff ADD COLUMN permissions TEXT DEFAULT ''"); } catch (err) {}
  // Support ticket assignment (staff name/handle) for Telegram assign/escalate flows.
  try { await dbRun("ALTER TABLE customer_reports ADD COLUMN assigned_to VARCHAR(255) DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_host TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_port INTEGER"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_user TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_pass TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_from TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paystack_public_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN paystack_secret_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN jap_api_url TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN jap_api_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_flat_margin REAL DEFAULT 1300.0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN grizzly_api_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_api_url TEXT DEFAULT 'https://api.grizzlysms.com/stubs/handler_api.php'"); } catch (err) {}
  // SMS Session Management (Requirement 9) — configurable, persisted
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_session_timeout INTEGER DEFAULT 1200"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_auto_cancel_timeout INTEGER DEFAULT 1200"); } catch (err) {}

  // ——— AI Assistant provider settings (secrets stay server-side only) ———
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_enabled INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_provider TEXT DEFAULT 'local'"); } catch (err) {}       // local | openai | gemini | claude | auto
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_openai_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_gemini_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_claude_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_openai_model TEXT DEFAULT 'gpt-4o-mini'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_gemini_model TEXT DEFAULT 'gemini-2.5-flash-lite'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_claude_model TEXT DEFAULT 'claude-3-5-sonnet-20241022'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_temperature REAL DEFAULT 0.5"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_max_tokens INTEGER DEFAULT 600"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_timeout_ms INTEGER DEFAULT 20000"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_streaming INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN ai_fallback_local INTEGER DEFAULT 1"); } catch (err) {}

  // ——— Flutterwave Payment Gateway settings (secrets stay server-side only) ———
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_public_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_secret_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_encryption_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_webhook_hash TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_environment TEXT DEFAULT 'sandbox'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_currency TEXT DEFAULT 'NGN'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN flutterwave_enabled INTEGER DEFAULT 0"); } catch (err) {}

  // ——— Flutterwave payment records: one row per initiated payment (idempotent by tx_ref) ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS flutterwave_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_ref TEXT UNIQUE NOT NULL,
      flw_transaction_id TEXT,
      user_id INTEGER,
      email TEXT,
      purpose TEXT DEFAULT 'wallet',       -- 'wallet' | 'marketplace' | 'gift'
      product_id TEXT,
      quantity INTEGER DEFAULT 1,
      shipping_info TEXT,                   -- JSON (gift/marketplace delivery details)
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'NGN',
      status TEXT DEFAULT 'pending',        -- pending | successful | failed | cancelled | refunded
      verified INTEGER DEFAULT 0,
      processed INTEGER DEFAULT 0,          -- wallet credited / order created exactly once
      order_id TEXT,
      environment TEXT DEFAULT 'sandbox',
      raw_response TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // ——— Flutterwave webhook event log (audit + retry) ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS flutterwave_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT,
      tx_ref TEXT,
      flw_transaction_id TEXT,
      payload TEXT,
      signature_valid INTEGER DEFAULT 0,
      verification_status TEXT DEFAULT 'unverified',
      processed INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT
    )
  `);
  // Fast lookups + DB-level duplicate protection for Flutterwave payments.
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_flw_payments_txref ON flutterwave_payments (tx_ref)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_flw_payments_flwid ON flutterwave_payments (flw_transaction_id)"); } catch (err) {}
  // Guarantee a Flutterwave transaction id can only ever be credited once (processed rows).
  try { await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS uniq_flw_processed_txid ON flutterwave_payments (flw_transaction_id) WHERE processed = 1 AND flw_transaction_id != ''"); } catch (err) {}

  // ——— Monnify Payment Gateway settings (secrets stay server-side only) ———
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_api_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_secret_key TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_contract_code TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_webhook_secret TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_environment TEXT DEFAULT 'sandbox'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_currency TEXT DEFAULT 'NGN'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN monnify_enabled INTEGER DEFAULT 0"); } catch (err) {}

  // --- Platform Foundation defaults (Priority 2.5): branding, inventory/delivery/SEO defaults ---
  try { await dbRun("ALTER TABLE settings ADD COLUMN brand_primary_color TEXT DEFAULT '#7c3aed'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN brand_accent_color TEXT DEFAULT '#22d3ee'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN brand_tagline TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN default_low_stock_threshold INTEGER DEFAULT 3"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN default_delivery_estimate TEXT DEFAULT 'Instant · within minutes'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN default_warranty_period TEXT DEFAULT '30 days'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN seo_default_title TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN seo_default_description TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN seo_default_keywords TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN notify_low_stock INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN notify_new_order INTEGER DEFAULT 1"); } catch (err) {}
  // Admin-editable SMS activation instructions (shown on the SMS panel; supports simple markdown-ish text).
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_instructions TEXT DEFAULT ''"); } catch (err) {}
  // Admin-editable Security Center instructions shown to customers on every purchased
  // credential (rich HTML). Product-level `setup_guide` overrides this when present.
  try { await dbRun("ALTER TABLE settings ADD COLUMN security_instructions TEXT DEFAULT ''"); } catch (err) {}
  // Admin-configurable SMS provider timing (seconds) — used server-side immediately, no rebuild.
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_cancel_delay INTEGER DEFAULT 120"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_poll_interval INTEGER DEFAULT 4"); } catch (err) {}
  // ——— Multi-provider SMS configuration (5SIM + SMSPool alongside Grizzly) ———
  // API keys (encrypted-at-rest not required by spec — env is the primary source, DB is a
  // dashboard-managed fallback and never exposed to the frontend). Grizzly stays as-is.
  try { await dbRun("ALTER TABLE settings ADD COLUMN fivesim_api_key TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smspool_api_key TEXT"); } catch (err) {}
  // Enable flags — Grizzly defaults ON (unchanged behavior); new providers default OFF so the
  // platform behaves EXACTLY as today until an admin explicitly turns them on.
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_provider_grizzly_enabled INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_provider_fivesim_enabled INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_provider_smspool_enabled INTEGER DEFAULT 0"); } catch (err) {}
  // Selection policy: primary / secondary provider + mode ('single' honors primary only w/
  // fallback; 'auto' tries primary→secondary→rest picking the cheapest in-stock option).
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_primary_provider VARCHAR(32) DEFAULT 'grizzly'"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_secondary_provider VARCHAR(32) DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_provider_mode VARCHAR(16) DEFAULT 'single'"); } catch (err) {}
  // Smart routing strategy: cheapest | success | fastest | preferred | manual. Empty falls back
  // to the legacy mode (auto→cheapest, single→preferred) so existing behavior is preserved.
  try { await dbRun("ALTER TABLE settings ADD COLUMN sms_routing_strategy VARCHAR(16) DEFAULT ''"); } catch (err) {}
  // Global default for TOTP "Get Code" usage limit (0 = unlimited).
  try { await dbRun("ALTER TABLE settings ADD COLUMN totp_default_limit INTEGER DEFAULT 0"); } catch (err) {}

  // Reserved (dedicated) virtual account per user — one permanent account each.
  try { await dbRun("ALTER TABLE users ADD COLUMN monnify_account_number TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE users ADD COLUMN monnify_bank_name TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE users ADD COLUMN monnify_account_name TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE users ADD COLUMN monnify_account_reference TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE users ADD COLUMN monnify_reservation_reference TEXT"); } catch (err) {}

  // ——— Monnify payment records: one row per transaction (idempotent by transaction_reference) ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS monnify_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_reference TEXT,          -- Monnify's transactionReference
      payment_reference TEXT UNIQUE NOT NULL, -- our own reference (paymentReference)
      user_id INTEGER,
      email TEXT,
      purpose TEXT DEFAULT 'wallet',       -- 'wallet' (reserved-account funding / checkout)
      amount REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      currency TEXT DEFAULT 'NGN',
      status TEXT DEFAULT 'pending',       -- pending | successful | failed | cancelled
      verified INTEGER DEFAULT 0,
      processed INTEGER DEFAULT 0,         -- wallet credited exactly once
      channel TEXT,
      environment TEXT DEFAULT 'sandbox',
      raw_response TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // ——— Monnify webhook event log (audit + retry) ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS monnify_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT,
      transaction_reference TEXT,
      payment_reference TEXT,
      payload TEXT,
      signature_valid INTEGER DEFAULT 0,
      verification_status TEXT DEFAULT 'unverified',
      processed INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_monnify_payments_payref ON monnify_payments (payment_reference)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_monnify_payments_txref ON monnify_payments (transaction_reference)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_users_monnify_acct ON users (monnify_account_number)"); } catch (err) {}
  // Ensure the Monnify payment method row always exists (idempotent). Disabled by default.
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Monnify', 0, 'System', datetime('now'))");

  // 18. API Balance Cache Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS api_balance_cache (
      provider VARCHAR(255) PRIMARY KEY,
      balance REAL DEFAULT 0.0,
      last_checked VARCHAR(255)
    )
  `);

  // 19. Promo Codes Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      code VARCHAR(255) PRIMARY KEY,
      amount REAL NOT NULL,
      type VARCHAR(255) DEFAULT 'GLOBAL',
      max_uses INTEGER DEFAULT 1,
      uses_count INTEGER DEFAULT 0,
      expires_at VARCHAR(255) DEFAULT 'never',
      status VARCHAR(255) DEFAULT 'active'
    )
  `);

  // Rename SMM Panel → Social Media Growth in the sidebar label (keep id for routing)
  try { await dbRun("UPDATE sidebar_items SET label = 'Social Media Growth' WHERE id = 'SMM Panel' AND (label = 'SMM Panel' OR label IS NULL)"); } catch (err) {}

  // Recharge code expiry + redemption tracking (FEATURE 2)
  if (true) { /* additive column migrations — run on ALL engines; try/catch ignores "duplicate column" */
    try { await dbRun("ALTER TABLE promo_codes ADD COLUMN redeemed_user_id INTEGER"); } catch (err) {}
    try { await dbRun("ALTER TABLE promo_codes ADD COLUMN redeemed_at TEXT"); } catch (err) {}
    try { await dbRun("ALTER TABLE promo_codes ADD COLUMN created_at TEXT"); } catch (err) {}
  }

  // Recharge code redemption history (permanent audit trail)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS recharge_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code VARCHAR(255) NOT NULL,
      user_id INTEGER,
      user_email VARCHAR(255),
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // 20. Wishlist Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      product_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // 21. Product Templates (reusable product blueprints for the Product Studio wizard)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER NOT NULL,
      ip_address VARCHAR(64),
      user_agent TEXT,
      device VARCHAR(128),
      browser VARCHAR(128),
      os VARCHAR(128),
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id)"); } catch (err) {}

  // Security Center — TOTP code-generation activity log (audit trail).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS totp_activity (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      credential_id INTEGER,
      order_id VARCHAR(255),
      product_name VARCHAR(255),
      ip_address VARCHAR(64),
      device VARCHAR(128),
      browser VARCHAR(128),
      os VARCHAR(128),
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_totp_activity_cred ON totp_activity(credential_id)"); } catch (err) {}

  await dbRun(`
    CREATE TABLE IF NOT EXISTS product_templates (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      product_type VARCHAR(255),
      data TEXT NOT NULL,
      created_by INTEGER,
      created_at VARCHAR(255) NOT NULL
    )
  `);

  // 22. Unified Media Library (central asset store reused by every module)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      url TEXT NOT NULL,
      filename VARCHAR(255),
      mime VARCHAR(255),
      kind VARCHAR(64),
      folder VARCHAR(255) DEFAULT 'General',
      tags TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      hash VARCHAR(128),
      alt TEXT DEFAULT '',
      uploaded_by INTEGER,
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_media_folder ON media_library(folder)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_media_hash ON media_library(hash)"); } catch (err) {}

  // 23. Homepage Builder — configurable, orderable homepage sections
  await dbRun(`
    CREATE TABLE IF NOT EXISTS homepage_sections (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255),
      type VARCHAR(64),
      enabled INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      config TEXT DEFAULT ''
    )
  `);
  // Seed the default homepage sections once (idempotent, backward-compatible).
  try {
    const existing = await dbGet("SELECT COUNT(*) AS c FROM homepage_sections");
    if (!existing || existing.c === 0) {
      const defaults = [
        ["featured", "Featured", "featured", 1, 1],
        ["trending", "Trending", "trending", 1, 2],
        ["bestsellers", "Best Sellers", "bestsellers", 1, 3],
        ["newarrivals", "New Arrivals", "newarrivals", 1, 4],
        ["recommended", "Recommended", "recommended", 1, 5],
        ["promotions", "Promotions", "promotions", 1, 6],
      ];
      for (const [id, title, type, enabled, order] of defaults) {
        await dbRun("INSERT INTO homepage_sections (id, title, type, enabled, order_index, config) VALUES (?, ?, ?, ?, ?, '')", [id, title, type, enabled, order]);
      }
    }
  } catch (err) { console.warn("Homepage sections seed failed:", err.message); }

  // ============================================================================
  //  FEATURE 1 — ADVANCED CREDENTIAL MANAGER (dynamic schema + values)
  //  A per-product credential SCHEMA (ordered, typed fields incl. unlimited custom
  //  fields) plus per-credential dynamic VALUES stored as JSON. Fully additive and
  //  backward-compatible with the existing inventory_pool structured columns.
  // ============================================================================
  // Ordered field schema attached to a product (or reusable as a template when product_id IS NULL).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS credential_fields (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      product_id VARCHAR(255),
      template_name VARCHAR(255),
      field_key VARCHAR(255) NOT NULL,
      label VARCHAR(255) NOT NULL,
      type VARCHAR(32) DEFAULT 'text',
      options TEXT DEFAULT '',
      required INTEGER DEFAULT 0,
      is_secret INTEGER DEFAULT 0,
      placeholder VARCHAR(255) DEFAULT '',
      help_text VARCHAR(255) DEFAULT '',
      order_index INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_credfields_product ON credential_fields(product_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_credfields_template ON credential_fields(template_name)"); } catch (err) {}
  // Dynamic key→value store for a credential row (references inventory_pool.id). JSON blob.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN dynamic_values TEXT DEFAULT ''"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN updated_by VARCHAR(255)"); } catch (err) {}

  // ============================================================================
  //  FEATURE 2 — CUSTOM FORM BUILDER (forms + fields + responses + templates)
  // ============================================================================
  await dbRun(`
    CREATE TABLE IF NOT EXISTS forms (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(120) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      status VARCHAR(32) DEFAULT 'draft',
      fields TEXT DEFAULT '[]',
      success_message TEXT DEFAULT 'Thank you! Your response has been recorded.',
      is_template INTEGER DEFAULT 0,
      template_name VARCHAR(255) DEFAULT '',
      submissions_count INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms(slug)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status)"); } catch (err) {}
  await dbRun(`
    CREATE TABLE IF NOT EXISTS form_responses (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      form_id VARCHAR(64) NOT NULL,
      answers TEXT DEFAULT '{}',
      status VARCHAR(32) DEFAULT 'new',
      ip_address VARCHAR(64),
      user_agent TEXT,
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_formresp_form ON form_responses(form_id)"); } catch (err) {}

  // ============================================================================
  //  FEATURE 3 — KNOWLEDGE BASE & DOCUMENTATION CMS (docs + versions)
  // ============================================================================
  await dbRun(`
    CREATE TABLE IF NOT EXISTS docs (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(160) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(120) DEFAULT 'General',
      excerpt TEXT DEFAULT '',
      body TEXT DEFAULT '',
      icon VARCHAR(64) DEFAULT '📄',
      status VARCHAR(32) DEFAULT 'draft',
      visibility VARCHAR(32) DEFAULT 'public',
      related TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_docs_category ON docs(category)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_docs_status ON docs(status)"); } catch (err) {}
  await dbRun(`
    CREATE TABLE IF NOT EXISTS doc_versions (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      doc_id VARCHAR(64) NOT NULL,
      title VARCHAR(255),
      body TEXT,
      changed_by VARCHAR(255),
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_docversions_doc ON doc_versions(doc_id)"); } catch (err) {}

  // --- SQL VIEWS ---
  try { await dbRun("CREATE VIEW IF NOT EXISTS wallets AS SELECT id, id as user_id, wallet_balance as balance FROM users"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS deposits AS SELECT * FROM transactions WHERE type='deposit'"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS marketplace_products AS SELECT * FROM products"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS smm_services AS SELECT * FROM services WHERE type='SMM'"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS sms_orders AS SELECT * FROM orders WHERE category='SMS'"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS api_logs AS SELECT * FROM api_balance_cache"); } catch (err) {}
  try { await dbRun("CREATE VIEW IF NOT EXISTS admin_logs AS SELECT * FROM audit_logs"); } catch (err) {}

  // Silently delete notifications older than 30 days (Requirement 4)
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await dbRun("DELETE FROM notifications WHERE created_at < ?", [thirtyDaysAgo]);
    console.log("[AVS Database] Silently purged notifications older than 30 days.");
  } catch (err) {
    console.warn("Failed to prune old notifications:", err.message);
  }

  // Dynamic cleanup migrations on boot (Requirement 9 & 22)
  try {
    await dbRun("DELETE FROM sidebar_items WHERE id IN ('Gift Delivery')");
    await dbRun("DELETE FROM support_links WHERE id IN ('wa', 'tg', 'tg_comm', 'email')");
    // Ensure ALL core sidebar items exist on every boot (idempotent), so the sidebar is
    // correct even when the product-seed block is skipped on an existing DB (Item 8/14).
    const coreSidebar = [
      ["Dashboard", "Dashboard", "LayoutDashboard", 1],
      ["Wallet", "AVS Wallet", "Wallet", 2],
      ["SMS Panel", "Buy Number", "Smartphone", 3],
      ["SMM Panel", "Social Media Growth", "TrendingUp", 4],
      ["Marketplace", "AVS Marketplace", "ShoppingBag", 5],
      ["My Gift Orders", "My Gift Orders", "Gift", 6],
      ["My Inventory", "My Inventory", "Key", 7],
      ["Orders", "Orders & Tracking", "Package", 8],
      ["Transactions", "Transactions", "RefreshCw", 9],
      ["Notifications", "Security & Alerts", "Bell", 10],
      ["Profile", "My Profile", "User", 11],
      ["Settings", "System Settings", "Settings", 12],
      ["How to Use", "How to Use", "HelpCircle", 13],
      ["Support", "Support", "LifeBuoy", 14],
    ];
    for (const [id, label, icon, order] of coreSidebar) {
      await dbRun(
        "INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES (?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET label=excluded.label, icon=excluded.icon, order_index=excluded.order_index",
        [id, label, icon, order]
      );
    }
    console.log("[AVS Database] Dynamic sidebar & old support links successfully synced on boot.");
  } catch (err) {
    console.warn("Failed to clean up old database links:", err.message);
  }

  // ——— ZERO-DEMO PURGE ———
  console.log("[AVS Database] Triggering full zero-demo purge of test/mock data records...");
  await dbRun("DELETE FROM services");
  await dbRun("DELETE FROM orders");
  await dbRun("DELETE FROM transactions");
  await dbRun("DELETE FROM virtual_numbers");
  await dbRun("DELETE FROM notifications");
  await dbRun("DELETE FROM support_tickets");
  await dbRun("DELETE FROM support_messages");
  await dbRun("DELETE FROM reviews");
  await dbRun("DELETE FROM promo_codes");
  await dbRun("DELETE FROM backups");
  await dbRun("DELETE FROM api_balance_cache");
  await dbRun("DELETE FROM wishlist");

  // Seed / guarantee the core marketplace categories.
  // IMPORTANT: this must be idempotent and independent of SMM categories. Previously it was
  // gated on "categories table empty", but SMM categories are also stored in this table, so on
  // an existing DB the marketplace categories (incl. 'gifts') were never created -> the admin
  // product "Market Category" dropdown was empty and no product could be assigned to the Gift
  // Store. We now upsert them unconditionally so they always exist without wiping admin edits
  // to names/icons/order beyond first creation.
  const coreMarketplaceCategories = [
    { id: "digital", name: "🟢 A. Digital Services", icon: "🟢", order: 1 },
    { id: "communication", name: "🟡 B. Communication Services", icon: "🟡", order: 2 },
    { id: "accounts", name: "🔵 C. Accounts Marketplace", icon: "🔵", order: 3 },
    { id: "vpn", name: "🟣 D. VPN & Subscriptions", icon: "🟣", order: 4 },
    { id: "gadgets", name: "🔌 E. Hardware & Gadgets", icon: "🔌", order: 5 },
    { id: "gifts", name: "🎁 International Gift Delivery", icon: "🎁", order: 6 },
  ];
  for (const c of coreMarketplaceCategories) {
    // Insert if missing; never overwrite admin customizations on existing rows.
    await dbRun(
      "INSERT INTO categories (id, name, type, icon, banner, order_index, status) VALUES (?, ?, ?, ?, '', ?, 1) ON CONFLICT(id) DO NOTHING",
      [c.id, c.name, c.id, c.icon, c.order]
    );
  }

  // ——— International Gift Delivery: idempotent demo catalogue ———
  // These products MUST always exist so the Gift Store, category filtering and checkout can be
  // exercised end-to-end. Prices/fields match the product spec exactly. We use ON CONFLICT DO
  // NOTHING so admin edits to any existing gift row are preserved (never clobbered on restart).
  // Every field here is later fully editable from the Admin Panel (price, stock, images, etc.).
  const GIFT_COUNTRIES = "United States,United Kingdom,Canada,Nigeria,Ghana,South Africa,Germany,France,Australia,United Arab Emirates,Ireland,Netherlands";
  const FOOD_ETA = "Same day – 24 hours (local courier)";
  const STD_ETA = "3–7 business days (international express)";
  const giftCustomFields = "Sender Name, Receiver Name, Delivery Address";
  // [id, name, subcategory, price, icon, description, eta, featured, newest, popular]
  const giftProducts = [
    // 🍽️ Food
    ["gift_food_pizza_drink", "Pizza with Drink", "Food", 45000, "🍕", "Hot, freshly baked oven pizza paired with a chilled beverage of your choice.", FOOD_ETA, 1, 0, 1],
    ["gift_food_supreme_pizza", "Supreme Pan Pizza", "Food", 45000, "🍕", "Premium pan pizza loaded with supreme cheese, pepperoni, mushrooms and bell peppers.", FOOD_ETA, 0, 1, 1],
    ["gift_food_dinner_box", "Dinner Box", "Food", 60000, "🍱", "Complete luxury dining box with multi-course gourmet dishes packed hot and fresh.", FOOD_ETA, 1, 0, 1],
    ["gift_food_pasta_drink", "Pasta with Drink", "Food", 75000, "🍝", "Delicious Italian-style creamy Alfredo or marinara pasta alongside a chilled drink.", FOOD_ETA, 0, 0, 0],
    ["gift_food_brownies_pepsi", "Chocolate Brownies & Chocolate Donut with Pepsi", "Food", 60000, "🍫", "Decadent chocolate brownies and a freshly glazed chocolate donut with a Pepsi can.", FOOD_ETA, 0, 0, 1],
    ["gift_food_cheese_pepsi", "Cheese Stick with Pepsi", "Food", 40000, "🧀", "Crispy melted mozzarella cheese sticks served with marinara dip and a Pepsi can.", FOOD_ETA, 0, 0, 0],
    ["gift_food_fruit_basket", "Fruit Basket", "Food", 65000, "🍓", "Premium hand-selected fresh organic fruits arranged in a beautiful ribboned basket.", FOOD_ETA, 1, 1, 0],
    // 🎁 Custom Photo Gifts
    ["gift_photo_fan_card", "Fan Card / Membership Card", "Custom Photo Gifts", 105000, "🧾", "Premium customized dual-sided membership fan collectible card with your photo and ID details.", STD_ETA, 1, 0, 1],
    ["gift_photo_valentine_card", "Valentine Day Card", "Custom Photo Gifts", 50000, "💌", "Luxury custom Valentine card with printed personalized photos and a hand-typed romantic letter.", STD_ETA, 0, 1, 1],
    ["gift_photo_invitation_card", "Invitation Card", "Custom Photo Gifts", 50000, "✉️", "Elegant customized invitation card with gold-foil lettering and custom photos.", STD_ETA, 0, 0, 0],
    ["gift_photo_picture_frame", "Picture Frame", "Custom Photo Gifts", 65000, "🖼️", "Premium high-durability wooden picture frame housing your uploaded custom photo.", STD_ETA, 1, 0, 1],
    ["gift_photo_blanket", "Custom Blanket", "Custom Photo Gifts", 55000, "🛏️", "Ultra-soft fleece custom photo blanket printed with your favourite memory collage.", STD_ETA, 0, 1, 1],
    ["gift_photo_canvas_frame", "Custom Canvas Frame", "Custom Photo Gifts", 65000, "🖼️", "Museum-grade stretched canvas photo print wrapped on a high-end wooden frame.", STD_ETA, 0, 0, 1],
    ["gift_photo_normal_frame", "Custom Normal Frame", "Custom Photo Gifts", 65000, "🖼️", "Minimalist high-quality custom frame for desktop or wall placement.", STD_ETA, 0, 0, 0],
    ["gift_photo_pillow", "Custom Pillow", "Custom Photo Gifts", 55000, "🛏️", "Premium soft throw pillow with high-fidelity double-sided custom photo printing.", STD_ETA, 0, 0, 0],
    ["gift_photo_beach_towel", "Beach Towel", "Custom Photo Gifts", 50000, "🏖️", "Luxury absorbent custom-printed beach towel with high-resolution photo artwork.", STD_ETA, 0, 0, 0],
    ["gift_photo_socks", "Custom Socks", "Custom Photo Gifts", 50000, "🧦", "Comfortable stretch custom socks with your choice of repeat face/photo printing.", STD_ETA, 0, 0, 0],
    ["gift_photo_phone_case", "Phone Case (iPhone & Samsung)", "Custom Photo Gifts", 50000, "📱", "Ultra-protective customized photo phone case compatible with iPhone and Samsung models.", STD_ETA, 1, 1, 1],
    ["gift_photo_mug", "Custom Mug", "Custom Photo Gifts", 55000, "☕", "Customized photo ceramic mug with breathtaking colours and durable printing.", STD_ETA, 0, 0, 1],
    ["gift_photo_letter", "Letter", "Custom Photo Gifts", 55000, "✉️", "Wax-sealed custom letter printed on textured vintage papyrus with custom initials.", STD_ETA, 0, 0, 0],
    // 👕 Clothes
    ["gift_clothes_tshirt", "T-Shirt", "Clothes", 55000, "👕", "Premium organic-cotton regular-fit unisex crewneck t-shirt.", STD_ETA, 0, 0, 0],
    ["gift_clothes_custom_tshirt", "Customized T-Shirt", "Clothes", 65000, "🎨", "Custom premium t-shirt with your graphic layout or chest embroidery.", STD_ETA, 1, 1, 1],
    ["gift_clothes_sweethearts_set", "Sweethearts T-Shirt Set", "Clothes", 55000, "💑", "Matching set of two custom sweethearts graphic t-shirts — a romantic couples gift pack.", STD_ETA, 0, 0, 1],
    ["gift_clothes_hoodie", "Hoodie", "Clothes", 63000, "🧥", "Ultra-warm premium heavyweight cotton-blend hoodie with double-lined hood.", STD_ETA, 1, 0, 1],
    ["gift_clothes_knit_cap", "Knit Cap", "Clothes", 50000, "🧢", "Cozy thermal rib-knit beanie cap with a personalized custom patch.", STD_ETA, 0, 0, 0],
    ["gift_clothes_cap", "Cap", "Clothes", 50000, "🧢", "Adjustable custom profile cap with solid back buckle.", STD_ETA, 0, 0, 0],
    ["gift_clothes_joggers", "Joggers", "Clothes", 60000, "👖", "Super-comfortable premium cotton joggers with adjustable drawstring waistband.", STD_ETA, 0, 0, 0],
    ["gift_clothes_shoes", "Shoes", "Clothes", 65000, "👟", "Luxury custom athletic sneakers or high-heels in designer gift-wrap boxes.", STD_ETA, 1, 1, 1],
    // 💐 Florist
    ["gift_florist_flower_letter", "Flower with Letter", "Florist", 60000, "🌸", "Stunning bouquet of fresh hand-tied flowers with a wax-sealed card letter.", STD_ETA, 1, 0, 1],
    ["gift_florist_glass_flower", "Glass Flower", "Florist", 65000, "🌹", "Handcrafted crystal glass rose inside a premium glass display dome with LED lights.", STD_ETA, 0, 1, 1],
    ["gift_florist_teddy_letter", "Teddy Bear with Letter", "Florist", 75000, "🧸", "Ultra-soft premium plush teddy bear holding a custom wax-sealed greeting card letter.", STD_ETA, 1, 0, 1],
    ["gift_florist_plant_letter", "Plant with Letter", "Florist", 60000, "🪴", "Air-purifying custom indoor potted plant with a premium instructions letter card.", STD_ETA, 0, 0, 0],
    ["gift_florist_chocolate", "Chocolate", "Florist", 55000, "🍫", "Indulgent imported Belgian assorted chocolates in a heart-shaped luxury gift box.", STD_ETA, 0, 0, 1],
    ["gift_florist_cake", "Cake", "Florist", 55000, "🎂", "Freshly customized birthday or anniversary cake — choose chocolate or vanilla.", FOOD_ETA, 1, 1, 1],
    ["gift_florist_car_key", "Car Key", "Florist", 60000, "🔑", "Premium high-end car remote-fob key shell or customized keychain.", STD_ETA, 0, 0, 0],
    ["gift_florist_tesla_key", "Tesla Key", "Florist", 165000, "🚗", "Genuine Tesla smart key card or customized smart-ring fob.", STD_ETA, 1, 1, 0],
    // 💍 Accessories
    ["gift_acc_ring", "Ring", "Accessories", 55000, "💍", "Solid 925 sterling-silver adjustable couples ring in a velvet dome box.", STD_ETA, 0, 0, 0],
    ["gift_acc_necklace", "Necklace", "Accessories", 55000, "📿", "Dainty handcrafted silver pendant necklace — durable and hypoallergenic.", STD_ETA, 1, 0, 1],
    ["gift_acc_wristwatch", "Wristwatch", "Accessories", 70000, "⌚", "Sleek luxury quartz wristwatch with customizable leather strap and premium watch box.", STD_ETA, 1, 1, 1],
    ["gift_acc_birth_cert", "Birth Certificate", "Accessories", 75000, "📄", "Artistic calligraphy-printed personalized birth certificate scroll in a metallic cylinder.", STD_ETA, 0, 0, 0],
    ["gift_acc_huge_teddy", "Huge Teddy Bear", "Accessories", 110000, "🐻", "Colossal giant fluffy plush teddy bear — an unforgettable luxury surprise.", STD_ETA, 1, 0, 1],
    // 📚 Books & Documents
    ["gift_book_novel", "Book or Novel", "Books & Documents", 50000, "📖", "Gilded leather-bound classic novel or best-selling book of your choice.", STD_ETA, 0, 0, 0],
    ["gift_book_letter", "Letter", "Books & Documents", 55000, "✉️", "Hand-calligraphed premium scroll letter tied with velvet ribbon and sealed with wax.", STD_ETA, 0, 0, 0],
    ["gift_book_atm_card", "ATM Card", "Books & Documents", 125000, "💳", "Premium customized metal card-skin casing to upgrade your debit/credit card.", STD_ETA, 1, 1, 1],
    ["gift_book_certificate", "Certificate", "Books & Documents", 85000, "📜", "Premium customized certificate printing with gold borders and a wooden frame.", STD_ETA, 1, 0, 1],
    ["gift_book_house_key", "House Key", "Books & Documents", 50000, "🗝️", "Handcrafted premium brass key housing shell or personalized house-warming keychain.", STD_ETA, 0, 0, 0],
  ];
  for (const g of giftProducts) {
    const [gid, gname, gsub, gprice, gicon, gdesc, geta, gfeat, gnew, gpop] = g;
    const sku = "GIFT-" + gid.replace(/^gift_/, "").toUpperCase().replace(/_/g, "-");
    await dbRun(
      `INSERT INTO products
        (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular, status, sku, delivery_countries, delivery_estimate, created_at)
       VALUES (?, ?, 'gifts', ?, ?, 4.9, 0, ?, ?, 'physical', 'manual', 50, '', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [gid, gname, gsub, gprice, gicon, gdesc, giftCustomFields, geta, gfeat, gnew, gpop, sku, GIFT_COUNTRIES, geta, new Date().toISOString()]
    );
  }

  // Seed default real products if empty
  const existProd = await dbGet("SELECT id FROM products LIMIT 1");
  if (!existProd) {
    console.log("[AVS Database] Seeding real marketplace products...");
    
    // VPNs
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular) VALUES 
      ('expressvpn', 'ExpressVPN (1-Year Premium Key)', 'vpn', 'VPN Keys', 18500.0, 4.9, 142, '🛡️', 'High-performance ExpressVPN 1-year retail license key. Fully secures unlimited devices on high-bandwidth servers with proprietary Lightway protocol support.', 'digital', 'instant', 10, 'https://expressvpn.com/activate', 'License Key', '1. Download ExpressVPN app\\n2. Open app and enter the license key provided in your completed orders panel.', 1, 0, 1),
      ('nordvpn', 'NordVPN (1-Year Premium Key)', 'vpn', 'VPN Keys', 12000.0, 4.8, 210, '❄️', 'NordVPN 1-year premium subscription. Military-grade double-hop encryption, split-tunneling, Threat Protection ad blocker, and multi-redundant secure nodes.', 'digital', 'instant', 10, 'https://nordvpn.com/download', 'License Key', '1. Log in to Nord Account\\n2. Enter activation key\\n3. Enjoy high-speed VPN.', 0, 1, 1),
      ('surfshark', 'Surfshark VPN (1-Year License Key)', 'vpn', 'VPN Keys', 9500.0, 4.7, 95, '🦈', 'Surfshark VPN 1-year unlimited license key. Allows unlimited simultaneous connections with extremely high-speed WireGuard protocol and ad-blocking CleanWeb.', 'digital', 'instant', 10, 'https://surfshark.com/install', 'License Key', '1. Go to Surfshark Activation\\n2. Input code\\n3. Activate unlimited devices.', 0, 0, 1),
      ('pia', 'Private Internet Access (PIA) (1-Year Key)', 'vpn', 'VPN Keys', 8000.0, 4.6, 75, '🕵️', 'PIA VPN 1-year premium license. Secure shadowsocks proxies, advanced leak protection, proven no-logs policy, and over 10,000 servers globally.', 'digital', 'instant', 10, 'https://privateinternetaccess.com', 'License Key', '1. Open PIA client\\n2. Put key\\n3. Connect.', 0, 0, 0),
      ('ipvanish', 'IPVanish VPN (1-Year Premium Key)', 'vpn', 'VPN Keys', 7500.0, 4.5, 60, '🦎', 'IPVanish premium license for 1 year. Fast connections, unblocks TextNow and other VoIP providers smoothly with clean residential IP arrays.', 'digital', 'instant', 10, 'https://ipvanish.com', 'License Key', '1. Download IPVanish\\n2. Input license activation parameters.', 0, 0, 0)`);

    // Virtual Lines & Accounts
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular) VALUES 
      ('google_voice', 'Google Voice Verified Account (USA)', 'accounts', 'Virtual Lines', 5500.0, 4.9, 310, '📞', 'Fresh, high-reputation Google Voice account pre-activated with a permanent US virtual phone number. Perfect for secure SMS activations and global calling.', 'digital', 'instant', 15, '', 'Recovery Email', 'Log in using Google Voice web portal or official app using credentials.', 1, 0, 1),
      ('textnow', 'TextNow Premium Web Account', 'accounts', 'Virtual Lines', 3200.0, 4.8, 150, '💬', 'TextNow premium account pre-configured with a permanent Canadian or USA phone line. Multi-session login and long-term number locking enabled.', 'digital', 'instant', 15, '', 'Login credentials', 'Use TextNow Web Login or mobile client.', 0, 1, 1),
      ('textplus', 'textPlus Verified SMS Account', 'accounts', 'Virtual Lines', 2500.0, 4.7, 85, '📝', 'textPlus premium account with active virtual SMS line. Completely bypassing common platform verifications and geo-restriction filters.', 'digital', 'instant', 15, '', 'Login credentials', 'Use textPlus app to sign in.', 0, 0, 0),
      ('talkatone', 'Talkatone Verified Calling Account', 'accounts', 'Virtual Lines', 2800.0, 4.6, 64, '📣', 'Talkatone calling line account. Supports secure high-clarity outgoing calls and bypasses major security checks on web applications.', 'digital', 'instant', 15, '', 'Login credentials', 'Open Talkatone and enter email/pass.', 0, 0, 0),
      ('nextplus', 'NextPlus Premium Virtual Account', 'accounts', 'Virtual Lines', 2200.0, 4.5, 48, '📲', 'NextPlus virtual SMS routing account. Pre-registered with pristine US carrier number for reliable background text notifications.', 'digital', 'instant', 15, '', 'Login credentials', 'Open NextPlus app and enter credentials.', 0, 0, 0),
      ('apple_id', 'Apple ID / iCloud Account (USA Region)', 'accounts', 'Apple IDs', 4500.0, 4.9, 120, '🍎', 'Verified Apple ID pre-set in USA Region with active iCloud space. Zero risk of lock-outs, customized securely for premium developer downloads.', 'digital', 'instant', 15, '', 'Apple ID Email|Password|Security Questions', '1. Go to Settings on your Apple device\\n2. Sign in to iCloud and App Store using the credentials\\n3. Set up your backup phone.', 1, 1, 0)`);

    // SIM Cards & eSIMs — each seeded directly into its dedicated module (display_location)
    // so a fresh install already has correct checkout routing (physical-sim / esim).
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular, display_location, display_locations) VALUES 
      ('sim_usa_lyca', 'USA Lycamobile SIM Card (Physical)', 'communication', 'SIM Cards', 18500.0, 4.9, 92, '📦', 'Genuine physical USA Lycamobile SIM Card. Receives roaming SMS signals inside Nigeria without active recharge. Highly secure for multi-service verification nodes.', 'physical', 'manual', 10, '', 'Receiver Full Name, Delivery Address', 'SIM card is physically dispatched via GIGM courier. Tracking number is provided within 12 hours.', 1, 0, 1, 'physical-sim', '["physical-sim"]'),
      ('sim_uk_lebara', 'UK Lebara SIM Card (Physical)', 'communication', 'SIM Cards', 12500.0, 4.8, 145, '📬', 'Genuine physical UK Lebara SIM Card. Auto-registers on roaming arrays inside Nigeria. Perfect for WhatsApp, Telegram, and international financial alerts.', 'physical', 'manual', 10, '', 'Receiver Full Name, Delivery Address', 'SIM card is physically dispatched via GIGM courier. Tracking number is provided within 12 hours.', 0, 1, 1, 'physical-sim', '["physical-sim"]'),
      ('uk_esim', 'United Kingdom eSIM (Instant Profile)', 'communication', 'eSIM', 6000.0, 4.9, 150, '📡', 'UK roaming eSIM activation profile. Activates dynamically on your device. Excellent connection and high-reliability background SMS reception.', 'digital', 'manual', 20, '', 'Full Name, Device Model, Country of Use', 'Fulfillment is done via manual eSIM QR dispatch. Ensure device supports eSIM.', 1, 1, 1, 'esim', '["esim"]'),
      ('canada_esim', 'Canada eSIM (Instant Profile)', 'communication', 'eSIM', 7500.0, 4.8, 98, '🛜', 'Canadian roaming eSIM profile. Pre-configured with active cellular line. Ideal for dual-line configurations on carrier-unlocked devices.', 'digital', 'manual', 20, '', 'Full Name, Device Model, Country of Use', 'eSIM QR code is dispatched manually by admin. Non-refundable after profile generation.', 0, 1, 1, 'esim', '["esim"]')`);

    // Social Media & Streaming
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular) VALUES 
      ('insta_acc', 'Instagram Aged Account (PVA, 2021-2023)', 'accounts', 'Social Accounts', 4000.0, 4.7, 230, '📸', 'High-trust aged Instagram account with phone verifications. Fully secure, pristine IP history, and highly suited for organic social reach.', 'digital', 'instant', 10, '', 'Username|Password|Cookies', 'Access aged account using browser cookies or mobile login.', 0, 0, 1),
      ('twitter_acc', 'Twitter / X Aged Verified Account', 'accounts', 'Social Accounts', 6500.0, 4.8, 185, '🐦', 'Pristine aged Twitter/X account with verified phone parameters and secure 2FA setups. Zero shadowbans or access flags.', 'digital', 'instant', 10, '', 'Username|Password|2FA_Secret', 'Log in using the 2FA secret on 2fa.live to get the OTP code.', 1, 1, 1),
      ('fb_acc', 'Facebook Aged PVA Account + Cookies', 'accounts', 'Social Accounts', 4500.0, 4.6, 140, '📘', 'Aged Facebook PVA account complete with active cookie data. Bypasses geo-check blocks and provides immediate advertising capabilities.', 'digital', 'instant', 10, '', 'Email|Password|Cookies', 'Import cookies into browser to sign in instantly.', 0, 0, 0),
      ('netflix_premium', 'Netflix Premium 4K Shared Slot (1-Month)', 'digital', 'Streaming Logs', 3500.0, 4.9, 450, '🎬', 'Ultra HD 4K Netflix premium shared slot. Watch on any supported device with active screen lock. Completely secure and ad-free streaming experience.', 'digital', 'instant', 30, '', 'Email|Password|ProfileName', '1. Go to Netflix.com\\n2. Login with credentials\\n3. Select your designated Profile Name.', 1, 0, 1)`);

    // Seed Gadgets Products
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular, specifications) VALUES 
      ('iphone_15_pro', 'iPhone 15 Pro Max (Grade A++ Refurbished)', 'gadgets', 'Smartphones', 1250000.0, 5.0, 8, '📱', 'Pristine condition factory-unlocked US-spec iPhone 15 Pro Max 256GB. Grade A++ certified looks and functions brand new.', 'physical', 'manual', 2, '', 'Delivery Address, Contact Phone', 'Physical GIGM courier delivery within 24 hours inside Nigeria.', 1, 0, 1, 'Screen: 6.7-inch OLED | Processor: A17 Pro | Storage: 256GB | Battery: 100% Health'),
      ('oraimo_buds_4', 'Oraimo FreePods 4 (ANC Wireless Earbuds)', 'gadgets', 'Audio', 45000.0, 4.8, 42, '🎧', 'Oraimo premium active noise cancelling wireless earbuds. High-fidelity audio output with ultra-long battery performance.', 'physical', 'manual', 15, '', 'Delivery Address, Contact Phone', 'Physical GIGM courier delivery within 24 hours.', 0, 1, 1, 'ANC: Yes | Playtime: 35 Hours | Bluetooth: 5.2 | Waterproof: IPX5'),
      ('anker_power_20k', 'Anker PowerCore 20,000mAh Power Bank', 'gadgets', 'Accessories', 35000.0, 4.9, 65, '🔋', 'Anker high-durability ultra-fast charging 20,000mAh portable charger. Charge your mobile nodes multiple times.', 'physical', 'manual', 8, '', 'Delivery Address, Contact Phone', 'Physical GIGM courier delivery inside Nigeria.', 0, 0, 1, 'Capacity: 20000mAh | Ports: 2x USB-A, 1x USB-C | Fast Charge: 20W PD')`);

    // Seed Gift Products (Requirement 23)
    await dbRun(`INSERT INTO products (id, name, category, subcategory, price, rating, sales, icon, description, type, delivery_type, stock, file_url, custom_fields, setup_guide, featured, newest, popular) VALUES 
      ('gift_food_pizza_drink', 'Pizza with Drink', 'gifts', 'Food', 45000.0, 4.9, 12, '🍕', 'Hot freshly baked oven-baked pizza accompanied by a chilled beverage of your choice.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Hand-delivered within 24 hours.', 1, 0, 1),
      ('gift_food_supreme_pizza', 'Supreme Pan Pizza', 'gifts', 'Food', 45000.0, 4.8, 18, '🍕', 'Premium pan pizza loaded with supreme cheese, pepperoni, mushrooms, and bell peppers.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Hand-delivered with personalized gift card.', 0, 1, 1),
      ('gift_food_dinner_box', 'Dinner Box', 'gifts', 'Food', 60000.0, 4.9, 25, '🍱', 'Complete luxury meal dining box with multi-course gourmet dishes packed hot and fresh.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Dispatched with premium catering partner.', 1, 0, 1),
      ('gift_food_pasta_drink', 'Pasta with Drink', 'gifts', 'Food', 75000.0, 4.7, 9, '🍝', 'Delicious Italian style creamy Alfredo or marinara pasta alongside a chilled drink.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Delivered hot in thermal bags.', 0, 0, 0),
      ('gift_food_brownies_pepsi', 'Chocolate Brownies & Donut with Pepsi', 'gifts', 'Food', 60000.0, 4.8, 30, '🍫', 'Decadent chocolate brownies and freshly glazed donuts accompanied by a Pepsi can.', 'physical', 'manual', 25, '', 'Sender Name, Receiver Name, Delivery Address', 'Wrapped in premium gift dessert box.', 0, 0, 1),
      ('gift_food_cheese_pepsi', 'Cheese Stick with Pepsi', 'gifts', 'Food', 40000.0, 4.6, 14, '🧀', 'Crispy melted mozzarella cheese sticks served with marinara dip and a Pepsi can.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Delivered hot and fresh.', 0, 0, 0),
      ('gift_food_fruit_basket', 'Fruit Basket', 'gifts', 'Food', 65000.0, 4.9, 22, '🍓', 'Premium selection of hand-selected fresh organic global fruits in a beautiful ribboned basket.', 'physical', 'manual', 10, '', 'Sender Name, Receiver Name, Delivery Address', 'Flower and fruit dispatch node.', 1, 1, 0),
      
      ('gift_photo_fan_card', 'Fan Card / Membership Card', 'gifts', 'Custom Photo Gifts', 105000.0, 4.9, 45, '🧾', 'Premium customized dual-sided membership fan collectible card with personalized photo and ID details.', 'physical', 'manual', 50, '', 'Sender Name, Receiver Name, Delivery Address', 'Designed, printed, and securely dispatched.', 1, 0, 1),
      ('gift_photo_valentine_card', 'Valentine Day Card', 'gifts', 'Custom Photo Gifts', 50000.0, 4.8, 64, '💌', 'Luxury custom Valentine cards containing printed personalized photos and hand-typed romantic letters.', 'physical', 'manual', 100, '', 'Sender Name, Receiver Name, Delivery Address', 'Premium wax-sealed card envelope.', 0, 1, 1),
      ('gift_photo_invitation_card', 'Invitation Card', 'gifts', 'Custom Photo Gifts', 50000.0, 4.7, 40, '✉️', 'Elegant customized invitation cards with gold foil lettering and custom photos.', 'physical', 'manual', 100, '', 'Sender Name, Receiver Name, Delivery Address', 'Dispatched with premium carrier node.', 0, 0, 0),
      ('gift_photo_picture_frame', 'Picture Frame', 'gifts', 'Custom Photo Gifts', 65000.0, 4.9, 88, '🖼️', 'Premium high-durability wooden border picture frame housing your uploaded custom photo.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Secure shockproof gift packaging.', 1, 0, 1),
      ('gift_photo_blanket', 'Custom Blanket', 'gifts', 'Custom Photo Gifts', 55000.0, 4.8, 15, '🛏️', 'Ultra soft fleece custom photo blanket customized with your favorite memory collage.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Tailored and dispatched within 48 hours.', 0, 1, 1),
      ('gift_photo_canvas_frame', 'Custom Canvas Frame', 'gifts', 'Custom Photo Gifts', 65000.0, 4.9, 31, '🖼️', 'Museum-grade stretched canvas photo print wrapped on high-end wooden frames.', 'physical', 'manual', 25, '', 'Sender Name, Receiver Name, Delivery Address', 'Pristine HD resolution finish.', 0, 0, 1),
      ('gift_photo_normal_frame', 'Custom Normal Frame', 'gifts', 'Custom Photo Gifts', 65000.0, 4.7, 19, '🖼️', 'Minimalist high-quality borders custom frame for desktop or wall placement.', 'physical', 'manual', 40, '', 'Sender Name, Receiver Name, Delivery Address', 'Shipped securely in bubble wraps.', 0, 0, 0),
      ('gift_photo_pillow', 'Custom Pillow', 'gifts', 'Custom Photo Gifts', 55000.0, 4.8, 28, '🛏️', 'Premium soft throw pillow customized with high-fidelity double-sided custom photo printing.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Includes premium poly-fill inserts.', 0, 0, 0),
      ('gift_photo_beach_towel', 'Beach Towel', 'gifts', 'Custom Photo Gifts', 50000.0, 4.6, 12, '🏖️', 'Luxury absorbent custom printed beach towel with high resolution photo artwork.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Machine washable durable print.', 0, 0, 0),
      ('gift_photo_socks', 'Custom Socks', 'gifts', 'Custom Photo Gifts', 50000.0, 4.7, 50, '🧦', 'Comfortable stretch custom socks with your choice of repeat face/photo printing.', 'physical', 'manual', 100, '', 'Sender Name, Receiver Name, Delivery Address', 'Pre-washed hygienic packing.', 0, 0, 0),
      ('gift_photo_phone_case', 'Phone Case (iPhone & Samsung)', 'gifts', 'Custom Photo Gifts', 50000.0, 4.9, 120, '📱', 'Ultra protective customized photo phone case compatible with iPhone and Samsung models.', 'physical', 'manual', 80, '', 'Sender Name, Receiver Name, Delivery Address', 'Indicate precise phone model in notes.', 1, 1, 1),
      ('gift_photo_mug', 'Custom Mug', 'gifts', 'Custom Photo Gifts', 55000.0, 4.8, 95, '☕', 'Customized photo ceramic mug. Breathtaking colors and heat-reactive customization support.', 'physical', 'manual', 150, '', 'Sender Name, Receiver Name, Delivery Address', 'Dishwasher and microwave safe.', 0, 0, 1),
      ('gift_photo_letter', 'Custom Printed Letter', 'gifts', 'Custom Photo Gifts', 55000.0, 4.7, 34, '✉️', 'Wax-sealed custom letter printed on textured vintage papyrus sheet with custom initials.', 'physical', 'manual', 200, '', 'Sender Name, Receiver Name, Delivery Address', 'Hand-typed premium look.', 0, 0, 0),
      
      ('gift_clothes_tshirt', 'T-Shirt', 'gifts', 'Clothes', 55000.0, 4.8, 70, '👕', 'Premium organic cotton regular fit unisex crewneck t-shirt.', 'physical', 'manual', 50, '', 'Sender Name, Receiver Name, Delivery Address', 'Standard shipping nodes.', 0, 0, 0),
      ('gift_clothes_custom_tshirt', 'Customized T-Shirt', 'gifts', 'Clothes', 65000.0, 4.9, 92, '🎨', 'Custom customized premium t-shirt with custom graphic layout or chest embroidery.', 'physical', 'manual', 40, '', 'Sender Name, Receiver Name, Delivery Address', 'Specify dimensions in delivery notes.', 1, 1, 1),
      ('gift_clothes_sweethearts_set', 'Sweethearts T-Shirt Set', 'gifts', 'Clothes', 55000.0, 4.8, 38, '💑', 'Matching set of two custom sweethearts graphic t-shirts. Romantic couples premium gift pack.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Comes in twin luxury gift pouches.', 0, 0, 1),
      ('gift_clothes_hoodie', 'Hoodie', 'gifts', 'Clothes', 63000.0, 4.9, 85, '🧥', 'Ultra warm premium heavyweight cotton blend hoodie with double lined hoods.', 'physical', 'manual', 35, '', 'Sender Name, Receiver Name, Delivery Address', 'Indicate sizes S, M, L, XL, XXL.', 1, 0, 1),
      ('gift_clothes_knit_cap', 'Knit Cap', 'gifts', 'Clothes', 50000.0, 4.7, 24, '🧢', 'Cozy thermal rib-knit beanie cap customized with a personalized custom patch.', 'physical', 'manual', 60, '', 'Sender Name, Receiver Name, Delivery Address', 'One size fits all comfort stretch.', 0, 0, 0),
      ('gift_clothes_cap', 'Cap', 'gifts', 'Clothes', 50000.0, 4.6, 40, '🧢', 'Adjustable dynamic custom profile cap with solid back buckles.', 'physical', 'manual', 80, '', 'Sender Name, Receiver Name, Delivery Address', 'Unisex premium adjustments.', 0, 0, 0),
      ('gift_clothes_joggers', 'Joggers', 'gifts', 'Clothes', 60000.0, 4.7, 19, '👖', 'Super comfortable premium cotton joggers with adjustable drawstring waistbands.', 'physical', 'manual', 25, '', 'Sender Name, Receiver Name, Delivery Address', 'Tailored sleek fit.', 0, 0, 0),
      ('gift_clothes_shoes', 'Shoes', 'gifts', 'Clothes', 65000.0, 4.9, 44, '👟👠', 'Luxury custom athletic sneakers or high-heels in designer gift wrap boxes.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Input precise size measurements.', 1, 1, 1),
      
      ('gift_florist_flower_letter', 'Flower with Letter', 'gifts', 'Florist', 60000.0, 4.9, 53, '🌸', 'Stunning bouquet of fresh hand-tied local flowers accompanied by a wax-sealed card letter.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Direct delivery to receiver doorstep.', 1, 0, 1),
      ('gift_florist_glass_flower', 'Glass Flower', 'gifts', 'Florist', 65000.0, 4.8, 33, '🌹', 'Breathtaking handcrafted crystal glass rose inside a premium glass display dome with LED lights.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Operates on standard AAA batteries.', 0, 1, 1),
      ('gift_florist_teddy_letter', 'Teddy Bear with Letter', 'gifts', 'Florist', 75000.0, 4.9, 60, '🧸', 'Ultra soft premium plush teddy bear holding a custom wax-sealed greeting card letter.', 'physical', 'manual', 25, '', 'Sender Name, Receiver Name, Delivery Address', 'Highly requested romantic bundle.', 1, 0, 1),
      ('gift_florist_plant_letter', 'Plant with Letter', 'gifts', 'Florist', 60000.0, 4.7, 14, '🪴', 'Verdant air-purifying custom indoor potted plant with a premium instructions letter card.', 'physical', 'manual', 18, '', 'Sender Name, Receiver Name, Delivery Address', 'Hand-delivered potted node.', 0, 0, 0),
      ('gift_florist_chocolate', 'Premium Assorted Chocolates', 'gifts', 'Florist', 55000.0, 4.8, 80, '🍫', 'Indulgent imported Belgian assorted chocolates arranged in a heart-shaped luxury gift box.', 'physical', 'manual', 50, '', 'Sender Name, Receiver Name, Delivery Address', 'Delivered in cool thermal containers.', 0, 0, 1),
      ('gift_florist_cake', 'Cake', 'gifts', 'Florist', 55000.0, 4.9, 41, '🎂', 'Delicious freshly customized birthday or anniversary cake. Select chocolate or vanilla.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Indicate custom lettering text on cake.', 1, 1, 1),
      ('gift_florist_car_key', 'Luxury Car Key', 'gifts', 'Florist', 60000.0, 4.6, 8, '🔑', 'Premium high-end car remote fob key shells or customized keychains.', 'physical', 'manual', 10, '', 'Sender Name, Receiver Name, Delivery Address', 'Custom luxury key casing.', 0, 0, 0),
      ('gift_florist_tesla_key', 'Tesla Key', 'gifts', 'Florist', 165000.0, 5.0, 15, '🚗', 'Genuine Tesla smart key card or customized smart ring fob. Bypasses lock lines elegantly.', 'physical', 'manual', 5, '', 'Sender Name, Receiver Name, Delivery Address', 'Directly integrable with user Tesla nodes.', 1, 1, 0),
      
      ('gift_acc_ring', 'Ring', 'gifts', 'Accessories', 55000.0, 4.8, 22, '💍', 'Solid 925 sterling silver adjustable couples ring in a gorgeous velvet dome box.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Luxury ring presentation box.', 0, 0, 0),
      ('gift_acc_necklace', 'Necklace', 'gifts', 'Accessories', 55000.0, 4.9, 49, '📿', 'Dainty handcrafted silver pendant necklace. Highly durable and completely hypoallergenic.', 'physical', 'manual', 35, '', 'Sender Name, Receiver Name, Delivery Address', 'Comes with sterling silver chain.', 1, 0, 1),
      ('gift_acc_wristwatch', 'Wristwatch', 'gifts', 'Accessories', 70000.0, 4.9, 61, '⌚', 'Sleek luxury quartz wristwatch with customized leather strap options.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Includes premium watch box.', 1, 1, 1),
      ('gift_acc_birth_cert', 'Custom Birth Certificate Scroll', 'gifts', 'Accessories', 75000.0, 4.7, 10, '📄', 'Artistic calligraphy-printed personalized birth certificate scroll inside a metallic cylinder.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Dispatched securely via courier.', 0, 0, 0),
      ('gift_acc_huge_teddy', 'Huge Teddy Bear', 'gifts', 'Accessories', 110000.0, 5.0, 24, '🐻', 'Colossal 6-foot giant fluffy plush teddy bear. Unforgettable luxury surprise gift.', 'physical', 'manual', 5, '', 'Sender Name, Receiver Name, Delivery Address', 'Shipped in vacuum compressed logs.', 1, 0, 1),
      
      ('gift_book_novel', 'Book or Novel', 'gifts', 'Books & Documents', 5000.0, 4.8, 14, '📖', 'Gilded leather-bound classic novel or best-selling book of your choice.', 'physical', 'manual', 20, '', 'Sender Name, Receiver Name, Delivery Address', 'Include book title in order notes.', 0, 0, 0),
      ('gift_book_letter', 'Premium Letter Scroll', 'gifts', 'Books & Documents', 55000.0, 4.7, 30, '✉️', 'Hand-calligraphed premium scroll letter tied with velvet ribbon and sealed with wax.', 'physical', 'manual', 100, '', 'Sender Name, Receiver Name, Delivery Address', 'Premium vintage look scroll.', 0, 0, 0),
      ('gift_book_atm_card', 'ATM Card Shell Customizer', 'gifts', 'Books & Documents', 125000.0, 5.0, 31, '💳', 'Premium customized metal card skin casing shell to upgrade your debit/credit card.', 'physical', 'manual', 15, '', 'Sender Name, Receiver Name, Delivery Address', 'Indicate precise template desired.', 1, 1, 1),
      ('gift_book_certificate', 'Certificate Frame', 'gifts', 'Books & Documents', 85000.0, 4.8, 18, '📜', 'Premium customized certificate printing complete with dynamic high-end gold borders and wooden frames.', 'physical', 'manual', 30, '', 'Sender Name, Receiver Name, Delivery Address', 'Send photo/pdf details to customer support.', 1, 0, 1),
      ('gift_book_house_key', 'House Key casing', 'gifts', 'Books & Documents', 50000.0, 4.7, 12, '🗝️', 'Handcrafted premium brass key housing shell or personalized house warming keychain.', 'physical', 'manual', 25, '', 'Sender Name, Receiver Name, Delivery Address', 'Includes signature velvet pouches.', 0, 0, 0)`);

    // Clean inventory pool before seeding new credentials
    await dbRun("DELETE FROM inventory_pool");
    console.log("[AVS Database] Seeding real stock lines into inventory pool...");
    const pids = ['expressvpn', 'nordvpn', 'surfshark', 'pia', 'ipvanish', 'google_voice', 'textnow', 'textplus', 'talkatone', 'nextplus', 'apple_id', 'insta_acc', 'twitter_acc', 'fb_acc', 'netflix_premium'];
    for (const pid of pids) {
      await dbRun("INSERT INTO inventory_pool (product_id, credentials, status) VALUES (?, ?, 'available')", [pid, `avs_profile_${pid}_acc1@avslog.org|pass10ment123|recovery@avslog.org`]);
      await dbRun("INSERT INTO inventory_pool (product_id, credentials, status) VALUES (?, ?, 'available')", [pid, `avs_profile_${pid}_acc2@avslog.org|pass10ment123|recovery@avslog.org`]);
      await dbRun("INSERT INTO inventory_pool (product_id, credentials, status) VALUES (?, ?, 'available')", [pid, `avs_profile_${pid}_acc3@avslog.org|pass10ment123|recovery@avslog.org`]);
    }

    // Seed Banners
    await dbRun("DELETE FROM banners");
    await dbRun("INSERT INTO banners (id, title, description, image_url, cta_text, cta_url, order_index, active) VALUES ('banner1', 'AVS Super Secure Premium VPNs', 'Surf securely with military-grade NordVPN and ExpressVPN license keys.', '', 'Get Premium VPN Key', '', 1, 1)");
    await dbRun("INSERT INTO banners (id, title, description, image_url, cta_text, cta_url, order_index, active) VALUES ('banner2', 'Wholesale Gadgets Store', 'Acquire Grade-A smartphones, ANC earbuds and power docks in Naira.', '', 'Shop Gadgets', '', 2, 1)");

    // Seed General Tutorials
    await dbRun("DELETE FROM tutorials");
    await dbRun("INSERT INTO tutorials (id, title, type, product_id, video_url, written_guide, image_url, faq_json, order_index) VALUES ('tut1', 'How to Purchase VPN Subscriptions', 'general', '', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '1. Select your preferred VPN (ExpressVPN or NordVPN).\\n2. Click the Buy Now button.\\n3. Make payment using your wallet balance.\\n4. You will be instantly redirected to My Inventory.\\n5. Copy your license key and use the download link provided in the Setup Guide.', '', '[]', 1)");
    await dbRun("INSERT INTO tutorials (id, title, type, product_id, video_url, written_guide, image_url, faq_json, order_index) VALUES ('tut2', 'How to Order and Setup eSIM Profiles', 'general', '', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '1. Select UK eSIM or Canada eSIM.\\n2. Click Buy Now.\\n3. Input your full name, device model, and active email address.\\n4. Confirm your purchase.\\n5. The Admin Desk will verify and manually upload your eSIM profile QR code to your inventory dashboard. Scan the QR code with your phone to activate roaming signals instantly.', '', '[]', 2)");

    // Seed Support Links (Requirement 22 & specific URLs)
    await dbRun("DELETE FROM support_links");
    await dbRun("INSERT INTO support_links (id, title, url, icon, active, order_index) VALUES ('wa_dm', 'WhatsApp Direct Message (DM)', 'https://wa.me/message/TMI5BJAZ6IURG1', '🟢', 1, 1)");
    await dbRun("INSERT INTO support_links (id, title, url, icon, active, order_index) VALUES ('wa_channel', 'WhatsApp Channel Updates', 'https://whatsapp.com/channel/0029Vb8PyIdBKfhwifmKG03U', '📢', 1, 2)");
    await dbRun("INSERT INTO support_links (id, title, url, icon, active, order_index) VALUES ('tg_dm', 'Telegram Support Operator (DM)', 'https://t.me/Avslog', '✈️', 1, 3)");
    await dbRun("INSERT INTO support_links (id, title, url, icon, active, order_index) VALUES ('tg_channel', 'Telegram Official Channel', 'https://t.me/avslogs', '👥', 1, 4)");

    // Seed Sidebar Items (Requirement 9)
    await dbRun("DELETE FROM sidebar_items");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Dashboard', 'Dashboard', 'LayoutDashboard', 1, 1)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Wallet', 'AVS Wallet', 'Wallet', 1, 2)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('SMS Panel', 'Buy Number', 'Smartphone', 1, 3)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('SMM Panel', 'Social Media Growth', 'TrendingUp', 1, 4)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Marketplace', 'AVS Marketplace', 'ShoppingBag', 1, 5)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('My Gift Orders', 'My Gift Orders', 'Gift', 1, 6)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('My Inventory', 'My Inventory', 'Key', 1, 7)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Orders', 'Orders & Tracking', 'Package', 1, 8)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Transactions', 'Transactions', 'RefreshCw', 1, 9)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Notifications', 'Security & Alerts', 'Bell', 1, 10)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Profile', 'My Profile', 'User', 1, 11)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Settings', 'System Settings', 'Settings', 1, 12)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('How to Use', 'How to Use', 'HelpCircle', 1, 13)");
    await dbRun("INSERT INTO sidebar_items (id, label, icon, active, order_index) VALUES ('Support', 'Support', 'LifeBuoy', 1, 14)");

  }

  // Ensure the core payment-method rows ALWAYS exist (idempotent, runs on every boot so existing
  // databases get them too — not gated on any other seed block). Paystack / Paga / Recharge Code
  // default ENABLED so a fresh storefront has working funding options out of the box; Monnify and
  // Flutterwave default DISABLED until an admin configures + enables them.
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Paystack', 1, 'System', datetime('now'))");
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Paga Subsidiary Accounts', 1, 'System', datetime('now'))");
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Recharge Code', 1, 'System', datetime('now'))");
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Monnify', 0, 'System', datetime('now'))");
  await dbRun("INSERT OR IGNORE INTO payment_methods (name, enabled, updated_by, updated_at) VALUES ('Flutterwave', 0, 'System', datetime('now'))");

  // Seed Support Module defaults (Item 3) — only if empty
  const existContact = await dbGet("SELECT id FROM contact_methods LIMIT 1");
  if (!existContact) {
    await dbRun("INSERT INTO contact_methods (id, label, value, type, icon, active, order_index) VALUES ('email', 'Email Support', 'hello@avsnova.com', 'email', 'Mail', 1, 1)");
    await dbRun("INSERT INTO contact_methods (id, label, value, type, icon, active, order_index) VALUES ('whatsapp', 'WhatsApp', 'https://wa.me/2349016075160', 'link', 'MessageCircle', 1, 2)");
    await dbRun("INSERT INTO contact_methods (id, label, value, type, icon, active, order_index) VALUES ('telegram', 'Telegram Support', 'https://t.me/Avslog', 'link', 'Send', 1, 3)");
  }
  const existCommunity = await dbGet("SELECT id FROM community_links LIMIT 1");
  if (!existCommunity) {
    await dbRun("INSERT INTO community_links (id, label, url, icon, description, active, order_index) VALUES ('tg_channel', 'Telegram Channel', 'https://t.me/avslogs', 'Send', 'Official announcements & updates', 1, 1)");
    await dbRun("INSERT INTO community_links (id, label, url, icon, description, active, order_index) VALUES ('tg_group', 'Community Group', 'https://t.me/avslogs', 'Users', 'Chat with other AVShop users', 1, 2)");
  }
  const existFaq = await dbGet("SELECT id FROM faqs LIMIT 1");
  if (!existFaq) {
    await dbRun("INSERT INTO faqs (id, question, answer, active, order_index) VALUES ('f1', 'How do I fund my AVS wallet?', 'Open Fund Wallet and choose Paystack, Paga bank transfer, or redeem an AVS recharge code. Your balance updates instantly.', 1, 1)");
    await dbRun("INSERT INTO faqs (id, question, answer, active, order_index) VALUES ('f2', 'How long does an SMS number stay active?', 'A rented number waits for a verification code until the session timeout configured by the admin. If no code arrives, you are automatically refunded.', 1, 2)");
    await dbRun("INSERT INTO faqs (id, question, answer, active, order_index) VALUES ('f3', 'What happens if my SMM order is still processing?', 'Your wallet is debited immediately and the order is queued. Our team funds the provider and processing continues automatically until completion.', 1, 3)");
    await dbRun("INSERT INTO faqs (id, question, answer, active, order_index) VALUES ('f4', 'How do I get my purchased product credentials?', 'After purchase, go to My Inventory. Digital products deliver instantly; you can reveal and copy each credential securely.', 1, 4)");
  }

  // ——— Migrate the predefined Super Admin login to the current brand email (hello@avsnova.com) ———
  // Moves the seeded admin account from any prior default address to the new one so the operator
  // logs in with the correct email going forward. Safe & idempotent: only renames when the new
  // address isn't already taken. Custom/non-admin emails are left untouched.
  try {
    const TARGET = process.env.SUPER_ADMIN_EMAIL || "hello@avsnova.com";
    const newAdmin = await dbGet("SELECT id FROM users WHERE email = ?", [TARGET]);
    if (!newAdmin) {
      const legacyAdmin = await dbGet("SELECT id FROM users WHERE email IN ('hello@avslogs.org', 'hello@avslog.org') AND role = 'Super Admin' LIMIT 1");
      if (legacyAdmin) {
        await dbRun("UPDATE users SET email = ? WHERE id = ?", [TARGET, legacyAdmin.id]);
        console.log(`[Migration] Super Admin login email migrated to ${TARGET}`);
      }
    }
  } catch (err) { /* non-fatal */ }
  // Point the support contact method at the current brand support email.
  try { await dbRun("UPDATE contact_methods SET value = ? WHERE id = 'email' AND value IN ('hello@avslogs.org', 'hello@avslog.org')", [process.env.SUPER_ADMIN_EMAIL || "hello@avsnova.com"]); } catch (err) {}

  // ——— Rebrand migration: AUREVASHOP DIGITAL (AVS) / avsnova.com ———
  // Only updates values that are still on a KNOWN OLD DEFAULT, so an operator's custom branding
  // is never overwritten. Idempotent and safe to run on every boot.
  try {
    await dbRun("UPDATE settings SET site_name = 'AUREVASHOP DIGITAL (AVS)' WHERE site_name IS NULL OR site_name = '' OR site_name IN ('Aurevashop', 'Aureavashop', 'AVS Logs', 'AVSLogs')");
    await dbRun("UPDATE settings SET external_support_url = 'https://avsnova.com' WHERE external_support_url IS NULL OR external_support_url = '' OR external_support_url IN ('https://avslogs.org', 'https://avslog.org', 'http://avslogs.org')");
    await dbRun("UPDATE settings SET site_logo = '🛡️' WHERE site_logo IS NULL OR site_logo = ''");
  } catch (err) { /* non-fatal */ }

  // NOTE: A previous dev-only line here purged all non-admin users on every boot. That is
  // catastrophic in production (it would delete every real customer on restart), so it has been
  // REMOVED. Customer data now persists across restarts. (To wipe demo data on a fresh install,
  // do it manually/once — never automatically on boot.)

  // Seed default permissions for roles
  const existPerm = await dbGet("SELECT id FROM permissions LIMIT 1");
  if (!existPerm) {
    const nowStr = new Date().toISOString();
    await dbRun("INSERT INTO permissions (role, can_users, can_wallet, can_orders, can_sms, can_smm, can_api, can_logs, can_delete, can_settings, can_broadcast, can_profit, created_at) VALUES ('Super Admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?)", [nowStr]);
    await dbRun("INSERT INTO permissions (role, can_users, can_wallet, can_orders, can_sms, can_smm, can_api, can_logs, can_delete, can_settings, can_broadcast, can_profit, created_at) VALUES ('Finance Manager', 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, ?)", [nowStr]);
    await dbRun("INSERT INTO permissions (role, can_users, can_wallet, can_orders, can_sms, can_smm, can_api, can_logs, can_delete, can_settings, can_broadcast, can_profit, created_at) VALUES ('Support Staff', 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, ?)", [nowStr]);
    await dbRun("INSERT INTO permissions (role, can_users, can_wallet, can_orders, can_sms, can_smm, can_api, can_logs, can_delete, can_settings, can_broadcast, can_profit, created_at) VALUES ('API Manager', 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, ?)", [nowStr]);
    await dbRun("INSERT INTO permissions (role, can_users, can_wallet, can_orders, can_sms, can_smm, can_api, can_logs, can_delete, can_settings, can_broadcast, can_profit, created_at) VALUES ('Marketing Manager', 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, ?)", [nowStr]);
    console.log("Seeded Role-Based Access Control Permissions.");
  }

  // Seed default API health entries
  await dbRun("DELETE FROM api_health");
  const nowStr = new Date().toISOString();
  await dbRun("INSERT INTO api_health (provider, response_time, status, balance, uptime, priority, last_checked) VALUES ('JustAnotherPanel', 0, 'Offline', 0.00, 100.0, 1, ?)", [nowStr]);
  await dbRun("INSERT INTO api_health (provider, response_time, status, balance, uptime, priority, last_checked) VALUES ('GrizzlySMS', 0, 'Offline', 0.00, 100.0, 2, ?)", [nowStr]);

  // Seed default settings
  const existingSettings = await dbGet("SELECT id FROM settings LIMIT 1");
  if (!existingSettings) {
    await dbRun(
      "INSERT INTO settings (site_name, whatsapp_number, external_support_url, site_logo, maintenance_mode, paystack_public_key, paystack_secret_key, jap_api_url, jap_api_key, sms_api_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["AUREVASHOP DIGITAL (AVS)", "+2349016075160", "https://avsnova.com", "🛡️", 0, "", "", "https://justanotherpanel.com/api/v2", "", "https://api.grizzlysms.com/stubs/handler_api.php"]
    );
  } else {
    // Only backfill non-secret default endpoints when missing. NEVER overwrite payment/API keys —
    // those are managed via .env / the admin panel and must not be clobbered or hardcoded here.
    await dbRun("UPDATE settings SET jap_api_url = COALESCE(NULLIF(jap_api_url, ''), 'https://justanotherpanel.com/api/v2'), sms_api_url = COALESCE(NULLIF(sms_api_url, ''), 'https://api.grizzlysms.com/stubs/handler_api.php')");
  }

  // ——— Integration keys: .env is AUTHORITATIVE; placeholders only fill true blanks ———
  //
  // BACKGROUND / ROOT CAUSE FIX (regressions where real keys "disappeared"):
  //   Every key resolver in the app reads the DB `settings` column FIRST and the .env var only as
  //   a fallback. A previous version of this block seeded inert "REPLACE_ME" PLACEHOLDERS into any
  //   empty column. Once a placeholder was written, the column was no longer empty, so:
  //     (a) the placeholder was never refreshed, and
  //     (b) because DB wins over env, a REAL key later added to .env was PERMANENTLY SHADOWED by
  //         the stale placeholder — the operator's key silently never took effect.
  //
  // NEW BEHAVIOUR (per column, in priority order):
  //   1. If .env provides a real value  -> WRITE it into the DB (authoritative sync). This both
  //      un-shadows the key and heals any stale placeholder. .env is the single source of truth.
  //   2. Else if the DB already holds a real (non-empty, non-placeholder) value -> KEEP it. This
  //      preserves keys typed by the operator in Admin -> Settings.
  //   3. Else (column blank OR still a placeholder, and no env value) -> write an inert placeholder
  //      so the field stays VISIBLE/EDITABLE in the Admin Panel. Placeholders never authenticate.
  //
  // A value counts as a "placeholder" if it contains REPLACE_ME / _REPLACE / yourmailserver, or is
  // one of the specific inert defaults below. Real keys never match these patterns.
  try {
    // column -> { env: <ENV VAR NAME>, ph: <inert placeholder to show when nothing configured> }
    const KEY_MAP = {
      paystack_public_key:       { env: "PAYSTACK_PUBLIC_KEY",       ph: "pk_test_REPLACE_ME" },
      paystack_secret_key:       { env: "PAYSTACK_SECRET_KEY",       ph: "sk_test_REPLACE_ME" },
      monnify_api_key:           { env: "MONNIFY_API_KEY",           ph: "MK_TEST_REPLACE_ME" },
      monnify_secret_key:        { env: "MONNIFY_SECRET_KEY",        ph: "REPLACE_ME_MONNIFY_SECRET" },
      monnify_contract_code:     { env: "MONNIFY_CONTRACT_CODE",     ph: "0000000000" },
      paga_public_key:           { env: "PAGA_PUBLIC_KEY",           ph: "REPLACE_ME_PAGA_PUBLIC" },
      paga_secret_key:           { env: "PAGA_SECRET_KEY",           ph: "REPLACE_ME_PAGA_SECRET" },
      paga_hash_key:             { env: "PAGA_HASH_KEY",             ph: "REPLACE_ME_PAGA_HASH" },
      flutterwave_public_key:    { env: "FLUTTERWAVE_PUBLIC_KEY",    ph: "FLWPUBK_TEST-REPLACE_ME" },
      flutterwave_secret_key:    { env: "FLUTTERWAVE_SECRET_KEY",    ph: "FLWSECK_TEST-REPLACE_ME" },
      flutterwave_encryption_key:{ env: "FLUTTERWAVE_ENCRYPTION_KEY",ph: "FLWSECK_TEST_REPLACE" },
      jap_api_key:               { env: "JAP_API_KEY",               ph: "REPLACE_ME_JAP_API_KEY" },
      grizzly_api_key:           { env: "GRIZZLY_SMS_API_KEY",       ph: "REPLACE_ME_GRIZZLY_KEY" },
      fivesim_api_key:           { env: "FIVESIM_API_KEY",           ph: "REPLACE_ME_5SIM_KEY" },
      smspool_api_key:           { env: "SMSPOOL_API_KEY",           ph: "REPLACE_ME_SMSPOOL_KEY" },
      telegram_bot_token:        { env: "TELEGRAM_BOT_TOKEN",        ph: "REPLACE_ME_TELEGRAM_BOT_TOKEN" },
      telegram_webhook_secret:   { env: "TELEGRAM_WEBHOOK_SECRET",   ph: "REPLACE_ME_TELEGRAM_WEBHOOK_SECRET" },
      smtp_host:                 { env: "SMTP_HOST",                 ph: "smtp.yourmailserver.com" },
      smtp_user:                 { env: "SMTP_USER",                 ph: "no-reply@avsnova.com" },
      smtp_pass:                 { env: "SMTP_PASS",                 ph: "REPLACE_ME_SMTP_PASSWORD" },
      smtp_from:                 { env: "SMTP_FROM",                 ph: "AVS Nova <no-reply@avsnova.com>" },
    };
    // True if a stored value is one of our inert placeholders (never a real key).
    const isPlaceholder = (v) => {
      if (v == null) return true;
      const s = String(v).trim();
      if (s === "") return true;
      return /REPLACE_ME|_REPLACE\b|yourmailserver\.com/i.test(s)
        || s === "0000000000"
        || s === "no-reply@avsnova.com"
        || s === "AVS Nova <no-reply@avsnova.com>";
    };
    const existing = (await dbGet("SELECT * FROM settings LIMIT 1")) || {};
    let syncedFromEnv = 0, healedPlaceholders = 0;
    for (const [col, { env, ph }] of Object.entries(KEY_MAP)) {
      const envVal = process.env[env] != null ? String(process.env[env]).trim() : "";
      const dbVal  = existing[col];
      try {
        if (envVal !== "") {
          // (1) .env is authoritative — always sync the real value into the DB.
          if (String(dbVal ?? "") !== envVal) {
            await dbRun(`UPDATE settings SET ${col} = ? WHERE 1=1`, [envVal]);
            syncedFromEnv++;
          }
        } else if (isPlaceholder(dbVal)) {
          // (3) No env value and DB is blank/placeholder — (re)write the inert placeholder so the
          //     field stays visible/editable. Does NOT touch real admin-entered values (case 2).
          if (String(dbVal ?? "") !== ph) {
            await dbRun(`UPDATE settings SET ${col} = ? WHERE 1=1`, [ph]);
            healedPlaceholders++;
          }
        }
        // (2) envVal empty AND dbVal is a real value -> leave it exactly as-is.
      } catch (e) { /* column may not exist on very old schemas */ }
    }
    if (syncedFromEnv > 0) {
      console.log(`[Seed] Integration keys: synced ${syncedFromEnv} real value(s) from .env into settings (env is authoritative; any stale placeholders overwritten).`);
    }
    if (healedPlaceholders > 0) {
      console.log(`[Seed] Integration keys: ${healedPlaceholders} unconfigured field(s) show inert placeholders (editable in Admin -> Settings).`);
    }
  } catch (err) { console.warn("[Seed] integration key sync skipped:", err.message); }

  // ============================================================================
  //  SECURITY CENTER — PHASE 2: EMAIL VERIFICATION
  //  Provider profiles + mailbox accounts + per-credential matching rules + logs.
  //  All additive & backward compatible. Passwords stored ENCRYPTED (AES-256-GCM).
  // ============================================================================

  // Reusable email provider connection profiles (templates for mailboxes).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS email_providers (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      imap_host VARCHAR(255) DEFAULT '',
      imap_port INTEGER DEFAULT 993,
      smtp_host VARCHAR(255) DEFAULT '',
      smtp_port INTEGER DEFAULT 587,
      username VARCHAR(255) DEFAULT '',
      password_enc TEXT,
      use_ssl INTEGER DEFAULT 1,
      sender_name VARCHAR(255) DEFAULT '',
      sender_email VARCHAR(255) DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  // Item 6: connection verification state — a connection must pass a real test-OTP
  // round-trip before it's marked usable/active.
  try { await dbRun("ALTER TABLE email_providers ADD COLUMN verified INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE email_providers ADD COLUMN verify_status TEXT DEFAULT 'unverified'"); } catch (err) {}
  try { await dbRun("ALTER TABLE email_providers ADD COLUMN verified_at TEXT DEFAULT ''"); } catch (err) {}

  // Mailboxes — one email account the system can read (IMAP) and send from (SMTP).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS mailboxes (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email_address VARCHAR(255) DEFAULT '',
      provider_id INTEGER,
      imap_host VARCHAR(255) DEFAULT '',
      imap_port INTEGER DEFAULT 993,
      imap_secure INTEGER DEFAULT 1,
      smtp_host VARCHAR(255) DEFAULT '',
      smtp_port INTEGER DEFAULT 587,
      smtp_secure INTEGER DEFAULT 0,
      username VARCHAR(255) DEFAULT '',
      password_enc TEXT,
      sender_name VARCHAR(255) DEFAULT '',
      sender_email VARCHAR(255) DEFAULT '',
      enabled INTEGER DEFAULT 1,
      status VARCHAR(64) DEFAULT 'unknown',
      last_sync VARCHAR(255),
      last_error TEXT,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // Email verification activity log (audit trail for admins + customers).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS email_verify_activity (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      mailbox_id INTEGER,
      credential_id INTEGER,
      order_id VARCHAR(255),
      user_id INTEGER,
      action VARCHAR(64) NOT NULL,
      status VARCHAR(32) DEFAULT 'ok',
      detail TEXT,
      ip_address VARCHAR(64),
      actor VARCHAR(255),
      created_at VARCHAR(255) NOT NULL
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_email_activity_cred ON email_verify_activity(credential_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_email_activity_mailbox ON email_verify_activity(mailbox_id)"); } catch (err) {}

  // Per-credential email verification config (reuses auth_enabled/auth_type = 'email').
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_mailbox_id INTEGER"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_sender VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_subject_keywords TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_body_keywords TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_max_age INTEGER DEFAULT 600"); } catch (err) {}
  // Advanced email-matching rules (per credential).
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_ignore_keywords TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_regex TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_otp_length INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_extract_link INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_alt_address VARCHAR(255)"); } catch (err) {}
  // Email Code Retrieval — per-credential mailbox (the PURCHASED email's own inbox).
  // When email_verify_mode = 'self' the system reads the purchased mailbox directly
  // using these IMAP settings; 'shared' uses email_verify_mailbox_id (admin mailbox).
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_mode VARCHAR(16) DEFAULT 'self'"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_address VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_password_enc TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_imap_host VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_imap_port INTEGER DEFAULT 993"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_imap_secure INTEGER DEFAULT 1"); } catch (err) {}
  // Email Parsing Engine (advanced): recipient matching, sender-domain, forwarded-email
  // handling, unread prioritization, and used-email de-duplication.
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_recipient VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_sender_domain VARCHAR(255)"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_forwarded INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_prefer_unread INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_link_only INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_ignore_used INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE inventory_pool ADD COLUMN email_verify_last_uid VARCHAR(64)"); } catch (err) {}

  // Global SMTP/IMAP settings (extend the settings table; used as fallback for sendEmail).
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_secure INTEGER DEFAULT 0"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN smtp_sender_name TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN imap_host TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN imap_port INTEGER DEFAULT 993"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN imap_secure INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN email_enabled INTEGER DEFAULT 1"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN email_default_max_age INTEGER DEFAULT 600"); } catch (err) {}
  // POP3 (optional incoming) global config.
  try { await dbRun("ALTER TABLE settings ADD COLUMN pop3_host TEXT"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN pop3_port INTEGER DEFAULT 995"); } catch (err) {}
  try { await dbRun("ALTER TABLE settings ADD COLUMN pop3_secure INTEGER DEFAULT 1"); } catch (err) {}

  // ——— Customer Feedback popup — fully admin-controlled ———
  try { await dbRun("ALTER TABLE settings ADD COLUMN feedback_enabled INTEGER DEFAULT 1"); } catch (err) {}          // master on/off for the feedback popup
  try { await dbRun("ALTER TABLE settings ADD COLUMN feedback_delay_seconds INTEGER DEFAULT 4"); } catch (err) {}    // delay before the popup appears after a code is received
  try { await dbRun("ALTER TABLE settings ADD COLUMN feedback_timeout_seconds INTEGER DEFAULT 0"); } catch (err) {}  // auto-dismiss after N seconds (0 = never auto-close)
  try { await dbRun("ALTER TABLE settings ADD COLUMN feedback_required INTEGER DEFAULT 0"); } catch (err) {}         // 1 = customer cannot close without submitting (still one-per-order)
  try { await dbRun("ALTER TABLE settings ADD COLUMN feedback_position TEXT DEFAULT 'bottom-left'"); } catch (err) {} // where the popup renders

  // One-time seed of email defaults FROM ENVIRONMENT into the settings table when the
  // SMTP host has never been configured. Values remain fully editable from the Admin
  // Dashboard afterwards — nothing is hardcoded in application logic.
  try {
    let row = await dbGet("SELECT id, smtp_host FROM settings LIMIT 1");
    if (!row) { await dbRun("INSERT INTO settings (site_name) VALUES ('AUREVASHOP DIGITAL (AVS)')"); row = await dbGet("SELECT id, smtp_host FROM settings LIMIT 1"); }
    if (row && (!row.smtp_host || row.smtp_host === "")) {
      const e = process.env;
      if (e.SMTP_HOST || e.SMTP_USER) {
        await dbRun(
          `UPDATE settings SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_sender_name = ?,
             imap_host = ?, imap_port = ?, imap_secure = ?, pop3_host = ?, pop3_port = ?, pop3_secure = ?, email_enabled = 1 WHERE id = ?`,
          [
            e.SMTP_HOST || "mail.spacemail.com",
            parseInt(e.SMTP_PORT) || 465,
            e.SMTP_SECURE != null ? (parseInt(e.SMTP_SECURE) ? 1 : 0) : (parseInt(e.SMTP_PORT) === 465 ? 1 : 0),
            e.SMTP_USER || "",
            e.SMTP_PASS || "",
            e.SMTP_FROM || (e.SMTP_USER ? `"${e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)"}" <${e.SMTP_USER}>` : ""),
            e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)",
            e.IMAP_HOST || e.SMTP_HOST || "mail.spacemail.com",
            parseInt(e.IMAP_PORT) || 993,
            e.IMAP_SECURE != null ? (parseInt(e.IMAP_SECURE) ? 1 : 0) : 1,
            e.POP3_HOST || e.SMTP_HOST || "mail.spacemail.com",
            parseInt(e.POP3_PORT) || 995,
            e.POP3_SECURE != null ? (parseInt(e.POP3_SECURE) ? 1 : 0) : 1,
            row.id,
          ]
        );
        console.log("[Email Service] Seeded email settings from environment into the settings table (editable in Admin Dashboard).");
      }
    }
  } catch (err) { console.error("[Email Service] Env→DB email seed skipped:", err.message); }

  // Keep the persisted SMTP sender in sync with .env: if SMTP_USER is set in the environment and
  // differs from what's stored, update the live sender fields (host/port/secure/user/pass/from/
  // sender). This makes .env the reliable source of truth for outgoing mail — changing the SMTP
  // credentials in .env and restarting updates the sender without any manual DB edits. Values
  // stay editable in the Admin Dashboard afterwards.
  try {
    const e = process.env;
    if (e.SMTP_USER) {
      const cur = await dbGet("SELECT id, smtp_user FROM settings LIMIT 1");
      if (cur && String(cur.smtp_user || "").toLowerCase() !== String(e.SMTP_USER).toLowerCase()) {
        await dbRun(
          "UPDATE settings SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_sender_name = ?, email_enabled = 1 WHERE id = ?",
          [
            e.SMTP_HOST || "mail.spacemail.com",
            parseInt(e.SMTP_PORT) || 465,
            e.SMTP_SECURE != null ? (parseInt(e.SMTP_SECURE) ? 1 : 0) : (parseInt(e.SMTP_PORT) === 465 ? 1 : 0),
            e.SMTP_USER,
            e.SMTP_PASS || "",
            e.SMTP_FROM || `"${e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)"}" <${e.SMTP_USER}>`,
            e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)",
            cur.id,
          ]
        );
        console.log(`[Email Service] Synced persisted SMTP sender to ${e.SMTP_USER} from environment.`);
      }
    }
  } catch (err) { console.error("[Email Service] SMTP env-sync skipped:", err.message); }

  // Migrate the persisted MAIN SMTP sender to hello@avslogs.org if it still points at the
  // retired bluewaveglobal account. The old account is repurposed for internal OTP testing.
  try {
    const s = await dbGet("SELECT id, smtp_user FROM settings LIMIT 1");
    const e = process.env;
    if (s && s.smtp_user && String(s.smtp_user).toLowerCase().includes("bluewaveglobal") && (e.SMTP_USER || e.SMTP_HOST)) {
      await dbRun(
        "UPDATE settings SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_sender_name = ?, imap_host = ?, imap_port = ?, imap_secure = 1 WHERE id = ?",
        [
          e.SMTP_HOST || "mail.spacemail.com",
          parseInt(e.SMTP_PORT) || 465,
          e.SMTP_SECURE != null ? (parseInt(e.SMTP_SECURE) ? 1 : 0) : 1,
          e.SMTP_USER || "",
          e.SMTP_PASS || "",
          e.SMTP_FROM || (e.SMTP_USER ? `"${e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)"}" <${e.SMTP_USER}>` : ""),
          e.SMTP_SENDER_NAME || "AUREVASHOP DIGITAL (AVS)",
          e.IMAP_HOST || e.SMTP_HOST || "mail.spacemail.com",
          parseInt(e.IMAP_PORT) || 993,
          s.id,
        ]
      );
      console.log("[Email Service] Migrated main SMTP sender from the retired account using environment credentials.");
    }
  } catch (err) { console.error("[Email Service] Main SMTP migration skipped:", err.message); }

  // Seed the internal TEST/OTP-verification connection (old creds) as an email_providers
  // row so admins can run real-time OTP tests against it. Idempotent by username.
  try {
    const e = process.env;
    if (e.TEST_SMTP_USER) {
      const existing = await dbGet("SELECT id FROM email_providers WHERE username = ?", [e.TEST_SMTP_USER]);
      if (!existing) {
        const now = new Date().toISOString();
        // password stored via the same encryption used elsewhere is done in index.js on create;
        // for the seed we store it plainly-encrypted-compatible using a marker the app re-encrypts.
        await dbRun(
          `INSERT INTO email_providers (name, imap_host, imap_port, smtp_host, smtp_port, username, password_enc, use_ssl, sender_name, sender_email, enabled, verified, verify_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 0, 'unverified', ?, ?)`,
          ["Internal OTP Test (BlueWave)", e.TEST_IMAP_HOST || "mail.spacemail.com", parseInt(e.TEST_IMAP_PORT) || 993,
           e.TEST_SMTP_HOST || "mail.spacemail.com", parseInt(e.TEST_SMTP_PORT) || 465, e.TEST_SMTP_USER,
           "__ENV_TEST_SMTP_PASS__", "Aurevashop OTP Test", e.TEST_SMTP_USER, now, now]
        );
        console.log("[Email Service] Seeded internal OTP-test connection (BlueWave) into email_providers.");
      }
    }
  } catch (err) { console.error("[Email Service] Test connection seed skipped:", err.message); }

  // SMTP aliases — alternate sender addresses under the SAME authenticated account.
  // Admin assigns which alias is used for which purpose (otp, notifications, marketing…).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS smtp_aliases (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      label VARCHAR(255) NOT NULL,
      from_name VARCHAR(255) DEFAULT 'AUREVASHOP DIGITAL (AVS)',
      from_email VARCHAR(255) NOT NULL,
      purpose VARCHAR(64) DEFAULT 'general',
      enabled INTEGER DEFAULT 1,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  // Seed the default main-sender alias so mail has a sensible from identity out of the box.
  try {
    const anyAlias = await dbGet("SELECT id FROM smtp_aliases LIMIT 1");
    if (!anyAlias) {
      const now = new Date().toISOString();
      await dbRun("INSERT INTO smtp_aliases (label, from_name, from_email, purpose, enabled, created_at, updated_at) VALUES ('Main Sender', 'AUREVASHOP DIGITAL (AVS)', 'hello@avsnova.com', 'general', 1, ?, ?)", [now, now]);
      await dbRun("INSERT INTO smtp_aliases (label, from_name, from_email, purpose, enabled, created_at, updated_at) VALUES ('Notifications', 'AUREVASHOP DIGITAL (AVS)', 'hello@avsnova.com', 'notifications', 1, ?, ?)", [now, now]);
      await dbRun("INSERT INTO smtp_aliases (label, from_name, from_email, purpose, enabled, created_at, updated_at) VALUES ('Marketing', 'AUREVASHOP DIGITAL (AVS)', 'hello@avsnova.com', 'marketing', 1, ?, ?)", [now, now]);
    }
  } catch (err) { /* non-fatal */ }

  // ——— Batch 4 (Item 10): Refunds, Customer Reports/Support, Feedback, Custom Settings ———
  await dbRun(`
    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      order_id VARCHAR(64),
      user_id INTEGER,
      amount REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      status VARCHAR(32) DEFAULT 'pending',
      notes TEXT DEFAULT '',
      requested_by VARCHAR(255) DEFAULT '',
      processed_by VARCHAR(255) DEFAULT '',
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS customer_reports (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      customer_name VARCHAR(255) DEFAULT '',
      customer_email VARCHAR(255) DEFAULT '',
      order_id VARCHAR(64) DEFAULT '',
      product_id VARCHAR(64) DEFAULT '',
      category VARCHAR(64) DEFAULT 'general',
      subject VARCHAR(255) DEFAULT '',
      message TEXT DEFAULT '',
      status VARCHAR(32) DEFAULT 'open',
      priority VARCHAR(32) DEFAULT 'normal',
      admin_reply TEXT DEFAULT '',
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS purchase_feedback (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER,
      order_id VARCHAR(64) DEFAULT '',
      product_id VARCHAR(64) DEFAULT '',
      rating INTEGER DEFAULT 0,
      comment TEXT DEFAULT '',
      created_at VARCHAR(255)
    )
  `);
  // Persisted feedback dismissals — when a customer closes the popup for an order we remember it
  // server-side so it NEVER shows again for that order (survives refresh, logout/login, revisits).
  // The UNIQUE (user_id, order_id) pair makes each dismissal idempotent.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS feedback_dismissals (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER NOT NULL,
      order_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(255),
      UNIQUE(user_id, order_id)
    )
  `);
  // Custom settings — admin-defined key/value toggles/values beyond the built-in ones.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS custom_settings (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      skey VARCHAR(128) UNIQUE NOT NULL,
      label VARCHAR(255) DEFAULT '',
      stype VARCHAR(32) DEFAULT 'toggle',
      svalue TEXT DEFAULT '1',
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // Settings rollback / recovery (Item 11): a snapshot of the full settings row is stored
  // before every admin settings change so any previous configuration can be restored in one
  // click from the Admin Panel. Kept trimmed to the most recent N restore points.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot TEXT NOT NULL,
      changed_by VARCHAR(255) DEFAULT 'Admin',
      change_note VARCHAR(255) DEFAULT '',
      created_at VARCHAR(255)
    )
  `);

  // Dynamic checkout fields (Item 2): admin-managed per-module checkout form fields so no code
  // change is ever needed to add/edit/remove/reorder checkout inputs.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS checkout_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module VARCHAR(64) NOT NULL,
      field_key VARCHAR(128) NOT NULL,
      label VARCHAR(255) NOT NULL,
      type VARCHAR(32) DEFAULT 'text',
      placeholder VARCHAR(255) DEFAULT '',
      help_text VARCHAR(255) DEFAULT '',
      options TEXT DEFAULT '',
      required INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // Editable SMM instructions (Item 6): admin-managed instruction blocks shown on the SMM
  // order page. No code change needed to create/edit/enable/disable them.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS smm_instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) DEFAULT '',
      body TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // SMS Panel instruction blocks — admin-managed content shown on the customer SMS page
  // (purchase guidelines, refund policy, waiting info, etc.). Same shape as smm_instructions.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) DEFAULT '',
      body TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at VARCHAR(255),
      updated_at VARCHAR(255)
    )
  `);

  // Referral / affiliate program: one row per (referrer → referred) relationship. Tracks the
  // lifecycle pending → qualified → rewarded so the inviter's bonus is paid exactly once.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL UNIQUE,
      code VARCHAR(255),
      status VARCHAR(16) DEFAULT 'pending',
      referrer_bonus REAL DEFAULT 0,
      signup_bonus REAL DEFAULT 0,
      qualified_at VARCHAR(255),
      rewarded_at VARCHAR(255),
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("ALTER TABLE users ADD COLUMN referred_by INTEGER"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status)"); } catch (err) {}

  // Telegram bot: authorized staff (chat_id ↔ optional platform user), role-gated. Only chats
  // listed here (active=1) may receive alerts or perform actions — RBAC for the bot.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS telegram_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id VARCHAR(64) NOT NULL UNIQUE,
      username VARCHAR(255),
      display_name VARCHAR(255),
      user_id INTEGER,
      role VARCHAR(32) DEFAULT 'viewer',
      active INTEGER DEFAULT 1,
      created_at VARCHAR(255),
      last_action_at VARCHAR(255)
    )
  `);
  // Telegram action/audit log: every inbound command, callback, and alert dispatch.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS telegram_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id VARCHAR(64),
      staff_name VARCHAR(255),
      direction VARCHAR(16),
      action VARCHAR(64),
      detail TEXT,
      status VARCHAR(16) DEFAULT 'ok',
      created_at VARCHAR(255)
    )
  `);
  // Self-service linking: a staff member generates a one-time code from the web dashboard,
  // then sends /link <code> to the bot to bind their Telegram chat to their platform account.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      code VARCHAR(16) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role VARCHAR(32) DEFAULT 'viewer',
      expires_at VARCHAR(255),
      used INTEGER DEFAULT 0,
      created_at VARCHAR(255)
    )
  `);
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_tgstaff_chat ON telegram_staff(chat_id)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_tglog_created ON telegram_log(id)"); } catch (err) {}
  // Pending conversational input state (e.g. "next message is the fulfillment delivery data").
  try { await dbRun("ALTER TABLE telegram_staff ADD COLUMN pending_action VARCHAR(64)"); } catch (err) {}
  try { await dbRun("ALTER TABLE telegram_staff ADD COLUMN pending_ref VARCHAR(64)"); } catch (err) {}
  try { await dbRun("ALTER TABLE telegram_staff ADD COLUMN pending_at VARCHAR(255)"); } catch (err) {}

  // Integration sync log (Item 3): records every provider sync attempt (services, prices,
  // balance, order-status) with ok/fail status + detail so admins have full visibility and
  // failures can trigger alerts. Trimmed periodically to stay small.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider VARCHAR(64) NOT NULL,
      kind VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL,
      detail TEXT DEFAULT '',
      created_at VARCHAR(255)
    )
  `);

  // Item 10: indexes for the batch-added tables (public reads on module/enabled/order).
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_checkout_fields_module ON checkout_fields(module, enabled, order_index)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_smm_instructions_enabled ON smm_instructions(enabled, order_index)"); } catch (err) {}
  try { await dbRun("CREATE INDEX IF NOT EXISTS idx_sync_log_provider_kind ON sync_log(provider, kind, id)"); } catch (err) {}

  // Seed single predefined Super Admin account. Check for ANY existing Super Admin (by role or the
  // target/legacy emails) so we never create a duplicate on an existing database.
  const existingSuperAdmin = await dbGet(
    "SELECT * FROM users WHERE role = 'Super Admin' OR email IN (?, 'hello@avslogs.org', 'hello@avslog.org') LIMIT 1",
    [process.env.SUPER_ADMIN_EMAIL || "hello@avsnova.com"]
  );
  if (!existingSuperAdmin) {
    // Super Admin credentials come from env when provided (recommended). If SUPER_ADMIN_PASSWORD
    // is NOT set, we STILL seed a working admin using a safe default password so a fresh install
    // is never left without a way to log in. The credentials are printed prominently on first
    // creation and MUST be changed immediately after first login.
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || "hello@avsnova.com";
    const fromEnv = !!process.env.SUPER_ADMIN_PASSWORD;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe!Admin123";
    const hashed = await bcrypt.hash(String(adminPassword), 12);
    await dbRun(
      "INSERT INTO users (username, email, password, name, wallet_balance, role) VALUES (?, ?, ?, ?, ?, 'Super Admin')",
      ["superadmin", adminEmail, hashed, "Super Admin", 0.0]
    );
    if (fromEnv) {
      console.log(`[Seed] Super Admin created: ${adminEmail} (password from SUPER_ADMIN_PASSWORD env, bcrypt-hashed).`);
    } else {
      console.log("\n" + "=".repeat(66));
      console.log("[Seed] DEFAULT SUPER ADMIN CREATED (no SUPER_ADMIN_PASSWORD was set)");
      console.log(`        Email:    ${adminEmail}`);
      console.log(`        Password: ${adminPassword}`);
      console.log("        ⚠  CHANGE THIS PASSWORD IMMEDIATELY after your first login,");
      console.log("           or set SUPER_ADMIN_PASSWORD in .env before first boot.");
      console.log("=".repeat(66) + "\n");
    }
  } else if (String(process.env.ADMIN_PASSWORD_RESET || "").toLowerCase() === "true" && process.env.SUPER_ADMIN_PASSWORD) {
    // RECOVERY: an admin already exists but you're locked out. Set ADMIN_PASSWORD_RESET=true and
    // SUPER_ADMIN_PASSWORD (+ optionally SUPER_ADMIN_EMAIL) in .env, restart ONCE, then log in and
    // REMOVE the flag. This force-resets the existing Super Admin's email + password from env.
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || existingSuperAdmin.email;
    const hashed = await bcrypt.hash(String(process.env.SUPER_ADMIN_PASSWORD), 12);
    await dbRun("UPDATE users SET email = ?, password = ? WHERE id = ?", [adminEmail, hashed, existingSuperAdmin.id]);
    console.log("\n" + "=".repeat(66));
    console.log("[Recovery] ADMIN_PASSWORD_RESET applied — Super Admin credentials reset from .env:");
    console.log(`        Email:    ${adminEmail}`);
    console.log("        Password: (the SUPER_ADMIN_PASSWORD you set in .env)");
    console.log("        ⚠  Now REMOVE ADMIN_PASSWORD_RESET from .env and restart.");
    console.log("=".repeat(66) + "\n");
  }

  // ——— ASYNCHRONOUS LIVE SMM CATALOG BACKGROUND SEEDER ———
  setTimeout(async () => {
    console.log("[SMM Background Seeder] Initiating live JAP API sync on startup...");
    try {
      // Credentials come from settings (admin panel) first, then env — NEVER hardcoded.
      const cfgRow = await dbGet("SELECT jap_api_url, jap_api_key FROM settings LIMIT 1").catch(() => null);
      const url = (cfgRow && cfgRow.jap_api_url) || process.env.JAP_API_URL || "https://justanotherpanel.com/api/v2";
      const japKey = (cfgRow && cfgRow.jap_api_key) || process.env.JAP_API_KEY || "";
      if (!japKey) {
        console.log("[SMM Background Seeder] No JAP_API_KEY configured — skipping live sync (set it in .env or the admin panel).");
        return;
      }
      const form = new URLSearchParams();
      form.append("key", japKey);
      form.append("action", "services");

      const res = await fetch(url, { method: "POST", body: form });
      const rawServices = await res.json();

      if (rawServices && Array.isArray(rawServices)) {
        console.log(`[SMM Background Seeder] Successfully pulled ${rawServices.length} live SMM services. Syncing database...`);
        await dbRun("DELETE FROM services WHERE type = 'SMM'");

        for (const s of rawServices) {
          const srvId = `smm_${s.service}`;
          const rawPriceUsd = parseFloat(s.rate) || 0.0;
          const catId = `smm_${String(s.category).toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

          await dbRun(
            "INSERT INTO categories (id, name, type) VALUES (?, ?, 'smm') ON CONFLICT(id) DO NOTHING",
            [catId, s.category]
          );

          await dbRun(
            "INSERT INTO services (id, name, category_id, type, price, api_service_id, description, min_order, max_order, refill_support, cancel_support, status, created_at) VALUES (?, ?, ?, 'SMM', ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now')) ON CONFLICT(id) DO NOTHING",
            [srvId, s.name, catId, rawPriceUsd, String(s.service), `Provider: JustAnotherPanel · Type: ${s.type}`, parseInt(s.min) || 100, parseInt(s.max) || 50000, s.refill ? 1 : 0, s.cancel ? 1 : 0]
          );
        }
        console.log(`[SMM Background Seeder] Synchronization completed successfully! SMM services imported.`);
      }
    } catch (err) {
      console.warn("[SMM Background Seeder] Synchronizer failed on boot:", err.message);
      console.log("[SMM Background Seeder] Seeding high-fidelity SMM fallback catalog...");
      
      const categories = [
        { id: "smm_instagram", name: "Instagram Growth" },
        { id: "smm_tiktok", name: "TikTok Booster" },
        { id: "smm_youtube", name: "YouTube Subscribers" },
        { id: "smm_twitter", name: "Twitter / X Accounts" }
      ];

      const services = [
        { id: "smm_1", name: "Instagram Real Premium Followers", catId: "smm_instagram", price: 0.85, serviceId: "1", type: "Default" },
        { id: "smm_2", name: "Instagram Organic Likes (High Impression)", catId: "smm_instagram", price: 0.28, serviceId: "2", type: "Default" },
        { id: "smm_3", name: "TikTok High Retention Views + Explore", catId: "smm_tiktok", price: 0.18, serviceId: "3", type: "Default" },
        { id: "smm_4", name: "TikTok Real Active Followers", catId: "smm_tiktok", price: 0.95, serviceId: "4", type: "Default" },
        { id: "smm_5", name: "YouTube High Retention Views (Monetizable)", catId: "smm_youtube", price: 1.65, serviceId: "5", type: "Default" },
        { id: "smm_6", name: "Twitter/X Real Followers", catId: "smm_twitter", price: 1.10, serviceId: "6", type: "Default" }
      ];

      for (const c of categories) {
        await dbRun("INSERT INTO categories (id, name, type) VALUES (?, ?, 'smm') ON CONFLICT(id) DO NOTHING", [c.id, c.name]);
      }

      for (const s of services) {
        await dbRun(
          "INSERT INTO services (id, name, category_id, type, price, api_service_id, description, min_order, max_order, refill_support, cancel_support, status, created_at) VALUES (?, ?, ?, 'SMM', ?, ?, ?, 100, 50000, 1, 1, 'active', datetime('now')) ON CONFLICT(id) DO NOTHING",
          [s.id, s.name, s.catId, s.price, s.serviceId, `Provider: JustAnotherPanel · Type: ${s.type}`]
        );
      }
      console.log("[SMM Background Seeder] Successfully preloaded SMM categories and services fallback!");
    }
  }, 100);

  // ——— ASYNCHRONOUS LIVE SMS CATALOG BACKGROUND SEEDER (Requirement 5!) ———
  setTimeout(async () => {
    console.log("[SMS Background Seeder] Initiating live GrizzlySMS preloading sync on startup...");
    try {
      const pricesUrl = "https://api.grizzlysms.com/stubs/handler_api.php?api_key=f502c10b7d5a89b00981b25d0631cc42&action=getPrices";
      const pricesRes = await fetch(pricesUrl);
      const pricesData = await pricesRes.json();

      const countriesUrl = "https://api.grizzlysms.com/stubs/handler_api.php?api_key=f502c10b7d5a89b00981b25d0631cc42&action=getCountries";
      const countriesRes = await fetch(countriesUrl);
      const countriesData = await countriesRes.json();

      if (pricesData && typeof pricesData === "object" && countriesData && typeof countriesData === "object") {
        console.log("[SMS Background Seeder] Dynamic preloading catalog data resolved. Syncing local tables...");

        // Wipe tables before synchronizing to prevent any dirty codes (Requirement 1 & 2!)
        await dbRun("DELETE FROM sms_countries");
        await dbRun("DELETE FROM sms_services");

        // Insert / Update countries
        const flagMap = { "0": "🇷🇺", "1": "🇺🇦", "2": "🇰🇿", "12": "🇺🇸", "16": "🇬🇧", "19": "🇳🇬", "22": "🇮🇳", "36": "🇨🇦" };
        const activeCountryIds = Object.keys(pricesData);

        for (const countryId of activeCountryIds) {
          const countryNode = countriesData[countryId];
          let countryName = countryNode ? countryNode.eng : `Country #${countryId}`;
          if (countryId === "12") countryName = "USA Server 1";
          const flag = flagMap[countryId] || "🌐";

          // Upsert Country
          await dbRun(
            "INSERT INTO sms_countries (id, name, flag, active) VALUES (?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET name = excluded.name, flag = excluded.flag, active = 1",
            [countryId, countryName, flag]
          );

          if (countryId === "12") {
            // Also seed USA Server 2
            await dbRun(
              "INSERT INTO sms_countries (id, name, flag, active) VALUES ('12_2', 'USA Server 2', '🇺🇸', 1) ON CONFLICT(id) DO UPDATE SET name = excluded.name, flag = excluded.flag, active = 1"
            );
          }

          // Sync Services node
          const servicesNode = pricesData[countryId];
          if (servicesNode && typeof servicesNode === "object") {
            const serviceNamesMap = {
              "wa": { name: "WhatsApp", icon: "🟢" },
              "tg": { name: "Telegram", icon: "✈️" },
              "ds": { name: "Discord", icon: "👾" },
              "tw": { name: "Twitter / X", icon: "🐦" },
              "fb": { name: "Facebook", icon: "🔵" },
              "ig": { name: "Instagram + Threads", icon: "📸" },
              "wc": { name: "WeChat", icon: "💬" },
              "vi": { name: "Viber", icon: "💜" },
              "lg": { name: "LINE Messenger", icon: "💬" },
              "kt": { name: "KakaoTalk", icon: "💛" },
              "sg": { name: "Signal", icon: "💬" },
              "sk": { name: "Skype", icon: "🔵" },
              "im": { name: "Imo", icon: "💬" },
              "mc": { name: "MiChat", icon: "💬" },
              "yl": { name: "Yalla", icon: "💬" },
              "gm": { name: "GroupMe", icon: "💬" },
              "bd": { name: "Badoo", icon: "❤️" },
              "bm": { name: "Bumble", icon: "💛" },
              "td": { name: "Tinder", icon: "🔥" },
              "hn": { name: "Happn", icon: "💙" },
              "td_s": { name: "Tind Swipe App", icon: "🔥" },
              "hn_s": { name: "Hing Swipe App", icon: "💙" },
              "cm": { name: "Cupid Match", icon: "❤️" },
              "fm": { name: "Fish Match", icon: "🐟" },
              "mz": { name: "Muzz", icon: "💬" },
              "fl": { name: "Feeld", icon: "💬" },
              "hr": { name: "HER", icon: "💬" },
              "dm": { name: "Dil Mil", icon: "💬" },
              "fc": { name: "FilipinoCupid", icon: "💬" },
              "ic": { name: "InternationalCupid", icon: "💬" },
              "cf": { name: "Christian Filipina", icon: "💬" },
              "am": { name: "Ashley Madison", icon: "💬" },
              "lv": { name: "LOVOO", icon: "💬" },
              "ch": { name: "Chispa", icon: "💬" },
              "qq": { name: "QuackQuack Dating App", icon: "💬" },
              "jd": { name: "JustDating", icon: "💬" },
              "las": { name: "LoveAndSeek", icon: "💬" },
              "ma": { name: "Match", icon: "💬" },
              "ot_": { name: "OurTime", icon: "💬" },
              "pa": { name: "Pairs", icon: "💬" },
              "bl": { name: "BIGO LIVE", icon: "💬" },
              "lk": { name: "Likee", icon: "💬" },
              "kw": { name: "Kwai", icon: "💬" },
              "dy": { name: "Douyu", icon: "💬" },
              "hy": { name: "Huya", icon: "💬" },
              "bb": { name: "Bilibili", icon: "💬" },
              "wb": { name: "Weibo", icon: "💬" },
              "zh": { name: "Zhihu", icon: "💬" },
              "rb": { name: "RedBook (Xiaohongshu)", icon: "💬" },
              "ch_": { name: "Clubhouse", icon: "💬" },
              "sa": { name: "SoulApp", icon: "💬" },
              "wi": { name: "Wink", icon: "💬" },
              "lu": { name: "LivU", icon: "💬" },
              "mi": { name: "MICO", icon: "💬" },
              "tu": { name: "TalkU", icon: "💬" },
              "lc": { name: "LightChat", icon: "💬" },
              "gc": { name: "GoChat", icon: "💬" },
              "tc_": { name: "TenChat", icon: "💬" },
              "yy": { name: "Yik Yak", icon: "💬" },
              "ps": { name: "Periscope", icon: "💬" },
              "he": { name: "Hello", icon: "💬" },
              "az": { name: "Azar", icon: "💬" },
              "ho": { name: "Holla", icon: "💬" },
              "sk_": { name: "StreamKar", icon: "💬" },
              "tn": { name: "Tango", icon: "💬" },
              "tt": { name: "Tantan", icon: "💬" },
              "bl_": { name: "Blued", icon: "💬" },
              "mb": { name: "Mamba", icon: "💬" },
              "pu": { name: "Pure", icon: "💬" },
              "go": { name: "Google", icon: "🌐" },
              "gv": { name: "Google Voice", icon: "🌐" },
              "ms": { name: "Microsoft Outlook", icon: "💻" },
              "ap": { name: "Apple", icon: "🍎" },
              "ss": { name: "Samsung", icon: "📱" },
              "am_": { name: "Amazon", icon: "🛍️" },
              "nf": { name: "Netflix", icon: "🍿" },
              "sf": { name: "Spotify", icon: "🟢" },
              "tw_": { name: "Twitch", icon: "💜" },
              "dr": { name: "OpenAI", icon: "✨" },
              "cl": { name: "Claude", icon: "✨" },
              "ya": { name: "Yahoo", icon: "💜" },
              "ao": { name: "AOL", icon: "💻" },
              "pm": { name: "Proton Mail", icon: "🔒" },
              "nv": { name: "Naver", icon: "🌐" },
              "xi": { name: "Xiaomi", icon: "📱" },
              "op": { name: "Oppo", icon: "📱" },
              "re": { name: "Realme", icon: "📱" },
              "vv": { name: "Vivo", icon: "📱" },
              "hu_": { name: "Huawei", icon: "📱" },
              "pp": { name: "PayPal", icon: "💳" },
              "cb": { name: "Coinbase", icon: "🪙" },
              "bi": { name: "Binance", icon: "🪙" },
              "rv": { name: "Revolut", icon: "💳" },
              "ws": { name: "Wise", icon: "💳" },
              "pn": { name: "Payoneer", icon: "💳" },
              "ca_": { name: "Cash App", icon: "💸" },
              "vm": { name: "Venmo", icon: "💸" },
              "mn": { name: "Monese", icon: "💳" },
              "ps_": { name: "Paysafecard", icon: "💳" },
              "eb": { name: "eBay", icon: "🛍️" },
              "py": { name: "Paytm", icon: "💸" },
              "ph": { name: "PhonePe", icon: "💸" },
              "cr": { name: "CRED", icon: "💸" },
              "fc_": { name: "FreeCharge", icon: "💸" },
              "mk": { name: "MobiKwik", icon: "💸" },
              "ko": { name: "Kotak811", icon: "🏦" },
              "mb_": { name: "Monobank", icon: "🏦" },
              "sb": { name: "Sber", icon: "🏦" },
              "tf": { name: "Tinkoff", icon: "🏦" },
              "ab": { name: "Alfa Bank", icon: "🏦" },
              "rb_": { name: "Raiffeisen Bank", icon: "🏦" },
              "ib": { name: "Indian Banks", icon: "🏦" },
              "cw": { name: "Crypto Wallets", icon: "🪙" },
              "ok": { name: "OKX", icon: "🪙" },
              "by": { name: "Bybit", icon: "🪙" },
              "bg": { name: "Bitget", icon: "🪙" },
              "mp": { name: "MoonPay", icon: "🪙" },
              "cc": { name: "Crypto.com", icon: "🪙" },
              "pf": { name: "Paxful", icon: "🪙" },
              "li": { name: "LinkedIn", icon: "💼" },
              "tc": { name: "Truecaller", icon: "📞" },
              "es": { name: "Email Services", icon: "📧" },
              "ot": { name: "Other Services", icon: "📶" }
            };

            for (const [srvCode, srvDetails] of Object.entries(servicesNode)) {
              if (srvDetails && srvDetails.cost !== undefined && serviceNamesMap[srvCode]) {
                const srvMeta = serviceNamesMap[srvCode];
                const rawCostUsd = parseFloat(srvDetails.cost) || 0.50;
                const count = parseInt(srvDetails.count) || 0;

                await dbRun(
                  "INSERT INTO sms_services (id, country_id, name, icon, price, count, active) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id, country_id) DO UPDATE SET price = excluded.price, count = excluded.count, active = 1",
                  [srvCode, countryId, srvMeta.name, srvMeta.icon, rawCostUsd, count]
                );

                if (countryId === "12") {
                  // Also seed for USA Server 2
                  await dbRun(
                    "INSERT INTO sms_services (id, country_id, name, icon, price, count, active) VALUES (?, '12_2', ?, ?, ?, ?, 1) ON CONFLICT(id, country_id) DO UPDATE SET price = excluded.price, count = excluded.count, active = 1",
                    [srvCode, srvMeta.name, srvMeta.icon, rawCostUsd, count]
                  );
                }
              }
            }
          }
        }
        console.log("[SMS Background Seeder] Live GrizzlySMS background synchronization successfully completed!");
      }
    } catch (err) {
      console.warn("[SMS Background Seeder] Failed to preload catalog during boot:", err.message);
      console.log("[SMS Background Seeder] Seeding high-fidelity production-ready fallback catalog...");
      
      const countries = [
        { id: "12", name: "USA Server 1", flag: "🇺🇸" },
        { id: "12_2", name: "USA Server 2", flag: "🇺🇸" },
        { id: "36", name: "Canada", flag: "🇨🇦" },
        { id: "16", name: "United Kingdom", flag: "🇬🇧" },
        { id: "19", name: "Nigeria", flag: "🇳🇬" },
        { id: "22", name: "India", flag: "🇮🇳" },
        { id: "4", name: "Germany", flag: "🇩🇪" },
        { id: "5", name: "Brazil", flag: "🇧🇷" },
        { id: "6", name: "France", flag: "🇫🇷" },
        { id: "7", name: "Spain", flag: "🇪🇸" },
        { id: "8", name: "Vietnam", flag: "🇻🇳" }
      ];

      const services = [
        { id: "wa", name: "WhatsApp", icon: "🟢", price: 0.35, count: 120 },
        { id: "tg", name: "Telegram", icon: "✈️", price: 0.30, count: 95 },
        { id: "ds", name: "Discord", icon: "👾", price: 0.15, count: 50 },
        { id: "tw", name: "Twitter / X", icon: "🐦", price: 0.20, count: 75 },
        { id: "fb", name: "Facebook", icon: "🔵", price: 0.20, count: 110 },
        { id: "ig", name: "Instagram + Threads", icon: "📸", price: 0.22, count: 140 },
        { id: "wc", name: "WeChat", icon: "💬", price: 0.30, count: 40 },
        { id: "vi", name: "Viber", icon: "💜", price: 0.15, count: 60 },
        { id: "lg", name: "LINE Messenger", icon: "💬", price: 0.25, count: 70 },
        { id: "kt", name: "KakaoTalk", icon: "💛", price: 0.20, count: 50 },
        { id: "sg", name: "Signal", icon: "💬", price: 0.30, count: 80 },
        { id: "sk", name: "Skype", icon: "🔵", price: 0.25, count: 45 },
        { id: "im", name: "Imo", icon: "💬", price: 0.15, count: 35 },
        { id: "mc", name: "MiChat", icon: "💬", price: 0.15, count: 30 },
        { id: "yl", name: "Yalla", icon: "💬", price: 0.20, count: 40 },
        { id: "gm", name: "GroupMe", icon: "💬", price: 0.15, count: 25 },
        { id: "bd", name: "Badoo", icon: "❤️", price: 0.25, count: 100 },
        { id: "bm", name: "Bumble", icon: "💛", price: 0.25, count: 100 },
        { id: "td", name: "Tinder", icon: "🔥", price: 0.35, count: 100 },
        { id: "hn", name: "Happn", icon: "💙", price: 0.30, count: 80 },
        { id: "td_s", name: "Tind Swipe App", icon: "🔥", price: 0.35, count: 100 },
        { id: "hn_s", name: "Hing Swipe App", icon: "💙", price: 0.30, count: 80 },
        { id: "cm", name: "Cupid Match", icon: "❤️", price: 0.25, count: 50 },
        { id: "fm", name: "Fish Match", icon: "🐟", price: 0.20, count: 40 },
        { id: "mz", name: "Muzz", icon: "💬", price: 0.20, count: 40 },
        { id: "fl", name: "Feeld", icon: "💬", price: 0.20, count: 40 },
        { id: "hr", name: "HER", icon: "💬", price: 0.20, count: 40 },
        { id: "dm", name: "Dil Mil", icon: "💬", price: 0.20, count: 40 },
        { id: "fc", name: "FilipinoCupid", icon: "💬", price: 0.20, count: 40 },
        { id: "ic", name: "InternationalCupid", icon: "💬", price: 0.20, count: 40 },
        { id: "cf", name: "Christian Filipina", icon: "💬", price: 0.20, count: 40 },
        { id: "am", name: "Ashley Madison", icon: "💬", price: 0.20, count: 40 },
        { id: "lv", name: "LOVOO", icon: "💬", price: 0.20, count: 40 },
        { id: "ch", name: "Chispa", icon: "💬", price: 0.20, count: 40 },
        { id: "qq", name: "QuackQuack Dating App", icon: "💬", price: 0.20, count: 40 },
        { id: "jd", name: "JustDating", icon: "💬", price: 0.20, count: 40 },
        { id: "las", name: "LoveAndSeek", icon: "💬", price: 0.20, count: 40 },
        { id: "ma", name: "Match", icon: "💬", price: 0.20, count: 40 },
        { id: "ot_", name: "OurTime", icon: "💬", price: 0.20, count: 40 },
        { id: "pa", name: "Pairs", icon: "💬", price: 0.20, count: 40 },
        { id: "bl", name: "BIGO LIVE", icon: "💬", price: 0.20, count: 40 },
        { id: "lk", name: "Likee", icon: "💬", price: 0.20, count: 40 },
        { id: "kw", name: "Kwai", icon: "💬", price: 0.20, count: 40 },
        { id: "dy", name: "Douyu", icon: "💬", price: 0.20, count: 40 },
        { id: "hy", name: "Huya", icon: "💬", price: 0.20, count: 40 },
        { id: "bb", name: "Bilibili", icon: "💬", price: 0.20, count: 40 },
        { id: "wb", name: "Weibo", icon: "💬", price: 0.20, count: 40 },
        { id: "zh", name: "Zhihu", icon: "💬", price: 0.20, count: 40 },
        { id: "rb", name: "RedBook (Xiaohongshu)", icon: "💬", price: 0.20, count: 40 },
        { id: "ch_", name: "Clubhouse", icon: "💬", price: 0.20, count: 40 },
        { id: "sa", name: "SoulApp", icon: "💬", price: 0.20, count: 40 },
        { id: "wi", name: "Wink", icon: "💬", price: 0.20, count: 40 },
        { id: "lu", name: "LivU", icon: "💬", price: 0.20, count: 40 },
        { id: "mi", name: "MICO", icon: "💬", price: 0.20, count: 40 },
        { id: "tu", name: "TalkU", icon: "💬", price: 0.20, count: 40 },
        { id: "lc", name: "LightChat", icon: "💬", price: 0.20, count: 40 },
        { id: "gc", name: "GoChat", icon: "💬", price: 0.20, count: 40 },
        { id: "tc_", name: "TenChat", icon: "💬", price: 0.20, count: 40 },
        { id: "yy", name: "Yik Yak", icon: "💬", price: 0.20, count: 40 },
        { id: "ps", name: "Periscope", icon: "💬", price: 0.20, count: 40 },
        { id: "he", name: "Hello", icon: "💬", price: 0.20, count: 40 },
        { id: "az", name: "Azar", icon: "💬", price: 0.20, count: 40 },
        { id: "ho", name: "Holla", icon: "💬", price: 0.20, count: 40 },
        { id: "sk_", name: "StreamKar", icon: "💬", price: 0.20, count: 40 },
        { id: "tn", name: "Tango", icon: "💬", price: 0.20, count: 40 },
        { id: "tt", name: "Tantan", icon: "💬", price: 0.20, count: 40 },
        { id: "bl_", name: "Blued", icon: "💬", price: 0.20, count: 40 },
        { id: "mb", name: "Mamba", icon: "💬", price: 0.20, count: 40 },
        { id: "pu", name: "Pure", icon: "💬", price: 0.20, count: 40 },
        { id: "go", name: "Google", icon: "🌐", price: 0.25, count: 80 },
        { id: "gv", name: "Google Voice", icon: "🌐", price: 0.30, count: 50 },
        { id: "ms", name: "Microsoft Outlook", icon: "💻", price: 0.18, count: 90 },
        { id: "ap", name: "Apple", icon: "🍎", price: 0.35, count: 120 },
        { id: "ss", name: "Samsung", icon: "📱", price: 0.20, count: 50 },
        { id: "am_", name: "Amazon", icon: "🛍️", price: 0.25, count: 100 },
        { id: "nf", name: "Netflix", icon: "🍿", price: 0.30, count: 45 },
        { id: "sf", name: "Spotify", icon: "🟢", price: 0.20, count: 50 },
        { id: "tw_", name: "Twitch", icon: "💜", price: 0.20, count: 50 },
        { id: "dr", name: "OpenAI", icon: "✨", price: 0.40, count: 65 },
        { id: "cl", name: "Claude", icon: "✨", price: 0.40, count: 65 },
        { id: "ya", name: "Yahoo", icon: "💜", price: 0.25, count: 40 },
        { id: "ao", name: "AOL", icon: "💻", price: 0.20, count: 35 },
        { id: "pm", name: "Proton Mail", icon: "🔒", price: 0.30, count: 50 },
        { id: "nv", name: "Naver", icon: "🌐", price: 0.20, count: 30 },
        { id: "xi", name: "Xiaomi", icon: "📱", price: 0.20, count: 30 },
        { id: "op", name: "Oppo", icon: "📱", price: 0.20, count: 30 },
        { id: "re", name: "Realme", icon: "📱", price: 0.20, count: 30 },
        { id: "vv", name: "Vivo", icon: "📱", price: 0.20, count: 30 },
        { id: "hu_", name: "Huawei", icon: "📱", price: 0.20, count: 30 },
        { id: "pp", name: "PayPal", icon: "💳", price: 0.45, count: 150 },
        { id: "cb", name: "Coinbase", icon: "🪙", price: 0.35, count: 110 },
        { id: "bi", name: "Binance", icon: "🪙", price: 0.35, count: 110 },
        { id: "rv", name: "Revolut", icon: "💳", price: 0.40, count: 120 },
        { id: "ws", name: "Wise", icon: "💳", price: 0.40, count: 120 },
        { id: "pn", name: "Payoneer", icon: "💳", price: 0.40, count: 120 },
        { id: "ca_", name: "Cash App", icon: "💸", price: 0.40, count: 120 },
        { id: "vm", name: "Venmo", icon: "💸", price: 0.40, count: 120 },
        { id: "mn", name: "Monese", icon: "💳", price: 0.40, count: 120 },
        { id: "ps_", name: "Paysafecard", icon: "💳", price: 0.40, count: 120 },
        { id: "eb", name: "eBay", icon: "🛍️", price: 0.25, count: 80 },
        { id: "py", name: "Paytm", icon: "💸", price: 0.30, count: 60 },
        { id: "ph", name: "PhonePe", icon: "💸", price: 0.30, count: 60 },
        { id: "cr", name: "CRED", icon: "💸", price: 0.30, count: 60 },
        { id: "fc_", name: "FreeCharge", icon: "💸", price: 0.30, count: 60 },
        { id: "mk", name: "MobiKwik", icon: "💸", price: 0.30, count: 60 },
        { id: "ko", name: "Kotak811", icon: "🏦", price: 0.35, count: 50 },
        { id: "mb_", name: "Monobank", icon: "🏦", price: 0.35, count: 50 },
        { id: "sb", name: "Sber", icon: "🏦", price: 0.35, count: 50 },
        { id: "tf", name: "Tinkoff", icon: "🏦", price: 0.35, count: 50 },
        { id: "ab", name: "Alfa Bank", icon: "🏦", price: 0.35, count: 50 },
        { id: "rb_", name: "Raiffeisen Bank", icon: "🏦", price: 0.35, count: 50 },
        { id: "ib", name: "Indian Banks", icon: "🏦", price: 0.35, count: 50 },
        { id: "cw", name: "Crypto Wallets", icon: "🪙", price: 0.35, count: 110 },
        { id: "ok", name: "OKX", icon: "🪙", price: 0.35, count: 110 },
        { id: "by", name: "Bybit", icon: "🪙", price: 0.35, count: 110 },
        { id: "bg", name: "Bitget", icon: "🪙", price: 0.35, count: 110 },
        { id: "mp", name: "MoonPay", icon: "🪙", price: 0.35, count: 110 },
        { id: "cc", name: "Crypto.com", icon: "🪙", price: 0.35, count: 110 },
        { id: "pf", name: "Paxful", icon: "🪙", price: 0.35, count: 110 },
        { id: "li", name: "LinkedIn", icon: "💼", price: 0.30, count: 90 },
        { id: "tc", name: "Truecaller", icon: "📞", price: 0.20, count: 100 },
        { id: "es", name: "Email Services", icon: "📧", price: 0.15, count: 120 },
        { id: "ot", name: "Other Services", icon: "📶", price: 0.20, count: 150 }
      ];

      for (const c of countries) {
        await dbRun(
          "INSERT INTO sms_countries (id, name, flag, active) VALUES (?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET name = excluded.name, flag = excluded.flag, active = 1",
          [c.id, c.name, c.flag]
        );

        for (const s of services) {
          await dbRun(
            "INSERT INTO sms_services (id, country_id, name, icon, price, count, active) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id, country_id) DO UPDATE SET price = excluded.price, count = excluded.count, active = 1",
            [s.id, c.id, s.name, s.icon, s.price, s.count]
          );
        }
      }
      console.log("[SMS Background Seeder] Successfully preloaded fallback countries and services catalog!");
    }
  }, 100);
};
export { mysqlPool };
export default mysqlPool;
