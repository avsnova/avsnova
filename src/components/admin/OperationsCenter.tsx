import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, ShoppingBag, Users, Package, Key, Bell, TrendingUp, AlertTriangle,
  Clock, RotateCcw, Image as ImageIcon, LayoutGrid, Activity, ChevronRight,
  Loader2, ArrowUpRight, ShieldCheck, UserPlus, RefreshCw, Megaphone,
  Server, Wifi, WifiOff, Zap, PlusCircle, FileText,
} from "lucide-react";
import { Card } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * OperationsCenter — the platform's interactive control hub (Priority 3).
 * Every widget is a navigation entry point: clicking a metric jumps to the
 * relevant admin module (Credential Inventory, Orders, Users, Product Studio,
 * Media Library, Homepage Builder, Banners, Audit Center, Notifications).
 * Backed by the single consolidated /api/admin/operations endpoint (real data).
 */

interface Ops {
  revenue: { today: number; month: number; totalProfit: number; grossSales: number };
  pending?: { orders: number; profit: number; gross: number; smsSessions: number; smmOrders: number };
  orders: { completed: number; pending: number; refunds: number; salesToday: number; pendingApprovals: number };
  users: { total: number; newToday: number; newWeek: number; active: number; online: number };
  products: { total: number; drafts: number; lowStock: { id: string; name: string; stock: number }[] };
  credentials: { available: number; sold: number; warranty: number; shortages: { product_id: string; name: string; available: number }[] };
  bestSellers: { product_id: string; name: string; units: number; revenue: number }[];
  notifications: { unread: number };
  banners: { active: number; views: number; clicks: number };
  homepage: { enabledSections: number };
  media: { total: number };
  recentActivity: { username: string; action: string; created_at: string }[];
}

interface Props {
  /** Navigate to an admin tab; optional payload lets the target pre-filter. */
  onNavigate: (tab: string, payload?: any) => void;
}

const fmtN = (n: number) => "₦" + Math.round(n || 0).toLocaleString();

interface ProviderHealth {
  provider: string;
  online?: number | boolean;
  last_latency_ms?: number;
  success_count?: number;
  failure_count?: number;
  balance?: number | null;
}

export default function OperationsCenter({ onNavigate }: Props) {
  const { toast } = useToast();
  const [ops, setOps] = useState<Ops | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderHealth[] | null>(null);
  const [balances, setBalances] = useState<Record<string, number | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setOps(await apiFetch("/api/admin/operations")); }
    catch (e: any) { toast("Failed to load operations data: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);

  // Provider balances + health are loaded separately so a slow/offline provider
  // never blocks the main dashboard from rendering.
  const loadProviders = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/sms/providers");
      if (r && Array.isArray(r.health)) setProviders(r.health);
      if (r && r.balances && typeof r.balances === "object") setBalances(r.balances);
    } catch { /* non-fatal: provider widget just stays hidden */ }
  }, []);

  useEffect(() => { load(); loadProviders(); }, [load, loadProviders]);

  if (loading || !ops) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading operations…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-400" /> Operations Center</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Your live control hub. Every card is clickable — jump straight to the module you need.</p>
        </div>
        <button onClick={() => { load(); loadProviders(); }} className="px-3 py-1.5 rounded-lg border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 text-[11px] font-bold text-purple-200 flex items-center gap-1 cursor-pointer"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      {/* Quick actions — the handful of tasks admins do most often, one tap away. */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: <PlusCircle className="h-3.5 w-3.5" />, label: "Add Product", tab: "products" },
          { icon: <Package className="h-3.5 w-3.5" />, label: "Pending Orders", tab: "orders", payload: { filter: "pending" } },
          { icon: <Users className="h-3.5 w-3.5" />, label: "Manage Users", tab: "users" },
          { icon: <Zap className="h-3.5 w-3.5" />, label: "SMS Pools", tab: "sms_pools" },
          { icon: <Megaphone className="h-3.5 w-3.5" />, label: "Announcement", tab: "announcements" },
          { icon: <FileText className="h-3.5 w-3.5" />, label: "Recharge Codes", tab: "recharge" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.tab, a.payload)}
            className="px-3 py-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] hover:bg-cyan-500/15 text-[11px] font-bold text-cyan-200 flex items-center gap-1.5 cursor-pointer transition"
          >
            {a.icon}{a.label}
          </button>
        ))}
      </div>

      {/* Primary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<DollarSign className="h-4 w-4" />} tone="emerald" label="Revenue (today)" value={fmtN(ops.revenue.today)} sub={`${fmtN(ops.revenue.month)} this month`} onClick={() => onNavigate("bi")} />
        <KpiTile icon={<ShoppingBag className="h-4 w-4" />} tone="cyan" label="Pending Orders" value={String(ops.orders.pending)} sub={`${ops.orders.salesToday} sales today`} onClick={() => onNavigate("orders", { filter: "pending" })} />
        <KpiTile icon={<Users className="h-4 w-4" />} tone="amber" label="New Users (24h)" value={String(ops.users.newToday)} sub={`${ops.users.online} online now`} onClick={() => onNavigate("users")} />
        <KpiTile icon={<TrendingUp className="h-4 w-4" />} tone="purple" label="Total Profit" value={fmtN(ops.revenue.totalProfit)} sub={`${fmtN(ops.revenue.grossSales)} gross`} onClick={() => onNavigate("bi")} />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<RotateCcw className="h-4 w-4" />} tone="red" label="Refunds" value={String(ops.orders.refunds)} onClick={() => onNavigate("orders", { filter: "refunded" })} />
        <KpiTile icon={<Clock className="h-4 w-4" />} tone="amber" label="Pending Approvals" value={String(ops.orders.pendingApprovals)} onClick={() => onNavigate("orders", { filter: "approvals" })} />
        <KpiTile icon={<Key className="h-4 w-4" />} tone="cyan" label="Credentials Available" value={String(ops.credentials.available)} sub={`${ops.credentials.warranty} warranty`} onClick={() => onNavigate("credentials")} />
        <KpiTile icon={<Bell className="h-4 w-4" />} tone="pink" label="Unread Notifications" value={String(ops.notifications.unread)} onClick={() => onNavigate("announcements")} />
      </div>

      {/* Pending vs Completed — strict accounting separation (pending never counts as revenue) */}
      {ops.pending && (
        <Card className="border border-amber-500/15 bg-amber-500/[0.03]">
          <div className="flex items-center gap-2 text-amber-300 mb-2">
            <Clock className="h-4 w-4" />
            <h3 className="text-sm font-bold font-space">Pending (not counted as revenue)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <PendingStat label="Pending Orders" value={String(ops.pending.orders)} />
            <PendingStat label="Pending Profit" value={fmtN(ops.pending.profit)} />
            <PendingStat label="Pending Gross" value={fmtN(ops.pending.gross)} />
            <PendingStat label="SMS Sessions" value={String(ops.pending.smsSessions)} />
            <PendingStat label="SMM Orders" value={String(ops.pending.smmOrders)} />
          </div>
          <p className="text-[10px] text-amber-200/40 mt-2">These become Completed — and only then count toward revenue, profit, and customer order totals — once the service is delivered.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Credential shortages → Credential Inventory */}
        <Card className="border border-purple-500/10">
          <button onClick={() => onNavigate("credentials")} className="w-full flex items-center justify-between mb-3 cursor-pointer group">
            <span className="flex items-center gap-2 text-white font-bold font-space text-sm"><AlertTriangle className="h-4 w-4 text-amber-400" /> Credential Shortages</span>
            <ChevronRight className="h-4 w-4 text-purple-300/40 group-hover:text-white" />
          </button>
          {ops.credentials.shortages.length === 0 ? <p className="text-xs text-emerald-300/70">All credential pools are healthy.</p> : (
            <div className="space-y-1.5">
              {ops.credentials.shortages.map((s) => (
                <button key={s.product_id} onClick={() => onNavigate("credentials", { productId: s.product_id })} className="w-full flex items-center justify-between p-2 rounded-lg border border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer">
                  <span className="text-xs text-amber-100 truncate">{s.name}</span>
                  <span className="text-[10px] font-bold text-amber-300 shrink-0">{s.available} left</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Low-stock products → Product Studio */}
        <Card className="border border-purple-500/10">
          <button onClick={() => onNavigate("products")} className="w-full flex items-center justify-between mb-3 cursor-pointer group">
            <span className="flex items-center gap-2 text-white font-bold font-space text-sm"><Package className="h-4 w-4 text-cyan-400" /> Low-Stock Products</span>
            <ChevronRight className="h-4 w-4 text-purple-300/40 group-hover:text-white" />
          </button>
          {ops.products.lowStock.length === 0 ? <p className="text-xs text-emerald-300/70">No products are low on stock.</p> : (
            <div className="space-y-1.5">
              {ops.products.lowStock.map((p) => (
                <button key={p.id} onClick={() => onNavigate("products", { editId: p.id })} className="w-full flex items-center justify-between p-2 rounded-lg border border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer">
                  <span className="text-xs text-cyan-100 truncate">{p.name}</span>
                  <span className="text-[10px] font-bold text-cyan-300 shrink-0">{p.stock} in stock</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Best sellers → Product Studio */}
        <Card className="border border-purple-500/10">
          <button onClick={() => onNavigate("products")} className="w-full flex items-center justify-between mb-3 cursor-pointer group">
            <span className="flex items-center gap-2 text-white font-bold font-space text-sm"><TrendingUp className="h-4 w-4 text-emerald-400" /> Best Sellers</span>
            <ChevronRight className="h-4 w-4 text-purple-300/40 group-hover:text-white" />
          </button>
          {ops.bestSellers.length === 0 ? <p className="text-xs text-purple-300/50">No completed sales yet.</p> : (
            <div className="space-y-1.5">
              {ops.bestSellers.map((b) => (
                <button key={b.product_id} onClick={() => onNavigate("products", { editId: b.product_id })} className="w-full flex items-center justify-between p-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer">
                  <span className="text-xs text-emerald-100 truncate">{b.name}</span>
                  <span className="text-[10px] font-bold text-emerald-300 shrink-0">{b.units} sold · {fmtN(b.revenue)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent activity → Audit Center */}
        <Card className="border border-purple-500/10">
          <button onClick={() => onNavigate("audit")} className="w-full flex items-center justify-between mb-3 cursor-pointer group">
            <span className="flex items-center gap-2 text-white font-bold font-space text-sm"><Activity className="h-4 w-4 text-purple-400" /> Recent Activity</span>
            <ChevronRight className="h-4 w-4 text-purple-300/40 group-hover:text-white" />
          </button>
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
            {ops.recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-cyan-300 font-bold shrink-0">@{a.username}</span>
                <span className="text-purple-200/70 flex-1 min-w-0">{a.action}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Provider health & balances — live status of the SMS/virtual-number providers. */}
      {providers && providers.length > 0 && (
        <Card className="border border-purple-500/10">
          <button onClick={() => onNavigate("provider_overview")} className="w-full flex items-center justify-between mb-3 cursor-pointer group">
            <span className="flex items-center gap-2 text-white font-bold font-space text-sm"><Server className="h-4 w-4 text-cyan-400" /> Provider Health & Balances</span>
            <ChevronRight className="h-4 w-4 text-purple-300/40 group-hover:text-white" />
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providers.map((h) => {
              const online = h.online === 1 || h.online === true;
              const bal = balances[h.provider] ?? h.balance;
              const total = (h.success_count || 0) + (h.failure_count || 0);
              const rate = total >= 5 ? Math.round(((h.success_count || 0) / total) * 100) : null;
              return (
                <div key={h.provider} className={`rounded-xl border p-3 ${online ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-red-500/20 bg-red-500/[0.04]"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-space capitalize">{h.provider}</span>
                    {online
                      ? <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300"><Wifi className="h-3 w-3" /> Online</span>
                      : <span className="flex items-center gap-1 text-[10px] font-bold text-red-300"><WifiOff className="h-3 w-3" /> Offline</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-purple-200/60">
                    <span>Balance</span>
                    <span className="font-mono font-bold text-white">{bal == null ? "—" : `$${Number(bal).toFixed(2)}`}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-purple-200/60">
                    <span>Latency</span>
                    <span className="font-mono text-purple-100">{h.last_latency_ms ? `${h.last_latency_ms}ms` : "—"}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-purple-200/60">
                    <span>Success</span>
                    <span className="font-mono text-purple-100">{rate == null ? "New" : `${rate}%`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Platform navigation tiles */}
      <div>
        <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Quick Access</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-2">
          <NavTile icon={<Package className="h-4 w-4" />} label="Products" sub={`${ops.products.total} · ${ops.products.drafts} drafts`} onClick={() => onNavigate("products")} />
          <NavTile icon={<Key className="h-4 w-4" />} label="Credentials" sub={`${ops.credentials.sold} sold`} onClick={() => onNavigate("credentials")} />
          <NavTile icon={<ImageIcon className="h-4 w-4" />} label="Media" sub={`${ops.media.total} assets`} onClick={() => onNavigate("media")} />
          <NavTile icon={<LayoutGrid className="h-4 w-4" />} label="Homepage" sub={`${ops.homepage.enabledSections} sections`} onClick={() => onNavigate("homepage")} />
          <NavTile icon={<Megaphone className="h-4 w-4" />} label="Banners" sub={`${ops.banners.active} active · ${ops.banners.clicks} clicks`} onClick={() => onNavigate("banners")} />
          <NavTile icon={<UserPlus className="h-4 w-4" />} label="Customers" sub={`${ops.users.total} total`} onClick={() => onNavigate("users")} />
        </div>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: "border-emerald-500/25 hover:border-emerald-500/50 text-emerald-300",
  cyan: "border-cyan-500/25 hover:border-cyan-500/50 text-cyan-300",
  amber: "border-amber-500/25 hover:border-amber-500/50 text-amber-300",
  purple: "border-purple-500/25 hover:border-purple-500/50 text-purple-300",
  red: "border-red-500/25 hover:border-red-500/50 text-red-300",
  pink: "border-pink-500/25 hover:border-pink-500/50 text-pink-300",
};

function KpiTile({ icon, tone, label, value, sub, onClick }: { icon: React.ReactNode; tone: string; label: string; value: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left p-4 rounded-2xl border bg-black/20 transition cursor-pointer group ${TONES[tone] || TONES.purple}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-space opacity-80">{icon}{label}</span>
        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="text-2xl font-bold font-space text-white mt-1.5">{value}</div>
      {sub && <div className="text-[10px] text-purple-300/50 mt-0.5">{sub}</div>}
    </button>
  );
}

function PendingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-500/15 bg-black/20 p-2.5 text-center">
      <div className="text-[9px] uppercase tracking-wide text-amber-200/50 font-space">{label}</div>
      <div className="text-base font-bold font-space text-amber-200 mt-0.5">{value}</div>
    </div>
  );
}

function NavTile({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left p-3 rounded-xl border border-purple-500/15 bg-black/20 hover:border-purple-500/40 hover:bg-white/5 transition cursor-pointer">
      <div className="flex items-center gap-1.5 text-cyan-300">{icon}<span className="text-xs font-bold text-white font-space">{label}</span></div>
      {sub && <div className="text-[10px] text-purple-300/50 mt-1">{sub}</div>}
    </button>
  );
}
