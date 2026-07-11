import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check, ChevronLeft, ChevronRight, Save, Rocket, Copy, Download, X, AlertTriangle,
  CircleDot, Loader2, Package, FileText, Sparkles, Layers, Plus, Trash, Key,
  Search, RotateCcw, Star, TrendingUp, ThumbsUp, Home,
} from "lucide-react";
import { Card, Button, Input } from "../../ui/shadcn";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import { apiFetch } from "../../../utils/api";
import ImageUploader from "../ImageUploader";
import StudioPreview from "./StudioPreview";
import { validateStudio, studioScore, seoScore, type StudioIssue } from "./validation";
import { STUDIO_STEPS, PRODUCT_TYPES, blankStudioForm, type StudioForm, type StudioVariant } from "./types";

interface ProductLite { id: string; name: string; stock?: number; delivery_type?: string; }
interface CategoryLite { id?: string; name?: string; }

interface Props {
  products: ProductLite[];
  categories?: CategoryLite[];
  /** When provided, opens in edit mode for this existing product. */
  editProduct?: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const DRAFT_KEY = "avs_studio_draft_v1";

// Map an existing product row → the wizard form.
function productToForm(p: any): StudioForm {
  const base = blankStudioForm();
  let variants: StudioVariant[] = [];
  try { if (p.variants) variants = JSON.parse(p.variants); } catch { /* ignore */ }
  return {
    ...base,
    id: p.id || "",
    name: p.name || "",
    productType: p.product_type || base.productType || (p.type === "physical" ? "other" : "digital_account"),
    short_description: p.short_description || "",
    description: p.description || "",
    category: p.category || "digital",
    subcategory: p.subcategory || "",
    brand: p.brand || "",
    tags: p.tags || "",
    sku: p.sku || "",
    internal_notes: p.internal_notes || "",
    icon: p.icon || "📦",
    multiple_images: p.multiple_images || "",
    youtube_url: p.youtube_url || "",
    stock: String(p.stock ?? "100"),
    stockMode: "quantity",
    price: String(p.price ?? ""),
    sale_price: p.sale_price ? String(p.sale_price) : "",
    cost_price: p.cost_price ? String(p.cost_price) : "",
    markup: p.markup ? String(p.markup) : "",
    type: p.type === "physical" ? "physical" : "digital",
    delivery_type: p.delivery_type || "instant",
    delivery_estimate: p.delivery_estimate || "",
    warranty_period: p.warranty_period || "",
    replacement_policy: p.replacement_policy || "",
    expiration: p.expiration || "",
    shipping_type: p.shipping_type === "international" ? "international" : "local",
    delivery_countries: p.delivery_countries || "",
    variants,
    seo_title: p.seo_title || "",
    seo_description: p.seo_description || "",
    seo_keywords: p.seo_keywords || "",
    featured: p.featured || 0,
    newest: p.newest || 0,
    popular: p.popular || 0,
    setup_guide: p.setup_guide || "",
    custom_fields: p.custom_fields || "",
    specifications: p.specifications || "",
    related_products: p.related_products || "",
    status: String(p.status ?? "1"),
    is_draft: p.is_draft || 0,
  };
}

// Build the API payload from the form.
// Map the Studio's product-type presets → the Inventory module's taxonomy.
function studioTypeToInventoryType(productType: string): string {
  switch (productType) {
    case "digital_account": case "vpn": return "login";
    case "digital_key": case "software": return "license";
    case "subscription": return "shared";
    case "digital_download": return "download";
    case "custom_service": return "service";
    default: return "login";
  }
}

function formToPayload(f: StudioForm) {
  const stock = f.stockMode === "unlimited" ? 999999 : (parseInt(f.stock) || 0);
  return {
    inventory_type: studioTypeToInventoryType(f.productType),
    id: f.id,
    name: f.name,
    category: f.category,
    subcategory: f.subcategory,
    price: f.price,
    cost_price: f.cost_price,
    markup: f.markup,
    stock: String(stock),
    type: f.type,
    delivery_type: f.delivery_type,
    file_url: "",
    custom_fields: f.custom_fields,
    setup_guide: f.setup_guide,
    description: f.description,
    icon: f.icon,
    featured: f.featured,
    newest: f.newest,
    popular: f.popular,
    shipping_type: f.shipping_type,
    related_products: f.related_products,
    sku: f.sku,
    delivery_countries: f.delivery_countries,
    delivery_estimate: f.delivery_estimate,
    multiple_images: f.multiple_images,
    specifications: f.specifications,
    status: f.status,
    seo_title: f.seo_title,
    seo_description: f.seo_description,
    seo_keywords: f.seo_keywords,
    variants: JSON.stringify(f.variants || []),
    is_draft: f.is_draft,
  };
}

export default function ProductStudio({ products, categories = [], editProduct, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isEdit = !!editProduct;

  const [form, setForm] = useState<StudioForm>(() => {
    if (editProduct) return productToForm(editProduct);
    // Restore autosaved draft when creating fresh.
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) return { ...blankStudioForm(), ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return blankStudioForm();
  });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [idCheck, setIdCheck] = useState<{ idTaken: boolean; skuTaken: boolean }>({ idTaken: false, skuTaken: false });
  const [availableCreds, setAvailableCreds] = useState<number>(0);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const set = useCallback((patch: Partial<StudioForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  // ---- Autosave drafts to localStorage (create mode only) ----
  useEffect(() => {
    if (isEdit || !dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); setLastSaved(new Date()); } catch { /* ignore */ }
    }, 1200);
    return () => clearTimeout(t);
  }, [form, dirty, isEdit]);

  // ---- ID / SKU uniqueness check (debounced) ----
  useEffect(() => {
    if (!form.id && !form.sku) { setIdCheck({ idTaken: false, skuTaken: false }); return; }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (form.id && !isEdit) params.set("id", form.id);
        if (form.sku) params.set("sku", form.sku);
        if (isEdit) params.set("excludeId", form.id);
        const res = await apiFetch(`/api/admin/products/check?${params.toString()}`);
        setIdCheck({ idTaken: !!res.idTaken, skuTaken: !!res.skuTaken });
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [form.id, form.sku, isEdit]);

  // ---- Available credentials for this product ----
  useEffect(() => {
    if (!form.id) { setAvailableCreds(0); return; }
    (async () => {
      try {
        const res = await apiFetch(`/api/admin/inventory/credentials?productId=${encodeURIComponent(form.id)}&status=available&pageSize=1`);
        setAvailableCreds(res.total || 0);
      } catch { setAvailableCreds(0); }
    })();
  }, [form.id, step]);

  // ---- Templates ----
  useEffect(() => { (async () => { try { setTemplates(await apiFetch("/api/admin/product-templates")); } catch { /* ignore */ } })(); }, []);

  const issues = validateStudio(form, { idTaken: idCheck.idTaken, skuTaken: idCheck.skuTaken, availableCredentials: availableCreds });
  const errors = issues.filter((i) => i.severity === "error");
  const score = studioScore(form, issues);

  const stepIssues = (idx: number) => issues.filter((i) => i.step === idx);

  // ---- Save (draft or publish) ----
  const save = async (publish: boolean) => {
    const payload = formToPayload({ ...form, is_draft: publish ? 0 : 1, status: publish ? "1" : form.status });
    if (publish && errors.length > 0) { toast(`Resolve ${errors.length} error(s) before publishing.`, "error"); return; }
    if (!payload.id || !payload.name) { toast("Product ID and name are required.", "error"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/admin/products/update/${form.id}`, { method: "POST", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/admin/products/create", { method: "POST", body: JSON.stringify(payload) });
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDirty(false);
      toast(publish ? "Product published to the marketplace!" : "Draft saved.", "success");
      onSaved();
    } catch (err: any) {
      toast("Save failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (dirty && !(await confirm({ title: "Discard changes?", message: "You have unsaved changes. Close the studio anyway?", confirmLabel: "Discard", danger: true }))) return;
    onClose();
  };

  const saveAsTemplate = async () => {
    const name = window.prompt("Template name:", `${form.name || "Product"} Template`);
    if (!name) return;
    try {
      await apiFetch("/api/admin/product-templates", { method: "POST", body: JSON.stringify({ name, productType: form.productType, data: JSON.stringify(form) }) });
      setTemplates(await apiFetch("/api/admin/product-templates"));
      toast("Saved as template.", "success");
    } catch (err: any) { toast("Failed: " + err.message, "error"); }
  };

  const applyTemplate = (tpl: any) => {
    try {
      const data = JSON.parse(tpl.data);
      // Keep ID/SKU blank so the admin sets fresh identifiers.
      setForm({ ...blankStudioForm(), ...data, id: isEdit ? form.id : "", sku: "" });
      setDirty(true);
      setShowTemplates(false);
      toast(`Applied "${tpl.name}".`, "success");
    } catch { toast("Could not read template.", "error"); }
  };

  const deleteTemplate = async (id: number) => {
    try { await apiFetch(`/api/admin/product-templates/${id}`, { method: "DELETE" }); setTemplates((t) => t.filter((x) => x.id !== id)); }
    catch (err: any) { toast("Failed: " + err.message, "error"); }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${form.id || "product"}-config.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-[#05020a]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-purple-500/15 bg-[#0a0518]/90 backdrop-blur">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-sm sm:text-base font-bold font-space text-white">{isEdit ? "Edit Product" : "Product Studio"}</h2>
              <p className="text-[10px] text-purple-300/50">
                {dirty ? <span className="text-amber-300">● Unsaved changes</span> : lastSaved ? <span className="text-emerald-300">✓ Draft autosaved {lastSaved.toLocaleTimeString()}</span> : "New product"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTemplates((s) => !s)} className="hidden sm:flex px-3 py-1.5 rounded-lg border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 text-[11px] font-bold text-purple-200 items-center gap-1 cursor-pointer"><Layers className="h-3.5 w-3.5" /> Templates</button>
            <button onClick={() => save(false)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-bold text-cyan-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save Draft</button>
            <button onClick={handleClose} className="p-2 rounded-lg text-purple-200/50 hover:text-white hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Templates drawer */}
        {showTemplates && (
          <div className="px-4 sm:px-6 py-3 border-b border-purple-500/10 bg-black/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-purple-200 font-space">Product Templates</span>
              <button onClick={saveAsTemplate} className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-300 flex items-center gap-1 cursor-pointer"><Plus className="h-3 w-3" /> Save current as template</button>
            </div>
            {templates.length === 0 ? <p className="text-[11px] text-purple-300/40">No templates yet. Build a product and save it as a template for one-click reuse.</p> : (
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-500/20 bg-purple-500/5">
                    <button onClick={() => applyTemplate(t)} className="text-[11px] text-purple-100 hover:text-white cursor-pointer">{t.name}</button>
                    <button onClick={() => deleteTemplate(t.id)} className="text-red-300/60 hover:text-red-300 cursor-pointer"><Trash className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Two-panel body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-0">
          {/* LEFT: step nav */}
          <aside className="border-r border-purple-500/10 p-4 bg-black/20">
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-purple-300/60 mb-1"><span>Completeness</span><span className="font-bold">{score}%</span></div>
              <div className="h-1.5 rounded-full bg-black/40 overflow-hidden"><div className={`h-full rounded-full transition-all ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${score}%` }} /></div>
            </div>
            <nav className="space-y-1">
              {STUDIO_STEPS.map((label, idx) => {
                const si = stepIssues(idx);
                const hasErr = si.some((x) => x.severity === "error");
                const hasWarn = si.some((x) => x.severity === "warning");
                return (
                  <button key={label} onClick={() => setStep(idx)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] cursor-pointer transition ${step === idx ? "bg-purple-500/20 text-white border border-purple-500/30" : "text-purple-200/60 hover:bg-white/5 border border-transparent"}`}>
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${step === idx ? "bg-cyan-500 text-black" : "bg-black/40 text-purple-300/60"}`}>{idx + 1}</span>
                    <span className="flex-1 truncate">{label}</span>
                    {hasErr ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : hasWarn ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 pt-3 border-t border-purple-500/10 space-y-1.5 text-[10px]">
              <div className="flex items-center gap-1.5 text-purple-300/50"><CircleDot className="h-3 w-3" /> {errors.length} error(s)</div>
              <div className="flex items-center gap-1.5 text-purple-300/50"><Check className="h-3 w-3" /> {form.is_draft ? "Draft" : "Live"} status</div>
            </div>
          </aside>

          {/* CENTER: current panel */}
          <main className="p-4 sm:p-6 min-w-0">
            <StepPanel step={step} form={form} set={set} products={products} categories={categories} idCheck={idCheck} availableCreds={availableCreds} issues={issues} score={score} onGoStep={setStep} />
            {/* Step nav buttons */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-purple-500/10">
              <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="px-4 py-2 rounded-lg border border-purple-500/20 text-[12px] font-bold text-purple-200 flex items-center gap-1 disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronLeft className="h-4 w-4" /> Back</button>
              {step < STUDIO_STEPS.length - 1 ? (
                <button onClick={() => setStep((s) => Math.min(STUDIO_STEPS.length - 1, s + 1))} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-[12px] font-bold text-white flex items-center gap-1 cursor-pointer">Next <ChevronRight className="h-4 w-4" /></button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={exportConfig} className="px-3 py-2 rounded-lg border border-purple-500/25 text-[11px] font-bold text-purple-200 flex items-center gap-1 cursor-pointer"><Download className="h-3.5 w-3.5" /> Export</button>
                  <Button onClick={() => save(true)} isLoading={saving} className="flex items-center gap-1"><Rocket className="h-4 w-4" /> {isEdit ? "Save & Publish" : "Publish"}</Button>
                </div>
              )}
            </div>
          </main>

          {/* RIGHT: preview + validation */}
          <aside className="border-l border-purple-500/10 p-4 bg-black/20 space-y-4">
            <StudioPreview form={form} />
            <div>
              <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Validation</span>
              <div className="mt-2 space-y-1.5 max-h-[240px] overflow-y-auto">
                {issues.length === 0 ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300"><Check className="h-3.5 w-3.5" /> Everything looks great!</div>
                ) : issues.map((i, idx) => (
                  <button key={idx} onClick={() => setStep(i.step)} className={`w-full text-left flex items-start gap-1.5 text-[11px] cursor-pointer ${i.severity === "error" ? "text-red-300" : "text-amber-300"}`}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{i.message}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------------- Step panels ----------------
function StepPanel({ step, form, set, products, categories, idCheck, availableCreds, issues, score, onGoStep }: {
  step: number; form: StudioForm; set: (p: Partial<StudioForm>) => void; products: ProductLite[]; categories: CategoryLite[];
  idCheck: { idTaken: boolean; skuTaken: boolean }; availableCreds: number; issues: StudioIssue[]; score: number; onGoStep: (n: number) => void;
}) {
  switch (step) {
    case 0: return <StepType form={form} set={set} />;
    case 1: return <StepBasic form={form} set={set} categories={categories} idCheck={idCheck} />;
    case 2: return <StepMedia form={form} set={set} />;
    case 3: return <StepInventory form={form} set={set} availableCreds={availableCreds} />;
    case 4: return <StepCredentials form={form} set={set} availableCreds={availableCreds} />;
    case 5: return <StepPricing form={form} set={set} />;
    case 6: return <StepDelivery form={form} set={set} />;
    case 7: return <StepVariants form={form} set={set} />;
    case 8: return <StepSeo form={form} set={set} />;
    case 9: return <StepReview form={form} issues={issues} score={score} onGoStep={onGoStep} />;
    default: return null;
  }
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-bold font-space text-white">{title}</h3>
      <p className="text-xs text-purple-200/50 mt-0.5">{subtitle}</p>
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-purple-200/70 block font-space">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-purple-300/40">{hint}</p>}
    </div>
  );
}
const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none focus:border-purple-500/50";

function StepType({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  return (
    <div>
      <StepHeader title="Product Type" subtitle="Choose a type — relevant fields and defaults are enabled automatically." />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PRODUCT_TYPES.map((t) => (
          <button key={t.id} onClick={() => set({ productType: t.id, delivery_type: t.delivery, type: t.type })}
            className={`text-left p-3 rounded-xl border transition cursor-pointer ${form.productType === t.id ? "border-cyan-500/50 bg-cyan-500/10" : "border-purple-500/15 bg-black/20 hover:border-purple-500/30"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-bold text-white">{t.label}</span>
              {form.productType === t.id && <Check className="h-3.5 w-3.5 text-emerald-400 ml-auto" />}
            </div>
            <p className="text-[10px] text-purple-200/50 leading-snug">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepBasic({ form, set, categories, idCheck }: { form: StudioForm; set: (p: Partial<StudioForm>) => void; categories: CategoryLite[]; idCheck: { idTaken: boolean; skuTaken: boolean } }) {
  return (
    <div>
      <StepHeader title="Basic Information" subtitle="Identify and describe your product." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Product ID" hint={idCheck.idTaken ? "⚠ Already taken" : "Lowercase, no spaces (e.g. netflix-premium)"}>
          <input value={form.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} className={`${inputCls} ${idCheck.idTaken ? "border-red-500/50" : ""}`} placeholder="netflix-premium" />
        </Field>
        <Field label="Product Name"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Netflix Premium (1 Month)" /></Field>
        <Field label="Brand"><input value={form.brand} onChange={(e) => set({ brand: e.target.value })} className={inputCls} placeholder="Netflix" /></Field>
        <Field label="SKU" hint={idCheck.skuTaken ? "⚠ Already used" : "Optional stock-keeping unit"}>
          <input value={form.sku} onChange={(e) => set({ sku: e.target.value })} className={`${inputCls} ${idCheck.skuTaken ? "border-red-500/50" : ""}`} placeholder="NFLX-PREM-1M" />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={inputCls}>
            <option value="digital" className="bg-neutral-900">digital</option>
            <option value="physical" className="bg-neutral-900">physical</option>
            {categories.filter((c) => c.name && c.name !== "digital" && c.name !== "physical").map((c) => <option key={c.id || c.name} value={c.name} className="bg-neutral-900">{c.name}</option>)}
          </select>
        </Field>
        <Field label="Subcategory"><input value={form.subcategory} onChange={(e) => set({ subcategory: e.target.value })} className={inputCls} placeholder="Streaming" /></Field>
        <div className="sm:col-span-2"><Field label="Tags" hint="Comma-separated — used for search & discovery"><input value={form.tags} onChange={(e) => set({ tags: e.target.value })} className={inputCls} placeholder="streaming, entertainment, 4k" /></Field></div>
        <div className="sm:col-span-2"><Field label="Short Description" hint="One line shown on product cards"><input value={form.short_description} onChange={(e) => set({ short_description: e.target.value })} className={inputCls} placeholder="Premium 4K streaming account, instant delivery" /></Field></div>
        <div className="sm:col-span-2"><Field label="Full Description"><textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} className={inputCls} placeholder="Full marketing description shown on the product page…" /></Field></div>
        <div className="sm:col-span-2"><Field label="Internal Notes" hint="Private — never shown to customers"><textarea rows={2} value={form.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} className={inputCls} placeholder="Supplier info, reminders…" /></Field></div>
      </div>
    </div>
  );
}

function StepMedia({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  return (
    <div>
      <StepHeader title="Media" subtitle="Upload a cover image and gallery. Drag to reorder; click a thumbnail to set the cover." />
      <ImageUploader cover={form.icon} gallery={form.multiple_images} onCoverChange={(v) => set({ icon: v })} onGalleryChange={(v) => set({ multiple_images: v })} />
      <div className="mt-4"><Field label="Video URL (optional)" hint="YouTube link shown on the product page"><input value={form.youtube_url} onChange={(e) => set({ youtube_url: e.target.value })} className={inputCls} placeholder="https://youtube.com/watch?v=…" /></Field></div>
    </div>
  );
}

function StepInventory({ form, set, availableCreds }: { form: StudioForm; set: (p: Partial<StudioForm>) => void; availableCreds: number }) {
  const modes: { id: StudioForm["stockMode"]; label: string; desc: string }[] = [
    { id: "unlimited", label: "Unlimited", desc: "Never runs out (services, downloads)" },
    { id: "quantity", label: "Quantity", desc: "Track a numeric stock count" },
    { id: "credentials", label: "Credential Pool", desc: "Stock = available credentials" },
  ];
  return (
    <div>
      <StepHeader title="Inventory" subtitle="Choose how stock is tracked for this product." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {modes.map((m) => (
          <button key={m.id} onClick={() => set({ stockMode: m.id })} className={`text-left p-3 rounded-xl border cursor-pointer ${form.stockMode === m.id ? "border-cyan-500/50 bg-cyan-500/10" : "border-purple-500/15 bg-black/20 hover:border-purple-500/30"}`}>
            <div className="flex items-center gap-1.5 mb-0.5"><Package className="h-3.5 w-3.5 text-cyan-400" /><span className="text-sm font-bold text-white">{m.label}</span>{form.stockMode === m.id && <Check className="h-3.5 w-3.5 text-emerald-400 ml-auto" />}</div>
            <p className="text-[10px] text-purple-200/50">{m.desc}</p>
          </button>
        ))}
      </div>
      {form.stockMode === "quantity" && (
        <Field label="Stock Quantity"><input type="number" value={form.stock} onChange={(e) => set({ stock: e.target.value })} className={inputCls} placeholder="100" /></Field>
      )}
      {form.stockMode === "credentials" && (
        <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20">
          <div className="flex items-center gap-2 text-sm">
            <Key className="h-4 w-4 text-cyan-400" />
            <span className="text-white font-bold">{availableCreds}</span>
            <span className="text-purple-200/60 text-xs">credential(s) available for this product</span>
          </div>
          <p className="text-[11px] text-purple-300/50 mt-1">Stock auto-syncs with the Credential Inventory Manager. Add credentials in the next step.</p>
        </div>
      )}
      {form.stockMode === "unlimited" && <p className="text-xs text-purple-200/50">This product will always be purchasable.</p>}
    </div>
  );
}

function StepCredentials({ form, set, availableCreds }: { form: StudioForm; set: (p: Partial<StudioForm>) => void; availableCreds: number }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState("");
  const [warranty, setWarranty] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recentCount, setRecentCount] = useState(availableCreds);
  useEffect(() => setRecentCount(availableCreds), [availableCreds]);

  const importCreds = async () => {
    if (!form.id) { toast("Set a Product ID first (Basic Info step).", "error"); return; }
    if (!logs.trim()) { toast("Paste some credentials.", "error"); return; }
    setImporting(true);
    try {
      const res = await apiFetch("/api/admin/inventory/bulk-upload", { method: "POST", body: JSON.stringify({ productId: form.id, logs, isWarranty: warranty }) });
      toast(res.message || "Imported.", "success");
      setLogs("");
      set({ stockMode: "credentials" });
      const r = await apiFetch(`/api/admin/inventory/credentials?productId=${encodeURIComponent(form.id)}&status=available&pageSize=1`);
      setRecentCount(r.total || 0);
    } catch (err: any) { toast("Import failed: " + err.message, "error"); }
    finally { setImporting(false); }
  };

  return (
    <div>
      <StepHeader title="Credential Assignment" subtitle="Attach account credentials to this product. They are delivered automatically after payment." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20 space-y-2">
          <div className="flex items-center gap-2"><Key className="h-4 w-4 text-cyan-400" /><span className="text-sm font-bold text-white">Inventory Health</span></div>
          <div className="text-2xl font-bold font-space text-emerald-400">{recentCount}</div>
          <p className="text-[11px] text-purple-300/50">available credential(s) for <span className="font-mono">{form.id || "(no ID yet)"}</span></p>
          <p className="text-[11px] text-purple-300/40">Manage the full pool (edit, assign, audit) in the Credential Inventory tab.</p>
        </div>
        <div className="space-y-2">
          <Field label="Bulk import credentials (one per line)">
            <textarea rows={5} value={logs} onChange={(e) => setLogs(e.target.value)} className={`${inputCls} font-mono`} placeholder={"email1@x.com|pass|recovery\nemail2@x.com|pass|recovery"} />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={warranty} onChange={(e) => setWarranty(e.target.checked)} className="accent-purple-500" />
            <span className="text-[11px] text-purple-200/80">Warranty replacement stock (reserved for claims)</span>
          </label>
          <Button onClick={importCreds} isLoading={importing} className="w-full">Import to Pool</Button>
        </div>
      </div>
    </div>
  );
}

function StepPricing({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  const price = parseFloat(form.price) || 0;
  const cost = parseFloat(form.cost_price) || 0;
  const sale = form.sale_price ? parseFloat(form.sale_price) : NaN;
  const effective = !isNaN(sale) && sale > 0 ? sale : price;
  const profit = effective - cost;
  const margin = effective > 0 ? (profit / effective) * 100 : 0;
  return (
    <div>
      <StepHeader title="Pricing" subtitle="Set pricing in Naira (₦). Profit & margin update live." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Regular Price (₦)"><input type="number" value={form.price} onChange={(e) => set({ price: e.target.value })} className={inputCls} placeholder="5000" /></Field>
        <Field label="Sale Price (₦, optional)"><input type="number" value={form.sale_price} onChange={(e) => set({ sale_price: e.target.value })} className={inputCls} placeholder="3999" /></Field>
        <Field label="Cost Price (₦, internal)"><input type="number" value={form.cost_price} onChange={(e) => set({ cost_price: e.target.value })} className={inputCls} placeholder="2500" /></Field>
        <Field label="Markup (₦, optional)"><input type="number" value={form.markup} onChange={(e) => set({ markup: e.target.value })} className={inputCls} placeholder="auto" /></Field>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20"><div className="text-[10px] text-purple-300/50 uppercase">Effective</div><div className="text-lg font-bold text-white font-space">₦{Math.round(effective).toLocaleString()}</div></div>
        <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20"><div className="text-[10px] text-purple-300/50 uppercase">Profit</div><div className={`text-lg font-bold font-space ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>₦{Math.round(profit).toLocaleString()}</div></div>
        <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20"><div className="text-[10px] text-purple-300/50 uppercase">Margin</div><div className={`text-lg font-bold font-space ${margin >= 0 ? "text-cyan-400" : "text-red-400"}`}>{margin.toFixed(1)}%</div></div>
      </div>
    </div>
  );
}

function StepDelivery({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  return (
    <div>
      <StepHeader title="Delivery" subtitle="Configure how and when the customer receives the product." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Delivery Method">
          <select value={form.delivery_type} onChange={(e) => set({ delivery_type: e.target.value as StudioForm["delivery_type"] })} className={inputCls}>
            <option value="instant" className="bg-neutral-900">Instant (auto from pool)</option>
            <option value="manual" className="bg-neutral-900">Manual (admin dispatch)</option>
            <option value="inquiry" className="bg-neutral-900">Inquiry / Quote</option>
          </select>
        </Field>
        <Field label="Delivery Estimate"><input value={form.delivery_estimate} onChange={(e) => set({ delivery_estimate: e.target.value })} className={inputCls} placeholder="Instant · within 5 minutes" /></Field>
        <Field label="Warranty Period"><input value={form.warranty_period} onChange={(e) => set({ warranty_period: e.target.value })} className={inputCls} placeholder="30 days" /></Field>
        <Field label="Expiration / Validity"><input value={form.expiration} onChange={(e) => set({ expiration: e.target.value })} className={inputCls} placeholder="Account valid for 1 month" /></Field>
        <div className="sm:col-span-2"><Field label="Replacement Policy"><textarea rows={2} value={form.replacement_policy} onChange={(e) => set({ replacement_policy: e.target.value })} className={inputCls} placeholder="Free replacement within warranty if the account stops working…" /></Field></div>
      </div>
      {form.type === "physical" && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Shipping Type">
            <select value={form.shipping_type} onChange={(e) => set({ shipping_type: e.target.value as StudioForm["shipping_type"] })} className={inputCls}>
              <option value="local" className="bg-neutral-900">Local</option>
              <option value="international" className="bg-neutral-900">International</option>
            </select>
          </Field>
          <Field label="Delivery Countries"><input value={form.delivery_countries} onChange={(e) => set({ delivery_countries: e.target.value })} className={inputCls} placeholder="Nigeria, Ghana" /></Field>
        </div>
      )}
    </div>
  );
}

function StepVariants({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  const add = () => set({ variants: [...form.variants, { name: "", price: "", stock: "" }] });
  const update = (i: number, patch: Partial<StudioVariant>) => set({ variants: form.variants.map((v, idx) => idx === i ? { ...v, ...patch } : v) });
  const remove = (i: number) => set({ variants: form.variants.filter((_, idx) => idx !== i) });
  const presets: Record<string, string[]> = { Facebook: ["USA", "UK", "Canada"], Netflix: ["Premium", "Standard", "Mobile"], "Google Voice": ["Fresh", "Aged"] };
  return (
    <div>
      <StepHeader title="Variants" subtitle="Optional. Each variant can have its own price and stock (e.g. regions or tiers)." />
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(presets).map(([label, names]) => (
          <button key={label} onClick={() => set({ variants: [...form.variants, ...names.map((n) => ({ name: n, price: form.price, stock: "" }))] })} className="px-2.5 py-1 rounded-lg border border-purple-500/25 bg-purple-500/10 text-[10px] font-bold text-purple-200 cursor-pointer">+ {label} preset</button>
        ))}
      </div>
      <div className="space-y-2">
        {form.variants.map((v, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-end">
            <Field label={i === 0 ? "Name" : ""}><input value={v.name} onChange={(e) => update(i, { name: e.target.value })} className={inputCls} placeholder="USA" /></Field>
            <Field label={i === 0 ? "Price (₦)" : ""}><input type="number" value={v.price} onChange={(e) => update(i, { price: e.target.value })} className={inputCls} placeholder="5000" /></Field>
            <Field label={i === 0 ? "Stock" : ""}><input type="number" value={v.stock} onChange={(e) => update(i, { stock: e.target.value })} className={inputCls} placeholder="10" /></Field>
            <button onClick={() => remove(i)} className="p-2.5 rounded-lg border border-red-500/20 text-red-300/70 hover:bg-red-500/15 cursor-pointer mb-0.5"><Trash className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-3 px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-[12px] font-bold text-cyan-300 flex items-center gap-1 cursor-pointer"><Plus className="h-3.5 w-3.5" /> Add Variant</button>
    </div>
  );
}

function StepSeo({ form, set }: { form: StudioForm; set: (p: Partial<StudioForm>) => void }) {
  const score = seoScore(form);
  const slug = (form.id || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
  return (
    <div>
      <StepHeader title="SEO & Discoverability" subtitle="Improve how this product is found and promoted." />
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] text-purple-300/60 mb-1"><span>SEO score</span><span className="font-bold">{score}%</span></div>
        <div className="h-1.5 rounded-full bg-black/40 overflow-hidden"><div className={`h-full rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${score}%` }} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <Field label="SEO Title"><input value={form.seo_title} onChange={(e) => set({ seo_title: e.target.value })} className={inputCls} placeholder="Buy Netflix Premium — Instant Delivery | Aurevashop" /></Field>
        <Field label="SEO Description"><textarea rows={2} value={form.seo_description} onChange={(e) => set({ seo_description: e.target.value })} className={inputCls} placeholder="Get a Netflix Premium account instantly. 4K, warranty included…" /></Field>
        <Field label="Search Keywords" hint="Comma-separated"><input value={form.seo_keywords} onChange={(e) => set({ seo_keywords: e.target.value })} className={inputCls} placeholder="netflix, streaming, premium account" /></Field>
        <Field label="Friendly URL"><div className="text-[11px] text-cyan-300/70 font-mono px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20">/product/{slug || "product"}</div></Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Toggle label="Featured" icon={<Star className="h-3.5 w-3.5" />} on={!!form.featured} onClick={() => set({ featured: form.featured ? 0 : 1 })} />
        <Toggle label="Trending" icon={<TrendingUp className="h-3.5 w-3.5" />} on={!!form.popular} onClick={() => set({ popular: form.popular ? 0 : 1 })} />
        <Toggle label="New Arrival" icon={<Sparkles className="h-3.5 w-3.5" />} on={!!form.newest} onClick={() => set({ newest: form.newest ? 0 : 1 })} />
      </div>
    </div>
  );
}
function Toggle({ label, icon, on, onClick }: { label: string; icon: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-2 rounded-xl border text-[12px] font-bold flex items-center gap-1.5 cursor-pointer ${on ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-purple-500/15 bg-black/20 text-purple-300/50"}`}>
      {icon}{label}{on && <Check className="h-3 w-3" />}
    </button>
  );
}

function StepReview({ form, issues, score, onGoStep }: { form: StudioForm; issues: StudioIssue[]; score: number; onGoStep: (n: number) => void }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const seo = seoScore(form);
  const rows: [string, string][] = [
    ["Type", PRODUCT_TYPES.find((t) => t.id === form.productType)?.label || "—"],
    ["ID", form.id || "—"],
    ["Name", form.name || "—"],
    ["Category", `${form.category}${form.subcategory ? " · " + form.subcategory : ""}`],
    ["Price", form.price ? `₦${Math.round(parseFloat(form.price)).toLocaleString()}` : "—"],
    ["Delivery", form.delivery_type],
    ["Stock mode", form.stockMode],
    ["Variants", form.variants.length ? `${form.variants.length}` : "None"],
  ];
  return (
    <div>
      <StepHeader title="Review & Publish" subtitle="Final check before going live." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Quality" value={`${score}%`} tone={score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"} />
            <Metric label="SEO" value={`${seo}%`} tone={seo >= 80 ? "text-emerald-400" : seo >= 50 ? "text-amber-400" : "text-red-400"} />
            <Metric label="Errors" value={String(errors.length)} tone={errors.length ? "text-red-400" : "text-emerald-400"} />
          </div>
          <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20 divide-y divide-purple-500/5">
            {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between py-1.5 text-xs"><span className="text-purple-300/50">{k}</span><span className="text-white font-medium">{v}</span></div>)}
          </div>
        </div>
        <div className="space-y-2">
          {errors.length === 0 && warnings.length === 0 ? (
            <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-emerald-300 text-sm flex items-center gap-2"><Check className="h-4 w-4" /> Ready to publish — no issues detected.</div>
          ) : (
            <>
              {errors.length > 0 && <div className="text-[11px] font-bold text-red-300 uppercase">Must fix ({errors.length})</div>}
              {errors.map((i, idx) => <button key={"e" + idx} onClick={() => onGoStep(i.step)} className="w-full text-left flex items-start gap-1.5 text-[12px] text-red-300 cursor-pointer p-2 rounded-lg hover:bg-red-500/5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{i.message}</button>)}
              {warnings.length > 0 && <div className="text-[11px] font-bold text-amber-300 uppercase mt-2">Recommendations ({warnings.length})</div>}
              {warnings.map((i, idx) => <button key={"w" + idx} onClick={() => onGoStep(i.step)} className="w-full text-left flex items-start gap-1.5 text-[12px] text-amber-300 cursor-pointer p-2 rounded-lg hover:bg-amber-500/5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{i.message}</button>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="p-3 rounded-xl border border-purple-500/15 bg-black/20 text-center"><div className="text-[10px] text-purple-300/50 uppercase">{label}</div><div className={`text-xl font-bold font-space ${tone}`}>{value}</div></div>;
}
