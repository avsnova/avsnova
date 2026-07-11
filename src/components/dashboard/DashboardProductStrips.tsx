import { useState, useEffect } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { apiFetch } from "../../utils/api";
import ProductImage from "../marketplace/ProductImage";
import { getAvailability, AVAILABILITY_TONE_CLASS } from "../marketplace/availability";

interface Prod {
  id: string; name: string; price: number; icon?: string; file_url?: string; multiple_images?: string;
  category?: string; subcategory?: string; type?: string; delivery_type?: string; stock?: number;
  featured?: number; popular?: number; newest?: number; sales?: number; status?: number;
}

// Self-contained (lazy) product discovery strip for the customer dashboard:
// "Recommended for you". Fetches once, cached in module memory.
let cache: Prod[] | null = null;

export default function DashboardProductStrips({ onOpenProduct, onBrowse }: { onOpenProduct: (id: string) => void; onBrowse: () => void }) {
  const [products, setProducts] = useState<Prod[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    apiFetch("/api/marketplace/products")
      .then((d) => { if (!cancelled && Array.isArray(d)) { cache = d.filter((p: Prod) => p.status !== 0); setProducts(cache); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
      </div>
    );
  }
  if (products.length === 0) return null;

  const recommended = [...products]
    .sort((a, b) => ((b.featured ? 2 : 0) + (b.popular ? 1 : 0) + (b.sales || 0) / 1000) - ((a.featured ? 2 : 0) + (a.popular ? 1 : 0) + (a.sales || 0) / 1000))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <Strip title="Recommended for you" icon={<Sparkles className="h-4 w-4 text-purple-300" />} items={recommended} onOpenProduct={onOpenProduct} onBrowse={onBrowse} />
    </div>
  );
}

function Strip({ title, icon, items, onOpenProduct, onBrowse }: { title: string; icon: React.ReactNode; items: Prod[]; onOpenProduct: (id: string) => void; onBrowse: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white font-space">{icon}{title}</h3>
        <button onClick={onBrowse} className="text-[11px] font-bold text-purple-300 hover:text-white cursor-pointer inline-flex items-center gap-0.5">Browse all <ArrowRight className="h-3 w-3" /></button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar-thin snap-x">
        {items.map((p) => {
          const av = getAvailability({ stock: p.stock ?? 0, delivery_type: (p.delivery_type as any) || "manual", price: p.price });
          return (
            <button key={p.id} onClick={() => onOpenProduct(p.id)}
              className="snap-start shrink-0 w-40 text-left rounded-2xl border border-purple-500/12 bg-black/30 hover:border-purple-500/30 hover:bg-black/50 transition-all cursor-pointer p-3">
              <ProductImage product={p} className="h-12 w-12" rounded="rounded-xl" />
              <div className="text-xs font-bold text-white truncate font-space mt-2">{p.name}</div>
              <div className="text-[11px] text-amber-300 font-mono mt-0.5">{p.price > 0 ? `₦${p.price.toLocaleString()}` : "On request"}</div>
              <span className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider rounded-full border px-1.5 py-0.5 mt-1.5 ${AVAILABILITY_TONE_CLASS[av.tone]}`}>{av.emoji} {av.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
