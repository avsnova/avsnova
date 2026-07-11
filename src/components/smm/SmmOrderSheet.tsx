import { useState, useEffect, useMemo } from "react";
import { X, Zap, Wallet, Clock, ShieldCheck, Info, CheckCircle2, AlertTriangle, Loader2, Heart } from "lucide-react";
import { ServiceLogo } from "../ui/BrandIcon";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";
import {
  type SMMService, mapCategoryToNetworkGroup, networkIcon, serviceType, inputFieldFor, cleanInstructions,
  isCommentsService, isPollService, isPackageService, computeCost, validateLink,
} from "./smmHelpers";

export interface SmmOrderPayload {
  service: SMMService;
  quantity: number;
  link: string;             // link or package username
  comments: string[] | null;
  randomize: boolean;
  pollOption: string | null;
  packageSelection: string | null;
  cost: number;
}

interface Props {
  service: SMMService;
  walletBalance: number;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (p: SmmOrderPayload) => void;
}

export default function SmmOrderSheet({ service, walletBalance, favorite, onToggleFavorite, submitting, onClose, onSubmit }: Props) {
  useBodyScrollLock(true);
  const network = mapCategoryToNetworkGroup(service.platform);
  const type = serviceType(service.name);
  const comments = isCommentsService(service);
  const poll = isPollService(service);
  const pkg = isPackageService(service);
  const { fieldLabel, placeholder } = inputFieldFor(network, service);

  const [link, setLink] = useState("");
  const [qty, setQty] = useState<string>(String(service.minOrder || 100));
  const [commentsText, setCommentsText] = useState("");
  const [randomize, setRandomize] = useState(false);
  const [pollOption, setPollOption] = useState("");
  const [packageUsername, setPackageUsername] = useState("");
  const [packageSelection, setPackageSelection] = useState("");
  const [tab, setTab] = useState<"order" | "details">("order");

  useEffect(() => { setTab("order"); }, [service.id]);

  const parsedComments = useMemo(() => commentsText.split("\n").map((l) => l.trim()).filter(Boolean), [commentsText]);
  const quantity = pkg ? 1 : (parseInt(qty) || 0);
  const cost = computeCost(service, quantity);
  const remaining = walletBalance - cost;
  const linkVal = useMemo(() => (pkg ? { state: "empty" as const, message: "", detected: null } : validateLink(link, network)), [link, network, pkg]);

  // Validation gating (mirrors original rules, friendlier surface).
  const qtyValid = pkg || (quantity >= (service.minOrder || 1) && quantity <= (service.maxOrder || Infinity));
  const commentsValid = !comments || (parsedComments.length > 0 && parsedComments.length >= quantity);
  const linkOk = pkg ? packageUsername.trim().length > 0 && packageSelection : (link.trim().length > 0 && linkVal.state !== "invalid");
  const pollOk = !poll || pollOption.trim().length > 0;
  const affordable = remaining >= 0;
  const canSubmit = qtyValid && commentsValid && linkOk && pollOk && affordable && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      service,
      quantity,
      link: pkg ? packageUsername : link,
      comments: comments ? parsedComments : null,
      randomize,
      pollOption: poll ? pollOption : null,
      packageSelection: pkg ? packageSelection : null,
      cost,
    });
  };

  const fmt = (n: number) => `₦${Math.max(0, Math.round(n)).toLocaleString()}`;

  return (
    <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Order service">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0b0518] shadow-2xl animate-sheet-up overflow-hidden">
        <div className="sm:hidden pt-2.5 flex justify-center"><span className="h-1 w-10 rounded-full bg-white/20" /></div>

        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 p-4 border-b border-purple-500/12">
          <span className="shrink-0 h-11 w-11 rounded-xl bg-white/5 flex items-center justify-center">
            <ServiceLogo name={network} fallback={networkIcon(network)} size={24} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300/70 bg-purple-500/10 border border-purple-500/15 rounded px-1.5 py-0.5">{network}</span>
              <span className="text-[9px] font-bold uppercase text-cyan-300/70">{type}</span>
            </div>
            <h3 className="text-sm font-bold font-space text-white mt-1 line-clamp-2">{service.name}</h3>
          </div>
          <button onClick={() => onToggleFavorite(service.id)} aria-label="Favorite" className="p-1.5 cursor-pointer">
            <Heart className={`h-4.5 w-4.5 ${favorite ? "fill-red-500 text-red-500" : "text-purple-200/40"}`} />
          </button>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-purple-200/50 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 grid grid-cols-2 gap-1 p-1 mx-4 mt-3 rounded-xl bg-black/40 border border-purple-500/15">
          {(["order", "details"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${tab === t ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow" : "text-purple-200/60 hover:text-white"}`}>
              {t === "order" ? "Order" : "Service Info"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar-thin">
          {tab === "details" ? (
            <div className="space-y-3 text-sm">
              <InfoGrid service={service} />
              <div className="rounded-xl bg-purple-950/15 border border-purple-500/12 p-3.5">
                <div className="text-[10px] font-bold text-purple-300/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Description & guidelines</div>
                <p className="text-[12px] text-purple-100/80 leading-relaxed whitespace-pre-wrap">{cleanInstructions(service)}</p>
              </div>
              <div className="rounded-xl bg-black/30 border border-purple-500/10 p-3.5">
                <div className="text-[10px] font-bold text-cyan-300/70 uppercase tracking-wider mb-1.5">Example</div>
                <p className="text-[12px] text-purple-100/70 leading-relaxed">Paste your public {network} {type.toLowerCase().includes("follow") ? "profile" : "post"} link, choose a quantity between {service.minOrder?.toLocaleString()} and {service.maxOrder?.toLocaleString()}, and confirm. Delivery: {service.avgDelivery || "typically fast"}.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Link / package */}
              {pkg ? (
                <>
                  <Field label="Target profile username">
                    <input value={packageUsername} onChange={(e) => setPackageUsername(e.target.value)} placeholder="e.g. instagram_username"
                      className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-sm text-white px-3.5 py-3 focus:outline-none focus:border-purple-500" />
                  </Field>
                  <Field label="Bundle option">
                    <select value={packageSelection} onChange={(e) => setPackageSelection(e.target.value)}
                      className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-sm text-white px-3.5 py-3 focus:outline-none focus:border-purple-500 cursor-pointer">
                      <option value="">— Choose option —</option>
                      <option value="Bronze Combo Package">Bronze Combo Package</option>
                      <option value="Silver Organic Boost Package">Silver Organic Boost Package</option>
                      <option value="Gold VIP Ultimate Bundle">Gold VIP Ultimate Bundle</option>
                    </select>
                  </Field>
                </>
              ) : (
                <Field label={fieldLabel} hint={linkVal.state !== "empty" ? linkVal.message : undefined}
                  hintTone={linkVal.state === "valid" ? "ok" : linkVal.state === "invalid" ? "err" : "warn"}>
                  <div className="relative">
                    <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={placeholder} inputMode="url"
                      className={`w-full bg-black/40 border rounded-xl text-sm text-white px-3.5 py-3 pr-10 focus:outline-none transition-colors ${
                        linkVal.state === "valid" ? "border-emerald-500/40 focus:border-emerald-500" : linkVal.state === "invalid" ? "border-red-500/40 focus:border-red-500" : linkVal.state === "warn" ? "border-amber-500/40 focus:border-amber-500" : "border-purple-500/20 focus:border-purple-500"
                      }`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {linkVal.state === "valid" && <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 animate-check-pop" />}
                      {linkVal.state === "invalid" && <AlertTriangle className="h-4.5 w-4.5 text-red-400" />}
                      {linkVal.state === "warn" && <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />}
                    </span>
                  </div>
                </Field>
              )}

              {/* Poll */}
              {poll && (
                <Field label="Poll option choice / number">
                  <input value={pollOption} onChange={(e) => setPollOption(e.target.value)} placeholder="e.g. Option 1 or Yes"
                    className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-sm text-white px-3.5 py-3 focus:outline-none focus:border-purple-500" />
                </Field>
              )}

              {/* Quantity + slider */}
              {!pkg && (
                <Field label={`Quantity (min ${service.minOrder?.toLocaleString()} · max ${service.maxOrder?.toLocaleString()})`}
                  hint={!qtyValid && qty ? `Enter between ${service.minOrder?.toLocaleString()} and ${service.maxOrder?.toLocaleString()}.` : undefined} hintTone="warn">
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min={service.minOrder} max={service.maxOrder}
                    className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-sm text-white px-3.5 py-3 focus:outline-none focus:border-purple-500 font-mono" />
                  {service.maxOrder && service.maxOrder > (service.minOrder || 0) && service.maxOrder < 1000000 && (
                    <input type="range" min={service.minOrder || 0} max={service.maxOrder} value={Math.min(Math.max(quantity, service.minOrder || 0), service.maxOrder)}
                      onChange={(e) => setQty(e.target.value)} className="w-full accent-purple-500 cursor-pointer mt-2" />
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[100, 500, 1000, 5000].filter((n) => n >= (service.minOrder || 0) && n <= (service.maxOrder || Infinity)).map((n) => (
                      <button key={n} type="button" onClick={() => setQty(String(n))}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-purple-500/15 text-[11px] font-bold text-purple-200 hover:text-white cursor-pointer">{n.toLocaleString()}</button>
                    ))}
                  </div>
                </Field>
              )}

              {/* Comments */}
              {comments && (
                <Field label="Comments (one per line)"
                  hint={parsedComments.length < quantity ? `${parsedComments.length}/${quantity} — add ${quantity - parsedComments.length} more.` : `${parsedComments.length}/${quantity} ready.`}
                  hintTone={parsedComments.length >= quantity ? "ok" : "warn"}>
                  <textarea rows={4} value={commentsText} onChange={(e) => setCommentsText(e.target.value)} placeholder={"Nice post!\nAmazing content!\nLove this 🔥"}
                    className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-sm text-white p-3 font-mono focus:outline-none focus:border-purple-500 resize-none custom-scrollbar-thin" />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} className="h-4 w-4 rounded border-purple-500/30 bg-black text-purple-600 focus:ring-purple-500 cursor-pointer" />
                    <span className="text-[11px] font-bold text-purple-200">Randomize comment distribution</span>
                  </label>
                </Field>
              )}
            </div>
          )}
        </div>

        {/* Sticky summary + CTA (always visible) */}
        <div className="shrink-0 border-t border-purple-500/12 bg-black/40 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Summary label="Total" value={fmt(cost)} tone="emerald" />
            <Summary label="Wallet" value={fmt(walletBalance)} tone="white" />
            <Summary label="After order" value={fmt(remaining)} tone={affordable ? "cyan" : "red"} />
          </div>
          {!affordable && (
            <button onClick={() => { window.location.hash = "Wallet"; }} className="w-full text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl py-2 cursor-pointer">
              Insufficient balance — tap to add money
            </button>
          )}
          <button onClick={submit} disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold font-space flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-purple-500/20">
            {submitting ? <><Loader2 className="h-4.5 w-4.5 animate-spin" /> Placing order…</> : <><Zap className="h-4.5 w-4.5" /> Place Order · {fmt(cost)}</>}
          </button>
          <p className="text-[10px] text-center text-purple-200/40 flex items-center justify-center gap-1"><Clock className="h-3 w-3" /> Est. delivery: {service.avgDelivery || "typically fast"}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, hintTone = "warn", children }: { label: string; hint?: string; hintTone?: "ok" | "warn" | "err"; children: React.ReactNode }) {
  const tone = hintTone === "ok" ? "text-emerald-400" : hintTone === "err" ? "text-red-400" : "text-amber-400";
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space block">{label}</label>
      {children}
      {hint && <p className={`text-[10px] ${tone}`}>{hint}</p>}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: "emerald" | "white" | "cyan" | "red" }) {
  const c = tone === "emerald" ? "text-emerald-400" : tone === "cyan" ? "text-cyan-400" : tone === "red" ? "text-red-400" : "text-white";
  return (
    <div className="rounded-xl bg-black/30 border border-purple-500/10 py-2">
      <div className={`text-sm font-bold font-space ${c} truncate`}>{value}</div>
      <div className="text-[9px] text-purple-200/40 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function InfoGrid({ service }: { service: SMMService }) {
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Wallet className="h-3.5 w-3.5" />, label: "Rate / 1k", value: `₦${(service.ratePer1k || 0).toLocaleString()}` },
    { icon: <Clock className="h-3.5 w-3.5" />, label: "Delivery", value: service.avgDelivery || "Fast" },
    { icon: <Info className="h-3.5 w-3.5" />, label: "Min order", value: (service.minOrder ?? 10).toLocaleString() },
    { icon: <Info className="h-3.5 w-3.5" />, label: "Max order", value: (service.maxOrder ?? 100000).toLocaleString() },
    { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Refill", value: service.refill || "No refill" },
    { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Cancel", value: service.cancel_support || "Auto refund" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl bg-black/30 border border-purple-500/10 p-3">
          <div className="flex items-center gap-1.5 text-purple-300/50">{r.icon}<span className="text-[9px] uppercase font-bold tracking-wider">{r.label}</span></div>
          <div className="text-sm font-bold text-white font-space mt-0.5 truncate">{r.value}</div>
        </div>
      ))}
    </div>
  );
}
