// ============================================================================
//  PalmPay payment adapter (scaffold).
//
//  Implements the standard payment-adapter interface so PalmPay can be wired into the wallet
//  funding flow the moment real credentials are supplied. Credentials come exclusively from the
//  registry (DB settings -> env), never hardcoded. Until keys are configured, every call returns
//  a clear NOT_CONFIGURED error instead of pretending to work.
//
//  To go live:
//    1. Put PALMPAY_PUBLIC_KEY / PALMPAY_SECRET_KEY / PALMPAY_MERCHANT_ID in .env (or admin settings).
//    2. Set PALMPAY_ENVIRONMENT=production (default "sandbox").
//    3. Fill in the two TODOs below with PalmPay's real initialize/verify REST calls.
// ============================================================================
import { getProviderConfig } from "../registry.js";

const SANDBOX_BASE = "https://api.palmpay-sandbox.com"; // replace with the exact base from PalmPay docs
const LIVE_BASE = "https://api.palmpay.com";

function baseUrl(environment) {
  return environment === "production" || environment === "live" ? LIVE_BASE : SANDBOX_BASE;
}

export async function getConfig() {
  return getProviderConfig("palmpay");
}

// Start a payment. Returns a checkout URL / reference the frontend can redirect to.
export async function initializePayment({ amount, email, reference, redirectUrl }) {
  const cfg = await getConfig();
  if (!cfg.configured) {
    const e = new Error("PalmPay is not configured. Add PALMPAY_* credentials to enable it.");
    e.code = "NOT_CONFIGURED";
    throw e;
  }
  // TODO: call PalmPay's create-order endpoint using cfg.credentials + baseUrl(cfg.environment).
  //   const res = await fetch(`${baseUrl(cfg.environment)}/...`, { headers: { Authorization: ... } });
  const e = new Error("PalmPay initializePayment not yet implemented. Fill in the REST call in palmpayAdapter.js.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

// Verify a payment server-side before crediting the wallet. MUST confirm amount + success status.
export async function verifyPayment(reference) {
  const cfg = await getConfig();
  if (!cfg.configured) {
    const e = new Error("PalmPay is not configured.");
    e.code = "NOT_CONFIGURED";
    throw e;
  }
  // TODO: call PalmPay's query-order endpoint and return { success, amount, currency, raw }.
  const e = new Error("PalmPay verifyPayment not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

// Validate an inbound webhook signature. Returns the parsed, verified event or throws.
export async function verifyWebhook(_rawBody, _headers) {
  const e = new Error("PalmPay webhook verification not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

export { baseUrl };
