import { CheckCircle2, Eye, ShoppingBag, Clock, X, Copy } from "lucide-react";

interface Props {
  title?: string;
  subtitle?: string;
  productName: string;
  orderId: string | number;
  cost: number;
  eta?: string;
  destinationLabel: string;     // e.g. "My Inventory" / "Gift Orders"
  credentials?: string | null;  // show copy button when instantly delivered
  onView: () => void;           // go to destination
  onContinue: () => void;       // keep shopping / dismiss
  onCopy?: (text: string) => void;
}

// Shared premium order-success celebration (pure CSS confetti). Used by Marketplace,
// Gift Marketplace and any future product flow for one consistent completion experience.
export default function OrderSuccessScreen({
  title = "Order placed! 🎉", subtitle, productName, orderId, cost, eta, destinationLabel,
  credentials, onView, onContinue, onCopy,
}: Props) {
  const colors = ["#34d399", "#22d3ee", "#a855f7", "#f59e0b", "#f472b6"];
  const delivered = !!(credentials && credentials.trim());
  return (
    <div className="fixed inset-0 z-[185] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Order placed">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onContinue} />
      <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-[#0c1a14] to-[#08040f] shadow-2xl p-6 animate-sheet-up overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="absolute top-0 h-1.5 w-1.5 rounded-[1px] animate-confetti"
              style={{ left: `${(i / 16) * 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 6) * 70}ms`, transform: `rotate(${i * 40}deg)` }} />
          ))}
        </div>

        <button onClick={onContinue} aria-label="Close" className="absolute top-3 right-3 text-purple-200/40 hover:text-white p-1 cursor-pointer z-10"><X className="h-5 w-5" /></button>

        <div className="relative z-10 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3 animate-check-pop">
            <CheckCircle2 className="h-9 w-9 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold font-space text-white">{delivered ? "Delivered successfully! 🎉" : title}</h3>
          <p className="text-xs text-purple-200/50 mt-1">{subtitle || `Saved to ${destinationLabel}.`}</p>

          <div className="mt-4 rounded-2xl bg-black/30 border border-purple-500/12 p-3.5 text-left space-y-2">
            <Row label="Product" value={productName} />
            <Row label="Order ID" value={`#${orderId}`} mono />
            <Row label="Charged" value={`₦${cost.toLocaleString()}`} tone="emerald" />
            {eta && <Row label="Est. completion" value={eta} icon={<Clock className="h-3 w-3" />} />}
          </div>

          {delivered && onCopy && (
            <button onClick={() => onCopy(credentials!)}
              className="mt-3 w-full py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <Copy className="h-4 w-4" /> Copy Credentials
            </button>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={onView} className="flex-1 py-3 rounded-xl bg-white/5 border border-purple-500/20 text-sm font-bold text-white hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <Eye className="h-4 w-4" /> View in {destinationLabel}
            </button>
            <button onClick={onContinue} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-sm font-bold text-white hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <ShoppingBag className="h-4 w-4" /> Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone, mono, icon }: { label: string; value: string; tone?: "emerald"; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-purple-200/40 flex items-center gap-1">{icon}{label}</span>
      <span className={`font-bold truncate ${tone === "emerald" ? "text-emerald-400" : "text-white"} ${mono ? "font-mono" : "font-space"}`}>{value}</span>
    </div>
  );
}
