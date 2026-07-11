import { useState, useEffect } from "react";
import {
  Wallet, PlusCircle, ArrowUpRight, ArrowDownRight, RefreshCw, ShieldCheck,
  Eye, EyeOff, Gift, RotateCcw, ShoppingBag, Smartphone, TrendingUp, Clock, CheckCircle2, Zap,
} from "lucide-react";
import { Card, Button, Skeleton } from "../ui/shadcn";
import { Transaction } from "../../mockData";
import { apiFetch } from "../../utils/api";
import { useToast } from "../ui/Toast";
import AnimatedBalance from "../wallet/AnimatedBalance";
import FundingAccountCard from "../wallet/FundingAccountCard";
import { reconcileMonnifyPayments } from "../../utils/monnify";
import { reconcileFlutterwavePayments } from "../../utils/flutterwave";

interface WalletViewProps {
  walletBalance: number;
  transactions: Transaction[];
  onOpenFundModal: () => void;
  onRefreshLedger?: () => void;
  onSelectSection?: (section: string) => void;
  lastUpdated?: string;
}

const HIDE_KEY = "avs_wallet_hidden";

export default function WalletView({ walletBalance, transactions, onOpenFundModal, onRefreshLedger, onSelectSection, lastUpdated = "Just now" }: WalletViewProps) {
  const { toast } = useToast();
  const [hidden, setHidden] = useState<boolean>(() => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reserved accounts (provider-agnostic display)
  const [monnify, setMonnify] = useState<any>(null);
  const [monnifyEnabled, setMonnifyEnabled] = useState(false);
  const [paga, setPaga] = useState<any>(null);
  const [pagaEnabled, setPagaEnabled] = useState(false);
  const [settingUp, setSettingUp] = useState("");
  const [systemOnline, setSystemOnline] = useState(true);

  const toggleHidden = () => setHidden(h => { const n = !h; try { localStorage.setItem(HIDE_KEY, n ? "1" : "0"); } catch {} return n; });

  const loadAccounts = async () => {
    try {
      const pm = await apiFetch("/api/payment-methods");
      setSystemOnline(!!(pm && pm.success));
      if (pm) {
        setMonnifyEnabled(!!pm.monnify);
        setPagaEnabled(!!pm.paga);
        if (pm.monnify) { try { const a = await apiFetch("/api/monnify/reserved-account"); if (a && a.success) setMonnify(a); } catch {} }
        if (pm.paga) { try { const p = await apiFetch("/api/profile/paga"); if (p && p.success) setPaga(p); } catch {} }
      }
    } catch { setSystemOnline(false); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, []);

  // Auto-refresh: reconcile pending gateway deposits + refresh ledger every 12s while open.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      // Skip while the tab is hidden to avoid background churn / UI stalls on return.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const [m, f] = await Promise.all([reconcileMonnifyPayments(), reconcileFlutterwavePayments()]);
        if (!stopped && ((m.credited || 0) + (f.credited || 0)) > 0) {
          if (onRefreshLedger) onRefreshLedger();
          toast("🎉 Payment confirmed and added to your wallet.", "success", { big: true });
        }
      } catch {}
    };
    const timer = setInterval(poll, 12000);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([reconcileMonnifyPayments(), reconcileFlutterwavePayments()]).catch(() => {});
      if (onRefreshLedger) await onRefreshLedger();
      toast("Wallet refreshed.", "success");
    } finally { setRefreshing(false); }
  };

  const setupMonnify = async () => {
    setSettingUp("monnify");
    try { const a = await apiFetch("/api/monnify/reserved-account/setup", { method: "POST", body: JSON.stringify({}) }); if (a && a.success) { setMonnify(a); toast("Monnify account ready!", "success"); } }
    catch (e: any) { toast(e.message || "Setup failed", "error"); } finally { setSettingUp(""); }
  };
  const setupPaga = async () => {
    setSettingUp("paga");
    try { await apiFetch("/api/profile/paga/setup", { method: "POST" }); const p = await apiFetch("/api/profile/paga"); if (p && p.success) { setPaga(p); toast("Paga account ready!", "success"); } }
    catch (e: any) { toast(e.message || "Setup failed", "error"); } finally { setSettingUp(""); }
  };

  const deposits = transactions.filter(t => t.type && t.type.toLowerCase() === "deposit");
  const totalIn = deposits.reduce((a, c) => a + c.amount, 0);
  const totalOut = transactions.filter(t => t.type && t.type.toLowerCase() === "purchase").reduce((a, c) => a + c.amount, 0);
  const recent = transactions.slice(0, 6);
  const pendingCount = transactions.filter(t => t.status === "processing").length;

  const txIcon = (t: Transaction) => {
    const type = (t.type || "").toLowerCase();
    if (type === "deposit") return <ArrowUpRight className="h-4 w-4 text-emerald-400" />;
    if (type === "refund") return <RotateCcw className="h-4 w-4 text-cyan-400" />;
    if ((t.category || "").toLowerCase().includes("gift")) return <Gift className="h-4 w-4 text-pink-400" />;
    return <ArrowDownRight className="h-4 w-4 text-purple-300" />;
  };
  const signed = (t: Transaction) => {
    const type = (t.type || "").toLowerCase();
    const pos = type === "deposit" || type === "refund";
    return `${pos ? "+" : "-"}₦${t.amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-6 text-left font-inter">

      {/* ——— HERO WALLET ——— */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-500/25 bg-gradient-to-br from-[#1b0f42] via-[#120a2e] to-[#0a0518] p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-16 -right-10 w-64 h-64 bg-purple-500/20 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-purple-200/70 text-xs font-bold uppercase tracking-widest font-space">
              <Wallet className="h-4 w-4 text-purple-300" /> <span>Wallet Balance</span>
              <button onClick={toggleHidden} className="ml-1 p-1 rounded-lg text-purple-200/50 hover:text-white cursor-pointer" aria-label={hidden ? "Show balance" : "Hide balance"}>
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {loading ? (
              <Skeleton className="h-12 w-64" />
            ) : (
              <AnimatedBalance value={walletBalance} hidden={hidden} className="block text-4xl sm:text-5xl font-black font-space text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-cyan-300 animate-balance-pop" />
            )}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-purple-200/50">
              <span>Available Balance</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Updated {lastUpdated}</span>
              <button onClick={manualRefresh} className="flex items-center gap-1 text-purple-300 hover:text-white cursor-pointer">
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>
          <div className="shrink-0">
            <Button size="lg" onClick={onOpenFundModal} className="w-full lg:w-auto flex items-center justify-center gap-2 text-sm px-8 py-4 shadow-lg shadow-purple-500/25">
              <PlusCircle className="h-5 w-5" /> <span>Add Money</span>
            </Button>
          </div>
        </div>

        {/* Quick metrics */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          <div className="p-3 rounded-2xl bg-black/30 border border-purple-500/15">
            <span className="text-[10px] text-purple-200/50 uppercase font-bold font-space block">Total Loaded</span>
            <span className="text-sm font-bold font-space text-emerald-400">{hidden ? "•••" : `₦${totalIn.toLocaleString()}`}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/30 border border-purple-500/15">
            <span className="text-[10px] text-purple-200/50 uppercase font-bold font-space block">Total Spent</span>
            <span className="text-sm font-bold font-space text-purple-100">{hidden ? "•••" : `₦${totalOut.toLocaleString()}`}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/30 border border-purple-500/15 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-purple-200/50 uppercase font-bold font-space block">Transactions</span>
            <span className="text-sm font-bold font-space text-cyan-400">{transactions.length}</span>
          </div>
        </div>
      </div>

      {/* ——— FUNDING ACCOUNTS ——— */}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (monnifyEnabled || pagaEnabled) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {monnifyEnabled && (
            <FundingAccountCard
              account={{ provider: "Monnify", accountNumber: monnify?.accountNumber, accountName: monnify?.accountName, bankName: monnify?.bankName }}
              onGenerate={setupMonnify} generating={settingUp === "monnify"}
            />
          )}
          {pagaEnabled && (
            <FundingAccountCard
              account={{ provider: "Paga", accountNumber: paga?.accountNumber, accountName: paga?.accountName, bankName: "Paga" }}
              onGenerate={setupPaga} generating={settingUp === "paga"}
            />
          )}
        </div>
      ) : null}

      {/* ——— WALLET STATUS ——— */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div><div className="text-xs font-bold font-space text-white">{(monnify?.accountNumber || paga?.accountNumber) ? "Reserved Account Active" : "Instant Funding Ready"}</div><div className="text-[10px] text-purple-200/50">Automatic credit enabled</div></div>
        </div>
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-purple-500/15 bg-purple-500/5">
          <Zap className={`h-5 w-5 shrink-0 ${systemOnline ? "text-emerald-400" : "text-amber-400"}`} />
          <div><div className="text-xs font-bold font-space text-white">Payment System {systemOnline ? "Online" : "Offline"}</div><div className="text-[10px] text-purple-200/50">All providers monitored</div></div>
        </div>
        <div className={`flex items-center gap-2.5 p-3.5 rounded-2xl border ${pendingCount > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-purple-500/15 bg-purple-500/5"}`}>
          {pendingCount > 0 ? <RefreshCw className="h-5 w-5 text-amber-400 animate-spin shrink-0" /> : <ShieldCheck className="h-5 w-5 text-cyan-400 shrink-0" />}
          <div><div className="text-xs font-bold font-space text-white">{pendingCount > 0 ? "Waiting for confirmation…" : "No pending payments"}</div><div className="text-[10px] text-purple-200/50">{pendingCount > 0 ? `${pendingCount} in progress` : "You're all caught up"}</div></div>
        </div>
      </div>

      {/* ——— MARKETPLACE SHORTCUTS ——— */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Marketplace", icon: <ShoppingBag className="h-5 w-5" />, section: "Marketplace" },
          { label: "SMS Panel", icon: <Smartphone className="h-5 w-5" />, section: "SMS Panel" },
          { label: "SMM Panel", icon: <TrendingUp className="h-5 w-5" />, section: "SMM Panel" },
          { label: "My Gift Orders", icon: <Gift className="h-5 w-5" />, section: "My Gift Orders" },
        ].map(s => (
          <button key={s.label} onClick={() => onSelectSection && onSelectSection(s.section)}
            className="group flex flex-col items-start gap-2 p-4 rounded-2xl border border-purple-500/15 bg-[#0d081e]/80 hover:border-purple-500/35 hover:-translate-y-0.5 transition-all cursor-pointer">
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 group-hover:text-cyan-300 transition-colors">{s.icon}</span>
            <span className="text-xs font-bold font-space text-white">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ——— RECENT TRANSACTIONS ——— */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white font-space">Recent Transactions</h3>
            <p className="text-[11px] text-purple-200/50 mt-0.5">Funding, purchases, bonuses & refunds</p>
          </div>
          <button onClick={() => onSelectSection && onSelectSection("Transactions")} className="text-xs font-bold text-purple-300 hover:text-white cursor-pointer">View All</button>
        </div>
        {loading ? (
          <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : recent.length === 0 ? (
          <div className="py-10 text-center text-purple-200/40 text-sm italic">No transactions yet. Add money to get started.</div>
        ) : (
          <div className="space-y-2">
            {recent.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors">
                <span className="p-2.5 rounded-xl bg-black/40 border border-purple-500/15 shrink-0">{txIcon(t)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold font-space text-white truncate">{t.category}</div>
                  <div className="text-[11px] text-purple-200/50 truncate">{t.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold font-space ${(t.type||"").toLowerCase()==="deposit" ? "text-emerald-400" : (t.type||"").toLowerCase()==="refund" ? "text-cyan-400" : "text-white"}`}>{signed(t)}</div>
                  <div className="flex items-center gap-1 justify-end text-[10px] text-purple-200/40">
                    <span className={`h-1.5 w-1.5 rounded-full ${t.status === "completed" ? "bg-emerald-500" : t.status === "processing" ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
                    <span>{t.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
