// ============================================================================
//  Nomba payment adapter (scaffold).
//
//  Standard payment-adapter interface for Nomba. Credentials come from the registry
//  (DB settings -> env), never hardcoded. Returns clear NOT_CONFIGURED / NOT_IMPLEMENTED
//  errors until real credentials + REST calls are supplied.
//
//  To go live:
//    1. Put NOMBA_CLIENT_ID / NOMBA_PRIVATE_KEY / NOMBA_ACCOUNT_ID in .env (or admin settings).
//    2. Set NOMBA_ENVIRONMENT=production (default "sandbox").
//    3. Implement the TODOs using Nomba's OAuth token + checkout/verify endpoints
//       (see https://docs.nomba.com).
// ============================================================================
import { getProviderConfig } from "../registry.js";

const SANDBOX_BASE = "https://sandbox.nomba.com/v1"; // confirm exact base in Nomba docs
const LIVE_BASE = "https://api.nomba.com/v1";

function baseUrl(environment) {
  return environment === "production" || environment === "live" ? LIVE_BASE : SANDBOX_BASE;
}

export async function getConfig() {
  return getProviderConfig("nomba");
}

// Nomba uses OAuth client-credentials; fetch a bearer token before other calls.
export async function getAccessToken() {
  const cfg = await getConfig();
  if (!cfg.configured) {
    const e = new Error("Nomba is not configured. Add NOMBA_* credentials to enable it.");
    e.code = "NOT_CONFIGURED";
    throw e;
  }
  // TODO: POST clientId/privateKey to Nomba's /auth/token endpoint and return the access token.
  const e = new Error("Nomba getAccessToken not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

export async function initializePayment({ amount, email, reference, redirectUrl }) {
  const cfg = await getConfig();
  if (!cfg.configured) { const e = new Error("Nomba is not configured."); e.code = "NOT_CONFIGURED"; throw e; }
  // TODO: create a checkout order via Nomba and return its checkout link + reference.
  const e = new Error("Nomba initializePayment not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

export async function verifyPayment(reference) {
  const cfg = await getConfig();
  if (!cfg.configured) { const e = new Error("Nomba is not configured."); e.code = "NOT_CONFIGURED"; throw e; }
  // TODO: query the order status and return { success, amount, currency, raw }.
  const e = new Error("Nomba verifyPayment not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

export async function verifyWebhook(_rawBody, _headers) {
  const e = new Error("Nomba webhook verification not yet implemented.");
  e.code = "NOT_IMPLEMENTED";
  throw e;
}

export { baseUrl };
