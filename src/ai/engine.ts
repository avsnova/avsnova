// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Reasoning Engine (modular provider abstraction)
// ————————————————————————————————————————————————————————————————
// The engine turns a user message + live context into a structured reply. It uses
// a pluggable AssistantProvider so a real LLM can be dropped in later WITHOUT
// changing the UI: implement `generate()` against your LLM and swap the provider.
// The default LocalProvider reasons deterministically over the centralized
// knowledge layer — zero dependencies, zero network, fully offline-safe.

import { KNOWLEDGE_BASE, type KnowledgeEntry } from "./knowledgeBase";
import { getEnabledKnowledge } from "./aiContentStore";
import type { QuickReply } from "./pageContext";

export interface AssistantContext {
  section: string | null;
  loggedIn: boolean;
  userName?: string | null;
  userId?: number | string | null;
  walletBalance?: number;
  /** Lightweight session memory the engine can personalize with. */
  memory?: SessionMemory;
  /** Optional order the user is currently viewing (for order-aware answers). */
  order?: {
    id?: string | number;
    product?: string;
    quantity?: number;
    status?: string;
    paymentStatus?: string;
    category?: string;
    amount?: number;
    timeSince?: string;
  } | null;
}

export interface SessionMemory {
  visitedPages: string[];
  topics: string[];
  lastCountry?: string;
  lastService?: string;
  searches: string[];
}

export interface RichAction {
  label: string;
  /** Navigate to an in-app section. */
  section?: string;
  /** Or send a follow-up message as the user. */
  send?: string;
  /** Or open WhatsApp escalation with a prepared summary. */
  escalate?: boolean;
  variant?: "primary" | "secondary";
}

export interface AssistantReply {
  text: string;
  /** Follow-up quick replies specific to this answer. */
  suggestions?: QuickReply[];
  /** Actionable buttons (deep links / escalation). */
  actions?: RichAction[];
  /** Signals the UI to render an escalation card. */
  escalate?: boolean;
  /** Confidence 0..1 — low confidence nudges toward human help. */
  confidence: number;
  /** The matched knowledge topic id (for analytics). */
  topicId?: string;
}

export interface AssistantProvider {
  id: string;
  generate(message: string, ctx: AssistantContext): Promise<AssistantReply> | AssistantReply;
}

// ————— Intent / knowledge matching —————
const STOP = new Set(["the", "a", "an", "to", "of", "is", "it", "i", "my", "how", "do", "can", "you", "for", "on", "in", "and", "me", "please", "help", "with", "what", "are", "this"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
}

export function scoreEntry(message: string, entry: KnowledgeEntry): number {
  const msg = message.toLowerCase();
  const tokens = tokenize(message);
  let score = 0;
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (msg.includes(k)) score += k.includes(" ") ? 4 : 2; // phrase match weighs more
    else {
      // token overlap
      const kwTokens = k.split(/\s+/);
      const overlap = kwTokens.filter((t) => tokens.includes(t)).length;
      if (overlap) score += overlap;
    }
  }
  // title token overlap (small boost)
  const titleTokens = tokenize(entry.title);
  score += titleTokens.filter((t) => tokens.includes(t)).length * 0.5;
  return score;
}

export function bestMatches(message: string, limit = 3): { entry: KnowledgeEntry; score: number }[] {
  // Read the admin-managed, merged knowledge set (falls back to Turn 1 defaults).
  let base: KnowledgeEntry[];
  try { base = getEnabledKnowledge(); } catch { base = KNOWLEDGE_BASE; }
  if (!base || base.length === 0) base = KNOWLEDGE_BASE;
  return base
    .filter((e) => e.enabled !== false)
    .map((entry) => ({ entry, score: scoreEntry(message, entry) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Detect greetings / thanks for a friendlier feel.
function smallTalk(message: string, ctx: AssistantContext): AssistantReply | null {
  const m = message.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|hiya|good (morning|afternoon|evening))\b/.test(m)) {
    const name = ctx.userName ? `, ${ctx.userName.split(" ")[0]}` : "";
    return {
      text: `Hi${name}! 👋 I'm Aria, your Aurevashop assistant. How can I help — buying a number, funding your wallet, or something else?`,
      confidence: 0.9,
    };
  }
  if (/(thank|thanks|thx|cheers|appreciate)/.test(m)) {
    return { text: "You're very welcome! 😊 Anything else I can help with?", confidence: 0.9 };
  }
  if (/^(bye|goodbye|see ya|later)\b/.test(m)) {
    return { text: "Take care! I'm always here in the corner whenever you need me. 👋", confidence: 0.9 };
  }
  return null;
}

// Does this message clearly want a human / an investigation?
export function wantsHuman(message: string): boolean {
  return /human|agent|real person|representative|talk to (someone|a person|staff)|whatsapp|call you|speak to/i.test(message);
}

function buildActions(entry: KnowledgeEntry | null, ctx: AssistantContext, escalate: boolean): RichAction[] {
  const actions: RichAction[] = [];
  if (entry?.section && entry.section !== ctx.section) {
    actions.push({ label: `Go to ${entry.section}`, section: entry.section, variant: "primary" });
  }
  if (escalate) {
    actions.push({ label: "Continue on WhatsApp", escalate: true, variant: "primary" });
  }
  return actions;
}

// ————— The default, offline, deterministic provider —————
export const LocalProvider: AssistantProvider = {
  id: "local-v1",
  generate(message, ctx): AssistantReply {
    const st = smallTalk(message, ctx);
    if (st) return st;

    const matches = bestMatches(message, 3);
    const top = matches[0];
    const explicitHuman = wantsHuman(message);

    // No confident match → offer guidance + human handoff, never a raw error.
    if (!top || top.score < 2) {
      return {
        text:
          "I want to get this right — could you tell me a bit more? For example: buying a number, funding your wallet, an order, or a payment issue.\n\nIf it's something only a person can handle (a payment check, refund or manual review), I can connect you to our team on WhatsApp with all your details ready.",
        confidence: 0.3,
        escalate: explicitHuman,
        actions: explicitHuman ? [{ label: "Continue on WhatsApp", escalate: true, variant: "primary" }] : [],
        suggestions: [
          { label: "Buy SMS Number", send: "How do I buy an SMS number?" },
          { label: "Fund Wallet", send: "How do I fund my wallet?" },
          { label: "Talk to Human", send: "I need to talk to a human" },
        ],
      };
    }

    const entry = top.entry;
    const escalate = explicitHuman || (!!entry.needsHuman && /problem|issue|not|fail|wrong|missing|didn|help|stuck|error/i.test(message));
    const confidence = Math.min(0.98, 0.5 + top.score / 12);

    // Suggest related topics as follow-ups.
    const suggestions: QuickReply[] = matches.slice(1, 3).map((m) => ({ label: m.entry.title, send: m.entry.keywords[0] }));

    return {
      text: entry.answer,
      confidence,
      topicId: entry.id,
      escalate,
      actions: buildActions(entry, ctx, escalate),
      suggestions,
    };
  },
};

// Active provider (swap here to plug an LLM later; UI never changes).
let activeProvider: AssistantProvider = LocalProvider;
export function setAssistantProvider(p: AssistantProvider) { activeProvider = p; }
export function getAssistantProvider(): AssistantProvider { return activeProvider; }

export async function askAssistant(message: string, ctx: AssistantContext): Promise<AssistantReply> {
  try {
    return await activeProvider.generate(message, ctx);
  } catch {
    return {
      text: "Sorry, I hit a snag processing that. Please try rephrasing, or I can connect you to a human on WhatsApp.",
      confidence: 0.2,
      escalate: true,
      actions: [{ label: "Continue on WhatsApp", escalate: true, variant: "primary" }],
    };
  }
}
