import { Button } from "../ui/shadcn";
import { ArrowLeft } from "lucide-react";

export interface OrderSummaryLine {
  label: string;
  value: string;
}

interface OrderSummaryStepProps {
  productName: string;
  quantity: number;
  unitPrice: number;
  fee?: number;
  feeLabel?: string;
  total: number;
  /** Extra detail rows (recipient, device, address, etc.). */
  details?: OrderSummaryLine[];
  walletBalance: number;
  isSubmitting?: boolean;
  onBack: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

// Shared "Order Summary" step shown before payment across all Marketplace checkouts
// (Bug 4). Mirrors the International Gift Delivery summary design: itemization card,
// fee/total breakdown, wallet balance preview, Edit + Confirm actions.
export default function OrderSummaryStep({
  productName, quantity, unitPrice, fee = 0, feeLabel = "Delivery Fee", total,
  details = [], walletBalance, isSubmitting, onBack, onConfirm, confirmLabel = "Confirm & Pay ⚡",
}: OrderSummaryStepProps) {
  const insufficient = walletBalance < total;
  return (
    <div className="space-y-4 text-left">
      <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-space">Order Summary</h4>

      <div className="p-4 bg-black/40 border border-purple-500/10 rounded-2xl space-y-2.5 font-mono text-xs">
        <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
          <span className="text-purple-200/40">Product:</span>
          <span className="text-white font-bold text-right break-words max-w-[240px]">{productName}</span>
        </div>
        <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
          <span className="text-purple-200/40">Quantity:</span>
          <span className="text-white font-bold">x{quantity}</span>
        </div>
        <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
          <span className="text-purple-200/40">Unit Price:</span>
          <span className="text-white font-bold">₦{unitPrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
          <span className="text-purple-200/40">Subtotal:</span>
          <span className="text-white font-bold">₦{(unitPrice * quantity).toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
          <span className="text-purple-200/40">{feeLabel}:</span>
          <span className="text-white font-bold">{fee > 0 ? `₦${fee.toLocaleString()}` : "Free"}</span>
        </div>

        {details.map((d) => (
          <div key={d.label} className="flex justify-between border-b border-purple-500/5 pb-1.5">
            <span className="text-purple-200/40">{d.label}:</span>
            <span className="text-white font-bold text-right break-words max-w-[240px]">{d.value}</span>
          </div>
        ))}

        <div className="flex justify-between pt-1 font-bold text-sm text-cyan-400">
          <span>Total:</span>
          <span>₦{total.toLocaleString()}</span>
        </div>
      </div>

      {/* Wallet balance preview */}
      <div className={`p-3 rounded-xl border text-[11px] font-mono flex justify-between ${insufficient ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-emerald-500/5 border-emerald-500/15 text-emerald-300"}`}>
        <span>Wallet Balance:</span>
        <span className="font-bold">₦{walletBalance.toLocaleString()}{insufficient ? " — insufficient" : ""}</span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1 border-purple-500/25 text-white hover:bg-white/5 font-bold flex items-center justify-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Edit Details
        </Button>
        <Button onClick={onConfirm} isLoading={isSubmitting} disabled={insufficient} className="flex-1 bg-gradient-to-r from-purple-600 to-cyan-500 font-bold">
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
