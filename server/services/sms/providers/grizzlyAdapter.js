// ============================================================================
//  GrizzlySMS adapter — the production reference provider.
//  This is a THIN wrapper around the existing, untouched services/grizzlySms.js so the
//  proven Grizzly logic keeps running exactly as before. It only re-shapes results into the
//  common provider interface. Canonical codes ARE Grizzly codes, so no mapping is needed here.
// ============================================================================
import {
  getGrizzlyBalance, getCatalog, getLivePrice, allocateNumber, pollSmsCode, setActivationStatus,
} from "../../grizzlySms.js";
import { dbGet } from "../../../db.js";
import { logProviderCall } from "../smsLog.js";
import { serviceDisplayName } from "../serviceNames.js";

export const id = "grizzly";
export const label = "GrizzlySMS";

// ——— Grizzly official service-name list (code -> real name) ———
// Grizzly exposes ALL ~2400 service names via action=getServicesList. We cache it (6h) and use
// it as the display-name source so customers never see raw 2-letter codes. Our central
// serviceNames map still overrides the top brands for clean/consistent casing.
let _svcNameCache = { map: null, at: 0 };
const SVC_NAME_TTL = 6 * 60 * 60 * 1000;
async function grizzlyServiceNameMap() {
  if (_svcNameCache.map && Date.now() - _svcNameCache.at < SVC_NAME_TTL) return _svcNameCache.map;
  const t0 = Date.now();
  try {
    let apiKey = process.env.GRIZZLY_SMS_API_KEY || "f502c10b7d5a89b00981b25d0631cc42";
    let baseUrl = "https://api.grizzlysms.com/stubs/handler_api.php";
    try { const row = await dbGet("SELECT grizzly_api_key, sms_api_url FROM settings LIMIT 1"); if (row) { if (row.grizzly_api_key) apiKey = row.grizzly_api_key; if (row.sms_api_url) baseUrl = row.sms_api_url; } } catch (e) {}
    const url = `${baseUrl}?api_key=${encodeURIComponent(apiKey)}&action=getServicesList`;
    const res = await fetch(url);
    const data = await res.json();
    const map = {};
    for (const s of (data.services || [])) if (s && s.code) map[String(s.code)] = s.name || String(s.code);
    _svcNameCache = { map, at: Date.now() };
    await logProviderCall({ provider: id, action: "getServicesList", response: `${Object.keys(map).length} names`, latencyMs: Date.now() - t0 });
    return map;
  } catch (e) {
    await logProviderCall({ provider: id, action: "getServicesList", response: e.message, status: "fail", latencyMs: Date.now() - t0 });
    return _svcNameCache.map || {}; // fall back to last-good (or empty)
  }
}

export async function getBalance() {
  const t0 = Date.now();
  const balance = await getGrizzlyBalance();
  await logProviderCall({ provider: id, action: "getBalance", response: balance, latencyMs: Date.now() - t0 });
  return balance; // USD
}

// Countries/services/prices for Grizzly come from getCatalog(); the existing seeder already
// populates sms_countries/sms_services from this. Exposed for interface completeness.
export async function getCountries() { const c = await getCatalog(); return c.countries; }
export async function getServices() { const c = await getCatalog(); return c.prices; }
export async function getPrices() { const c = await getCatalog(); return c.prices; }

// ——— NATIVE POOL METHODS (provider-independent architecture) ———
// Grizzly's native ids ARE our canonical codes, so this is a direct pass-through of Grizzly's
// OWN catalog with no translation. Native country id = Grizzly numeric id; native service id =
// Grizzly service code (e.g. "wa","tg"). A readable name map improves display without inventing data.
const GRIZZLY_SERVICE_NAMES = {
  wa: "WhatsApp", tg: "Telegram", ig: "Instagram", fb: "Facebook", go: "Google/Gmail", ds: "Discord",
  tw: "Twitter/X", vi: "Viber", mm: "Microsoft", nf: "Netflix", ub: "Uber", dr: "OpenAI/ChatGPT",
  am: "Amazon", ap: "Apple", gv: "Google Voice", wc: "WeChat", lf: "TikTok/Douyin", ot: "Any Other",
};

// List Grizzly's own countries (only those that currently have priced services). Returns
// [{ id, name }]. Names come straight from Grizzly's getCountries (no invention).
export async function getNativeCountries() {
  const c = await getCatalog();
  const prices = c.prices || {}, countries = c.countries || {};
  const out = [];
  for (const cid of Object.keys(prices)) {
    const node = countries[cid];
    out.push({ id: String(cid), name: (node && (node.eng || node.rus)) || `Country ${cid}`, prefix: "", iso: "" });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// List Grizzly's own services for one native country, with live price + stock — straight from
// getPrices. Returns [{ id, name, price(USD), stock }].
export async function getNativeServices(nativeCountry) {
  const [c, officialNames] = await Promise.all([getCatalog(), grizzlyServiceNameMap()]);
  const node = (c.prices || {})[String(nativeCountry)];
  if (!node || typeof node !== "object") return [];
  const out = [];
  for (const [code, v] of Object.entries(node)) {
    if (!v || v.cost === undefined) continue;
    // Name priority: our central brand map (clean casing) -> Grizzly's official name -> our
    // hardcoded fallback -> TitleCased code. Guarantees NO raw short code ever reaches the UI.
    const providerName = officialNames[code] || GRIZZLY_SERVICE_NAMES[code];
    out.push({ id: code, name: serviceDisplayName(code, providerName), price: Number(v.cost) || 0, stock: Number(v.count) || 0 });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Live price + stock for one native country+service. Returns { price(USD), stock } | null.
export async function getNativePrice(nativeCountry, nativeService) {
  try {
    const p = await getLivePrice(nativeCountry, nativeService);
    return { price: Number(p.cost) || 0, stock: Number(p.count) || 0 };
  } catch (e) { return null; }
}

// Buy using Grizzly's OWN native country+service codes (no translation).
// Returns { providerOrderId, number, expiresAt, priceUsd }.
export async function buyNative(nativeCountry, nativeService) {
  const a = await allocateNumber(nativeCountry, nativeService);
  return { providerOrderId: String(a.id), number: String(a.number || ""), expiresAt: null, priceUsd: 0 };
}

// Price for a canonical (grizzly) country+service. Returns { costUsd, count } or null.
export async function getPrice(country, service) {
  const t0 = Date.now();
  try {
    const p = await getLivePrice(country, service);
    await logProviderCall({ provider: id, action: "getPrice", request: `${country}/${service}`, response: p, latencyMs: Date.now() - t0 });
    return { costUsd: p.cost, count: p.count };
  } catch (e) {
    await logProviderCall({ provider: id, action: "getPrice", request: `${country}/${service}`, response: e.message, status: "fail", latencyMs: Date.now() - t0 });
    if (e.code === "NO_DATA_FOR_SELECTION") return null;
    throw e;
  }
}

// Buy a number. Returns { activationId, number, providerSessionId, costUsd }.
export async function buyNumber(country, service) {
  const t0 = Date.now();
  try {
    const a = await allocateNumber(country, service);
    await logProviderCall({ provider: id, action: "buyNumber", request: `${country}/${service}`, response: a, latencyMs: Date.now() - t0 });
    // Grizzly reuses its activation id as our internal PK; providerSessionId == activationId.
    return { activationId: String(a.id), number: a.number, providerSessionId: String(a.id) };
  } catch (e) {
    await logProviderCall({ provider: id, action: "buyNumber", request: `${country}/${service}`, response: e.message, status: "fail", latencyMs: Date.now() - t0 });
    throw e;
  }
}

// Poll for the SMS code. Returns { status: 'waiting'|'completed'|'cancelled'|'unknown', code? }.
export async function getSms(providerSessionId) {
  return pollSmsCode(providerSessionId);
}
export async function getOrderStatus(providerSessionId) { return pollSmsCode(providerSessionId); }

// Cancel (setStatus=8) / complete (setStatus=6) — Grizzly's numeric status protocol.
export async function cancelActivation(providerSessionId) { return setActivationStatus(providerSessionId, 8); }
export async function completeActivation(providerSessionId) { try { return await setActivationStatus(providerSessionId, 6); } catch (e) { return null; } }
