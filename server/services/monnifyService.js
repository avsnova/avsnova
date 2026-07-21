// Monnify payment provider service.
// All secrets are sourced from DB settings first, then environment variables — NEVER hardcoded.
// Switching Sandbox <-> Live requires only changing credentials + environment in settings.
//
// Official API base URLs:
//   Sandbox:    https://sandbox.monnify.com
//   Production:  https://api.monnify.com
//
// Auth: OAuth2 Basic (base64 of "apiKey:secretKey") -> POST /api/v1/auth/login -> bearer token.

import { dbGet, fetchWithTimeout } from "../db.js";

const SANDBOX_BASE = "https://sandbox.monnify.com";
const LIVE_BASE = "https://api.monnify.com";

// Small in-memory token cache to avoid re-authenticating on every call.
let _tokenCache = { token: null, expiresAt: 0, keyFingerprint: "" };

export async function getMonnifyConfig() {
  let row = null;
  try {
    row = await dbGet(
      "SELECT monnify_api_key, monnify_secret_key, monnify_contract_code, monnify_webhook_secret, monnify_environment, monnify_currency, monnify_enabled FROM settings LIMIT 1"
    );
  } catch (e) { /* settings may not exist yet during early boot */ }
  const environment = (row && row.monnify_environment) || process.env.MONNIFY_ENVIRONMENT || "sandbox";
  const base = process.env.MONNIFY_BASE_URL || (environment === "live" ? LIVE_BASE : SANDBOX_BASE);
  return {
    apiKey: (row && row.monnify_api_key) || process.env.MONNIFY_API_KEY || "",
    secretKey: (row && row.monnify_secret_key) || process.env.MONNIFY_SECRET_KEY || "",
    contractCode: (row && row.monnify_contract_code) || process.env.MONNIFY_CONTRACT_CODE || "",
    // Monnify signs webhooks with the SECRET KEY (SHA-512 HMAC). A separate webhook secret is
    // supported too if the merchant configured one; falls back to the secret key.
    webhookSecret: (row && row.monnify_webhook_secret) || process.env.MONNIFY_WEBHOOK_SECRET || (row && row.monnify_secret_key) || process.env.MONNIFY_SECRET_KEY || "",
    environment,
    currency: (row && row.monnify_currency) || process.env.MONNIFY_CURRENCY || "NGN",
    enabled: row ? row.monnify_enabled === 1 : false,
    baseUrl: base,
  };
}

// Authenticate and return a bearer access token (cached until ~1 min before expiry).
export async function getMonnifyToken(cfg) {
  if (!cfg.apiKey || !cfg.secretKey) throw new Error("Monnify credentials are not configured.");
  const fingerprint = `${cfg.baseUrl}|${cfg.apiKey}`;
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.expiresAt > now && _tokenCache.keyFingerprint === fingerprint) {
    return _tokenCache.token;
  }
  const basic = Buffer.from(`${cfg.apiKey}:${cfg.secretKey}`).toString("base64");
  const resp = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  });
  const json = await resp.json().catch(() => ({}));
  const token = json && json.responseBody && json.responseBody.accessToken;
  if (!resp.ok || !json.requestSuccessful || !token) {
    throw new Error((json && json.responseMessage) || `Monnify auth failed (HTTP ${resp.status}).`);
  }
  const expiresInSec = (json.responseBody.expiresIn && Number(json.responseBody.expiresIn)) || 3000;
  _tokenCache = { token, expiresAt: now + Math.max(30, expiresInSec - 60) * 1000, keyFingerprint: fingerprint };
  return token;
}

// Create a reserved (dedicated) account for a customer. Returns the parsed responseBody.
export async function createMonnifyReservedAccount({ accountReference, accountName, customerEmail, customerName }, cfgIn) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const resp = await fetchWithTimeout(`${cfg.baseUrl}/api/v2/bank-transfer/reserved-accounts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      accountReference,
      accountName,
      currencyCode: cfg.currency || "NGN",
      contractCode: cfg.contractCode,
      customerEmail,
      customerName,
      getAllAvailableBanks: true,
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful || !json.responseBody) {
    throw new Error((json && json.responseMessage) || `Reserved account creation failed (HTTP ${resp.status}).`);
  }
  return json.responseBody;
}

// Fetch the details of an existing reserved account by our accountReference.
// Used to recover gracefully when Monnify already has an account for this reference
// (their API enforces one reserved account per customer).
export async function getMonnifyReservedAccountDetails(accountReference, cfgIn) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const resp = await fetchWithTimeout(`${cfg.baseUrl}/api/v2/bank-transfer/reserved-accounts/${encodeURIComponent(accountReference)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful || !json.responseBody) return null;
  return json.responseBody;
}

// Verify a transaction by its Monnify transactionReference. Returns parsed responseBody or null.
export async function verifyMonnifyTransaction(transactionReference, cfgIn) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const url = `${cfg.baseUrl}/api/v2/transactions/${encodeURIComponent(transactionReference)}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful) {
    return { ok: false, message: (json && json.responseMessage) || `Verify failed (HTTP ${resp.status})`, raw: json };
  }
  return { ok: true, data: normalizeMonnifyTxn(json.responseBody), raw: json };
}

// Verify a transaction by OUR paymentReference (used when we don't have Monnify's txRef, e.g.
// reserved-account transfers or checkout rows initialized before a txRef was stored).
export async function verifyMonnifyByPaymentReference(paymentReference, cfgIn) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const url = `${cfg.baseUrl}/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful) {
    return { ok: false, message: (json && json.responseMessage) || `Query failed (HTTP ${resp.status})`, raw: json };
  }
  return { ok: true, data: normalizeMonnifyTxn(json.responseBody), raw: json };
}

// List transactions that hit a user's reserved (dedicated) account, direct from Monnify.
// This is the authoritative source for reserved-account funding — it does NOT depend on a
// pre-existing local payment row or on the webhook being delivered. Returns normalized txns.
export async function listMonnifyReservedAccountTransactions(accountReference, cfgIn, { page = 0, size = 10 } = {}) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const url = `${cfg.baseUrl}/api/v1/bank-transfer/reserved-accounts/transactions?accountReference=${encodeURIComponent(accountReference)}&page=${page}&size=${size}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful) {
    return { ok: false, message: (json && json.responseMessage) || `List failed (HTTP ${resp.status})`, raw: json, transactions: [] };
  }
  const content = (json.responseBody && json.responseBody.content) || [];
  return { ok: true, transactions: content.map(normalizeMonnifyTxn).filter(Boolean), raw: json };
}

// Normalize the many field-name variations Monnify uses across endpoints/webhooks into one shape.
// - status: paymentStatus | transactionStatus  (e.g. "PAID")
// - amountPaid: may arrive as a string ("12345.00") -> Number
// - currency: currency | currencyCode
// - transactionReference / paymentReference
// - accountReference: product.reference (reserved-account link)
export function normalizeMonnifyTxn(b) {
  if (!b || typeof b !== "object") return null;
  const amountPaidRaw = b.amountPaid !== undefined ? b.amountPaid : (b.amount !== undefined ? b.amount : b.payableAmount);
  return {
    ...b,
    _status: String(b.paymentStatus || b.transactionStatus || "").toUpperCase(),
    _amountPaid: Number(amountPaidRaw),
    _currency: String(b.currency || b.currencyCode || "NGN").toUpperCase(),
    _transactionReference: b.transactionReference || null,
    _paymentReference: b.paymentReference || null,
    _accountReference: (b.product && b.product.reference) || b.accountReference || null,
  };
}

// Initialize a one-off checkout transaction (hosted payment). Returns { checkoutUrl, transactionReference }.
export async function initMonnifyTransaction({ amount, customerName, customerEmail, paymentReference, paymentDescription, redirectUrl }, cfgIn) {
  const cfg = cfgIn || (await getMonnifyConfig());
  const token = await getMonnifyToken(cfg);
  const resp = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      customerName,
      customerEmail,
      paymentReference,
      paymentDescription: paymentDescription || "AVS Wallet Funding",
      currencyCode: cfg.currency || "NGN",
      contractCode: cfg.contractCode,
      redirectUrl: redirectUrl || "",
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.requestSuccessful || !json.responseBody) {
    throw new Error((json && json.responseMessage) || `Init transaction failed (HTTP ${resp.status}).`);
  }
  return json.responseBody;
}
