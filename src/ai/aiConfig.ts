// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Centralized Configuration Store (Turn 2)
// ————————————————————————————————————————————————————————————————
// Single source of truth for AI behavior that the Admin Console writes and the
// client Assistant reads. Persisted in localStorage (no backend changes). A tiny
// pub/sub lets both sides stay in sync live. Defaults EXACTLY match Turn 1 so the
// assistant behaves identically until an admin changes something.

export type AiStatus = "online" | "offline" | "maintenance";
export type AiProviderId = "local" | "openai" | "gemini" | "claude";

export interface AiProviderMeta {
  id: AiProviderId;
  name: string;
  description: string;
  /** Local needs no key; others are future-ready placeholders. */
  requiresKey: boolean;
  /** Whether the provider is actually usable now. Only local is. */
  available: boolean;
  /** Stored (but unused) API key placeholder for future integration. */
  apiKey?: string;
  model?: string;
}

export interface ProactiveConfig {
  enabled: boolean;
  idleMs: number;          // idle time before offering help (Turn 1 default: 45000)
  cooldownMs: number;      // min gap between nudges (Turn 1 default: 180000)
  maxPromptsPerSession: number;
  greetOnOpen: boolean;
  businessHours: { enabled: boolean; startHour: number; endHour: number };
}

export interface EscalationConfig {
  enabled: boolean;
  whatsappNumber: string;  // "" => fall back to platform settings/default
  categories: string[];
  template: string;        // header line for the WhatsApp message
}

export interface AiConfig {
  status: AiStatus;
  version: string;
  provider: AiProviderId;
  providerKeys: Partial<Record<AiProviderId, { apiKey?: string; model?: string }>>;
  proactive: ProactiveConfig;
  escalation: EscalationConfig;
  /** Typing/stream speed in ms per word (Turn 1 default ~18). */
  typingSpeedMs: number;
  /** "concise" | "balanced" | "detailed" — reserved for future providers. */
  responseLength: "concise" | "balanced" | "detailed";
  tone: "friendly" | "professional" | "casual";
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  { id: "local", name: "Local AI (Aria)", description: "Built-in deterministic engine over the centralized knowledge layer. No API key, fully offline, zero cost.", requiresKey: false, available: true },
  { id: "openai", name: "OpenAI (GPT)", description: "Connect GPT models for generative answers. Configure the API key server-side in the AI Provider tab.", requiresKey: true, available: true, model: "gpt-4o-mini" },
  { id: "gemini", name: "Google Gemini", description: "Connect Gemini models. Configure the API key server-side in the AI Provider tab.", requiresKey: true, available: true, model: "gemini-2.5-flash-lite" },
  { id: "claude", name: "Anthropic Claude", description: "Connect Claude models. Configure the API key server-side in the AI Provider tab.", requiresKey: true, available: true, model: "claude-3-5-sonnet-20241022" },
];

export const DEFAULT_ESCALATION_CATEGORIES = [
  "Payment Investigation",
  "Refund Investigation",
  "Manual Marketplace Review",
  "Manual Verification",
  "Identity Verification",
  "Technical Bug Report",
  "VIP Customer Request",
  "Fraud Investigation",
];

export const DEFAULT_AI_CONFIG: AiConfig = {
  status: "online",
  version: "1.2.0",
  provider: "local",
  providerKeys: {},
  proactive: {
    enabled: true,
    idleMs: 45000,
    cooldownMs: 180000,
    maxPromptsPerSession: 3,
    greetOnOpen: true,
    businessHours: { enabled: false, startHour: 8, endHour: 22 },
  },
  escalation: {
    enabled: true,
    whatsappNumber: "",
    categories: [...DEFAULT_ESCALATION_CATEGORIES],
    template: "Hello Aurevashop Support 👋",
  },
  typingSpeedMs: 18,
  responseLength: "balanced",
  tone: "friendly",
};

const KEY = "avs_ai_config_v1";
type Listener = (c: AiConfig) => void;
const listeners = new Set<Listener>();
let cache: AiConfig | null = null;

function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(override)) {
    const bv = (base as any)[k];
    const ov = (override as any)[k];
    if (ov && typeof ov === "object" && !Array.isArray(ov) && bv && typeof bv === "object") {
      out[k] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[k] = ov;
    }
  }
  return out;
}

export function getAiConfig(): AiConfig {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? deepMerge(DEFAULT_AI_CONFIG, JSON.parse(raw)) : { ...DEFAULT_AI_CONFIG };
  } catch {
    cache = { ...DEFAULT_AI_CONFIG };
  }
  return cache!;
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const next = deepMerge(getAiConfig(), patch);
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sandbox */ }
  listeners.forEach((l) => l(next));
  return next;
}

export function resetAiConfig(): AiConfig {
  cache = { ...DEFAULT_AI_CONFIG };
  try { localStorage.removeItem(KEY); } catch { /* sandbox */ }
  listeners.forEach((l) => l(cache!));
  return cache!;
}

export function subscribeAiConfig(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Whether the assistant is allowed to answer right now (respects status + business hours).
export function isAiOperational(): { ok: boolean; reason?: AiStatus | "afterhours" } {
  const c = getAiConfig();
  if (c.status === "offline") return { ok: false, reason: "offline" };
  if (c.status === "maintenance") return { ok: false, reason: "maintenance" };
  const bh = c.proactive.businessHours;
  if (bh.enabled) {
    const h = new Date().getHours();
    const within = bh.startHour <= bh.endHour ? h >= bh.startHour && h < bh.endHour : h >= bh.startHour || h < bh.endHour;
    if (!within) return { ok: true, reason: "afterhours" }; // still answers, but flags after-hours for UI/escalation
  }
  return { ok: true };
}
