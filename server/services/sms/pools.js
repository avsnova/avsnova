// ============================================================================
//  SMS POOLS — provider-independent architecture (complete rebuild).
//
//  A "pool" is one real provider behind a neutral, admin-renamable label the customer sees
//  ("Pool 1"). Each pool loads ONLY its own provider's NATIVE catalog (native country + service
//  ids, live price, live stock) with ZERO cross-provider translation. Catalogs are never merged,
//  so a country/service from one provider can never leak into another — this structurally
//  eliminates the country/service mismatch class of bugs.
//
//  FIRST RULE: never invent data. Every country/service/price/stock returned here comes directly
//  from the provider API via the adapter's native methods. If the provider call fails we surface
//  an error — we never fall back to fabricated or cached-hardcoded data.
// ============================================================================
import { dbAll, dbGet } from "../../db.js";
import * as grizzly from "./providers/grizzlyAdapter.js";
import * as fivesim from "./providers/fivesimAdapter.js";
import * as smspool from "./providers/smspoolAdapter.js";

const ADAPTERS = { grizzly, fivesim, smspool };

// USD→NGN. Kept identical to the existing SMS route so pricing stays consistent.
const USD_NGN = 1623.50;

export function usdToNgn(usd) { return Math.round((Number(usd) || 0) * USD_NGN); }

// Apply a pool's configured markup to a provider USD cost. Returns NGN breakdown.
export function applyMarkup(pool, providerUsd) {
  const providerNgn = usdToNgn(providerUsd);
  let markupNgn = 0;
  if (pool.markup_type === "percent") markupNgn = Math.round(providerNgn * (Number(pool.markup_value) || 0) / 100);
  else markupNgn = Math.round(Number(pool.markup_value) || 0); // flat NGN
  return { providerNgn, markupNgn, finalNgn: providerNgn + markupNgn };
}

// All pools (admin view — includes disabled/hidden).
export async function getAllPools() {
  return dbAll("SELECT * FROM sms_pools ORDER BY sort_order ASC").catch(() => []);
}

// Pools visible to customers: enabled AND not hidden.
export async function getCustomerPools() {
  const rows = await dbAll("SELECT id, provider, label, sort_order, markup_type, markup_value FROM sms_pools WHERE enabled = 1 AND hidden = 0 ORDER BY sort_order ASC").catch(() => []);
  return rows;
}

export async function getPool(poolId) {
  return dbGet("SELECT * FROM sms_pools WHERE id = ?", [poolId]).catch(() => null);
}

function adapterFor(pool) {
  if (!pool) return null;
  return ADAPTERS[pool.provider] || null;
}

// ——— Catalog (native, per-pool) ———

// Countries for ONE pool, straight from its provider. Throws on provider failure (never fakes).
export async function poolCountries(poolId) {
  const pool = await getPool(poolId);
  if (!pool || pool.enabled !== 1) { const e = new Error("POOL_UNAVAILABLE"); e.code = "POOL_UNAVAILABLE"; throw e; }
  const a = adapterFor(pool);
  if (!a || !a.getNativeCountries) { const e = new Error("POOL_NOT_SUPPORTED"); e.code = "POOL_NOT_SUPPORTED"; throw e; }
  return a.getNativeCountries();
}

// Services (with live price + stock + final customer price) for ONE pool + native country.
export async function poolServices(poolId, nativeCountry) {
  const pool = await getPool(poolId);
  if (!pool || pool.enabled !== 1) { const e = new Error("POOL_UNAVAILABLE"); e.code = "POOL_UNAVAILABLE"; throw e; }
  const a = adapterFor(pool);
  if (!a || !a.getNativeServices) { const e = new Error("POOL_NOT_SUPPORTED"); e.code = "POOL_NOT_SUPPORTED"; throw e; }
  const svcs = await a.getNativeServices(nativeCountry);
  return svcs.map((s) => {
    const price = applyMarkup(pool, s.price);
    return {
      id: s.id, name: s.name, stock: s.stock,
      inStock: (s.stock == null) ? true : s.stock > 0,
      providerPriceNgn: price.providerNgn, markupNgn: price.markupNgn, priceNgn: price.finalNgn,
      successRate: s.successRate ?? null,
    };
  });
}

// Live price for ONE pool + native country + native service. Returns full breakdown or throws.
export async function poolPrice(poolId, nativeCountry, nativeService) {
  const pool = await getPool(poolId);
  if (!pool || pool.enabled !== 1) { const e = new Error("POOL_UNAVAILABLE"); e.code = "POOL_UNAVAILABLE"; throw e; }
  const a = adapterFor(pool);
  const p = await a.getNativePrice(nativeCountry, nativeService);
  if (!p) { const e = new Error("PRICE_UNAVAILABLE"); e.code = "PRICE_UNAVAILABLE"; throw e; }
  const price = applyMarkup(pool, p.price);
  return {
    providerPriceNgn: price.providerNgn, markupNgn: price.markupNgn, priceNgn: price.finalNgn,
    stock: p.stock, inStock: (p.stock == null) ? true : p.stock > 0, successRate: p.successRate ?? null,
    providerUsd: p.price,
  };
}

// Buy from ONE specific pool ONLY (no silent switching). Returns the provider result +
// the pool's final price. Throws (with .noStock where known) on failure — caller decides.
export async function poolBuy(poolId, nativeCountry, nativeService, userId = null) {
  const pool = await getPool(poolId);
  if (!pool || pool.enabled !== 1) { const e = new Error("POOL_UNAVAILABLE"); e.code = "POOL_UNAVAILABLE"; throw e; }
  const a = adapterFor(pool);
  const res = await a.buyNative(nativeCountry, nativeService, userId);
  return { pool, provider: pool.provider, ...res };
}

// Poll / cancel / complete for a pool order (provider is source of truth).
export async function poolGetSms(pool, providerOrderId, userId = null) {
  return adapterFor(pool).getSms(providerOrderId, userId);
}
export async function poolCancel(pool, providerOrderId, userId = null) {
  return adapterFor(pool).cancelActivation(providerOrderId, userId);
}

// Balance + connectivity test for a pool (admin).
export async function poolBalance(pool) { return adapterFor(pool).getBalance(); }
