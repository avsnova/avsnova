import { useMemo, useState } from "react";
import { Card, Button, Badge, Input } from "../ui/shadcn";
import ProductImage from "../marketplace/ProductImage";
import ImageUploader from "./ImageUploader";
import { apiFetch } from "../../utils/api";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import {
  PlusCircle, Edit, Key, Copy, Eye, EyeOff, Trash, CheckSquare, Square,
  Search, ShieldCheck, ShieldOff, X,
} from "lucide-react";

// Which module (display_location) this manager is scoped to.
export type ProductModuleScope = "marketplace" | "physical-sim" | "esim" | "gift";

// Per-module defaults so a quick-added product AUTOMATICALLY inherits the right
// category, checkout form and fulfilment — the admin only enters name/desc/price/images.
const MODULE_DEFAULTS: Record<ProductModuleScope, {
  category: string; subcategory: string; type: "physical" | "digital";
  delivery_type: string; shipping_type: string; idPrefix: string; stock: number;
}> = {
  "physical-sim": { category: "communication", subcategory: "SIM Cards", type: "physical", delivery_type: "manual", shipping_type: "local", idPrefix: "psim", stock: 9999 },
  "esim":         { category: "communication", subcategory: "eSIM",      type: "digital",  delivery_type: "manual", shipping_type: "local", idPrefix: "esim", stock: 9999 },
  "gift":         { category: "gifts",         subcategory: "Gifts",     type: "physical", delivery_type: "manual", shipping_type: "international", idPrefix: "gift", stock: 9999 },
  "marketplace":  { category: "digital",       subcategory: "",          type: "digital",  delivery_type: "instant", shipping_type: "local", idPrefix: "prod", stock: 0 },
};

interface ModuleProductsManagerProps {
  scope: ProductModuleScope;
  title: string;
  subtitle: string;
  products: any[];
  /** Whether this module tracks stock. Gifting is stockless. */
  stockless?: boolean;
  // Reused handlers from AdminPanel so we don't duplicate business logic.
  onEdit: (product: any) => void;
  onStudio: (product: any | null) => void;
  onCredentials: (p: { id: string; name: string }) => void;
  onDuplicate: (id: string) => void;
  onToggleStatus: (product: any) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void | Promise<void>;
}

// Heuristic scope matcher: prefer the explicit display_location column; fall back to
// category/name for legacy rows created before the column existed.
function matchesScope(p: any, scope: ProductModuleScope): boolean {
  const loc = String(p.display_location || "").toLowerCase().trim().replace(/\s+/g, "-");
  if (loc) {
    if (loc === "physical sim") return scope === "physical-sim";
    return loc === scope;
  }
  // Legacy fallback (rows with no display_location set).
  const cat = String(p.category || "").toLowerCase();
  const name = String(p.name || "").toLowerCase();
  if (scope === "gift") return cat === "gifts" || name.includes("gift");
  if (scope === "esim") return name.includes("esim") || name.includes("e-sim");
  if (scope === "physical-sim") return (name.includes("sim") && !name.includes("esim")) || name.includes("physical sim");
  // Marketplace = everything that isn't clearly one of the other modules.
  return cat !== "gifts" && !name.includes("esim") && !name.includes("e-sim");
}

export default function ModuleProductsManager({
  scope, title, subtitle, products, stockless,
  onEdit, onStudio, onCredentials, onDuplicate, onToggleStatus, onDelete, onRefresh,
}: ModuleProductsManagerProps) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // ——— Quick Add: admin only enters Name / Description / Price / Images (Req 5) ———
  // Everything else (category, checkout form, fulfilment, stock rules) is inherited
  // from the module automatically.
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quick, setQuick] = useState({ name: "", description: "", price: "", cover: "", gallery: "" });

  const resetQuick = () => setQuick({ name: "", description: "", price: "", cover: "", gallery: "" });

  const submitQuickAdd = async () => {
    const d = MODULE_DEFAULTS[scope];
    const priceNum = parseFloat(quick.price);
    if (!quick.name.trim()) { toast("Product name is required.", "warning"); return; }
    if (isNaN(priceNum) || priceNum < 0) { toast("Enter a valid price.", "warning"); return; }
    const id = `${d.idPrefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    setQuickBusy(true);
    try {
      await apiFetch("/api/admin/products/create", {
        method: "POST",
        body: JSON.stringify({
          id,
          name: quick.name.trim(),
          description: quick.description.trim() || `${quick.name.trim()}.`,
          price: priceNum,
          category: d.category,
          subcategory: d.subcategory,
          type: d.type,
          delivery_type: d.delivery_type,
          shipping_type: d.shipping_type,
          stock: d.stock,
          icon: quick.cover || "📦",
          multiple_images: quick.gallery || "",
          status: 1,
        }),
      });
      // Route the product to this module (primary section drives its checkout + fulfilment).
      await apiFetch(`/api/admin/products/display-location/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ display_location: scope, display_locations: [scope] }),
      });
      toast(`"${quick.name.trim()}" added to ${title}.`, "success");
      resetQuick();
      setQuickOpen(false);
      await onRefresh();
    } catch (err: any) {
      toast("Failed to add product: " + (err?.message || "unknown error"), "error");
    } finally {
      setQuickBusy(false);
    }
  };

  const scoped = useMemo(
    () => products.filter((p) => matchesScope(p, scope)),
    [products, scope]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (p) =>
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.id || "").toLowerCase().includes(q) ||
        String(p.category || "").toLowerCase().includes(q)
    );
  }, [scoped, search]);

  const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(visible.map((p) => p.id)));
  const deselectAll = () => setSelected(new Set());

  // Bulk action against the existing /api/admin/products/bulk endpoint.
  const runBulk = async (action: "activate" | "deactivate" | "delete") => {
    const ids = Array.from(selected).filter((id) => visible.some((p) => p.id === id));
    if (ids.length === 0) {
      toast("No products selected.", "warning");
      return;
    }
    if (action === "delete") {
      const ok = await confirm(`Permanently delete ${ids.length} selected product(s)? This cannot be undone.`);
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/products/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, action }),
      });
      const verb = action === "delete" ? "deleted" : action === "activate" ? "enabled" : "disabled";
      toast(`${ids.length} product(s) ${verb}.`, "success");
      deselectAll();
      await onRefresh();
    } catch (err: any) {
      toast("Bulk action failed: " + (err?.message || "unknown error"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight">{title}</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => { resetQuick(); setQuickOpen(true); }} className="flex items-center gap-1.5">
            <PlusCircle className="h-4 w-4" /> New Product
          </Button>
          <button
            onClick={() => onStudio(null)}
            className="text-[11px] font-bold text-purple-200/60 hover:text-white underline underline-offset-2 cursor-pointer"
            title="Open the full Product Studio for advanced options"
          >
            Advanced
          </button>
        </div>
      </div>

      {/* ——— QUICK ADD MODAL (name / description / price / images only) ——— */}
      {quickOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !quickBusy && setQuickOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-purple-500/30 bg-[#0d0422] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar-thin text-left">
            <div className="flex justify-between items-start border-b border-purple-500/15 pb-3">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">Quick Add — {title}</span>
                <h3 className="text-lg font-bold font-space text-white">New Product</h3>
              </div>
              <button onClick={() => !quickBusy && setQuickOpen(false)} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white hover:bg-white/5 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-300 leading-normal">
              This product will automatically use the <strong>{title}</strong> checkout form and manual fulfillment. You only need name, description, price and images.
            </div>

            <Input label="Product Name" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="e.g. USA Physical SIM Card" required />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200/70 block font-space">Description</label>
              <textarea
                value={quick.description}
                onChange={(e) => setQuick({ ...quick, description: e.target.value })}
                placeholder="Short product description…"
                className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none font-inter placeholder-purple-200/20"
                rows={3}
              />
            </div>

            <Input label="Price (₦)" type="number" min="0" value={quick.price} onChange={(e) => setQuick({ ...quick, price: e.target.value })} placeholder="18500" required />

            <ImageUploader
              cover={quick.cover}
              gallery={quick.gallery}
              onCoverChange={(v: string) => setQuick({ ...quick, cover: v })}
              onGalleryChange={(v: string) => setQuick({ ...quick, gallery: v })}
            />

            <div className="flex gap-2 pt-2">
              <Button onClick={submitQuickAdd} isLoading={quickBusy} className="flex-1">Add Product</Button>
              <Button variant="outline" onClick={() => !quickBusy && setQuickOpen(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-200/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${scoped.length} ${scope} product${scoped.length === 1 ? "" : "s"}…`}
          className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/40"
        />
      </div>

      {/* Bulk action toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          onClick={allSelected ? deselectAll : selectAll}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-500/25 text-purple-200/80 hover:bg-purple-500/10 cursor-pointer font-bold"
        >
          {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {allSelected ? "Deselect All" : "Select All"}
        </button>
        {someSelected && (
          <button
            onClick={deselectAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-500/20 text-purple-200/60 hover:bg-white/5 cursor-pointer font-bold"
          >
            Clear ({selected.size})
          </button>
        )}
        <div className="flex-1" />
        <button
          disabled={!someSelected || busy}
          onClick={() => runBulk("activate")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Bulk Enable
        </button>
        <button
          disabled={!someSelected || busy}
          onClick={() => runBulk("deactivate")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/25 text-amber-300 hover:bg-amber-500/10 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldOff className="h-3.5 w-3.5" /> Bulk Disable
        </button>
        <button
          disabled={!someSelected || busy}
          onClick={() => runBulk("delete")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/15 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash className="h-3.5 w-3.5" /> Delete Selected
        </button>
      </div>

      {/* Product table */}
      <div className="overflow-x-auto custom-scrollbar-thin">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-purple-500/15 text-[10px] font-bold text-purple-200/40 uppercase tracking-wider font-space">
              <th className="py-3 px-3 w-8">
                <button onClick={allSelected ? deselectAll : selectAll} className="cursor-pointer text-purple-200/60 hover:text-white">
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="py-3 px-3">Product</th>
              <th className="py-3 px-3">Price (₦)</th>
              {!stockless && <th className="py-3 px-3">Stock</th>}
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10 text-xs font-inter">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={stockless ? 5 : 6} className="py-10 text-center text-purple-200/40 italic">
                  {scoped.length === 0
                    ? `No ${scope} products yet. Click “New Product” to add one.`
                    : "No products match your search."}
                </td>
              </tr>
            ) : (
              visible.map((p) => {
                const isSel = selected.has(p.id);
                return (
                  <tr key={p.id} className={`transition-colors ${isSel ? "bg-purple-500/10" : "hover:bg-white/5"}`}>
                    <td className="py-3 px-3">
                      <button onClick={() => toggleOne(p.id)} className="cursor-pointer text-purple-200/60 hover:text-white">
                        {isSel ? <CheckSquare className="h-4 w-4 text-cyan-400" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProductImage product={p} className="h-9 w-9" />
                        <div className="min-w-0">
                          <span className="font-bold text-white font-space block truncate max-w-[220px]">{p.name}</span>
                          <span className="text-[9px] text-purple-200/40 uppercase">{p.category} · {p.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold text-emerald-400 font-mono">₦{Number(p.price || 0).toLocaleString()}</td>
                    {!stockless && (
                      <td className="py-3 px-3 font-mono text-purple-200/70">{p.stock ?? 0}</td>
                    )}
                    <td className="py-3 px-3">
                      {p.status === 0 ? (
                        <Badge variant="warning">Disabled</Badge>
                      ) : (
                        <Badge variant="success">Enabled</Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => onStudio(p)} title="Edit in Product Studio" className="p-1.5 rounded-lg border border-purple-500/20 text-cyan-400 hover:bg-cyan-500/10 cursor-pointer bg-black/20">
                          <PlusCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => onEdit(p)} title="Quick Edit" className="p-1.5 rounded-lg border border-purple-500/20 text-cyan-400 hover:bg-cyan-500/10 cursor-pointer bg-black/20">
                          <Edit className="h-4 w-4" />
                        </button>
                        {!stockless && (
                          <button onClick={() => onCredentials({ id: p.id, name: p.name })} title="View / Manage Credentials" className="p-1.5 rounded-lg border border-purple-500/20 text-purple-300 hover:bg-purple-500/10 cursor-pointer bg-black/20">
                            <Key className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => onDuplicate(p.id)} title="Duplicate" className="p-1.5 rounded-lg border border-purple-500/20 text-purple-300 hover:bg-purple-500/10 cursor-pointer bg-black/20">
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onToggleStatus(p)}
                          title={p.status === 0 ? "Enable" : "Disable"}
                          className={`p-1.5 rounded-lg border cursor-pointer bg-black/20 ${p.status === 0 ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10" : "border-amber-500/20 text-amber-400 hover:bg-amber-500/10"}`}
                        >
                          {p.status === 0 ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button onClick={() => onDelete(p.id)} title="Delete" className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer bg-black/20">
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-purple-200/40 font-mono">
        Showing {visible.length} of {scoped.length} {scope} products · {selected.size} selected
      </div>
    </Card>
  );
}
