import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, Loader2, Clock, CheckCircle2, XCircle, Copy, RefreshCw, ShieldCheck,
  Star, Server, AlertTriangle, Zap, Cpu, Globe2, Activity, ChevronRight, ChevronDown, Wifi, WifiOff, Radio, Hash,
} from "lucide-react";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

/**
 * PoolBuyNumber — provider-independent "pools" purchase console (advanced HUD redesign).
 * Flow: pick a Channel (pool) → that pool's OWN countries → services (live price+stock) → confirm → buy.
 * Providers are masked (customer only sees pool labels). Timers come from the provider.
 * NO flags / NO brand logos — pure typographic/HUD aesthetic. Logic identical to prior version;
 * only the layout/visual structure changed. Backed by /api/sms/pools/* and /api/sms/numbers.
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
function fmtTime(sec: number) { if (sec == null || sec < 0) return "0:00"; const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
function ago(iso?: string) { if (!iso) return "—"; const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); if (s < 5) return "now"; if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; return `${Math.floor(s / 3600)}h`; }
// Deterministic 2-letter "glyph" for a country/service (replaces flags/logos with a HUD token).
function glyph(name: string) { const t = (name || "?").replace(/[^a-zA-Z0-9]/g, ""); return (t.slice(0, 2) || "??").toUpperCase(); }

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
  const [copiedKey, setCopiedKey] = useState<string>("");
  const buyLock = useRef(false);
  // Dropdown open state (searchable dropdowns that auto-close on select / outside click).
  const [openDrop, setOpenDrop] = useState<null | "country" | "service">(null);

  useEffect(() => { apiFetch("/api/sms/instructions").then((r) => setInstructions(r.instructions || [])).catch(() => {}); }, []);

  const loadPools = useCallback(async () => {
    setPoolsLoading(true);
    try { const r = await apiFetch("/api/sms/pools"); setPools(r.pools || []); if ((r.pools || []).length === 1) setPool(r.pools[0]); }
    catch (e: any) { toast("Could not load pools: " + e.message, "error"); }
    finally { setPoolsLoading(false); }
  }, [toast]);
  useEffect(() => { loadPools(); }, [loadPools]);

  const loadCountries = useCallback(async (p: Pool) => {
    setCountriesLoading(true); setCountriesError(""); setCountries([]); setCountry(null); setServices([]); setService(null);
    try { const r = await apiFetch(`/api/sms/pools/${p.id}/countries`); setCountries(r.countries || []); }
    catch (e: any) { setCountriesError("This channel's regions are unavailable right now. Try another channel or refresh."); }
    finally { setCountriesLoading(false); }
  }, []);
  useEffect(() => { if (pool) loadCountries(pool); }, [pool, loadCountries]);

  const loadServices = useCallback(async (p: Pool, c: Country) => {
    setServicesLoading(true); setServicesError(""); setServices([]); setService(null);
    try { const r = await apiFetch(`/api/sms/pools/${p.id}/services?country=${encodeURIComponent(c.id)}`); setServices(r.services || []); }
    catch (e: any) { setServicesError("Services for this region are unavailable right now. Try again."); }
    finally { setServicesLoading(false); }
  }, []);
  useEffect(() => { if (pool && country) loadServices(pool, country); }, [pool, country, loadServices]);

  const refreshActive = useCallback(async () => {
    try { const rows = await apiFetch("/api/sms/numbers"); setActive(Array.isArray(rows) ? rows.filter((r: ActiveLine) => ["active", "completed"].includes(r.status) || r.otpReceived) : []); }
    catch (e) { /* keep last */ }
  }, []);
  useEffect(() => { refreshActive(); const t = setInterval(refreshActive, 5000); return () => clearInterval(t); }, [refreshActive]);

  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const toggleFav = (kind: "c" | "s", id: string) => {
    setFav((prev) => { const key = `${pool?.id}:${kind}`; const cur = new Set(prev[key] || []); cur.has(id) ? cur.delete(id) : cur.add(id); const next = { ...prev, [key]: [...cur] }; saveFav(next); return next; });
  };
  const isFav = (kind: "c" | "s", id: string) => (fav[`${pool?.id}:${kind}`] || []).includes(id);

  const filteredCountries = useMemo(() => {
    const q = countryQ.trim().toLowerCase(); let list = countries;
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.prefix || "").includes(q));
    return [...list].sort((a, b) => (isFav("c", b.id) ? 1 : 0) - (isFav("c", a.id) ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, countryQ, fav, pool]);

  const filteredServices = useMemo(() => {
    const q = serviceQ.trim().toLowerCase(); let list = services;
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (isFav("s", b.id) ? 1 : 0) - (isFav("s", a.id) ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceQ, fav, pool]);

  const doBuy = async () => {
    if (!pool || !country || !service) return;
    if (!service.inStock) { toast("This service is out of stock in this channel.", "warning"); return; }
    if (walletBalance < service.priceNgn) { toast(`Insufficient balance. You need ${naira(service.priceNgn)}.`, "error"); return; }
    const ok = await confirm({
      title: "Confirm acquisition",
      message: `Channel: ${pool.label}\nService: ${service.name}\nRegion: ${country.name}\n\nPrice: ${naira(service.priceNgn)}\n\nA number will be reserved from ${pool.label}. Continue?`,
      confirmLabel: `Pay ${naira(service.priceNgn)}`, cancelLabel: "Cancel",
    });
    if (!ok) return;
    if (buyLock.current) return;
    buyLock.current = true; setBuying(true);
    const idem = `${pool.id}-${country.id}-${service.id}-${Date.now()}`;
    try {
      const r = await apiFetch(`/api/sms/pools/${pool.id}/buy`, { method: "POST", body: JSON.stringify({ country: country.id, service: service.id, idempotencyKey: idem }) });
      // Providers return numbers with or without a leading "+"; normalise so we never render "++".
      const num = String(r.number || "").replace(/^\++/, "");
      toast(`Number acquired: +${num} (${pool.label})`, "success");
      onAddNotification?.("Number ready", `Your ${pool.label} number +${num} is ready.`, "system");
      await refreshActive(); loadServices(pool, country);
    } catch (e: any) { toast(e.message || "Acquisition failed. You were not charged.", "error"); }
    finally { setBuying(false); setTimeout(() => (buyLock.current = false), 800); }
  };

  const cancelLine = async (line: ActiveLine) => {
    const ok = await confirm({ title: "Release this number?", message: `Cancel +${String(line.number || "").replace(/^\++/, "")}? If the provider confirms, you'll be refunded ${naira(line.cost || 0)}.`, confirmLabel: "Release", danger: true, cancelLabel: "Keep it" });
    if (!ok) return;
    try { await apiFetch(`/api/sms/action/${line.id}`, { method: "POST", body: JSON.stringify({ action: 8 }) }); toast("Released and refunded.", "success"); refreshActive(); }
    catch (e: any) { toast(e.message || "The provider could not release this yet.", "warning"); }
  };

  const copy = async (t: string, key: string) => {
    const ok = await copyToClipboard(String(t ?? ""));
    if (ok) { setCopiedKey(key); toast("Copied", "success"); setTimeout(() => setCopiedKey((k) => (k === key ? "" : k)), 1600); }
    else toast("Couldn't copy — long-press to copy.", "warning");
  };

  const step = !pool ? 1 : !country ? 2 : !service ? 3 : 4;

  return (
    <div className="font-inter text-left max-w-6xl mx-auto text-white">
      {/* ══ HUD HEADER ══ */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#0a0f1e] via-[#0d0a1f] to-[#0a0f1e] p-5 mb-4"
        style={{ backgroundImage: "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.10), transparent 40%), radial-gradient(circle at 90% 100%, rgba(168,85,247,0.12), transparent 45%)" }}>
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(34,211,238,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.35) 1px, transparent 1px)", backgroundSize: "34px 34px", maskImage: "linear-gradient(180deg, black, transparent)" }} />
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center shadow-[0_0_24px_rgba(34,211,238,0.25)]">
              <Radio className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-[0.35em] text-cyan-300/70 uppercase">Activation Console</div>
              <h2 className="text-xl sm:text-2xl font-bold font-space tracking-tight bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">Acquire a Number</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-black/40 border border-emerald-400/25 px-3.5 py-2 shadow-[0_0_18px_rgba(16,185,129,0.15)]">
            <Zap className="h-3.5 w-3.5 text-emerald-300" />
            <div className="leading-none">
              <div className="text-[9px] font-mono tracking-widest text-emerald-300/60 uppercase">Balance</div>
              <div className="text-sm font-bold text-emerald-200 font-mono">{naira(walletBalance)}</div>
            </div>
          </div>
        </div>
        {/* progress rail */}
        <div className="relative mt-4 flex items-center gap-2">
          {[["Channel", 1], ["Region", 2], ["Service", 3], ["Deploy", 4]].map(([lbl, n], i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${step >= (n as number) ? "text-cyan-300" : "text-white/30"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${step > (n as number) ? "bg-emerald-400" : step === (n as number) ? "bg-cyan-400 animate-pulse" : "bg-white/20"}`} />
                {lbl}
              </div>
              {i < 3 && <div className={`h-px flex-1 ${step > (n as number) ? "bg-cyan-400/40" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ══ SERVICE-UNAVAILABLE STATE ══
          When an administrator has disabled every provider/channel there is nothing to sell.
          We show a professional, full-width notice — we NEVER fall back to the old interface. */}
      {!poolsLoading && pools.length === 0 ? (
        <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-[#1a1206] to-[#0d0a1f] p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mb-4">
            <Radio className="h-7 w-7 text-amber-300" />
          </div>
          <h3 className="text-lg font-bold font-space text-white">SMS services are currently unavailable</h3>
          <p className="text-sm text-white/50 mt-2 max-w-md mx-auto leading-relaxed">
            No activation channels are online right now. Our team is on it — please check back shortly.
            Your wallet balance is safe and no charges apply while services are paused.
          </p>
          <button onClick={loadPools} className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-xs font-bold cursor-pointer hover:bg-cyan-400/20">
            <RefreshCw className="h-3.5 w-3.5" /> Check again
          </button>
        </div>
      ) : (
      /* ══ MAIN GRID ══ */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* CHANNELS (pools) — left rail */}
        <section className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0c0a1a]/80 backdrop-blur p-4">
          <SectionTitle icon={<Server className="h-4 w-4" />} label="Select Channel" sub="Independent number pools" />
          {poolsLoading ? <Skeletons n={3} /> : pools.length === 0 ? (
            <Empty icon={<Server className="h-7 w-7" />} title="No channels online" hint="An administrator needs to enable at least one channel." />
          ) : (
            <div className="space-y-2.5 mt-3">
              {pools.map((p) => {
                const offline = p.online === false; const sel = pool?.id === p.id;
                return (
                  <button key={p.id} onClick={() => !offline && setPool(p)} disabled={offline}
                    className={`group relative w-full text-left rounded-xl border p-3 transition-all overflow-hidden ${offline ? "opacity-45 cursor-not-allowed border-white/5 bg-black/20" : sel ? "border-cyan-400/60 bg-cyan-400/[0.07] shadow-[0_0_22px_rgba(34,211,238,0.18)] cursor-pointer" : "border-white/10 bg-black/20 hover:border-cyan-400/30 cursor-pointer"}`}>
                    {sel && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-cyan-300 to-purple-400" />}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-9 w-9 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold ${sel ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40" : "bg-white/5 text-white/60 border border-white/10"}`}>
                          <Cpu className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="text-sm font-bold text-white">{p.label}</div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
                            {offline ? <span className="text-red-300 flex items-center gap-1"><WifiOff className="h-2.5 w-2.5" />OFFLINE</span>
                              : <span className="text-emerald-300 flex items-center gap-1"><Wifi className="h-2.5 w-2.5" />ONLINE</span>}
                          </div>
                        </div>
                      </div>
                      {sel ? <CheckCircle2 className="h-4 w-4 text-cyan-300" /> : <ChevronRight className="h-4 w-4 text-white/25 group-hover:text-cyan-300/60" />}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <Meter label="Success" value={p.successRate != null ? `${p.successRate}%` : "NEW"} tone={p.successRate == null ? "muted" : p.successRate >= 90 ? "good" : p.successRate >= 60 ? "warn" : "bad"} />
                      <Meter label="Latency" value={p.latencyMs ? `${p.latencyMs}ms` : "—"} tone="muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* REGION + SERVICE — center */}
        <section className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* REGION (searchable dropdown, auto-closes on select) */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0a1a]/80 backdrop-blur p-4 flex flex-col">
            <SectionTitle icon={<Globe2 className="h-4 w-4" />} label="Region" sub={pool ? pool.label : "Pick a channel first"} />
            {!pool ? <Locked text="Awaiting channel selection" /> : countriesLoading ? <Skeletons n={3} /> : countriesError ? (
              <Empty icon={<AlertTriangle className="h-7 w-7" />} title="Unavailable" hint={countriesError} action={<Ghost onClick={() => loadCountries(pool)}>Retry</Ghost>} />
            ) : (
              <HudDropdown
                open={openDrop === "country"}
                onToggle={() => setOpenDrop((o) => (o === "country" ? null : "country"))}
                onClose={() => setOpenDrop(null)}
                placeholder="Select a region"
                selectedLabel={country ? country.name : ""}
                selectedMeta={country?.prefix ? `+${String(country.prefix).replace(/^\++/, "")}` : ""}
                search={countryQ} onSearch={setCountryQ} searchPlaceholder="Search regions…"
                empty={filteredCountries.length === 0}
              >
                {filteredCountries.map((c) => {
                  const sel = country?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => { setCountry(c); setOpenDrop(null); setCountryQ(""); }}
                      className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all ${sel ? "border-cyan-400/50 bg-cyan-400/[0.08]" : "border-transparent bg-black/25 hover:border-white/15"} cursor-pointer`}>
                      <span className="h-7 w-7 shrink-0 rounded-md bg-white/5 border border-white/10 flex items-center justify-center font-mono text-[10px] font-bold text-cyan-200/80">{glyph(c.name)}</span>
                      <span className="text-sm text-white truncate flex-1 text-left">{c.name}</span>
                      {c.prefix ? <span className="text-[10px] font-mono text-white/40">+{String(c.prefix).replace(/^\++/, "")}</span> : null}
                      <Star onClick={(e) => { e.stopPropagation(); toggleFav("c", c.id); }} className={`h-3.5 w-3.5 shrink-0 ${isFav("c", c.id) ? "fill-amber-400 text-amber-400" : "text-white/25 hover:text-amber-300"}`} />
                    </button>
                  );
                })}
              </HudDropdown>
            )}
          </div>

          {/* SERVICE (searchable dropdown, auto-closes on select) */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0a1a]/80 backdrop-blur p-4 flex flex-col">
            <SectionTitle icon={<Hash className="h-4 w-4" />} label="Service" sub={country ? country.name : "Pick a region first"} />
            {!country ? <Locked text="Awaiting region selection" /> : servicesLoading ? <Skeletons n={3} /> : servicesError ? (
              <Empty icon={<AlertTriangle className="h-7 w-7" />} title="Unavailable" hint={servicesError} action={<Ghost onClick={() => loadServices(pool!, country)}>Retry</Ghost>} />
            ) : (
              <HudDropdown
                open={openDrop === "service"}
                onToggle={() => setOpenDrop((o) => (o === "service" ? null : "service"))}
                onClose={() => setOpenDrop(null)}
                placeholder="Select a service"
                selectedLabel={service ? service.name : ""}
                selectedMeta={service ? naira(service.priceNgn) : ""}
                search={serviceQ} onSearch={setServiceQ} searchPlaceholder="Search services…"
                empty={filteredServices.length === 0}
              >
                {filteredServices.map((s) => {
                  const sel = service?.id === s.id;
                  return (
                    <button key={s.id} onClick={() => { if (!s.inStock) return; setService(s); setOpenDrop(null); setServiceQ(""); }} disabled={!s.inStock}
                      className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all ${!s.inStock ? "opacity-40 cursor-not-allowed border-transparent" : sel ? "border-cyan-400/50 bg-cyan-400/[0.08] cursor-pointer" : "border-transparent bg-black/25 hover:border-white/15 cursor-pointer"}`}>
                      <Star onClick={(e) => { e.stopPropagation(); toggleFav("s", s.id); }} className={`h-3.5 w-3.5 shrink-0 ${isFav("s", s.id) ? "fill-amber-400 text-amber-400" : "text-white/25 hover:text-amber-300"}`} />
                      <span className="text-sm text-white truncate flex-1 text-left">{s.name}</span>
                      {s.inStock
                        ? <span className="text-[9px] font-mono text-emerald-300/80 flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{s.stock > 900 ? "STK" : s.stock}</span>
                        : <span className="text-[9px] font-mono text-red-300/70">EMPTY</span>}
                      <span className="text-xs font-bold font-mono text-white w-[64px] text-right">{naira(s.priceNgn)}</span>
                    </button>
                  );
                })}
              </HudDropdown>
            )}
          </div>
        </section>
      </div>
      )}

      {/* ══ DEPLOY BAR ══ */}
      {service && country && pool && (
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/[0.08] to-purple-500/[0.08] p-4 animate-[fadeIn_0.2s_ease]"
          style={{ boxShadow: "0 0 30px rgba(34,211,238,0.12)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="h-5 w-5 text-emerald-300 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-cyan-300/70">
                  <span>{pool.label}</span><span className="text-white/30">/</span><span>{country.name}</span><span className="text-white/30">/</span><span className="truncate">{service.name}</span>
                </div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">{naira(service.priceNgn)} <span className="text-[11px] font-normal text-white/40">total</span></div>
              </div>
            </div>
            <button onClick={doBuy} disabled={buying || !service.inStock}
              className="group relative px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-white text-black font-bold text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 min-w-[170px] justify-center shadow-[0_0_24px_rgba(34,211,238,0.4)]">
              {buying ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying…</> : <><Zap className="h-4 w-4" /> Deploy Number</>}
            </button>
          </div>
        </div>
      )}

      {/* ══ TELEMETRY / ACTIVE ORDERS ══ */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c0a1a]/80 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={<Activity className="h-4 w-4" />} label="Live Sessions" sub="Real-time provider telemetry" inline />
          <button onClick={refreshActive} className="text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"><RefreshCw className="h-3 w-3" /> Sync</button>
        </div>
        {active.length === 0 ? (
          <Empty icon={<Radio className="h-7 w-7" />} title="No active sessions" hint="Deployed numbers appear here with live status." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {active.map((l) => {
              const syncAge = l.last_sync ? Math.floor((Date.now() - new Date(l.last_sync).getTime()) / 1000) : 0;
              const shownRemaining = l.status === "active" ? Math.max(0, (l.remaining || 0) - syncAge) : 0;
              const got = !!l.otpReceived || l.status === "completed";
              return (
                <div key={l.id} className={`relative rounded-xl border p-3.5 overflow-hidden ${got ? "border-emerald-400/40 bg-emerald-500/[0.06]" : "border-white/10 bg-black/25"}`}>
                  <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${got ? "bg-emerald-400" : l.status === "active" ? "bg-cyan-400" : "bg-white/20"}`} />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-purple-400/15 text-purple-200 text-[9px] font-mono font-bold shrink-0">{l.poolLabel || "CHANNEL"}</span>
                      <span className="text-white font-mono font-bold text-sm truncate">+{String(l.number || "").replace(/^\++/, "")}</span>
                      <button onClick={() => copy(String(l.number || "").replace(/^\++/, ""), "num-" + l.id)} title="Copy number" className="text-white/40 hover:text-cyan-300 cursor-pointer shrink-0">
                        {copiedKey === "num-" + l.id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <Badge status={l.status} otp={l.otpReceived} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <Stat label="Region" value={l.country} />
                    <Stat label="Service" value={l.service} />
                    <Stat label="TTL" value={l.status !== "active" ? "—" : l.providerTimer ? fmtTime(shownRemaining) : `${fmtTime(shownRemaining)}·est`} mono />
                    <Stat label="Sync" value={ago(l.last_sync)} mono />
                  </div>
                  {l.otpReceived ? (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 ring-1 ring-emerald-400/25 animate-[fadeIn_0.3s_ease]">
                      <span className="text-emerald-200/80 text-[10px] font-mono uppercase tracking-wider">Code</span>
                      <span className="font-mono font-bold text-lg text-white tracking-[0.2em]">{l.otpReceived}</span>
                      <button onClick={() => copy(l.otpReceived!, "otp-" + l.id)} title="Copy code" className="text-emerald-300 hover:text-white cursor-pointer">
                        {copiedKey === "otp-" + l.id ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : l.status === "active" ? (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-cyan-300/70 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> AWAITING SMS</span>
                      <button onClick={() => cancelLine(l)} disabled={!l.cancellable}
                        title={!l.cancellable ? `Release unlocks in ${fmtTime(l.cancel_in || 0)}` : ""}
                        className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                        {l.cancellable ? "RELEASE" : `RELEASE ${fmtTime(l.cancel_in || 0)}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ INSTRUCTIONS ══ */}
      {instructions.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c0a1a]/80 backdrop-blur p-4">
          <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} label="Protocol Notes" sub="Good to know" inline />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {instructions.map((ins) => (
              <div key={ins.id} className="rounded-xl bg-black/25 border border-white/10 p-3.5">
                {ins.title ? <div className="text-[12px] font-bold text-cyan-100 mb-1 flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-cyan-400" />{ins.title}</div> : null}
                <div className="text-[11.5px] text-white/60 leading-relaxed whitespace-pre-wrap">{ins.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── HUD building blocks ── */
function SectionTitle({ icon, label, sub, inline }: { icon: React.ReactNode; label: string; sub?: string; inline?: boolean }) {
  return (
    <div className={inline ? "" : ""}>
      <div className="flex items-center gap-2">
        <span className="text-cyan-300">{icon}</span>
        <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-white">{label}</span>
      </div>
      {sub ? <div className="text-[10px] text-white/35 mt-0.5 pl-6 font-mono">{sub}</div> : null}
    </div>
  );
}
function Meter({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "muted" }) {
  const c = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-white/50";
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 px-2 py-1.5">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">{label}</div>
      <div className={`text-[11px] font-mono font-bold ${c}`}>{value}</div>
    </div>
  );
}
// Searchable dropdown: a collapsed trigger showing the current selection; tapping opens a panel
// with a search box + scrollable options. Auto-closes on select (handled by the option onClick)
// and on outside click / Escape. Prevents accidental scrolling & mis-taps.
function HudDropdown({ open, onToggle, onClose, placeholder, selectedLabel, selectedMeta, search, onSearch, searchPlaceholder, empty, children }: {
  open: boolean; onToggle: () => void; onClose: () => void; placeholder: string;
  selectedLabel: string; selectedMeta?: string; search: string; onSearch: (v: string) => void;
  searchPlaceholder: string; empty: boolean; children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 40);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  return (
    <div ref={wrapRef} className="relative mt-3">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${open ? "border-cyan-400/50 bg-cyan-400/[0.06]" : "border-white/10 bg-black/40 hover:border-white/20"}`}>
        <span className={`text-sm truncate ${selectedLabel ? "text-white font-medium" : "text-white/35 font-mono"}`}>{selectedLabel || placeholder}</span>
        <span className="flex items-center gap-2 shrink-0">
          {selectedMeta ? <span className="text-[10px] font-mono text-cyan-200/70">{selectedMeta}</span> : null}
          <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180 text-cyan-300" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-cyan-400/25 bg-[#0b0918] shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-2 animate-[fadeIn_0.12s_ease]">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
            <input ref={inputRef} value={search} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder}
              className="w-full bg-black/50 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-400/40 font-mono" />
          </div>
          <div className="mt-2 max-h-[300px] overflow-auto pr-1 space-y-1.5 custom-scroll">
            {empty ? <Locked text="No matches" /> : children}
          </div>
        </div>
      )}
    </div>
  );
}
function Skeletons({ n }: { n: number }) { return <div className="space-y-2 mt-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-11 rounded-lg bg-white/[0.04] animate-pulse" />)}</div>; }
function Locked({ text }: { text: string }) { return <div className="text-[11px] font-mono text-white/30 py-10 text-center uppercase tracking-wider">{text}</div>; }
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <div className="text-white/25 flex justify-center mb-2">{icon}</div>
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="text-[11px] text-white/40 mt-1 max-w-[240px] mx-auto">{hint}</div>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-white/15 text-white/70 hover:bg-white/5 hover:text-cyan-300 cursor-pointer">{children}</button>;
}
function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-[8px] font-mono uppercase tracking-widest text-white/30">{label}</div><div className={`text-white truncate text-[11px] ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}
function Badge({ status, otp }: { status: string; otp?: string }) {
  const base = "text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider";
  if (otp || status === "completed") return <span className={`${base} bg-emerald-500/20 text-emerald-300`}><CheckCircle2 className="h-3 w-3" /> Received</span>;
  if (status === "active") return <span className={`${base} bg-cyan-500/20 text-cyan-300`}><Clock className="h-3 w-3" /> Live</span>;
  if (status === "cancelled") return <span className={`${base} bg-white/10 text-white/50`}><XCircle className="h-3 w-3" /> Released</span>;
  if (status === "expired" || status === "failed") return <span className={`${base} bg-red-500/20 text-red-300`}>Expired</span>;
  return <span className={`${base} bg-purple-500/20 text-purple-300`}>{status}</span>;
}
