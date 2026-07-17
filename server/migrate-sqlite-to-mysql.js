/**
 * SQLite → MySQL data migration tool.
 *
 * Copies every row from an existing SQLite database file into a MySQL/MariaDB database whose
 * schema has already been created by the app (run the app once in MySQL mode first, so all
 * tables exist). Existing data safety:
 *   • Reads from SQLite (never modifies it).
 *   • Inserts into MySQL with INSERT IGNORE, so re-running is safe and won't duplicate rows.
 *   • Migrates tables in FK-agnostic order with foreign-key checks disabled during load.
 *
 * USAGE (from the project root):
 *   node server/migrate-sqlite-to-mysql.js
 *
 * It reads the MySQL connection from your .env (MYSQL_HOST/PORT/USER/PASSWORD/DATABASE) and the
 * SQLite file from ./database.sqlite (override with SQLITE_PATH=/path/to/database.sqlite).
 *
 * RECOMMENDED FLOW:
 *   1. Set DB_TYPE=mysql + MYSQL_* in .env
 *   2. Run the app once so it creates the MySQL schema:  npm start   (Ctrl-C after it says "initialized")
 *   3. Run this tool:                                    node server/migrate-sqlite-to-mysql.js
 *   4. Verify row counts (the tool prints them), then start the app normally.
 */
import sqlite3 from "sqlite3";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(process.cwd(), "database.sqlite");

function fail(msg) { console.error(`\n[migration] ERROR: ${msg}\n`); process.exit(1); }

if (!fs.existsSync(SQLITE_PATH)) fail(`SQLite file not found at ${SQLITE_PATH}. Set SQLITE_PATH if it's elsewhere.`);

// Open SQLite (read-only).
const sqliteDb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) fail(`Cannot open SQLite: ${err.message}`);
});
const sGet = (q, p = []) => new Promise((res, rej) => sqliteDb.get(q, p, (e, r) => (e ? rej(e) : res(r))));
const sAll = (q, p = []) => new Promise((res, rej) => sqliteDb.all(q, p, (e, r) => (e ? rej(e) : res(r))));

async function main() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "aurevashop",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: false,
  });

  // Sanity check the MySQL connection.
  try { await pool.query("SELECT 1"); }
  catch (e) { fail(`Cannot connect to MySQL (${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}/${process.env.MYSQL_DATABASE}): ${e.message}`); }

  // List all user tables in SQLite (skip internal sqlite_* tables).
  const tables = (await sAll(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )).map((r) => r.name);

  console.log(`\n[migration] SQLite: ${SQLITE_PATH}`);
  console.log(`[migration] MySQL:  ${process.env.MYSQL_USER}@${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}/${process.env.MYSQL_DATABASE}`);
  console.log(`[migration] Found ${tables.length} tables in SQLite.\n`);

  // Which MySQL tables actually exist (so we skip SQLite-only artifacts). Also cache their columns
  // so we only insert columns that exist on BOTH sides.
  const [mysqlTableRows] = await pool.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?",
    [process.env.MYSQL_DATABASE]
  );
  const mysqlTables = new Set(mysqlTableRows.map((r) => r.t || r.TABLE_NAME || r.table_name));

  await pool.query("SET FOREIGN_KEY_CHECKS = 0");

  let totalRows = 0;
  const summary = [];

  for (const table of tables) {
    if (!mysqlTables.has(table)) {
      console.log(`  · ${table}: skipped (no matching MySQL table — run the app once in MySQL mode first)`);
      continue;
    }

    // Columns present on the MySQL side.
    const [colRows] = await pool.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
      [process.env.MYSQL_DATABASE, table]
    );
    const mysqlCols = new Set(colRows.map((r) => r.c || r.COLUMN_NAME || r.column_name));

    const rows = await sAll(`SELECT * FROM "${table}"`);
    if (rows.length === 0) { summary.push([table, 0]); continue; }

    // Intersect columns (only migrate columns that exist on both sides).
    const cols = Object.keys(rows[0]).filter((c) => mysqlCols.has(c));
    if (cols.length === 0) { console.log(`  · ${table}: skipped (no common columns)`); continue; }

    const colList = cols.map((c) => "`" + c + "`").join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

    let inserted = 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of rows) {
        const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
        const [res] = await conn.execute(sql, values);
        inserted += res.affectedRows || 0;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.log(`  · ${table}: ERROR — ${e.message}`);
      conn.release();
      continue;
    }
    conn.release();

    totalRows += inserted;
    summary.push([table, inserted]);
    console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows migrated`);
  }

  await pool.query("SET FOREIGN_KEY_CHECKS = 1");

  console.log(`\n[migration] Done. ${totalRows} rows migrated across ${summary.length} tables.`);
  console.log(`[migration] Tip: compare row counts between SQLite and MySQL for any critical tables (users, orders, transactions).`);

  await pool.end();
  sqliteDb.close();
  process.exit(0);
}

main().catch((e) => fail(e.message));
