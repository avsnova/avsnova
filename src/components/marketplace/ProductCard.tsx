import { memo } from "react";
import { Star, Eye, Zap, FileText, ShieldCheck, Package, BadgeCheck, GitCompare, Share2 } from "lucide-react";
import { Button } from "../ui/shadcn";
import { getAvailability, AVAILABILITY_TONE_CLASS } from "./availability";
import ProductImage from "./ProductImage";
import { toggleCompare, isComparing, compareFull, useCompare } from "./compareStore";
import { shareProduct } from "./shareProduct";
import { useToast } from "../ui/Toast";

// Shared shape (subset of MarketplaceProduct) — keeps this component decoupled while
// preserving every existing field the marketplace relies on.
export interface ProductCardData {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  price: number;
  rating: number;
  sales: number;
  icon: string;
  description: string;
  type: "physical" | "digital";
  delivery_type: "instant" | "manual" | "inquiry";
  stock: number;
  display_location?: string;
  featured?: number;
  newest?: number;
  popular?: number;
  file_url?: string;
  multiple_images?: string;
}

// Stockless modules (eSIM / Physical SIM / International Gift) never track stock, so
// they are ALWAYS available for purchase and must never show "Out of Stock" (Bug 3).
export function isStocklessCard(p: { display_location?: string; category?: string }): boolean {
  const loc = String(p.display_location || "").toLowerCase().trim();
  return loc === "esim" || loc === "physical-sim" || loc === "physical sim" || loc === "gift" || p.category === "gifts";
}
// A card is "sold out" (Bug 3) only when it's a stock-tracked product with 0 stock.
export function isCardSoldOut(p: ProductCardData): boolean {
  const isInquiry = p.delivery_type === "inquiry" || p.price === 0;
  if (isInquiry) return false;
  if (isStocklessCard(p)) return false;
  return (p.stock ?? 0) <= 0;
}

interface Props {
  product: ProductCardData;
  featured?: boolean;                 // amber styling for the featured carousel
  onViewDetails: (p: ProductCardData) => void;
  onBuy: (p: ProductCardData) => void;
  onQuote: (p: ProductCardData) => void;
}

// Premium, reusable marketplace product card. Glassmorphism, rounded, hover lift,
// stock/badge indicators, star rating, and consistent primary/secondary actions.
function ProductCard({ product: p, featured, onViewDetails, onBuy, onQuote }: Props) {
  const { toast } = useToast();
  useCompare(); // re-render when compare list changes
  const isInquiry = p.delivery_type === "inquiry" || p.price === 0;
  const stockless = isStocklessCard(p);
  const soldOut = isCardSoldOut(p);
  const accent = featured ? "amber" : "purple";
  const comparing = isComparing(p.id);

  const onToggleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!comparing && compareFull()) { toast("You can compare up to 4 products at a time.", "warning"); return; }
    const added = toggleCompare({ id: p.id, name: p.name, price: p.price, icon: p.icon, file_url: p.file_url, multiple_images: p.multiple_images, category: p.category, type: p.type, delivery_type: p.delivery_type, stock: p.stock, rating: p.rating });
    toast(added ? "Added to comparison" : "Removed from comparison", "success", { silent: true });
  };
  const onShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = await shareProduct(p);
    if (r === "copied") toast("Product link copied", "success", { silent: true });
    else if (r === "failed") toast("Couldn't share this product", "error");
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 flex flex-col justify-between card-lift text-left ${
        featured
          ? "border-amber-500/30 bg-gradient-to-br from-[#1c1209]/80 to-[#0c0500]/95"
          : "border-purple-500/15 bg-gradient-to-br from-[#12082b]/70 to-[#090317]/90"
      }`}
    >
      {featured && (
        <div className="absolute top-0 right-0 bg-amber-500 text-black font-space font-extrabold text-[9px] uppercase tracking-wider px-3 py-1 rounded-bl-xl shadow-lg z-10">
          Featured
        </div>
      )}

      {/* Quick actions: compare + share (appear on hover; always tappable on mobile) */}
      <div className={`absolute z-20 flex gap-1.5 ${featured ? "top-9" : "top-2.5"} left-2.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`}>
        <button onClick={onToggleCompare} aria-label={comparing ? "Remove from comparison" : "Add to comparison"} title="Compare"
          className={`h-7 w-7 rounded-lg flex items-center justify-center border backdrop-blur-md transition-colors cursor-pointer ${comparing ? "bg-cyan-500/25 border-cyan-400/50 text-cyan-200" : "bg-black/50 border-white/10 text-purple-200/70 hover:text-white"}`}>
          <GitCompare className="h-3.5 w-3.5" />
        </button>
        <button onClick={onShare} aria-label="Share product" title="Share"
          className="h-7 w-7 rounded-lg flex items-center justify-center border border-white/10 bg-black/50 backdrop-blur-md text-purple-200/70 hover:text-white transition-colors cursor-pointer">
          <Share2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        {/* Header: real product image + type/category */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <button onClick={() => onViewDetails(p)} className="group-hover:scale-105 transition-transform cursor-pointer" aria-label={`View ${p.name}`}>
            <ProductImage product={p} className="h-14 w-14" rounded="rounded-2xl" />
          </button>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${p.type === "physical" ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" : "bg-purple-500/10 text-purple-300 border-purple-500/20"}`}>
              {p.type === "physical" ? <Package className="h-2.5 w-2.5" /> : <ShieldCheck className="h-2.5 w-2.5" />}
              {p.type}
            </span>
            <span className="text-[9px] font-bold text-purple-200/40 uppercase tracking-wider font-space">{p.subcategory || p.category}</span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[18px]">
          {p.featured === 1 && !featured && <Tag color="amber" label="Featured" />}
          {p.newest === 1 && <Tag color="cyan" label="New" />}
          {p.popular === 1 && <Tag color="emerald" label="Best Seller" />}
          {soldOut && <Tag color="red" label="Sold Out" />}
        </div>

        {/* Title + verified badge */}
        <h3
          onClick={() => onViewDetails(p)}
          className={`text-base font-bold text-white font-space tracking-tight cursor-pointer transition-colors inline-flex items-center gap-1.5 ${featured ? "group-hover:text-amber-300" : "group-hover:text-purple-300"}`}
        >
          <span>{p.name}</span>
          <BadgeCheck className="h-4 w-4 text-cyan-400 shrink-0" aria-label="Verified product" />
        </h3>
        <p className="text-xs text-purple-200/60 mt-2 leading-relaxed line-clamp-2">{p.description}</p>
      </div>

      {/* Footer: metrics + actions */}
      <div className="space-y-4 pt-4 border-t border-purple-500/10 mt-4">
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1 text-xs font-bold font-space ${featured ? "text-amber-400" : "text-amber-400"}`}>
            <Star className="h-3.5 w-3.5 fill-amber-400" />
            <span>{p.rating || "5.0"}</span>
            <span className="text-[10px] font-normal text-purple-200/50 font-inter">({p.sales || 0} sold)</span>
          </span>
          <div className="text-right">
            <div className="text-lg font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-white to-amber-300">
              {p.price > 0 ? `₦${p.price.toLocaleString()}` : "On Request"}
            </div>
            {(() => {
              const av = getAvailability(p);
              const isInquiry = p.delivery_type === "inquiry" || p.price === 0;
              // Show the real remaining stock count for limited stock (transparency, no fake urgency).
              // Stockless modules (eSIM / Physical SIM / Gift) never show a count.
              const showCount = !isInquiry && !stockless && p.stock > 0 && p.stock <= 20;
              return (
                <div className="flex flex-col items-end gap-0.5 mt-0.5">
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full border px-1.5 py-0.5 font-space ${AVAILABILITY_TONE_CLASS[av.tone]}`}>
                    <span>{av.emoji}</span>{av.label}
                  </span>
                  {showCount && <span className={`text-[9px] font-bold font-space ${p.stock <= 3 ? "text-amber-300" : "text-purple-200/60"}`}>{p.stock === 1 ? "Only 1 Left" : `${p.stock} Remaining`}</span>}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="md"
            variant="outline"
            onClick={() => onViewDetails(p)}
            className="flex-1 bg-black/40 border-purple-500/25 hover:bg-purple-500/10 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" /> Details
          </Button>
          {isInquiry ? (
            <Button
              size="md"
              onClick={() => onQuote(p)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:brightness-110 text-xs font-bold"
            >
              <FileText className="h-3.5 w-3.5" /> Quote
            </Button>
          ) : (
            <Button
              size="md"
              onClick={() => onBuy(p)}
              disabled={soldOut}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold ${soldOut ? "bg-neutral-700/50 text-neutral-400 cursor-not-allowed" : featured ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white" : "bg-gradient-to-r from-purple-600 to-cyan-500 hover:brightness-110"}`}
            >
              <Zap className="h-3.5 w-3.5" /> {soldOut ? "Out of Stock" : "Buy Now"}
            </Button>
          )}
        </div>
      </div>

      {/* subtle accent glow on hover */}
      <div className={`pointer-events-none absolute -bottom-10 -right-10 h-24 w-24 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity ${accent === "amber" ? "bg-amber-500/10" : "bg-purple-500/10"}`} />
    </div>
  );
}

// Memoized so a card only re-renders when its own product/handlers change (it still
// re-renders on compare-store changes via useCompare, which is intended).
export default memo(ProductCard, (prev, next) =>
  prev.featured === next.featured &&
  prev.onViewDetails === next.onViewDetails &&
  prev.onBuy === next.onBuy &&
  prev.onQuote === next.onQuote &&
  prev.product === next.product
);

function Tag({ color, label }: { color: "amber" | "cyan" | "emerald" | "red"; label: string }) {
  const cls: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return <span className={`px-2 py-0.5 rounded text-[9px] font-bold border font-space uppercase ${cls[color]}`}>{label}</span>;
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-purple-500/10 bg-[#0c0620] p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-14 w-14 rounded-2xl bg-white/5" />
        <div className="h-4 w-16 rounded-full bg-white/5" />
      </div>
      <div className="h-4 w-3/4 bg-white/5 rounded mb-2" />
      <div className="h-3 w-full bg-white/5 rounded mb-1.5" />
      <div className="h-3 w-2/3 bg-white/5 rounded" />
      <div className="mt-5 pt-4 border-t border-purple-500/10 flex items-center justify-between">
        <div className="h-4 w-16 bg-white/5 rounded" />
        <div className="h-6 w-20 bg-white/5 rounded" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-9 flex-1 bg-white/5 rounded-xl" />
        <div className="h-9 flex-1 bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}
