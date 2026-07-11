import { useState } from "react";
import { X, GitCompare, Check, Minus } from "lucide-react";
import { useCompare, removeCompare, clearCompare, type CompareItem } from "./compareStore";
import ProductImage from "./ProductImage";
import { getAvailability } from "./availability";
import { deliveryEstimate } from "./ProductTrustBar";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";

interface Props {
  onBuy?: (id: string) => void;
  onView?: (id: string) => void;
}

// Floating comparison bar (bottom) + full side-by-side comparison sheet.
export default function CompareBar({ onBuy, onView }: Props) {
  const items = useCompare();
  const [open, setOpen] = useState(false);
  useBodyScrollLock(open);

  if (items.length === 0) return null;

  return (
    <>
      {/* Floating bar */}
      {!open && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] sm:w-auto animate-ai-pop-in">
          <div className="flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-[#0c0620]/95 backdrop-blur-xl px-3 py-2.5 shadow-2xl">
            <div className="flex -space-x-2">
              {items.slice(0, 4).map((it) => (
                <ProductImage key={it.id} product={it} className="h-8 w-8 ring-2 ring-[#0c0620]" rounded="rounded-lg" />
              ))}
            </div>
            <span className="text-xs font-bold text-white hidden sm:inline">{items.length} to compare</span>
            <button onClick={() => setOpen(true)} className="ml-auto sm:ml-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-3.5 py-2 text-xs font-bold text-white hover:brightness-110 active:scale-95 transition-all cursor-pointer">
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </button>
            <button onClick={clearCompare} aria-label="Clear comparison" className="text-purple-200/40 hover:text-white p-1 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Comparison sheet */}
      {open && (
        <div className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Compare products">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-3xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0b0518] shadow-2xl animate-sheet-up overflow-hidden">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-purple-500/12">
              <h3 className="text-sm font-bold font-space text-white flex items-center gap-2"><GitCompare className="h-4.5 w-4.5 text-cyan-300" /> Compare Products</h3>
              <div className="flex items-center gap-2">
                <button onClick={clearCompare} className="text-[11px] font-bold text-purple-200/50 hover:text-white cursor-pointer">Clear all</button>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-purple-200/50 hover:text-white p-1 cursor-pointer"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar-thin p-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(140px, 1fr))` }}>
                {items.map((it) => <CompareColumn key={it.id} item={it} onBuy={onBuy} onView={onView} onRemove={() => removeCompare(it.id)} />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-t border-purple-500/8">
      <div className="text-[9px] uppercase tracking-wider text-purple-200/40 font-bold">{label}</div>
      <div className="text-xs font-bold text-white mt-0.5">{children}</div>
    </div>
  );
}

function CompareColumn({ item, onBuy, onView, onRemove }: { item: CompareItem; onBuy?: (id: string) => void; onView?: (id: string) => void; onRemove: () => void }) {
  const av = getAvailability({ stock: item.stock ?? 0, delivery_type: (item.delivery_type as any) || "manual", price: item.price });
  return (
    <div className="rounded-2xl border border-purple-500/12 bg-black/25 p-3 relative">
      <button onClick={onRemove} aria-label="Remove" className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-purple-200/50 hover:text-white cursor-pointer"><X className="h-3 w-3" /></button>
      <button onClick={() => onView?.(item.id)} className="cursor-pointer"><ProductImage product={item} className="h-14 w-14 mx-auto" rounded="rounded-2xl" /></button>
      <div className="text-xs font-bold text-white text-center mt-2 line-clamp-2 min-h-[32px]">{item.name}</div>
      <div className="text-center text-base font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-white to-amber-300 mt-1">
        {item.price > 0 ? `₦${item.price.toLocaleString()}` : "On request"}
      </div>
      <Row label="Availability"><span className="text-emerald-300">{av.emoji} {av.label}</span></Row>
      <Row label="Delivery">{deliveryEstimate({ stock: item.stock ?? 0, delivery_type: (item.delivery_type as any) || "manual", type: (item.type as any) || "digital" })}</Row>
      <Row label="Type"><span className="capitalize">{item.type || "digital"}</span></Row>
      <Row label="Rating">★ {item.rating || "5.0"}</Row>
      <Row label="Refund">{item.refund ? <Check className="h-3.5 w-3.5 text-emerald-400 inline" /> : <Minus className="h-3.5 w-3.5 text-purple-200/40 inline" />} {item.refund || "Buyer protection"}</Row>
      <button onClick={() => onBuy?.(item.id)} className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-[11px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer">Buy Now</button>
    </div>
  );
}
