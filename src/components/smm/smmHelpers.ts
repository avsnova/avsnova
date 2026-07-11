// ————————————————————————————————————————————————————————————————
//  Aurevashop SMM — Pure helpers (UI-only; no backend logic changed)
// ————————————————————————————————————————————————————————————————
// Centralizes all derivation so cards, search, detail sheet and the order form
// stay in sync and never duplicate logic. Mirrors the exact grouping/detection
// the original panel used, so ordering behavior is 100% preserved.

export interface SMMService {
  id: string;
  name: string;
  platform: string;
  ratePer1k: number;
  minOrder: number;
  maxOrder: number;
  avgDelivery: string;
  refill: string;
  cancel_support: string;
  isFavorite?: boolean;
  description?: string;
  instructions?: string;
  api_service_id: string;
}

export interface NetworkConfig { key: string; label: string; icon: string; }

export const SOCIAL_NETWORKS_CONFIG: NetworkConfig[] = [
  { key: "Instagram", label: "Instagram", icon: "📸" },
  { key: "Facebook", label: "Facebook", icon: "🔵" },
  { key: "TikTok", label: "TikTok", icon: "🎵" },
  { key: "YouTube", label: "YouTube", icon: "🎥" },
  { key: "X (Twitter)", label: "X (Twitter)", icon: "🐦" },
  { key: "Telegram", label: "Telegram", icon: "💬" },
  { key: "Discord", label: "Discord", icon: "👾" },
  { key: "Spotify", label: "Spotify", icon: "🟢" },
  { key: "LinkedIn", label: "LinkedIn", icon: "💼" },
  { key: "Snapchat", label: "Snapchat", icon: "💛" },
  { key: "Twitch", label: "Twitch", icon: "💜" },
  { key: "Website Traffic", label: "Website Traffic", icon: "🌐" },
  { key: "Reviews", label: "Reviews", icon: "⭐" },
  { key: "Others", label: "Others", icon: "📦" },
];

export function networkIcon(key: string): string {
  return SOCIAL_NETWORKS_CONFIG.find((n) => n.key === key)?.icon || "📦";
}

// Map a raw JAP category name to one of our network groups (unchanged logic).
export function mapCategoryToNetworkGroup(categoryName: string): string {
  const name = (categoryName || "").toLowerCase();
  if (name.includes("instagram")) return "Instagram";
  if (name.includes("facebook")) return "Facebook";
  if (name.includes("tiktok") || name.includes("tik tok")) return "TikTok";
  if (name.includes("youtube") || name.includes("you tube")) return "YouTube";
  if (name.includes("twitter") || name.includes(" x ") || name === "x") return "X (Twitter)";
  if (name.includes("telegram")) return "Telegram";
  if (name.includes("discord")) return "Discord";
  if (name.includes("spotify")) return "Spotify";
  if (name.includes("linkedin")) return "LinkedIn";
  if (name.includes("snapchat")) return "Snapchat";
  if (name.includes("twitch")) return "Twitch";
  if (name.includes("traffic") || name.includes("website")) return "Website Traffic";
  if (name.includes("review")) return "Reviews";
  return "Others";
}

// Categorize a service into a human "type" (unchanged logic).
export function serviceType(name: string): string {
  const s = (name || "").toLowerCase();
  if (s.includes("follower") || s.includes("subscriber")) return "Followers / Subscribers";
  if (s.includes("like") || s.includes("reaction")) return "Likes / Reactions";
  if (s.includes("comment")) return "Comments";
  if (s.includes("view") || s.includes("watch") || s.includes("play")) return "Views / Impressions";
  if (s.includes("share") || s.includes("retweet")) return "Shares / Retweets";
  if (s.includes("vote") || s.includes("poll")) return "Poll Votes";
  if (s.includes("member") || s.includes("join")) return "Members / Group Invites";
  return "Packages / Custom Bundles";
}

export function isCommentsService(s?: SMMService): boolean {
  if (!s) return false;
  return s.name.toLowerCase().includes("comment") || !!(s.description && s.description.toLowerCase().includes("comment"));
}
export function isPollService(s?: SMMService): boolean {
  if (!s) return false;
  const n = s.name.toLowerCase();
  return n.includes("poll") || n.includes("vote");
}
export function isPackageService(s?: SMMService): boolean {
  if (!s) return false;
  const n = s.name.toLowerCase();
  return n.includes("package") || n.includes("sub") || n.includes("bundle");
}

// Price calc identical to original.
export function computeCost(s: SMMService | undefined, quantity: number): number {
  if (!s) return 0;
  if (isPackageService(s)) return Math.round(s.ratePer1k);
  return Math.round((quantity / 1000) * s.ratePer1k);
}

// Dynamic input label/placeholder (unchanged logic, generalized by network).
export function inputFieldFor(network: string, s?: SMMService): { fieldLabel: string; placeholder: string } {
  if (!s) return { fieldLabel: "Link", placeholder: "https://example.com" };
  const name = s.name.toLowerCase();
  if (network === "Instagram" && (name.includes("follower") || name.includes("sub"))) return { fieldLabel: "Instagram Profile Link", placeholder: "Enter Instagram link" };
  if (network === "Instagram" && (name.includes("like") || name.includes("reaction") || name.includes("view") || name.includes("comment"))) return { fieldLabel: "Instagram Post Link", placeholder: "Paste Instagram post URL" };
  if (network === "YouTube") {
    if (name.includes("subscriber") || name.includes("channel")) return { fieldLabel: "YouTube Channel Link", placeholder: "Paste YouTube channel URL" };
    return { fieldLabel: "YouTube Video Link", placeholder: "Paste YouTube video URL" };
  }
  if (network === "TikTok") {
    if (name.includes("follower") || name.includes("profile")) return { fieldLabel: "TikTok Profile Link", placeholder: "Enter TikTok link" };
    return { fieldLabel: "TikTok Post Link", placeholder: "Paste TikTok video URL" };
  }
  if (network === "Spotify") return { fieldLabel: "Spotify Track / Playlist Link", placeholder: "Paste Spotify track URL" };
  if (network === "Facebook") {
    if (name.includes("page") || name.includes("fan")) return { fieldLabel: "Facebook Page Link", placeholder: "Paste Facebook page URL" };
    return { fieldLabel: "Facebook Post Link", placeholder: "Paste Facebook post URL" };
  }
  if (network === "Telegram") return { fieldLabel: "Telegram Group/Channel Link", placeholder: "Paste Telegram group/channel link" };
  return { fieldLabel: `${network} Target Link URL`, placeholder: `Paste ${network} link` };
}

export function cleanInstructions(s: SMMService): string {
  const text = s.instructions || s.description || "- Public profile only.\n- Do not change username during order.";
  return text.replace(/JustAnotherPanel/gi, "Secure Carrier Node");
}

// ————— Smart link validation (friendly, non-technical) —————
const PLATFORM_HOSTS: { network: string; hosts: RegExp }[] = [
  { network: "Instagram", hosts: /instagram\.com|instagr\.am/i },
  { network: "Facebook", hosts: /facebook\.com|fb\.com|fb\.watch/i },
  { network: "TikTok", hosts: /tiktok\.com/i },
  { network: "YouTube", hosts: /youtube\.com|youtu\.be/i },
  { network: "X (Twitter)", hosts: /twitter\.com|x\.com/i },
  { network: "Telegram", hosts: /t\.me|telegram\.me|telegram\.org/i },
  { network: "Discord", hosts: /discord\.gg|discord\.com/i },
  { network: "Twitch", hosts: /twitch\.tv/i },
  { network: "LinkedIn", hosts: /linkedin\.com/i },
  { network: "Spotify", hosts: /spotify\.com/i },
  { network: "Snapchat", hosts: /snapchat\.com/i },
];

export function detectPlatform(url: string): string | null {
  for (const p of PLATFORM_HOSTS) if (p.hosts.test(url)) return p.network;
  return null;
}

export interface LinkValidation { state: "empty" | "valid" | "warn" | "invalid"; message: string; detected: string | null; }

export function validateLink(url: string, expectedNetwork: string): LinkValidation {
  const v = url.trim();
  if (!v) return { state: "empty", message: "", detected: null };
  let ok = false;
  try { const u = new URL(v.startsWith("http") ? v : `https://${v}`); ok = !!u.hostname && u.hostname.includes("."); } catch { ok = false; }
  if (!ok) return { state: "invalid", message: "That doesn't look like a valid link. Please paste the full URL.", detected: null };
  const detected = detectPlatform(v);
  // Networks that don't rely on a social URL host — accept any valid URL.
  const flexible = ["Website Traffic", "Reviews", "Others"];
  if (flexible.includes(expectedNetwork)) return { state: "valid", message: "Link looks good.", detected };
  if (!detected) return { state: "warn", message: `We couldn't detect the platform. Make sure it's a public ${expectedNetwork} link.`, detected: null };
  if (detected !== expectedNetwork) return { state: "warn", message: `This looks like a ${detected} link, but you selected ${expectedNetwork}. Double-check before ordering.`, detected };
  return { state: "valid", message: `Verified ${detected} link.`, detected };
}

// ————— Favorites & recent categories (localStorage, session-friendly) —————
const FAV_KEY = "avs_smm_favorites";
const RECENT_KEY = "avs_smm_recent_categories";

function readArr(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeArr(key: string, arr: string[]) { try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* sandbox */ } }

export function getFavorites(): string[] { return readArr(FAV_KEY); }
export function isFavorite(id: string): boolean { return getFavorites().includes(id); }
export function toggleFavorite(id: string): boolean {
  const cur = getFavorites();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeArr(FAV_KEY, next);
  return next.includes(id);
}
export function getRecentCategories(): string[] { return readArr(RECENT_KEY); }
export function pushRecentCategory(key: string) {
  if (!key) return;
  const cur = readArr(RECENT_KEY).filter((k) => k !== key);
  cur.unshift(key);
  writeArr(RECENT_KEY, cur.slice(0, 6));
}

// A lightweight "popularity" heuristic so Popular/Trending aren't empty on a fresh catalog:
// cheaper + higher max-order services surface first, deterministic (no fake data).
export function popularityScore(s: SMMService): number {
  const rate = s.ratePer1k || 1;
  const reach = Math.log10((s.maxOrder || 1000) + 10);
  return reach * 1000 - rate; // higher reach, lower price = more "popular"
}

// Friendly status metadata for order timeline / badges.
export type SmmStatus = "processing" | "pending" | "in progress" | "accepted" | "running" | "completed" | "partial" | "cancelled" | "canceled" | "failed";

export interface StatusMeta { label: string; tone: "info" | "warning" | "success" | "danger" | "purple"; step: number; }

export function statusMeta(status: string): StatusMeta {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { label: "Completed", tone: "success", step: 5 };
  if (s === "partial") return { label: "Partial", tone: "warning", step: 4 };
  if (s === "cancelled" || s === "canceled") return { label: "Cancelled", tone: "danger", step: 0 };
  if (s === "failed") return { label: "Failed", tone: "danger", step: 0 };
  if (s === "running" || s === "in progress") return { label: "Running", tone: "info", step: 4 };
  if (s === "accepted") return { label: "Accepted", tone: "info", step: 3 };
  if (s === "processing") return { label: "Processing", tone: "info", step: 2 };
  return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending", tone: "purple", step: 1 };
}

export const ORDER_TIMELINE = ["Submitted", "Processing", "Accepted", "Running", "Completed"];
