// ============================================================================
//  5SIM adapter — https://5sim.net/docs
//  Implements the common provider interface, mapping canonical (Grizzly) codes to 5SIM's
//  country slugs + product slugs. Auth: Bearer JWT. All results normalized to USD + our shape.
// ============================================================================
import { dbGet } from "../../../db.js";
import { logProviderCall } from "../smsLog.js";
import { grizzlyToFivesimCountry, grizzlyToFivesimService } from "../smsMappings.js";

export const id = "fivesim";
export const label = "5SIM";

const BASE = "https://5sim.net/v1";

async function getKey() {
  let key = process.env.FIVESIM_API_KEY || "";
  try { const r = await dbGet("SELECT fivesim_api_key FROM settings LIMIT 1"); if (r && r.fivesim_api_key) key = r.fivesim_api_key; } catch (e) {}
  return key;
}

async function call(path, { auth = true, action = "call", userId = null } = {}) {
  const t0 = Date.now();
  const headers = { Accept: "application/json" };
  if (auth) { const key = await getKey(); if (!key) throw new Error("5SIM_NO_KEY"); headers.Authorization = `Bearer ${key}`; }
  let res, text;
  try {
    res = await fetch(`${BASE}${path}`, { headers });
    text = await res.text();
  } catch (e) {
    await logProviderCall({ provider: id, action, request: path, response: e.message, status: "fail", latencyMs: Date.now() - t0, userId });
    const err = new Error("NETWORK_ERROR"); err.network = true; throw err;
  }
  const ok = res.ok;
  await logProviderCall({ provider: id, action, request: path, response: text, status: ok ? "ok" : "fail", latencyMs: Date.now() - t0, userId });
  // 5SIM returns plain-text sentinels for some errors (e.g. "no free phones", "not enough user balance").
  let json = null; try { json = JSON.parse(text); } catch (e) { /* plain text */ }
  return { ok, status: res.status, text: (text || "").trim(), json };
}

export async function getBalance() {
  const r = await call("/user/profile", { action: "getBalance" });
  return r.json && typeof r.json.balance === "number" ? r.json.balance : parseFloat(r.text) || 0;
}

export async function getCountries() { const r = await call("/guest/countries", { auth: false, action: "getCountries" }); return r.json || {}; }

// ——— NATIVE POOL METHODS (provider-independent architecture) ———
// These return 5SIM's OWN native data with NO cross-provider translation, so a pool can never
// mix or mis-map another provider's country/service. Native country id = 5SIM slug; native
// service id = 5SIM product slug.

// List 5SIM's own countries. Returns [{ id(slug), name, prefix }].
export async function getNativeCountries() {
  const r = await call("/guest/countries", { auth: false, action: "native_countries" });
  const d = r.json || {};
  const out = [];
  for (const [slug, node] of Object.entries(d)) {
    if (!node || typeof node !== "object") continue;
    const prefix = node.prefix ? Object.keys(node.prefix)[0] : "";
    const iso = node.iso ? Object.keys(node.iso)[0] : "";
    out.push({ id: slug, name: node.text_en || slug, prefix: (prefix || "").replace("+", ""), iso: (iso || "").toUpperCase() });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// List 5SIM's own services (products) for one native country, with live price + stock.
// Returns [{ id(product slug), name, price(USD), stock }].
export async function getNativeServices(nativeCountry) {
  if (!nativeCountry) return [];
  const r = await call(`/guest/products/${encodeURIComponent(nativeCountry)}/any`, { auth: false, action: "native_services" });
  const d = r.json || {};
  const out = [];
  for (const [slug, node] of Object.entries(d)) {
    if (!node || typeof node !== "object") continue;
    if (String(node.Category) !== "activation") continue; // only activation (not rentals/hosting)
    const price = Number(node.Price) || 0, stock = Number(node.Qty) || 0;
    out.push({ id: slug, name: slug, price, stock });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Live price + stock for one native country+service. Returns { price(USD), stock } | null.
export async function getNativePrice(nativeCountry, nativeService) {
  const svcs = await getNativeServices(nativeCountry);
  const hit = svcs.find((s) => s.id === nativeService);
  return hit ? { price: hit.price, stock: hit.stock } : null;
}

// Buy using 5SIM's OWN native country+service slugs (no translation).
// Returns { providerOrderId, number, expiresAt, priceUsd, operator }.
export async function buyNative(nativeCountry, nativeService, userId = null) {
  const r = await call(`/user/buy/activation/${encodeURIComponent(nativeCountry)}/any/${encodeURIComponent(nativeService)}`, { action: "native_buy", userId });
  if (!r.ok || !r.json || !r.json.id) {
    const t = (r.text || "").toLowerCase();
    const e = new Error(r.text || "5SIM_BUY_FAILED");
    if (t.includes("no free phones") || t.includes("out of stock") || t.includes("not available")) e.noStock = true;
    throw e;
  }
  return { providerOrderId: String(r.json.id), number: String(r.json.phone || ""), expiresAt: r.json.expires || null, priceUsd: Number(r.json.price) || 0, operator: r.json.operator || null };
}
export async function getServices() { return {}; }
export async function getPrices() { return {}; }

// Price for canonical country+service. Picks the cheapest in-stock operator. Returns {costUsd,count} or null.
export async function getPrice(gCountry, gService) {
  const country = grizzlyToFivesimCountry(gCountry);
  const product = grizzlyToFivesimService(gService);
  if (!country || !product) return null; // not mapped for 5SIM → skip silently (Requirement 7)
  const r = await call(`/guest/prices?country=${encodeURIComponent(country)}&product=${encodeURIComponent(product)}`, { auth: false, action: "getPrice" });
  const node = r.json && r.json[country] && r.json[country][product];
  if (!node || typeof node !== "object") return null;
  // node = { <operator>: { cost, count, rate } }. Choose cheapest operator that has stock.
  let best = null;
  for (const [op, v] of Object.entries(node)) {
    if (!v || typeof v.cost !== "number") continue;
    const count = Number(v.count) || 0;
    if (count <= 0) continue;
    if (!best || v.cost < best.costUsd) best = { costUsd: v.cost, count, operator: op };
  }
  return best; // { costUsd, count, operator } | null
}

// Buy. 5SIM: GET /user/buy/activation/{country}/{operator}/{product}. Use 'any' operator for
// best availability. Returns { activationId, number, providerSessionId, costUsd }.
export async function buyNumber(gCountry, gService, userId = null) {
  const country = grizzlyToFivesimCountry(gCountry);
  const product = grizzlyToFivesimService(gService);
  if (!country || !product) { const e = new Error("SERVICE_NOT_SUPPORTED"); e.noStock = true; throw e; }
  const r = await call(`/user/buy/activation/${encodeURIComponent(country)}/any/${encodeURIComponent(product)}`, { action: "buyNumber", userId });
  if (!r.ok || !r.json || !r.json.id) {
    const t = (r.text || "").toLowerCase();
    const e = new Error(r.text || "5SIM_BUY_FAILED");
    if (t.includes("no free phones") || t.includes("out of stock") || t.includes("not available")) e.noStock = true;
    throw e;
  }
  // 5SIM phone comes with a leading '+' and country code already.
  // 5SIM returns an ISO `expires` timestamp — the provider's authoritative expiration.
  return { activationId: String(r.json.id), number: String(r.json.phone || "").replace(/^\+/, ""), providerSessionId: String(r.json.id), costUsd: Number(r.json.price) || 0, expiresAt: r.json.expires || null };
}

// Poll. GET /user/check/{id}. Statuses: PENDING, RECEIVED, CANCELED, TIMEOUT, FINISHED, BANNED.
export async function getSms(providerSessionId, userId = null) {
  const r = await call(`/user/check/${encodeURIComponent(providerSessionId)}`, { action: "getSms", userId });
  if (!r.ok || !r.json) return { status: "unknown", raw: r.text };
  const st = String(r.json.status || "").toUpperCase();
  const smsArr = Array.isArray(r.json.sms) ? r.json.sms : [];
  const code = smsArr.length ? (smsArr[smsArr.length - 1].code || null) : null;
  if (code) return { status: "completed", code };
  if (st === "CANCELED" || st === "TIMEOUT" || st === "BANNED") return { status: "cancelled" };
  return { status: "waiting" };
}
export async function getOrderStatus(providerSessionId, userId = null) { return getSms(providerSessionId, userId); }

// Cancel. GET /user/cancel/{id}.
export async function cancelActivation(providerSessionId, userId = null) {
  const r = await call(`/user/cancel/${encodeURIComponent(providerSessionId)}`, { action: "cancelActivation", userId });
  if (!r.ok) { throw new Error(r.text || "5SIM_CANCEL_FAILED"); }
  return r.text || "ok";
}

// Complete/finish. GET /user/finish/{id}.
export async function completeActivation(providerSessionId, userId = null) {
  try { const r = await call(`/user/finish/${encodeURIComponent(providerSessionId)}`, { action: "completeActivation", userId }); return r.text || "ok"; }
  catch (e) { return null; }
}
