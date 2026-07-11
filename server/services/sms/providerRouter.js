// ============================================================================
//  SMS Smart Provider Routing Engine (Requirements 5, 6, 7, 10 + Routing spec).
//  Central registry + intelligent selection/failover/retry engine over the provider adapters.
//  The SMS route talks ONLY to this module, so the frontend stays provider-agnostic and Grizzly
//  remains the default. Adding a new provider = drop an adapter file + register it here.
//
//  Strategies (admin-configurable via settings.sms_routing_strategy):
//    - cheapest       : cheapest in-stock provider (tie-break: success rate, then latency)
//    - success        : highest success rate that has stock (tie-break: price)
//    - fastest        : lowest latency that has stock (tie-break: price)
//    - preferred      : honor primary→secondary→rest order, with automatic fallback
//    - manual         : same as preferred (explicit admin priority order)
//  All strategies FAIL OVER across every enabled provider before returning an error.
// ============================================================================
import { dbGet } from "../../db.js";
import { logFallback, logProviderCall } from "./smsLog.js";
import { validateNumberCountry, isValidPhoneFormat } from "./smsMappings.js";
import * as health from "./smsHealth.js";
import * as grizzly from "./providers/grizzlyAdapter.js";
import * as fivesim from "./providers/fivesimAdapter.js";
import * as smspool from "./providers/smspoolAdapter.js";

// Registry — add a future provider here + drop in its adapter file; nothing else changes.
export const ADAPTERS = { grizzly, fivesim, smspool };
export const PROVIDER_IDS = ["grizzly", "fivesim", "smspool"];
export const STRATEGIES = ["cheapest", "success", "fastest", "preferred", "manual"];

// Retry policy for transient errors before switching providers.
const RETRY_ATTEMPTS = 2;      // total tries per provider on transient failure
const RETRY_DELAY_MS = 700;

export function getAdapter(providerId) { return ADAPTERS[providerId] || null; }

// Read multi-provider config (safe defaults = Grizzly-only, unchanged behavior).
export async function getProviderConfig() {
  let row = {};
  try {
    row = (await dbGet(
      `SELECT sms_provider_grizzly_enabled g, sms_provider_fivesim_enabled f, sms_provider_smspool_enabled s,
              sms_primary_provider primary_p, sms_secondary_provider secondary_p, sms_provider_mode mode,
              sms_routing_strategy strategy
       FROM settings LIMIT 1`
    )) || {};
  } catch (e) {}
  const enabled = {
    grizzly: row.g == null ? true : row.g === 1,
    fivesim: row.f === 1,
    smspool: row.s === 1,
  };
  // Strategy: explicit column wins; else derive from legacy mode ('auto'→cheapest, else preferred).
  let strategy = row.strategy && STRATEGIES.includes(row.strategy) ? row.strategy : null;
  if (!strategy) strategy = (row.mode === "auto") ? "cheapest" : "preferred";
  return {
    enabled,
    primary: row.primary_p || "grizzly",
    secondary: row.secondary_p || "",
    mode: row.mode || "single",
    strategy,
  };
}

// Ordered list of enabled providers honoring primary → secondary → the rest.
export function orderedProviders(cfg) {
  const order = [];
  const push = (p) => { if (p && cfg.enabled[p] && !order.includes(p)) order.push(p); };
  push(cfg.primary);
  push(cfg.secondary);
  for (const p of PROVIDER_IDS) push(p);
  return order;
}

// Probe one provider for a canonical country+service: does it support it + have stock + a price?
// Returns { provider, costUsd, count, ok } | { provider, ok:false, reason }.
async function probe(pid, gCountry, gService) {
  const adapter = getAdapter(pid);
  if (!adapter) return { provider: pid, ok: false, reason: "no adapter" };
  try {
    const healthy = await health.isHealthy(pid);
    const p = await adapter.getPrice(gCountry, gService);
    if (!p || !(p.costUsd > 0)) return { provider: pid, ok: false, reason: "unsupported/no price" };
    if (p.count != null && p.count <= 0) return { provider: pid, ok: false, reason: "no stock" };
    const sr = await health.successRate(pid);
    return { provider: pid, ok: true, costUsd: p.costUsd, count: p.count ?? null, successRate: sr.rate, latency: health.avgLatency(pid), healthy, operator: p.operator, successRatePct: p.successRate };
  } catch (e) {
    return { provider: pid, ok: false, reason: e.message || "probe error" };
  }
}

// Price a canonical country+service across ALL enabled providers (parallel).
// Returns [{ provider, costUsd, count, successRate, latency, ... }] for those that can fulfill.
export async function priceAllProviders(gCountry, gService) {
  const cfg = await getProviderConfig();
  const probes = await Promise.all(orderedProviders(cfg).map((pid) => probe(pid, gCountry, gService)));
  return probes.filter((p) => p.ok);
}

// Rank candidates by the active strategy. Returns a NEW sorted array (best first).
function rankCandidates(candidates, cfg) {
  const order = orderedProviders(cfg);
  const byPref = (a, b) => order.indexOf(a.provider) - order.indexOf(b.provider);
  const arr = [...candidates];
  switch (cfg.strategy) {
    case "success":
      arr.sort((a, b) => (b.successRate - a.successRate) || (a.costUsd - b.costUsd) || byPref(a, b));
      break;
    case "fastest":
      arr.sort((a, b) => ((a.latency ?? 9e9) - (b.latency ?? 9e9)) || (a.costUsd - b.costUsd) || byPref(a, b));
      break;
    case "preferred":
    case "manual":
      arr.sort(byPref);
      break;
    case "cheapest":
    default:
      // cheapest; tie-break by success rate, then latency, then preference order
      arr.sort((a, b) => (a.costUsd - b.costUsd) || (b.successRate - a.successRate) || ((a.latency ?? 9e9) - (b.latency ?? 9e9)) || byPref(a, b));
      break;
  }
  return arr;
}

// Decide the single price to SHOW the customer (does not buy). Returns best candidate | null.
export async function bestPrice(gCountry, gService) {
  const cfg = await getProviderConfig();
  const candidates = await priceAllProviders(gCountry, gService);
  if (!candidates.length) return null;
  return rankCandidates(candidates, cfg)[0];
}

// Compute the full ranked plan (for logging / admin visibility).
export async function routePlan(gCountry, gService) {
  const cfg = await getProviderConfig();
  const candidates = await priceAllProviders(gCountry, gService);
  return { strategy: cfg.strategy, ranked: rankCandidates(candidates, cfg) };
}

function isTransient(e) {
  const m = (e && e.message || "").toLowerCase();
  return !!(e && (e.network || /timeout|econn|socket|502|503|504|temporar|try again/.test(m)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Buy a number with the Smart Routing Engine: rank enabled providers by strategy, then attempt
// each in order with per-provider retry on transient errors, failing over on hard failures.
// Returns { provider, activationId, number, providerSessionId, costUsd, plan } or throws when
// EVERY enabled provider has failed.
export async function buyWithFallback(gCountry, gService, userId = null) {
  const cfg = await getProviderConfig();

  // 1) Probe + rank every enabled provider that can fulfill this exact service+country.
  const candidates = await priceAllProviders(gCountry, gService);
  const ranked = rankCandidates(candidates, cfg);

  // 2) Build the attempt order: ranked fulfillers first, then any remaining enabled providers
  //    we couldn't price (they may still have stock at buy-time — last-ditch attempts).
  const attemptOrder = ranked.map((c) => c.provider);
  for (const p of orderedProviders(cfg)) if (!attemptOrder.includes(p)) attemptOrder.push(p);
  if (!attemptOrder.length) throw new Error("NO_PROVIDER_ENABLED");

  // Log the routing decision (Requirement: log providers checked + prices + selection).
  await logProviderCall({
    provider: "router", action: "routePlan",
    request: `${gCountry}/${gService} strategy=${cfg.strategy}`,
    response: JSON.stringify({ ranked: ranked.map((c) => ({ p: c.provider, usd: c.costUsd, sr: Number((c.successRate || 0).toFixed(2)) })), order: attemptOrder }),
    status: "ok", userId,
  });

  let lastErr = null;
  for (let i = 0; i < attemptOrder.length; i++) {
    const pid = attemptOrder[i];
    const adapter = getAdapter(pid);
    if (!adapter) continue;

    // Per-provider retry on transient errors before failing over.
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await adapter.buyNumber(gCountry, gService, userId);

        // ——— ORDER INTEGRITY: validate the returned number BEFORE delivering it ———
        // Guards against provider country-mapping bugs (e.g. requesting Germany but receiving a
        // Philippines number). If the number's country prefix doesn't match the requested
        // country, we REJECT it: cancel it upstream (best-effort) and fail over to another
        // provider — the customer is NEVER handed a wrong-country number.
        const fmtOk = isValidPhoneFormat(result.number);
        const cc = validateNumberCountry(gCountry, result.number);
        await logProviderCall({
          provider: "router", action: "validateNumber",
          request: `${pid} req_country=${gCountry} service=${gService}`,
          response: `number=${result.number} format_ok=${fmtOk} country_ok=${cc.ok} (${cc.reason})`,
          status: (fmtOk && cc.ok) ? "ok" : "fail", userId,
        });
        if (!fmtOk || !cc.ok) {
          // Reject this number. Best-effort upstream cancel so we don't pay for it.
          try { await adapter.cancelActivation(result.providerSessionId, userId); } catch (e) { /* provider may enforce a cooldown; still reject locally */ }
          lastErr = new Error(`WRONG_COUNTRY: ${pid} returned ${cc.reason}`);
          lastErr.wrongCountry = true;
          break; // fail over to the next provider
        }

        let costUsd = result.costUsd || 0;
        if (!costUsd) { const c = ranked.find((x) => x.provider === pid); if (c) costUsd = c.costUsd; }
        if (!costUsd) { try { const pr = await adapter.getPrice(gCountry, gService); if (pr) costUsd = pr.costUsd; } catch (e) {} }
        return { provider: pid, ...result, costUsd, validated: { country: cc, formatOk: fmtOk }, plan: ranked };
      } catch (e) {
        lastErr = e;
        if (isTransient(e) && attempt < RETRY_ATTEMPTS) {
          await logProviderCall({ provider: "router", action: "retry", request: `${pid} ${gCountry}/${gService}`, response: `attempt ${attempt}: ${e.message}`, status: "retry", userId });
          await sleep(RETRY_DELAY_MS);
          continue; // retry same provider
        }
        break; // hard failure (or retries exhausted) → fail over
      }
    }
    const next = attemptOrder[i + 1];
    const reason = lastErr && lastErr.wrongCountry ? "wrong-country number (rejected)" : (lastErr && lastErr.noStock ? "no stock / unsupported" : (lastErr && lastErr.network ? "network error" : (lastErr && lastErr.message) || "error"));
    if (next) await logFallback({ from: pid, to: next, action: "buyNumber", reason, userId });
  }
  const err = new Error(lastErr ? lastErr.message : "ALL_PROVIDERS_FAILED");
  err.allFailed = true;
  throw err;
}

// Per-provider balances (for the admin panel + dashboard). Also refreshes the health snapshot.
export async function allBalances() {
  const out = {};
  await Promise.all(PROVIDER_IDS.map(async (pid) => {
    try { const b = await getAdapter(pid).getBalance(); out[pid] = b; await health.recordBalance(pid, b); }
    catch (e) { out[pid] = null; }
  }));
  return out;
}

// Periodic background health check (balances + implicit reachability). Safe to call on a timer.
export async function refreshHealth() {
  await allBalances();
  return health.getAllHealth();
}
