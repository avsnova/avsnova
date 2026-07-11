import { useState, useEffect, type ReactElement } from "react";
import { ArrowRight, ArrowLeft, RefreshCw, CheckCircle2, Ticket, CreditCard, Landmark, Zap, Building2, X, Copy, Check } from "lucide-react";
import { Button } from "../ui/shadcn";
import { Transaction } from "../../mockData";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { useToast } from "../ui/Toast";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";
import { startFlutterwavePayment, loadFlutterwaveSdk } from "../../utils/flutterwave";
import { getMonnifyReservedAccount, setupMonnifyReservedAccount, startMonnifyCheckout } from "../../utils/monnify";

type Method = "monnify" | "paystack" | "flutterwave" | "paga" | "recharge";
const LAST_METHOD_KEY = "avs_last_pay_method";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFundSuccess: (amount: number, tx: Transaction) => void;
  paystackPublicKey?: string;
  userEmail?: string;
}

interface ProviderMeta { id: Method; name: string; tags: string[]; icon: ReactElement; on: boolean; }

// Unified, premium 2-step Add Money flow (amount → provider) as a bottom-sheet on mobile and a
// centered modal on desktop. Reuses the existing provider backends — provider-agnostic.
export default function AddMoneySheet({ isOpen, onClose, onFundSuccess, paystackPublicKey, userEmail }: Props) {
  const { toast } = useToast();
  useBodyScrollLock(isOpen);

  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("5000");
  const [method, setMethod] = useState<Method>("monnify");
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [active, setActive] = useState({ paystack: false, paga: false, rechargeCode: false, flutterwave: false, monnify: false });
  const [pagaAccount, setPagaAccount] = useState<any>(null);
  const [monnifyAccount, setMonnifyAccount] = useState<any>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(1); setBusy(false);
    (async () => {
      setLoaded(false);
      try {
        const res = await apiFetch("/api/payment-methods");
        if (res && res.success) {
          const a = { paystack: !!res.paystack, paga: !!res.paga, rechargeCode: !!res.rechargeCode, flutterwave: !!res.flutterwave, monnify: !!res.monnify };
          setActive(a);
          if (a.flutterwave) loadFlutterwaveSdk();
          // Preselect last-used method if still active, else first active.
          let last = "";
          try { last = localStorage.getItem(LAST_METHOD_KEY) || ""; } catch {}
          const order: Method[] = ["monnify", "paystack", "flutterwave", "paga", "recharge"];
          const isOn = (m: Method) => (m === "recharge" ? a.rechargeCode : (a as any)[m]);
          const pick = (last && isOn(last as Method)) ? (last as Method) : (order.find(isOn) || "paystack");
          setMethod(pick);
        }
      } catch {}
      try { const pg = await apiFetch("/api/profile/paga"); if (pg && pg.success) setPagaAccount(pg); } catch {}
      try { const mn = await getMonnifyReservedAccount(); if (mn && mn.accountNumber) setMonnifyAccount(mn); } catch {}
      // Load Paystack SDK
      if (typeof window !== "undefined" && !(window as any).PaystackPop) {
        const s = document.createElement("script"); s.src = "https://js.paystack.co/v1/inline.js"; s.async = true; document.body.appendChild(s);
      }
      setLoaded(true);
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const providers: ProviderMeta[] = [
    { id: "monnify", name: "Monnify", tags: ["Reserved Account", "Automatic credit"], icon: <Building2 className="h-5 w-5" />, on: active.monnify },
    { id: "paystack", name: "Paystack", tags: ["Card", "Bank", "USSD", "Transfer"], icon: <CreditCard className="h-5 w-5" />, on: active.paystack },
    { id: "flutterwave", name: "Flutterwave", tags: ["Card", "Transfer", "USSD", "Mobile Money"], icon: <Zap className="h-5 w-5" />, on: active.flutterwave },
    { id: "paga", name: "Paga", tags: ["Wallet", "Transfer"], icon: <Landmark className="h-5 w-5" />, on: active.paga },
    { id: "recharge", name: "Recharge Code", tags: ["AVS voucher"], icon: <Ticket className="h-5 w-5" />, on: active.rechargeCode },
  ];
  const visible = providers.filter(p => p.on);

  const amt = parseFloat(amount) || 0;
  const rememberMethod = (m: Method) => { try { localStorage.setItem(LAST_METHOD_KEY, m); } catch {} };

  const finishSuccess = (creditedAmount: number, category: string, reference = "") => {
    const tx: Transaction = { id: `TX-${Math.floor(9000 + Math.random() * 1000)}`, type: "deposit", category, amount: creditedAmount, status: "completed", date: "Just now", description: `Wallet deposit via ${category}`, reference };
    onFundSuccess(creditedAmount, tx);
    setBusy(false);
    onClose();
  };

  const pay = async () => {
    rememberMethod(method);
    // Recharge code doesn't need an amount.
    if (method === "recharge") {
      if (!promo.trim()) { toast("Enter a recharge code.", "error"); return; }
      setBusy(true);
      try {
        const res = await apiFetch("/api/wallet/promo-code", { method: "POST", body: JSON.stringify({ promoCode: promo }) });
        if (res.success) { toast(`🎉 ₦${Number(res.amount).toLocaleString()} added successfully.`, "success", { big: true }); finishSuccess(res.amount, "Recharge Code", res.reference); }
        else throw new Error(res.error || "Invalid code.");
      } catch (e: any) { toast(e.message, "error"); setBusy(false); }
      return;
    }

    if (isNaN(amt) || amt < 100) { toast("Minimum amount is ₦100.", "error"); return; }
    setBusy(true);

    try {
      if (method === "paystack") {
        const key = paystackPublicKey || "";
        if (!(window as any).PaystackPop) throw new Error("Paystack is still loading, try again.");
        const handler = (window as any).PaystackPop.setup({
          key, email: userEmail || "customer@aurevashop.org", amount: Math.round(amt * 100), currency: "NGN",
          callback: (resp: any) => {
            apiFetch(`/api/paystack/verify/${resp.reference}`).then((v: any) => {
              if (v.success) { toast(`🎉 ₦${amt.toLocaleString()} added successfully.`, "success", { big: true }); finishSuccess(amt, "Paystack", resp.reference); }
              else { toast("Verification failed.", "error"); setBusy(false); }
            }).catch((e: any) => { toast(e.message, "error"); setBusy(false); });
          },
          onClose: () => { toast("Payment cancelled.", "info"); setBusy(false); },
        });
        handler.openIframe();
      } else if (method === "flutterwave") {
        const r = await startFlutterwavePayment({ purpose: "wallet", amount: amt, customerEmail: userEmail, title: "Fund AVS Wallet", description: `Wallet top-up of ₦${amt.toLocaleString()}` });
        if (r.success) { toast(`🎉 ₦${amt.toLocaleString()} added successfully.`, "success", { big: true }); finishSuccess(amt, "Flutterwave"); }
        else if (r.status === "cancelled") { toast("Payment cancelled.", "info"); setBusy(false); }
        else throw new Error(r.error || "Payment failed.");
      } else if (method === "monnify") {
        const r = await startMonnifyCheckout(amt);
        if (r.success) { toast(`🎉 ₦${amt.toLocaleString()} added successfully.`, "success", { big: true }); finishSuccess(amt, "Monnify"); }
        else if (r.status === "pending") { toast(r.error || "Complete payment — your wallet will update once confirmed.", "info"); setBusy(false); onClose(); }
        else throw new Error(r.error || "Payment failed.");
      }
    } catch (e: any) { toast(e.message, "error"); setBusy(false); }
  };

  // Providers that are transfer/account-based show the reserved account instead of a pay button.
  const accountForMethod = method === "monnify" ? monnifyAccount : method === "paga" ? (pagaAccount?.accountNumber ? { accountNumber: pagaAccount.accountNumber, accountName: pagaAccount.accountName, bankName: "Paga" } : null) : null;
  const isAccountMethod = method === "monnify" || method === "paga";

  const copy = async (v: string) => { const ok = await copyToClipboard(v); if (ok) { setCopied(v); toast("Copied!", "success"); setTimeout(() => setCopied(""), 1500); } };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full sm:max-w-md bg-[#0c0620] border border-purple-500/25 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto custom-scrollbar-thin animate-sheet-up">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-purple-500/15 bg-[#0c0620]/95 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            {step === 2 && <button onClick={() => setStep(1)} className="p-1 rounded-lg text-purple-200/60 hover:text-white cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>}
            <h3 className="text-base font-bold font-space text-white">{step === 1 ? "Add Money" : "Choose Payment Method"}</h3>
          </div>
          <button onClick={() => !busy && onClose()} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {!loaded ? (
            <div className="py-10 text-center text-purple-200/50 text-sm"><RefreshCw className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
          ) : visible.length === 0 ? (
            <div className="py-8 text-center text-amber-400 text-sm bg-amber-500/5 border border-amber-500/20 rounded-2xl">No payment methods are active. Please contact support.</div>
          ) : step === 1 ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-purple-200/70 font-space">Enter Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-purple-300 font-space">₦</span>
                  <input
                    type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full bg-black/40 border border-purple-500/25 rounded-2xl pl-11 pr-4 py-4 text-2xl font-black font-space text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {["1000", "2000", "5000", "10000", "20000"].map(p => (
                    <button key={p} type="button" onClick={() => setAmount(p)} className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold font-space cursor-pointer transition-all ${amount === p ? "bg-purple-600 border-purple-500 text-white" : "bg-purple-500/10 border-purple-500/20 text-purple-300 hover:text-white"}`}>+₦{parseFloat(p).toLocaleString()}</button>
                  ))}
                </div>
              </div>
              <Button size="lg" className="w-full flex items-center justify-center gap-2" onClick={() => setStep(2)}>Continue <ArrowRight className="h-4 w-4" /></Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2.5">
                {visible.map(p => (
                  <button
                    key={p.id} type="button" onClick={() => setMethod(p.id)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${method === p.id ? "bg-purple-500/15 border-purple-500 shadow-lg shadow-purple-500/10" : "bg-black/30 border-purple-500/15 hover:border-purple-500/30"}`}
                  >
                    <span className={`p-2.5 rounded-xl shrink-0 ${method === p.id ? "bg-purple-500/25 text-cyan-300" : "bg-purple-500/10 text-purple-300"}`}>{p.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold font-space text-white">{p.name}</span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        {p.tags.map(t => <span key={t} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-purple-200/60">{t}</span>)}
                      </span>
                    </span>
                    {method === p.id && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Recharge code input */}
              {method === "recharge" && (
                <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Enter recharge code (AVS-XXXX)" className="w-full bg-black/40 border border-purple-500/25 rounded-2xl px-4 py-3 text-sm font-space font-bold text-white focus:outline-none focus:border-purple-500" />
              )}

              {/* Account-based providers: show reserved account, no redirect */}
              {isAccountMethod && (
                accountForMethod?.accountNumber ? (
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-1">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-purple-200/40 font-space">Transfer ₦{amt.toLocaleString()} to</div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xl font-black font-space text-white select-all">{accountForMethod.accountNumber}</div>
                        <div className="text-[11px] text-purple-200/60">{accountForMethod.accountName} · <span className="text-cyan-400 font-bold">{accountForMethod.bankName}</span></div>
                      </div>
                      <button onClick={() => copy(accountForMethod.accountNumber)} className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 hover:text-white cursor-pointer">
                        {copied === accountForMethod.accountNumber ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-emerald-300/80 pt-1">Credited automatically once your transfer is confirmed.</p>
                  </div>
                ) : (
                  <Button className="w-full" isLoading={busy} onClick={async () => {
                    setBusy(true);
                    try {
                      if (method === "monnify") { const a = await setupMonnifyReservedAccount(); setMonnifyAccount(a); }
                      else { await apiFetch("/api/profile/paga/setup", { method: "POST" }); const pg = await apiFetch("/api/profile/paga"); setPagaAccount(pg); }
                      toast("Account ready!", "success");
                    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
                  }}>Generate My {method === "monnify" ? "Monnify" : "Paga"} Account</Button>
                )
              )}

              {/* Card/checkout providers OR recharge: action button */}
              {(!isAccountMethod) && (
                <Button size="lg" className="w-full flex items-center justify-center gap-2" isLoading={busy} onClick={pay}>
                  {method === "recharge" ? "Redeem Code" : `Pay ₦${amt.toLocaleString()} via ${visible.find(v => v.id === method)?.name}`}
                </Button>
              )}
              {/* Monnify also supports card checkout in addition to the reserved account */}
              {method === "monnify" && accountForMethod?.accountNumber && (
                <Button size="lg" variant="outline" className="w-full" isLoading={busy} onClick={pay}>Or pay ₦{amt.toLocaleString()} by card</Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
