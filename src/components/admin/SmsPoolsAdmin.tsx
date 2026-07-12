import { useState, useEffect, useCallback } from "react";
import {
  Server, Loader2, Wifi, WifiOff, RefreshCw, Save, Zap, Activity, Gauge, DollarSign,
  Clock, Eye, EyeOff, Power, Cpu, PlugZap, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * SmsPoolsAdmin — admin dashboard for the provider-independent SMS "pools".
 * Per pool: enable/disable, show/hide from customers, rename label, choose real provider,
 * markup (flat/percent), MANUAL session + cancel-lock timers (used when the provider exposes
 * none, e.g. Grizzly = 20m / 5m), live balance, test connection, and health at a glance.
 * No provider is protected — every pool has identical controls. Uses /api/admin/sms/* endpoints.
 */

const PROVIDERS = [
  { id: "grizzly", label: "Grizzly SMS" },
  { id: "smspool", label: "SMSPool" },
  { id: "fivesim", label: "5SIM" },
];
const mins = (s: number) => (s == null ? "—" : `${Math.round(s / 60)}m`);

export default function SmsPoolsAdmin() {
  const { toast } = useToast();
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string>("");
  const [testing, setTesting] = useState<string>("");
  const [balances, setBalances] = useState<Record<string, any>>({});
  const [health, setHealth] = useState<Record<string, any>>({});
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        apiFetch("/api/admin/sms/pools"),
        apiFetch("/api/admin/sms/providers").catch(() => ({})),
      ]);
      const list = p.pools || [];
      setPools(list);
      const d: Record<string, any> = {};
      list.forEach((x: any) => { d[x.id] = { label: x.label, markup_type: x.markup_type, markup_value: x.markup_value, session_seconds: x.session_seconds, cancel_lock_seconds: x.cancel_lock_seconds }; });
      setDrafts(d);
      if (s.balances) setBalances(s.balances);
      const h: Record<string, any> = {};
      (s.health || []).forEach((x: any) => { h[x.provider] = x; });
      setHealth(h);
    } catch (e: any) { toast("Failed to load pools: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: any, quiet = false) => {
    setSaving(id);
    try {
      await apiFetch(`/api/admin/sms/pools/${id}`, { method: "POST", body: JSON.stringify(body) });
      if (!quiet) toast("Saved.", "success");
      await load();
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(""); }
  };

  const test = async (id: string) => {
    setTesting(id);
    try {
      const r = await apiFetch(`/api/admin/sms/pools/${id}/test`, { method: "POST" });
      if (r.connected) toast(`Connected — balance $${Number(r.balance).toFixed(4)} (${r.latencyMs}ms)`, "success");
      else toast(`Connection failed: ${r.error}`, "error");
      await load();
    } catch (e: any) { toast("Test failed: " + e.message, "error"); }
    finally { setTesting(""); }
  };

  if (loading) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading SMS pools…</div>;

  return (
    <div className="space-y-4 font-inter text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><Server className="h-5 w-5 text-cyan-400" /> SMS Pools</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Each pool = one provider behind a neutral customer label. Enable/disable, rename, set markup &amp; manual timers, test connectivity. No provider is protected.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="cursor-pointer"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {pools.map((pool) => {
          const d = drafts[pool.id] || {};
          const h = health[pool.provider] || {};
          const bal = balances[pool.provider];
          const online = h.online !== 0;
          const total = (h.success_count || 0) + (h.failure_count || 0);
          const sr = total ? Math.round((h.success_count / total) * 100) : null;
          const dirty = d.label !== pool.label || Number(d.markup_value) !== Number(pool.markup_value) || d.markup_type !== pool.markup_type || Number(d.session_seconds) !== Number(pool.session_seconds) || Number(d.cancel_lock_seconds) !== Number(pool.cancel_lock_seconds);
          const setD = (k: string, v: any) => setDrafts((prev) => ({ ...prev, [pool.id]: { ...prev[pool.id], [k]: v } }));
          return (
            <Card key={pool.id} className={`p-4 space-y-3 ${pool.enabled ? "" : "opacity-80"}`}>
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`h-10 w-10 rounded-xl flex items-center justify-center border ${pool.enabled ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-300" : "bg-white/5 border-white/10 text-white/40"}`}><Cpu className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">{pool.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-purple-200/70">{pool.id}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono">
                      {online ? <span className="text-emerald-300 flex items-center gap-1"><Wifi className="h-2.5 w-2.5" />ONLINE</span> : <span className="text-red-300 flex items-center gap-1"><WifiOff className="h-2.5 w-2.5" />OFFLINE</span>}
                      <span className="text-white/30">·</span>
                      <span className="text-white/50">{PROVIDERS.find((x) => x.id === pool.provider)?.label || pool.provider}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => patch(pool.id, { enabled: !pool.enabled })} disabled={saving === pool.id}
                    title={pool.enabled ? "Disable pool" : "Enable pool"}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 ${pool.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-white/50 border border-white/10"}`}>
                    <Power className="h-3 w-3" />{pool.enabled ? "ON" : "OFF"}
                  </button>
                  <button onClick={() => patch(pool.id, { hidden: !pool.hidden })} disabled={saving === pool.id}
                    title={pool.hidden ? "Hidden from customers" : "Visible to customers"}
                    className={`p-1.5 rounded-lg cursor-pointer border ${pool.hidden ? "bg-amber-500/10 text-amber-300 border-amber-500/25" : "bg-black/30 text-white/50 border-white/10"}`}>
                    {pool.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Live stats */}
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<DollarSign className="h-3 w-3" />} label="Balance" value={bal == null ? "—" : `$${Number(bal).toFixed(2)}`} />
                <Stat icon={<Activity className="h-3 w-3" />} label="Success" value={sr == null ? "New" : `${sr}%`} tone={sr == null ? "muted" : sr >= 90 ? "good" : sr >= 60 ? "warn" : "bad"} />
                <Stat icon={<Gauge className="h-3 w-3" />} label="Latency" value={h.last_latency_ms ? `${h.last_latency_ms}ms` : "—"} />
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field label="Customer label">
                  <input value={d.label ?? ""} onChange={(e) => setD("label", e.target.value)} className={inp} />
                </Field>
                <Field label="Provider (behind this pool)">
                  <select value={pool.provider} onChange={(e) => patch(pool.id, { provider: e.target.value })} className={inp}>
                    {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </Field>
                <Field label="Markup type">
                  <select value={d.markup_type ?? "flat"} onChange={(e) => setD("markup_type", e.target.value)} className={inp}>
                    <option value="flat">Flat (₦)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </Field>
                <Field label={d.markup_type === "percent" ? "Markup (%)" : "Markup (₦)"}>
                  <input type="number" value={d.markup_value ?? 0} onChange={(e) => setD("markup_value", e.target.value)} className={inp} />
                </Field>
                <Field label="Session (minutes)" hint="How long a number stays active">
                  <input type="number" value={Math.round((d.session_seconds ?? 1200) / 60)} onChange={(e) => setD("session_seconds", Math.max(1, parseInt(e.target.value) || 0) * 60)} className={inp} />
                </Field>
                <Field label="Cancel lock (minutes)" hint="Wait before Cancel appears">
                  <input type="number" value={Math.round((d.cancel_lock_seconds ?? 120) / 60)} onChange={(e) => setD("cancel_lock_seconds", Math.max(0, parseInt(e.target.value) || 0) * 60)} className={inp} />
                </Field>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="text-[10px] text-white/35 font-mono">Session {mins(d.session_seconds ?? pool.session_seconds)} · Cancel lock {mins(d.cancel_lock_seconds ?? pool.cancel_lock_seconds)}</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => test(pool.id)} disabled={testing === pool.id} className="cursor-pointer text-[11px]">
                    {testing === pool.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><PlugZap className="h-3.5 w-3.5 mr-1" />Test</>}
                  </Button>
                  <Button size="sm" onClick={() => patch(pool.id, { label: d.label, markup_type: d.markup_type, markup_value: d.markup_value, session_seconds: d.session_seconds, cancel_lock_seconds: d.cancel_lock_seconds })} disabled={!dirty || saving === pool.id} className="cursor-pointer text-[11px] bg-cyan-500/90 hover:bg-cyan-400 text-black">
                    {saving === pool.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" />Save</>}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const inp = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500/40";
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">{label}</label>
      {children}
      {hint ? <div className="text-[9px] text-white/30">{hint}</div> : null}
    </div>
  );
}
function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "good" | "warn" | "bad" | "muted" }) {
  const c = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 px-2 py-1.5">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-[12px] font-mono font-bold ${c}`}>{value}</div>
    </div>
  );
}
