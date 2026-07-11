import { Wallet, AlertTriangle } from "lucide-react";

// Compact wallet balance + remaining-after-purchase preview for checkout summaries.
// Purely presentational — respects the same wallet figures the checkout already uses.
export default function WalletBalancePreview({ balance, total, payMethod }: { balance: number; total: number; payMethod?: "wallet" | "flutterwave" }) {
  // Flutterwave is charged externally, so wallet isn't debited.
  if (payMethod === "flutterwave") return null;
  const remaining = balance - total;
  const insufficient = remaining < 0;
  return (
    <div className="rounded-xl border border-purple-500/15 bg-purple-950/15 p-3 space-y-1.5 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="text-purple-200/50 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Wallet balance</span>
        <span className="text-white font-bold">₦{balance.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between border-t border-purple-500/10 pt-1.5">
        <span className="text-purple-200/50">After purchase</span>
        <span className={`font-bold ${insufficient ? "text-red-400" : "text-emerald-400"}`}>₦{Math.max(0, remaining).toLocaleString()}</span>
      </div>
      {insufficient && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-300 pt-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Insufficient balance — add ₦{Math.abs(remaining).toLocaleString()} to your wallet.</span>
        </div>
      )}
    </div>
  );
}
