import { useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Card, Badge, Tabs } from "../ui/shadcn";
import { Transaction } from "../../mockData";

interface TransactionsViewProps {
  transactions: Transaction[];
}

export default function TransactionsView({ transactions = [] }: TransactionsViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filterTransactions = () => {
    let result = transactions || [];
    if (activeTab === "deposits") result = result.filter(t => t && t.type === "deposit");
    if (activeTab === "purchases") result = result.filter(t => t && t.type === "purchase");
    if (activeTab === "refunds") result = result.filter(t => t && t.type === "refund");

    if (searchQuery) {
      result = result.filter(t => 
        t && (
          t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }
    return result;
  };

  const filteredTx = filterTransactions();

  return (
    <div className="space-y-8">
      
      {/* ——— HEADER ——— */}
      <div>
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <RefreshCw className="h-4 w-4" />
          <span>Fintech Payment Ledger</span>
        </div>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold font-space text-white">Unified Transactions & Wallet History</h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Complete transparent audit trail of all financial movements inside your AUREVASHOP unified account. Filter by deposits, microservice purchases, and automated fallback refunds.
        </p>
      </div>

      {/* ——— MAIN CARD & TABS ——— */}
      <Card className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-purple-500/15 pb-4">
          <Tabs
            tabs={[
              { id: "all", label: "Wallet History", count: transactions.length },
              { id: "deposits", label: "Deposits", count: transactions.filter(t => t.type === "deposit").length },
              { id: "purchases", label: "Purchases", count: transactions.filter(t => t.type === "purchase").length },
              { id: "refunds", label: "Refunds", count: transactions.filter(t => t.type === "refund").length },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id)}
          />
          {/* Search Box */}
          <div className="relative w-full lg:max-w-xs shrink-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-purple-200/40">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Filter by ref code, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/40 border border-purple-500/20 rounded-xl text-xs sm:text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-inter"
            />
          </div>
        </div>

        {/* Desktop Data Table */}
        <div className="hidden md:block overflow-x-auto custom-scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-purple-500/15 text-[10px] font-bold text-purple-200/40 uppercase tracking-wider font-space">
                <th className="py-3 px-4">Transaction Details</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Ref Code</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10 text-xs sm:text-sm font-inter">
              {filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-purple-200/40 text-xs font-space">
                    No transactions found matching the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTx.map((t) => (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                    <td className="py-4 px-4">
                      <div className="font-bold text-white font-space group-hover:text-purple-200 transition-colors">{t.category}</div>
                      <div className="text-[11px] text-purple-200/60 truncate max-w-xs">{t.description}</div>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={t.type === "deposit" ? "success" : t.type === "refund" ? "info" : "default"}>
                        {t.type}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 font-mono text-purple-200/50 text-xs">
                      {t.reference}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.status === "completed" ? "text-emerald-400" : t.status === "processing" ? "text-cyan-400" : "text-red-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${t.status === "completed" ? "bg-emerald-500" : t.status === "processing" ? "bg-cyan-500 animate-pulse" : "bg-red-500"}`} />
                        <span>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-mono text-purple-200/50">
                      {t.date}
                    </td>
                    <td className="py-4 px-4 text-right font-space font-bold">
                      <span className={t.type === "deposit" ? "text-emerald-400" : t.type === "refund" ? "text-cyan-400" : "text-white"}>
                        {t.type === "deposit" ? "+" : t.type === "refund" ? "+" : "-"}₦{t.amount.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card Layout */}
        <div className="block md:hidden space-y-3">
          {filteredTx.length === 0 ? (
            <div className="text-center py-12 text-purple-200/40 text-xs font-space">
              No transactions found matching the current filter criteria.
            </div>
          ) : (
            filteredTx.map((t) => (
              <div key={t.id} className="p-4 rounded-xl border border-purple-500/10 bg-black/20 space-y-3 animate-float">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-bold text-white font-space text-sm">{t.category}</div>
                    <p className="text-xs text-purple-200/60 leading-relaxed font-inter mt-0.5">{t.description}</p>
                  </div>
                  <Badge variant={t.type === "deposit" ? "success" : t.type === "refund" ? "info" : "default"}>{t.type}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs border-t border-purple-500/5 pt-3">
                  <div>
                    <span className="text-purple-200/40 block font-bold uppercase text-[9px] tracking-wider font-space">Reference Code</span>
                    <span className="font-mono text-purple-200/60 select-all block break-all">{t.reference}</span>
                  </div>
                  <div>
                    <span className="text-purple-200/40 block font-bold uppercase text-[9px] tracking-wider font-space">Date</span>
                    <span className="text-purple-200/60 font-mono">{t.date}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center border-t border-purple-500/5 pt-2 text-xs">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.status === "completed" ? "text-emerald-400" : t.status === "processing" ? "text-cyan-400" : "text-red-400"}`}>
                    <span className={`h-1 w-1 rounded-full ${t.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
                  </span>
                  <span className={`font-space font-extrabold text-sm ${t.type === "deposit" ? "text-emerald-400" : t.type === "refund" ? "text-cyan-400" : "text-white"}`}>
                    {t.type === "deposit" ? "+" : t.type === "refund" ? "+" : "-"}₦{t.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-purple-500/10 text-xs text-purple-200/50">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            PCI-DSS Ledger Channels
          </span>
          <span>Showing {filteredTx.length} items</span>
        </div>
      </Card>
    </div>
  );
}