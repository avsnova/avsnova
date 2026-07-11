import { useState, useEffect } from "react";
import { Plus, X, Clock, Zap, MessageCircle } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { getAiConfig, setAiConfig, subscribeAiConfig, DEFAULT_ESCALATION_CATEGORIES, type AiConfig } from "../../../ai/aiConfig";
import { Toggle, SectionCard } from "./aiAdminUi";
import { buildWhatsappMessage } from "../../../ai/escalation";

export default function AiBehaviorPanel({ mode }: { mode: "proactive" | "escalation" }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<AiConfig>(() => getAiConfig());
  useEffect(() => subscribeAiConfig(setConfig), []);

  if (mode === "proactive") return <ProactivePanel config={config} toast={toast} />;
  return <EscalationPanel config={config} toast={toast} />;
}

function Num({ label, value, onChange, min = 0, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" value={value} min={min} step={step} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
        {suffix && <span className="text-[11px] text-purple-200/40 shrink-0">{suffix}</span>}
      </div>
    </label>
  );
}

function ProactivePanel({ config, toast }: { config: AiConfig; toast: (m: string, v?: any) => void }) {
  const p = config.proactive;
  const set = (patch: Partial<typeof p>) => setAiConfig({ proactive: { ...p, ...patch } });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="Proactive Assistance" right={<Zap className="h-4 w-4 text-purple-300/60" />}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-bold text-white">Enable proactive messages</div><div className="text-[11px] text-purple-200/40">Politely offer help when users seem stuck.</div></div>
            <Toggle checked={p.enabled} onChange={(v) => { set({ enabled: v }); toast(v ? "Proactive messages enabled." : "Proactive messages disabled.", "success"); }} />
          </div>
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-bold text-white">Greet on open</div><div className="text-[11px] text-purple-200/40">Show a contextual greeting when the panel opens.</div></div>
            <Toggle checked={p.greetOnOpen} onChange={(v) => set({ greetOnOpen: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Idle before offering" value={Math.round(p.idleMs / 1000)} onChange={(v) => set({ idleMs: Math.max(5, v) * 1000 })} min={5} suffix="sec" />
            <Num label="Cooldown between prompts" value={Math.round(p.cooldownMs / 1000)} onChange={(v) => set({ cooldownMs: Math.max(10, v) * 1000 })} min={10} suffix="sec" />
          </div>
          <Num label="Max prompts per session" value={p.maxPromptsPerSession} onChange={(v) => set({ maxPromptsPerSession: Math.max(0, v) })} min={0} />
        </div>
      </SectionCard>

      <SectionCard title="Conversation Style & Business Hours" right={<Clock className="h-4 w-4 text-purple-300/60" />}>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Typing speed (ms / word)</span>
            <input type="range" min={4} max={60} value={config.typingSpeedMs} onChange={(e) => setAiConfig({ typingSpeedMs: Number(e.target.value) })} className="w-full accent-purple-500 cursor-pointer" />
            <span className="text-[11px] text-purple-200/40">{config.typingSpeedMs}ms · {config.typingSpeedMs < 12 ? "Fast" : config.typingSpeedMs < 30 ? "Natural" : "Relaxed"}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Response length</span>
            <select value={config.responseLength} onChange={(e) => setAiConfig({ responseLength: e.target.value as any })}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 cursor-pointer">
              <option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Tone</span>
            <select value={config.tone} onChange={(e) => setAiConfig({ tone: e.target.value as any })}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 cursor-pointer">
              <option value="friendly">Friendly</option><option value="professional">Professional</option><option value="casual">Casual</option>
            </select>
          </label>
          <div className="pt-2 border-t border-purple-500/10 space-y-3">
            <div className="flex items-center justify-between">
              <div><div className="text-xs font-bold text-white">Business hours only</div><div className="text-[11px] text-purple-200/40">Flag after-hours chats for escalation.</div></div>
              <Toggle checked={p.businessHours.enabled} onChange={(v) => set({ businessHours: { ...p.businessHours, enabled: v } })} />
            </div>
            {p.businessHours.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <Num label="Start hour (0-23)" value={p.businessHours.startHour} onChange={(v) => set({ businessHours: { ...p.businessHours, startHour: Math.min(23, Math.max(0, v)) } })} min={0} />
                <Num label="End hour (0-23)" value={p.businessHours.endHour} onChange={(v) => set({ businessHours: { ...p.businessHours, endHour: Math.min(23, Math.max(0, v)) } })} min={0} />
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function EscalationPanel({ config, toast }: { config: AiConfig; toast: (m: string, v?: any) => void }) {
  const e = config.escalation;
  const set = (patch: Partial<typeof e>) => setAiConfig({ escalation: { ...e, ...patch } });
  const [newCat, setNewCat] = useState("");

  const addCat = () => { const c = newCat.trim(); if (!c) return; if (e.categories.includes(c)) { toast("Category already exists.", "warning"); return; } set({ categories: [...e.categories, c] }); setNewCat(""); };
  const removeCat = (c: string) => set({ categories: e.categories.filter((x) => x !== c) });

  const sampleSummary = buildWhatsappMessage({
    customerName: "Jane Doe", userId: "jane@example.com", section: "Wallet",
    status: "Assisted by AI, needs human", problem: "Deposit not credited",
    transcript: [{ role: "user", text: "my deposit isn't showing" }, { role: "assistant", text: "Let me help you check that…" }],
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="WhatsApp Escalation" right={<MessageCircle className="h-4 w-4 text-purple-300/60" />}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-bold text-white">Enable human handoff</div><div className="text-[11px] text-purple-200/40">Allow the AI to escalate to WhatsApp.</div></div>
            <Toggle checked={e.enabled} onChange={(v) => { set({ enabled: v }); toast(v ? "Escalation enabled." : "Escalation disabled.", "success"); }} />
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">WhatsApp number</span>
            <input value={e.whatsappNumber} onChange={(ev) => set({ whatsappNumber: ev.target.value })} placeholder="Leave blank to use platform default"
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
            <span className="text-[10px] text-purple-200/40">Digits only or +country code. Blank falls back to the site's support number.</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Message header / template</span>
            <input value={e.template} onChange={(ev) => set({ template: ev.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          </label>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Escalation categories</span>
            <div className="flex flex-wrap gap-1.5">
              {e.categories.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full border border-purple-500/25 bg-purple-500/8 pl-2.5 pr-1.5 py-1 text-[11px] font-semibold text-purple-100">
                  {c}
                  <button onClick={() => removeCat(c)} className="text-purple-300/50 hover:text-red-400 cursor-pointer"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newCat} onChange={(ev) => setNewCat(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") addCat(); }} placeholder="Add a category…"
                className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
              <button onClick={addCat} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-200 text-xs font-bold hover:text-white cursor-pointer"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            {e.categories.length !== DEFAULT_ESCALATION_CATEGORIES.length && (
              <button onClick={() => set({ categories: [...DEFAULT_ESCALATION_CATEGORIES] })} className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer">Restore default categories</button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Auto-generated Summary (preview)">
        <p className="text-[11px] text-purple-200/40 mb-2">This is exactly what a customer's WhatsApp message will be pre-filled with — so they never repeat themselves.</p>
        <pre className="text-[11px] text-purple-100 whitespace-pre-wrap bg-black/40 rounded-xl p-3 border border-purple-500/12 max-h-[360px] overflow-y-auto custom-scrollbar-thin font-mono">{sampleSummary}</pre>
      </SectionCard>
    </div>
  );
}
