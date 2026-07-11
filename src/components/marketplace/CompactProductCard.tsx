import { memo } from "react";
import { Eye, Star, MapPin, FileText } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import ProductImage from "./ProductImage";
import type { ProductCardData } from "./ProductCard";
import { isStocklessCard, isCardSoldOut } from "./ProductCard";

interface Props {
  product: ProductCardData;
  featured?: boolean;
  onViewDetails: (p: ProductCardData) => void;
  onBuy: (p: ProductCardData) => void;
  onQuote: (p: ProductCardData) => void;
}

/**
 * Marketplace product card — mirrors the International Gift Delivery card design
 * (same Card container, gradient, borders, shadows, typography, spacing, hover
 * animation, subcategory badge, stock indicator, price block). The only intentional
 * differences per spec:
 *   1) the image area is a small CIRCULAR logo/avatar (not a large banner), and
 *   2) the secondary action reads "View Details" (instead of "Add to Cart").
 * Responsive: 2 cards per row on mobile, 3 on tablet, 4 on desktop. Both action
 * buttons (Buy Now + View Details) are always visible (full-width, stacked).
 */
function CompactProductCard({ product: p, featured, onViewDetails, onBuy, onQuote }: Props) {
  const isInquiry = p.delivery_type === "inquiry" || p.price === 0;
  const stockless = isStocklessCard(p);
  const soldOut = isCardSoldOut(p);
  const deliveryEstimate = (p as any).delivery_estimate as string | undefined;

  return (
    <Card hoverable className="p-2.5 sm:p-4 space-y-3 sm:space-y-4 flex flex-col justify-between border-purple-500/10 bg-gradient-to-br from-[#100727]/60 to-[#080213]/90 relative overflow-hidden group text-left">
      {/* Subcategory badge (top-right) — identical to Gift Delivery */}
      <div className="absolute top-0 right-0 bg-purple-600/10 text-purple-300 font-mono text-[8px] sm:text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-bl-lg border-l border-b border-purple-500/10 max-w-[70%] truncate">
        {p.subcategory || p.category}
      </div>

      <div>
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          {/* CIRCULAR logo/avatar (the only visual change vs. Gift Delivery) */}
          <span className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center overflow-hidden shrink-0">
            <ProductImage product={p} className="h-full w-full" rounded="rounded-full" fit="cover" />
          </span>
          <div className="min-w-0">
            <h4 className="font-extrabold text-white text-[13px] sm:text-sm font-space group-hover:text-purple-300 transition-colors line-clamp-2 leading-tight">{p.name}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider ${(!soldOut) ? "text-emerald-400" : "text-red-400"}`}>
              {isInquiry ? "Available" : stockless ? "Available" : p.stock > 0 ? `${p.stock} In Stock` : "Out of Stock"}
            </span>
          </div>
        </div>
        <p className="text-[11px] sm:text-xs text-purple-200/60 leading-relaxed min-h-[36px] sm:min-h-[50px] line-clamp-2 sm:line-clamp-3">{p.description}</p>
        {deliveryEstimate && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-cyan-300/80 font-medium">
            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{deliveryEstimate}</span>
          </div>
        )}
        {featured ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
            <Star className="h-2.5 w-2.5 fill-amber-300" /> Featured
          </span>
        ) : null}
      </div>

      <div className="pt-3 border-t border-purple-500/10 space-y-2.5">
        <div>
          <span className="text-purple-200/40 block text-[9px] font-bold font-space uppercase">Unit price</span>
          <span className="text-white font-extrabold font-mono text-sm sm:text-base">{p.price > 0 ? `₦${p.price.toLocaleString()}` : "On Request"}</span>
        </div>

        {/* Actions stack full-width so BOTH buttons are always visible, even on the
            narrow 2-per-row mobile grid. */}
        <div className="grid grid-cols-1 gap-2">
          <Button
            size="sm"
            onClick={() => { if (isInquiry) onQuote(p); else if (!soldOut) onBuy(p); }}
            disabled={soldOut}
            className="w-full bg-purple-600 hover:bg-purple-500 text-[11px] font-bold font-space flex items-center justify-center gap-1"
          >
            {isInquiry ? <><FileText className="h-3 w-3" /> Quote</> : soldOut ? "Sold Out" : <>Buy Now ⚡</>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDetails(p)}
            className="w-full border-purple-500/20 text-white font-bold text-[11px] flex items-center justify-center gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View Details</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Memoized: re-renders only when this product's own props change, not when a sibling
// card, a search keystroke, or an unrelated parent state update fires. With dozens of
// cards on screen this eliminates a huge amount of wasted rendering on every interaction.
export default memo(CompactProductCard, (prev, next) =>
  prev.featured === next.featured &&
  prev.onViewDetails === next.onViewDetails &&
  prev.onBuy === next.onBuy &&
  prev.onQuote === next.onQuote &&
  prev.product === next.product
);
