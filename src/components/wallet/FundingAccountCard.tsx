import { Landmark, Copy, Check, Building2 } from "lucide-react";
import { Button } from "../ui/shadcn";
import { copyToClipboard } from "../../utils/clipboard";
import { useState } from "react";
import { useToast } from "../ui/Toast";

export interface FundingAccount {
  accountName?: string;
  accountNumber?: string | null;
  bankName?: string;
  provider: string;         // "Monnify" | "Paga"
}

interface Props {
  account: FundingAccount;
  onGenerate?: () => void;   // when no account exists yet
  generating?: boolean;
}

// Premium reserved-account card with one-click copy for number & name + "Copied!" toast.
export default function FundingAccountCard({ account, onGenerate, generating }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"num" | "name" | "">("");

  const copy = async (val: string, which: "num" | "name") => {
    const ok = await copyToClipboard(val);
    if (ok) { setCopied(which); toast("Copied!", "success"); setTimeout(() => setCopied(""), 1600); }
  };

  if (!account.accountNumber) {
    return (
      <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#14092e]/80 to-[#0b0518]/90 p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300"><Building2 className="h-4 w-4" /></span>
          <div>
            <div className="text-sm font-bold font-space text-white">Bank Transfer · {account.provider}</div>
            <div className="text-[11px] text-purple-200/50">Get a permanent account for instant funding</div>
          </div>
        </div>
        {onGenerate && (
          <Button onClick={onGenerate} isLoading={generating} className="w-full">Generate My {account.provider} Account</Button>
        )}
      </div>
    );
  }

  const Row = ({ label, value, which }: { label: string; value: string; which?: "num" | "name" }) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-bold text-purple-200/40 font-space">{label}</div>
        <div className={`text-white font-semibold ${which === "num" ? "text-lg sm:text-xl font-black font-space tracking-wide select-all" : "text-sm truncate"}`}>{value}</div>
      </div>
      {which && (
        <button
          onClick={() => copy(value, which)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 hover:text-white hover:border-purple-400/40 transition-all cursor-pointer text-[11px] font-bold"
          aria-label={`Copy ${label}`}
        >
          {copied === which ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#14092e]/80 to-[#0b0518]/90 p-5 sm:p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="flex items-center gap-2.5 mb-1 relative z-10">
        <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300"><Landmark className="h-4 w-4" /></span>
        <div>
          <div className="text-sm font-bold font-space text-white">Bank Transfer</div>
          <div className="text-[11px] text-emerald-300/80 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Money sent here is credited automatically</div>
        </div>
      </div>
      <div className="divide-y divide-purple-500/10 relative z-10 mt-2">
        <Row label="Account Name" value={account.accountName || "—"} which="name" />
        <Row label="Account Number" value={account.accountNumber} which="num" />
        <Row label="Bank" value={account.bankName || account.provider} />
      </div>
    </div>
  );
}
