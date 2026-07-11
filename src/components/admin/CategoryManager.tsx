import { useState, useEffect, useCallback } from "react";
import {
  Layers, Plus, Edit, Trash2, ChevronDown, ChevronRight, ChevronUp, Loader2,
  Star, Eye, EyeOff, Save, X, FolderTree, GripVertical,
} from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../utils/api";
import ProductImage from "../marketplace/ProductImage";

/**
 * CategoryManager — dynamic, code-free management of Marketplace categories and their
 * subcategories (variants/collections). Supports create / edit / delete / reorder /
 * enable-disable / feature, with nested subcategory CRUD. Everything persists to the DB
 * and drives the storefront's category-first navigation immediately.
 */

interface Category {
  id: string; name: string; type: string; icon?: string; banner?: string;
  order_index?: number; status?: number; featured?: number;
}
interface Subcategory {
  id: number; category_id: string; name: string; icon?: string; description?: string;
  order_index?: number; status?: number; featured?: number;
}

export default function CategoryManager() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [subModal, setSubModal] = useState<{ categoryId: string; sub: Partial<Subcategory> | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([apiFetch("/api/categories"), apiFetch("/api/subcategories")]);
      setCats((Array.isArray(c) ? c : []).filter((x: Category) => x.type !== "smm"));
      setSubs((s && s.subcategories) || []);
    } catch (e: any) { toast("Failed to load categories: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const subsFor = (catId: string) => subs.filter((s) => s.category_id === catId).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  const moveCat = async (idx: number, dir: -1 | 1) => {
    const arr = [...cats];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setCats(arr);
    try { await apiFetch("/api/admin/categories/reorder", { method: "POST", body: JSON.stringify({ order: arr.map((c) => c.id) }) }); }
    catch (e: any) { toast("Reorder failed: " + e.message, "error"); load(); }
  };

  const toggleCat = async (cat: Category, field: "status" | "featured") => {
    const cur = field === "status" ? (cat.status !== 0 ? 1 : 0) : (cat.featured || 0);
    try {
      await apiFetch(`/api/admin/categories/${cat.id}/toggle`, { method: "POST", body: JSON.stringify({ field, value: cur ? 0 : 1 }) });
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const delCat = async (cat: Category) => {
    if (!(await confirm({ title: `Delete "${cat.name}"?`, message: "This also removes its subcategories. Blocked if products still use it.", danger: true, confirmLabel: "Delete" }))) return;
    try { await apiFetch(`/api/admin/categories/delete/${cat.id}`, { method: "DELETE" }); toast("Category deleted.", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const delSub = async (sub: Subcategory) => {
    if (!(await confirm({ title: `Delete "${sub.name}"?`, message: "Blocked if products still use this variant.", danger: true, confirmLabel: "Delete" }))) return;
    try { await apiFetch(`/api/admin/subcategories/delete/${sub.id}`, { method: "DELETE" }); toast("Subcategory deleted.", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const moveSub = async (catId: string, idx: number, dir: -1 | 1) => {
    const arr = subsFor(catId);
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setSubs((prev) => prev.map((s) => { const found = arr.find((a) => a.id === s.id); return found ? { ...s, order_index: arr.indexOf(found) } : s; }));
    try { await apiFetch("/api/admin/subcategories/reorder", { method: "POST", body: JSON.stringify({ order: arr.map((s) => s.id) }) }); }
    catch (e: any) { toast("Reorder failed: " + e.message, "error"); load(); }
  };

  if (loading) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading categories…</div>;

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><FolderTree className="h-5 w-5 text-cyan-400" /> Category Manager</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Organize the Marketplace into categories &amp; variants. Drag order, enable/disable, feature — changes appear instantly on the storefront.</p>
        </div>
        <Button onClick={() => { setCreatingCat(true); setEditingCat({ id: "", name: "", type: "digital", icon: "", order_index: cats.length, status: 1, featured: 0 }); }} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New Category</Button>
      </div>

      {cats.length === 0 ? (
        <Card className="border border-purple-500/10 py-10 text-center text-purple-300/40 text-xs">No categories yet. Create your first one.</Card>
      ) : (
        <div className="space-y-2">
          {cats.map((cat, idx) => {
            const catSubs = subsFor(cat.id);
            const open = !!expanded[cat.id];
            return (
              <Card key={cat.id} className="border border-purple-500/10 p-0 overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  {/* reorder */}
                  <div className="flex flex-col">
                    <button onClick={() => moveCat(idx, -1)} disabled={idx === 0} className="text-purple-300/40 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => moveCat(idx, 1)} disabled={idx === cats.length - 1} className="text-purple-300/40 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <button onClick={() => setExpanded((p) => ({ ...p, [cat.id]: !open }))} className="shrink-0 text-purple-300/60 hover:text-white cursor-pointer">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <span className="h-9 w-9 rounded-lg bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                    {cat.icon ? <ProductImage product={{ icon: cat.icon, name: cat.name }} className="h-5 w-5" rounded="rounded" /> : <Layers className="h-4 w-4 text-purple-300/50" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                      {cat.name}
                      {!!cat.featured && <Badge variant="warning" className="text-[8px]">★ Featured</Badge>}
                      <Badge variant={cat.status !== 0 ? "success" : "danger"} className="text-[8px]">{cat.status !== 0 ? "Active" : "Disabled"}</Badge>
                    </div>
                    <div className="text-[10px] text-purple-200/40 font-mono">{cat.type} · {catSubs.length} variant{catSubs.length === 1 ? "" : "s"} · id: {cat.id}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconBtn title={cat.featured ? "Unfeature" : "Feature"} onClick={() => toggleCat(cat, "featured")}><Star className={`h-3.5 w-3.5 ${cat.featured ? "text-amber-400 fill-amber-400" : ""}`} /></IconBtn>
                    <IconBtn title={cat.status !== 0 ? "Disable" : "Enable"} onClick={() => toggleCat(cat, "status")}>{cat.status !== 0 ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</IconBtn>
                    <IconBtn title="Edit" onClick={() => { setCreatingCat(false); setEditingCat(cat); }}><Edit className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Delete" danger onClick={() => delCat(cat)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-purple-500/10 bg-black/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wide">Subcategories / Variants</span>
                      <button onClick={() => setSubModal({ categoryId: cat.id, sub: { category_id: cat.id, name: "", icon: "", status: 1, order_index: catSubs.length } })} className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add variant</button>
                    </div>
                    {catSubs.length === 0 ? (
                      <p className="text-[10px] text-purple-300/40 py-1">No variants yet. Add USA, UK, NordVPN, 5GB, etc.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {catSubs.map((sub, si) => (
                          <div key={sub.id} className="flex items-center gap-2 rounded-lg border border-purple-500/8 bg-black/30 px-2.5 py-1.5">
                            <div className="flex flex-col">
                              <button onClick={() => moveSub(cat.id, si, -1)} disabled={si === 0} className="text-purple-300/30 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3 w-3" /></button>
                              <button onClick={() => moveSub(cat.id, si, 1)} disabled={si === catSubs.length - 1} className="text-purple-300/30 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3 w-3" /></button>
                            </div>
                            {sub.icon && <span className="text-sm">{sub.icon}</span>}
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">{sub.name}
                                {!!sub.featured && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                                {sub.status === 0 && <Badge variant="danger" className="text-[8px]">Off</Badge>}
                              </div>
                              {sub.description && <div className="text-[10px] text-purple-200/40 truncate">{sub.description}</div>}
                            </div>
                            <IconBtn title="Edit" onClick={() => setSubModal({ categoryId: cat.id, sub })}><Edit className="h-3 w-3" /></IconBtn>
                            <IconBtn title="Delete" danger onClick={() => delSub(sub)}><Trash2 className="h-3 w-3" /></IconBtn>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editingCat && <CategoryModal category={editingCat} isNew={creatingCat} onClose={() => { setEditingCat(null); setCreatingCat(false); }} onSaved={() => { setEditingCat(null); setCreatingCat(false); load(); }} />}
      {subModal && <SubcategoryModal categoryId={subModal.categoryId} sub={subModal.sub} onClose={() => setSubModal(null)} onSaved={() => { setSubModal(null); load(); }} />}
    </div>
  );
}

function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className={`p-1.5 rounded-lg border bg-black/20 cursor-pointer ${danger ? "border-red-500/15 text-red-400 hover:bg-red-500/10" : "border-purple-500/15 text-purple-200/70 hover:text-white hover:bg-white/5"}`}>{children}</button>;
}

function CategoryModal({ category, isNew, onClose, onSaved }: { category: Category; isNew: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Category>(category);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Category>) => setF((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!f.name.trim()) { toast("Name is required.", "error"); return; }
    if (isNew && !f.id.trim()) { toast("Category ID is required.", "error"); return; }
    setSaving(true);
    try {
      const body = { id: f.id, name: f.name, type: f.type || "digital", icon: f.icon || "", banner: f.banner || "", order_index: f.order_index || 0, status: f.status !== 0 ? 1 : 0, featured: f.featured ? 1 : 0 };
      const url = isNew ? "/api/admin/categories/create" : `/api/admin/categories/update/${f.id}`;
      await apiFetch(url, { method: "POST", body: JSON.stringify(body) });
      toast(isNew ? "Category created." : "Category updated.", "success"); onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <Overlay title={isNew ? "New Category" : `Edit ${f.name}`} onClose={onClose}>
      <div className="space-y-3">
        {isNew && <Input label="Category ID (unique, lowercase)" value={f.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="facebook-accounts" />}
        <Input label="Display Name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Facebook Accounts" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Icon (emoji / brand / URL)" value={f.icon || ""} onChange={(e) => set({ icon: e.target.value })} placeholder="📘 or Facebook" />
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200/70 font-space">Type</label>
            <select value={f.type} onChange={(e) => set({ type: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 focus:outline-none">
              <option value="digital" className="bg-neutral-900">Digital</option>
              <option value="physical" className="bg-neutral-900">Physical</option>
              <option value="service" className="bg-neutral-900">Service</option>
            </select>
          </div>
        </div>
        <Input label="Order Index" type="number" value={String(f.order_index ?? 0)} onChange={(e) => set({ order_index: parseInt(e.target.value) || 0 })} />
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={f.status !== 0} onChange={(e) => set({ status: e.target.checked ? 1 : 0 })} className="accent-cyan-500" /> Active (visible)</label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={!!f.featured} onChange={(e) => set({ featured: e.target.checked ? 1 : 0 })} className="accent-amber-500" /> Featured</label>
        </div>
        <Button onClick={save} isLoading={saving} className="w-full flex items-center justify-center gap-1"><Save className="h-3.5 w-3.5" /> {isNew ? "Create Category" : "Save Changes"}</Button>
      </div>
    </Overlay>
  );
}

function SubcategoryModal({ categoryId, sub, onClose, onSaved }: { categoryId: string; sub: Partial<Subcategory> | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isNew = !sub || !sub.id;
  const [f, setF] = useState<Partial<Subcategory>>(sub || { category_id: categoryId, name: "", icon: "", status: 1 });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Subcategory>) => setF((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!f.name || !f.name.trim()) { toast("Name is required.", "error"); return; }
    setSaving(true);
    try {
      const body = { category_id: categoryId, name: f.name, icon: f.icon || "", description: f.description || "", order_index: f.order_index || 0, status: f.status !== 0 ? 1 : 0, featured: f.featured ? 1 : 0 };
      const url = isNew ? "/api/admin/subcategories/create" : `/api/admin/subcategories/update/${f.id}`;
      await apiFetch(url, { method: "POST", body: JSON.stringify(body) });
      toast(isNew ? "Variant added." : "Variant updated.", "success"); onSaved();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <Overlay title={isNew ? "New Variant / Subcategory" : `Edit ${f.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Input label="Name" value={f.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="USA / NordVPN / 5GB" /></div>
          <Input label="Icon" value={f.icon || ""} onChange={(e) => set({ icon: e.target.value })} placeholder="🇺🇸" />
        </div>
        <Input label="Description (optional)" value={f.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="Aged US accounts, email included" />
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={f.status !== 0} onChange={(e) => set({ status: e.target.checked ? 1 : 0 })} className="accent-cyan-500" /> Active</label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={!!f.featured} onChange={(e) => set({ featured: e.target.checked ? 1 : 0 })} className="accent-amber-500" /> Featured</label>
        </div>
        <Button onClick={save} isLoading={saving} className="w-full flex items-center justify-center gap-1"><Save className="h-3.5 w-3.5" /> {isNew ? "Add Variant" : "Save Changes"}</Button>
      </div>
    </Overlay>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0e0922] border border-purple-500/30 rounded-2xl p-5 shadow-2xl z-10 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold font-space text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
