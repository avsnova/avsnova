// ————————————————————————————————————————————————————————————————
//  Aurevashop Help Center — Guide knowledge base
// ————————————————————————————————————————————————————————————————
// Publicly readable service guides. Each guide is addressable at #help/<slug> and
// is safe to share. Content-only (no backend); admins can extend by adding entries.

export interface HelpFaq { q: string; a: string; }
export interface HelpGuide {
  slug: string;
  title: string;
  brand?: string;          // used to resolve a real logo via serviceLogos
  emoji?: string;          // fallback icon
  tagline: string;
  what: string;            // "What it is"
  howto: string[];         // "How to use it" (steps)
  faqs: HelpFaq[];
  troubleshooting: string[];
  bestPractices: string[];
  notes: string[];
  category: string;
  keywords: string[];
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "facebook", title: "Facebook Accounts", brand: "Facebook", emoji: "🔵", category: "Social Media",
    tagline: "Verified Facebook accounts for marketing, ads and management.",
    what: "A Facebook account is a ready-to-use profile you can log into for personal use, page management, marketing or advertising. Accounts may vary by region, age and included recovery details.",
    howto: [
      "Open your purchased credentials in My Inventory after checkout.",
      "Log in from a clean browser or the Facebook app.",
      "Complete any prompted verification using the included recovery email/phone.",
      "Change the password and secure the account before heavy use.",
    ],
    faqs: [
      { q: "Do accounts include email access?", a: "It depends on the listing. Check the product's specifications — many include a recovery email; some include full email access." },
      { q: "Can I run ads immediately?", a: "Warm up the account first (log in, browse, add a profile photo) before creating ad campaigns to reduce restrictions." },
      { q: "What if the account asks for verification?", a: "Use the included recovery info. If verification can't be completed, contact support for a replacement per the warranty." },
    ],
    troubleshooting: [
      "Login blocked? Try a residential IP / your normal location and the mobile app.",
      "Checkpoint requested? Use the recovery email/phone from your credentials.",
      "Account locked within warranty? Open the order and contact support for a replacement.",
    ],
    bestPractices: ["Change the password on first login.", "Avoid VPN hopping across countries.", "Warm up before advertising."],
    notes: ["Use accounts within Facebook's terms and applicable law.", "Warranty terms are shown on each product."],
    keywords: ["facebook", "fb", "meta", "ads", "marketing"],
  },
  {
    slug: "instagram", title: "Instagram Accounts", brand: "Instagram", emoji: "📸", category: "Social Media",
    tagline: "Aged and fresh Instagram accounts for growth and outreach.",
    what: "Instagram accounts for personal branding, outreach or management. Listings specify follower counts, age and whether email is included.",
    howto: ["Retrieve credentials in My Inventory.", "Log in via the Instagram app.", "Secure the account (password + email).", "Add a bio and photo before posting."],
    faqs: [
      { q: "Are these real accounts?", a: "Yes — they are genuine accounts. Details vary by listing." },
      { q: "Will I get logged out?", a: "Log in from a stable device/IP and complete any verification to stay signed in." },
    ],
    troubleshooting: ["Suspicious login? Confirm via the included email.", "Action blocked? Slow down engagement for 24–48h."],
    bestPractices: ["Change password immediately.", "Post gradually — avoid spammy bursts."],
    notes: ["Follow Instagram's community guidelines."],
    keywords: ["instagram", "ig", "insta"],
  },
  {
    slug: "tiktok", title: "TikTok Accounts", brand: "TikTok", emoji: "🎵", category: "Social Media",
    tagline: "TikTok accounts for creators and marketers.",
    what: "TikTok accounts ready for content and growth. Region and age vary by listing.",
    howto: ["Open credentials in My Inventory.", "Log in via the TikTok app.", "Secure the account.", "Post consistently to grow."],
    faqs: [{ q: "Can I change the region?", a: "Region is tied to the account; check the listing before buying if region matters." }],
    troubleshooting: ["Login issues? Use the app on a stable connection."],
    bestPractices: ["Warm up before posting many videos."],
    notes: ["Comply with TikTok's terms."],
    keywords: ["tiktok", "tik tok"],
  },
  {
    slug: "telegram", title: "Telegram Accounts & Numbers", brand: "Telegram", emoji: "✈️", category: "Messaging",
    tagline: "Telegram accounts and virtual numbers for verification.",
    what: "Telegram accounts (or numbers to register one) for messaging, channels and communities.",
    howto: ["Get your number/credentials in My Inventory.", "Register or log in via Telegram.", "Enter the OTP received.", "Set a 2FA password to secure it."],
    faqs: [{ q: "Is the number reusable?", a: "Virtual verification numbers are typically single-use for one OTP. Check the SMS guide for reuse rules." }],
    troubleshooting: ["No code? Use the SMS panel's auto-retry or request another number."],
    bestPractices: ["Add a 2FA password right after signup."],
    notes: ["Follow Telegram's terms."],
    keywords: ["telegram", "tg"],
  },
  {
    slug: "google-voice", title: "Google Voice", brand: "Google Voice", emoji: "🔊", category: "Numbers",
    tagline: "US Google Voice numbers for calls, texts and verification.",
    what: "Google Voice provides a US phone number for calls and SMS, useful for verification and communication.",
    howto: ["Open credentials/number in My Inventory.", "Sign into the Google account.", "Access Google Voice.", "Use the number for calls/SMS."],
    faqs: [{ q: "Do I need a US IP?", a: "A US IP can help with setup and stability." }],
    troubleshooting: ["Number not active? Confirm the linked Google account is signed in."],
    bestPractices: ["Keep the linked Google account secure."],
    notes: ["Google Voice availability is US-focused."],
    keywords: ["google voice", "gv", "voice"],
  },
  {
    slug: "whatsapp", title: "WhatsApp Numbers", brand: "WhatsApp", emoji: "🟢", category: "Numbers",
    tagline: "Virtual numbers to activate WhatsApp.",
    what: "A virtual number that receives the OTP needed to register WhatsApp.",
    howto: ["Buy a number in Buy Number (SMS).", "Enter it in WhatsApp registration.", "Copy the received OTP.", "Set a PIN for two-step verification."],
    faqs: [{ q: "Will the number stay active?", a: "Verification numbers deliver the OTP; long-term ownership isn't guaranteed. For persistent use, choose a dedicated line." }],
    troubleshooting: ["No SMS? The panel auto-retries and refunds if none arrives."],
    bestPractices: ["Enable WhatsApp two-step verification immediately."],
    notes: ["Follow WhatsApp's terms."],
    keywords: ["whatsapp", "wa"],
  },
  {
    slug: "vpn", title: "VPN Services", brand: "", emoji: "🛡️", category: "Privacy",
    tagline: "Private VPN subscriptions for secure browsing.",
    what: "A VPN encrypts your connection and routes it through another region for privacy and access.",
    howto: ["Get your VPN credentials/keys in My Inventory.", "Install the provider's app.", "Log in or import the config.", "Connect to a server region."],
    faqs: [{ q: "How many devices?", a: "Device limits depend on the plan — see the listing." }],
    troubleshooting: ["Can't connect? Try another server or protocol."],
    bestPractices: ["Enable the kill-switch for privacy."],
    notes: ["Use VPNs lawfully."],
    keywords: ["vpn", "proxy", "privacy"],
  },
  {
    slug: "netflix", title: "Netflix", brand: "Netflix", emoji: "🎬", category: "Streaming",
    tagline: "Netflix accounts and plans with warranty.",
    what: "Access to Netflix streaming. Listings specify plan (HD/4K), region, profile and warranty.",
    howto: ["Open credentials in My Inventory.", "Log into Netflix (web/app/TV).", "Select your assigned profile.", "Start streaming."],
    faqs: [
      { q: "Can I change the password?", a: "Do NOT change shared-account passwords — it locks others out and voids warranty. Private accounts may allow it (check the listing)." },
      { q: "Household verification?", a: "Netflix may prompt device verification; contact support if you can't complete it under warranty." },
    ],
    troubleshooting: ["'Wrong password'? Someone may have changed it — contact support for a warranty fix.", "Household error? Reach support with your order reference."],
    bestPractices: ["Use only your assigned profile on shared plans."],
    notes: ["Warranty terms are per listing."],
    keywords: ["netflix", "streaming"],
  },
  {
    slug: "apple-id", title: "Apple ID", brand: "Apple", emoji: "🍎", category: "Cloud",
    tagline: "Apple IDs by region for App Store and services.",
    what: "An Apple ID lets you use the App Store, iCloud and Apple services, often region-specific.",
    howto: ["Retrieve credentials in My Inventory.", "Sign in under Settings → Apple ID (or App Store).", "Complete any verification.", "Secure with your own trusted details where allowed."],
    faqs: [{ q: "Which region?", a: "Region is set per listing — pick the one matching the apps/content you need." }],
    troubleshooting: ["Verification loop? Use the included recovery info or contact support."],
    bestPractices: ["Don't enable Find My / device lock on shared IDs."],
    notes: ["Follow Apple's terms."],
    keywords: ["apple", "apple id", "appleid"],
  },
  {
    slug: "icloud", title: "iCloud", brand: "iCloud", emoji: "☁️", category: "Cloud",
    tagline: "iCloud accounts across multiple regions.",
    what: "iCloud storage and Apple services access. Regions available include USA, UK, Canada, Germany, France and Australia (per listing).",
    howto: ["Open credentials in My Inventory.", "Sign into iCloud on your device.", "Complete verification if prompted.", "Use storage and services."],
    faqs: [{ q: "Which regions are available?", a: "Common regions: USA, UK, Canada, Germany, France, Australia — availability shown on each product." }],
    troubleshooting: ["Locked out? Use recovery details or contact support under warranty."],
    bestPractices: ["Avoid enabling activation lock on shared accounts."],
    notes: ["Region availability varies by stock."],
    keywords: ["icloud", "apple cloud"],
  },
  {
    slug: "virtual-numbers", title: "Virtual Numbers", brand: "", emoji: "📱", category: "Numbers",
    tagline: "Rent numbers for one-time OTP verification worldwide.",
    what: "Virtual numbers receive the SMS OTP needed to verify apps and services across many countries.",
    howto: ["Open Buy Number (SMS).", "Pick a country and service.", "Buy — the number is reserved instantly.", "Copy the OTP when it arrives."],
    faqs: [{ q: "What if no code arrives?", a: "The system keeps listening and auto-refunds if the timer ends with no SMS." }],
    troubleshooting: ["Slow code? Provider networks can be busy — the panel retries automatically."],
    bestPractices: ["Pick the country the target service expects."],
    notes: ["One number is typically for a single verification."],
    keywords: ["virtual number", "otp", "sms number"],
  },
  {
    slug: "sms-services", title: "SMS Services", brand: "", emoji: "💬", category: "Numbers",
    tagline: "Automated SMS verification for hundreds of services.",
    what: "Our SMS panel delivers verification codes for 150+ platforms with instant reservation and refunds.",
    howto: ["Open Buy Number.", "Search the service (e.g. WhatsApp, Google).", "Choose country and buy.", "Copy the OTP shown automatically."],
    faqs: [{ q: "Which services are supported?", a: "Most major platforms — search inside the Buy Number page." }],
    troubleshooting: ["No number available? Try another country or check back shortly."],
    bestPractices: ["Have your wallet funded before buying to avoid interruptions."],
    notes: ["Prices are shown live before purchase."],
    keywords: ["sms", "verification", "otp"],
  },
];

export function getGuide(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.slug === slug.toLowerCase());
}

export function searchGuides(q: string): HelpGuide[] {
  const s = q.toLowerCase().trim();
  if (!s) return HELP_GUIDES;
  return HELP_GUIDES.filter((g) =>
    g.title.toLowerCase().includes(s) || g.tagline.toLowerCase().includes(s) || g.keywords.some((k) => k.includes(s)),
  );
}

/**
 * Best-effort match of an SMS service name → a relevant help guide, so the SMS panel can
 * auto-surface service-specific guidance (VPN tips, best practices) when a service is picked.
 * Matches by title/keyword substring; returns undefined when there's no good match.
 */
export function matchGuideForService(serviceName: string): HelpGuide | undefined {
  const s = (serviceName || "").toLowerCase().trim();
  if (!s) return undefined;
  return HELP_GUIDES.find((g) =>
    g.title.toLowerCase().includes(s) ||
    s.includes(g.slug.replace(/-/g, " ")) ||
    g.keywords.some((k) => s.includes(k) || k.includes(s)),
  );
}
