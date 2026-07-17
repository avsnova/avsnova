// ============================================================================
//  SMSPool adapter — https://www.smspool.net/article/how-to-use-the-smspool-api-0dd6eadf4c
//  Endpoint base: https://api.smspool.net/. Auth: `key` form field on POST requests.
//  Maps canonical (Grizzly) codes → SMSPool numeric country IDs + numeric service IDs
//  (resolved from the service catalog by name and cached). Prices are in USD.
// ============================================================================
import { dbGet } from "../../../db.js";
import { logProviderCall } from "../smsLog.js";
import { grizzlyToSmspoolCountry, grizzlyToSmspoolService } from "../smsMappings.js";
import { serviceDisplayName } from "../serviceNames.js";

export const id = "smspool";
export const label = "SMSPool";

const BASE = "https://api.smspool.net";

async function getKey() {
  let key = process.env.SMSPOOL_API_KEY || "";
  try { const r = await dbGet("SELECT smspool_api_key FROM settings LIMIT 1"); if (r && r.smspool_api_key) key = r.smspool_api_key; } catch (e) {}
  return key;
}

async function post(path, params, { action = "call", userId = null, auth = true } = {}) {
  const t0 = Date.now();
  const body = new URLSearchParams();
  if (auth) { const key = await getKey(); if (!key) throw new Error("SMSPOOL_NO_KEY"); body.set("key", key); }
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) body.set(k, String(v));
  let res, text;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    text = await res.text();
  } catch (e) {
    await logProviderCall({ provider: id, action, request: path, response: e.message, status: "fail", latencyMs: Date.now() - t0, userId });
    const err = new Error("NETWORK_ERROR"); err.network = true; throw err;
  }
  await logProviderCall({ provider: id, action, request: `${path} ${[...body.keys()].filter(k => k !== "key").join(",")}`, response: text, status: res.ok ? "ok" : "fail", latencyMs: Date.now() - t0, userId });
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { ok: res.ok, status: res.status, text: (text || "").trim(), json };
}

async function get(path, { action = "call" } = {}) {
  const t0 = Date.now();
  let res, text;
  try { res = await fetch(`${BASE}${path}`); text = await res.text(); }
  catch (e) { await logProviderCall({ provider: id, action, request: path, response: e.message, status: "fail", latencyMs: Date.now() - t0 }); const err = new Error("NETWORK_ERROR"); err.network = true; throw err; }
  await logProviderCall({ provider: id, action, request: path, response: `(${(text || "").length} bytes)`, status: res.ok ? "ok" : "fail", latencyMs: Date.now() - t0 });
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { ok: res.ok, json, text };
}

// Cache the service NAME → numeric ID map (rarely changes). 6h TTL.
let _svcCache = { map: null, at: 0 };
const SVC_TTL = 6 * 60 * 60 * 1000;
async function serviceNameToId(name) {
  if (!name) return null;
  if (!_svcCache.map || Date.now() - _svcCache.at > SVC_TTL) {
    const r = await get("/service/retrieve_all", { action: "getServices" });
    const map = new Map();
    if (Array.isArray(r.json)) for (const s of r.json) if (s && s.name) map.set(String(s.name).toLowerCase(), s.ID);
    _svcCache = { map, at: Date.now() };
  }
  return _svcCache.map.get(String(name).toLowerCase()) ?? null;
}

export async function getBalance() {
  const r = await post("/request/balance", {}, { action: "getBalance" });
  return r.json && r.json.balance != null ? parseFloat(r.json.balance) : parseFloat(r.text) || 0;
}

export async function getCountries() { const r = await get("/country/retrieve_all", { action: "getCountries" }); return r.json || []; }
export async function getServices() { const r = await get("/service/retrieve_all", { action: "getServices" }); return r.json || []; }
export async function getPrices() { return {}; }

// ——— NATIVE POOL METHODS (provider-independent architecture) ———
// SMSPool's OWN native data, no cross-provider translation. Native country id = SMSPool numeric
// country ID; native service id = SMSPool numeric service ID. `/request/pricing?country=ID`
// returns per-country services with live price in ONE call (authoritative + self-consistent).

// List SMSPool's own countries. Returns [{ id, name, prefix, iso }].
export async function getNativeCountries() {
  const r = await get("/country/retrieve_all", { action: "native_countries" });
  const arr = Array.isArray(r.json) ? r.json : [];
  return arr.map((c) => ({ id: String(c.ID), name: c.name, prefix: String(c.cc || "").replace("+", ""), iso: c.short_name || "" }))
            .sort((a, b) => a.name.localeCompare(b.name));
}

// List SMSPool's own services for one native country, with live price + stock.
// Returns [{ id, name, price(USD), stock, successRate }].
export async function getNativeServices(nativeCountry) {
  if (nativeCountry == null || nativeCountry === "") return [];
  const r = await post("/request/pricing", { country: nativeCountry }, { action: "native_services" });
  const arr = Array.isArray(r.json) ? r.json : [];
  // SMSPool's /request/pricing can list the SAME service id more than once (one row per
  // pool/carrier). Deduplicate by service id, keeping the cheapest in-stock option and summing
  // stock across pools — so each service appears EXACTLY ONCE in the customer catalog.
  const byId = new Map();
  for (const s of arr) {
    const id = String(s.service);
    const price = parseFloat(s.price) || 0;
    if (!(price > 0)) continue;
    const stock = s.available != null ? Number(s.available) : (s.amount != null ? Number(s.amount) : 1);
    const successRate = s.success_rate != null ? Number(s.success_rate) : null;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, name: serviceDisplayName(s.service_name, s.service_name), price, stock, successRate });
    } else {
      // Keep the lowest price; accumulate stock; prefer a defined success rate.
      existing.price = Math.min(existing.price, price);
      existing.stock = (Number(existing.stock) || 0) + (Number(stock) || 0);
      if (existing.successRate == null && successRate != null) existing.successRate = successRate;
    }
  }
  const out = Array.from(byId.values());
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Live price + stock for one native country+service. Returns { price(USD), stock, successRate } | null.
export async function getNativePrice(nativeCountry, nativeService) {
  const r = await post("/request/price", { country: nativeCountry, service: nativeService }, { action: "native_price" });
  if (!r.json || r.json.price == null) return null;
  const price = parseFloat(r.json.price);
  if (!(price > 0)) return null;
  return { price, stock: r.json.available != null ? Number(r.json.available) : 1, successRate: r.json.success_rate != null ? Number(r.json.success_rate) : null };
}

// Buy using SMSPool's OWN native numeric country+service IDs (no translation).
// Returns { providerOrderId, number, expiresAt, priceUsd }.
export async function buyNative(nativeCountry, nativeService, userId = null) {
  const r = await post("/purchase/sms", { country: nativeCountry, service: nativeService }, { action: "native_buy", userId });
  if (!r.json || r.json.success !== 1 || !r.json.order_id) {
    const msg = (r.json && (r.json.message || r.json.error)) || r.text || "SMSPOOL_BUY_FAILED";
    const e = new Error(msg);
    if (/out of stock|no stock|no numbers|not available|no available/i.test(msg)) e.noStock = true;
    throw e;
  }
  // `number` is full E.164 (with cc); `phonenumber` is stripped — always use full `number`.
  let number = String(r.json.number || "");
  if (!number && r.json.phonenumber) number = `${r.json.cc || ""}${r.json.phonenumber}`;
  let expiresAt = null;
  if (r.json.expiration) expiresAt = new Date(Number(r.json.expiration) * 1000).toISOString();
  else if (r.json.expires_in) expiresAt = new Date(Date.now() + Number(r.json.expires_in) * 1000).toISOString();
  return { providerOrderId: String(r.json.order_id), number, expiresAt, priceUsd: parseFloat(r.json.cost) || 0 };
}

// Price for canonical country+service. Returns { costUsd, count } or null if unmapped/unsupported.
export async function getPrice(gCountry, gService) {
  const country = grizzlyToSmspoolCountry(gCountry);
  const svcName = grizzlyToSmspoolService(gService);
  if (country == null || !svcName) return null;
  const svcId = await serviceNameToId(svcName);
  if (svcId == null) return null;
  const r = await post("/request/price", { country, service: svcId }, { action: "getPrice" });
  if (!r.json || r.json.price == null) return null;
  const cost = parseFloat(r.json.price);
  if (!(cost > 0)) return null;
  // SMSPool exposes success_rate, not a raw stock count. Treat >0 success_rate as "in stock".
  const inStock = r.json.success_rate == null || Number(r.json.success_rate) > 0;
  return inStock ? { costUsd: cost, count: 999, successRate: Number(r.json.success_rate) || null } : null;
}

// Buy. POST /purchase/sms (key, country, service). Returns { activationId, number, providerSessionId, costUsd }.
export async function buyNumber(gCountry, gService, userId = null) {
  const country = grizzlyToSmspoolCountry(gCountry);
  const svcName = grizzlyToSmspoolService(gService);
  if (country == null || !svcName) { const e = new Error("SERVICE_NOT_SUPPORTED"); e.noStock = true; throw e; }
  const svcId = await serviceNameToId(svcName);
  if (svcId == null) { const e = new Error("SERVICE_NOT_SUPPORTED"); e.noStock = true; throw e; }
  const r = await post("/purchase/sms", { country, service: svcId }, { action: "buyNumber", userId });
  // Success shape: { success:1, number, cc, phonenumber, order_id, ... }
  // IMPORTANT: `number` is the FULL E.164 number WITH the country code (e.g. 4915124409776),
  // while `phonenumber` has the country code STRIPPED (15124409776). We MUST use the full
  // `number` (or reconstruct cc+phonenumber) so the delivered number reflects the real country
  // — using `phonenumber` alone made valid German numbers look like US numbers.
  if (!r.json || r.json.success !== 1 || !r.json.order_id) {
    const msg = (r.json && (r.json.message || r.json.error)) || r.text || "SMSPOOL_BUY_FAILED";
    const e = new Error(msg);
    if (/out of stock|no stock|no numbers|not available|no available/i.test(msg)) e.noStock = true;
    throw e;
  }
  let number = String(r.json.number || "");
  // Fallback: if `number` is absent, reconstruct from country code + stripped phonenumber.
  if (!number && r.json.phonenumber) number = `${r.json.cc || ""}${r.json.phonenumber}`;
  // SMSPool returns `expiration` (unix seconds) and/or `expires_in` (seconds) — provider truth.
  let expiresAt = null;
  if (r.json.expiration) expiresAt = new Date(Number(r.json.expiration) * 1000).toISOString();
  else if (r.json.expires_in) expiresAt = new Date(Date.now() + Number(r.json.expires_in) * 1000).toISOString();
  return { activationId: String(r.json.order_id), number, providerSessionId: String(r.json.order_id), costUsd: parseFloat(r.json.cost) || 0, expiresAt };
}

// Poll. POST /sms/check (key, orderid). status codes: 1=pending, 3=completed(has sms), 6=refunded/cancelled, etc.
export async function getSms(providerSessionId, userId = null) {
  const r = await post("/sms/check", { orderid: providerSessionId }, { action: "getSms", userId });
  if (!r.json) return { status: "unknown", raw: r.text };
  const status = Number(r.json.status);
  // Provider-truth timers (SMSPool exposes unix `expiration` + live `time_left`).
  const expiresAt = r.json.expiration ? new Date(Number(r.json.expiration) * 1000).toISOString() : null;
  const timeLeftSec = r.json.time_left != null ? Math.max(0, Number(r.json.time_left)) : (expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)) : null);
  const meta = { expiresAt, timeLeftSec };
  if ((status === 3 || r.json.sms) && r.json.sms) return { status: "completed", code: String(r.json.sms), ...meta };
  if (status === 6 || status === 0) return { status: "cancelled", ...meta };
  return { status: "waiting", ...meta };
}
export async function getOrderStatus(providerSessionId, userId = null) { return getSms(providerSessionId, userId); }

// Cancel. POST /sms/cancel (key, orderid).
export async function cancelActivation(providerSessionId, userId = null) {
  const r = await post("/sms/cancel", { orderid: providerSessionId }, { action: "cancelActivation", userId });
  if (!r.json || (r.json.success !== 1 && !/success/i.test(r.text))) throw new Error((r.json && r.json.message) || r.text || "SMSPOOL_CANCEL_FAILED");
  return "ok";
}

// SMSPool auto-completes on delivery; there's no explicit "finish". No-op for interface parity.
export async function completeActivation() { return null; }
