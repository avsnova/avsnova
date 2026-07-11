// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Context-Aware Notices (Admin broadcasts via the Assistant)
// ————————————————————————————————————————————————————————————————
// Surfaces admin announcements INSIDE the AI Assistant, targeted to the user's
// current page/section (and, server-side, to role/category/schedule). Reuses the
// existing /api/announcements/active?page= endpoint — NO backend changes.
//
// The backend already filters by target_pages, target_roles, scheduling window and
// per-user dismissals. We simply request the notices relevant to the current page
// and present the most important one as a friendly, non-technical AI message.

import { getSessionToken, getApiBaseUrl } from "../utils/api";

export interface AiNotice {
  id: string;
  title: string;
  body: string;            // may contain simple HTML from the editor
  category: string;        // news | feature | maintenance | promotion | community | event
  icon?: string;
  ctaText?: string;
  ctaUrl?: string;
  priority: number;
}

// Strip HTML to a clean single-line-ish text for the chat bubble.
function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CATEGORY_ICON: Record<string, string> = {
  maintenance: "🛠️",
  feature: "✨",
  promotion: "🎉",
  community: "👥",
  event: "📅",
  news: "📣",
};

export function noticeIcon(n: AiNotice): string {
  return n.icon || CATEGORY_ICON[n.category] || "📣";
}

// Maps an App section id to the announcement page-target key. The admin editor
// targets pages by these keys (Marketplace, Wallet, SMS Panel, etc.). We also try
// a couple of aliases so common targeting names still match.
export function pageKeyForSection(section: string | null, loggedIn: boolean): string {
  if (!loggedIn) return "landing";
  return section || "Dashboard";
}

// Fetch active, page-targeted notices for the given section.
export async function fetchNotices(section: string | null, loggedIn: boolean): Promise<AiNotice[]> {
  try {
    const base = getApiBaseUrl();
    const token = getSessionToken();
    const page = pageKeyForSection(section, loggedIn);
    const r = await fetch(`${base}/api/announcements/active?page=${encodeURIComponent(page)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j?.announcements) ? j.announcements : [];
    return list.map((a: any): AiNotice => ({
      id: a.id,
      title: a.title || "",
      body: htmlToText(a.body || ""),
      category: a.category || "news",
      icon: a.icon || undefined,
      ctaText: a.cta_text || undefined,
      ctaUrl: a.cta_url || undefined,
      priority: a.priority || 0,
    })).filter((n: AiNotice) => n.title || n.body);
  } catch {
    return [];
  }
}

// Format a notice as a friendly assistant message.
export function noticeToMessage(n: AiNotice): string {
  const icon = noticeIcon(n);
  const parts = [`${icon} ${n.title}`.trim()];
  if (n.body) parts.push(n.body);
  return parts.join("\n\n");
}

// Track that a notice was shown so we don't repeat it within a session.
const shownKey = "avs_ai_shown_notices";
export function markNoticeShown(id: string) {
  try {
    const set = new Set<string>(JSON.parse(sessionStorage.getItem(shownKey) || "[]"));
    set.add(id);
    sessionStorage.setItem(shownKey, JSON.stringify([...set]));
  } catch { /* sandbox */ }
}
export function wasNoticeShown(id: string): boolean {
  try {
    const set = new Set<string>(JSON.parse(sessionStorage.getItem(shownKey) || "[]"));
    return set.has(id);
  } catch { return false; }
}
