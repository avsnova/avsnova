import { useState } from "react";
import { Monitor, Smartphone, Star, ShieldCheck, Zap } from "lucide-react";
import type { StudioForm } from "./types";

// Live marketplace preview (desktop + mobile) reflecting the current wizard state.
export default function StudioPreview({ form }: { form: StudioForm }) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const price = parseFloat(form.price) || 0;
  const sale = form.sale_price ? parseFloat(form.sale_price) : NaN;
  const showSale = !isNaN(sale) && sale > 0 && sale < price;
  const gallery = (form.multiple_images || "").split(",").map((s) => s.trim()).filter(Boolean);
  const coverIsImg = /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(form.icon);
  const cover = coverIsImg ? form.icon : (gallery[0] || "");
  const fmt = (n: number) => "₦" + Math.round(n).toLocaleString();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Live Preview</span>
        <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5 border border-purple-500/15">
          <button onClick={() => setMode("desktop")} className={`p-1.5 rounded-md cursor-pointer ${mode === "desktop" ? "bg-purple-500/25 text-white" : "text-purple-300/50"}`}><Monitor className="h-3.5 w-3.5" /></button>
          <button onClick={() => setMode("mobile")} className={`p-1.5 rounded-md cursor-pointer ${mode === "mobile" ? "bg-purple-500/25 text-white" : "text-purple-300/50"}`}><Smartphone className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className={`mx-auto transition-all ${mode === "mobile" ? "max-w-[220px]" : "max-w-full"}`}>
        <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#160a33] to-[#0a0518] overflow-hidden shadow-xl">
          {/* image */}
          <div className="aspect-[4/3] bg-black/40 flex items-center justify-center relative">
            {cover
              ? <img src={cover} alt={form.name} className="w-full h-full object-cover" />
              : <span className="text-5xl">{coverIsImg ? "📦" : (form.icon || "📦")}</span>}
            {!!form.featured && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[9px] font-bold">FEATURED</span>}
            {form.delivery_type === "instant" && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-emerald-500/90 text-black text-[9px] font-bold flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />INSTANT</span>}
          </div>
          {/* body */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-1 text-amber-400">
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-2.5 w-2.5 fill-amber-400" />)}
              <span className="text-[9px] text-purple-300/50 ml-1">New</span>
            </div>
            <h4 className="text-sm font-bold text-white leading-tight line-clamp-2">{form.name || "Product name"}</h4>
            {form.short_description && <p className="text-[10px] text-purple-200/50 line-clamp-2">{form.short_description}</p>}
            <div className="flex items-center gap-1.5 text-[9px] text-cyan-300/70">
              <ShieldCheck className="h-3 w-3" /> Verified seller
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              {showSale ? (
                <>
                  <span className="text-base font-bold text-emerald-400 font-space">{fmt(sale)}</span>
                  <span className="text-[10px] text-purple-300/40 line-through">{fmt(price)}</span>
                </>
              ) : (
                <span className="text-base font-bold text-white font-space">{fmt(price)}</span>
              )}
            </div>
            <button className="w-full mt-1.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-[11px] font-bold cursor-default">
              {form.delivery_type === "inquiry" ? "Request Quote" : "Buy Now"}
            </button>
          </div>
        </div>
      </div>
      {form.variants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {form.variants.map((v, i) => (
            <span key={i} className="px-2 py-0.5 rounded-md border border-purple-500/25 bg-purple-500/10 text-[9px] text-purple-200">{v.name || "Variant"}</span>
          ))}
        </div>
      )}
    </div>
  );
}
