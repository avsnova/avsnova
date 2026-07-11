import dotenv from 'dotenv';
import { dbGet } from '../db.js';
dotenv.config();

const KNOWN_ERRORS = new Set([
  'BAD_KEY',
  'NO_BALANCE',
  'NO_NUMBERS',
  'SERVICE_UNAVAILABLE_REGION',
  'BAD_SERVICE',
  'BAD_ACTION',
]);

async function callApi(params) {
  // Read dynamic credentials securely from Settings DB (Requirement 3!)
  let apiKey = process.env.GRIZZLY_SMS_API_KEY || "f502c10b7d5a89b00981b25d0631cc42";
  let baseUrl = 'https://api.grizzlysms.com/stubs/handler_api.php';

  try {
    const row = await dbGet("SELECT grizzly_api_key, sms_api_url FROM settings LIMIT 1");
    if (row) {
      if (row.grizzly_api_key) apiKey = row.grizzly_api_key;
      if (row.sms_api_url) baseUrl = row.sms_api_url;
    }
  } catch (err) {}

  const url = new URL(baseUrl);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  
  const res = await fetch(url.toString());
  const text = await res.text();
  
  if (KNOWN_ERRORS.has(text) || text.includes('ERROR_') || text.includes('BAD_')) {
    const err = new Error(text);
    err.code = text;
    throw err;
  }
  
  return text.trim();
}

let catalogCache = { data: null, fetchedAt: 0 };
const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCatalog({ forceRefresh = false } = {}) {
  const isStale = Date.now() - catalogCache.fetchedAt > CATALOG_TTL_MS;
  if (!forceRefresh && catalogCache.data && !isStale) {
    return catalogCache.data;
  }
  
  try {
    const pricesText = await callApi({ action: 'getPrices' });
    const prices = JSON.parse(pricesText);

    const countriesText = await callApi({ action: 'getCountries' });
    const countries = JSON.parse(countriesText);

    const combined = { prices, countries };
    catalogCache = { data: combined, fetchedAt: Date.now() };
    return combined;
  } catch (err) {
    console.error('[grizzlySms] Failed to fetch live GrizzlySMS catalog:', err.message);
    throw err;
  }
}

export async function getLivePrice(country, service) {
  if (!country || !service) {
    throw new Error('country and service are both required');
  }
  const text = await callApi({ action: 'getPrices', country, service });
  const data = JSON.parse(text);
  const countryData = data[country];
  const serviceData = countryData && countryData[service];
  if (!serviceData) {
    const err = new Error('NO_DATA_FOR_SELECTION');
    err.code = 'NO_DATA_FOR_SELECTION';
    throw err;
  }
  return {
    country,
    service,
    cost: serviceData.cost,
    count: serviceData.count,
  };
}

export async function allocateNumber(country, service) {
  if (!country || !service) {
    throw new Error('country and service are required');
  }
  const text = await callApi({ action: 'getNumber', country, service });
  if (text.startsWith("ACCESS_NUMBER:")) {
    const parts = text.split(":");
    return { id: parts[1], number: parts[2] };
  }
  throw new Error(text);
}

export async function pollSmsCode(id) {
  if (!id) throw new Error('activation id is required');
  const text = await callApi({ action: 'getStatus', id });
  if (text === "STATUS_WAIT_CODE") {
    return { status: "waiting" };
  }
  if (text.startsWith("STATUS_OK:")) {
    return { status: "completed", code: text.split(":")[1] };
  }
  if (text === "STATUS_CANCEL") {
    return { status: "cancelled" };
  }
  return { status: "unknown", raw: text };
}

export async function setActivationStatus(id, status) {
  if (!id || !status) throw new Error('id and status are required');
  const text = await callApi({ action: 'setStatus', id, status });
  return text;
}

// 5. Fetch Real GrizzlySMS API balance (Requirement 5!)
export async function getGrizzlyBalance() {
  try {
    const text = await callApi({ action: 'getBalance' });
    if (text.startsWith("ACCESS_BALANCE:")) {
      return parseFloat(text.split(":")[1]);
    }
    return parseFloat(text) || 0.00;
  } catch (err) {
    console.error('[grizzlySms] Failed to fetch Grizzly balance:', err.message);
    return 0.00;
  }
}
