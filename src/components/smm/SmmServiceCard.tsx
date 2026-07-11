import { Heart, Zap, ChevronRight, Clock, Gauge, ShieldCheck } from "lucide-react";
import { ServiceLogo } from "../ui/BrandIcon";
import { networkIcon, mapCategoryToNetworkGroup, serviceType, type SMMService } from "./smmHelpers";

interface Props {
  service: SMMService;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
  onQuickOrder: (s: SMMService) => void;
  onOpenDetails: (s: SMMService) => void;
}

// Premium, reusable SMM service card — future services inherit this automatically.
export default function SmmServiceCard({ service, favorite, onToggleFavorite, onQuickOrder, onOpenDetails }: Props) {
  const network = mapCategoryToNetworkGroup(service.platform);
  const type = serviceType(service.name);
  return (
    <div className="group relative rounded-2xl border border-purple-500/12 bg-gradient-to-br from-[#100a28] to-[#08040f] p-4 card-lift flex flex-col">
      {/* Favorite */}
      <button
        onClick={() => onToggleFavorite(service.id)}
        aria-label={favorite ? "Remove favorite" : "Add favorite"}
        className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer z-10 hover:bg-white/5"
      >
        <Heart className={`h-4 w-4 transition-all ${favorite ? "fill-red-500 text-red-500 scale-110" : "text-purple-200/40"}`} />
      </button>

      {/* Header */}
      <button onClick={() => onOpenDetails(service)} className="flex items-start gap-3 text-left cursor-pointer pr-8">
        <span className="shrink-0 h-11 w-11 rounded-xl bg-white/5 flex items-center justify-center">
          <ServiceLogo name={network} fallback={networkIcon(network)} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300/70 bg-purple-500/10 border border-purple-500/15 rounded px-1.5 py-0.5">{network}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-300/70">{type}</span>
          </div>
          <h4 className="text-sm font-bold text-white font-space leading-snug mt-1 line-clamp-2">{service.name}</h4>
        </div>
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
        <Stat icon={<Clock className="h-3 w-3" />} label="Speed" value={(service.avgDelivery || "Fast").split(" ").slice(0, 2).join(" ")} />
        <Stat icon={<Gauge className="h-3 w-3" />} label="Min" value={String(service.minOrder ?? 10)} />
        <Stat icon={<ShieldCheck className="h-3 w-3" />} label="Refill" value={(service.refill || "—").split(" ")[0]} />
      </div>

      {/* Price + actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-purple-500/10">
        <div>
          <div className="text-[9px] text-purple-200/40 uppercase font-bold tracking-wider">Rate / 1k</div>
          <div className="text-base font-bold text-emerald-400 font-space">₦{(service.ratePer1k || 0).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onOpenDetails(service)} className="h-9 px-2.5 rounded-xl bg-white/5 border border-purple-500/15 text-purple-200 hover:text-white text-[11px] font-bold cursor-pointer flex items-center gap-1 transition-colors">
            Details <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onQuickOrder(service)} className="h-9 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-[11px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" /> Order
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-purple-500/8 py-1.5 px-1">
      <div className="flex items-center justify-center gap-1 text-purple-300/50">{icon}</div>
      <div className="text-[10px] font-bold text-white truncate mt-0.5">{value}</div>
      <div className="text-[8px] text-purple-200/30 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export function ServiceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-purple-500/10 bg-[#0c0620] p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-11 w-11 rounded-xl bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-20 bg-white/5 rounded" />
          <div className="h-3.5 w-full bg-white/5 rounded" />
          <div className="h-3.5 w-2/3 bg-white/5 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3.5">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-white/5 rounded-lg" />)}
      </div>
      <div className="h-9 bg-white/5 rounded-xl mt-4" />
    </div>
  );
}
