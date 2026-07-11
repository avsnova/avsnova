import { useState } from "react";
import { Package, Search, ShieldCheck, Eye } from "lucide-react";
import { Card, Tabs } from "../ui/shadcn";
import { Order } from "../../mockData";
import OrderStatusBadge from "../orders/OrderStatusBadge";
import OrderTimeline from "../orders/OrderTimeline";
import OrderDetailSheet, { type TrackedOrder } from "../orders/OrderDetailSheet";
import { orderStatusMeta, isInFlight } from "../orders/orderTracking";

interface OrdersViewProps {
  orders: Order[];
  userName?: string | null;
  userEmail?: string | null;
  onSelectSection?: (section: string) => void;
}

export default function OrdersView({ orders = [], userName, userEmail, onSelectSection }: OrdersViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<TrackedOrder | null>(null);

  const filterOrders = () => {
    let result = orders || [];
    if (activeTab !== "all") {
      result = result.filter((o) => {
        if (!o) return false;
        const meta = orderStatusMeta(o.status);
        if (activeTab === "processing") return isInFlight(meta);
        if (activeTab === "completed") return meta.key === "delivered";
        if (activeTab === "failed") return meta.key === "failed" || meta.key === "cancelled";
        if (activeTab === "refunded") return meta.key === "refunded";
        return true;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => o && (o.service.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.details.toLowerCase().includes(q)));
    }
    return result;
  };

  const filteredOrders = filterOrders();

  const toTracked = (o: Order): TrackedOrder => ({
    id: o.id, name: o.service, category: o.category, amount: o.amount, status: o.status,
    details: o.details, createdAt: o.date,
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <Package className="h-4 w-4" /> <span>Unified Logistics & Tracking</span>
        </div>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold font-space text-white">All Orders & Tracking</h2>
        <p className="text-xs md:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Real-time tracking across every Aurevashop module — one consistent, premium order experience.
        </p>
      </div>

      <Card className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-purple-500/15 pb-4">
          <Tabs
            tabs={[
              { id: "all", label: "All", count: orders.length },
              { id: "processing", label: "In Progress", count: orders.filter((o) => isInFlight(orderStatusMeta(o.status))).length },
              { id: "completed", label: "Completed", count: orders.filter((o) => orderStatusMeta(o.status).key === "delivered").length },
              { id: "failed", label: "Failed", count: orders.filter((o) => ["failed", "cancelled"].includes(orderStatusMeta(o.status).key)).length },
              { id: "refunded", label: "Refunded", count: orders.filter((o) => orderStatusMeta(o.status).key === "refunded").length },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id)}
          />
          <div className="relative w-full lg:max-w-xs shrink-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-purple-200/40"><Search className="h-4 w-4" /></span>
            <input type="text" placeholder="Search by service or ID…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/40 border border-purple-500/20 rounded-xl text-xs sm:text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 transition-all" />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-14 text-purple-200/40 text-xs">No orders found for this filter.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredOrders.map((o) => (
              <button key={o.id} onClick={() => setSelected(toTracked(o))}
                className="text-left rounded-2xl border border-purple-500/12 bg-black/25 p-4 hover:border-purple-500/30 transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-bold text-cyan-400">{o.id}</div>
                    <div className="font-bold text-white font-space text-sm mt-0.5 line-clamp-1 group-hover:text-purple-100">{o.service}</div>
                    <div className="text-[10px] text-purple-200/40 mt-0.5">{o.category} · {o.date}</div>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="mt-3.5"><OrderTimeline status={o.status} /></div>
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-purple-500/10">
                  <span className="font-space font-bold text-white text-sm">₦{o.amount.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-300 group-hover:text-white"><Eye className="h-3.5 w-3.5" /> Track order</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-purple-500/10 text-xs text-purple-200/50">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold"><ShieldCheck className="h-4 w-4" /> Immutable Ledger History</span>
          <span>Showing {filteredOrders.length} orders</span>
        </div>
      </Card>

      {selected && (
        <OrderDetailSheet
          order={selected} userName={userName} userId={userEmail}
          onClose={() => setSelected(null)}
          onNavigate={(s) => { setSelected(null); onSelectSection?.(s); }}
        />
      )}
    </div>
  );
}
