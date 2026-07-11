import { useState, useEffect, useCallback } from "react";
import { Search, PackageCheck, Plus, KeyRound, Boxes, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import CustomFulfillFields from "./CustomFulfillFields";

/**
 * General-Marketplace fulfillment: lets an admin either
 *   (A) SELECT an existing credential from inventory and assign it to the order,
 *   (B) ADD a new credential (then assign it immediately), or
 *   (C) fall back to a free-form MANUAL delivery form.
 * Only surfaced for marketplace orders. Prevents duplicate assignment (sold rows are
 * filtered server-side by status='available'), supports search + shows remaining stock.
 */

type Cred = {
  id: number;
  credentials?: string;
  email?: string;
  username?: string;
  label?: string;
  region?: string;
  country?: string;
  workflow?: string;
  status?: string;
  notes?: string;
};

type Mode = "select" | "add" | "manual";

export default function MarketplaceCredentialPicker({
  order,
  onDone,
  onManualSubmit,
  manualForm,
  setManualForm,
  customFields,
  setCustomFields,
  manualSubmitting,
}: {
  order: any;
  onDone: () => void;
  onManualSubmit: (e: React.FormEvent) => void;
  manualForm: { trackingNumber: string; customCredentials: string; status: string; shippingMethod: string };
  setManualForm: (f: any) => void;
  customFields: { label: string; value: string }[];
  setCustomFields: (f: { label: string; value: string }[]) => void;
  manualSubmitting: boolean;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("select");
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // New-credential form (mirrors the "Add New Product" credential fields).
  const [nc, setNc] = useState({
    email: "", username: "", password: "", recovery_email: "", recovery_phone: "", twofa: "", notes: "",
  });

  const productId = order?.product_id ? String(order.product_id) : "";

  const load = useCallback(async () => {
    if (!productId) { setCreds([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ productId, status: "available", pageSize: "200" });
      if (q.trim()) params.set("q", q.trim());
      const res = await apiFetch(`/api/admin/inventory/credentials?${params.toString()}`);
      setCreds(res.rows || []);
    } catch (err: any) {
      toast("Could not load inventory: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [productId, q, toast]);

  useEffect(() => { if (mode === "select") load(); }, [mode, load]);

  const assign = async (id: number) => {
    setAssigningId(id);
    try {
      await apiFetch(`/api/admin/inventory/credentials/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      toast("Credential assigned and delivered to the customer.", "success");
      onDone();
    } catch (err: any) {
      toast("Assign failed: " + err.message, "error");
    } finally {
      setAssigningId(null);
    }
  };

  const addAndAssign = async () => {
    if (!nc.email.trim() && !nc.username.trim() && !nc.password.trim()) {
      toast("Enter at least an email, username, or password.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await apiFetch(`/api/admin/inventory/credentials`, {
        method: "POST",
        body: JSON.stringify({ productId, ...nc }),
      });
      if (!created || !created.id) throw new Error("Credential was not created.");
      // Immediately assign the freshly-created credential to this order.
      await apiFetch(`/api/admin/inventory/credentials/${created.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      toast("Credential added and delivered to the customer.", "success");
      onDone();
    } catch (err: any) {
      toast("Could not add & assign: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const tabCls = (m: Mode) =>
    `flex-1 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
      mode === m ? "bg-cyan-600/30 border border-cyan-500/40 text-white" : "bg-black/30 border border-purple-500/10 text-purple-200/50 hover:text-white"
    }`;
  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-2 rounded-lg focus:outline-none placeholder-purple-200/25";

  return (
    <div className="space-y-3 text-left">
      {/* Mode switch */}
      <div className="flex gap-2">
        <button type="button" className={tabCls("select")} onClick={() => setMode("select")}>
          <KeyRound className="h-3.5 w-3.5 inline mr-1" /> Select
        </button>
        <button type="button" className={tabCls("add")} onClick={() => setMode("add")}>
          <Plus className="h-3.5 w-3.5 inline mr-1" /> Add
        </button>
        <button type="button" className={tabCls("manual")} onClick={() => setMode("manual")}>
          <PackageCheck className="h-3.5 w-3.5 inline mr-1" /> Manual
        </button>
      </div>

      {/* ——— SELECT EXISTING CREDENTIAL ——— */}
      {mode === "select" && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-200/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                placeholder="Search email, username, label…"
                className={`${inputCls} pl-8`}
              />
            </div>
            <button type="button" onClick={load} className="p-2 rounded-lg bg-black/30 border border-purple-500/10 text-purple-200/60 hover:text-white cursor-pointer">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-purple-200/50">
            <Boxes className="h-3.5 w-3.5 text-cyan-400" />
            <span><span className="text-white font-bold">{creds.length}</span> available credential{creds.length === 1 ? "" : "s"} in stock for this product</span>
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar-thin space-y-2 pr-1">
            {loading ? (
              <p className="text-[11px] text-purple-200/40 py-6 text-center">Loading inventory…</p>
            ) : creds.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-[11px] text-purple-200/40">No available credentials for this product.</p>
                <Button type="button" onClick={() => setMode("add")} className="text-xs"><Plus className="h-3.5 w-3.5" /> Add a credential</Button>
              </div>
            ) : (
              creds.map((c) => (
                <div key={c.id} className="p-2.5 rounded-xl border border-purple-500/10 bg-black/30 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {c.label && <div className="text-[11px] font-bold text-white truncate">{c.label}</div>}
                      <div className="font-mono text-[10px] text-purple-200/70 break-all line-clamp-2">{c.credentials || c.email || c.username || `Credential #${c.id}`}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.region && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-200/60">{c.region}</span>}
                        {c.country && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-200/60">{c.country}</span>}
                        {c.workflow && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">{c.workflow}</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => assign(c.id)}
                      isLoading={assigningId === c.id}
                      className="shrink-0 text-[11px]"
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ——— ADD NEW CREDENTIAL ——— */}
      {mode === "add" && (
        <div className="space-y-2.5">
          <p className="text-[10px] text-purple-200/40 italic">Add a new credential to inventory and deliver it to this order in one step.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email" className={inputCls} />
            <input value={nc.username} onChange={(e) => setNc({ ...nc, username: e.target.value })} placeholder="Username" className={inputCls} />
            <input value={nc.password} onChange={(e) => setNc({ ...nc, password: e.target.value })} placeholder="Password" className={inputCls} />
            <input value={nc.twofa} onChange={(e) => setNc({ ...nc, twofa: e.target.value })} placeholder="2FA / backup codes" className={inputCls} />
            <input value={nc.recovery_email} onChange={(e) => setNc({ ...nc, recovery_email: e.target.value })} placeholder="Recovery email" className={inputCls} />
            <input value={nc.recovery_phone} onChange={(e) => setNc({ ...nc, recovery_phone: e.target.value })} placeholder="Recovery phone" className={inputCls} />
          </div>
          <textarea value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} placeholder="Notes (optional)" rows={2} className={inputCls} />
          <Button type="button" onClick={addAndAssign} isLoading={saving} className="w-full text-xs">
            <CheckCircle2 className="h-4 w-4" /> Add & Deliver to Customer
          </Button>
        </div>
      )}

      {/* ——— MANUAL DELIVERY FORM ——— */}
      {mode === "manual" && (
        <form onSubmit={onManualSubmit} className="space-y-3">
          <p className="text-[10px] text-purple-200/40 italic">Deliver custom details directly to the customer without touching inventory.</p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-purple-200/70 block">Credentials / Keys / Delivery Details</label>
            <textarea
              value={manualForm.customCredentials}
              onChange={(e) => setManualForm({ ...manualForm, customCredentials: e.target.value })}
              placeholder="License keys, account details, download links, instructions…"
              className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none"
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-purple-200/70 block">Fulfillment Status</label>
            <select
              value={manualForm.status}
              onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
              className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none"
            >
              <option value="processing" className="bg-neutral-900">Processing</option>
              <option value="delivered" className="bg-neutral-900">Delivered (final)</option>
              <option value="refunded" className="bg-neutral-900">Refunded</option>
              <option value="rejected" className="bg-neutral-900">Rejected</option>
            </select>
          </div>
          <CustomFulfillFields fields={customFields} onChange={setCustomFields} />
          <Button type="submit" isLoading={manualSubmitting} className="w-full text-xs">Deliver Manually</Button>
        </form>
      )}
    </div>
  );
}
