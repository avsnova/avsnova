// ============================================================================
//  SMS normalization maps (Requirements 4, 8, 9).
//  Canonical internal format = GrizzlySMS codes (already used by the frontend + DB), so the
//  UI never changes. This module converts 5SIM & SMSPool country/service identifiers to and
//  from those canonical Grizzly codes. Unmapped items are simply skipped (never shown as an
//  error), and if only one provider supports a service the router will still use it.
// ============================================================================

// Canonical GrizzlySMS country id  ->  ISO2 (used to resolve 5SIM slug + SMSPool id).
export const GRIZZLY_COUNTRY_ISO = {
  "0": "RU", "1": "UA", "2": "KZ", "3": "CN", "4": "PH", "5": "MM", "6": "ID", "7": "MY",
  "8": "KE", "9": "TZ", "10": "VN", "11": "KG", "12": "US", "13": "IL", "14": "HK", "15": "PL",
  "16": "GB", "17": "MG", "18": "CD", "19": "NG", "21": "EG", "22": "IN", "23": "IE", "24": "KH",
  "31": "ZA", "32": "RO", "33": "CO", "36": "CA", "38": "GH", "39": "AR", "43": "DE", "44": "LT",
  "48": "SL", "50": "AT", "51": "GR", "52": "TR", "54": "MX", "56": "ES", "62": "TH", "63": "BD",
  "66": "PK", "73": "BR", "78": "FR", "82": "BE", "86": "IT", "117": "PT", "175": "AU", "187": "US",
};

// ISO2 -> 5SIM country slug. VERIFIED against the live 5SIM catalog (2026-07).
// Countries 5SIM does not offer are intentionally omitted (→ they route to other providers).
// NOTE: 5SIM's per-country `iso` field is unreliable for auto-mapping (shared ISO codes,
// missing entries), so this hand-verified table is authoritative. Do NOT add a slug without
// confirming it exists in GET /v1/guest/countries.
export const ISO_TO_5SIM = {
  KZ: "kazakhstan", PH: "philippines", ID: "indonesia", MY: "malaysia", KE: "kenya",
  TZ: "tanzania", VN: "vietnam", KG: "kyrgyzstan", US: "usa", IL: "israel", HK: "hongkong",
  PL: "poland", GB: "england", MG: "madagascar", NG: "nigeria", EG: "egypt", IN: "india",
  IE: "ireland", KH: "cambodia", ZA: "southafrica", RO: "romania", CO: "colombia",
  CA: "canada", GH: "ghana", AR: "argentina", DE: "germany", LT: "lithuania",
  SL: "sierraleone", AT: "austria", GR: "greece", MX: "mexico", ES: "spain", TH: "thailand",
  BD: "bangladesh", PK: "pakistan", BR: "brazil", FR: "france", BE: "belgium", IT: "italy",
  PT: "portugal", AU: "australia",
  // Not offered by 5SIM at time of verification (omitted so the router uses another provider):
  //   RU (russia), UA (ukraine), CN (china), MM (myanmar), TR (turkey), CD (congo)
};

// ISO2 -> SMSPool numeric country ID. VERIFIED against the live SMSPool catalog
// (GET /country/retrieve_all, 2026-07). Previous hardcoded guesses were WRONG and caused
// mismatched numbers (e.g. Germany→Philippines) — this is now the authoritative source.
// Countries SMSPool does not offer are omitted (CA/CN/RU/AU-real, etc.).
export const ISO_TO_SMSPOOL = {
  US: 1, GB: 2, NL: 3, DE: 24, FR: 23, IT: 79, ES: 55, PL: 21, RO: 13, AT: 50, GR: 102,
  PT: 8, BE: 75, IE: 32, LT: 47, MX: 53, BR: 68, AR: 43, CO: 39, IN: 15, ID: 9, PH: 12,
  MY: 20, VN: 11, TH: 52, BD: 58, PK: 62, KH: 33, HK: 151, KZ: 7, KG: 18, UA: 25, TR: 60,
  IL: 29, EG: 31, ZA: 153, NG: 14, GH: 42, KE: 16, TZ: 27,
  // Not offered by SMSPool (real, non-virtual): CA, CN, RU, AU → omitted.
};

// Expected international dialing prefix per canonical Grizzly country id (from db.js meta).
// Used to VALIDATE that a purchased number actually belongs to the requested country
// (defence against provider mapping/synchronization bugs). Digits only, no '+'.
export const GRIZZLY_COUNTRY_DIALCODE = {
  "1": "380", "2": "7", "3": "86", "4": "63", "5": "95", "6": "62", "7": "60", "8": "254",
  "9": "255", "10": "84", "11": "996", "12": "1", "13": "972", "14": "852", "15": "48", "16": "44",
  "17": "261", "19": "234", "21": "20", "22": "91", "23": "353", "24": "855", "26": "509", "28": "220",
  "29": "381", "30": "967", "31": "27", "32": "40", "33": "57", "34": "372", "35": "994", "36": "1",
  "37": "212", "38": "233", "39": "54", "40": "998", "41": "237", "42": "235", "43": "49", "44": "370",
  "45": "385", "46": "46", "47": "964", "48": "31", "49": "371", "50": "43", "51": "375", "52": "66",
  "53": "966", "54": "52", "55": "886", "56": "34", "58": "213", "59": "386", "60": "880", "61": "221",
  "62": "90", "63": "420", "64": "94", "65": "51", "66": "92", "67": "64", "68": "224", "69": "223",
  "70": "58", "71": "251", "72": "976", "73": "55", "74": "93", "75": "256", "76": "244", "77": "357",
  "78": "33", "80": "258", "81": "977", "82": "32", "83": "359", "84": "36", "85": "373", "86": "39",
  "87": "595", "88": "504", "89": "216", "90": "505", "92": "591", "93": "506", "94": "502", "95": "971",
  "96": "263", "97": "1787", "99": "228", "100": "965", "102": "218", "103": "1876", "104": "1868", "105": "593",
  "106": "268", "107": "968", "108": "387", "109": "1809", "111": "974", "112": "507", "114": "222", "115": "232",
  "116": "962", "117": "351", "120": "229", "123": "267", "128": "995", "129": "30", "131": "592", "135": "231",
  "136": "266", "137": "265", "139": "227", "140": "250", "141": "421", "143": "992", "145": "973", "147": "260",
  "148": "374", "149": "252", "151": "56", "152": "226", "153": "961", "154": "241", "163": "358", "172": "45",
  "173": "41", "174": "47", "175": "61", "182": "81", "187": "1", "189": "679", "10016": "98", "10350": "82",
  "10351": "65"
};


// Canonical GrizzlySMS service code -> { fivesim: <5sim slug>, smspool: <smspool service name> }.
// Grizzly code is the internal name the frontend uses. 5SIM uses lowercase product slugs;
// SMSPool matches by service NAME (we resolve name -> id at runtime from its catalog).
export const SERVICE_MAP = {
  wa: { name: "WhatsApp",   fivesim: "whatsapp",    smspool: "WhatsApp" },
  tg: { name: "Telegram",   fivesim: "telegram",    smspool: "Telegram" },
  ig: { name: "Instagram",  fivesim: "instagram",   smspool: "Instagram" },
  fb: { name: "Facebook",   fivesim: "facebook",    smspool: "Facebook" },
  go: { name: "Google",     fivesim: "google",      smspool: "Google" },
  ds: { name: "Discord",    fivesim: "discord",     smspool: "Discord" },
  tw: { name: "Twitter",    fivesim: "twitter",     smspool: "Twitter" },
  vi: { name: "Viber",      fivesim: "viber",       smspool: "Viber" },
  mm: { name: "Microsoft",  fivesim: "microsoft",   smspool: "Microsoft" },
  nf: { name: "Netflix",    fivesim: "netflix",     smspool: "Netflix" },
  ub: { name: "Uber",       fivesim: "uber",        smspool: "Uber" },
  ot: { name: "Any/Other",  fivesim: "any",         smspool: "Any Other" },
   tk: { name: "TikTok",    fivesim: "tiktok",      smspool: "TikTok" },
  dr: { name: "OpenAI",     fivesim: "openai",      smspool: "OpenAI" },
  am: { name: "Amazon",     fivesim: "amazon",      smspool: "Amazon" },
  ap: { name: "Apple",      fivesim: "apple",       smspool: "Apple" },
};

// ——— Country helpers ———
export function grizzlyCountryToIso(gCode) { return GRIZZLY_COUNTRY_ISO[String(gCode)] || null; }
export function grizzlyToFivesimCountry(gCode) { const iso = grizzlyCountryToIso(gCode); return iso ? (ISO_TO_5SIM[iso] || null) : null; }
export function grizzlyToSmspoolCountry(gCode) { const iso = grizzlyCountryToIso(gCode); return iso != null ? (ISO_TO_SMSPOOL[iso] ?? null) : null; }

// ——— Country validation (order integrity) ———
// Verify a returned phone number plausibly belongs to the requested canonical country by its
// international dialing prefix. Returns { ok, expectedPrefix, reason }. When we don't know the
// expected prefix we return ok:true (can't validate → don't block), but the caller still logs it.
// Countries that share a dialing code (US/CA=1, RU/KZ=7) can't be distinguished by prefix alone;
// those pass the prefix test (the provider-level country selection is authoritative for them).
export function validateNumberCountry(gCountry, number) {
  const expected = GRIZZLY_COUNTRY_DIALCODE[String(gCountry)];
  const digits = String(number || "").replace(/[^0-9]/g, "");
  if (!expected) return { ok: true, expectedPrefix: null, reason: "no known prefix — skipped" };
  if (!digits) return { ok: false, expectedPrefix: expected, reason: "empty/invalid number" };
  const ok = digits.startsWith(expected);
  return { ok, expectedPrefix: expected, reason: ok ? "match" : `expected +${expected}, got ${digits.slice(0, 5)}…` };
}

// Basic phone-number sanity (7–15 digits, E.164-ish).
export function isValidPhoneFormat(number) {
  const digits = String(number || "").replace(/[^0-9]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// ——— Service helpers ———
export function grizzlyToFivesimService(gCode) { const m = SERVICE_MAP[String(gCode).toLowerCase()]; return m ? m.fivesim : null; }
export function grizzlyToSmspoolService(gCode) { const m = SERVICE_MAP[String(gCode).toLowerCase()]; return m ? m.smspool : null; }
export function serviceDisplayName(gCode) { const m = SERVICE_MAP[String(gCode).toLowerCase()]; return m ? m.name : String(gCode).toUpperCase(); }
