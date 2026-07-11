import { useState } from "react";
import { LifeBuoy, Bot, Clock, MessageCircle, ChevronRight } from "lucide-react";
import { openAssistant } from "../../ai/assistantBridge";
import { openWhatsapp } from "../../ai/escalation";
import { orderStatusMeta, friendlyProgress, etaFor, timeSince } from "./orderTracking";

export interface SupportOrder {
  id: string | number;
  product: string;
  quantity?: number;
  status: string;
  amount?: number;
  category?: string;
  createdAt?: string;
  hasCredentials?: boolean;
  paymentStatus?: string;
}

interface Props {
  order: SupportOrder;
  userName?: string | null;
  userId?: string | number | null;
  whatsappNumber?: string;
  /** Shown only when the order is in-flight (pending/processing/waiting/review). */
  compact?: boolean;
}

// Premium support card shown on in-flight orders. Explains status first, then offers
// AI help, "continue waiting", and (progressive) WhatsApp escalation with auto-summary.
export default function OrderSupportCard({ order, userName, userId, whatsappNumber }: Props) {
  const meta = orderStatusMeta(order.status, order.hasCredentials);
  const [escalating, setEscalating] = useState(false);
  const eta = etaFor(meta);
  const review = meta.key === "review";

  const askAi = () => {
    openAssistant({
      orderId: order.id, product: order.product, quantity: order.quantity, status: meta.label,
      paymentStatus: order.paymentStatus, category: order.category, amount: order.amount,
      timeSince: timeSince(order.createdAt),
      ask: `What's the status of my order ${order.id} (${order.product})?`,
    });
  };

  const escalate = () => {
    openWhatsapp(whatsappNumber, {
      customerName: userName || undefined,
      userId: userId ?? undefined,
      orderId: String(order.id),
      service: order.product,
      section: order.category || "Marketplace",
      status: `${meta.label}${order.paymentStatus ? ` · Payment: ${order.paymentStatus}` : ""} · Placed ${timeSince(order.createdAt)}${order.quantity ? ` · Qty ${order.quantity}` : ""}`,
      problem: `Order ${order.id} for "${order.product}" needs priority review.`,
    });
    setEscalating(false);
  };

  return (
    <div className={`rounded-2xl border p-4 ${review ? "border-amber-500/25 bg-amber-500/8" : "border-purple-500/20 bg-gradient-to-br from-[#120a2e]/60 to-[#0c0420]/60"}`}>
      <div className="flex items-start gap-2.5">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${review ? "bg-amber-500/15 text-amber-300" : "bg-purple-500/15 text-purple-300"}`}>
          <LifeBuoy className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white font-space">{review ? "Under manual review" : "Need help with this order?"}</div>
          <p className="text-[11px] text-purple-200/60 mt-0.5 leading-relaxed">
            {review ? "A support specialist is reviewing your order." : friendlyProgress(meta)}
            {eta && <span className="text-cyan-300/80"> Estimated: {eta}.</span>}
          </p>
        </div>
      </div>

      {!escalating ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={askAi}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:brightness-110 active:scale-95 transition-all cursor-pointer">
            <Bot className="h-3.5 w-3.5" /> Open AI Assistant
          </button>
          <button onClick={() => setEscalating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-white/5 border border-purple-500/25 text-purple-100 hover:bg-white/10 active:scale-95 transition-all cursor-pointer">
            <LifeBuoy className="h-3.5 w-3.5" /> Contact Support
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-purple-200/40">
            <Clock className="h-3.5 w-3.5" /> Continue waiting
          </span>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-black/30 border border-purple-500/15 p-3 animate-fade-up">
          <p className="text-xs text-purple-100">Would you like us to forward this order to our support team for priority review? We'll include all the details so you won't need to type anything.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button onClick={escalate}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer">
              <MessageCircle className="h-3.5 w-3.5" /> Yes, Contact Support
            </button>
            <button onClick={() => setEscalating(false)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer">
              Not now <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
