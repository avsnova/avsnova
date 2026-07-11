import { useState, useEffect, useCallback } from "react";
import { X, User, Truck, CreditCard, ListChecks, Clock, FileText, StickyNote, Hash, Loader2, Save } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * OrderDetailsModal — Item 1. Shows the COMPLETE details for ANY order type
 * (marketplace / eSIM / physical SIM / gift / SMM): customer, delivery, payment,
 * custom fields, status timeline, transaction reference, notes, and internal admin notes.
 * Self-contained: fetches /api/admin/orders/:id/details and saves internal notes.
 */
export default function OrderDetailsModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/details`);
      setData(r);
      setNotes((r.order && r.order.admin_notes) || "");
    } catch (e: any) {
      toast("Failed to load order details: " + e.message, "error");
    } finally { setLoading(false); }
  }, [orderId, toast]);
  useEffect(() => { load(); }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/notes`, { method: "POST", body: JSON.stringify({ notes }) });
      toast("Internal notes saved.", "success");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSavingNotes(false); }
  };

  const money = (v: any) => `₦${Math.round(Number(v) || 0).toLocaleString()}`;
  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-cyan-300">{icon}{title}</div>
      {children}
    </div>
  );
  const Row = ({ k, v }: { k: string; v: any }) => (v === null || v === undefined || v === "" ? null : (
    <div className="flex items-start justify-between gap-3 text-[12px]"><span className="text-purple-200/50 shrink-0">{k}</span><span className="text-white text-right break-all">{String(v)}</span></div>
  ));

  const o = data?.order;
  const kv = (obj: any) => obj && typeof obj === "object" ? Object.entries(obj).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-5 bg-[#0b0420] border border-purple-500/30 max-h-[92vh] overflow-y-auto custom-scrollbar-thin space-y-3 text-left">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
          <div>
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">Complete Order Details</span>
            <h4 className="text-sm font-bold text-white font-space">Order {orderId}{data?.serviceModule ? ` · ${data.serviceModule}` : ""}</h4>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-purple-200/40 text-xs"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>
        ) : !data ? (
          <div className="py-10 text-center text-purple-200/40 text-xs">No details available.</div>
        ) : (
          <>
            {/* Order summary */}
            <Section icon={<FileText className="h-3.5 w-3.5" />} title="Order">
              <Row k="Status" v={o.status} />
              <Row k="Item" v={o.name} />
              <Row k="Category" v={o.category} />
              <Row k="Quantity" v={o.quantity} />
              <Row k="Price" v={money(o.price)} />
              <Row k="Delivery type" v={o.delivery_type} />
              {o.target_link && <Row k="Target/Link" v={o.target_link} />}
            </Section>

            {/* Customer */}
            <Section icon={<User className="h-3.5 w-3.5" />} title="Customer">
              <Row k="Name" v={data.customer?.name} />
              <Row k="Username" v={data.customer?.username} />
              <Row k="Email" v={data.customer?.email} />
              <Row k="Phone" v={data.customer?.phone} />
              <Row k="Wallet" v={data.customer ? money(data.customer.wallet_balance) : null} />
            </Section>

            {/* Delivery / shipping */}
            {(data.shippingInfo || o.shipping_method || o.tracking_number) && (
              <Section icon={<Truck className="h-3.5 w-3.5" />} title="Delivery">
                {o.shipping_method && <Row k="Method / Carrier" v={o.shipping_method} />}
                {o.tracking_number && <Row k="Tracking" v={o.tracking_number} />}
                {o.shipping_cost ? <Row k="Shipping cost" v={money(o.shipping_cost)} /> : null}
                {kv(data.shippingInfo).map(([k, v]) => <Row key={k} k={k} v={v as any} />)}
              </Section>
            )}

            {/* Custom fields submitted at checkout */}
            {data.checkoutAnswers && kv(data.checkoutAnswers).length > 0 && (
              <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Custom Fields Submitted">
                {kv(data.checkoutAnswers).map(([k, v]) => <Row key={k} k={k} v={v as any} />)}
              </Section>
            )}

            {/* eSIM specifics */}
            {(o.esim_activation_code || o.esim_qr_code || o.esim_expiry) && (
              <Section icon={<Hash className="h-3.5 w-3.5" />} title="eSIM">
                <Row k="Activation code" v={o.esim_activation_code} />
                <Row k="QR" v={o.esim_qr_code} />
                <Row k="Expiry" v={o.esim_expiry} />
              </Section>
            )}

            {/* Delivered credentials */}
            {o.custom_credentials && (
              <Section icon={<Hash className="h-3.5 w-3.5" />} title="Delivered / Credentials">
                <div className="font-mono text-[11px] text-purple-100 whitespace-pre-wrap break-all">{o.custom_credentials}</div>
              </Section>
            )}

            {/* Payment */}
            <Section icon={<CreditCard className="h-3.5 w-3.5" />} title="Payment">
              <Row k="Amount" v={money(o.price)} />
              <Row k="Cost" v={money(o.cost_price)} />
              <Row k="Profit" v={money(o.profit)} />
              {(data.transactions || []).map((t: any, i: number) => (
                <div key={i} className="mt-1 pt-1 border-t border-purple-500/10">
                  <Row k="Reference" v={t.reference} />
                  <Row k="Method" v={t.payment_method} />
                  <Row k="Type" v={t.type} />
                </div>
              ))}
              {(!data.transactions || data.transactions.length === 0) && <div className="text-[11px] text-purple-200/30 italic">No transaction record linked.</div>}
            </Section>

            {/* Timeline */}
            <Section icon={<Clock className="h-3.5 w-3.5" />} title="Timeline">
              {(data.timeline || []).map((t: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-100">{t.label}{t.by ? ` · ${t.by}` : ""}</span>
                  <span className="text-purple-200/40">{t.at ? new Date(t.at).toLocaleString() : ""}</span>
                </div>
              ))}
            </Section>

            {/* Internal admin notes */}
            <Section icon={<StickyNote className="h-3.5 w-3.5" />} title="Internal Admin Notes (never shown to customer)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Private notes for staff only…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-xl focus:outline-none" />
              <Button size="sm" onClick={saveNotes} isLoading={savingNotes} className="flex items-center gap-1.5"><Save className="h-3.5 w-3.5" /> Save Notes</Button>
            </Section>
          </>
        )}
      </Card>
    </div>
  );
}
