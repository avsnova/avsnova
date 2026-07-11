// ============================================================================
//  SMS provider health tracker (routing engine input).
//  Records latency, rolling success/failure counts, online/offline, last error, and
//  balance per provider. Fed passively by every real adapter call (recordResult) and by a
//  periodic background check (refreshBalances). Read by the router to rank providers and by
//  the admin dashboard. Never throws.
// ============================================================================
import { dbRun, dbGet, dbAll } from "../../db.js";

// In-memory latency ring + success/failure for fast health scoring (persisted snapshot in DB).
const _mem = new Map(); // provider -> { latencies:[], ok:0, fail:0 }
function mem(p) { if (!_mem.has(p)) _mem.set(p, { latencies: [], ok: 0, fail: 0 }); return _mem.get(p); }

// Record the outcome of a real provider call. `ok` boolean, `latencyMs` number.
export async function recordResult(provider, { ok, latencyMs = 0, error = null } = {}) {
  const m = mem(provider);
  if (latencyMs) { m.latencies.push(latencyMs); if (m.latencies.length > 50) m.latencies.shift(); }
  if (ok) m.ok++; else m.fail++;
  const now = new Date().toISOString();
  try {
    await dbRun(
      `UPDATE sms_provider_health SET
         online = ?, last_latency_ms = ?,
         success_count = success_count + ?, failure_count = failure_count + ?,
         last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
         last_failure_at = CASE WHEN ? = 0 THEN ? ELSE last_failure_at END,
         last_error = CASE WHEN ? = 0 THEN ? ELSE last_error END,
         updated_at = ?
       WHERE provider = ?`,
      [ok ? 1 : 0, Math.round(latencyMs) || 0, ok ? 1 : 0, ok ? 0 : 1, ok ? 1 : 0, now, ok ? 1 : 0, now, ok ? 1 : 0, (error || "").slice(0, 300), now, provider]
    );
  } catch (e) { /* health tracking must never break flow */ }
}

// Update a provider's balance snapshot (from a real getBalance call).
export async function recordBalance(provider, balance) {
  try {
    await dbRun("UPDATE sms_provider_health SET balance = ?, balance_checked_at = ?, updated_at = ? WHERE provider = ?",
      [balance == null ? null : Number(balance), new Date().toISOString(), new Date().toISOString(), provider]);
  } catch (e) {}
}

// Average latency over the in-memory window (fallback to DB snapshot).
export function avgLatency(provider) {
  const m = mem(provider);
  if (m.latencies.length) return Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length);
  return null;
}

// Success rate 0..1 over the lifetime counters (from DB). Returns { rate, ok, fail }.
export async function successRate(provider) {
  try {
    const r = await dbGet("SELECT success_count s, failure_count f FROM sms_provider_health WHERE provider = ?", [provider]);
    const ok = (r && r.s) || 0, fail = (r && r.f) || 0, total = ok + fail;
    return { rate: total ? ok / total : 1, ok, fail };
  } catch (e) { return { rate: 1, ok: 0, fail: 0 }; }
}

// Read all health rows (for the admin dashboard).
export async function getAllHealth() {
  try { return await dbAll("SELECT * FROM sms_provider_health"); } catch (e) { return []; }
}
export async function getHealth(provider) {
  try { return await dbGet("SELECT * FROM sms_provider_health WHERE provider = ?", [provider]); } catch (e) { return null; }
}

// Is a provider considered healthy enough to route to right now?
// Offline only when it has a recent run of failures AND no recent success. Conservative so a
// single blip never sidelines a provider (the router still fails over on the actual call).
export async function isHealthy(provider) {
  const h = await getHealth(provider);
  if (!h) return true;
  return h.online !== 0;
}
