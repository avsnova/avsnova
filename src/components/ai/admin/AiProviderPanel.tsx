import { useState, useEffect, useCallback } from "react";
import { Cpu, Check, KeyRound, Loader2, Wifi, WifiOff, Save, Trash2, ShieldCheck } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { apiFetch } from "../../../utils/api";
import { setAiConfig } from "../../../ai/aiConfig";
import { SectionCard, Toggle, Skeleton } from "./aiAdminUi";

type ProviderId = "openai" | "gemini" | "claude";
type SelectId = "local" | "auto" | ProviderId;

interface AdminConfig {
  enabled: number;
  provider: SelectId;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  streaming: number;
  fallbackLocal: number;
  openaiModel: string; geminiModel: string; claudeModel: string;
  openaiKeyMasked: string; geminiKeyMasked: string; claudeKeyMasked: string;
}
interface ProviderStatus { configured: boolean; model: string; }

const PROVIDER_META: { id: ProviderId; name: string; hint: string; placeholder: string }[] = [
  { id: "openai", name: "OpenAI (GPT)", hint: "e.g. gpt-4o-mini", placeholder: "sk-…" },
  { id: "gemini", name: "Google Gemini", hint: "e.g. gemini-2.5-flash-lite", placeholder: "AIza… / AQ.…" },
  { id: "claude", name: "Anthropic Claude", hint: "e.g. claude-3-5-sonnet-20241022", placeholder: "sk-ant-…" },
];

const friendlyTest: Record<string, string> = {
  auth: "Authentication failed — check the API key.",
  quota: "Key works, but the account is over quota / needs billing.",
  server: "Provider is temporarily busy. Try again shortly.",
  not_configured: "No API key set for this provider yet.",
  unknown: "Couldn't connect. Please verify the key and model.",
};

export default function AiProviderPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [status, setStatus] = useState<Record<ProviderId, ProviderStatus> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<ProviderId, string>>({ openai: "", gemini: "", claude: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/ai/config");
      if (res?.success) { setCfg(res.config); setStatus(res.status); }
    } catch { toast("Couldn't load AI configuration.", "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const patch = (p: Partial<AdminConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled: cfg.enabled ? 1 : 0,
        provider: cfg.provider,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        timeoutMs: cfg.timeoutMs,
        streaming: cfg.streaming ? 1 : 0,
        fallbackLocal: cfg.fallbackLocal ? 1 : 0,
        openaiModel: cfg.openaiModel, geminiModel: cfg.geminiModel, claudeModel: cfg.claudeModel,
      };
      // Only send keys the admin actually typed (never blanks the stored key).
      if (keyInputs.openai.trim()) body.openaiKey = keyInputs.openai.trim();
      if (keyInputs.gemini.trim()) body.geminiKey = keyInputs.gemini.trim();
      if (keyInputs.claude.trim()) body.claudeKey = keyInputs.claude.trim();

      const res = await apiFetch("/api/admin/ai/config", { method: "POST", body: JSON.stringify(body) });
      if (res?.success) {
        // Mirror the active provider + toggles into the client-side config store so the
        // assistant reacts instantly (keys stay server-side only).
        setAiConfig({ status: cfg.enabled ? "online" : "offline", provider: cfg.provider === "auto" ? "gemini" : cfg.provider });
        setKeyInputs({ openai: "", gemini: "", claude: "" });
        toast("AI configuration saved.", "success");
        await load();
      } else toast("Failed to save configuration.", "error");
    } catch { toast("Failed to save configuration.", "error"); }
    finally { setSaving(false); }
  };

  const test = async (id: ProviderId) => {
    setTesting(id);
    try {
      // Save first if a new key was typed, so the test uses it.
      if (keyInputs[id].trim()) await save();
      const res = await apiFetch("/api/admin/ai/test", { method: "POST", body: JSON.stringify({ provider: id }) });
      if (res?.ok) toast(`${id} connected ✓ (${res.latencyMs}ms · ${res.model})`, "success");
      else toast(`${id}: ${friendlyTest[res?.category] || friendlyTest.unknown}`, res?.category === "quota" ? "warning" : "error");
      await load();
    } catch { toast("Connection test failed.", "error"); }
    finally { setTesting(null); }
  };

  const clearKey = async (id: ProviderId) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { [`clear${id.charAt(0).toUpperCase() + id.slice(1)}Key`]: true };
      await apiFetch("/api/admin/ai/config", { method: "POST", body: JSON.stringify(body) });
      toast(`${id} key removed.`, "success");
      await load();
    } catch { toast("Failed to clear key.", "error"); }
    finally { setSaving(false); }
  };

  if (loading || !cfg) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-40" />
      </div>
    );
  }

  const SELECTS: { id: SelectId; label: string }[] = [
    { id: "local", label: "Local AI (offline)" },
    { id: "auto", label: "Auto (smart fallback)" },
    { id: "gemini", label: "Google Gemini" },
    { id: "openai", label: "OpenAI (GPT)" },
    { id: "claude", label: "Anthropic Claude" },
  ];

  return (
    <div className="space-y-4">
      {/* Master + active provider */}
      <SectionCard title="AI Engine" right={
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.enabled ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : "bg-red-500/10 border-red-500/25 text-red-300"}`}>
          {cfg.enabled ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {cfg.enabled ? "Enabled" : "Disabled"}
        </span>
      }>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-bold text-white">Enable AI Assistant</div><div className="text-[11px] text-purple-200/40">When off, Aria stays hidden for customers.</div></div>
            <Toggle checked={!!cfg.enabled} onChange={(v) => patch({ enabled: v ? 1 : 0 })} />
          </div>

          <div>
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Active provider</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-1.5">
              {SELECTS.map((s) => (
                <button key={s.id} onClick={() => patch({ provider: s.id })}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${cfg.provider === s.id ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white border-transparent shadow" : "bg-black/30 border-purple-500/15 text-purple-200/60 hover:text-white"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-purple-200/40 mt-1.5">
              {cfg.provider === "local" ? "Uses the built-in offline engine only." :
               cfg.provider === "auto" ? "Tries your configured providers in order, then falls back to Local AI." :
               `Uses ${cfg.provider}, with optional fallback to Local AI.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-xl bg-black/30 border border-purple-500/12 px-3 py-2.5">
              <span className="text-[11px] font-bold text-white">Real streaming</span>
              <Toggle checked={!!cfg.streaming} onChange={(v) => patch({ streaming: v ? 1 : 0 })} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-black/30 border border-purple-500/12 px-3 py-2.5">
              <span className="text-[11px] font-bold text-white">Fallback to Local</span>
              <Toggle checked={!!cfg.fallbackLocal} onChange={(v) => patch({ fallbackLocal: v ? 1 : 0 })} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Generation params */}
      <SectionCard title="Generation Settings" right={<ShieldCheck className="h-4 w-4 text-purple-300/60" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Temperature ({cfg.temperature.toFixed(2)})</span>
            <input type="range" min={0} max={1.5} step={0.05} value={cfg.temperature} onChange={(e) => patch({ temperature: parseFloat(e.target.value) })} className="w-full accent-purple-500 cursor-pointer" />
            <span className="text-[10px] text-purple-200/40">{cfg.temperature < 0.3 ? "Precise" : cfg.temperature < 0.8 ? "Balanced" : "Creative"}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Max tokens</span>
            <input type="number" value={cfg.maxTokens} min={50} max={4000} onChange={(e) => patch({ maxTokens: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Timeout (ms)</span>
            <input type="number" value={cfg.timeoutMs} min={3000} max={60000} step={1000} onChange={(e) => patch({ timeoutMs: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          </label>
        </div>
      </SectionCard>

      {/* Provider keys */}
      <SectionCard title="Provider API Keys" right={<span className="text-[10px] text-purple-200/40 flex items-center gap-1"><KeyRound className="h-3 w-3" /> stored server-side only</span>}>
        <div className="space-y-3">
          {PROVIDER_META.map((p) => {
            const st = status?.[p.id];
            const masked = (cfg as any)[`${p.id}KeyMasked`] as string;
            const modelKey = `${p.id}Model` as keyof AdminConfig;
            return (
              <div key={p.id} className="rounded-2xl border border-purple-500/15 bg-black/25 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${st?.configured ? "bg-gradient-to-tr from-purple-600 to-cyan-500" : "bg-white/5"}`}><Cpu className="h-4 w-4 text-white" /></div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5">
                        {p.name}
                        {st?.configured && <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"><Check className="h-2.5 w-2.5" /> Key set</span>}
                      </div>
                      <div className="text-[10px] text-purple-200/40">{masked || "No key configured"}</div>
                    </div>
                  </div>
                  <button onClick={() => test(p.id)} disabled={testing === p.id || (!st?.configured && !keyInputs[p.id].trim())}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-200 text-[11px] font-bold hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                    {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />} Test
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex gap-1.5">
                    <input type="password" value={keyInputs[p.id]} onChange={(e) => setKeyInputs((k) => ({ ...k, [p.id]: e.target.value }))} placeholder={masked ? "Enter to replace…" : p.placeholder}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
                    {st?.configured && <button onClick={() => clearKey(p.id)} title="Remove key" className="px-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                  <input value={(cfg[modelKey] as string) || ""} onChange={(e) => patch({ [modelKey]: e.target.value } as Partial<AdminConfig>)} placeholder={p.hint}
                    className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-purple-500/20">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save configuration
        </button>
      </div>
    </div>
  );
}
