// ============================================================================
//  SMS provider logging (Requirement 12).
//  Records every provider API call, its outcome and latency, plus fallback events,
//  into the `sms_provider_logs` table + console for easy debugging. Never throws.
// ============================================================================
import { dbRun } from "../../db.js";
import { recordResult } from "./smsHealth.js";

// Trim + redact request/response bodies so we never persist secrets (API keys) or huge blobs.
function safeSummary(value, max = 500) {
  try {
    let s = typeof value === "string" ? value : JSON.stringify(value);
    if (s == null) return "";
    // Redact anything that looks like a key/token.
    s = s.replace(/(api[_-]?key|key|token|authorization|bearer)\s*[=:]\s*[^&\s"']+/gi, "$1=***");
    s = s.replace(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "***JWT***");
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch { return ""; }
}

export async function logProviderCall({ provider, action, request, response, status = "ok", latencyMs = 0, userId = null }) {
  const line = `[sms:${provider}] ${action} ${status}${latencyMs ? ` (${latencyMs}ms)` : ""}`;
  if (status === "ok") { /* keep console quiet on success */ } else { console.warn(line, safeSummary(response, 200)); }
  // Feed the health tracker from real provider calls (skip router/fallback pseudo-entries).
  if (provider && provider !== "router") {
    try { recordResult(provider, { ok: status === "ok", latencyMs, error: status === "ok" ? null : safeSummary(response, 200) }); } catch (e) {}
  }
  try {
    await dbRun(
      "INSERT INTO sms_provider_logs (provider, action, request, response, status, latency_ms, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [provider || "?", action || "?", safeSummary(request), safeSummary(response), status, Math.round(latencyMs) || 0, userId, new Date().toISOString()]
    );
    // Bound the table so it never grows unbounded (keep last 2000 rows).
    await dbRun("DELETE FROM sms_provider_logs WHERE id NOT IN (SELECT id FROM sms_provider_logs ORDER BY id DESC LIMIT 2000)");
  } catch (e) { /* logging must never break the flow */ }
}

// Record a fallback event (provider A had no stock / errored → trying provider B).
export async function logFallback({ from, to, action, reason, userId = null }) {
  console.warn(`[sms:fallback] ${action}: ${from} → ${to} (${reason})`);
  await logProviderCall({ provider: "router", action: `fallback:${action}`, request: `from=${from} to=${to}`, response: reason, status: "fallback", userId });
}
