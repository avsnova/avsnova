import { useState, useEffect } from "react";
import { Monitor, Smartphone, Tablet, Globe, ShoppingBag, Wallet, MessageSquare, Loader2, History } from "lucide-react";
import { apiFetch } from "../../utils/api";

/**
 * UserSessionsPanel — enterprise User Directory detail (#22): shows a customer's login
 * history (device, browser, OS, IP, time), distinct devices/IPs, and an activity summary
 * (orders, spend, SMS usage). Backed by /api/admin/users/:id/sessions. Reusable & lazy.
 */

interface Session { id: number; ip_address?: string; device?: string; browser?: string; os?: string; created_at: string; }
interface Props { userId: number; }

function DeviceIcon({ device }: { device?: string }) {
  if (device === "Mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (device === "Tablet") return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export default function UserSessionsPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ips, setIps] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await apiFetch(`/api/admin/users/${userId}/sessions`);
        if (!alive) return;
        setSessions(r.sessions || []);
        setIps(r.ips || []);
        setSummary(r.summary || null);
      } catch { /* non-fatal */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (loading) return <div className="py-4 text-center text-purple-300/40 text-xs"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-3">
      {/* Activity summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-black/30 border border-purple-500/10 p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-[9px] uppercase text-purple-300/50"><ShoppingBag className="h-3 w-3" />Orders</div>
            <div className="text-sm font-bold text-white font-space mt-0.5">{summary.totalOrders}</div>
          </div>
          <div className="rounded-lg bg-black/30 border border-purple-500/10 p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-[9px] uppercase text-purple-300/50"><Wallet className="h-3 w-3" />Spend</div>
            <div className="text-sm font-bold text-emerald-400 font-space mt-0.5">₦{Number(summary.totalSpend || 0).toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-black/30 border border-purple-500/10 p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-[9px] uppercase text-purple-300/50"><MessageSquare className="h-3 w-3" />SMS</div>
            <div className="text-sm font-bold text-cyan-400 font-space mt-0.5">{summary.smsPurchased}</div>
          </div>
        </div>
      )}

      {/* IP history */}
      {ips.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-purple-300/50 font-space flex items-center gap-1 mb-1"><Globe className="h-3 w-3" />IP history</span>
          <div className="flex flex-wrap gap-1.5">
            {ips.map((ip) => <span key={ip} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-200/70">{ip}</span>)}
          </div>
        </div>
      )}

      {/* Login history */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-purple-300/50 font-space flex items-center gap-1 mb-1"><History className="h-3 w-3" />Recent logins</span>
        {sessions.length === 0 ? (
          <p className="text-[11px] text-purple-300/40">No login sessions recorded yet.</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-[11px] p-1.5 rounded-lg bg-black/20 border border-purple-500/5">
                <span className="inline-flex items-center gap-1.5 text-purple-200/80 min-w-0">
                  <DeviceIcon device={s.device} />
                  <span className="truncate">{s.browser || "Unknown"} · {s.os || "Unknown"}</span>
                </span>
                <span className="text-purple-300/40 font-mono shrink-0">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
