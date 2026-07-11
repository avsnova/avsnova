import { ShieldCheck, Zap, RotateCcw, Clock, Wifi, WifiOff, Package } from "lucide-react";

interface Product {
  delivery_type: "instant" | "manual" | "inquiry";
  type: "physical" | "digital";
  stock: number;
}

// Human delivery estimate derived from the existing fields (no backend change).
export function deliveryEstimate(p: Product): string {
  if (p.delivery_type === "instant") return "Instant delivery";
  if (p.delivery_type === "inquiry") return "Quote within a few hours";
  if (p.type === "physical") return "1–5 business days";
  return "Usually within 10–30 minutes";
}

// Friendly provider/stock status.
export function providerStatus(p: Product): { label: string; ok: boolean } {
  if (p.delivery_type === "inquiry") return { label: "Available on request", ok: true };
  if (p.stock > 0) return { label: "In stock & ready", ok: true };
  return { label: "Currently restocking", ok: false };
}

// Delivery estimate + provider status row for the product detail page.
export function ProductStatusRow({ product }: { product: Product }) {
  const status = providerStatus(product);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-purple-500/12 bg-black/25 p-3">
        <div className="flex items-center gap-1.5 text-purple-200/50 text-[9px] font-bold uppercase tracking-wider"><Clock className="h-3 w-3" /> Delivery</div>
        <div className="text-xs font-bold text-white mt-1 font-space">{deliveryEstimate(product)}</div>
      </div>
      <div className="rounded-2xl border border-purple-500/12 bg-black/25 p-3">
        <div className="flex items-center gap-1.5 text-purple-200/50 text-[9px] font-bold uppercase tracking-wider">
          {status.ok ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} Provider
        </div>
        <div className={`text-xs font-bold mt-1 font-space ${status.ok ? "text-emerald-400" : "text-amber-400"}`}>{status.label}</div>
      </div>
    </div>
  );
}

// Trust indicators — reassures buyers (secure payment, instant/tracked delivery, refund policy).
export function ProductTrustBar({ product }: { product: Product }) {
  const items: { icon: React.ReactNode; label: string }[] = [
    { icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />, label: "Secure wallet payment" },
    product.delivery_type === "instant"
      ? { icon: <Zap className="h-3.5 w-3.5 text-cyan-400" />, label: "Instant automated delivery" }
      : product.type === "physical"
      ? { icon: <Package className="h-3.5 w-3.5 text-cyan-400" />, label: "Tracked dispatch" }
      : { icon: <Clock className="h-3.5 w-3.5 text-cyan-400" />, label: "Fast fulfillment" },
    { icon: <RotateCcw className="h-3.5 w-3.5 text-purple-300" />, label: "Buyer protection & refunds" },
  ];
  return (
    <div className="rounded-2xl border border-purple-500/12 bg-gradient-to-br from-[#120a2e]/40 to-transparent p-3 space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px] text-purple-100/80">
          <span className="shrink-0">{it.icon}</span>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
