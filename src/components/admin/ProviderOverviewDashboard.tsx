import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, RefreshCw, Loader2, Wifi, WifiOff, Smartphone, Zap, DollarSign, Gauge, Activity, Boxes } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * ProviderOverviewDashboard — at-a-glance health of every provider (SMS + SMM).
 * Read-only monitoring view backed by /api/admin/providers/overview. Additive; does not touch
 * the customer frontend or any existing admin tab.
 */
export default function ProviderOverviewDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch("/api/admin/providers/overview")); }
    catch (e: any) { toast("Failed to load overview: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (loading && !data) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading provider overview…</div>;
  if (!data) return <div className="py-16 text-center text-purple-300/50 text-xs">Unavailable.</div>;

  const money = (v: any) => (v == null ? "—" : `$${Number(v).toFixed(4)}`);
  const ago = (iso: string | null) => { if (!iso) return "never"; const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };

  return (
    <div className="space-y-5 font-inter text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-cyan-400" /> Provider Overview</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Health of every SMS &amp; SMM provider at a glance. Routing strategy: <span className="text-amber-300 font-bold">{data.strategy}</span>. Auto-refreshes every 60s.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="cursor-pointer"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
      </div>

      {/* SMS providers */}
      <div>
        <div className="text-xs font-bold text-purple-200/70 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-cyan-400" /> SMS Providers</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data.sms || []).map((p: any) => (
            <Card key={p.id} className={`p-4 space-y-2 ${!p.enabled ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-white text-sm flex items-center gap-1.5">{p.online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}{p.label}</div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${p.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-600/30 text-neutral-400"}`}>{p.enabled ? "ENABLED" : "OFF"}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                <span className="text-purple-300/50 flex items-center gap-1"><DollarSign className="h-3 w-3" />Balance</span><span className="text-white font-mono text-right">{money(p.balance)}</span>
                <span className="text-purple-300/50 flex items-center gap-1"><Gauge className="h-3 w-3" />Latency</span><span className="text-white text-right">{p.latencyMs ? `${p.latencyMs}ms` : "—"}</span>
                <span className="text-purple-300/50 flex items-center gap-1"><Activity className="h-3 w-3" />Success</span><span className={`text-right font-bold ${p.successRate == null ? "text-purple-300/40" : p.successRate >= 90 ? "text-emerald-400" : p.successRate >= 60 ? "text-amber-400" : "text-red-400"}`}>{p.successRate == null ? "—" : `${p.successRate}%`}</span>
                <span className="text-purple-300/50">Fail count</span><span className="text-right text-white">{p.failureCount}</span>
                <span className="text-purple-300/50">Last OK</span><span className="text-right text-purple-200/70">{ago(p.lastSuccessAt)}</span>
              </div>
              {p.lastError && <div className="text-[10px] text-red-400/80 truncate" title={p.lastError}>⚠ {p.lastError}</div>}
            </Card>
          ))}
        </div>
      </div>

      {/* SMM providers */}
      <div>
        <div className="text-xs font-bold text-purple-200/70 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Zap className="h-4 w-4 text-purple-400" /> SMM Providers</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data.smm || []).map((p: any) => (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-white text-sm flex items-center gap-1.5">{p.online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}{p.label}</div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${p.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-600/30 text-neutral-400"}`}>{p.enabled ? "ENABLED" : "OFF"}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                <span className="text-purple-300/50 flex items-center gap-1"><DollarSign className="h-3 w-3" />Balance</span><span className="text-white font-mono text-right">{p.balance == null ? "—" : `$${Number(p.balance).toFixed(2)}`}</span>
                <span className="text-purple-300/50 flex items-center gap-1"><Boxes className="h-3 w-3" />Services</span><span className="text-white text-right">{p.servicesAvailable?.toLocaleString?.() ?? p.servicesAvailable}</span>
                <span className="text-purple-300/50">Last sync</span><span className="text-right text-purple-200/70">{ago(p.lastSyncAt)}</span>
                <span className="text-purple-300/50">Fails 24h</span><span className={`text-right font-bold ${p.failures24h > 0 ? "text-amber-400" : "text-emerald-400"}`}>{p.failures24h}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
