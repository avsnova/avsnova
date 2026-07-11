import { X, Copy, CheckCircle2, Eye, Download, RefreshCw, Package } from "lucide-react";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";
import OrderTimeline from "./OrderTimeline";
import OrderStatusBadge from "./OrderStatusBadge";
import OrderSupportCard, { type SupportOrder } from "./OrderSupportCard";
import { orderStatusMeta, isInFlight, isComplete, orderDestination, destinationLabel, destinationSection } from "./orderTracking";

export interface TrackedOrder {
  id: string | number;
  name: string;
  category?: string;
  productType?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  status: string;
  createdAt?: string;
  details?: string;
  credentials?: string;
  paymentStatus?: string;
}

interface Props {
  order: TrackedOrder;
  userName?: string | null;
  userId?: string | number | null;
  whatsappNumber?: string;
  onClose: () => void;
  onNavigate?: (section: string) => void;
  onCopy?: (text: string) => void;
  copiedText?: string | null;
  onBuyAgain?: (order: TrackedOrder) => void;
}

// Unified, premium order-detail experience reused by Marketplace, Gift, Inventory & SMM.
export default function OrderDetailSheet({ order, userName, userId, whatsappNumber, onClose, onNavigate, onCopy, copiedText, onBuyAgain }: Props) {
  useBodyScrollLock(true);
  const hasCreds = !!(order.credentials && order.credentials.trim());
  const meta = orderStatusMeta(order.status, hasCreds);
  const inFlight = isInFlight(meta);
  const complete = isComplete(meta);
  const dest = orderDestination(order.category || "", order.productType);
  const amount = order.amount ?? order.price ?? 0;

  const download = () => {
    const lines = [
      `Aurevashop — Order ${order.id}`,
      `Product: ${order.name}`,
      order.quantity ? `Quantity: ${order.quantity}` : "",
      `Status: ${meta.label}`,
      `Amount: ₦${amount.toLocaleString()}`,
      order.createdAt ? `Date: ${new Date(order.createdAt).toLocaleString()}` : "",
      hasCreds ? `\nCredentials:\n${order.credentials}` : "",
    ].filter(Boolean).join("\n");
    try {
      const blob = new Blob([lines], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `order_${order.id}.txt`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const supportOrder: SupportOrder = {
    id: order.id, product: order.name, quantity: order.quantity, status: order.status,
    amount, category: order.category, createdAt: order.createdAt, hasCredentials: hasCreds,
    paymentStatus: order.paymentStatus,
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Order details">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0b0518] shadow-2xl animate-sheet-up overflow-hidden">
        <div className="sm:hidden pt-2.5 flex justify-center"><span className="h-1 w-10 rounded-full bg-white/20" /></div>

        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 p-4 border-b border-purple-500/12">
          <span className="shrink-0 h-11 w-11 rounded-xl bg-white/5 flex items-center justify-center"><Package className="h-5 w-5 text-purple-300" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Order #{order.id}</div>
            <h3 className="text-sm font-bold font-space text-white mt-0.5 line-clamp-2">{order.name}</h3>
          </div>
          <OrderStatusBadge status={order.status} hasCredentials={hasCreds} />
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-purple-200/50 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar-thin">
          {/* Completion celebration banner */}
          {complete && (
            <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 to-emerald-600/8 p-4 text-center animate-fade-up">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-2 animate-check-pop">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-emerald-50 font-space">Delivered successfully! 🎉</div>
              <p className="text-[11px] text-emerald-300/70 mt-0.5">
                Saved to {destinationLabel(dest)}{order.createdAt ? ` · ${new Date(order.createdAt).toLocaleString()}` : ""}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-2xl border border-purple-500/12 bg-black/25 p-4">
            <div className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider font-space mb-3">Order progress</div>
            <OrderTimeline status={order.status} hasCredentials={hasCreds} detailed />
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <Cell label="Quantity" value={`${order.quantity ?? 1}`} />
            <Cell label="Amount" value={`₦${amount.toLocaleString()}`} tone="emerald" />
            {order.createdAt && <Cell label="Placed" value={new Date(order.createdAt).toLocaleDateString()} />}
            <Cell label="Category" value={order.category || "Marketplace"} />
          </div>

          {/* In-flight support card */}
          {inFlight && <OrderSupportCard order={supportOrder} userName={userName} userId={userId} whatsappNumber={whatsappNumber} />}

          {/* Credentials (when delivered) */}
          {hasCreds && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/15 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider font-space">Your credentials</span>
                {onCopy && (
                  <button onClick={() => onCopy(order.credentials!)} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer">
                    {copiedText === order.credentials ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} Copy all
                  </button>
                )}
              </div>
              <pre className="text-[11px] text-cyan-100 whitespace-pre-wrap break-words font-mono bg-black/40 rounded-xl p-3 select-all">{order.credentials}</pre>
            </div>
          )}

          {/* Details fallback */}
          {!hasCreds && order.details && (
            <div className="rounded-2xl border border-purple-500/10 bg-black/25 p-3.5">
              <div className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider font-space mb-1">Details</div>
              <p className="text-[11px] text-purple-100/80 leading-relaxed whitespace-pre-wrap">{order.details}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-purple-500/12 bg-black/30 p-3 flex flex-wrap gap-2">
          {complete && (
            <button onClick={() => onNavigate?.(destinationSection(dest))}
              className="flex-1 min-w-[130px] py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <Eye className="h-4 w-4" /> View in {destinationLabel(dest)}
            </button>
          )}
          <button onClick={download}
            className="flex-1 min-w-[110px] py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-purple-100 text-xs font-bold hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5">
            <Download className="h-4 w-4" /> Download
          </button>
          {onBuyAgain && (
            <button onClick={() => onBuyAgain(order)}
              className="flex-1 min-w-[110px] py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-purple-100 text-xs font-bold hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <RefreshCw className="h-4 w-4" /> Buy Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className="rounded-xl bg-black/30 border border-purple-500/10 p-3">
      <div className="text-[9px] text-purple-200/40 font-bold uppercase tracking-wider font-space">{label}</div>
      <div className={`text-sm font-bold mt-0.5 font-space truncate ${tone === "emerald" ? "text-emerald-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
