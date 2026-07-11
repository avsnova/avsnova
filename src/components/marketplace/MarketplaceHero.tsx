import { ShoppingBag, ShieldCheck, Zap, Search } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  productCount: number;
  categoryCount: number;
  onSearchFocus?: () => void;
  // Optional scoped identity — lets dedicated pages (eSIM, Physical SIM, etc.)
  // reuse this exact hero component while changing only the copy/badge.
  badge?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  searchPlaceholder?: string;
}

// Premium marketplace hero — strong identity, gradient mesh, trust stats, and a
// prominent search affordance. Fully responsive; decorative art is inline SVG/CSS.
export default function MarketplaceHero({
  productCount,
  categoryCount,
  onSearchFocus,
  badge,
  title,
  subtitle,
  searchPlaceholder,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#1a0f3d] via-[#12082b] to-[#0a0418] p-6 sm:p-8">
      {/* Ambient mesh */}
      <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-purple-600/20 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-cyan-500/15 blur-[90px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-purple-500/25 px-3 py-1 text-[10px] font-bold text-purple-200 uppercase tracking-widest font-space mb-3">
            <ShoppingBag className="h-3.5 w-3.5 text-cyan-300" /> {badge || "AVS Digital Marketplace"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-space text-white leading-tight tracking-tight">
            {title || (<>Premium digital products,<br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-white to-cyan-300">delivered instantly.</span></>)}
          </h1>
          <p className="text-xs sm:text-sm text-purple-200/60 mt-3 leading-relaxed">
            {subtitle || "Verified accounts, software keys, VPNs, gift cards and more — with buyer protection and lightning-fast fulfillment."}
          </p>

          <button
            onClick={onSearchFocus}
            className="mt-5 w-full sm:w-auto inline-flex items-center gap-2.5 rounded-2xl bg-black/40 border border-purple-500/25 px-4 py-3 text-sm text-purple-200/60 hover:border-purple-500/45 hover:text-white transition-all cursor-pointer group"
          >
            <Search className="h-4 w-4 text-purple-300 group-hover:scale-110 transition-transform" />
            <span>{searchPlaceholder || "Search products, accounts, keys…"}</span>
          </button>
        </div>

        {/* Trust stats */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <Stat value={`${productCount}+`} label="Products" icon={<ShoppingBag className="h-4 w-4" />} />
          <Stat value={`${categoryCount}`} label="Categories" icon={<Zap className="h-4 w-4" />} tone="cyan" />
          <Stat value="24/7" label="Support" icon={<ShieldCheck className="h-4 w-4" />} tone="emerald" />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, icon, tone = "purple" }: { value: string; label: string; icon: React.ReactNode; tone?: "purple" | "cyan" | "emerald" }) {
  const c = tone === "cyan" ? "text-cyan-300" : tone === "emerald" ? "text-emerald-300" : "text-purple-200";
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 px-3 sm:px-4 py-3 text-center min-w-[80px] backdrop-blur-sm">
      <div className={`flex items-center justify-center ${c} opacity-80`}>{icon}</div>
      <div className="text-lg font-bold font-space text-white mt-1">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-purple-200/40 font-bold">{label}</div>
    </div>
  );
}
