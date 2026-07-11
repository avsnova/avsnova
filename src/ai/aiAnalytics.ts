// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Analytics & Conversation Log (Turn 2)
// ————————————————————————————————————————————————————————————————
// Lightweight client-side analytics + conversation ledger that the client
// Assistant writes to and the Admin Console reads. Persisted in localStorage.
// No backend changes. Bounded sizes keep it fast and memory-light.

export interface ConvMessage { role: "user" | "assistant"; text: string; ts: number; }
export type ConvStatus = "active" | "resolved" | "escalated" | "pending";

export interface Conversation {
  id: string;
  startedAt: number;
  updatedAt: number;
  status: ConvStatus;
  page: string;
  userName?: string | null;
  userId?: string | null;
  messages: ConvMessage[];
  topics: string[];
  lowConfidence: number;      // count of low-confidence answers
  avgConfidence: number;
  assignedTo?: string;
  notes?: string;
  category?: string;
  responseTimesMs: number[];
}

export interface QuestionStat { q: string; count: number; }

interface AnalyticsBlob {
  conversations: Conversation[];
  questionCounts: Record<string, number>;
  pageCounts: Record<string, number>;
  serviceCounts: Record<string, number>;
  satisfaction: { up: number; down: number };
}

const KEY = "avs_ai_analytics_v1";
const MAX_CONVS = 100;

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeAnalytics(l: Listener): () => void { listeners.add(l); return () => listeners.delete(l); }
function emit() { listeners.forEach((l) => l()); }

let cache: AnalyticsBlob | null = null;

function blank(): AnalyticsBlob {
  return { conversations: [], questionCounts: {}, pageCounts: {}, serviceCounts: {}, satisfaction: { up: 0, down: 0 } };
}

export function getAnalytics(): AnalyticsBlob {
  if (cache) return cache;
  try { cache = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { cache = blank(); }
  // ensure all keys present
  cache = { ...blank(), ...cache };
  return cache!;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* sandbox */ }
  emit();
}

export function startConversation(meta: { page: string; userName?: string | null; userId?: string | null }): string {
  const a = getAnalytics();
  const id = `C-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const conv: Conversation = {
    id, startedAt: Date.now(), updatedAt: Date.now(), status: "active", page: meta.page,
    userName: meta.userName, userId: meta.userId, messages: [], topics: [], lowConfidence: 0,
    avgConfidence: 0, responseTimesMs: [],
  };
  a.conversations.unshift(conv);
  if (a.conversations.length > MAX_CONVS) a.conversations.length = MAX_CONVS;
  a.pageCounts[meta.page] = (a.pageCounts[meta.page] || 0) + 1;
  persist();
  return id;
}

export function logUserMessage(convId: string, text: string) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (!c) return;
  c.messages.push({ role: "user", text, ts: Date.now() });
  c.updatedAt = Date.now();
  const q = text.trim().toLowerCase().slice(0, 80);
  if (q) a.questionCounts[q] = (a.questionCounts[q] || 0) + 1;
  persist();
}

export function logAssistantMessage(convId: string, text: string, meta: { confidence: number; topicId?: string; escalated?: boolean; responseMs?: number; page?: string }) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (!c) return;
  c.messages.push({ role: "assistant", text, ts: Date.now() });
  c.updatedAt = Date.now();
  if (meta.topicId) c.topics.push(meta.topicId);
  if (typeof meta.responseMs === "number") c.responseTimesMs.push(meta.responseMs);
  if (meta.confidence < 0.4) c.lowConfidence++;
  // rolling avg confidence
  const answers = c.messages.filter((m) => m.role === "assistant").length;
  c.avgConfidence = (c.avgConfidence * (answers - 1) + meta.confidence) / answers;
  if (meta.escalated) c.status = "escalated";
  else if (c.status === "active" && meta.confidence >= 0.6) c.status = "resolved";
  persist();
}

export function setConversationStatus(convId: string, status: ConvStatus) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (c) { c.status = status; c.updatedAt = Date.now(); persist(); }
}

export function assignConversation(convId: string, to: string) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (c) { c.assignedTo = to; persist(); }
}

export function setConversationNotes(convId: string, notes: string) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (c) { c.notes = notes; persist(); }
}

export function recordEscalation(convId: string, category?: string) {
  const a = getAnalytics();
  const c = a.conversations.find((x) => x.id === convId);
  if (c) { c.status = "escalated"; if (category) c.category = category; persist(); }
}

export function recordSatisfaction(up: boolean) {
  const a = getAnalytics();
  if (up) a.satisfaction.up++; else a.satisfaction.down++;
  persist();
}

export function noteService(name: string) {
  if (!name) return;
  const a = getAnalytics();
  a.serviceCounts[name] = (a.serviceCounts[name] || 0) + 1;
  persist();
}

export function clearAnalytics() {
  cache = blank();
  persist();
}

// ————— Derived metrics for the dashboard —————
export interface AiMetrics {
  total: number;
  active: number;
  resolved: number;
  escalated: number;
  pending: number;
  resolutionRate: number;      // 0..1
  avgResponseMs: number;
  satisfaction: number;        // 0..1
  satisfactionVotes: number;
  topQuestions: QuestionStat[];
  topPages: QuestionStat[];
  topServices: QuestionStat[];
}

export function computeMetrics(): AiMetrics {
  const a = getAnalytics();
  const convs = a.conversations;
  const total = convs.length;
  const active = convs.filter((c) => c.status === "active").length;
  const resolved = convs.filter((c) => c.status === "resolved").length;
  const escalated = convs.filter((c) => c.status === "escalated").length;
  const pending = convs.filter((c) => c.status === "pending").length;
  const closed = resolved + escalated;
  const resolutionRate = closed > 0 ? resolved / closed : 0;
  const allTimes = convs.flatMap((c) => c.responseTimesMs);
  const avgResponseMs = allTimes.length ? allTimes.reduce((s, n) => s + n, 0) / allTimes.length : 0;
  const votes = a.satisfaction.up + a.satisfaction.down;
  const satisfaction = votes ? a.satisfaction.up / votes : 0;

  const toStats = (rec: Record<string, number>): QuestionStat[] =>
    Object.entries(rec).map(([q, count]) => ({ q, count })).sort((x, y) => y.count - x.count).slice(0, 8);

  return {
    total, active, resolved, escalated, pending, resolutionRate, avgResponseMs,
    satisfaction, satisfactionVotes: votes,
    topQuestions: toStats(a.questionCounts),
    topPages: toStats(a.pageCounts),
    topServices: toStats(a.serviceCounts),
  };
}
