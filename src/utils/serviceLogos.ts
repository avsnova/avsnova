// Service logo resolver (#3). Maps a service name/keyword to an official brand logo
// (Simple Icons CDN, colored). Falls back to the provided emoji/icon when unknown.
// slug = simpleicons slug; hex = brand color (no leading #).

type Brand = { slug: string; hex: string };

const BRANDS: { keys: string[]; brand: Brand }[] = [
  { keys: ["whatsapp"], brand: { slug: "whatsapp", hex: "25D366" } },
  { keys: ["telegram"], brand: { slug: "telegram", hex: "26A5E4" } },
  { keys: ["google voice", "googlevoice"], brand: { slug: "googlevoice", hex: "4285F4" } },
  { keys: ["gmail", "google"], brand: { slug: "gmail", hex: "EA4335" } },
  { keys: ["signal"], brand: { slug: "signal", hex: "3A76F0" } },
  { keys: ["facebook", "fb"], brand: { slug: "facebook", hex: "0866FF" } },
  { keys: ["instagram", "insta", "ig"], brand: { slug: "instagram", hex: "E4405F" } },
  { keys: ["threads"], brand: { slug: "threads", hex: "000000" } },
  { keys: ["tiktok"], brand: { slug: "tiktok", hex: "000000" } },
  { keys: ["twitter", "x ", " x", "x(", "(x)"], brand: { slug: "x", hex: "000000" } },
  { keys: ["apple", "icloud"], brand: { slug: "apple", hex: "000000" } },
  { keys: ["discord"], brand: { slug: "discord", hex: "5865F2" } },
  { keys: ["wechat", "weixin"], brand: { slug: "wechat", hex: "07C160" } },
  { keys: ["line"], brand: { slug: "line", hex: "00C300" } },
  { keys: ["kakao", "kakaotalk"], brand: { slug: "kakaotalk", hex: "FFCD00" } },
  { keys: ["snapchat", "snap"], brand: { slug: "snapchat", hex: "FFFC00" } },
  { keys: ["uber"], brand: { slug: "uber", hex: "000000" } },
  { keys: ["airbnb"], brand: { slug: "airbnb", hex: "FF5A5F" } },
  { keys: ["amazon"], brand: { slug: "amazon", hex: "FF9900" } },
  { keys: ["paypal"], brand: { slug: "paypal", hex: "003087" } },
  { keys: ["binance"], brand: { slug: "binance", hex: "F0B90B" } },
  { keys: ["coinbase"], brand: { slug: "coinbase", hex: "0052FF" } },
  { keys: ["tinder"], brand: { slug: "tinder", hex: "FF6B6B" } },
  { keys: ["bumble"], brand: { slug: "bumble", hex: "FFC629" } },
  { keys: ["youtube", "yt"], brand: { slug: "youtube", hex: "FF0000" } },
  { keys: ["twitch"], brand: { slug: "twitch", hex: "9146FF" } },
  { keys: ["linkedin"], brand: { slug: "linkedin", hex: "0A66C2" } },
  { keys: ["spotify"], brand: { slug: "spotify", hex: "1DB954" } },
  { keys: ["netflix"], brand: { slug: "netflix", hex: "E50914" } },
  { keys: ["microsoft", "outlook", "hotmail"], brand: { slug: "microsoft", hex: "5E5E5E" } },
  { keys: ["viber"], brand: { slug: "viber", hex: "7360F2" } },
  { keys: ["reddit"], brand: { slug: "reddit", hex: "FF4500" } },
  { keys: ["pinterest"], brand: { slug: "pinterest", hex: "BD081C" } },
  // Additional commonly-verified SMS/SMM services
  { keys: ["yahoo"], brand: { slug: "yahoo", hex: "6001D2" } },
  { keys: ["protonmail", "proton"], brand: { slug: "protonmail", hex: "6D4AFF" } },
  { keys: ["steam"], brand: { slug: "steam", hex: "000000" } },
  { keys: ["epic games", "epicgames"], brand: { slug: "epicgames", hex: "313131" } },
  { keys: ["playstation"], brand: { slug: "playstation", hex: "0070D1" } },
  { keys: ["xbox"], brand: { slug: "xbox", hex: "107C10" } },
  { keys: ["ebay"], brand: { slug: "ebay", hex: "E53238" } },
  { keys: ["alibaba"], brand: { slug: "alibabadotcom", hex: "FF6A00" } },
  { keys: ["aliexpress"], brand: { slug: "aliexpress", hex: "FF4747" } },
  { keys: ["shopee"], brand: { slug: "shopee", hex: "EE4D2D" } },
  { keys: ["lazada"], brand: { slug: "lazada", hex: "0F146D" } },
  { keys: ["grab"], brand: { slug: "grab", hex: "00B14F" } },
  { keys: ["gojek"], brand: { slug: "gojek", hex: "00AA13" } },
  { keys: ["cash app", "cashapp"], brand: { slug: "cashapp", hex: "00C244" } },
  { keys: ["revolut"], brand: { slug: "revolut", hex: "191C1F" } },
  { keys: ["wise", "transferwise"], brand: { slug: "wise", hex: "9FE870" } },
  { keys: ["skype"], brand: { slug: "skype", hex: "00AFF0" } },
  { keys: ["zoom"], brand: { slug: "zoom", hex: "0B5CFF" } },
  { keys: ["dropbox"], brand: { slug: "dropbox", hex: "0061FF" } },
  { keys: ["github"], brand: { slug: "github", hex: "181717" } },
  { keys: ["okcupid"], brand: { slug: "okcupid", hex: "0500BE" } },
  { keys: ["hinge"], brand: { slug: "hinge", hex: "000000" } },
  { keys: ["mail.ru", "mailru"], brand: { slug: "maildotru", hex: "005FF9" } },
  { keys: ["vk", "vkontakte"], brand: { slug: "vk", hex: "0077FF" } },
  { keys: ["yandex"], brand: { slug: "yandex", hex: "FC3F1D" } },
  { keys: ["deliveroo"], brand: { slug: "deliveroo", hex: "00CCBC" } },
  { keys: ["doordash"], brand: { slug: "doordash", hex: "FF3008" } },
  { keys: ["twilio"], brand: { slug: "twilio", hex: "F22F46" } },
];

export function serviceBrand(name?: string): Brand | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const entry of BRANDS) {
    if (entry.keys.some(k => n.includes(k.trim()))) return entry.brand;
  }
  return null;
}

// Returns a colored SVG logo URL from Simple Icons CDN, or null if no brand match.
export function serviceLogoUrl(name?: string): string | null {
  const b = serviceBrand(name);
  return b ? `https://cdn.simpleicons.org/${b.slug}/${b.hex}` : null;
}
