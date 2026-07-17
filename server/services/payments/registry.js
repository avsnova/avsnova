// ============================================================================
//  Payment Provider Registry — modular, env-first payment configuration.
//
//  PURPOSE
//  A single, consistent place that describes every payment provider the platform can use and
//  how its credentials are resolved. Adding a new gateway (e.g. PalmPay, Nomba) means adding
//  one entry here + a thin adapter file — no scattered edits, no hardcoded secrets.
//
//  SECRET RESOLUTION ORDER (never hardcode a secret anywhere):
//    1. Admin-managed DB `settings` column  (lets the operator rotate keys from the panel)
//    2. Environment variable                (the .env on the server)
//    3. Safe default / empty                (feature simply stays inactive until configured)
//
//  SANDBOX <-> LIVE
//  Each provider exposes an `environment` ("sandbox" | "live"/"production") resolved the same way.
//  Switching to production is a credentials-only change — code never changes.
// ============================================================================
import { dbGet } from "../../db.js";

// Read the single settings row once per call (cheap; SQLite/MySQL both fast). Returns {} on early boot.
async function settingsRow() {
  try { return (await dbGet("SELECT * FROM settings LIMIT 1")) || {}; }
  catch { return {}; }
}

// Pick the first non-empty value: DB column -> env var -> fallback.
function pick(row, dbCol, envKey, fallback = "") {
  const dbVal = dbCol && row && row[dbCol];
  if (dbVal !== undefined && dbVal !== null && String(dbVal).trim() !== "") return String(dbVal);
  const envVal = envKey && process.env[envKey];
  if (envVal !== undefined && envVal !== null && String(envVal).trim() !== "") return String(envVal);
  return fallback;
}

// ─── Provider descriptors ──────────────────────────────────────────────────
// `credentials` maps a logical field -> { db, env } sources. `publicFields` may be safely
// returned to the browser; everything else is server-only and NEVER exposed.
export const PROVIDERS = {
  paystack: {
    id: "paystack",
    label: "Paystack",
    methodName: "Paystack",                // matches the payment_methods table row
    docs: "https://dashboard.paystack.com/#/settings/developers",
    credentials: {
      publicKey: { db: "paystack_public_key", env: "PAYSTACK_PUBLIC_KEY" },
      secretKey: { db: "paystack_secret_key", env: "PAYSTACK_SECRET_KEY" },
    },
    publicFields: ["publicKey"],
  },
  flutterwave: {
    id: "flutterwave",
    label: "Flutterwave",
    methodName: "Flutterwave",
    docs: "https://dashboard.flutterwave.com/settings/apis",
    credentials: {
      publicKey: { db: "flutterwave_public_key", env: "FLUTTERWAVE_PUBLIC_KEY" },
      secretKey: { db: "flutterwave_secret_key", env: "FLUTTERWAVE_SECRET_KEY" },
      encryptionKey: { db: "flutterwave_encryption_key", env: "FLUTTERWAVE_ENCRYPTION_KEY" },
      webhookHash: { db: "flutterwave_webhook_hash", env: "FLUTTERWAVE_WEBHOOK_HASH" },
    },
    envField: { db: "flutterwave_environment", env: "FLUTTERWAVE_ENVIRONMENT" },
    currencyField: { db: "flutterwave_currency", env: "FLUTTERWAVE_CURRENCY", fallback: "NGN" },
    publicFields: ["publicKey"],
  },
  monnify: {
    id: "monnify",
    label: "Monnify",
    methodName: "Monnify",
    docs: "https://app.monnify.com",
    credentials: {
      apiKey: { db: "monnify_api_key", env: "MONNIFY_API_KEY" },
      secretKey: { db: "monnify_secret_key", env: "MONNIFY_SECRET_KEY" },
      contractCode: { db: "monnify_contract_code", env: "MONNIFY_CONTRACT_CODE" },
      webhookSecret: { db: "monnify_webhook_secret", env: "MONNIFY_WEBHOOK_SECRET" },
    },
    envField: { db: "monnify_environment", env: "MONNIFY_ENVIRONMENT" },
    currencyField: { db: "monnify_currency", env: "MONNIFY_CURRENCY", fallback: "NGN" },
    publicFields: [],
  },
  paga: {
    id: "paga",
    label: "Paga",
    methodName: "Paga Subsidiary Accounts",
    docs: "https://www.paga.com",
    credentials: {
      publicKey: { db: "paga_public_key", env: "PAGA_PUBLIC_KEY" },
      secretKey: { db: "paga_secret_key", env: "PAGA_SECRET_KEY" },
      hashKey: { db: "paga_hash_key", env: "PAGA_HASH_KEY" },
    },
    baseUrlField: { db: "paga_base_url", env: "PAGA_BASE_URL", fallback: "https://collect.paga.com/" },
    publicFields: ["publicKey"],
  },

  // ─── Ready-to-activate providers (add real keys in .env / admin settings) ───
  // These have no bespoke endpoints yet; wire an adapter (see ./adapters/) when integrating.
  palmpay: {
    id: "palmpay",
    label: "PalmPay",
    methodName: "PalmPay",
    docs: "https://www.palmpay.com/business",
    credentials: {
      publicKey: { db: "palmpay_public_key", env: "PALMPAY_PUBLIC_KEY" },
      secretKey: { db: "palmpay_secret_key", env: "PALMPAY_SECRET_KEY" },
      merchantId: { db: "palmpay_merchant_id", env: "PALMPAY_MERCHANT_ID" },
    },
    envField: { db: "palmpay_environment", env: "PALMPAY_ENVIRONMENT" },
    publicFields: [],
  },
  nomba: {
    id: "nomba",
    label: "Nomba",
    methodName: "Nomba",
    docs: "https://docs.nomba.com",
    credentials: {
      clientId: { db: "nomba_client_id", env: "NOMBA_CLIENT_ID" },
      privateKey: { db: "nomba_private_key", env: "NOMBA_PRIVATE_KEY" },
      accountId: { db: "nomba_account_id", env: "NOMBA_ACCOUNT_ID" },
    },
    envField: { db: "nomba_environment", env: "NOMBA_ENVIRONMENT" },
    publicFields: [],
  },
};

// Resolve a provider's full config (secrets included). Server-side use only.
export async function getProviderConfig(providerId) {
  const desc = PROVIDERS[providerId];
  if (!desc) throw new Error(`Unknown payment provider: ${providerId}`);
  const row = await settingsRow();

  const credentials = {};
  for (const [field, src] of Object.entries(desc.credentials || {})) {
    credentials[field] = pick(row, src.db, src.env, src.fallback || "");
  }

  const environment = desc.envField
    ? (pick(row, desc.envField.db, desc.envField.env, "sandbox") || "sandbox").toLowerCase()
    : "live";
  const currency = desc.currencyField ? pick(row, desc.currencyField.db, desc.currencyField.env, desc.currencyField.fallback || "NGN") : undefined;
  const baseUrl = desc.baseUrlField ? pick(row, desc.baseUrlField.db, desc.baseUrlField.env, desc.baseUrlField.fallback || "") : undefined;

  // "Configured" = every credential field has a value.
  const configured = Object.values(credentials).every((v) => String(v || "").trim() !== "");

  return { id: desc.id, label: desc.label, methodName: desc.methodName, environment, currency, baseUrl, credentials, configured };
}

// Browser-safe view: only whitelisted public fields + booleans. NEVER leaks secrets.
export async function getProviderPublicConfig(providerId) {
  const desc = PROVIDERS[providerId];
  if (!desc) throw new Error(`Unknown payment provider: ${providerId}`);
  const cfg = await getProviderConfig(providerId);
  const publicCreds = {};
  for (const f of desc.publicFields || []) publicCreds[f] = cfg.credentials[f] || "";
  return { id: cfg.id, label: cfg.label, environment: cfg.environment, currency: cfg.currency, configured: cfg.configured, ...publicCreds };
}

// Admin overview: which providers exist, whether each is configured, its environment, and
// which credential fields are set (booleans only — never the values).
export async function getProvidersStatus() {
  const out = [];
  for (const id of Object.keys(PROVIDERS)) {
    const cfg = await getProviderConfig(id);
    const hasKey = {};
    for (const f of Object.keys(PROVIDERS[id].credentials || {})) hasKey[f] = String(cfg.credentials[f] || "").trim() !== "";
    out.push({ id: cfg.id, label: cfg.label, methodName: cfg.methodName, environment: cfg.environment, configured: cfg.configured, hasKey, docs: PROVIDERS[id].docs });
  }
  return out;
}

export function listProviderIds() { return Object.keys(PROVIDERS); }
