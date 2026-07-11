import { useState } from "react";
import { Send, Loader2, Timer, Cpu, Sparkles, Copy, Check } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { apiFetch } from "../../../utils/api";
import { SectionCard, EmptyState } from "./aiAdminUi";

type ProviderChoice = "auto" | "gemini" | "openai" | "claude" | "local";

interface Result {
  provider: ProviderChoice;
  ok: boolean;
  text: string;
  actualProvider?: string;
  latencyMs: number;
  usage?: { total_tokens?: number } | null;
  error?: string;
}

const CHOICES: { id: ProviderChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "claude", label: "Claude" },
];

const friendly: Record<string, string> = {
  auth: "Auth failed — check key", quota: "Over quota / billing", server: "Provider busy",
  not_configured: "No key set", unknown: "Connection failed",
};

export default function AiTestPanel() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("What can Aurevashop help me with?");
  const [selected, setSelected] = useState<Record<ProviderChoice, boolean>>({ auto: true, gemini: true, openai: false, claude: false, local: false });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const toggle = (id: ProviderChoice) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const run = async () => {
    const providers = CHOICES.filter((c) => selected[c.id]).map((c) => c.id);
    if (!prompt.trim()) { toast("Enter a prompt first.", "warning"); return; }
    if (providers.length === 0) { toast("Select at least one provider.", "warning"); return; }
    setRunning(true);
    setResults([]);
    const out: Result[] = [];
    for (const p of providers) {
      const started = performance.now();
      try {
        const res = await apiFetch("/api/admin/ai/prompt", { method: "POST", body: JSON.stringify({ prompt, provider: p }) });
        out.push({
          provider: p, ok: !!res?.success, text: res?.text || "", actualProvider: res?.provider,
          latencyMs: res?.latencyMs ?? Math.round(performance.now() - started), usage: res?.usage, error: res?.error,
        });
      } catch {
        out.push({ provider: p, ok: false, text: "", latencyMs: Math.round(performance.now() - started), error: "unknown" });
      }
      setResults([...out]);
    }
    setRunning(false);
  };

  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Test AI" right={<Sparkles className="h-4 w-4 text-purple-300/60" />}>
        <div className="space-y-3">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Type a prompt to compare providers…"
            className="w-full px-3.5 py-3 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 resize-none custom-scrollbar-thin" />
          <div className="flex flex-wrap items-center gap-2">
            {CHOICES.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${selected[c.id] ? "bg-purple-500/20 border-purple-500/40 text-white" : "bg-black/30 border-purple-500/15 text-purple-200/50 hover:text-white"}`}>
                {c.label}
              </button>
            ))}
            <button onClick={run} disabled={running}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Run{selected.auto || selected.gemini || selected.openai || selected.claude ? " comparison" : ""}
            </button>
          </div>
        </div>
      </SectionCard>

      {results.length === 0 && !running ? (
        <EmptyState label="Run a prompt to compare provider responses, latency and token usage." icon={<Cpu className="h-7 w-7" />} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {results.map((r, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${r.ok ? "border-purple-500/15 bg-black/30" : "border-red-500/20 bg-red-950/10"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white capitalize">{r.provider}</span>
                  {r.actualProvider && r.actualProvider !== r.provider && <span className="text-[9px] text-cyan-300/70">→ {r.actualProvider}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-200/60"><Timer className="h-3 w-3" /> {r.latencyMs}ms</span>
                  {r.usage?.total_tokens ? <span className="text-[10px] text-purple-200/40">{r.usage.total_tokens} tok</span> : null}
                </div>
              </div>
              {r.ok ? (
                <div className="relative group">
                  <p className="text-xs text-purple-100 whitespace-pre-wrap leading-relaxed bg-black/30 rounded-xl p-3 max-h-56 overflow-y-auto custom-scrollbar-thin">{r.text}</p>
                  <button onClick={() => copy(r.text, `r${i}`)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#1a1030] border border-purple-500/25 text-purple-200/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    {copied === `r${i}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-red-300 bg-red-500/5 rounded-xl p-3">{friendly[r.error || "unknown"] || "Failed"}</p>
              )}
            </div>
          ))}
          {running && <div className="rounded-2xl border border-purple-500/15 bg-black/30 p-4 flex items-center gap-2 text-purple-200/50 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Running…</div>}
        </div>
      )}
    </div>
  );
}
