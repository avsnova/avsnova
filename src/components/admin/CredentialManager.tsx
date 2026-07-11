import { useState, useEffect, useCallback, useRef } from "react";
import {
  Key, Search, Download, Upload, Plus, Trash, Edit, Copy, Archive, RotateCcw,
  Ban, CheckCircle2, X, ChevronLeft, ChevronRight, Filter, History, ShieldCheck,
  AlertTriangle, Package, PackageCheck, Clock, Loader2,
  FileEdit, FlaskConical, Rocket, Users, KeyRound, Mail, Inbox, Lock,
} from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch, getApiBaseUrl, getSessionToken } from "../../utils/api";

/**
 * CredentialManager — the central inventory manager for digital-product credentials.
 * Backed by /api/admin/inventory/* endpoints. Fully reusable and self-contained:
 * list + search + filters + pagination, create/edit/delete/duplicate/restore,
 * bulk operations, import (CSV/TXT paste + file), export, audit history, and
 * per-credential status lifecycle (available/reserved/sold/archived/disabled).
 */

interface ProductLite { id: string; name: string; stock?: number; delivery_type?: string; inventory_type?: string; shared_max_users?: number; }
interface Credential {
  id: number;
  product_id: string;
  product_name?: string;
  credentials: string;
  status: string;
  workflow?: string;
  label?: string | null;
  region?: string | null;
  country?: string | null;
  expiry?: string | null;
  notes?: string | null;
  is_warranty?: number;
  sold_to_user_id?: number | null;
  order_id?: string | null;
  sold_at?: string | null;
  created_at?: string | null;
  // structured
  email?: string | null; username?: string | null; password?: string | null; twofa?: string | null;
  recovery_email?: string | null; recovery_phone?: string | null; supplier?: string | null; tags?: string | null;
  license_key?: string | null; max_users?: number; current_users?: number; multiplier?: number; multiplier_used?: number;
  test_result?: string | null; tested_by?: string | null; tested_at?: string | null;
  has_totp?: boolean; auth_enabled?: number;
}
interface SummaryTotals {
  total?: number; available?: number; warranty?: number; reserved?: number;
  sold?: number; archived?: number; disabled?: number;
  draft?: number; testing?: number; ready?: number; published?: number;
  sellable?: number; readyNotPublished?: number;
}
interface Shortage { product_id: string; name: string; category?: string; available: number; }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  reserved: { label: "Reserved", cls: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
  sold: { label: "Sold", cls: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" },
  archived: { label: "Archived", cls: "bg-neutral-500/15 border-neutral-500/30 text-neutral-300" },
  disabled: { label: "Disabled", cls: "bg-red-500/15 border-red-500/30 text-red-300" },
};
const ALL_STATUSES = ["available", "reserved", "sold", "archived", "disabled"];

// Inventory workflow lifecycle (nothing is sellable/visible until 'published').
const WORKFLOW_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-neutral-500/15 border-neutral-500/30 text-neutral-300" },
  testing: { label: "Testing", cls: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
  ready: { label: "Ready", cls: "bg-blue-500/15 border-blue-500/30 text-blue-300" },
  published: { label: "Published", cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  sold: { label: "Sold", cls: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" },
  archived: { label: "Archived", cls: "bg-neutral-500/15 border-neutral-500/30 text-neutral-300" },
};
const ALL_WORKFLOWS = ["draft", "testing", "ready", "published", "sold", "archived"];

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || { label: status, cls: "bg-neutral-500/15 border-neutral-500/30 text-neutral-300" };
  return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold font-space ${m.cls}`}>{m.label}</span>;
}
function WorkflowPill({ workflow }: { workflow?: string }) {
  const wf = workflow || "published";
  const m = WORKFLOW_META[wf] || { label: workflow || "—", cls: "bg-neutral-500/15 border-neutral-500/30 text-neutral-300" };
  // Only 'published' credentials count toward sellable stock. Flag the rest so admins
  // instantly understand why a product may still show 0 stock.
  const notSellable = wf !== "published" && wf !== "sold" && wf !== "archived";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold font-space ${m.cls}`}>{m.label}</span>
      {notSellable && (
        <span
          title="Not counted as sellable stock yet — publish this credential to make it available for purchase."
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[9px] font-bold"
        >
          <Lock className="h-2.5 w-2.5" /> Not sellable
        </span>
      )}
    </span>
  );
}

const emptyForm = {
  id: 0, productId: "", credentials: "", label: "", region: "", country: "",
  expiry: "", notes: "", isWarranty: false, status: "available", workflow: "ready",
  email: "", username: "", password: "", twofa: "", recovery_email: "", recovery_phone: "",
  supplier: "", tags: "", license_key: "", max_users: "", current_users: "", multiplier: "1",
};

export default function CredentialManager({ products, initialProductId }: { products: ProductLite[]; initialProductId?: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();

  // Data
  const [rows, setRows] = useState<Credential[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<SummaryTotals>({});
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [productId, setProductId] = useState(initialProductId || "");
  const [status, setStatus] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [supplier, setSupplier] = useState("");
  const [warranty, setWarranty] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Modals
  const [editing, setEditing] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [auditFor, setAuditFor] = useState<Credential | null>(null);
  const [assignFor, setAssignFor] = useState<Credential | null>(null);
  const [testingFor, setTestingFor] = useState<Credential | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const s = await apiFetch("/api/admin/inventory/summary");
      setSummary(s.totals || {});
      setShortages(s.shortages || []);
      setSuppliers(s.suppliers || []);
    } catch { /* non-fatal */ }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (productId) params.set("productId", productId);
      if (status) params.set("status", status);
      if (workflow) params.set("workflow", workflow);
      if (supplier) params.set("supplier", supplier);
      if (warranty) params.set("warranty", warranty);
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/api/admin/inventory/credentials?${params.toString()}`);
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setSelected(new Set());
    } catch (err: any) {
      toast("Failed to load credentials: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [productId, status, workflow, supplier, warranty, q, page, toast]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [productId, status, workflow, supplier, warranty, q]);

  // Bulk workflow transition (publish/testing/draft/archive).
  const bulkWorkflow = async (wf: string) => {
    if (selected.size === 0) return;
    try {
      await apiFetch("/api/admin/inventory/credentials/bulk-workflow", { method: "POST", body: JSON.stringify({ ids: [...selected], workflow: wf }) });
      toast(`${selected.size} item(s) → ${WORKFLOW_META[wf]?.label || wf}.`, "success");
      refreshAll();
    } catch (err: any) { toast("Bulk update failed: " + err.message, "error"); }
  };

  const refreshAll = () => { loadRows(); loadSummary(); };

  // --- Selection helpers ---
  const toggleOne = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((prev) => prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));
  };

  // --- CRUD ---
  const saveCredential = async () => {
    if (!editing) return;
    // Require at least one credential source (free-text, a structured login field, or a key).
    const hasContent = editing.credentials.trim() || editing.email.trim() || editing.username.trim() || editing.license_key.trim();
    if (!editing.productId || !hasContent) { toast("Choose a product and fill at least one credential field.", "error"); return; }
    setSaving(true);
    const payload = {
      credentials: editing.credentials, label: editing.label, region: editing.region,
      country: editing.country, expiry: editing.expiry, notes: editing.notes,
      isWarranty: editing.isWarranty, status: editing.status, workflow: editing.workflow,
      email: editing.email, username: editing.username, password: editing.password, twofa: editing.twofa,
      recovery_email: editing.recovery_email, recovery_phone: editing.recovery_phone,
      supplier: editing.supplier, tags: editing.tags, license_key: editing.license_key,
      max_users: editing.max_users, current_users: editing.current_users, multiplier: editing.multiplier,
    };
    try {
      if (editing.id) {
        await apiFetch(`/api/admin/inventory/credentials/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Inventory item updated.", "success");
      } else {
        await apiFetch("/api/admin/inventory/credentials", { method: "POST", body: JSON.stringify({ productId: editing.productId, ...payload }) });
        toast("Inventory item added.", "success");
      }
      setEditing(null);
      refreshAll();
    } catch (err: any) {
      toast("Save failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const duplicateCred = async (c: Credential) => {
    try {
      await apiFetch(`/api/admin/inventory/credentials/${c.id}/duplicate`, { method: "POST" });
      toast("Credential duplicated.", "success");
      refreshAll();
    } catch (err: any) { toast("Duplicate failed: " + err.message, "error"); }
  };

  const deleteCred = async (c: Credential) => {
    if (!(await confirm({ title: "Delete credential", message: "Permanently delete this credential? This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await apiFetch(`/api/admin/inventory/credentials/${c.id}`, { method: "DELETE" });
      toast("Credential deleted.", "success");
      refreshAll();
    } catch (err: any) { toast("Delete failed: " + err.message, "error"); }
  };

  const changeStatus = async (c: Credential, newStatus: string) => {
    try {
      await apiFetch(`/api/admin/inventory/credentials/${c.id}`, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
      toast(`Marked ${STATUS_META[newStatus]?.label || newStatus}.`, "success");
      refreshAll();
    } catch (err: any) { toast("Update failed: " + err.message, "error"); }
  };

  // --- Bulk ---
  const bulkStatus = async (newStatus: string) => {
    if (selected.size === 0) return;
    try {
      await apiFetch("/api/admin/inventory/credentials/bulk-status", { method: "POST", body: JSON.stringify({ ids: [...selected], status: newStatus }) });
      toast(`${selected.size} credential(s) → ${STATUS_META[newStatus]?.label || newStatus}.`, "success");
      refreshAll();
    } catch (err: any) { toast("Bulk update failed: " + err.message, "error"); }
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({ title: "Delete selected", message: `Permanently delete ${selected.size} credential(s)?`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await apiFetch("/api/admin/inventory/credentials/bulk-delete", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      toast(`${selected.size} credential(s) deleted.`, "success");
      refreshAll();
    } catch (err: any) { toast("Bulk delete failed: " + err.message, "error"); }
  };

  // --- Export ---
  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (productId) params.set("productId", productId);
      if (status) params.set("status", status);
      const url = `${getApiBaseUrl()}/api/admin/inventory/export?${params.toString()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getSessionToken()}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "credentials-export.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Export downloaded.", "success");
    } catch (err: any) { toast("Export failed: " + err.message, "error"); }
  };

  return (
    <div className="space-y-6">
      {/* KPI header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Package className="h-4 w-4" />} label="Total" value={summary.total ?? 0} tone="text-white" />
        <KpiCard icon={<PackageCheck className="h-4 w-4" />} label="Available" value={summary.available ?? 0} tone="text-emerald-300" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Reserved" value={summary.reserved ?? 0} tone="text-amber-300" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Sold" value={summary.sold ?? 0} tone="text-cyan-300" />
        <KpiCard icon={<ShieldCheck className="h-4 w-4" />} label="Warranty" value={summary.warranty ?? 0} tone="text-purple-300" />
        <KpiCard icon={<Archive className="h-4 w-4" />} label="Archived" value={(summary.archived ?? 0) + (summary.disabled ?? 0)} tone="text-neutral-300" />
      </div>

      {/* Workflow lifecycle KPIs — click to filter. "Sellable now" is the count that actually
          counts toward product stock (available + published + non-warranty). */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button onClick={() => { setStatus("available"); setWorkflow("published"); }} className="text-left">
          <KpiCard icon={<Rocket className="h-4 w-4" />} label="Sellable now" value={summary.sellable ?? 0} tone="text-emerald-300" />
        </button>
        <button onClick={() => setWorkflow("draft")} className="text-left"><KpiCard icon={<FileEdit className="h-4 w-4" />} label="Draft" value={summary.draft ?? 0} tone="text-neutral-300" /></button>
        <button onClick={() => setWorkflow("testing")} className="text-left"><KpiCard icon={<FlaskConical className="h-4 w-4" />} label="Testing" value={summary.testing ?? 0} tone="text-amber-300" /></button>
        <button onClick={() => setWorkflow("ready")} className="text-left"><KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Ready" value={summary.ready ?? 0} tone="text-blue-300" /></button>
        <button onClick={() => setWorkflow("published")} className="text-left"><KpiCard icon={<Rocket className="h-4 w-4" />} label="Published" value={summary.published ?? 0} tone="text-emerald-300" /></button>
      </div>

      {/* Actionable hint: credentials that are ready to sell but not published yet don't count
          toward stock, so a product can still show 0 stock. One click publishes them all. */}
      {(summary.readyNotPublished ?? 0) > 0 && (
        <Card className="border border-amber-500/25 bg-amber-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2 flex-1">
              <Lock className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
              <div className="text-[11px] leading-relaxed text-amber-200/90">
                <span className="font-bold text-amber-200">{summary.readyNotPublished} credential{(summary.readyNotPublished ?? 0) === 1 ? "" : "s"} not sellable yet.</span>{" "}
                Only <span className="font-semibold text-emerald-300">Published</span> credentials count toward product stock — these are available but still in Draft/Testing/Ready, so their product may show <span className="font-semibold">0 stock</span> until you publish them.
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => { setStatus("available"); setWorkflow(""); }}
              className="shrink-0 bg-amber-500/15 border border-amber-500/30 text-amber-100 hover:bg-amber-500/25"
            >
              Review unpublished
            </Button>
          </div>
        </Card>
      )}

      {/* Shortage alerts */}
      {shortages.length > 0 && (
        <Card className="border border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-300 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-sm font-bold font-space">Low Credential Stock ({shortages.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {shortages.map((s) => (
              <button
                key={s.product_id}
                onClick={() => { setProductId(s.product_id); setStatus(""); }}
                className="px-2.5 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-medium text-amber-100 cursor-pointer"
              >
                {s.name} <span className="font-bold">· {s.available} left</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Toolbar */}
      <Card className="space-y-4 border border-purple-500/10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-purple-200">
            <Key className="h-4.5 w-4.5 text-cyan-400" />
            <h3 className="text-sm sm:text-base font-bold font-space text-white">Credential Inventory</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setImportOpen(true)} className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-bold font-space text-cyan-300 flex items-center gap-1 cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-[11px] font-bold font-space text-purple-200 flex items-center gap-1 cursor-pointer">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={() => setEditing({ ...emptyForm, productId: productId || "" })} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] font-bold font-space text-emerald-300 flex items-center gap-1 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/50" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setQ(qInput); }}
              placeholder="Search credentials, label, order…"
              className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-xl focus:outline-none"
            />
          </div>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All products</option>
            {products.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s} className="bg-neutral-900">{STATUS_META[s].label}</option>)}
          </select>
          <select value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All workflow</option>
            {ALL_WORKFLOWS.map((w) => <option key={w} value={w} className="bg-neutral-900">{WORKFLOW_META[w].label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s} className="bg-neutral-900">{STATUS_META[s].label}</option>)}
          </select>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s} className="bg-neutral-900">{s}</option>)}
          </select>
          <select value={warranty} onChange={(e) => setWarranty(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">All types</option>
            <option value="0" className="bg-neutral-900">Sale stock</option>
            <option value="1" className="bg-neutral-900">Warranty stock</option>
          </select>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
            <span className="text-[11px] font-bold text-cyan-300 font-space px-1">{selected.size} selected</span>
            <BulkBtn onClick={() => bulkWorkflow("published")} icon={<Rocket className="h-3 w-3" />} label="Publish" />
            <BulkBtn onClick={() => bulkWorkflow("testing")} icon={<FlaskConical className="h-3 w-3" />} label="Testing" />
            <BulkBtn onClick={() => bulkWorkflow("draft")} icon={<FileEdit className="h-3 w-3" />} label="Draft" />
            <BulkBtn onClick={() => bulkWorkflow("archived")} icon={<Archive className="h-3 w-3" />} label="Archive" />
            <span className="w-px h-4 bg-purple-500/20 mx-0.5" />
            <BulkBtn onClick={() => bulkStatus("available")} icon={<RotateCcw className="h-3 w-3" />} label="Restore" />
            <BulkBtn onClick={() => bulkStatus("disabled")} icon={<Ban className="h-3 w-3" />} label="Disable" />
            <BulkBtn onClick={bulkDelete} icon={<Trash className="h-3 w-3" />} label="Delete" danger />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-purple-500/10">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-black/30 text-[10px] uppercase tracking-wider text-purple-300/60 font-space">
                <th className="p-2.5 w-8">
                  <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} className="accent-cyan-500 cursor-pointer" />
                </th>
                <th className="p-2.5">Credential</th>
                <th className="p-2.5 hidden md:table-cell">Product</th>
                <th className="p-2.5">Workflow</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 hidden lg:table-cell">Supplier</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/5">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-purple-300/50 text-xs"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-purple-300/50 text-xs">No inventory items found. Import or add some to get started.</td></tr>
              ) : rows.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="p-2.5"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="accent-cyan-500 cursor-pointer" /></td>
                  <td className="p-2.5">
                    <div className="font-mono text-[11px] text-white truncate max-w-[220px]" title={c.credentials}>{c.credentials}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.label && <span className="text-[9px] text-purple-300/60">{c.label}</span>}
                      {!!c.is_warranty && <span className="text-[9px] px-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">Warranty</span>}
                      {!!c.max_users && <span className="text-[9px] px-1 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 inline-flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{c.current_users || 0}/{c.max_users}</span>}
                      {(c.multiplier || 1) > 1 && <span className="text-[9px] px-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">×{(c.multiplier || 1) - (c.multiplier_used || 0)} left</span>}
                      {c.order_id && <span className="text-[9px] text-cyan-300/60">#{c.order_id}</span>}
                    </div>
                  </td>
                  <td className="p-2.5 hidden md:table-cell text-[11px] text-purple-200/70">{c.product_name || c.product_id}</td>
                  <td className="p-2.5"><WorkflowPill workflow={c.workflow} /></td>
                  <td className="p-2.5"><StatusPill status={c.status} /></td>
                  <td className="p-2.5 hidden lg:table-cell text-[11px] text-purple-200/60">{c.supplier || "—"}</td>
                  <td className="p-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Test account" onClick={() => setTestingFor(c)}><FlaskConical className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn title="History" onClick={() => setAuditFor(c)}><History className="h-3.5 w-3.5" /></IconBtn>
                      {c.status !== "sold" && <IconBtn title="Assign to order" onClick={() => setAssignFor(c)}><PackageCheck className="h-3.5 w-3.5" /></IconBtn>}
                      <IconBtn title="Edit" onClick={() => setEditing({ id: c.id, productId: c.product_id, credentials: c.credentials, label: c.label || "", region: c.region || "", country: c.country || "", expiry: c.expiry || "", notes: c.notes || "", isWarranty: !!c.is_warranty, status: c.status, workflow: c.workflow || "ready", email: c.email || "", username: c.username || "", password: c.password || "", twofa: c.twofa || "", recovery_email: c.recovery_email || "", recovery_phone: c.recovery_phone || "", supplier: c.supplier || "", tags: c.tags || "", license_key: c.license_key || "", max_users: c.max_users ? String(c.max_users) : "", current_users: c.current_users ? String(c.current_users) : "", multiplier: c.multiplier != null ? String(c.multiplier) : "1", hasTotp: !!(c as any).has_totp } as any)}><Edit className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn title="Duplicate" onClick={() => duplicateCred(c)}><Copy className="h-3.5 w-3.5" /></IconBtn>
                      {c.status === "archived" || c.status === "disabled"
                        ? <IconBtn title="Restore" onClick={() => changeStatus(c, "available")}><RotateCcw className="h-3.5 w-3.5" /></IconBtn>
                        : <IconBtn title="Archive" onClick={() => changeStatus(c, "archived")}><Archive className="h-3.5 w-3.5" /></IconBtn>}
                      <IconBtn title="Delete" danger onClick={() => deleteCred(c)}><Trash className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-[11px] text-purple-300/60">
          <span>{total} credential{total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 hover:bg-white/5 cursor-pointer disabled:cursor-default"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="font-space">Page {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 hover:bg-white/5 cursor-pointer disabled:cursor-default"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </Card>

      {editing && <EditModal form={editing} setForm={setEditing} onSave={saveCredential} saving={saving} products={products} onClose={() => setEditing(null)} />}
      {importOpen && <ImportModal products={products} defaultProductId={productId} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); refreshAll(); }} />}
      {auditFor && <AuditModal credential={auditFor} onClose={() => setAuditFor(null)} />}
      {assignFor && <AssignModal credential={assignFor} onClose={() => setAssignFor(null)} onDone={() => { setAssignFor(null); refreshAll(); }} />}
      {testingFor && <TestModal credential={testingFor} onClose={() => setTestingFor(null)} onDone={() => { setTestingFor(null); refreshAll(); }} />}
    </div>
  );
}

// ---------- Small building blocks ----------
function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-purple-300/60 text-[10px] font-space uppercase tracking-wide">{icon}{label}</div>
      <div className={`text-xl font-bold font-space mt-1 ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}
function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`p-1.5 rounded-lg border cursor-pointer transition ${danger ? "border-red-500/20 text-red-300/70 hover:bg-red-500/15 hover:text-red-300" : "border-purple-500/15 text-purple-300/70 hover:bg-white/5 hover:text-white"}`}>{children}</button>
  );
}
function BulkBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold font-space flex items-center gap-1 cursor-pointer ${danger ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20" : "border-purple-500/25 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"}`}>{icon}{label}</button>
  );
}

// ---------- Modals ----------
function Overlay({ children, onClose, title, icon }: { children: React.ReactNode; onClose: () => void; title: string; icon?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg my-8 bg-[#0e0922] border border-purple-500/30 rounded-2xl p-6 shadow-2xl z-10">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold font-space text-white flex items-center gap-2">{icon}{title}</h3>
          <button onClick={onClose} className="text-purple-200/40 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditModal({ form, setForm, onSave, saving, products, onClose }: {
  form: typeof emptyForm; setForm: (f: typeof emptyForm) => void; onSave: () => void; saving: boolean; products: ProductLite[]; onClose: () => void;
}) {
  const set = (k: keyof typeof emptyForm, v: any) => setForm({ ...form, [k]: v });
  // Adapt the form to the selected product's inventory type.
  const prod = products.find((p) => p.id === form.productId) as any;
  const invType = (prod && prod.inventory_type) || "login";
  const showLogin = invType === "login" || invType === "shared";
  const showLicense = invType === "license";
  const showShared = invType === "shared";
  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none";
  return (
    <Overlay onClose={onClose} title={form.id ? "Edit Inventory Item" : "Add Inventory Item"} icon={<Key className="h-4.5 w-4.5 text-cyan-400" />}>
      <div className="space-y-3 text-left max-h-[70vh] overflow-y-auto pr-1">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Product</label>
          <select disabled={!!form.id} value={form.productId} onChange={(e) => set("productId", e.target.value)} className={`${inputCls} disabled:opacity-60`}>
            <option value="" className="bg-neutral-900">-- Choose product --</option>
            {products.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}{(p as any).inventory_type ? ` · ${(p as any).inventory_type}` : ""}</option>)}
          </select>
        </div>

        {/* Structured login fields (login & shared accounts) */}
        {showLogin && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-purple-500/10 bg-black/20">
            <Input label="Email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="user@gmail.com" />
            <Input label="Username" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="username" />
            <Input label="Password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••" />
            <Input label="2FA" value={form.twofa} onChange={(e) => set("twofa", e.target.value)} placeholder="TOTP / code" />
            <Input label="Recovery Email" value={form.recovery_email} onChange={(e) => set("recovery_email", e.target.value)} placeholder="recovery@x.com" />
            <Input label="Recovery Phone" value={form.recovery_phone} onChange={(e) => set("recovery_phone", e.target.value)} placeholder="+1..." />
          </div>
        )}

        {/* License key */}
        {showLicense && <Input label="License Key" value={form.license_key} onChange={(e) => set("license_key", e.target.value)} placeholder="XXXXX-XXXXX-XXXXX" />}

        {/* Shared-account seats */}
        {showShared && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5">
            <Input label="Maximum Users" type="number" value={form.max_users} onChange={(e) => set("max_users", e.target.value)} placeholder="8" />
            <Input label="Current Users" type="number" value={form.current_users} onChange={(e) => set("current_users", e.target.value)} placeholder="0" />
          </div>
        )}

        {/* Credential allocation multiplier — how many times this ONE credential can be sold. */}
        {!showShared && (
          <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20">
            <Input label="Sale multiplier (times this credential can be sold)" type="number" value={form.multiplier} onChange={(e) => set("multiplier", e.target.value)} placeholder="1" />
            <p className="text-[10px] text-purple-300/40 mt-1">1 = single-use. Higher values let the same credential fulfil multiple sales without duplicating it. Stock = sum of remaining slots.</p>
          </div>
        )}

        {/* Free-text fallback (always available; overrides structured on save if filled) */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Raw credentials (optional — overrides fields above)</label>
          <textarea rows={2} value={form.credentials} onChange={(e) => set("credentials", e.target.value)} placeholder="email@domain.com|password|recovery" className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 font-mono focus:outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200/70 font-space">Workflow</label>
            <select value={form.workflow} onChange={(e) => set("workflow", e.target.value)} className={inputCls}>
              {ALL_WORKFLOWS.map((w) => <option key={w} value={w} className="bg-neutral-900">{WORKFLOW_META[w].label}</option>)}
            </select>
            <p className="text-[10px] text-purple-300/40 mt-1">Set to <span className="text-emerald-300 font-semibold">Published</span> to count toward product stock and make it purchasable.</p>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200/70 font-space">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              {ALL_STATUSES.map((s) => <option key={s} value={s} className="bg-neutral-900">{STATUS_META[s].label}</option>)}
            </select>
          </div>
          <Input label="Supplier" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Supplier name" />
          <Input label="Tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="fresh, aged" />
          <Input label="Country" value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="US" />
          <Input label="Expiry (optional)" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} placeholder="2026-12-31" />
          <Input label="Label (optional)" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="batch-jan" />
          <label className="flex items-center gap-2 mt-6 cursor-pointer select-none">
            <input type="checkbox" checked={form.isWarranty} onChange={(e) => set("isWarranty", e.target.checked)} className="accent-purple-500" />
            <span className="text-[11px] text-purple-200/80 font-space">Warranty stock</span>
          </label>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Private Notes (admin only)</label>
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 focus:outline-none" />
        </div>

        {/* Authentication methods — only for saved items (needs an id to attach config) */}
        {form.id ? (
          <>
            <AuthenticatorConfig credentialId={form.id} hasTotp={(form as any).hasTotp} />
            <EmailVerifyConfig credentialId={form.id} />
          </>
        ) : (
          <p className="text-[10px] text-purple-300/40">Save this item first to configure an Authenticator (TOTP) or Email Verification.</p>
        )}

        <Button onClick={onSave} isLoading={saving} className="w-full">{form.id ? "Save Changes" : "Add Item"}</Button>
      </div>
    </Overlay>
  );
}

// Admin Email Verification configuration for a saved credential.
function EmailVerifyConfig({ credentialId }: { credentialId: number }) {
  const { toast } = useToast();
  const [mailboxes, setMailboxes] = useState<{ id: number; name: string; email_masked: string; enabled: number }[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"self" | "shared">("self");
  // Self-mode (the purchased mailbox's own IMAP settings).
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [imapHost, setImapHost] = useState("mail.spacemail.com");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  // Shared-mode (central admin mailbox).
  const [mailboxId, setMailboxId] = useState<string>("");
  // Matching rules (both modes).
  const [sender, setSender] = useState("");
  const [altAddress, setAltAddress] = useState("");
  const [subjectKeywords, setSubjectKeywords] = useState("");
  const [bodyKeywords, setBodyKeywords] = useState("");
  const [ignoreKeywords, setIgnoreKeywords] = useState("");
  const [regex, setRegex] = useState("");
  const [otpLength, setOtpLength] = useState(0);
  const [extractLink, setExtractLink] = useState(true);
  const [maxAgeSec, setMaxAgeSec] = useState(600);
  // Advanced parsing engine controls.
  const [recipient, setRecipient] = useState("");
  const [senderDomain, setSenderDomain] = useState("");
  const [forwarded, setForwarded] = useState(true);
  const [preferUnread, setPreferUnread] = useState(true);
  const [linkOnly, setLinkOnly] = useState(false);
  const [ignoreUsed, setIgnoreUsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingRule, setTestingRule] = useState(false);
  const [ruleResult, setRuleResult] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mb, cfg] = await Promise.all([
          apiFetch("/api/admin/email/mailboxes/list").catch(() => ({ mailboxes: [] })),
          apiFetch(`/api/admin/inventory/${credentialId}/email-verify`),
        ]);
        if (!alive) return;
        setMailboxes(mb.mailboxes || []);
        const c = cfg.config || {};
        setEnabled(!!c.enabled);
        setMode(c.mode === "shared" ? "shared" : "self");
        setAddress(c.address || "");
        setHasPassword(!!c.hasPassword);
        setImapHost(c.imapHost || "mail.spacemail.com");
        setImapPort(c.imapPort || 993);
        setImapSecure(c.imapSecure !== false);
        setMailboxId(c.mailboxId ? String(c.mailboxId) : "");
        setSender(c.sender || "");
        setAltAddress(c.altAddress || "");
        setSubjectKeywords(c.subjectKeywords || "");
        setBodyKeywords(c.bodyKeywords || "");
        setIgnoreKeywords(c.ignoreKeywords || "");
        setRegex(c.regex || "");
        setOtpLength(c.otpLength || 0);
        setExtractLink(c.extractLink !== false);
        setMaxAgeSec(c.maxAgeSec || 600);
        setRecipient(c.recipient || "");
        setSenderDomain(c.senderDomain || "");
        setForwarded(c.forwarded !== false);
        setPreferUnread(c.preferUnread !== false);
        setLinkOnly(!!c.linkOnly);
        setIgnoreUsed(!!c.ignoreUsed);
        if (c.ignoreKeywords || c.regex || c.otpLength || c.altAddress || c.recipient || c.senderDomain || c.linkOnly) setShowAdvanced(true);
      } catch { /* silent */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [credentialId]);

  const rulePart = { sender, altAddress, subjectKeywords, bodyKeywords, ignoreKeywords, regex, otpLength, extractLink, maxAgeSec, recipient, senderDomain, forwarded, preferUnread, linkOnly, ignoreUsed };
  const buildPayload = () => mode === "shared"
    ? { mode, mailboxId: parseInt(mailboxId), ...rulePart }
    : { mode, address, password, imapHost, imapPort, imapSecure, ...rulePart };

  const save = async () => {
    if (mode === "shared" && !mailboxId) { toast("Select a linked mailbox first.", "error"); return; }
    if (mode === "self") {
      if (!address.trim()) { toast("Enter the mailbox email address.", "error"); return; }
      if (!imapHost.trim()) { toast("Enter the IMAP host.", "error"); return; }
      if (!hasPassword && !password.trim()) { toast("Enter the mailbox password.", "error"); return; }
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/inventory/${credentialId}/email-verify`, { method: "POST", body: JSON.stringify(buildPayload()) });
      toast("Email code retrieval configured.", "success");
      setEnabled(true);
      if (mode === "self" && password.trim()) { setHasPassword(true); setPassword(""); }
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!address.trim() || !imapHost.trim() || (!hasPassword && !password.trim())) { toast("Enter address, password and IMAP host to test.", "error"); return; }
    setTesting(true);
    try {
      const r = await apiFetch(`/api/admin/inventory/${credentialId}/email-verify/test`, { method: "POST", body: JSON.stringify({ address, password, imapHost, imapPort, imapSecure }) });
      toast(r.success ? `IMAP connected ✅ (${r.mailboxExists ?? 0} messages)` : "IMAP failed: " + r.error, r.success ? "success" : "error", { big: !r.success });
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setTesting(false); }
  };

  const testRule = async () => {
    setTestingRule(true); setRuleResult(null);
    try {
      const body = mode === "shared" ? { mode, mailboxId: parseInt(mailboxId), ...rulePart } : { mode, address, password, imapHost, imapPort, imapSecure, ...rulePart };
      const r = await apiFetch(`/api/admin/inventory/${credentialId}/email-verify/test-rule`, { method: "POST", body: JSON.stringify(body) });
      setRuleResult(r);
    } catch (err: any) { setRuleResult({ success: false, status: "Error", reason: err.message }); }
    finally { setTestingRule(false); }
  };

  const disable = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/inventory/${credentialId}/email-verify`, { method: "POST", body: JSON.stringify({ enabled: false }) });
      toast("Email code retrieval disabled.", "success"); setEnabled(false);
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-3 rounded-xl border border-purple-500/10 bg-purple-500/5 text-[11px] text-purple-300/40 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading email config…</div>;

  const inputCls = "w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 focus:outline-none";
  const lblCls = "text-[10px] font-bold text-purple-200/60 uppercase tracking-wide";

  return (
    <div className="space-y-2 p-3 rounded-xl border border-purple-500/15 bg-purple-500/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-purple-300 font-space flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email Code Retrieval</span>
        {enabled ? <span className="text-[10px] font-bold text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Enabled</span> : <span className="text-[10px] text-purple-300/40">Not configured</span>}
      </div>
      <p className="text-[10px] text-purple-300/40 leading-relaxed">Reads verification codes sent by third-party services (Facebook, Google, etc.) to this purchased mailbox. Never sends email.</p>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1">
        <button type="button" onClick={() => setMode("self")} className={`flex-1 py-1 rounded-md text-[10px] font-bold cursor-pointer ${mode === "self" ? "bg-purple-500/25 text-white" : "text-purple-300/50"}`}>This mailbox (IMAP)</button>
        <button type="button" onClick={() => setMode("shared")} className={`flex-1 py-1 rounded-md text-[10px] font-bold cursor-pointer ${mode === "shared" ? "bg-purple-500/25 text-white" : "text-purple-300/50"}`}>Shared admin mailbox</button>
      </div>

      {mode === "self" ? (
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><label className={lblCls}>Email Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="account@gmail.com" className={inputCls} /></div>
            <div className="space-y-1"><label className={lblCls}>Email Password {hasPassword ? "(saved)" : ""}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={hasPassword ? "•••••• (leave blank to keep)" : "app password"} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-2"><label className={lblCls}>IMAP Host</label><input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="mail.spacemail.com" className={inputCls} /></div>
            <div className="space-y-1"><label className={lblCls}>Port</label><input type="number" value={imapPort} onChange={(e) => setImapPort(parseInt(e.target.value) || 993)} className={inputCls} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} className="accent-purple-500" /> Use SSL/TLS (993)</label>
        </div>
      ) : (
        mailboxes.length === 0 ? (
          <p className="text-[10px] text-amber-300/70">No shared mailboxes exist yet. Create one in Security Center → Email Verification → Mailboxes, or use "This mailbox".</p>
        ) : (
          <div className="space-y-1">
            <label className={`${lblCls} flex items-center gap-1`}><Inbox className="h-3 w-3" /> Linked Mailbox</label>
            <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} className={inputCls}>
              <option value="" className="bg-neutral-900">— Select mailbox —</option>
              {mailboxes.map((m) => <option key={m.id} value={m.id} className="bg-neutral-900">{m.name} ({m.email_masked}){m.enabled === 0 ? " · disabled" : ""}</option>)}
            </select>
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1"><label className={lblCls}>Expected Sender (optional)</label><input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="security@facebookmail.com" className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><label className={lblCls}>Subject Keywords</label><input value={subjectKeywords} onChange={(e) => setSubjectKeywords(e.target.value)} placeholder="code, login" className={inputCls} /></div>
          <div className="space-y-1"><label className={lblCls}>Body Keywords</label><input value={bodyKeywords} onChange={(e) => setBodyKeywords(e.target.value)} placeholder="verification" className={inputCls} /></div>
        </div>
        <div className="space-y-1">
          <label className={lblCls}>Maximum Email Age</label>
          <select value={maxAgeSec} onChange={(e) => setMaxAgeSec(parseInt(e.target.value))} className={inputCls}>
            <option value={120} className="bg-neutral-900">2 minutes</option>
            <option value={300} className="bg-neutral-900">5 minutes</option>
            <option value={600} className="bg-neutral-900">10 minutes</option>
            <option value={1800} className="bg-neutral-900">30 minutes</option>
            <option value={86400} className="bg-neutral-900">24 hours</option>
          </select>
        </div>
      </div>

      {/* Advanced matching rules */}
      <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="w-full flex items-center justify-between text-[10px] font-bold text-cyan-300/80 hover:text-cyan-300 cursor-pointer pt-1">
        <span className="uppercase tracking-wide">Advanced matching rules</span>
        <span>{showAdvanced ? "▲" : "▼"}</span>
      </button>
      {showAdvanced && (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-purple-500/10 bg-black/20 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><label className={lblCls}>Expected Recipient Address</label><input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="account@service.com" className={inputCls} /></div>
            <div className="space-y-1"><label className={lblCls}>Expected Sender Domain</label><input value={senderDomain} onChange={(e) => setSenderDomain(e.target.value)} placeholder="netflix.com" className={inputCls} /></div>
          </div>
          <div className="space-y-1"><label className={lblCls}>Alternate Sender Address</label><input value={altAddress} onChange={(e) => setAltAddress(e.target.value)} placeholder="no-reply@fb.com" className={inputCls} /></div>
          <div className="space-y-1"><label className={lblCls}>Ignore Keywords (skip emails containing)</label><input value={ignoreKeywords} onChange={(e) => setIgnoreKeywords(e.target.value)} placeholder="newsletter, promotion, unsubscribe" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><label className={lblCls}>Regex Pattern</label><input value={regex} onChange={(e) => setRegex(e.target.value)} placeholder={"\\b\\d{6}\\b"} className={`${inputCls} font-mono`} /></div>
            <div className="space-y-1"><label className={lblCls}>OTP Length (0 = auto)</label><input type="number" min={0} max={12} value={otpLength} onChange={(e) => setOtpLength(parseInt(e.target.value) || 0)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={extractLink} onChange={(e) => setExtractLink(e.target.checked)} className="accent-purple-500" /> Extract verification link</label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={linkOnly} onChange={(e) => setLinkOnly(e.target.checked)} className="accent-purple-500" /> Link-only verification</label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={forwarded} onChange={(e) => setForwarded(e.target.checked)} className="accent-purple-500" /> Detect forwarded emails</label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={preferUnread} onChange={(e) => setPreferUnread(e.target.checked)} className="accent-purple-500" /> Prioritize unread emails</label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-purple-200/70"><input type="checkbox" checked={ignoreUsed} onChange={(e) => setIgnoreUsed(e.target.checked)} className="accent-purple-500" /> Ignore previously-used emails</label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={save} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-[11px] font-bold text-purple-200 hover:bg-purple-500/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">{enabled ? "Save Settings" : "Enable Email Code Retrieval"}</button>
        {mode === "self" && <button onClick={test} disabled={testing} className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1">{testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Test IMAP</button>}
        <button onClick={testRule} disabled={testingRule} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1">{testingRule ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />} Test Rule</button>
        {enabled && <button onClick={disable} disabled={saving} className="px-3 py-1.5 rounded-lg border border-red-500/25 text-[11px] font-bold text-red-300 hover:bg-red-500/10 cursor-pointer">Disable</button>}
      </div>

      {/* Test Rule result (#5) */}
      {ruleResult && (
        <div className={`rounded-lg border p-2.5 text-[11px] space-y-1 ${ruleResult.matched ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">{ruleResult.matched ? "Matched Email" : (ruleResult.status || "No match")}</span>
            <span className="text-[9px] text-purple-300/40">{ruleResult.searchTimeMs != null ? `${ruleResult.searchTimeMs}ms · scanned ${ruleResult.scanned ?? 0}` : ""}</span>
          </div>
          {ruleResult.matched ? (
            <div className="text-purple-200/70 space-y-0.5">
              <div><span className="text-purple-300/40">Sender:</span> {ruleResult.sender}</div>
              <div><span className="text-purple-300/40">Subject:</span> {ruleResult.subject}</div>
              <div><span className="text-purple-300/40">Code:</span> <span className="font-mono font-bold text-cyan-300">{ruleResult.code || "— none —"}</span></div>
              <div className="break-all"><span className="text-purple-300/40">Link:</span> <span className="font-mono text-purple-300">{ruleResult.link || "— none —"}</span></div>
              <div><span className="text-purple-300/40">Status:</span> <span className="text-emerald-300 font-bold">Success</span></div>
            </div>
          ) : (
            <p className="text-amber-200/70">{ruleResult.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Admin authenticator (TOTP) configuration for a saved credential.
function AuthenticatorConfig({ credentialId, hasTotp }: { credentialId: number; hasTotp?: boolean }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(!!hasTotp);
  const [secret, setSecret] = useState("");
  const [validation, setValidation] = useState<{ valid: boolean; sampleCode?: string; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = async (val: string) => {
    if (!val.trim()) { setValidation(null); return; }
    setChecking(true);
    try {
      const r = await apiFetch("/api/admin/inventory/totp/validate", { method: "POST", body: JSON.stringify({ secret: val }) });
      setValidation(r);
    } catch { setValidation({ valid: false, error: "Validation failed." }); }
    finally { setChecking(false); }
  };

  const save = async () => {
    if (!validation?.valid) { toast("Enter a valid secret first.", "error"); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/inventory/${credentialId}/totp`, { method: "POST", body: JSON.stringify({ secret, enabled: true }) });
      toast("Authenticator configured (secret encrypted).", "success");
      setEnabled(true); setSecret(""); setValidation(null);
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  const disable = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/inventory/${credentialId}/totp`, { method: "POST", body: JSON.stringify({ enabled: false }) });
      toast("Authenticator disabled.", "success"); setEnabled(false);
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  // Decode an uploaded QR image → otpauth secret, entirely client-side via BarcodeDetector
  // when available; otherwise instruct the admin to paste the secret.
  const onQrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const BD = (window as any).BarcodeDetector;
      if (!BD) { toast("QR auto-decode isn't supported in this browser — please paste the secret instead.", "warning"); return; }
      const bitmap = await createImageBitmap(file);
      const detector = new BD({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      if (codes && codes[0] && codes[0].rawValue) {
        setSecret(codes[0].rawValue);
        validate(codes[0].rawValue);
        toast("QR decoded.", "success");
      } else toast("No QR code found in the image.", "error");
    } catch { toast("Could not read the QR image — please paste the secret.", "error"); }
  };

  return (
    <div className="space-y-2 p-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-cyan-300 font-space flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Authenticator (TOTP)</span>
        {enabled ? <span className="text-[10px] font-bold text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Enabled</span> : <span className="text-[10px] text-purple-300/40">Not configured</span>}
      </div>
      <textarea
        rows={2}
        value={secret}
        onChange={(e) => { setSecret(e.target.value); validate(e.target.value); }}
        placeholder="Paste secret key or otpauth:// URI"
        className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 font-mono focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="text-[10px] font-bold text-cyan-300/80 hover:text-cyan-300 cursor-pointer inline-flex items-center gap-1"><Upload className="h-3 w-3" /> Upload QR</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onQrFile} />
        {checking ? <span className="text-[10px] text-purple-300/50 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>
          : validation ? (validation.valid
            ? <span className="text-[10px] font-bold text-emerald-300">✓ Secret Valid{validation.sampleCode ? ` · ${validation.sampleCode}` : ""}</span>
            : <span className="text-[10px] font-bold text-red-300">❌ {validation.error || "Invalid Secret"}</span>) : null}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || !validation?.valid} className="flex-1 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Save / Replace Secret</button>
        {enabled && <button onClick={disable} disabled={saving} className="px-3 py-1.5 rounded-lg border border-red-500/25 text-[11px] font-bold text-red-300 hover:bg-red-500/10 cursor-pointer">Disable</button>}
      </div>
      {enabled && <UsageLimitControl credentialId={credentialId} />}
    </div>
  );
}

// Per-credential usage-limit override + reset usage.
function UsageLimitControl({ credentialId }: { credentialId: number }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const setLimit = async (limit: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/inventory/${credentialId}/totp/limit`, { method: "POST", body: JSON.stringify({ limit }) });
      toast(limit === -1 ? "Using global default limit." : limit === 0 ? "Set to unlimited." : `Limit set to ${limit}.`, "success");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try { await apiFetch(`/api/admin/inventory/${credentialId}/totp/reset-usage`, { method: "POST" }); toast("Usage reset.", "success"); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="border-t border-purple-500/10 pt-2 space-y-1.5">
      <span className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">"Get Code" usage limit</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {[[-1, "Global"], [0, "Unlimited"], [1, "1"], [3, "3"], [5, "5"], [10, "10"]].map(([v, label]) => (
          <button key={String(v)} onClick={() => setLimit(v as number)} disabled={busy} className="px-2 py-1 rounded-lg border border-purple-500/20 bg-black/20 text-[10px] font-bold text-purple-200/70 hover:bg-white/5 cursor-pointer disabled:opacity-40">{label}</button>
        ))}
        <button onClick={reset} disabled={busy} className="px-2 py-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Reset usage</button>
      </div>
    </div>
  );
}

// Account testing surface — record working/broken + checklist, then approve/reject/archive.
function TestModal({ credential, onClose, onDone }: { credential: Credential; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState(credential.test_result || "working");
  const [flags, setFlags] = useState<Record<string, boolean>>({ login_working: false, twofa_working: false, cookie_updated: false, proxy_used: false });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (decision: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/inventory/credentials/${credential.id}/test`, { method: "POST", body: JSON.stringify({ result, flags, notes, decision }) });
      toast(decision === "approve" ? "Approved → Ready." : decision === "reject" || decision === "archive" ? "Rejected → Archived." : "Test saved.", "success");
      onDone();
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setBusy(false); }
  };
  const toggle = (k: string) => setFlags((f) => ({ ...f, [k]: !f[k] }));
  const CHECKS: [string, string][] = [["login_working", "Login working"], ["twofa_working", "2FA working"], ["cookie_updated", "Cookie updated"], ["proxy_used", "Proxy used"]];
  return (
    <Overlay onClose={onClose} title="Test Account" icon={<FlaskConical className="h-4.5 w-4.5 text-cyan-400" />}>
      <div className="space-y-3 text-left">
        <div className="font-mono text-[11px] text-purple-200/70 break-all p-2 rounded-lg bg-black/30 border border-purple-500/10">{credential.credentials}</div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Result</label>
          <select value={result} onChange={(e) => setResult(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="working" className="bg-neutral-900">Working</option>
            <option value="broken" className="bg-neutral-900">Broken</option>
            <option value="password_changed" className="bg-neutral-900">Password Changed</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CHECKS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer text-[11px] text-purple-200/80 p-2 rounded-lg border border-purple-500/10 bg-black/20">
              <input type="checkbox" checked={!!flags[k]} onChange={() => toggle(k)} className="accent-cyan-500" /> {label}
            </label>
          ))}
        </div>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tester notes (optional)" className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 focus:outline-none" />
        <div className="flex items-center gap-2">
          <Button onClick={() => submit("approve")} isLoading={busy} className="flex-1">Approve → Ready</Button>
          <button onClick={() => submit("reject")} disabled={busy} className="px-4 py-2 rounded-lg border border-red-500/25 text-red-300 text-sm font-bold cursor-pointer">Reject</button>
        </div>
        <button onClick={() => submit("")} disabled={busy} className="w-full text-[11px] text-purple-300/60 hover:text-white cursor-pointer">Save test only (keep in testing)</button>
      </div>
    </Overlay>
  );
}

function ImportModal({ products, defaultProductId, onClose, onDone }: {
  products: ProductLite[]; defaultProductId: string; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState(defaultProductId || "");
  const [logs, setLogs] = useState("");
  const [isWarranty, setIsWarranty] = useState(false);
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      // If CSV with product_id,credentials columns, keep only the credential column when a product is chosen.
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsed = lines.map((l) => {
        // Strip a leading "productId," if present (simple CSV heuristic).
        if (productId && l.startsWith(productId + ",")) return l.slice(productId.length + 1);
        return l;
      });
      setLogs(parsed.join("\n"));
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!productId || !logs.trim()) { toast("Choose a product and paste/import credentials.", "error"); return; }
    setImporting(true);
    try {
      const res = await apiFetch("/api/admin/inventory/bulk-upload", {
        method: "POST",
        body: JSON.stringify({ productId, logs, isWarranty, region, country }),
      });
      toast(res.message || "Imported.", "success");
      onDone();
    } catch (err: any) {
      toast("Import failed: " + err.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Overlay onClose={onClose} title="Bulk Import Credentials" icon={<Upload className="h-4.5 w-4.5 text-cyan-400" />}>
      <div className="space-y-3 text-left">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="" className="bg-neutral-900">-- Choose product --</option>
            {products.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Credentials (one per line)</label>
          <textarea rows={6} value={logs} onChange={(e) => setLogs(e.target.value)} placeholder={"email1@x.com|pass|recovery\nemail2@x.com|pass|recovery"} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 font-mono focus:outline-none" />
          <p className="text-[10px] text-purple-300/50">Duplicate lines within this batch are skipped automatically.</p>
        </div>
        <div className="space-y-1 border-t border-purple-500/10 pt-3">
          <label className="text-[11px] font-bold text-cyan-400 font-space uppercase">Or import a CSV / TXT file</label>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="w-full text-xs text-purple-200/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600/15 file:text-purple-300 hover:file:bg-purple-600/25 cursor-pointer" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Country (optional)" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
          <Input label="Region (optional)" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="EU" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={isWarranty} onChange={(e) => setIsWarranty(e.target.checked)} className="accent-purple-500" />
          <span className="text-[11px] text-purple-200/80 font-space">Import as warranty replacement stock (not for sale)</span>
        </label>
        <Button onClick={submit} isLoading={importing} className="w-full">Import Credentials</Button>
      </div>
    </Overlay>
  );
}

function AuditModal({ credential, onClose }: { credential: Credential; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setRows(await apiFetch(`/api/admin/inventory/audit?credentialId=${credential.id}`)); }
      catch { setRows([]); } finally { setLoading(false); }
    })();
  }, [credential.id]);
  return (
    <Overlay onClose={onClose} title="Credential History" icon={<History className="h-4.5 w-4.5 text-cyan-400" />}>
      <div className="text-left space-y-2 max-h-[60vh] overflow-y-auto">
        <div className="font-mono text-[11px] text-purple-200/70 break-all p-2 rounded-lg bg-black/30 border border-purple-500/10">{credential.credentials}</div>
        {loading ? <p className="text-xs text-purple-300/50 py-4 text-center">Loading history…</p>
          : rows.length === 0 ? <p className="text-xs text-purple-300/50 py-4 text-center">No history recorded.</p>
          : rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2 p-2 rounded-lg border border-purple-500/10 bg-black/20">
              <div className="mt-0.5"><Badge variant="default">{r.action}</Badge></div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-purple-100">{r.detail || "—"}</div>
                <div className="text-[10px] text-purple-300/50 mt-0.5">{r.actor_name} · {new Date(r.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
      </div>
    </Overlay>
  );
}

function AssignModal({ credential, onClose, onDone }: { credential: Credential; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [orderId, setOrderId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const submit = async () => {
    if (!orderId.trim()) { toast("Enter an order ID.", "error"); return; }
    setAssigning(true);
    try {
      await apiFetch(`/api/admin/inventory/credentials/${credential.id}/assign`, { method: "POST", body: JSON.stringify({ orderId: orderId.trim() }) });
      toast("Credential assigned and delivered to the customer.", "success");
      onDone();
    } catch (err: any) {
      toast("Assign failed: " + err.message, "error");
    } finally { setAssigning(false); }
  };
  return (
    <Overlay onClose={onClose} title="Assign to Order" icon={<PackageCheck className="h-4.5 w-4.5 text-cyan-400" />}>
      <div className="space-y-3 text-left">
        <div className="font-mono text-[11px] text-purple-200/70 break-all p-2 rounded-lg bg-black/30 border border-purple-500/10">{credential.credentials}</div>
        <p className="text-[11px] text-purple-300/60">Assign this credential to a pending order. The order will be marked completed and the customer notified.</p>
        <Input label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. 1a2b3c" />
        <Button onClick={submit} isLoading={assigning} className="w-full">Assign & Deliver</Button>
      </div>
    </Overlay>
  );
}
