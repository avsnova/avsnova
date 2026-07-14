import { useState, useEffect, useMemo } from "react";
import { Key, Eye, FileText, ChevronUp, ChevronDown, Copy, X, QrCode, Search, Package, CheckCircle2 } from "lucide-react";
import { Card, Badge, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import SecurityCenter from "../orders/SecurityCenter";
import OrderStatusBadge from "../orders/OrderStatusBadge";
import OrderDetailSheet, { type TrackedOrder } from "../orders/OrderDetailSheet";
import { orderStatusMeta, isInFlight } from "../orders/orderTracking";

interface Order {
  id: string;
  product_id: string;
  category: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  custom_credentials?: string;
  tracking_number?: string;
  esim_qr_code?: string;
  esim_activation_code?: string;
  esim_instructions?: string;
  esim_expiry?: string;
  created_at: string;
}
interface Product { id: string; name: string; setup_guide?: string; }

interface MyInventoryViewProps {
  userName?: string | null;
  userEmail?: string | null;
  onSelectSection?: (section: string) => void;
}

export default function MyInventoryView({ userName, userEmail, onSelectSection }: MyInventoryViewProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openGuides, setOpenGuides] = useState<Record<string, boolean>>({});
  const [viewedCredentialsOrder, setViewedCredentialsOrder] = useState<Order | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "delivered" | "pending">("all");

  const fetchInventory = async () => {
    try {
      setIsLoading(true);
      const ordersData = await apiFetch("/api/orders");
      const mktOrders = (ordersData || []).filter(
        (o: any) => o.category === "Marketplace" || o.category === "Marketplace (Inquiry)" || o.category === "Gifts"
      );
      setOrders(mktOrders);
      const prodData = await apiFetch("/api/marketplace/products");
      setProducts(prodData || []);
    } catch (e) {
      console.error("Failed to fetch inventory:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopiedKey(text); toast("Copied to clipboard", "success", { silent: true }); setTimeout(() => setCopiedKey(null), 2000); }
    else toast(`Could not copy. Manually: ${text}`, "error");
  };

  // Copy every credential line for an order at once.
  const handleCopyAll = async (order: Order) => {
    const text = (order.custom_credentials || "").trim();
    if (!text) { toast("Nothing to copy yet.", "warning"); return; }
    const ok = await copyToClipboard(text);
    if (ok) toast("All credentials copied", "success", { silent: true });
    else toast("Could not copy to clipboard.", "error");
  };

  // Download the full delivery (credentials + order details) as a portable .txt receipt.
  const handleDownload = (order: Order) => {
    const lines = [
      `AVShop — Order Delivery`,
      `========================`,
      `Product: ${order.name}`,
      `Order ID: ${order.id}`,
      `Purchase Date: ${new Date(order.created_at).toLocaleString()}`,
      `Quantity: ${order.quantity || 1}`,
      ``,
    ];
    if (order.custom_credentials) { lines.push(`Credentials:`, order.custom_credentials.trim(), ``); }
    if (order.esim_activation_code) lines.push(`eSIM Activation Code: ${order.esim_activation_code}`);
    if (order.esim_instructions) lines.push(`eSIM Instructions:`, order.esim_instructions);
    if (order.tracking_number) lines.push(`Tracking Number: ${order.tracking_number}`);
    lines.push(``, `Keep this file secure. © ${new Date().getFullYear()} AVShop.`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `AVShop-Order-${order.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Delivery downloaded", "success", { silent: true });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const meta = orderStatusMeta(o.status, !!o.custom_credentials);
      if (filter === "delivered" && meta.key !== "delivered") return false;
      if (filter === "pending" && !isInFlight(meta)) return false;
      if (q && !(o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, search, filter]);

  const toTracked = (o: Order): TrackedOrder => ({
    id: o.id, name: o.name, category: o.category, quantity: o.quantity, price: o.price,
    status: o.status, createdAt: o.created_at, credentials: o.custom_credentials,
  });

  const renderCredentialsParser = (credentialsText: string) => {
    if (!credentialsText) return <span className="text-purple-200/30 italic">Awaiting fulfillment...</span>;
    const lines = credentialsText.split("\n").filter((l) => l.trim().length > 0);
    return (
      <div className="space-y-3 mt-2 text-left">
        {lines.map((line, lIdx) => {
          const parts = line.split("|").map((p) => p.trim());
          return (
            <div key={lIdx} className="p-3 bg-black/40 border border-purple-500/10 rounded-2xl space-y-2 font-mono text-xs">
              {lines.length > 1 && <span className="text-[10px] text-cyan-400 font-bold block pb-1 border-b border-purple-500/5 font-space uppercase">Account Log #{lIdx + 1}</span>}
              {parts.map((part, pIdx) => {
                let label = `Credentials Parameter ${pIdx + 1}`;
                let value = part;
                if (part.includes(":")) { const c = part.indexOf(":"); label = part.slice(0, c).trim(); value = part.slice(c + 1).trim(); }
                else if (part.includes("@")) label = "Username / Email";
                else if (pIdx === 1) label = "Password";
                else if (pIdx === 2) label = "Recovery / Extra";
                return (
                  <div key={pIdx} className="flex items-center justify-between gap-4 p-2 bg-black/30 rounded-xl border border-purple-500/5 hover:border-purple-500/15 transition-all">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest">{label}</span>
                      <span className="text-cyan-400 font-bold break-all select-all text-xs sm:text-sm mt-0.5">{value}</span>
                    </div>
                    <button onClick={() => handleCopy(value)} className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white shrink-0 cursor-pointer">
                      {copiedKey === value ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-inter">
      {/* Header */}
      <div className="pb-4 border-b border-purple-500/10 text-left">
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <Key className="h-4 w-4" /> <span>My Secure Digital Channel</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">My Inventory</h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Your purchased licenses, accounts, eSIM profiles and deliveries — with live order tracking.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-black/40 border border-purple-500/15">
          {(["all", "delivered", "pending"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${filter === f ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white" : "text-purple-200/60 hover:text-white"}`}>{f}</button>
          ))}
        </div>
      </div>

      <Card className="p-5 sm:p-6 space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center"><Package className="h-7 w-7 text-purple-300/50" /></div>
            <p className="text-sm font-bold text-white">{search || filter !== "all" ? "No matching items" : "Your inventory is empty"}</p>
            <p className="text-xs text-purple-200/50 max-w-xs">Purchases from the Marketplace will appear here with credentials and live tracking.</p>
            {onSelectSection && <button onClick={() => onSelectSection("Marketplace")} className="mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold cursor-pointer">Browse Marketplace</button>}
          </div>
        ) : (
          <div className="space-y-3 text-left">
            {filtered.map((o) => {
              const prod = products.find((p) => p.id === o.product_id);
              const hasGuide = prod && prod.setup_guide && prod.setup_guide.trim().length > 0;
              const isGuideOpen = !!openGuides[o.id];
              const hasCreds = !!o.custom_credentials;
              const meta = orderStatusMeta(o.status, hasCreds);
              const delivered = meta.key === "delivered";
              return (
                <div key={o.id} className="p-4 rounded-2xl border border-purple-500/10 bg-black/30 hover:border-purple-500/20 transition-all space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-white text-sm sm:text-base font-space">{o.name}</h4>
                        <OrderStatusBadge status={o.status} hasCredentials={hasCreds} />
                      </div>
                      <div className="text-[10px] font-mono text-purple-200/40 uppercase tracking-wider mt-1">
                        Ref: {o.id} · Qty: {o.quantity || 1} · {new Date(o.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setTrackedOrder(toTracked(o))}
                        className="px-3 py-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 text-xs font-bold text-purple-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer font-space">
                        <Package className="h-3.5 w-3.5" /> Track
                      </button>
                      {hasGuide && (
                        <button onClick={() => setOpenGuides((prev) => ({ ...prev, [o.id]: !isGuideOpen }))}
                          className="px-3 py-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 text-xs font-bold text-purple-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer font-space">
                          <FileText className="h-3.5 w-3.5" /> Guide {isGuideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {delivered ? (
                        <Button size="sm" onClick={() => setViewedCredentialsOrder(o)} className="flex items-center gap-1.5 bg-cyan-600/30 hover:bg-cyan-500 text-white font-space text-[10px] font-bold">
                          <Eye className="h-3.5 w-3.5" /> View Credentials
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setTrackedOrder(toTracked(o))} className="flex items-center gap-1.5 text-[10px] font-bold">
                          <Eye className="h-3.5 w-3.5" /> Status & Support
                        </Button>
                      )}
                    </div>
                  </div>
                  {isGuideOpen && prod && (
                    <div className="p-4 bg-purple-950/10 border border-purple-500/20 rounded-2xl text-xs text-purple-200 leading-relaxed text-left font-mono space-y-2 max-w-3xl">
                      <span className="font-bold text-purple-400 font-space uppercase block border-b border-purple-500/10 pb-1.5 mb-2">📚 Setup & Installation Guide</span>
                      <p className="whitespace-pre-wrap">{prod.setup_guide}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Unified order tracking sheet */}
      {trackedOrder && (
        <OrderDetailSheet order={trackedOrder} userName={userName} userId={userEmail}
          onClose={() => setTrackedOrder(null)}
          onNavigate={(s) => { setTrackedOrder(null); onSelectSection?.(s); }}
          onCopy={handleCopy} copiedText={copiedKey}
        />
      )}

      {/* Credentials modal (preserved, premium) */}
      {viewedCredentialsOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewedCredentialsOrder(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#070319] p-6 sm:p-8 shadow-2xl flex flex-col justify-between max-h-[85vh] overflow-y-auto custom-scrollbar-thin text-left animate-sheet-up">
            <div className="flex justify-between items-start border-b border-cyan-500/15 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">📡</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider block">Purchased Credential</span>
                    <Badge variant="success">SECURE</Badge>
                  </div>
                  <h3 className="text-xl font-bold font-space text-white">{viewedCredentialsOrder.name}</h3>
                </div>
              </div>
              <button onClick={() => setViewedCredentialsOrder(null)} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer"><X className="h-6 w-6" /></button>
            </div>

            <div className="py-6 space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar-thin text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/30 p-4 rounded-2xl border border-purple-500/5">
                <div><span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Order ID</span><span className="text-white font-bold">{viewedCredentialsOrder.id}</span></div>
                <div><span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Purchase Date</span><span className="text-white font-bold">{new Date(viewedCredentialsOrder.created_at).toLocaleString()}</span></div>
                <div><span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Quantity</span><span className="text-white font-bold">{viewedCredentialsOrder.quantity || 1} Unit(s)</span></div>
                <div><span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Cost</span><span className="text-emerald-400 font-bold">₦{viewedCredentialsOrder.price.toLocaleString()}</span></div>
              </div>

              {/* Security Center — TOTP authenticator (only renders when configured for this account) */}
              <SecurityCenter orderId={viewedCredentialsOrder.id} />

              {(viewedCredentialsOrder.esim_qr_code || viewedCredentialsOrder.esim_activation_code) && (
                <div className="p-4 bg-cyan-950/15 border border-cyan-500/20 rounded-2xl space-y-4">
                  <span className="font-bold text-cyan-400 font-space uppercase block border-b border-cyan-500/10 pb-1.5 text-xs">📶 eSIM ACTIVATION CHANNEL</span>
                  <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
                    {viewedCredentialsOrder.esim_qr_code && <div className="p-4 bg-white rounded-3xl shrink-0 flex items-center justify-center shadow-lg w-40 h-44"><QrCode className="h-32 w-32 text-black" /></div>}
                    <div className="space-y-3 text-left w-full text-xs">
                      {viewedCredentialsOrder.esim_activation_code && (
                        <div>
                          <span className="text-purple-200/40 block uppercase text-[9px] font-bold">SM-DP+ & Activation Code</span>
                          <div className="flex items-center gap-2 mt-1 bg-black/40 p-2.5 rounded-xl border border-cyan-500/10 font-mono">
                            <span className="text-white font-bold truncate flex-1">{viewedCredentialsOrder.esim_activation_code}</span>
                            <button onClick={() => handleCopy(viewedCredentialsOrder.esim_activation_code || "")} className="p-1 rounded-lg text-cyan-400 hover:text-white cursor-pointer bg-cyan-500/10"><Copy className="h-4 w-4" /></button>
                          </div>
                        </div>
                      )}
                      {viewedCredentialsOrder.esim_instructions && (
                        <div>
                          <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Activation steps</span>
                          <p className="text-purple-200/70 font-mono whitespace-pre-wrap leading-relaxed mt-1 text-[11px]">{viewedCredentialsOrder.esim_instructions}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">📦 Login Credentials</span>
                  {viewedCredentialsOrder.custom_credentials && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopyAll(viewedCredentialsOrder)} className="px-2.5 py-1 rounded-lg border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 text-[10px] font-bold text-purple-200 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"><Copy className="h-3 w-3" /> Copy all</button>
                      <button onClick={() => handleDownload(viewedCredentialsOrder)} className="px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 hover:bg-cyan-500/20 text-[10px] font-bold text-cyan-300 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"><FileText className="h-3 w-3" /> Download</button>
                    </div>
                  )}
                </div>
                <div className="text-xs">
                  {viewedCredentialsOrder.custom_credentials ? renderCredentialsParser(viewedCredentialsOrder.custom_credentials) : (
                    <div className="p-4 bg-black/40 border border-purple-500/5 rounded-2xl text-purple-200/50 italic text-center">Processing: awaiting administrator dispatch.</div>
                  )}
                </div>
              </div>

              {viewedCredentialsOrder.tracking_number && (
                <div className="p-4 bg-purple-950/15 border border-purple-500/10 rounded-2xl space-y-2">
                  <span className="text-[10px] text-purple-400 uppercase font-bold tracking-widest block font-space">🚚 Dispatch Tracking</span>
                  <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-purple-500/5 font-mono text-xs">
                    <div><span className="text-[9px] text-purple-200/40 uppercase block">Courier Tracking ID</span><span className="text-cyan-400 font-bold font-mono text-sm">{viewedCredentialsOrder.tracking_number}</span></div>
                    <button onClick={() => handleCopy(viewedCredentialsOrder.tracking_number || "")} className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-purple-400 hover:text-white"><Copy className="h-4.5 w-4.5" /></button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-cyan-500/10 flex justify-end">
              <Button size="lg" onClick={() => setViewedCredentialsOrder(null)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8">Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
