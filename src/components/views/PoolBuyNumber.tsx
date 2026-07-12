import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, Loader2, Signal, Clock, CheckCircle2, XCircle, Copy, RefreshCw, ShieldCheck,
  ChevronRight, Star, Server, AlertTriangle, PhoneCall, Inbox, X,
} from "lucide-react";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { CountryFlag, ServiceLogo } from "../ui/BrandIcon";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

/**
 * PoolBuyNumber — provider-independent "pools" purchase experience (production rebuild).
 * Flow: pick a Pool → that pool's OWN countries → services (live price+stock) → confirm → buy.
 * Providers are masked (customer only sees pool labels). Timers come from the provider
 * (providerTimer flag); when a provider exposes none we show "Estimated"/"Unavailable" — never faked.
 * Backed by /api/sms/pools/* and /api/sms/numbers. Self-contained; safe to render standalone.
 */

type Pool = { id: string; label: string; online?: boolean; successRate?: number | null; latencyMs?: number | null };
type Country = { id: string; name: string; prefix?: string; iso?: string };
type Service = { id: string; name: string; stock: number; inStock: boolean; priceNgn: number; successRate?: number | null };
type ActiveLine = {
  id: string; number: string; country: string; flag?: string; service: string; status: string;
  otpReceived?: string; created_at: string; poolLabel?: string; provider?: string; remaining: number;
  providerTimer?: boolean; expires_at?: string; last_sync?: string; cancellable?: boolean; cancel_in?: number;
  cost?: number;
};

const naira = (n: number) => "₦" + Math.round(n).toLocaleString();
const FAV_KEY = "avs_sms_fav";

function loadFav(): Record<string, string[]> { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "{}"); } catch { return {}; } }
function saveFav(f: Record<string, string[]>) { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch {} }

function fmtTime(sec: number) {
  if (sec == null || sec < 0) return "0:00";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function ago(iso?: string) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now"; if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function PoolBuyNumber({ walletBalance = 0, onAddNotification }: { walletBalance?: number; onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system") => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [pools, setPools] = useState<Pool[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [pool, setPool] = useState<Pool | null>(null);

  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countriesError, setCountriesError] = useState("");
  const [country, setCountry] = useState<Country | null>(null);
  const [countryQ, setCountryQ] = useState("");

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [service, setService] = useState<Service | null>(null);
  const [serviceQ, setServiceQ] = useState("");

  const [buying, setBuying] = useState(false);
  const [fav, setFav] = useState<Record<string, string[]>>(loadFav());

  const [active, setActive] = useState<ActiveLine[]>([]);
  const [instructions, setInstructions] = useState<{ id: number; title: string; body: string }[]>([]);
  const buyLock = useRef(false);

  // Admin-managed SMS panel instructions (purchase guidelines, refund policy, etc.).
  useEffect(() => {
    apiFetch("/api/sms/instructions").then((r) => setInstructions(r.instructions || [])).catch(() => {});
  }, []);

  // ── Load pools ──
  useEffect(() => {
    (async () => {
      setPoolsLoading(true);
      try {
        const r = await apiFetch("/api/sms/pools");
        setPools(r.pools || []);
        if ((r.pools || []).length === 1) setPool(r.pools[0]); // auto-select if only one
      } catch (e: any) { toast("Could not load pools: " + e.message, "error"); }
      finally { setPoolsLoading(false); }
    })();
  }, [toast]);

  // ── Load a pool's own countries ──
  const loadCountries = useCallback(async (p: Pool) => {
    setCountriesLoading(true); setCountriesError(""); setCountries([]); setCountry(null); setServices([]); setService(null);
    try {
      const r = await apiFetch(`/api/sms/pools/${p.id}/countries`);
      setCountries(r.countries || []);
    } catch (e: any) {
      setCountriesError("This pool's countries are unavailable right now. Please try another pool or refresh.");
    } finally { setCountriesLoading(false); }
  }, []);

  useEffect(() => { if (pool) loadCountries(pool); }, [pool, loadCountries]);

  // ── Load services for a pool+country ──
  const loadServices = useCallback(async (p: Pool, c: Country) => {
    setServicesLoading(true); setServicesError(""); setServices([]); setService(null);
    try {
      const r = await apiFetch(`/api/sms/pools/${p.id}/services?country=${encodeURIComponent(c.id)}`);
      setServices(r.services || []);
    } catch (e: any) {
      setServicesError("Services for this country are unavailable right now. Please try again.");
    } finally { setServicesLoading(false); }
  }, []);

  useEffect(() => { if (pool && country) loadServices(pool, country); }, [pool, country, loadServices]);

  // ── Active orders polling (provider-truth) ──
  const refreshActive = useCallback(async () => {
    try {
      const rows = await apiFetch("/api/sms/numbers");
      setActive(Array.isArray(rows) ? rows.filter((r: ActiveLine) => ["active", "completed"].includes(r.status) || r.otpReceived) : []);
    } catch (e) { /* keep last */ }
  }, []);
  useEffect(() => { refreshActive(); const t = setInterval(refreshActive, 5000); return () => clearInterval(t); }, [refreshActive]);

  // Local 1s countdown between server syncs (display only; server value is authoritative on each poll).
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const toggleFav = (kind: "c" | "s", id: string) => {
    setFav((prev) => {
      const key = `${pool?.id}:${kind}`;
      const cur = new Set(prev[key] || []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      const next = { ...prev, [key]: [...cur] }; saveFav(next); return next;
    });
  };
  const isFav = (kind: "c" | "s", id: string) => (fav[`${pool?.id}:${kind}`] || []).includes(id);

  const filteredCountries = useMemo(() => {
    const q = countryQ.trim().toLowerCase();
    let list = countries;
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.prefix || "").includes(q));
    return [...list].sort((a, b) => (isFav("c", b.id) ? 1 : 0) - (isFav("c", a.id) ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, countryQ, fav, pool]);

  const filteredServices = useMemo(() => {
    const q = serviceQ.trim().toLowerCase();
    let list = services;
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (isFav("s", b.id) ? 1 : 0) - (isFav("s", a.id) ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceQ, fav, pool]);

  // ── Buy (confirm → guarded request) ──
  const doBuy = async () => {
    if (!pool || !country || !service) return;
    if (!service.inStock) { toast("This service is out of stock in this pool.", "warning"); return; }
    if (walletBalance < service.priceNgn) { toast(`Insufficient balance. You need ${naira(service.priceNgn)}.`, "error"); return; }

    const ok = await confirm({
      title: "Confirm purchase",
      message: `Pool: ${pool.label}\nService: ${service.name}\nCountry: ${country.name}\n\nPrice: ${naira(service.priceNgn)}\n\nA number will be reserved from ${pool.label}. Continue?`,
      confirmLabel: `Pay ${naira(service.priceNgn)}`,
      cancelLabel: "Cancel",
    });
    if (!ok) return;

    if (buyLock.current) return; // hard double-click guard
    buyLock.current = true; setBuying(true);
    const idem = `${pool.id}-${country.id}-${service.id}-${Date.now()}`;
    try {
      const r = await apiFetch(`/api/sms/pools/${pool.id}/buy`, {
        method: "POST",
        body: JSON.stringify({ country: country.id, service: service.id, idempotencyKey: idem }),
      });
      toast(`Number ready: +${r.number} (${pool.label})`, "success");
      onAddNotification?.("Number ready", `Your ${pool.label} number +${r.number} is ready.`, "system");
      await refreshActive();
      // refresh stock for the service list
      loadServices(pool, country);
    } catch (e: any) {
      toast(e.message || "Purchase failed. You were not charged.", "error");
    } finally { setBuying(false); setTimeout(() => (buyLock.current = false), 800); }
  };

  const cancelLine = async (line: ActiveLine) => {
    const ok = await confirm({ title: "Cancel activation?", message: `Cancel the number +${line.number}? If the provider confirms, you'll be refunded ${naira(line.cost || 0)}.`, confirmLabel: "Cancel activation", danger: true, cancelLabel: "Keep it" });
    if (!ok) return;
    try {
      await apiFetch(`/api/sms/action/${line.id}`, { method: "POST", body: JSON.stringify({ action: 8 }) });
      toast("Cancelled and refunded.", "success");
      refreshActive();
    } catch (e: any) { toast(e.message || "The provider could not cancel this yet.", "warning"); }
  };

  // Robust copy: uses the platform clipboard util (async API + iOS/Android execCommand fallback)
  // so it works on desktop, iPhone and Android, and reports failure gracefully.
  const [copiedKey, setCopiedKey] = useState<string>("");
  const copy = async (t: string, key: string) => {
    const ok = await copyToClipboard(String(t ?? ""));
    if (ok) { setCopiedKey(key); toast("Copied", "success"); setTimeout(() => setCopiedKey((k) => (k === key ? "" : k)), 1600); }
    else { toast("Couldn't copy automatically — long-press the number to copy.", "warning"); }
  };

  // ═══════════════════ RENDER ═══════════════════
  return (
    <div className="font-inter text-left max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-space tracking-tight flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-cyan-400" /> Buy Number
          </h2>
          <p className="text-xs text-purple-200/50 mt-0.5">Choose a pool, then a country &amp; service. Live prices and stock come straight from the pool.</p>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold">
          Wallet: {naira(walletBalance)}
        </div>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* STEP 1 — Pool */}
        <div className="rounded-2xl bg-[#150c2e] border border-purple-500/15 p-4">
          <StepHeader n={1} label="Select Pool" active={!pool} done={!!pool} />
          {poolsLoading ? <SkeletonRows n={3} /> : pools.length === 0 ? (
            <EmptyState icon={<Server className="h-8 w-8" />} title="No pools available" hint="An administrator needs to enable at least one pool." />
          ) : (
            <div className="space-y-2 mt-3">
              {pools.map((p) => {
                const offline = p.online === false;
                const selected = pool?.id === p.id;
                return (
                  <button key={p.id} onClick={() => !offline && setPool(p)} disabled={offline}
                    className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${offline ? "opacity-50 cursor-not-allowed border-purple-500/10 bg-black/10" : selected ? "bg-cyan-500/15 border-cyan-500/50 ring-1 ring-cyan-500/40 cursor-pointer" : "bg-black/20 border-purple-500/10 hover:border-purple-400/30 cursor-pointer"}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2.5 font-bold text-sm text-white"><Server className="h-4 w-4 text-cyan-400" />{p.label}</span>
                      {selected ? <CheckCircle2 className="h-4 w-4 text-cyan-400" /> : <ChevronRight className="h-4 w-4 opacity-40" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10.5px]">
                      <span className={`flex items-center gap-1 font-bold ${offline ? "text-red-300" : "text-emerald-300"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-red-400" : "bg-emerald-400"}`} />{offline ? "Offline" : "Available"}
                      </span>
                      {p.successRate != null ? <span className="text-purple-200/70">Success {p.successRate}%</span> : <span className="text-purple-300/40">New</span>}
                      {p.latencyMs ? <span className="text-purple-300/40 flex items-center gap-1"><Signal className="h-3 w-3" />{p.latencyMs}ms</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 2 — Country */}
        <div className="rounded-2xl bg-[#150c2e] border border-purple-500/15 p-4">
          <StepHeader n={2} label="Select Country" active={!!pool && !country} done={!!country} />
          {!pool ? <Muted text="Select a pool first" /> : countriesLoading ? <SkeletonRows n={5} /> : countriesError ? (
            <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="Unavailable" hint={countriesError} action={<BtnGhost onClick={() => loadCountries(pool)}>Retry</BtnGhost>} />
          ) : (
            <>
              <SearchBox value={countryQ} onChange={setCountryQ} placeholder="Search countries…" />
              <div className="mt-2 max-h-[360px] overflow-auto pr-1 space-y-1 custom-scroll">
                {filteredCountries.length === 0 ? <Muted text="No matches" /> : filteredCountries.map((c) => (
                  <button key={c.id} onClick={() => setCountry(c)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${country?.id === c.id ? "bg-cyan-500/15 border-cyan-500/40" : "bg-black/20 border-transparent hover:border-purple-400/20"}`}>
                    <span className="flex items-center gap-2 text-sm text-white truncate">
                      <CountryFlag country={c.name} size={18} className="shrink-0" />
                      <span className="truncate">{c.name}</span>
                      {c.prefix ? <span className="text-[10px] text-purple-300/50">+{c.prefix}</span> : null}
                    </span>
                    <Star onClick={(e) => { e.stopPropagation(); toggleFav("c", c.id); }} className={`h-3.5 w-3.5 shrink-0 ${isFav("c", c.id) ? "fill-amber-400 text-amber-400" : "text-purple-400/40 hover:text-amber-300"}`} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* STEP 3 — Service */}
        <div className="rounded-2xl bg-[#150c2e] border border-purple-500/15 p-4">
          <StepHeader n={3} label="Select Service" active={!!country && !service} done={!!service} />
          {!country ? <Muted text="Select a country first" /> : servicesLoading ? <SkeletonRows n={5} /> : servicesError ? (
            <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title="Unavailable" hint={servicesError} action={<BtnGhost onClick={() => loadServices(pool!, country)}>Retry</BtnGhost>} />
          ) : (
            <>
              <SearchBox value={serviceQ} onChange={setServiceQ} placeholder="Search services…" />
              <div className="mt-2 max-h-[360px] overflow-auto pr-1 space-y-1 custom-scroll">
                {filteredServices.length === 0 ? <Muted text="No matches" /> : filteredServices.map((s) => (
                  <button key={s.id} onClick={() => s.inStock && setService(s)} disabled={!s.inStock}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${!s.inStock ? "opacity-45 cursor-not-allowed border-transparent" : service?.id === s.id ? "bg-cyan-500/15 border-cyan-500/40 cursor-pointer" : "bg-black/20 border-transparent hover:border-purple-400/20 cursor-pointer"}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <Star onClick={(e) => { e.stopPropagation(); toggleFav("s", s.id); }} className={`h-3.5 w-3.5 shrink-0 ${isFav("s", s.id) ? "fill-amber-400 text-amber-400" : "text-purple-400/40 hover:text-amber-300"}`} />
                      <ServiceLogo name={s.name} size={18} className="shrink-0" />
                      <span className="text-sm text-white truncate">{s.name}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {s.inStock
                        ? <span className="text-[10px] text-emerald-300 flex items-center gap-1"><Signal className="h-3 w-3" />{s.stock > 900 ? "In stock" : s.stock}</span>
                        : <span className="text-[10px] text-red-300">Out of stock</span>}
                      <span className="text-xs font-bold text-white">{naira(s.priceNgn)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Purchase bar */}
      {service && country && pool && (
        <div className="rounded-2xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/25 p-4 flex items-center justify-between flex-wrap gap-3 animate-[fadeIn_0.2s_ease]">
          <div className="text-sm">
            <div className="text-white font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />{pool.label} · {country.name} · {service.name}</div>
            <div className="text-[11px] text-purple-200/60 mt-0.5">Total price: <span className="text-white font-bold">{naira(service.priceNgn)}</span></div>
          </div>
          <button onClick={doBuy} disabled={buying || !service.inStock}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 min-w-[150px] justify-center">
            {buying ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Buy for {naira(service.priceNgn)}</>}
          </button>
        </div>
      )}

      {/* Active orders */}
      <div className="rounded-2xl bg-[#150c2e] border border-purple-500/15 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Inbox className="h-4 w-4 text-cyan-400" /> Active &amp; Recent Orders</h3>
          <button onClick={refreshActive} className="text-[11px] text-purple-300/60 hover:text-white flex items-center gap-1 cursor-pointer"><RefreshCw className="h-3 w-3" /> Refresh</button>
        </div>
        {active.length === 0 ? (
          <EmptyState icon={<Inbox className="h-8 w-8" />} title="No active orders" hint="Your purchased numbers will appear here with live status." />
        ) : (
          <div className="space-y-2.5">
            {active.map((l) => {
              // Display remaining using the server value; between 5s polls we approximate with a
              // local countdown for smoothness, but the server (provider-truth) value wins each poll.
              const syncAge = l.last_sync ? Math.floor((Date.now() - new Date(l.last_sync).getTime()) / 1000) : 0;
              const shownRemaining = l.status === "active" ? Math.max(0, (l.remaining || 0) - syncAge) : 0;
              return (
                <div key={l.id} className="rounded-xl bg-black/25 border border-purple-500/10 p-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-200 text-[10px] font-bold shrink-0">{l.poolLabel || "Pool"}</span>
                      <CountryFlag country={l.country} size={16} className="shrink-0" />
                      <span className="text-white font-mono font-bold text-sm truncate">+{l.number}</span>
                      <button onClick={() => copy(l.number, "num-" + l.id)} title="Copy number" className="text-purple-300/50 hover:text-white cursor-pointer shrink-0">
                        {copiedKey === "num-" + l.id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <StatusBadge status={l.status} otp={l.otpReceived} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-[11px]">
                    <Field label="Country" value={l.country} />
                    <Field label="Service" value={l.service} />
                    <Field label="Time left" value={
                      l.status !== "active" ? "—" :
                      l.providerTimer ? fmtTime(shownRemaining) : <span className="text-amber-300" title="This provider does not expose an exact timer">{fmtTime(shownRemaining)} (est.)</span>
                    } />
                    <Field label="Last sync" value={ago(l.last_sync)} />
                  </div>
                  {l.otpReceived ? (
                    <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-3 py-2 animate-[fadeIn_0.3s_ease] ring-1 ring-emerald-400/30">
                      <span className="text-emerald-200 text-xs">OTP: <span className="font-mono font-bold text-base text-white tracking-wider">{l.otpReceived}</span></span>
                      <button onClick={() => copy(l.otpReceived!, "otp-" + l.id)} title="Copy code" className="text-emerald-300 hover:text-white cursor-pointer">
                        {copiedKey === "otp-" + l.id ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : l.status === "active" ? (
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-purple-300/60 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Waiting for SMS…</span>
                      <button onClick={() => cancelLine(l)} disabled={!l.cancellable}
                        title={!l.cancellable ? `Cancellation unlocks in ${fmtTime(l.cancel_in || 0)}` : ""}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                        {l.cancellable ? "Cancel" : `Cancel in ${fmtTime(l.cancel_in || 0)}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin-managed instructions (purchase guidelines, refund policy, notices, etc.) */}
      {instructions.length > 0 && (
        <div className="rounded-2xl bg-[#150c2e] border border-purple-500/15 p-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-cyan-400" /> Good to know</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {instructions.map((ins) => (
              <div key={ins.id} className="rounded-xl bg-black/20 border border-purple-500/10 p-3.5">
                {ins.title ? <div className="text-[13px] font-bold text-white mb-1">{ins.title}</div> : null}
                <div className="text-[11.5px] text-purple-200/70 leading-relaxed whitespace-pre-wrap">{ins.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── small presentational helpers ──
function StepHeader({ n, label, active, done }: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? "bg-emerald-500 text-black" : active ? "bg-cyan-500 text-black" : "bg-purple-500/20 text-purple-300"}`}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}</span>
      <span className="text-sm font-bold text-white font-space">{label}</span>
    </div>
  );
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mt-3">
      <Search className="h-3.5 w-3.5 text-purple-300/50 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-black/30 border border-purple-500/15 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-purple-300/40 focus:outline-none focus:border-cyan-500/40" />
    </div>
  );
}
function SkeletonRows({ n }: { n: number }) {
  return <div className="space-y-2 mt-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-purple-500/10 animate-pulse" />)}</div>;
}
function Muted({ text }: { text: string }) { return <div className="text-xs text-purple-300/40 py-8 text-center">{text}</div>; }
function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <div className="text-purple-400/40 flex justify-center mb-2">{icon}</div>
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="text-[11px] text-purple-300/50 mt-1 max-w-[240px] mx-auto">{hint}</div>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
function BtnGhost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="text-[11px] px-3 py-1.5 rounded-lg border border-purple-500/25 text-purple-200 hover:bg-purple-500/10 cursor-pointer">{children}</button>;
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-purple-300/40 uppercase tracking-wide text-[9px] font-bold">{label}</div><div className="text-white truncate">{value}</div></div>;
}
function StatusBadge({ status, otp }: { status: string; otp?: string }) {
  if (otp || status === "completed") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> SMS received</span>;
  if (status === "active") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center gap-1"><Clock className="h-3 w-3" /> Waiting</span>;
  if (status === "cancelled") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-500/20 text-neutral-300 font-bold flex items-center gap-1"><XCircle className="h-3 w-3" /> Cancelled</span>;
  if (status === "expired" || status === "failed") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">Expired</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">{status}</span>;
}
