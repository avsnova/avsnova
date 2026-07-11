import { useState, useEffect, useCallback } from "react";
import {
  Smartphone, RefreshCw, Loader2, CheckCircle2, XCircle, Wifi, WifiOff, Save,
  Activity, DollarSign, Gauge, ScrollText, Route, KeyRound,
} from "lucide-react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * SmsConfigCenter — the dedicated "SMS Configuration" admin section.
 * A single place for everything SMS: providers, priority, enable/disable, API keys, balances,
 * test connection, default/primary + strategy (smart routing), health status, route-plan
 * preview, and provider logs. Purely additive — the existing "SMS Management" tab is untouched,
 * and the customer frontend is not modified. All data comes from /api/admin/sms/* endpoints.
 */

const PROVIDER_LABELS: Record<string, string> = { grizzly: "Grizzly SMS", fivesim: "5SIM", smspool: "SMSPool" };
const STRATEGY_LABELS: Record<string, string> = {
  cheapest: "Cheapest (auto)", success: "Highest success rate", fastest: "Fastest response",
  preferred: "Preferred + fallback", manual: "Manual priority order",
};

export default function SmsConfigCenter() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ fivesim_api_key: string; smspool_api_key: string }>({ fivesim_api_key: "", smspool_api_key: "" });
  const [logs, setLogs] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [planQ, setPlanQ] = useState({ country: "16", service: "tg" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/sms/providers");
      setData(r);
    } catch (e: any) { toast("Failed to load SMS config: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);

  const loadLogs = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/sms/provider-logs?limit=40"); setLogs(r.logs || []); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { load(); loadLogs(); }, [load, loadLogs]);

  const save = async (patch: any) => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/sms/providers", { method: "POST", body: JSON.stringify(patch) });
      toast("Saved.", "success");
      await load();
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const testConnection = async (provider: string) => {
    setTesting(provider);
    try {
      const r = await apiFetch("/api/admin/sms/test-connection", { method: "POST", body: JSON.stringify({ provider }) });
      if (r.connected) toast(`${PROVIDER_LABELS[provider]} connected — balance $${Number(r.balance).toFixed(4)} (${r.latencyMs}ms)`, "success");
      else toast(`${PROVIDER_LABELS[provider]} failed: ${r.error}`, "error");
      await load();
    } catch (e: any) { toast("Test failed: " + e.message, "error"); }
    finally { setTesting(null); }
  };

  const previewPlan = async () => {
    try {
      const r = await apiFetch(`/api/admin/sms/route-plan?country=${encodeURIComponent(planQ.country)}&service=${encodeURIComponent(planQ.service)}`);
      setPlan(r);
    } catch (e: any) { toast("Route preview failed: " + e.message, "error"); }
  };

  if (loading) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading SMS configuration…</div>;
  if (!data) return <div className="py-16 text-center text-purple-300/50 text-xs">Unavailable.</div>;

  const healthByProvider: Record<string, any> = {};
  (data.health || []).forEach((h: any) => { healthByProvider[h.provider] = h; });

  return (
    <div className="space-y-5 font-inter text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><Smartphone className="h-5 w-5 text-cyan-400" /> SMS Configuration</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Providers, smart routing, API keys, balances, health &amp; logs — all in one place. Grizzly stays the default; new providers are opt-in.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { load(); loadLogs(); }} className="cursor-pointer"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
      </div>

      {/* Routing strategy */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-bold text-white flex items-center gap-2"><Route className="h-4 w-4 text-amber-400" /> Smart Routing Strategy</div>
        <p className="text-[11px] text-purple-300/50">How the engine chooses a provider for each order. All strategies fail over across every enabled provider before erroring.</p>
        <div className="flex flex-wrap gap-2">
          {(data.strategies || []).map((s: string) => (
            <button key={s} onClick={() => save({ strategy: s })} disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer border ${data.strategy === s ? "bg-amber-500/20 border-amber-500/40 text-white" : "bg-black/20 border-purple-500/15 text-purple-300/60 hover:text-white"}`}>
              {STRATEGY_LABELS[s] || s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <label className="text-[11px] text-purple-300/60">Primary:&nbsp;
            <select value={data.primary} onChange={(e) => save({ primary: e.target.value })} className="bg-black/30 border border-purple-500/20 rounded px-2 py-1 text-white text-[11px]">
              {data.providers.map((p: string) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-purple-300/60">Secondary:&nbsp;
            <select value={data.secondary} onChange={(e) => save({ secondary: e.target.value })} className="bg-black/30 border border-purple-500/20 rounded px-2 py-1 text-white text-[11px]">
              <option value="">— none —</option>
              {data.providers.map((p: string) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {data.providers.map((p: string) => {
          const h = healthByProvider[p] || {};
          const enabled = data.enabled[p];
          const online = h.online !== 0;
          const bal = data.balances?.[p];
          const total = (h.success_count || 0) + (h.failure_count || 0);
          const sr = total ? Math.round((h.success_count / total) * 100) : 100;
          return (
            <Card key={p} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-white text-sm flex items-center gap-1.5">
                  {online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
                  {PROVIDER_LABELS[p]}
                </div>
                <button onClick={() => save({ enabled: { [p]: !enabled } })} disabled={saving || p === "grizzly"}
                  title={p === "grizzly" ? "Grizzly is the default provider" : ""}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-600/30 text-neutral-400"} ${p === "grizzly" ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {enabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="text-purple-300/50 flex items-center gap-1"><DollarSign className="h-3 w-3" />Balance</div>
                <div className="text-white font-mono text-right">{bal == null ? "—" : `$${Number(bal).toFixed(4)}`}</div>
                <div className="text-purple-300/50 flex items-center gap-1"><Gauge className="h-3 w-3" />Latency</div>
                <div className="text-white text-right">{h.last_latency_ms ? `${h.last_latency_ms}ms` : "—"}</div>
                <div className="text-purple-300/50 flex items-center gap-1"><Activity className="h-3 w-3" />Success</div>
                <div className={`text-right font-bold ${sr >= 90 ? "text-emerald-400" : sr >= 60 ? "text-amber-400" : "text-red-400"}`}>{sr}% <span className="text-purple-300/40 font-normal">({h.success_count || 0}/{total})</span></div>
                <div className="text-purple-300/50">API key</div>
                <div className="text-right">{data.hasKey?.[p] ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 inline" /> : <XCircle className="h-3.5 w-3.5 text-red-400 inline" />}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => testConnection(p)} disabled={testing === p} className="w-full text-[11px] cursor-pointer">
                {testing === p ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Wifi className="h-3.5 w-3.5 mr-1" /> Test Connection</>}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* API keys (write-only) */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="h-4 w-4 text-cyan-400" /> API Keys</div>
        <p className="text-[11px] text-purple-300/50">Keys are stored server-side and never shown back. Leave blank to keep the current value. Grizzly's key is managed in the existing settings.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-purple-300/60">5SIM API key {data.hasKey?.fivesim && <span className="text-emerald-400">(set)</span>}</label>
            <Input type="password" placeholder="Enter to update…" value={keys.fivesim_api_key} onChange={(e) => setKeys((k) => ({ ...k, fivesim_api_key: e.target.value }))} autoComplete="off" />
          </div>
          <div>
            <label className="text-[11px] text-purple-300/60">SMSPool API key {data.hasKey?.smspool && <span className="text-emerald-400">(set)</span>}</label>
            <Input type="password" placeholder="Enter to update…" value={keys.smspool_api_key} onChange={(e) => setKeys((k) => ({ ...k, smspool_api_key: e.target.value }))} autoComplete="off" />
          </div>
        </div>
        <Button size="sm" disabled={saving || (!keys.fivesim_api_key && !keys.smspool_api_key)} onClick={async () => { await save({ ...(keys.fivesim_api_key ? { fivesim_api_key: keys.fivesim_api_key } : {}), ...(keys.smspool_api_key ? { smspool_api_key: keys.smspool_api_key } : {}) }); setKeys({ fivesim_api_key: "", smspool_api_key: "" }); }} className="cursor-pointer">
          <Save className="h-3.5 w-3.5 mr-1" /> Save keys
        </Button>
      </Card>

      {/* Route-plan preview */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-bold text-white flex items-center gap-2"><Route className="h-4 w-4 text-purple-400" /> Route Plan Preview</div>
        <p className="text-[11px] text-purple-300/50">See which provider the engine would pick for a country + service (Grizzly codes, e.g. country 16 = UK, service tg = Telegram).</p>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-[10px] text-purple-300/50 block">Country code</label><Input value={planQ.country} onChange={(e) => setPlanQ((q) => ({ ...q, country: e.target.value }))} className="max-w-[110px]" /></div>
          <div><label className="text-[10px] text-purple-300/50 block">Service code</label><Input value={planQ.service} onChange={(e) => setPlanQ((q) => ({ ...q, service: e.target.value }))} className="max-w-[110px]" /></div>
          <Button size="sm" onClick={previewPlan} className="cursor-pointer">Preview</Button>
        </div>
        {plan && (
          <div className="text-[11px] space-y-1">
            <div className="text-purple-300/60">Strategy: <span className="text-white font-bold">{plan.strategy}</span></div>
            {(plan.ranked || []).length === 0 ? <div className="text-red-400">No enabled provider can fulfill this.</div> : (plan.ranked || []).map((c: any, i: number) => (
              <div key={c.provider} className="flex items-center gap-2 text-white">
                <span className="text-purple-300/50">{i + 1}.</span>
                <span className="font-bold">{PROVIDER_LABELS[c.provider]}</span>
                <span className="text-emerald-400">${c.costUsd}</span>
                <span className="text-purple-300/40">stock {c.count ?? "—"} · {(c.successRate * 100).toFixed(0)}% · {c.latency ?? "—"}ms</span>
                {i === 0 && <span className="text-[9px] bg-amber-500/20 text-amber-300 rounded px-1">SELECTED</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Provider logs */}
      <Card className="p-4">
        <div className="text-sm font-bold text-white flex items-center gap-2 mb-3"><ScrollText className="h-4 w-4 text-cyan-400" /> Provider Logs <span className="text-[10px] text-purple-300/40">(requests, fallbacks, retries)</span></div>
        <div className="max-h-72 overflow-auto rounded-lg border border-white/5">
          <table className="w-full text-[10.5px]">
            <thead className="text-purple-300/50 sticky top-0 bg-[#1a1030]">
              <tr><th className="text-left px-2 py-1.5">Time</th><th className="text-left px-2 py-1.5">Provider</th><th className="text-left px-2 py-1.5">Action</th><th className="text-left px-2 py-1.5">Status</th><th className="text-left px-2 py-1.5">ms</th><th className="text-left px-2 py-1.5">Detail</th></tr>
            </thead>
            <tbody>
              {logs.length === 0 ? <tr><td colSpan={6} className="text-center text-purple-300/40 py-6">No provider calls logged yet.</td></tr> : logs.map((l, i) => (
                <tr key={i} className="border-t border-white/5 text-purple-200/80">
                  <td className="px-2 py-1 whitespace-nowrap">{new Date(l.created_at).toLocaleTimeString()}</td>
                  <td className="px-2 py-1">{l.provider}</td>
                  <td className="px-2 py-1">{l.action}</td>
                  <td className={`px-2 py-1 font-bold ${l.status === "ok" ? "text-emerald-400" : l.status === "fallback" || l.status === "retry" ? "text-amber-400" : "text-red-400"}`}>{l.status}</td>
                  <td className="px-2 py-1">{l.latency_ms || "—"}</td>
                  <td className="px-2 py-1 max-w-[240px] truncate" title={l.response}>{l.response}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
