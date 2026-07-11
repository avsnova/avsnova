// Country flag resolver (#2). Converts an emoji flag (or explicit ISO2 code) into an
// official high-quality SVG flag URL (flagcdn.com). Emoji flags are just two
// Regional Indicator Symbols encoding an ISO 3166-1 alpha-2 code, so we can decode
// the ISO2 directly from the stored emoji — no per-country mapping table needed.

// Decode ISO2 (e.g. "us") from an emoji flag like "🇺🇸". Returns null if not a flag emoji.
export function iso2FromEmoji(input?: string): string | null {
  if (!input) return null;
  const chars = Array.from(input.trim());
  if (chars.length < 2) return null;
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const Z = 0x1f1ff;
  const c0 = chars[0].codePointAt(0) || 0;
  const c1 = chars[1].codePointAt(0) || 0;
  if (c0 < A || c0 > Z || c1 < A || c1 > Z) return null;
  const l0 = String.fromCharCode(c0 - A + 97);
  const l1 = String.fromCharCode(c1 - A + 97);
  return l0 + l1;
}

// Comprehensive country name → ISO2 fallback (covers the full GrizzlySMS list) so a
// flag is resolved even when the stored emoji is generic (🌐) or missing.
const NAME_ISO2: Record<string, string> = {
  "usa": "us", "united states": "us", "usa server 1": "us", "usa server 2": "us", "united states of america": "us",
  "united kingdom": "gb", "uk": "gb", "england": "gb", "great britain": "gb",
  "nigeria": "ng", "canada": "ca", "india": "in", "russia": "ru", "ukraine": "ua",
  "kazakhstan": "kz", "china": "cn", "germany": "de", "brazil": "br", "france": "fr",
  "spain": "es", "vietnam": "vn", "egypt": "eg", "south africa": "za", "singapore": "sg",
  "indonesia": "id", "philippines": "ph", "malaysia": "my", "thailand": "th", "turkey": "tr",
  "italy": "it", "netherlands": "nl", "poland": "pl", "portugal": "pt", "kenya": "ke",
  "ghana": "gh", "mexico": "mx", "argentina": "ar", "japan": "jp", "south korea": "kr",
  "pakistan": "pk", "bangladesh": "bd", "morocco": "ma", "saudi arabia": "sa",
  "united arab emirates": "ae", "uae": "ae",
  // Africa
  "algeria": "dz", "angola": "ao", "benin": "bj", "botswana": "bw", "burkina faso": "bf",
  "burundi": "bi", "cameroon": "cm", "cape verde": "cv", "chad": "td", "congo": "cg",
  "dr congo": "cd", "democratic republic of the congo": "cd", "ivory coast": "ci", "cote d'ivoire": "ci",
  "ethiopia": "et", "gabon": "ga", "gambia": "gm", "guinea": "gn", "guinea-bissau": "gw",
  "liberia": "lr", "libya": "ly", "madagascar": "mg", "malawi": "mw", "mali": "ml",
  "mauritania": "mr", "mauritius": "mu", "mozambique": "mz", "namibia": "na", "niger": "ne",
  "rwanda": "rw", "senegal": "sn", "sierra leone": "sl", "somalia": "so", "sudan": "sd",
  "south sudan": "ss", "tanzania": "tz", "togo": "tg", "tunisia": "tn", "uganda": "ug",
  "zambia": "zm", "zimbabwe": "zw", "congo republic": "cg", "eswatini": "sz", "lesotho": "ls",
  // Americas
  "bolivia": "bo", "chile": "cl", "colombia": "co", "costa rica": "cr", "cuba": "cu",
  "dominican republic": "do", "ecuador": "ec", "el salvador": "sv", "guatemala": "gt",
  "haiti": "ht", "honduras": "hn", "jamaica": "jm", "nicaragua": "ni", "panama": "pa",
  "paraguay": "py", "peru": "pe", "puerto rico": "pr", "trinidad and tobago": "tt",
  "uruguay": "uy", "venezuela": "ve",
  // Asia
  "afghanistan": "af", "armenia": "am", "azerbaijan": "az", "bahrain": "bh",
  "cambodia": "kh", "georgia": "ge", "hong kong": "hk", "iran": "ir", "iraq": "iq",
  "israel": "il", "jordan": "jo", "kuwait": "kw", "kyrgyzstan": "kg", "laos": "la",
  "lebanon": "lb", "macau": "mo", "maldives": "mv", "mongolia": "mn", "myanmar": "mm",
  "nepal": "np", "north korea": "kp", "oman": "om", "palestine": "ps", "qatar": "qa",
  "sri lanka": "lk", "syria": "sy", "taiwan": "tw", "tajikistan": "tj", "timor-leste": "tl",
  "turkmenistan": "tm", "uzbekistan": "uz", "yemen": "ye", "brunei": "bn", "bhutan": "bt",
  // Europe
  "albania": "al", "austria": "at", "belarus": "by", "belgium": "be",
  "bosnia and herzegovina": "ba", "bulgaria": "bg", "croatia": "hr", "cyprus": "cy",
  "czech republic": "cz", "czechia": "cz", "denmark": "dk", "estonia": "ee", "finland": "fi",
  "greece": "gr", "hungary": "hu", "iceland": "is", "ireland": "ie", "kosovo": "xk",
  "latvia": "lv", "lithuania": "lt", "luxembourg": "lu", "malta": "mt", "moldova": "md",
  "monaco": "mc", "montenegro": "me", "north macedonia": "mk", "macedonia": "mk",
  "norway": "no", "romania": "ro", "serbia": "rs", "slovakia": "sk", "slovenia": "si",
  "sweden": "se", "switzerland": "ch",
  // Oceania
  "australia": "au", "new zealand": "nz", "fiji": "fj", "papua new guinea": "pg",
};

export function resolveIso2(flagEmoji?: string, countryName?: string): string | null {
  const fromEmoji = iso2FromEmoji(flagEmoji);
  if (fromEmoji) return fromEmoji;
  if (countryName) {
    const key = countryName.toLowerCase().trim().replace(/\s+/g, " ");
    if (NAME_ISO2[key]) return NAME_ISO2[key];
    // Try stripping suffixes like "server 1", parentheses, etc.
    const cleaned = key.replace(/\s*(server\s*\d+|\(.*?\))\s*/g, "").trim();
    if (NAME_ISO2[cleaned]) return NAME_ISO2[cleaned];
  }
  return null;
}

export function flagUrl(flagEmoji?: string, countryName?: string): string | null {
  const iso = resolveIso2(flagEmoji, countryName);
  return iso ? `https://flagcdn.com/${iso}.svg` : null;
}
