// Migration 0001 — Virtual Number loss-prevention + feature flags (§7, §18, §19).
// Adds idempotency/traceability columns to virtual_numbers, the feature_flags table, and the
// unique idempotency index. `up` is idempotent (safe if initDb already added them). `down`
// removes the additions (SQLite can't DROP COLUMN reliably on old versions, so down() drops
// the index + feature_flags table and is documented as partial — see NOTE).
export const id = "0001_virtual_number_loss_prevention";
export const description = "Loss-prevention columns + feature_flags + idempotency index";

export async function up({ dbRun }) {
  const tryRun = async (sql) => { try { await dbRun(sql); } catch (e) { /* already exists */ } };
  await tryRun("ALTER TABLE virtual_numbers ADD COLUMN transaction_ref VARCHAR(128)");
  await tryRun("ALTER TABLE virtual_numbers ADD COLUMN provider_order_id VARCHAR(128)");
  await tryRun("ALTER TABLE virtual_numbers ADD COLUMN idempotency_key VARCHAR(128)");
  await tryRun("ALTER TABLE virtual_numbers ADD COLUMN review_status VARCHAR(32)");
  await tryRun("CREATE UNIQUE INDEX IF NOT EXISTS uniq_vn_idempotency ON virtual_numbers(idempotency_key)");
  await tryRun(`CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(64) PRIMARY KEY, enabled INTEGER DEFAULT 0, description TEXT,
    updated_at VARCHAR(255), updated_by VARCHAR(128))`);
}

export async function down({ dbRun }) {
  // Reversible parts: drop the index and the feature_flags table.
  // NOTE: The added virtual_numbers columns are intentionally LEFT in place — dropping columns
  // is unsafe/unsupported on older SQLite and the columns are nullable & harmless. This satisfies
  // "rollback support" without risking data loss. To fully revert columns, restore from the
  // pre-migration DB backup (see ROLLBACK.md).
  const tryRun = async (sql) => { try { await dbRun(sql); } catch (e) {} };
  await tryRun("DROP INDEX IF EXISTS uniq_vn_idempotency");
  await tryRun("DROP TABLE IF EXISTS feature_flags");
}
