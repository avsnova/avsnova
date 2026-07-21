import crypto from "crypto";
import { dbGet, fetchWithTimeout } from "../db.js";

// Load configuration variables with production defaults (database-first, then process.env)
const getPagaConfig = async () => {
  let dbSettings = null;
  try {
    dbSettings = await dbGet("SELECT paga_public_key, paga_secret_key, paga_hash_key, paga_base_url FROM settings LIMIT 1");
  } catch (err) {
    // Database may not be initialized yet during early boot imports
  }

  // Credentials come ONLY from DB settings or environment variables — never hardcoded in source.
  // baseUrl defaults to Paga's sandbox host; switch to the live host once CAC/business approval
  // is complete by setting PAGA_BASE_URL (or the admin setting) to https://collect.paga.com/.
  return {
    publicKey: (dbSettings && dbSettings.paga_public_key) || process.env.PAGA_PUBLIC_KEY || "",
    secretKey: (dbSettings && dbSettings.paga_secret_key) || process.env.PAGA_SECRET_KEY || "",
    hashKey: (dbSettings && dbSettings.paga_hash_key) || process.env.PAGA_HASH_KEY || "",
    baseUrl: (dbSettings && dbSettings.paga_base_url) || process.env.PAGA_BASE_URL || "https://beta-collect.paga.com/"
  };
};

// SHA-512 Hash Generation Helper (Plain SHA512)
export function computeSha512(stringData) {
  return crypto.createHash("sha512").update(stringData).digest("hex");
}

// Basic Auth Header Generator
function getBasicAuthHeader(publicKey, secretKey) {
  const credentials = `${publicKey}:${secretKey}`;
  const base64Creds = Buffer.from(credentials).toString("base64");
  return `Basic ${base64Creds}`;
}

// 1. Create Persistent Payment Account - POST /registerPersistentPaymentAccount
export async function createPagaPersistentPaymentAccount({
  referenceNumber,
  accountName,
  firstName,
  lastName,
  accountReference,
  email,
  phoneNumber,
  financialIdentificationNumber,
  creditBankId,
  creditBankAccountNumber,
  callbackUrl
}) {
  const config = await getPagaConfig();
  const url = `${config.baseUrl.replace(/\/$/, "")}/registerPersistentPaymentAccount`;

  // Hash per official Paga Collect docs (exact order, optional empty fields omitted but order kept):
  // SHA-512(referenceNumber + accountReference + financialIdentificationNumber + creditBankId
  //         + creditBankAccountNumber + callbackUrl + hashKey)
  // NOTE: `financialIdentificationNumber` MUST be included in the hash when present — omitting it
  // was the cause of the 401 (hash mismatch → Paga rejects the request as unauthenticated).
  let hashString = `${referenceNumber}${accountReference}`;
  if (financialIdentificationNumber) hashString += financialIdentificationNumber;
  if (creditBankId) hashString += creditBankId;
  if (creditBankAccountNumber) hashString += creditBankAccountNumber;
  if (callbackUrl) hashString += callbackUrl;
  hashString += config.hashKey;

  const computedHash = computeSha512(hashString);

  const requestBody = {
    referenceNumber,
    phoneNumber: phoneNumber || undefined,
    firstName,
    lastName,
    accountName,
    accountReference,
    email: email || undefined,
    financialIdentificationNumber: financialIdentificationNumber || undefined,
    creditBankId: creditBankId || undefined,
    creditBankAccountNumber: creditBankAccountNumber || undefined,
    callbackUrl: callbackUrl || undefined
  };

  // Paga's Collect API documents TWO equivalent auth conventions across its guides/libraries:
  //   (a) HTTP Basic auth:  Authorization: Basic base64(publicKey:secretKey)
  //   (b) Separate headers: principal: publicKey, credentials: secretKey
  // We send BOTH so the request authenticates regardless of which the gateway expects — this,
  // together with the corrected hash, resolves the 401.
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": getBasicAuthHeader(config.publicKey, config.secretKey),
    "principal": config.publicKey,
    "credentials": config.secretKey,
    "hash": computedHash
  };

  console.log(`[Paga Service] Outbound Persistent Wallet Account Creation Post: ${url}`, JSON.stringify(requestBody));

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const rawText = await response.text();
    console.error(`[Paga Service Error] Paga API rejected request. Status: ${response.status}. Body:`, rawText);
    if (response.status === 401) {
      throw new Error(`Paga authentication failed (401): the public/secret key pair was rejected by Paga. Verify the collect API keys in your Paga Business dashboard match the configured Public Key and Secret Key, and that the account is enabled for the Collect (beta) environment.`);
    }
    throw new Error(`Paga API Error: ${response.status} - ${rawText}`);
  }

  return response.json();
}

// 2. Get Persistent Payment Account details - POST /getPersistentPaymentAccount
export async function getPagaPersistentPaymentAccount(accountIdentifier, referenceNumber) {
  const config = await getPagaConfig();
  const url = `${config.baseUrl.replace(/\/$/, "")}/getPersistentPaymentAccount`;

  // Hash formula: referenceNumber + accountIdentifier + hashKey (Plain SHA-512)
  const hashString = `${referenceNumber}${accountIdentifier}${config.hashKey}`;
  const computedHash = computeSha512(hashString);

  const requestBody = {
    referenceNumber,
    accountIdentifier
  };

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": getBasicAuthHeader(config.publicKey, config.secretKey),
    "principal": config.publicKey,
    "credentials": config.secretKey,
    "hash": computedHash
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const rawText = await response.text();
    console.error(`[Paga Service Error] getPagaPersistentPaymentAccount failed. Status: ${response.status}. Body:`, rawText);
    if (response.status === 401) {
      throw new Error(`Paga authentication failed (401): the public/secret key pair was rejected by Paga. Verify your Collect API keys.`);
    }
    throw new Error(`Paga API Error: ${response.status} - ${rawText}`);
  }

  return response.json();
}
export default createPagaPersistentPaymentAccount;
