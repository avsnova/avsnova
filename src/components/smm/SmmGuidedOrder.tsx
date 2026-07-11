import { useState, useMemo, useEffect } from "react";
import { ChevronRight, ChevronLeft, Check, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import {
  type SMMService, SOCIAL_NETWORKS_CONFIG, mapCategoryToNetworkGroup, serviceType,
  computeCost, inputFieldFor, validateLink, isPackageService, networkIcon,
} from "./smmHelpers";
import { ServiceLogo } from "../ui/BrandIcon";
import type { SmmOrderPayload } from "./SmmOrderSheet";

/**
 * SmmGuidedOrder — Item 5. A step-by-step guided ordering flow that replaces the
 * hard-to-scan service list with a simple funnel:
 *   1. Platform → 2. Service Type → 3. Service → 4. Link → 5. Quantity → 6. Price → Submit
 *
 * Reuses the EXACT same catalog + helpers + submit payload as the browse view, so ordering
 * behavior and pricing are 100% identical. Purely an alternative, friendlier entry path.
 */
export default function SmmGuidedOrder({
  services, walletBalance, submitting, onSubmit,
}: {
  services: SMMService[];
  walletBalance: number;
  submitting: boolean;
  onSubmit: (p: SmmOrderPayload) => void;
}) {
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [service, setService] = useState<SMMService | null>(null);
  const [svcSearch, setSvcSearch] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");

  // Admin-managed instructions shown on the SMM order page (Item 6).
  const [instructions, setInstructions] = useState<{ id: number; title: string; body: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/smm/instructions").then((r) => setInstructions((r && r.instructions) || [])).catch(() => {});
  }, []);

  // Platforms that actually have services in the catalog (with counts).
  const platforms = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of services) { const g = mapCategoryToNetworkGroup(s.platform); counts[g] = (counts[g] || 0) + 1; }
    return SOCIAL_NETWORKS_CONFIG.filter((n) => counts[n.key] > 0).map((n) => ({ ...n, count: counts[n.key] }));
  }, [services]);

  // Service types available for the chosen platform.
  const types = useMemo(() => {
    if (!platform) return [];
    const counts: Record<string, number> = {};
    for (const s of services) {
      if (mapCategoryToNetworkGroup(s.platform) !== platform) continue;
      const t = serviceType(s.name); counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [platform, services]);

  // Services matching platform + type (+ optional search).
  const matchingServices = useMemo(() => {
    if (!platform || !type) return [];
    const q = svcSearch.trim().toLowerCase();
    return services
      .filter((s) => mapCategoryToNetworkGroup(s.platform) === platform && serviceType(s.name) === type)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => (a.ratePer1k || 0) - (b.ratePer1k || 0));
  }, [platform, type, svcSearch, services]);

  const isPackage = isPackageService(service || undefined);
  const qtyNum = parseInt(quantity) || 0;
  const cost = service ? computeCost(service, qtyNum) : 0;
  const field = service ? inputFieldFor(platform || "Others", service) : { fieldLabel: "Link", placeholder: "" };
  const linkVal = service ? validateLink(link, platform || "Others") : { state: "empty" as const, message: "", detected: null };

  const reset = () => { setStep(1); setPlatform(null); setType(null); setService(null); setSvcSearch(""); setLink(""); setQuantity(""); };

  const canNext = () => {
    if (step === 1) return !!platform;
    if (step === 2) return !!type;
    if (step === 3) return !!service;
    if (step === 4) return !!link.trim() && linkVal.state !== "invalid";
    if (step === 5) return isPackage || (qtyNum >= (service?.minOrder || 1) && qtyNum <= (service?.maxOrder || 1e9));
    return true;
  };

  const submit = () => {
    if (!service) return;
    onSubmit({
      service,
      quantity: isPackage ? 1 : qtyNum,
      link: link.trim(),
      comments: null,
      randomize: false,
      pollOption: null,
      packageSelection: isPackage ? service.id : null,
      cost,
    });
  };

  const STEPS = ["Platform", "Service Type", "Service", "Link", "Quantity", "Review"];
  const insufficient = cost > walletBalance;

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-b from-[#0d0723] to-[#050210] p-4 sm:p-5 space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar-thin pb-1">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step, active = n === step;
          return (
            <div key={label} className="flex items-center shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${active ? "bg-cyan-600/30 border border-cyan-500/40 text-white" : done ? "text-emerald-300" : "text-purple-200/40"}`}>
                <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] ${done ? "bg-emerald-500 text-black" : active ? "bg-cyan-400 text-black" : "bg-purple-500/20"}`}>{done ? <Check className="h-2.5 w-2.5" /> : n}</span>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {n < STEPS.length && <ChevronRight className="h-3.5 w-3.5 text-purple-500/30 mx-0.5" />}
            </div>
          );
        })}
      </div>

      {/* Admin instructions (Item 6) */}
      {instructions.length > 0 && step === 1 && (
        <div className="space-y-2">
          {instructions.map((ins) => (
            <div key={ins.id} className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-3">
              {ins.title && <div className="text-[12px] font-bold text-cyan-200 mb-0.5">{ins.title}</div>}
              <div className="text-[11px] text-purple-200/70 whitespace-pre-wrap">{ins.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 1 — Platform */}
      {step === 1 && (
        <div>
          <h4 className="text-sm font-bold text-white mb-3">Choose a platform</h4>
          {platforms.length === 0 ? (
            <div className="py-8 text-center text-purple-200/40 text-xs"><Sparkles className="h-5 w-5 mx-auto mb-2" />Catalog is loading…</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {platforms.map((p) => (
                <button key={p.key} onClick={() => { setPlatform(p.key); setType(null); setService(null); setStep(2); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors cursor-pointer ${platform === p.key ? "border-cyan-500/50 bg-cyan-500/10" : "border-purple-500/15 bg-black/30 hover:border-purple-500/35"}`}>
                  <ServiceLogo name={p.label} fallback={p.icon} size={28} />
                  <span className="text-[11px] font-bold text-white text-center leading-tight">{p.label}</span>
                  <span className="text-[9px] text-purple-200/40">{p.count} services</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Service Type */}
      {step === 2 && (
        <div>
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><ServiceLogo name={platform || ""} fallback={networkIcon(platform || "")} size={18} /> What do you want for {platform}?</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {types.map((t) => (
              <button key={t.label} onClick={() => { setType(t.label); setService(null); setStep(3); }}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${type === t.label ? "border-cyan-500/50 bg-cyan-500/10" : "border-purple-500/15 bg-black/30 hover:border-purple-500/35"}`}>
                <span className="text-[12px] font-bold text-white">{t.label}</span>
                <span className="text-[9px] text-purple-200/40">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 — Service */}
      {step === 3 && (
        <div>
          <h4 className="text-sm font-bold text-white mb-2">Pick a service</h4>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
            <input value={svcSearch} onChange={(e) => setSvcSearch(e.target.value)} placeholder="Filter services…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar-thin pr-1">
            {matchingServices.map((s) => (
              <button key={s.id} onClick={() => { setService(s); setQuantity(String(s.minOrder || 100)); setStep(4); }}
                className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${service?.id === s.id ? "border-cyan-500/50 bg-cyan-500/10" : "border-purple-500/15 bg-black/30 hover:border-purple-500/35"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-white">{s.name}</div>
                    <div className="text-[9px] text-purple-200/40 mt-0.5">Min {s.minOrder?.toLocaleString()} · Max {s.maxOrder?.toLocaleString()} · {s.refill}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-bold text-emerald-400">₦{(s.ratePer1k || 0).toLocaleString()}</div>
                    <div className="text-[9px] text-purple-200/40">per 1,000</div>
                  </div>
                </div>
              </button>
            ))}
            {matchingServices.length === 0 && <div className="py-6 text-center text-purple-200/40 text-xs">No services match.</div>}
          </div>
        </div>
      )}

      {/* STEP 4 — Link */}
      {step === 4 && service && (
        <div>
          <h4 className="text-sm font-bold text-white mb-2">Enter your {field.fieldLabel}</h4>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={field.placeholder}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          {linkVal.state !== "empty" && (
            <p className={`text-[11px] mt-1.5 ${linkVal.state === "valid" ? "text-emerald-400" : linkVal.state === "warn" ? "text-amber-400" : "text-red-400"}`}>{linkVal.message}</p>
          )}
        </div>
      )}

      {/* STEP 5 — Quantity */}
      {step === 5 && service && (
        <div>
          <h4 className="text-sm font-bold text-white mb-2">{isPackage ? "Package order" : "How many?"}</h4>
          {isPackage ? (
            <p className="text-[12px] text-purple-200/60">This is a fixed package. Continue to review your order.</p>
          ) : (
            <>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={service.minOrder} max={service.maxOrder} placeholder={`${service.minOrder} – ${service.maxOrder}`}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-purple-200/50">
                <span>Min {service.minOrder?.toLocaleString()} · Max {service.maxOrder?.toLocaleString()}</span>
                <span className="text-emerald-400 font-bold">≈ ₦{cost.toLocaleString()}</span>
              </div>
              {qtyNum > 0 && qtyNum < (service.minOrder || 1) && <p className="text-[11px] text-amber-400 mt-1">Minimum is {service.minOrder?.toLocaleString()}.</p>}
              {qtyNum > (service.maxOrder || 1e9) && <p className="text-[11px] text-amber-400 mt-1">Maximum is {service.maxOrder?.toLocaleString()}.</p>}
            </>
          )}
        </div>
      )}

      {/* STEP 6 — Review + Price */}
      {step === 6 && service && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-white mb-1">Review your order</h4>
          <div className="rounded-xl border border-purple-500/15 bg-black/30 p-3 space-y-1.5 text-[12px]">
            <div className="flex items-start justify-between gap-3">
              <span className="text-purple-200/50 shrink-0">Platform</span>
              <span className="text-white text-right flex items-center gap-1.5"><ServiceLogo name={platform || ""} fallback={networkIcon(platform || "")} size={16} /> {platform}</span>
            </div>
            <Row k="Service" v={service.name} />
            <Row k={field.fieldLabel} v={link} />
            {!isPackage && <Row k="Quantity" v={qtyNum.toLocaleString()} />}
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-purple-500/10">
              <span className="text-purple-200/60">Total</span>
              <span className="text-base font-bold text-emerald-400">₦{cost.toLocaleString()}</span>
            </div>
          </div>
          {insufficient && <p className="text-[11px] text-red-400">Insufficient wallet balance (₦{walletBalance.toLocaleString()}). Please add funds.</p>}
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          {step > 1 && <Button size="sm" variant="secondary" onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1"><ChevronLeft className="h-3.5 w-3.5" /> Back</Button>}
          {step > 1 && <button onClick={reset} className="text-[11px] text-purple-200/40 hover:text-white cursor-pointer">Start over</button>}
        </div>
        {step < 6 ? (
          <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="flex items-center gap-1">Continue <ChevronRight className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={submitting || insufficient} className="flex items-center gap-1.5">
            {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Placing…</> : <>Place Order · ₦{cost.toLocaleString()}</>}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-purple-200/50 shrink-0">{k}</span><span className="text-white text-right break-all">{v}</span></div>;
}
