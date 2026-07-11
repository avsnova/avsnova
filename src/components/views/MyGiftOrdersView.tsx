import { useState, useEffect } from "react";
import { Gift, Search, RefreshCw, MapPin, RotateCcw, Package } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import OrderStatusBadge from "../orders/OrderStatusBadge";
import OrderDetailSheet, { type TrackedOrder } from "../orders/OrderDetailSheet";

interface MyGiftOrdersViewProps {
  onGoToGiftStore?: () => void; // navigate to Marketplace → Gift tab
  userName?: string | null;
  userEmail?: string | null;
  onSelectSection?: (section: string) => void;
}

// Dedicated user dashboard view: shows ONLY gift-delivery orders (never mixed with
// normal marketplace/SMS/SMM orders). Gift orders are identified by product_id "gift_*".
export default function MyGiftOrdersView({ onGoToGiftStore, userName, userEmail, onSelectSection }: MyGiftOrdersViewProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tracked, setTracked] = useState<TrackedOrder | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/orders");
      const gifts = (data || []).filter(
        (o: any) => (o.category === "Marketplace" || o.category === "Gifts") && String(o.product_id || "").startsWith("gift")
      );
      setOrders(gifts);
    } catch (e) {
      console.error("Failed to load gift orders:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const parseShip = (o: any) => {
    try { if (o.target_link && (o.target_link.startsWith("{") || o.target_link.startsWith("["))) return JSON.parse(o.target_link); } catch {}
    return null;
  };

  const filtered = orders.filter(o =>
    !q || o.name?.toLowerCase().includes(q.toLowerCase()) || o.id?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-8 font-inter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-pink-500/20 bg-gradient-to-br from-[#2a0f2e]/70 to-[#0a0418]/95 p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-pink-300 font-semibold text-xs uppercase tracking-widest mb-1.5 font-space">
              <Gift className="h-4 w-4" /> <span>Your Gifting History</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-space text-white">🎁 My Gift Orders</h2>
            <p className="text-xs sm:text-sm text-purple-200/60 mt-1.5 max-w-xl">Track and reorder your international gift deliveries. Kept separate from your other orders.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={load} size="md" className="flex items-center gap-1.5"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span>Refresh</span></Button>
            {onGoToGiftStore && <Button onClick={onGoToGiftStore} size="md" className="bg-gradient-to-r from-pink-600 to-purple-500 flex items-center gap-1.5"><Gift className="h-4 w-4" /><span>Browse Gift Store</span></Button>}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-purple-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gift orders..." className="w-full bg-black/40 border border-purple-500/20 text-xs sm:text-sm text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-pink-500 placeholder-purple-200/30" />
      </div>

      {loading ? (
        <div className="text-center py-20"><RefreshCw className="h-8 w-8 text-pink-400 animate-spin mx-auto" /><p className="text-xs text-purple-200/50 mt-3">Loading gift orders…</p></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Gift className="h-12 w-12 text-pink-500/30 mx-auto mb-3" />
          <p className="text-sm text-purple-200/50">No gift orders yet.</p>
          {onGoToGiftStore && <Button onClick={onGoToGiftStore} className="mt-4 bg-gradient-to-r from-pink-600 to-purple-500">Browse Gift Store</Button>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((o) => {
            const ship = parseShip(o);
            return (
              <Card key={o.id} className="p-5 space-y-3 border-purple-500/15 hover:border-pink-500/30 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl shrink-0">🎁</span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-sm truncate">{o.name}</h3>
                      <span className="text-[10px] text-purple-200/40 font-mono">Ref: {o.id}</span>
                    </div>
                  </div>
                  <OrderStatusBadge status={o.status} hasCredentials={!!o.custom_credentials} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-purple-200/60 font-mono">
                  <div>Qty: <span className="text-white">{o.quantity || 1}</span></div>
                  <div>Total: <span className="text-emerald-400 font-bold">₦{Number(o.price || 0).toLocaleString()}</span></div>
                  <div>Placed: <span className="text-white">{o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}</span></div>
                  {o.tracking_number && o.tracking_number !== "AVS-SHP-PENDING" && <div>Tracking: <span className="text-cyan-400">{o.tracking_number}</span></div>}
                </div>
                {ship && (
                  <div className="p-2.5 rounded-xl bg-black/30 border border-purple-500/5 text-[10px] text-purple-200/70 font-mono space-y-0.5">
                    <div className="flex items-center gap-1 text-pink-300 font-bold uppercase text-[9px] mb-1"><MapPin className="h-3 w-3" /> Delivery</div>
                    {ship.receiverName && <div>To: <span className="text-white">{ship.receiverName}</span></div>}
                    {(ship.city || ship.country) && <div>{ship.city ? ship.city + ", " : ""}{ship.country}</div>}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setTracked({ id: o.id, name: o.name, category: "Gifts", quantity: o.quantity, price: Number(o.price || 0), status: o.status, createdAt: o.created_at, credentials: o.custom_credentials })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-200 hover:text-white hover:border-pink-500/30 transition-all cursor-pointer">
                    <Package className="h-3.5 w-3.5" /> Track
                  </button>
                  {onGoToGiftStore && (
                    <button onClick={onGoToGiftStore} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-200 hover:text-white hover:border-pink-500/30 transition-all cursor-pointer">
                      <RotateCcw className="h-3.5 w-3.5" /> Reorder
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tracked && (
        <OrderDetailSheet order={tracked} userName={userName} userId={userEmail}
          onClose={() => setTracked(null)}
          onNavigate={(s) => { setTracked(null); onSelectSection?.(s); }}
          onBuyAgain={onGoToGiftStore ? () => { setTracked(null); onGoToGiftStore(); } : undefined}
        />
      )}
    </div>
  );
}
