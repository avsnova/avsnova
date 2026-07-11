// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Page Context Layer
// ————————————————————————————————————————————————————————————————
// Maps the user's current location (activeSection / landing) to context-aware
// greetings, quick-reply chips and proactive nudges. Adding a new module only
// requires a new entry here — the assistant UI reads everything from this map.

export interface QuickReply {
  label: string;
  /** Free-text the chip sends as if the user typed it. */
  send: string;
}

export interface PageContext {
  /** Human label for the current area. */
  title: string;
  /** Opening line when the panel is first opened on this page. */
  greeting: string;
  /** Tap-to-send suggestion chips tailored to this page. */
  quickReplies: QuickReply[];
  /** Gentle proactive message offered after idle time (never spammy). */
  proactive: string;
}

const GENERAL_QR: QuickReply[] = [
  { label: "Buy SMS Number", send: "How do I buy an SMS number?" },
  { label: "Fund Wallet", send: "How do I fund my wallet?" },
  { label: "Marketplace", send: "Tell me about the marketplace" },
  { label: "Track Order", send: "How do I track my order?" },
  { label: "Latest Promotions", send: "Are there any promotions or referral rewards?" },
  { label: "Talk to Human", send: "I need to talk to a human" },
];

// Keyed by App.tsx activeSection values, plus a special "Landing" key for guests.
export const PAGE_CONTEXT: Record<string, PageContext> = {
  Landing: {
    title: "Aurevashop",
    greeting: "👋 Hi! I'm Aria, your Aurevashop assistant. I can help you get started, explain our services, or answer any question.",
    quickReplies: [
      { label: "What is Aurevashop?", send: "What is Aurevashop and what can I do here?" },
      { label: "Buy SMS Number", send: "How do I buy an SMS number?" },
      { label: "How it works", send: "How does the platform work?" },
      { label: "Create an account", send: "How do I create an account?" },
    ],
    proactive: "New here? I can explain how Aurevashop works in a few seconds. 😊",
  },
  Dashboard: {
    title: "Dashboard",
    greeting: "👋 Hey! I'm Aria. Ask me anything about your wallet, numbers, orders or the marketplace.",
    quickReplies: GENERAL_QR,
    proactive: "Need a hand navigating your dashboard? I'm right here.",
  },
  "SMS Panel": {
    title: "Buy Number",
    greeting: "📱 Looking for a verification number? I can help you pick the right country and service.",
    quickReplies: [
      { label: "🇺🇸 USA Number", send: "Help me get a USA number" },
      { label: "🇬🇧 UK Number", send: "Help me get a UK number" },
      { label: "🇨🇦 Canada Number", send: "Help me get a Canada number" },
      { label: "WhatsApp Verification", send: "I need a number for WhatsApp verification" },
      { label: "No code arriving", send: "My SMS code isn't arriving, what should I do?" },
      { label: "My Orders", send: "How do I see my SMS history?" },
    ],
    proactive: "Not sure which country or service to choose? I can recommend the best option. 🌍",
  },
  Wallet: {
    title: "Wallet",
    greeting: "💳 I can help you add money, understand funding methods, or check on a deposit.",
    quickReplies: [
      { label: "Add Money", send: "How do I add money to my wallet?" },
      { label: "Funding Methods", send: "What payment methods can I use?" },
      { label: "Payment Failed", send: "My payment failed, what do I do?" },
      { label: "Verify Deposit", send: "My deposit isn't showing yet" },
      { label: "Payment History", send: "Where can I see my payment history?" },
    ],
    proactive: "Want help funding your wallet? I can walk you through it. 💸",
  },
  Marketplace: {
    title: "Marketplace",
    greeting: "🛍️ Looking for a product? I can help you find and buy digital items.",
    quickReplies: [
      { label: "Buy Digital Products", send: "How do I buy digital products?" },
      { label: "Popular Products", send: "What are popular products?" },
      { label: "Track Delivery", send: "How do I track my delivery?" },
      { label: "Order under review", send: "My order says it's being reviewed" },
      { label: "Refund Policy", send: "What is the refund policy?" },
    ],
    proactive: "Looking for a particular product? Tell me what you need and I'll point you there. 🔎",
  },
  "SMM Panel": {
    title: "SMM Panel",
    greeting: "📈 I can recommend the right growth service and explain delivery times.",
    quickReplies: [
      { label: "Instagram Services", send: "Show me Instagram growth services" },
      { label: "TikTok Services", send: "Show me TikTok growth services" },
      { label: "Facebook Services", send: "Show me Facebook growth services" },
      { label: "Delivery Time", send: "How long does SMM delivery take?" },
      { label: "Track My Order", send: "How do I track my SMM order?" },
      { label: "Pricing", send: "How is SMM pricing calculated?" },
    ],
    proactive: "Want a recommendation for the best SMM service for your goal? 📊",
  },
  "Gift Delivery": {
    title: "Gift Store",
    greeting: "🎁 I can help you send gifts and track gift orders.",
    quickReplies: [
      { label: "How gifts work", send: "How does gift delivery work?" },
      { label: "Track gift order", send: "How do I track my gift order?" },
      { label: "Refund Policy", send: "What is the refund policy?" },
    ],
    proactive: "Need help sending a gift? I can guide you. 🎉",
  },
  Orders: {
    title: "Orders",
    greeting: "📦 I can explain any order status, delays, or manual reviews.",
    quickReplies: [
      { label: "Order status", send: "What does my order status mean?" },
      { label: "Order under review", send: "My order is being reviewed, what does that mean?" },
      { label: "Track delivery", send: "How do I track delivery?" },
      { label: "Talk to Human", send: "I need help with an order from a human" },
    ],
    proactive: "Want me to explain what your order status means? 📦",
  },
  "My Gift Orders": {
    title: "My Gift Orders",
    greeting: "🎁 I can help you track and understand your gift orders.",
    quickReplies: [
      { label: "Track gift order", send: "How do I track my gift order?" },
      { label: "Order under review", send: "My gift order is being reviewed" },
    ],
    proactive: "Need help with a gift order? I'm here. 🎁",
  },
  Transactions: {
    title: "Transactions",
    greeting: "🧾 I can explain any transaction, reference, or refund on your ledger.",
    quickReplies: [
      { label: "What's this charge?", send: "Can you explain a transaction on my account?" },
      { label: "Refund status", send: "Where is my refund?" },
      { label: "Payment History", send: "Where can I see my payment history?" },
    ],
    proactive: "Want help understanding a transaction? Just ask. 🧾",
  },
  "My Inventory": {
    title: "My Inventory",
    greeting: "🔑 Your purchased keys and digital items live here. I can explain how to use them.",
    quickReplies: [
      { label: "How to use my keys", send: "How do I use my purchased keys?" },
      { label: "Item not delivered", send: "My digital item hasn't been delivered" },
    ],
    proactive: "Need help accessing a purchased item? 🔑",
  },
  Notifications: {
    title: "Security & Alerts",
    greeting: "🔔 I can explain any alert or platform event you've received.",
    quickReplies: [
      { label: "Explain an alert", send: "Can you explain a notification I received?" },
      { label: "Payment confirmed?", send: "What does a payment confirmed notification mean?" },
    ],
    proactive: "Want me to explain a recent notification? 🔔",
  },
  Profile: {
    title: "Profile",
    greeting: "👤 I can help you update your details or secure your account.",
    quickReplies: [
      { label: "Change password", send: "How do I change my password?" },
      { label: "Update email", send: "How do I update my email?" },
      { label: "Account security", send: "How do I keep my account secure?" },
    ],
    proactive: "Need help updating your profile? 👤",
  },
  Settings: {
    title: "Settings",
    greeting: "⚙️ I can help you configure your account preferences.",
    quickReplies: [
      { label: "Notification sounds", send: "How do I turn notification sounds on or off?" },
      { label: "Account settings", send: "Help me with account settings" },
      { label: "Security", send: "How do I keep my account secure?" },
    ],
    proactive: "Want help configuring your settings? ⚙️",
  },
  "How to Use": {
    title: "How to Use",
    greeting: "📘 Ask me how any feature works and I'll walk you through it.",
    quickReplies: GENERAL_QR,
    proactive: "Want a quick walkthrough of a feature? 📘",
  },
  Support: {
    title: "Support",
    greeting: "🛟 I'm your first line of support. I resolve most issues instantly — and escalate to a human only when truly needed.",
    quickReplies: [
      { label: "Payment issue", send: "I have a payment problem" },
      { label: "Order problem", send: "I have a problem with an order" },
      { label: "Refund request", send: "I'd like a refund" },
      { label: "Talk to Human", send: "I need to talk to a human" },
    ],
    proactive: "Tell me what's wrong — I'll fix it or connect you to a human. 🛟",
  },
  "Admin Panel": {
    title: "Admin",
    greeting: "🛠️ Admin mode. I can explain platform features and how customers experience them.",
    quickReplies: [
      { label: "Explain a feature", send: "Explain how a platform feature works" },
      { label: "Customer view", send: "How do customers experience the platform?" },
    ],
    proactive: "",
  },
};

export function getPageContext(section: string | null | undefined, loggedIn: boolean): PageContext {
  if (!loggedIn) return PAGE_CONTEXT.Landing;
  return (section && PAGE_CONTEXT[section]) || PAGE_CONTEXT.Dashboard;
}
