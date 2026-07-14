import { useState } from "react";
import { 
  Wallet, ShoppingBag, DollarSign, Smartphone, TrendingUp, 
  FileText, Package, ArrowRight, ChevronRight, PlusCircle, Eye, EyeOff, Clock
} from "lucide-react";
import { Card, Button, Badge } from "../ui/shadcn";
import { Transaction, Order, NotificationItem } from "../../mockData";
import AnimatedBalance from "../wallet/AnimatedBalance";
import AccountStatusCard from "../dashboard/AccountStatusCard";
import DashboardProductStrips from "../dashboard/DashboardProductStrips";

interface DashboardHomeViewProps {
  walletBalance: number;
  transactions: Transaction[];
  orders: Order[];
  notifications: NotificationItem[];
  exchangeRate?: number;
  equivalentNaira?: number;
  lastUpdated?: string;
  onSelectSection: (section: string) => void;
  onOpenFundModal: () => void;
  isAdmin?: boolean;
  userName?: string | null;
  userEmail?: string;
  userPhone?: string;
}

export default function DashboardHomeView({
  walletBalance,
  transactions = [],
  orders = [],
  notifications = [],
  exchangeRate = 1623.50,
  equivalentNaira = 0,
  lastUpdated = "Just now",
  onSelectSection,
  onOpenFundModal,
  isAdmin = false,
  userName,
  userEmail,
  userPhone,
}: DashboardHomeViewProps) {
  const [expandedNotifIds, setExpandedNotifIds] = useState<Record<string, boolean>>({});
  const [balHidden, setBalHidden] = useState<boolean>(() => { try { return localStorage.getItem("avs_wallet_hidden") === "1"; } catch { return false; } });
  const toggleBalHidden = () => setBalHidden(h => { const n = !h; try { localStorage.setItem("avs_wallet_hidden", n ? "1" : "0"); } catch {} return n; });
  
  const txsList = transactions || [];
  const ordersList = orders || [];
  const notifsList = notifications || [];

  // Convert USD total spent to Naira if logged in as Admin, otherwise total spent is already in Naira
  const totalSpent = txsList
    .filter(t => t && t.type && t.type.toLowerCase() === "purchase" && t.status === "completed")
    .reduce((acc, curr) => acc + (curr.amount * (isAdmin ? exchangeRate : 1.0)), 0);

  // Use equivalent Naira balance directly for Admin so USD is never displayed
  const displayBalance = isAdmin ? equivalentNaira : walletBalance;

  return (
    <div className="space-y-8 text-left">

      {/* ——— HERO WALLET (primary feature at the very top) ——— */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-500/25 bg-gradient-to-br from-[#1b0f42] via-[#120a2e] to-[#0a0518] p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-16 -right-10 w-64 h-64 bg-purple-500/20 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-56 h-56 bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-purple-200/70 text-xs font-bold uppercase tracking-widest font-space">
              <Wallet className="h-4 w-4 text-purple-300" /> <span>Wallet Balance</span>
              <button onClick={toggleBalHidden} className="ml-1 p-1 rounded-lg text-purple-200/50 hover:text-white cursor-pointer" aria-label={balHidden ? "Show balance" : "Hide balance"}>
                {balHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <AnimatedBalance value={displayBalance} hidden={balHidden} className="block text-4xl sm:text-5xl font-black font-space text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-cyan-300 animate-balance-pop" />
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-purple-200/50">
              <span>Available Balance</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Updated {lastUpdated}</span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row gap-2">
            <Button size="lg" onClick={onOpenFundModal} className="flex items-center justify-center gap-2 text-sm px-8 py-4 shadow-lg shadow-purple-500/25">
              <PlusCircle className="h-5 w-5" /> <span>Add Money</span>
            </Button>
            <Button size="lg" variant="outline" onClick={() => onSelectSection("Wallet")} className="flex items-center justify-center gap-2 text-sm px-6 py-4">
              <span>Open Wallet</span> <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ——— TOP CARDS ——— */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        
        {/* Wallet Balance Card */}
        <Card hoverable className="p-5 group bg-gradient-to-br from-[#12092a] to-[#0c051a]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-200/60 uppercase tracking-wider font-space">Wallet Balance</span>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
              <span className="font-space font-bold text-xs">₦</span>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-purple-100 via-white to-cyan-200 truncate">
            ₦{displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between">
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              AVS Wallet Balance
            </span>
            <button
              onClick={onOpenFundModal}
              className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
            >
              <span>+ Deposit</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </Card>

        {/* Total Spent Card */}
        <Card hoverable className="p-5 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-200/60 uppercase tracking-wider font-space">Total Spent</span>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
              <span className="font-space font-bold text-xs">₦</span>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-white to-purple-200 truncate">
            ₦{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between">
            <span className="text-[10px] text-purple-200/40">Across all microservices</span>
            <button
              onClick={() => onSelectSection("Transactions")}
              className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
            >
              <span>History</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </Card>

        {/* Total Orders Card */}
        <Card hoverable className="p-5 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-200/60 uppercase tracking-wider font-space">System Orders</span>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-space text-white">
            {ordersList.length} <span className="text-sm font-normal text-purple-200/50">Orders</span>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between">
            <span className="text-[10px] text-purple-200/40">Last Synced: {lastUpdated}</span>
            <button
              onClick={() => onSelectSection("Orders")}
              className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
            >
              <span>View Logs</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </Card>
      </div>

      {/* ——— QUICK ACTIONS GRID ——— */}
      <Card className="space-y-5 border-purple-500/25 bg-gradient-to-r from-[#0d0720]/80 via-[#11092a]/90 to-[#0d0720]/80">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm md:text-base lg:text-lg font-bold text-white font-space tracking-tight">Quick Actions</h3>
            <p className="text-xs text-purple-200/60 mt-0.5">Rapid access to high-tier service execution rails</p>
          </div>
          <Badge variant="info">Lightning Channels</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Fund Wallet", icon: Wallet, action: onOpenFundModal, desc: "Deposit Naira/Crypto", primary: true },
            { label: "Buy SMS Number", icon: Smartphone, action: () => onSelectSection("SMS Panel"), desc: "Rent dedicated number" },
            { label: "Social Media Growth", icon: TrendingUp, action: () => onSelectSection("SMM Panel"), desc: "Expand social reach" },
            { label: "Marketplace", icon: ShoppingBag, action: () => onSelectSection("Marketplace"), desc: "Wholesale soft keys" },
          ].map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                key={idx}
                onClick={action.action}
                className={`p-4 rounded-xl border text-left transition-all duration-200 group flex flex-col justify-between min-h-[110px] cursor-pointer ${
                  action.primary
                    ? "bg-gradient-to-br from-purple-600 to-cyan-500 border-purple-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:brightness-110 active:scale-98"
                    : "bg-black/30 hover:bg-white/5 border-purple-500/15 hover:border-purple-500/35 text-purple-200 hover:text-white shadow-md active:scale-98"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${action.primary ? "bg-black/20 text-white" : "bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110"} transition-all`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className={`h-4 w-4 ${action.primary ? "text-white" : "text-purple-200/30 group-hover:text-purple-200 group-hover:translate-x-1"} transition-all`} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold font-space tracking-tight mt-3">{action.label}</h4>
                  <p className={`text-[10px] ${action.primary ? "text-purple-100/90" : "text-purple-200/50"} mt-0.5 line-clamp-1`}>{action.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ——— DISCOVERY: RECOMMENDED FOR YOU ——— */}
      <DashboardProductStrips
        onOpenProduct={() => onSelectSection("Marketplace")}
        onBrowse={() => onSelectSection("Marketplace")}
      />

      {/* ——— ACCOUNT/SECURITY + RECENT TRANSACTIONS & ORDERS ——— */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <AccountStatusCard
          userName={userName}
          userEmail={userEmail}
          userPhone={userPhone}
          isAdmin={isAdmin}
          onManageProfile={() => onSelectSection("Profile")}
          onManageSecurity={() => onSelectSection("Settings")}
        />
        <div className="lg:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        
        {/* Recent Transactions */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
            <div>
              <h3 className="text-sm md:text-base lg:text-lg font-bold text-white font-space tracking-tight">Recent Transactions</h3>
              <p className="text-xs text-purple-200/50 mt-0.5">Live unified financial ledger</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onSelectSection("Transactions")} className="text-xs text-purple-300">
              View all →
            </Button>
          </div>
          <div className="space-y-3">
            {txsList.slice(0, 5).map((t) => (
              <div key={t.id} className="p-3.5 rounded-xl bg-black/30 border border-purple-500/10 hover:bg-black/50 transition-colors flex items-center justify-between gap-4 font-inter">
                <div className="flex items-center gap-3 truncate">
                  <div className={`p-2 rounded-lg border shrink-0 ${
                    t.type && t.type.toLowerCase() === "deposit" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                    t.type && t.type.toLowerCase() === "refund" ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" :
                    "bg-purple-500/10 border-purple-500/20 text-purple-400"
                  }`}>
                    {t.type && t.type.toLowerCase() === "deposit" ? "+" : t.type && t.type.toLowerCase() === "refund" ? "↾" : "-"}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-white font-space truncate">{t.category}</div>
                    <div className="text-[10px] text-purple-200/50 truncate">{t.description}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xs font-bold font-space ${t.type && t.type.toLowerCase() === "deposit" ? "text-emerald-400" : t.type && t.type.toLowerCase() === "refund" ? "text-cyan-400" : "text-white"}`}>
                    {t.type && t.type.toLowerCase() === "deposit" ? "+" : t.type && t.type.toLowerCase() === "refund" ? "+" : "-"}₦{(t.amount * (isAdmin ? exchangeRate : 1.0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[9px] font-mono text-purple-200/40 mt-0.5">{t.date}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Orders */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
            <div>
              <h3 className="text-sm md:text-base lg:text-lg font-bold text-white font-space tracking-tight">Recent Orders</h3>
              <p className="text-xs text-purple-200/50 mt-0.5">Execution logs across modules</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onSelectSection("Orders")} className="text-xs text-purple-300">
              View all →
            </Button>
          </div>
          <div className="space-y-3">
            {ordersList.slice(0, 5).map((o) => (
              <div key={o.id} className="p-3.5 rounded-xl bg-black/30 border border-purple-500/10 hover:bg-black/50 transition-colors flex items-center justify-between gap-4 font-inter">
                <div className="flex items-center gap-3 truncate">
                  <Badge variant={
                    o.status === "completed" ? "success" :
                    o.status === "processing" ? "info" :
                    o.status === "failed" ? "danger" : "warning"
                  }>
                    {o.status}
                  </Badge>
                  <div className="truncate">
                    <div className="text-xs font-bold text-white font-space truncate">{o.service}</div>
                    <div className="text-[10px] text-purple-200/50 truncate">{o.details}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold font-space text-purple-100">₦{o.amount.toLocaleString()}</div>
                  <div className="text-[9px] font-mono text-purple-200/40 mt-0.5">{o.date}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        </div>
      </div>

      {/* ——— LATEST NOTIFICATIONS STRIP ——— */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
          <div>
            <h3 className="text-sm md:text-base lg:text-lg font-bold text-white font-space tracking-tight">Latest Notifications</h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Global broadcast alerts & API statuses</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onSelectSection("Notifications")} className="text-xs text-purple-300">
            View Notifications Center →
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notifsList.slice(0, 3).map((n) => {
            const isExpanded = !!expandedNotifIds[n.id];
            const isLong = n.message.length > 80;
            return (
              <div key={n.id} className="p-4 rounded-xl bg-black/30 border border-purple-500/15 flex flex-col justify-between space-y-3 group hover:border-purple-500/30 transition-all text-left">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-white font-space truncate">{n.title}</h4>
                    <span className="text-[9px] font-mono text-purple-200/40 shrink-0">{n.time}</span>
                  </div>
                  <p className="text-xs text-purple-200/60 mt-1.5 leading-relaxed font-inter break-words">
                    {isExpanded ? n.message : (isLong ? `${n.message.substring(0, 80)}...` : n.message)}
                  </p>
                  {isLong && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedNotifIds(prev => ({ ...prev, [n.id]: !isExpanded }));
                      }}
                      className="text-[10px] text-cyan-400 font-bold hover:underline mt-1 bg-transparent border-none p-0 cursor-pointer block"
                    >
                      {isExpanded ? "Show Less" : "Read More"}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-purple-500/10 text-[10px] text-purple-200/40 font-mono">
                  <span>Category: {n.type.toUpperCase()}</span>
                  {!n.read && <span className="text-cyan-400 font-bold">Unread</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}