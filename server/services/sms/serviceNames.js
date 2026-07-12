// ============================================================================
//  Central service display-name map (customer-facing).
//  Every provider's native short code / slug is translated to a proper, human service name
//  BEFORE it reaches the customer UI. Customers must NEVER see raw codes like "wa"/"tg"/"go".
//
//  Keyed by a normalized token (lowercased, non-alphanumerics stripped) so it matches Grizzly
//  codes ("wa"), 5SIM slugs ("whatsapp"), and SMSPool names ("WhatsApp") alike. When a code
//  isn't in the map we fall back to a cleaned Title-Case of the provider's own name — never the
//  raw lowercase slug/short code.
// ============================================================================

// token -> display name. Includes common short codes AND common slugs so all providers resolve.
const NAME_MAP = {
  // messaging / social
  wa: "WhatsApp", whatsapp: "WhatsApp",
  tg: "Telegram", telegram: "Telegram",
  ig: "Instagram", instagram: "Instagram", instagramthreads: "Instagram",
  fb: "Facebook", facebook: "Facebook",
  go: "Google", google: "Google", gmail: "Google", googlegmail: "Google", googlevoice: "Google Voice", gv: "Google Voice",
  ds: "Discord", discord: "Discord",
  tw: "Twitter / X", twitter: "Twitter / X", twitterx: "Twitter / X", x: "Twitter / X",
  vi: "Viber", viber: "Viber",
  wc: "WeChat", wechat: "WeChat",
  lf: "TikTok", tiktok: "TikTok", tk: "TikTok", tiktokdouyin: "TikTok",
  sg: "Signal", signal: "Signal",
  lg: "LINE", line: "LINE",
  kt: "KakaoTalk", kakaotalk: "KakaoTalk",
  im: "imo", imo: "imo",
  sn: "Snapchat", snapchat: "Snapchat",
  // tech / accounts
  mm: "Microsoft", microsoft: "Microsoft", ms: "Microsoft", live: "Microsoft",
  dr: "OpenAI / ChatGPT", openai: "OpenAI / ChatGPT", chatgpt: "OpenAI / ChatGPT",
  ap: "Apple", apple: "Apple", appleid: "Apple",
  am: "Amazon", amazon: "Amazon",
  nf: "Netflix", netflix: "Netflix",
  ub: "Uber", uber: "Uber",
  yl: "Yalla", yalla: "Yalla",
  // finance / dating / shopping
  bi: "Binance", binance: "Binance",
  py: "PayPal", paypal: "Paypal",
  bd: "Badoo", badoo: "Badoo",
  bm: "Bumble", bumble: "Bumble",
  td: "Tinder", tinder: "Tinder",
  hn: "Happn", happn: "Happn",
  mz: "Muzz", muzz: "Muzz",
  pf: "POF", pof: "POF", plentyoffish: "POF",
  ot: "Any Other", any: "Any Other", anyother: "Any Other",
};

// Normalize any provider identifier to a lookup token.
function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

// Title-case a raw provider name/slug as a safe, human fallback (never a bare short code).
function titleCase(s) {
  const raw = String(s == null ? "" : s).replace(/[_-]+/g, " ").trim();
  if (!raw) return "Unknown service";
  return raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

// Resolve a customer-facing display name.
//  - code:  the provider's native id/slug (e.g. "wa", "telegram", "1012")
//  - providerName: the provider's own human name if it has one (SMSPool's service_name)
export function serviceDisplayName(code, providerName) {
  const byCode = NAME_MAP[norm(code)];
  if (byCode) return byCode;
  const byName = providerName ? NAME_MAP[norm(providerName)] : null;
  if (byName) return byName;
  // Prefer the provider's human name if it isn't just the raw code; else title-case the code.
  if (providerName && norm(providerName) !== norm(code)) return titleCase(providerName);
  return titleCase(providerName || code);
}
