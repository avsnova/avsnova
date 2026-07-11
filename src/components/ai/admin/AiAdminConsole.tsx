import { useState, useEffect, useMemo } from "react";
import {
  Bot, LayoutDashboard, BookOpen, MessageSquareText, Zap, MessageCircle, Radio, Cpu,
  Activity, CheckCircle2, Users, Timer, ThumbsUp, TrendingUp, FlaskConical, Megaphone,
} from "lucide-react";
import {
  getAiConfig, setAiConfig, subscribeAiConfig, type AiConfig,
} from "../../../ai/aiConfig";
import { subscribeAiContent } from "../../../ai/aiContentStore";
import { computeMetrics, subscribeAnalytics, type AiMetrics } from "../../../ai/aiAnalytics";
import { MetricCard, BarList, Donut, SectionCard } from "./aiAdminUi";
import AiKnowledgePanel from "./AiKnowledgePanel";
import AiQuickReplyPanel from "./AiQuickReplyPanel";
import AiBehaviorPanel from "./AiBehaviorPanel";
import AiConversationsPanel from "./AiConversationsPanel";
import AiProviderPanel from "./AiProviderPanel";
import AiTestPanel from "./AiTestPanel";
import AiBroadcastPanel from "./AiBroadcastPanel";

type SubTab = "dashboard" | "knowledge" | "broadcast" | "quickreplies" | "proactive" | "escalation" | "conversations" | "provider" | "test";

const SUBTABS: { id: SubTab; label: string; icon: typeof Bot }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "broadcast", label: "Broadcasts", icon: Megaphone },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "quickreplies", label: "Quick Replies", icon: MessageSquareText },
  { id: "proactive", label: "Proactive AI", icon: Zap },
  { id: "escalation", label: "WhatsApp Escalation", icon: MessageCircle },
  { id: "conversations", label: "Conversations", icon: Radio },
  { id: "provider", label: "AI Provider", icon: Cpu },
  { id: "test", label: "Test AI", icon: FlaskConical },
];

function fmtMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AiAdminConsole() {
  const [sub, setSub] = useState<SubTab>("dashboard");
  const [config, setConfig] = useState<AiConfig>(() => getAiConfig());
  const [metrics, setMetrics] = useState<AiMetrics>(() => computeMetrics());

  useEffect(() => subscribeAiConfig(setConfig), []);
  useEffect(() => subscribeAnalytics(() => setMetrics(computeMetrics())), []);
  useEffect(() => subscribeAiContent(() => { /* content changes reflected on open of panels */ }), []);

  const statusMeta = useMemo(() => {
    switch (config.status) {
      case "online": return { color: "emerald", label: "Online", dot: "bg-emerald-400" };
      case "maintenance": return { color: "amber", label: "Maintenance", dot: "bg-amber-400" };
      default: return { color: "red", label: "Offline", dot: "bg-red-400" };
    }
  }, [config.status]);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-space text-white flex items-center gap-2">
              Aria — AI Management
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-${statusMeta.color}-500/10 border-${statusMeta.color}-500/25 text-${statusMeta.color}-300`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot} animate-pulse`} /> {statusMeta.label}
              </span>
            </h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Version {config.version} · Provider: {config.provider === "local" ? "Local AI" : config.provider}</p>
          </div>
        </div>

        {/* Quick status switch */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-purple-500/15">
          {(["online", "maintenance", "offline"] as const).map((s) => (
            <button
              key={s} onClick={() => setAiConfig({ status: s })}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${
                config.status === s ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow" : "text-purple-200/60 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1.5 overflow-x-auto custom-scrollbar-thin pb-1 -mx-1 px-1">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id} onClick={() => setSub(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                active ? "bg-purple-500/20 border border-purple-500/40 text-white" : "bg-black/30 border border-purple-500/10 text-purple-200/60 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {sub === "dashboard" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={<Activity className="h-4 w-4" />} label="Active Chats" value={String(metrics.active)} tone="cyan" />
            <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Resolved" value={String(metrics.resolved)} tone="emerald" />
            <MetricCard icon={<MessageCircle className="h-4 w-4" />} label="Escalated" value={String(metrics.escalated)} tone="amber" />
            <MetricCard icon={<Users className="h-4 w-4" />} label="Total Chats" value={String(metrics.total)} tone="purple" />
            <MetricCard icon={<Timer className="h-4 w-4" />} label="Avg Response" value={fmtMs(metrics.avgResponseMs)} tone="cyan" />
            <MetricCard icon={<ThumbsUp className="h-4 w-4" />} label="Satisfaction" value={metrics.satisfactionVotes ? `${Math.round(metrics.satisfaction * 100)}%` : "—"} sub={`${metrics.satisfactionVotes} votes`} tone="emerald" />
            <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Resolution Rate" value={`${Math.round(metrics.resolutionRate * 100)}%`} tone="purple" />
            <MetricCard icon={<Radio className="h-4 w-4" />} label="Pending" value={String(metrics.pending)} tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="Customer Satisfaction">
              <Donut value={metrics.satisfaction} label={metrics.satisfactionVotes ? `${Math.round(metrics.satisfaction * 100)}% positive` : "No votes yet"} sub={`${metrics.satisfactionVotes} ratings`} />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white font-space">{Math.round(metrics.resolutionRate * 100)}%</div><div className="text-[9px] text-purple-200/40 uppercase">Resolved</div></div>
                <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white font-space">{fmtMs(metrics.avgResponseMs)}</div><div className="text-[9px] text-purple-200/40 uppercase">Speed</div></div>
                <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white font-space">{metrics.total}</div><div className="text-[9px] text-purple-200/40 uppercase">Chats</div></div>
              </div>
            </SectionCard>
            <SectionCard title="Most Asked Questions">
              <BarList accent="purple" emptyLabel="No questions logged yet." items={metrics.topQuestions.map((q) => ({ label: q.q, value: q.count }))} />
            </SectionCard>
            <SectionCard title="Most Visited Pages">
              <BarList accent="cyan" emptyLabel="No page activity yet." items={metrics.topPages.map((q) => ({ label: q.q, value: q.count }))} />
            </SectionCard>
          </div>

          <SectionCard title="Most Requested Products & Services">
            <BarList accent="emerald" emptyLabel="No product/service interest tracked yet." items={metrics.topServices.map((q) => ({ label: q.q, value: q.count }))} />
          </SectionCard>

          <p className="text-[10px] text-purple-200/30 text-center">Analytics update live from customer conversations · stored locally on this device</p>
        </div>
      )}

      {sub === "broadcast" && <AiBroadcastPanel />}
      {sub === "knowledge" && <AiKnowledgePanel />}
      {sub === "quickreplies" && <AiQuickReplyPanel />}
      {sub === "proactive" && <AiBehaviorPanel mode="proactive" />}
      {sub === "escalation" && <AiBehaviorPanel mode="escalation" />}
      {sub === "conversations" && <AiConversationsPanel />}
      {sub === "provider" && <AiProviderPanel />}
      {sub === "test" && <AiTestPanel />}
    </div>
  );
}
