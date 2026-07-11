// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Centralized Knowledge Layer
// ————————————————————————————————————————————————————————————————
// This is the single source of truth the assistant reasons over. To teach the AI
// about a NEW platform feature, just add a KnowledgeEntry here (or, in a future
// turn, load additional entries from an admin-managed backend). The engine and UI
// never hardcode answers — they always read from this layer, so the assistant is
// future-proof: new features become answerable without touching the engine.

export type KnowledgeCategory =
  | "sms" | "wallet" | "payments" | "marketplace" | "smm" | "ai-services"
  | "orders" | "account" | "referral" | "policy" | "merchant" | "general";

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  /** Natural-language keywords/phrases that should match this entry. */
  keywords: string[];
  /** The answer body shown to the user (supports simple line breaks). */
  answer: string;
  /** Optional related section id to deep-link into the app (e.g. "Wallet"). */
  section?: string;
  /** Whether this topic typically needs a human (drives escalation hints). */
  needsHuman?: boolean;
  enabled?: boolean;
}

// NOTE: keywords are matched case-insensitively as substrings/tokens by the engine.
export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ————— SMS —————
  {
    id: "sms-how",
    category: "sms",
    title: "How to buy an SMS number",
    keywords: ["buy number", "sms", "otp", "virtual number", "activation", "rent number", "verification code", "get a number"],
    answer:
      "To rent a verification number:\n1. Open the Buy Number page.\n2. Choose a country (USA, UK, Canada and more).\n3. Choose the service you're verifying (WhatsApp, Facebook, Telegram, Google…).\n4. Review the price & availability, then tap Buy.\nYour number is reserved instantly and the code appears automatically the moment it arrives — just tap to copy it.",
    section: "SMS Panel",
  },
  {
    id: "sms-delay",
    category: "sms",
    title: "SMS is taking a while / provider delay",
    keywords: ["sms delay", "no code", "code not arriving", "waiting for sms", "number not working", "provider slow", "still searching", "no number available"],
    answer:
      "If a code is taking a little longer, don't worry — the system keeps listening automatically and will show it the instant it lands. Provider networks can occasionally be slow at peak times. If no SMS arrives before the timer ends, the line is auto-cancelled and any reserved funds are refunded to your wallet. You can also cancel manually (after the short provider lock) for an instant refund.",
    section: "SMS Panel",
  },
  {
    id: "sms-country",
    category: "sms",
    title: "Choosing the right country / service",
    keywords: ["which country", "best country", "usa number", "uk number", "canada number", "choose service", "facebook verification", "whatsapp verification", "telegram verification"],
    answer:
      "Tip: pick the country the service expects your account to be in. USA and UK numbers have the widest service support and usually the best availability. Use the Popular chips for one-tap selection, or search any country/service instantly. The live price and stock show before you buy, so there are no surprises.",
    section: "SMS Panel",
  },

  // ————— WALLET & PAYMENTS —————
  {
    id: "wallet-fund",
    category: "wallet",
    title: "How to fund your wallet",
    keywords: ["fund wallet", "add money", "deposit", "top up", "add funds", "load wallet", "funding methods", "how to pay"],
    answer:
      "Tap Add Money on the Wallet page and choose a method. Aurevashop supports:\n• Monnify (dedicated bank transfer account)\n• Paystack (card & bank)\n• Flutterwave (card, bank, USSD)\n• Paga\nBank transfers to your dedicated account are credited automatically. Card payments confirm instantly.",
    section: "Wallet",
  },
  {
    id: "wallet-pending",
    category: "payments",
    title: "Deposit pending / payment not showing",
    keywords: ["payment pending", "deposit pending", "not credited", "money not showing", "payment failed", "verify deposit", "didn't receive", "transfer not credited"],
    answer:
      "Most deposits credit automatically within a minute. If a bank transfer hasn't appeared yet:\n1. Open the Wallet — we auto-reconcile deposits every few seconds.\n2. Give bank transfers a moment during busy periods.\nIf money left your bank but still isn't showing after a few minutes, this needs a quick payment check by our team — I can prepare everything and hand you to a human on WhatsApp.",
    section: "Wallet",
    needsHuman: true,
  },
  {
    id: "pay-methods",
    category: "payments",
    title: "Payment methods & gateways",
    keywords: ["monnify", "paystack", "flutterwave", "paga", "gateway", "payment options", "card payment", "bank transfer"],
    answer:
      "We use trusted Nigerian & global gateways: Monnify and Paga for bank transfers to a dedicated account, and Paystack & Flutterwave for card/bank/USSD. Prices are in Naira (₦). Choose whichever is most convenient — all are secure.",
    section: "Wallet",
  },

  // ————— MARKETPLACE —————
  {
    id: "market-buy",
    category: "marketplace",
    title: "Buying from the Marketplace",
    keywords: ["marketplace", "digital products", "buy product", "software keys", "gift", "oliver shop", "aureva", "store"],
    answer:
      "The Marketplace has digital products, software keys, gift items and more. Browse or search, open a listing to see details and delivery type, then pay from your wallet balance. Instant-delivery items arrive immediately; some items are fulfilled manually by our team (shown on the listing).",
    section: "Marketplace",
  },
  {
    id: "market-review",
    category: "marketplace",
    title: "Order under manual review / awaiting approval",
    keywords: ["under review", "manual review", "awaiting approval", "being processed", "order pending", "manual fulfillment", "seller approval", "processing"],
    answer:
      "Some services require manual fulfillment or a quick verification, so they aren't instant. When you see 'being reviewed' or 'processing', it means our team has received your order and is completing it — delivery may take a little longer than usual, and you'll be notified the moment it's ready. Everything is on track; no action is needed from you.",
    section: "Orders",
  },

  // ————— SMM —————
  {
    id: "smm-how",
    category: "smm",
    title: "Using the SMM Panel",
    keywords: ["smm", "followers", "likes", "views", "instagram", "tiktok", "facebook growth", "social media", "engagement"],
    answer:
      "The SMM Panel grows your social presence — Instagram, TikTok, Facebook, YouTube and more. Pick a service, enter your link and quantity, and the live price updates instantly. Orders start automatically after payment. Delivery time and min/max quantities are shown per service.",
    section: "SMM Panel",
  },
  {
    id: "smm-delivery",
    category: "smm",
    title: "SMM delivery time & tracking",
    keywords: ["smm delivery", "how long", "smm order", "track smm", "not delivered", "pricing", "delivery time"],
    answer:
      "SMM delivery times vary by service — many start within minutes, while larger orders drip over time for safety. You can track progress under Orders. If an order stalls well beyond its stated time, I can prepare the details for a human to investigate.",
    section: "SMM Panel",
    needsHuman: true,
  },

  // ————— AI SERVICES —————
  {
    id: "ai-services",
    category: "ai-services",
    title: "AI service accounts (OpenAI, Claude…)",
    keywords: ["ai services", "openai", "chatgpt", "claude", "ai account", "gpt"],
    answer:
      "You can verify or acquire access for popular AI platforms (OpenAI/ChatGPT, Claude and more) using our number activations and marketplace listings. Search the service on the Buy Number page or the Marketplace.",
    section: "Marketplace",
  },

  // ————— ORDERS & TRANSACTIONS —————
  {
    id: "orders-track",
    category: "orders",
    title: "Tracking orders & history",
    keywords: ["track order", "my orders", "order status", "order history", "where is my order", "transaction history", "receipts"],
    answer:
      "Open Orders to see every purchase and its live status, and Transactions for your full wallet ledger (deposits, purchases, refunds) with references. SMS activations also keep a permanent history with captured codes.",
    section: "Orders",
  },

  // ————— ACCOUNT —————
  {
    id: "account-profile",
    category: "account",
    title: "Profile & settings",
    keywords: ["profile", "settings", "change password", "update email", "account", "2fa", "security", "notifications"],
    answer:
      "Manage your details under Profile, and preferences (including notification sounds) under Settings. To change your password, use Profile → security, or the 'Forgot Password' flow on the login screen.",
    section: "Settings",
  },
  {
    id: "referral",
    category: "referral",
    title: "Referrals & coupons",
    keywords: ["referral", "refer", "invite", "coupon", "promo code", "discount", "promotion", "reward"],
    answer:
      "Share your referral code to earn rewards, and apply promo/coupon codes at checkout or when funding your wallet to get discounts or bonus credit. Look out for active promotions announced on the platform.",
    section: "Wallet",
  },

  // ————— POLICY —————
  {
    id: "refund",
    category: "policy",
    title: "Refund policy",
    keywords: ["refund", "money back", "cancel", "chargeback", "refund policy"],
    answer:
      "For SMS lines, if no code arrives the reserved funds are automatically refunded to your wallet. For other services, refunds depend on fulfillment status. If you believe a charge is wrong or a paid service wasn't delivered, this needs a human review — I can prepare a summary and connect you on WhatsApp.",
    needsHuman: true,
  },
  {
    id: "terms",
    category: "policy",
    title: "Terms of Service & safety",
    keywords: ["terms", "tos", "rules", "policy", "safe", "legit", "trust", "secure"],
    answer:
      "Aurevashop is a secure, unified platform for virtual numbers, SMM growth, and digital products, with encrypted payments through trusted gateways. Please use services within our Terms of Service and applicable laws.",
  },

  // ————— GENERAL —————
  {
    id: "what-is",
    category: "general",
    title: "What is Aurevashop?",
    keywords: ["what is aurevashop", "what can you do", "about", "help", "features", "what is this", "getting started"],
    answer:
      "Aurevashop is your all-in-one digital hub: rent virtual numbers for OTP verification, grow social accounts with the SMM panel, buy digital products in the Marketplace, and manage everything from a single wallet. Ask me anything — I can guide you step by step.",
  },
  {
    id: "contact",
    category: "general",
    title: "Contact / talk to a human",
    keywords: ["contact", "support", "human", "agent", "whatsapp", "talk to someone", "customer service", "help me"],
    answer:
      "I can solve most things right here! For issues that genuinely need a person — payment investigations, refunds, manual reviews or account problems — I'll prepare a full summary and open WhatsApp so you never have to repeat yourself.",
    needsHuman: true,
  },
];

export function knowledgeByCategory(cat: KnowledgeCategory): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter((k) => k.enabled !== false && k.category === cat);
}
