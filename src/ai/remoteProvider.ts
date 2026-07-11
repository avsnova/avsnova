// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Remote (hybrid) provider client
// ————————————————————————————————————————————————————————————————
// Talks to the SECURE backend proxy (/api/ai/*). API keys never touch the browser.
// Strategy (hybrid, per spec):
//   1) Always compute the local knowledge match first (grounding + instant fallback).
//   2) If AI is enabled and an external provider is configured, ask the backend
//      (real streaming when supported), passing the top knowledge entries as context.
//   3) On any failure, gracefully fall back to the Local AI answer.
// The engine's rich actions / escalation / suggestions are layered on top of the
// external text so all existing features are preserved.

import { getSessionToken, getApiBaseUrl } from "../utils/api";
import { LocalProvider, bestMatches, wantsHuman, type AssistantContext, type AssistantReply } from "./engine";
import { getEnabledKnowledge } from "./aiContentStore";

export interface RemoteStatus {
  enabled: boolean;
  provider: string;
  streaming: boolean;
  fallbackLocal: boolean;
  providers: Record<string, { configured: boolean; model: string }>;
}

let statusCache: { at: number; data: RemoteStatus } | null = null;

export async function fetchAiStatus(force = false): Promise<RemoteStatus | null> {
  if (!force && statusCache && Date.now() - statusCache.at < 60000) return statusCache.data;
  try {
    const base = getApiBaseUrl();
    const token = getSessionToken();
    const r = await fetch(`${base}/api/ai/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.success) return null;
    const data: RemoteStatus = {
      enabled: !!j.enabled, provider: j.provider || "local", streaming: !!j.streaming,
      fallbackLocal: j.fallbackLocal !== false, providers: j.providers || {},
    };
    statusCache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

// Is an external (non-local) provider actually usable right now?
export function usesExternal(status: RemoteStatus | null): boolean {
  if (!status || !status.enabled) return false;
  const p = status.provider;
  if (p === "local") return false;
  if (p === "auto") return Object.values(status.providers).some((x) => x.configured);
  return !!status.providers[p]?.configured;
}

// Build the enriched context payload the backend turns into a system prompt.
function buildContextPayload(message: string, ctx: AssistantContext) {
  const matches = bestMatches(message, 4);
  const knowledge = matches.map((m) => ({ title: m.entry.title, answer: m.entry.answer }));
  return {
    page: ctx.section || "Home",
    userName: ctx.userName || undefined,
    walletBalance: ctx.walletBalance,
    tone: undefined as string | undefined,
    knowledge,
    order: ctx.order || undefined,
    topKnowledgeSection: matches[0]?.entry.section,
    topKnowledgeNeedsHuman: matches[0]?.entry.needsHuman,
  };
}

// Layer engine-style actions/suggestions/escalation onto an external text answer.
function decorate(text: string, message: string, ctx: AssistantContext): AssistantReply {
  const matches = bestMatches(message, 3);
  const top = matches[0]?.entry;
  const explicitHuman = wantsHuman(message);
  const escalate = explicitHuman || (!!top?.needsHuman && /problem|issue|not|fail|wrong|missing|didn|help|stuck|error/i.test(message));
  const actions: AssistantReply["actions"] = [];
  if (top?.section && top.section !== ctx.section) actions.push({ label: `Go to ${top.section}`, section: top.section, variant: "primary" });
  if (escalate) actions.push({ label: "Continue on WhatsApp", escalate: true, variant: "primary" });
  const suggestions = matches.slice(1, 3).map((m) => ({ label: m.entry.title, send: m.entry.keywords[0] }));
  return { text, confidence: 0.9, topicId: top?.id, escalate, actions, suggestions };
}

// Ensure the knowledge overlay is loaded so context is fresh.
function safeKnowledgeCount(): number {
  try { return getEnabledKnowledge().length; } catch { return 0; }
}

/**
 * Non-streaming hybrid ask. Returns a decorated AssistantReply.
 * Falls back to LocalProvider on any failure.
 */
export async function askRemote(message: string, ctx: AssistantContext, status: RemoteStatus | null): Promise<AssistantReply> {
  void safeKnowledgeCount();
  if (!usesExternal(status)) return LocalProvider.generate(message, ctx) as AssistantReply;
  try {
    const base = getApiBaseUrl();
    const token = getSessionToken();
    const r = await fetch(`${base}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, context: buildContextPayload(message, ctx), history: (ctx as any).history || [] }),
    });
    const j = await r.json();
    if (j?.success && j.text) return decorate(j.text, message, ctx);
    // provider error → local fallback if allowed
    if (status?.fallbackLocal !== false) return LocalProvider.generate(message, ctx) as AssistantReply;
    throw new Error(j?.error || "unknown");
  } catch {
    return LocalProvider.generate(message, ctx) as AssistantReply;
  }
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (full: string, meta: AssistantReply) => void;
  onError: () => void;
}

/**
 * Real streaming hybrid ask via SSE. If streaming is unavailable/unsupported or fails
 * before any content, falls back to the local answer (delivered through onDone).
 * Returns true if the external stream produced content, false if it fell back.
 */
export async function streamRemote(message: string, ctx: AssistantContext, status: RemoteStatus | null, history: { role: "user" | "assistant"; text: string }[], cb: StreamCallbacks): Promise<void> {
  const localFallback = () => {
    const reply = LocalProvider.generate(message, ctx) as AssistantReply;
    cb.onDone(reply.text, reply);
  };

  if (!usesExternal(status) || !status?.streaming) {
    // Non-streaming path (still hybrid): fetch full text then hand to caller for typing animation.
    const reply = await askRemote(message, ctx, status);
    cb.onDone(reply.text, reply);
    return;
  }

  try {
    const base = getApiBaseUrl();
    const token = getSessionToken();
    const r = await fetch(`${base}/api/ai/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, context: buildContextPayload(message, ctx), history: history.slice(-8) }),
    });
    if (!r.ok || !r.body) { if (status?.fallbackLocal !== false) return localFallback(); cb.onError(); return; }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let acc = "";
    let errored = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const obj = JSON.parse(data);
          if (obj.delta) { acc += obj.delta; cb.onDelta(obj.delta); }
          else if (obj.error) { errored = true; }
        } catch { /* ignore partial */ }
      }
    }

    if (acc) { cb.onDone(acc, decorate(acc, message, ctx)); return; }
    // Stream produced nothing / errored
    if (errored && status?.fallbackLocal !== false) return localFallback();
    if (status?.fallbackLocal !== false) return localFallback();
    cb.onError();
  } catch {
    if (status?.fallbackLocal !== false) return localFallback();
    cb.onError();
  }
}
