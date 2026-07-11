// ============================================================================
//  GrizzlySMS adapter — the production reference provider.
//  This is a THIN wrapper around the existing, untouched services/grizzlySms.js so the
//  proven Grizzly logic keeps running exactly as before. It only re-shapes results into the
//  common provider interface. Canonical codes ARE Grizzly codes, so no mapping is needed here.
// ============================================================================
import {
  getGrizzlyBalance, getCatalog, getLivePrice, allocateNumber, pollSmsCode, setActivationStatus,
} from "../../grizzlySms.js";
import { logProviderCall } from "../smsLog.js";

export const id = "grizzly";
export const label = "GrizzlySMS";

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
