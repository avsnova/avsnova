import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, RefreshCw, Search, X, AlertCircle, Wallet, Flame, Heart, Clock3,
  Sparkles, Eye, Copy, CheckCircle2, ListFilter, Repeat, ChevronDown,
} from "lucide-react";
import { Card, Button, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { ServiceLogo } from "../ui/BrandIcon";
import SmmServiceCard, { ServiceCardSkeleton } from "../smm/SmmServiceCard";
import SmmOrderSheet, { type SmmOrderPayload } from "../smm/SmmOrderSheet";
import SmmGuidedOrder from "../smm/SmmGuidedOrder";
import SmmOrderSuccess from "../smm/SmmOrderSuccess";
import SmmOrderTimeline from "../smm/SmmOrderTimeline";
import {
  type SMMService, SOCIAL_NETWORKS_CONFIG, mapCategoryToNetworkGroup, serviceType,
  getFavorites, toggleFavorite as toggleFav, getRecentCategories, pushRecentCategory,
  popularityScore, statusMeta,
} from "../smm/smmHelpers";

interface SMMPanelViewProps {
  walletBalance: number;
  smmBalance?: number;
  onRefreshLedger?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system") => void;
}

// ——— SAFE ERROR BOUNDARY WRAPPER (preserved) ———
export default function SafeSMMPanelWrapper(props: SMMPanelViewProps) {
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState("");

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (e.message && e.message.toLowerCase().includes("smm")) {
        setHasError(true);
        setErrorDetails(e.message);
      }
    };
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  if (hasError) {
    return (
      <Card className="p-8 border-red-500/20 bg-gradient-to-br from-[#1d0a14] to-[#0c020a] space-y-5 text-center max-w-lg mx-auto mt-12">
        <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 w-fit mx-auto">
          <AlertCircle className="h-8 w-8 animate-bounce" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-space text-white">SMM Module Recovery Mode</h3>
          <p className="text-xs text-purple-200/50">An uncaught React rendering exception was safely intercepted inside the SMM Panel component.</p>
        </div>
        {errorDetails && <p className="p-3 rounded-xl bg-black/40 text-[10px] text-red-400 font-mono text-left select-all truncate">Details: {errorDetails}</p>}
        <Button onClick={() => setHasError(false)} className="w-full cursor-pointer">Reset & Reload Component</Button>
      </Card>
    );
  }
  return <SMMPanelView {...props} />;
}

const PAGE_SIZE = 12;

function SMMPanelView({ walletBalance, onRefreshLedger, onAddNotification }: SMMPanelViewProps) {
  const { toast } = useToast();

  const [smmServices, setSmmServices] = useState<SMMService[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  // Navigation / filters
  const [activeNetwork, setActiveNetwork] = useState<string>("popular"); // "popular" | "favorites" | "recent" | network key
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"popular" | "price-asc" | "price-desc">("popular");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Favorites (session-friendly, localStorage)
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recent, setRecent] = useState<string[]>(() => getRecentCategories());

  // Order flow
  const [orderService, setOrderService] = useState<SMMService | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orderId: string | number; serviceName: string; cost: number; eta: string } | null>(null);

  // Order ledger
  const [activeHistoryTab, setActiveHistoryTab] = useState<string>("all");
  const [selectedDetailedOrder, setSelectedDetailedOrder] = useState<any | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  // Item 5: guided step-by-step ordering vs. classic browse grid. Guided is the default,
  // friendlier path; users can switch to Browse for the full searchable catalog.
  const [orderMode, setOrderMode] = useState<"guided" | "browse">("guided");

  const fetchSmmCatalog = async () => {
    try {
      setIsLoadingCatalog(true);
      const data = await apiFetch("/api/smm/services");
      if (data && Array.isArray(data)) setSmmServices(data);
    } catch (err) {
      console.warn("SMM services fetch failed:", err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const fetchUserOrders = async () => {
    try {
      const data = await apiFetch("/api/orders");
      if (data && Array.isArray(data)) setOrders(data.filter((o) => o.category === "SMM"));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchSmmCatalog(); fetchUserOrders(); }, []);

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    setCopiedText(text);
    toast("Copied to clipboard", "success", { silent: true });
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Network chips with live counts.
  const networkCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of smmServices) { const g = mapCategoryToNetworkGroup(s.platform); map[g] = (map[g] || 0) + 1; }
    return map;
  }, [smmServices]);

  // Type options for the active selection.
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of smmServices) {
      if (activeNetwork === "popular" || activeNetwork === "favorites" || activeNetwork === "recent" || mapCategoryToNetworkGroup(s.platform) === activeNetwork) {
        set.add(serviceType(s.name));
      }
    }
    return Array.from(set).sort();
  }, [smmServices, activeNetwork]);

  // The filtered + sorted service list.
  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = smmServices.filter((s) => {
      // scope by nav
      if (activeNetwork === "favorites") { if (!favorites.includes(s.id)) return false; }
      else if (activeNetwork === "recent") { if (!recent.includes(mapCategoryToNetworkGroup(s.platform))) return false; }
      else if (activeNetwork !== "popular") { if (mapCategoryToNetworkGroup(s.platform) !== activeNetwork) return false; }
      // type filter
      if (typeFilter !== "all" && serviceType(s.name) !== typeFilter) return false;
      // search
      if (q && !(s.name.toLowerCase().includes(q) || s.platform.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sortBy === "popular") list = [...list].sort((a, b) => popularityScore(b) - popularityScore(a));
    else if (sortBy === "price-asc") list = [...list].sort((a, b) => (a.ratePer1k || 0) - (b.ratePer1k || 0));
    else if (sortBy === "price-desc") list = [...list].sort((a, b) => (b.ratePer1k || 0) - (a.ratePer1k || 0));
    return list;
  }, [smmServices, activeNetwork, favorites, recent, typeFilter, search, sortBy]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [activeNetwork, typeFilter, search, sortBy]);

  const shownServices = filteredServices.slice(0, visible);

  const onToggleFavorite = (id: string) => {
    const nowFav = toggleFav(id);
    setFavorites(getFavorites());
    toast(nowFav ? "Added to favorites ❤️" : "Removed from favorites", "success", { silent: true });
  };

  const openOrder = (s: SMMService) => {
    setOrderService(s);
    pushRecentCategory(mapCategoryToNetworkGroup(s.platform));
    setRecent(getRecentCategories());
  };

  // ——— Submit an order (identical backend contract, friendly UX) ———
  const submitOrder = async (p: SmmOrderPayload) => {
    setSubmitting(true);
    const maxAttempts = 2;
    let lastErr = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await apiFetch("/api/smm/order", {
          method: "POST",
          body: JSON.stringify({
            serviceId: p.service.api_service_id,
            link: p.link,
            quantity: p.quantity,
            comments: p.comments,
            randomize: p.randomize,
            pollOption: p.pollOption,
            packageSelection: p.packageSelection,
          }),
        });
        setSubmitting(false);
        if (onAddNotification) onAddNotification("SMM Order Placed", `Scheduled organic growth campaign for ${p.service.name}.`, "payment");
        const newId = (res && (res.orderId || res.id)) || `SMM-${Date.now().toString().slice(-6)}`;
        setOrderService(null);
        setSuccess({ orderId: newId, serviceName: p.service.name, cost: p.cost, eta: p.service.avgDelivery || "Typically fast" });
        if (onRefreshLedger) onRefreshLedger();
        fetchUserOrders();
        return;
      } catch (err: any) {
        lastErr = err?.message || "";
        const transient = /gateway|timeout|temporar|503|502|504|slow|network|failed to fetch/i.test(lastErr);
        if (attempt < maxAttempts && transient) {
          toast("Our provider is responding a little slower than usual — retrying…", "info", { silent: true });
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
    setSubmitting(false);
    // Friendly, never-raw error surface.
    const friendly = /insufficient|balance/i.test(lastErr)
      ? "Your wallet balance is too low for this order. Please add funds and try again."
      : /unavailable|not found|disabled/i.test(lastErr)
      ? "This service is temporarily unavailable. Please try another service."
      : "We couldn't place your order just now. Please try again in a moment.";
    toast(friendly, "error");
  };

  const filteredOrders = orders.filter((o) => (activeHistoryTab === "all" ? true : o.status === activeHistoryTab));
  const recentOrders = orders.slice(0, 3);

  const NAV_TABS = [
    { id: "popular", label: "Popular", icon: <Flame className="h-3.5 w-3.5" /> },
    { id: "favorites", label: "Favorites", icon: <Heart className="h-3.5 w-3.5" /> },
    { id: "recent", label: "Recent", icon: <Clock3 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6 font-inter relative text-left pb-4">
      {/* ——— HEADER ——— */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
            <TrendingUp className="h-4 w-4" /> <span>Organic Growth Engine</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">SMM Panel</h2>
          <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">Grow your social presence — pick a service, paste a link, and order in seconds.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-gradient-to-br from-[#0f0a28] to-[#04020a] border border-purple-500/15 px-3.5 py-2">
            <div className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest flex items-center gap-1"><Wallet className="h-3 w-3" /> Wallet</div>
            <div className="text-base font-bold text-emerald-400 font-space">₦{walletBalance.toLocaleString()}</div>
          </div>
          <Button onClick={() => { fetchSmmCatalog(); fetchUserOrders(); }} size="md" className="flex items-center gap-1.5 cursor-pointer active:scale-95">
            <RefreshCw className={`h-4 w-4 ${isLoadingCatalog ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ——— ORDER MODE TOGGLE (Guided vs Browse) ——— */}
      <div className="inline-flex rounded-xl border border-purple-500/20 bg-black/30 p-1 gap-1">
        <button onClick={() => setOrderMode("guided")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${orderMode === "guided" ? "bg-cyan-600/30 border border-cyan-500/40 text-white" : "text-purple-200/50 hover:text-white"}`}>
          ✨ Guided Order
        </button>
        <button onClick={() => setOrderMode("browse")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${orderMode === "browse" ? "bg-cyan-600/30 border border-cyan-500/40 text-white" : "text-purple-200/50 hover:text-white"}`}>
          🗂️ Browse All
        </button>
      </div>

      {/* ——— GUIDED ORDER FLOW (Item 5) ——— */}
      {orderMode === "guided" && (
        <SmmGuidedOrder
          services={smmServices}
          walletBalance={walletBalance}
          submitting={submitting}
          onSubmit={submitOrder}
        />
      )}

      {/* ——— QUICK REORDER (recent orders) ——— */}
      {orderMode === "browse" && recentOrders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto custom-scrollbar-thin pb-1 -mx-1 px-1">
          {recentOrders.map((o) => {
            const svc = smmServices.find((s) => s.name === o.service);
            return (
              <button key={o.id} onClick={() => (svc ? openOrder(svc) : setActiveHistoryTab("all"))}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-purple-500/15 bg-black/30 px-3 py-2 hover:border-purple-500/35 transition-colors cursor-pointer">
                <Repeat className="h-3.5 w-3.5 text-cyan-400" />
                <div className="text-left">
                  <div className="text-[11px] font-bold text-white max-w-[160px] truncate">{o.service}</div>
                  <div className="text-[9px] text-purple-200/40">Reorder · ₦{Number(o.amount || 0).toLocaleString()}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ——— SMART CATEGORY NAVIGATION (Browse mode only) ——— */}
      {orderMode === "browse" && (<>
      <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto custom-scrollbar-thin pb-1 -mx-1 px-1">
          {NAV_TABS.map((t) => (
            <NavChip key={t.id} active={activeNetwork === t.id} onClick={() => { setActiveNetwork(t.id); setTypeFilter("all"); }} icon={t.icon} label={t.label} />
          ))}
          <span className="w-px bg-purple-500/15 mx-1 shrink-0" />
          {SOCIAL_NETWORKS_CONFIG.map((net) => {
            const count = networkCounts[net.key] || 0;
            if (count === 0 && !isLoadingCatalog) return null;
            return (
              <NavChip key={net.key} active={activeNetwork === net.key} onClick={() => { setActiveNetwork(net.key); setTypeFilter("all"); }}
                icon={<ServiceLogo name={net.label} fallback={net.icon} size={16} />} label={net.label} count={count} />
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300/40 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>}
          </div>
          {typeOptions.length > 0 && (
            <div className="relative">
              <ListFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/40 pointer-events-none" />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer">
                <option value="all">All types</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/40 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer">
              <option value="popular">Most popular</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/40 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ——— SERVICE GRID ——— */}
      {isLoadingCatalog ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
        </div>
      ) : filteredServices.length === 0 ? (
        <Card className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center"><Sparkles className="h-7 w-7 text-purple-300/50" /></div>
          <p className="text-sm font-bold text-white">
            {activeNetwork === "favorites" ? "No favorites yet" : search ? `No services match “${search}”` : "No services here yet"}
          </p>
          <p className="text-xs text-purple-200/50 max-w-xs">
            {activeNetwork === "favorites" ? "Tap the heart on any service to save it here for quick access." : "Try another category or clear your search."}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {shownServices.map((s) => (
              <SmmServiceCard key={s.id} service={s} favorite={favorites.includes(s.id)}
                onToggleFavorite={onToggleFavorite} onQuickOrder={openOrder} onOpenDetails={openOrder} />
            ))}
          </div>
          {visible < filteredServices.length && (
            <div className="flex justify-center">
              <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="px-5 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-sm font-bold text-purple-200 hover:text-white cursor-pointer">
                Load more ({filteredServices.length - visible})
              </button>
            </div>
          )}
        </>
      )}
      </>)}

      {/* ——— ORDER HISTORY ——— */}
      <Card className="font-inter">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/15 pb-4 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-space">Your SMM Orders</h3>
            <p className="text-xs text-purple-200/40">Track execution progress and history.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 bg-black/40 p-1 rounded-xl border border-purple-500/10 font-space">
            {["all", "processing", "completed", "partial", "cancelled"].map((tab) => (
              <button key={tab} onClick={() => setActiveHistoryTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${activeHistoryTab === tab ? "bg-purple-600 text-white" : "text-purple-200/40 hover:text-purple-100"}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-10 text-purple-200/40 text-xs">No SMM orders in this filter yet.</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2.5 md:hidden">
              {filteredOrders.map((o) => {
                const meta = statusMeta(o.status);
                return (
                  <button key={o.id} onClick={() => setSelectedDetailedOrder(o)} className="w-full text-left rounded-xl border border-purple-500/12 bg-black/30 p-3.5 cursor-pointer hover:border-purple-500/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">{o.service}</span>
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-purple-200/40">
                      <span className="font-mono text-cyan-400">#{o.id}</span>
                      <span>Qty {o.quantity} · ₦{Number(o.amount || 0).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-purple-500/10 text-[9px] font-bold text-purple-200/40 uppercase tracking-wider font-space">
                    <th className="py-3 px-4">Order ID</th><th className="py-3 px-4">Service</th><th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Quantity</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/5 text-xs">
                  {filteredOrders.map((o) => {
                    const meta = statusMeta(o.status);
                    return (
                      <tr key={o.id} className="hover:bg-white/5 transition-all">
                        <td className="py-4 px-4 font-mono font-bold text-cyan-400 select-all">{o.id}</td>
                        <td className="py-4 px-4"><div className="font-bold text-white">{o.service}</div><div className="text-[10px] text-purple-200/40">₦{Number(o.amount || 0).toLocaleString()}</div></td>
                        <td className="py-4 px-4 font-mono text-purple-200/50 max-w-[150px] truncate select-all" title={o.link}>{o.link}</td>
                        <td className="py-4 px-4 font-bold text-white font-mono">{o.quantity}</td>
                        <td className="py-4 px-4"><Badge variant={meta.tone}>{meta.label}</Badge></td>
                        <td className="py-4 px-4 text-right">
                          <button onClick={() => setSelectedDetailedOrder(o)} className="px-2.5 py-1.5 rounded-lg border border-purple-500/15 hover:border-purple-500/35 bg-purple-500/5 hover:bg-purple-500/10 text-[10px] text-purple-300 font-bold transition-all cursor-pointer inline-flex items-center gap-1 font-space">
                            <Eye className="h-3 w-3" /> Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ——— ORDER SHEET ——— */}
      {orderService && (
        <SmmOrderSheet
          service={orderService} walletBalance={walletBalance} favorite={favorites.includes(orderService.id)}
          onToggleFavorite={onToggleFavorite} submitting={submitting}
          onClose={() => setOrderService(null)} onSubmit={submitOrder}
        />
      )}

      {/* ——— SUCCESS CELEBRATION ——— */}
      {success && (
        <SmmOrderSuccess
          orderId={success.orderId} serviceName={success.serviceName} cost={success.cost} eta={success.eta}
          onViewOrder={() => { setSuccess(null); setActiveHistoryTab("all"); const el = document.querySelector("table"); el?.scrollIntoView({ behavior: "smooth" }); }}
          onContinue={() => setSuccess(null)}
        />
      )}

      {/* ——— ORDER INSPECTOR ——— */}
      {selectedDetailedOrder && (
        <div className="fixed inset-0 z-[170] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => setSelectedDetailedOrder(null)} />
          <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0b0518] p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar-thin text-left animate-sheet-up">
            <div className="flex justify-between items-start border-b border-purple-500/15 pb-3">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block font-space">Order Inspector</span>
                <h3 className="text-base font-bold font-space text-white">{selectedDetailedOrder.service}</h3>
              </div>
              <button onClick={() => setSelectedDetailedOrder(null)} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
            </div>

            {/* Timeline */}
            <div className="py-2"><SmmOrderTimeline status={selectedDetailedOrder.status} /></div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <InspectCell label="Order ID" value={`#${selectedDetailedOrder.id}`} mono onCopy={() => handleCopy(String(selectedDetailedOrder.id))} copied={copiedText === String(selectedDetailedOrder.id)} />
              <InspectCell label="Status" value={statusMeta(selectedDetailedOrder.status).label} />
              <InspectCell label="Charged" value={`₦${Number(selectedDetailedOrder.amount || 0).toLocaleString()}`} tone="emerald" />
              <InspectCell label="Quantity" value={`${selectedDetailedOrder.quantity} units`} />
            </div>

            <div className="rounded-xl bg-black/30 border border-purple-500/8 p-3">
              <div className="text-[10px] text-purple-200/40 font-bold uppercase font-space mb-1">Target link</div>
              <div className="flex items-center gap-2">
                <span className="text-white break-all select-all font-bold text-xs flex-1">{selectedDetailedOrder.link}</span>
                <button onClick={() => handleCopy(selectedDetailedOrder.link)} className="shrink-0 p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 cursor-pointer">
                  {copiedText === selectedDetailedOrder.link ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-purple-950/15 border border-purple-500/10 p-3.5">
              <div className="text-[10px] text-purple-300/70 font-bold uppercase font-space mb-1">Live sync status</div>
              <p className="text-[11px] text-purple-100/80 leading-relaxed">{selectedDetailedOrder.details || "Your order is queued and will begin shortly. Progress updates automatically."}</p>
            </div>

            <div className="flex items-center justify-between text-[10px] text-purple-200/40">
              <span>Placed: <span className="text-white font-bold">{selectedDetailedOrder.date}</span></span>
              <span>Synced just now</span>
            </div>

            <Button onClick={() => setSelectedDetailedOrder(null)} className="w-full">Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavChip({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
        active ? "bg-purple-500/20 border border-purple-500/40 text-white shadow-md shadow-purple-500/10" : "bg-black/30 border border-purple-500/10 text-purple-200/60 hover:text-white hover:border-purple-500/25"
      }`}>
      <span className="h-4 w-4 flex items-center justify-center">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      {typeof count === "number" && count > 0 && <span className="text-[9px] text-purple-200/40 font-mono">{count}</span>}
    </button>
  );
}

function InspectCell({ label, value, tone, mono, onCopy, copied }: { label: string; value: string; tone?: "emerald"; mono?: boolean; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="rounded-xl bg-black/30 border border-purple-500/8 p-3">
      <div className="text-[9px] text-purple-200/40 font-bold uppercase font-space flex items-center justify-between">
        {label}
        {onCopy && <button onClick={onCopy} className="text-purple-300/50 hover:text-white cursor-pointer">{copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}</button>}
      </div>
      <div className={`font-bold mt-0.5 ${tone === "emerald" ? "text-emerald-400" : "text-white"} ${mono ? "font-mono text-cyan-400" : "font-space"}`}>{value}</div>
    </div>
  );
}
