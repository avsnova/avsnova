// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Content Store (Knowledge + Quick Replies) — Turn 2
// ————————————————————————————————————————————————————————————————
// Admin-managed overlay on top of the Turn 1 defaults (knowledgeBase.ts /
// pageContext.ts). The client engine reads the MERGED result so admin edits take
// effect instantly, with zero backend or code changes. Persisted in localStorage.

import { KNOWLEDGE_BASE, type KnowledgeEntry } from "./knowledgeBase";
import { PAGE_CONTEXT, type QuickReply } from "./pageContext";

const KKEY = "avs_ai_knowledge_v1";
const QKEY = "avs_ai_quickreplies_v1";
const VKEY = "avs_ai_knowledge_versions_v1";

export interface KnowledgeVersion {
  ts: number;
  label: string;
  snapshot: KnowledgeEntry[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeAiContent(l: Listener): () => void { listeners.add(l); return () => listeners.delete(l); }
function emit() { listeners.forEach((l) => l()); }

// ————— Knowledge —————
// We store the FULL working set (defaults + admin edits) so entries can be edited,
// disabled or deleted. On first load we seed from the Turn 1 defaults.
let kCache: KnowledgeEntry[] | null = null;

export function getKnowledge(): KnowledgeEntry[] {
  if (kCache) return kCache;
  try {
    const raw = localStorage.getItem(KKEY);
    if (raw) { kCache = JSON.parse(raw); return kCache!; }
  } catch { /* sandbox */ }
  kCache = KNOWLEDGE_BASE.map((k) => ({ ...k, enabled: k.enabled !== false }));
  return kCache!;
}

function persistKnowledge() {
  try { localStorage.setItem(KKEY, JSON.stringify(kCache)); } catch { /* sandbox */ }
  emit();
}

export function getEnabledKnowledge(): KnowledgeEntry[] {
  return getKnowledge().filter((k) => k.enabled !== false);
}

export function upsertKnowledge(entry: KnowledgeEntry) {
  const list = getKnowledge();
  const idx = list.findIndex((k) => k.id === entry.id);
  if (idx >= 0) list[idx] = { ...entry };
  else list.unshift({ ...entry });
  kCache = [...list];
  persistKnowledge();
}

export function deleteKnowledge(id: string) {
  kCache = getKnowledge().filter((k) => k.id !== id);
  persistKnowledge();
}

export function toggleKnowledge(id: string, enabled: boolean) {
  kCache = getKnowledge().map((k) => (k.id === id ? { ...k, enabled } : k));
  persistKnowledge();
}

export function replaceKnowledge(entries: KnowledgeEntry[]) {
  kCache = entries.map((e) => ({ ...e }));
  persistKnowledge();
}

export function resetKnowledge() {
  kCache = KNOWLEDGE_BASE.map((k) => ({ ...k, enabled: k.enabled !== false }));
  persistKnowledge();
}

// Version history (snapshots)
export function getKnowledgeVersions(): KnowledgeVersion[] {
  try { return JSON.parse(localStorage.getItem(VKEY) || "[]"); } catch { return []; }
}
export function snapshotKnowledge(label: string) {
  const versions = getKnowledgeVersions();
  versions.unshift({ ts: Date.now(), label, snapshot: getKnowledge().map((k) => ({ ...k })) });
  try { localStorage.setItem(VKEY, JSON.stringify(versions.slice(0, 20))); } catch { /* sandbox */ }
  emit();
}
export function restoreKnowledgeVersion(ts: number) {
  const v = getKnowledgeVersions().find((x) => x.ts === ts);
  if (v) replaceKnowledge(v.snapshot);
}

export function exportKnowledge(): string {
  return JSON.stringify(getKnowledge(), null, 2);
}
export function importKnowledge(json: string): { ok: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(json);
    const arr = Array.isArray(parsed) ? parsed : parsed.knowledge;
    if (!Array.isArray(arr)) return { ok: false, count: 0, error: "Expected a JSON array of entries." };
    // minimal validation
    const clean = arr.filter((e: any) => e && e.id && e.title && Array.isArray(e.keywords) && e.answer);
    replaceKnowledge(clean);
    return { ok: true, count: clean.length };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message };
  }
}

// ————— Quick Replies (per page) —————
// Overlay map: pageKey -> QuickReply[]. If unset, engine uses Turn 1 defaults.
let qCache: Record<string, QuickReply[]> | null = null;

export function getQuickReplyOverrides(): Record<string, QuickReply[]> {
  if (qCache) return qCache;
  try { qCache = JSON.parse(localStorage.getItem(QKEY) || "{}"); } catch { qCache = {}; }
  return qCache!;
}

export function getQuickRepliesForPage(pageKey: string): QuickReply[] {
  const ov = getQuickReplyOverrides()[pageKey];
  if (ov) return ov;
  return PAGE_CONTEXT[pageKey]?.quickReplies || [];
}

export function setQuickRepliesForPage(pageKey: string, replies: QuickReply[]) {
  const map = { ...getQuickReplyOverrides(), [pageKey]: replies };
  qCache = map;
  try { localStorage.setItem(QKEY, JSON.stringify(map)); } catch { /* sandbox */ }
  emit();
}

export function resetQuickRepliesForPage(pageKey: string) {
  const map = { ...getQuickReplyOverrides() };
  delete map[pageKey];
  qCache = map;
  try { localStorage.setItem(QKEY, JSON.stringify(map)); } catch { /* sandbox */ }
  emit();
}

export function pageKeys(): string[] {
  return Object.keys(PAGE_CONTEXT);
}
