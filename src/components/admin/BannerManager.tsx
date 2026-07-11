import { useState, useEffect, useRef } from "react";
import {
  Plus, Edit, Trash2, Copy, X, Upload, GripVertical, Eye, Monitor, Smartphone,
  History, RotateCcw, BarChart3, ArrowRight, CheckSquare, Square
} from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import { useConfirm } from "../ui/ConfirmDialog";
import { useDragList } from "../../utils/useDragList";

const POSITIONS = ["homepage", "marketplace", "dashboard", "product", "category", "checkout", "wallet"];
const TYPES = ["image", "gif", "video", "html"];
const TRANSITIONS = ["slide", "fade", "zoom"];

// Ready-to-edit demo banner templates. Each uses a distinct colour/layout style so admins can
// pick a starting point and then fully edit text, colours, images, buttons and background.
const TEMPLATES: Record<string, any> = {
  "Summer Sale": { title: "☀️ Summer Sale", description: "Cool deals all season — up to 40% off selected items.", banner_type: "image", cta_text: "Shop the Sale", cta_url: "/Marketplace", bg_color: "#f59e0b", text_color: "#1f2937", position: "marketplace" },
  "Flash Sale": { title: "⚡ Flash Sale", description: "Up to 50% off — today only!", banner_type: "image", cta_text: "Shop Now", cta_url: "/Marketplace", bg_color: "#7c3aed", text_color: "#ffffff", position: "marketplace" },
  "New Arrivals": { title: "🆕 New Arrivals", description: "Fresh products just landed. Be the first to grab them.", banner_type: "image", cta_text: "Explore", cta_url: "/Marketplace", bg_color: "#0ea5e9", text_color: "#ffffff", position: "homepage" },
  "Limited Time Offer": { title: "⏳ Limited Time Offer", description: "Hurry — this deal ends soon!", banner_type: "image", cta_text: "Grab it now", cta_url: "/Marketplace", bg_color: "#dc2626", text_color: "#ffffff", position: "marketplace" },
  "Free Delivery": { title: "🚚 Free Delivery", description: "Enjoy free delivery on all orders this week.", banner_type: "image", cta_text: "Start Shopping", cta_url: "/Marketplace", bg_color: "#16a34a", text_color: "#ffffff", position: "marketplace" },
  "International Gift Delivery": { title: "🎁 International Gift Delivery", description: "Send heartfelt gifts anywhere in the world.", banner_type: "image", cta_text: "Send a Gift", cta_url: "/Marketplace", bg_color: "#db2777", text_color: "#ffffff", position: "marketplace" },
  "Black Friday": { title: "🖤 Black Friday", description: "The biggest deals of the year are here.", banner_type: "image", cta_text: "Shop Black Friday", cta_url: "/Marketplace", bg_color: "#111827", text_color: "#facc15", position: "marketplace" },
  "Christmas Promotion": { title: "🎄 Christmas Promotion", description: "Celebrate the season with festive savings.", banner_type: "image", cta_text: "Unwrap Deals", cta_url: "/Marketplace", bg_color: "#b91c1c", text_color: "#ffffff", position: "homepage" },
};

function toArr(v: any): string[] { if (Array.isArray(v)) return v; return String(v || "").split(",").map(s => s.trim()).filter(Boolean); }

export default function BannerManager({ triggerToast }: { triggerToast?: (m: string, t?: any) => void }) {
  const confirm = useConfirm();
  const [banners, setBanners] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterPos, setFilterPos] = useState<string>("all");

  const fetchBanners = async () => {
    try { const list = await apiFetch("/api/admin/banners"); if (Array.isArray(list)) setBanners(list); } catch (e) {}
  };
  useEffect(() => { fetchBanners(); }, []);

  const shown = banners.filter(b => filterPos === "all" || (b.position || "marketplace") === filterPos);

  const onReorder = async (ids: string[]) => {
    // optimistic
    setBanners(prev => ids.map(id => prev.find(b => b.id === id)).filter(Boolean).concat(prev.filter(b => !ids.includes(b.id))) as any[]);
    try { await apiFetch("/api/admin/banners/reorder", { method: "POST", body: JSON.stringify({ order: ids.map(id => ({ id })) }) }); triggerToast?.("Order saved."); }
    catch (e: any) { triggerToast?.("Reorder failed: " + e.message, "error"); fetchBanners(); }
  };
  const { rowProps } = useDragList(shown, onReorder);

  const blank = () => ({ title: "", description: "", banner_type: "image", position: "marketplace", status: "published", active: 1, dismissible: 0, frequency: "always", target_audience: "all", transition: "slide", autoplay_ms: 5000, priority: 0, ab_enabled: 0, images: [], target_roles: [], target_users: [] });

  const dup = async (id: string) => { try { await apiFetch(`/api/admin/banners/duplicate/${id}`, { method: "POST" }); triggerToast?.("Duplicated."); fetchBanners(); } catch (e: any) { triggerToast?.(e.message, "error"); } };
  const setStatus = async (id: string, status: string) => { try { await apiFetch(`/api/admin/banners/status/${id}`, { method: "POST", body: JSON.stringify({ status }) }); fetchBanners(); } catch (e: any) { triggerToast?.(e.message, "error"); } };
  const del = async (id: string) => { if (!(await confirm("Delete this banner?"))) return; try { await apiFetch(`/api/admin/banners/delete/${id}`, { method: "DELETE" }); triggerToast?.("Deleted."); fetchBanners(); } catch (e: any) { triggerToast?.(e.message, "error"); } };

  const toggleSel = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulk = async (action: string) => {
    if (selected.size === 0) return;
    if (action === "delete" && !(await confirm(`Delete ${selected.size} banners?`))) return;
    try { await apiFetch("/api/admin/banners/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], action }) }); triggerToast?.(`Bulk ${action} done.`); setSelected(new Set()); fetchBanners(); }
    catch (e: any) { triggerToast?.(e.message, "error"); }
  };

  const exportBanners = async () => {
    try { const res = await apiFetch("/api/admin/banners/export"); const blob = new Blob([JSON.stringify(res.banners || [], null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `avs_banners_${Date.now()}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch (e: any) { triggerToast?.(e.message, "error"); }
  };
  const importBanners = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { try { const parsed = JSON.parse(reader.result as string); const list = Array.isArray(parsed) ? parsed : (parsed.banners || []); const res = await apiFetch("/api/admin/banners/import", { method: "POST", body: JSON.stringify({ banners: list }) }); triggerToast?.(`Imported ${res.imported}.`); fetchBanners(); } catch (err: any) { triggerToast?.("Import failed: " + err.message, "error"); } };
    reader.readAsText(file); e.target.value = "";
  };
  const openAnalytics = async (b: any) => { try { const res = await apiFetch(`/api/admin/banners/${b.id}/analytics?days=30`); setAnalytics({ ...res, title: b.title, ab_enabled: b.ab_enabled }); } catch (e: any) { triggerToast?.(e.message, "error"); } };

  return (
    <div className="space-y-4 font-inter">
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-500/15 pb-3">
          <div>
            <h3 className="text-base font-bold text-white font-space tracking-tight">Marketplace Banners</h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Drag rows to reorder. Images/GIF/video/HTML, scheduling, targeting, A/B, analytics.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filterPos} onChange={(e) => setFilterPos(e.target.value)} className="bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-2 rounded-lg">
              <option value="all">All positions</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={exportBanners}>Export</Button>
            <label className="px-3 py-1.5 rounded-xl border border-purple-500/25 text-xs font-bold text-purple-200 hover:text-white cursor-pointer">Import<input type="file" accept="application/json" className="hidden" onChange={importBanners} /></label>
            <Button size="sm" onClick={() => setEdit(blank())}><Plus className="h-4 w-4 mr-1" /> New</Button>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-600/10 border border-purple-500/20 text-xs">
            <span className="text-purple-200">{selected.size} selected</span>
            <button onClick={() => bulk("publish")} className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 cursor-pointer">Publish</button>
            <button onClick={() => bulk("unpublish")} className="px-2 py-1 rounded bg-amber-500/15 text-amber-300 cursor-pointer">Unpublish</button>
            <button onClick={() => bulk("archive")} className="px-2 py-1 rounded bg-purple-500/15 text-purple-300 cursor-pointer">Archive</button>
            <button onClick={() => bulk("delete")} className="px-2 py-1 rounded bg-red-500/15 text-red-300 cursor-pointer">Delete</button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-purple-200/50 cursor-pointer">Clear</button>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="text-xs text-purple-200/30 italic py-6 text-center">No banners{filterPos !== "all" ? ` for "${filterPos}"` : ""} yet.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((b) => (
              <div key={b.id} {...rowProps(b.id)}
                className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-purple-500/10 hover:border-purple-500/25 transition-all data-[dragover=true]:border-cyan-400 data-[dragging=true]:opacity-50 cursor-grab active:cursor-grabbing">
                <button onClick={() => toggleSel(b.id)} className="text-purple-300 cursor-pointer">{selected.has(b.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}</button>
                <GripVertical className="h-4 w-4 text-purple-200/30 shrink-0" />
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-black/40 border border-purple-500/10 shrink-0 flex items-center justify-center">
                  {b.image_url ? <img src={b.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[9px] text-purple-200/40 uppercase">{b.banner_type}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white text-sm truncate">{b.title}</div>
                  <div className="text-[10px] text-purple-200/40">{b.position} · {b.banner_type} · V{b.views || 0}/C{b.clicks || 0}{b.views > 0 ? ` (${Math.round((b.clicks / b.views) * 100)}%)` : ""}</div>
                </div>
                <Badge variant={b.status === "published" ? "success" : b.status === "draft" ? "default" : "warning"}>{b.status || "published"}</Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openAnalytics(b)} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:text-white cursor-pointer" title="Analytics"><BarChart3 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEdit({ ...b, images: b.image_url ? [b.image_url] : [], target_roles: toArr(b.target_roles), target_users: toArr(b.target_users), variant_b: (() => { try { return b.variant_b ? JSON.parse(b.variant_b) : null; } catch { return null; } })() })} className="p-1.5 rounded-lg bg-purple-500/10 text-purple-300 hover:text-white cursor-pointer" title="Edit"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => dup(b.id)} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 hover:text-white cursor-pointer" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                  {b.status !== "archived"
                    ? <button onClick={() => setStatus(b.id, "archived")} className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-bold cursor-pointer">Archive</button>
                    : <button onClick={() => setStatus(b.id, "published")} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-bold cursor-pointer">Publish</button>}
                  <button onClick={() => del(b.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {edit && <BannerEditor initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); fetchBanners(); }} triggerToast={triggerToast} />}
      {analytics && <BannerAnalytics data={analytics} onClose={() => setAnalytics(null)} />}
    </div>
  );
}

// ————— Editor with upload, live preview, templates, A/B, versions, audit —————
function BannerEditor({ initial, onClose, onSaved, triggerToast }: { initial: any; onClose: () => void; onSaved: () => void; triggerToast?: (m: string, t?: any) => void }) {
  const confirm = useConfirm();
  const [b, setB] = useState<any>({ ...initial });
  const [tab, setTab] = useState<"content" | "targeting" | "schedule" | "ab" | "history">("content");
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const set = (patch: any) => setB((p: any) => ({ ...p, ...patch }));

  useEffect(() => { if (tab === "history" && b.id) { apiFetch(`/api/admin/banners/${b.id}/versions`).then(r => setVersions(r.versions || [])).catch(() => {}); apiFetch(`/api/admin/banners/${b.id}/audit`).then(r => setAudit(r.logs || [])).catch(() => {}); } }, [tab, b.id]);

  const upload = (file: File) => new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 90)); };
    reader.onload = async () => { setPct(95); try { const res = await apiFetch("/api/admin/upload", { method: "POST", body: JSON.stringify({ dataUrl: reader.result, filename: file.name }) }); setPct(100); setTimeout(() => setPct(null), 500); resolve(res.url); } catch (e: any) { triggerToast?.("Upload failed: " + e.message, "error"); setPct(null); resolve(null); } };
    reader.onerror = () => { setPct(null); resolve(null); };
    reader.readAsDataURL(file);
  });
  const handleFile = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0]; const isVideo = f.type.startsWith("video/");
    const url = await upload(f);
    if (url) { if (isVideo) set({ video_url: url, banner_type: "video" }); else set({ image_url: url, banner_type: f.type.includes("gif") ? "gif" : "image" }); }
  };

  // Unified save. `statusOverride` lets action buttons publish/draft/archive in one click.
  // `closeAfter` (default true) keeps the editor open for actions like "Save Draft".
  const save = async (statusOverride?: string, closeAfter: boolean = true, successMsg?: string) => {
    if (!b.title?.trim()) { triggerToast?.("Title required.", "error"); return; }
    // If scheduling, make sure a start date was provided.
    if (statusOverride === "scheduled" && !b.start_at) { triggerToast?.("Set a Start date on the Schedule tab before scheduling.", "warning"); setTab("schedule"); return; }
    setSaving(true);
    try {
      const status = statusOverride || b.status;
      const nextState = { ...b, status, active: status === "published" ? 1 : (status === "scheduled" ? 1 : 0) };
      const payload = { ...nextState, image_url: nextState.image_url || (nextState.images && nextState.images[0]) || "", target_roles: toArr(nextState.target_roles), target_users: toArr(nextState.target_users), variant_b: nextState.ab_enabled ? nextState.variant_b : null };
      const res = await apiFetch("/api/admin/banners/save", { method: "POST", body: JSON.stringify(payload) });
      // Keep local id so subsequent actions target the same record.
      setB((p: any) => ({ ...p, id: p.id || res?.id || res?.banner?.id, status, active: nextState.active }));
      triggerToast?.(successMsg || "Banner saved.");
      if (closeAfter) onSaved();
    } catch (e: any) { triggerToast?.("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!b.id) { onClose(); return; }
    if (!(await confirm("Permanently delete this banner? This cannot be undone."))) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/banners/delete/${b.id}`, { method: "DELETE" });
      triggerToast?.("Banner deleted.", "success"); onSaved();
    } catch (e: any) { triggerToast?.("Delete failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };
  const restore = async (vid: number) => { if (!b.id || !(await confirm("Restore this version?"))) return; try { await apiFetch(`/api/admin/banners/${b.id}/restore/${vid}`, { method: "POST" }); triggerToast?.("Restored."); onSaved(); } catch (e: any) { triggerToast?.(e.message, "error"); } };

  const TabBtn = ({ id, label }: any) => <button onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === id ? "bg-purple-600 text-white" : "text-purple-200/50 hover:text-white"}`}>{label}</button>;

  return (
    <div className="fixed inset-0 z-[110] flex items-stretch justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl m-2 sm:m-6 rounded-2xl border border-purple-500/30 bg-[#0a0418] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-purple-500/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold font-space text-white truncate">{b.id ? "Edit" : "New"} Banner</h3>
            <Badge variant={b.status === "published" ? "success" : b.status === "scheduled" ? "warning" : b.status === "archived" ? "danger" : "default"}>{b.status || "draft"}</Badge>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button disabled={saving} onClick={() => setPreview(preview === "desktop" ? "mobile" : "desktop")} className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-bold text-purple-200 hover:text-white cursor-pointer disabled:opacity-50">Preview</button>
            <button disabled={saving} onClick={() => save("draft", false, "Draft saved.")} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-purple-100 hover:text-white cursor-pointer disabled:opacity-50">Save Draft</button>
            {b.start_at && (
              <button disabled={saving} onClick={() => save("scheduled", true, "Banner scheduled.")} className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer disabled:opacity-50">Schedule</button>
            )}
            {b.status === "published"
              ? <button disabled={saving} onClick={() => save("draft", true, "Banner unpublished.")} className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer disabled:opacity-50">Unpublish</button>
              : null}
            {b.id
              ? <Button size="sm" isLoading={saving} onClick={() => save("published", true, "Banner updated & live.")}>Update Banner</Button>
              : <Button size="sm" isLoading={saving} onClick={() => save("published", true, "Banner published & live.")}>Publish Banner</Button>}
            {b.id && <button disabled={saving} onClick={del} className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-[11px] font-bold text-red-300 hover:text-red-200 cursor-pointer disabled:opacity-50">Delete</button>}
            <button onClick={onClose} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          <div className="lg:w-1/2 overflow-y-auto custom-scrollbar-thin p-5 space-y-4 border-r border-purple-500/10">
            <div>
              <label className="text-[10px] font-bold text-purple-200/60 uppercase font-space mb-1.5 block">Templates</label>
              <div className="flex flex-wrap gap-1.5">{Object.keys(TEMPLATES).map(t => <button key={t} onClick={() => set(TEMPLATES[t])} className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-200 hover:text-white cursor-pointer">{t}</button>)}</div>
            </div>
            <div className="flex gap-1.5 border-b border-purple-500/10 pb-2">
              <TabBtn id="content" label="Content" /><TabBtn id="targeting" label="Targeting" /><TabBtn id="schedule" label="Schedule" /><TabBtn id="ab" label="A/B" />{b.id && <TabBtn id="history" label="History" />}
            </div>

            {tab === "content" && (<>
              <Input label="Title" value={b.title || ""} onChange={(e) => set({ title: e.target.value })} required />
              <Input label="Description" value={b.description || ""} onChange={(e) => set({ description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Position</label>
                  <select value={b.position} onChange={(e) => set({ position: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Type</label>
                  <select value={b.banner_type} onChange={(e) => set({ banner_type: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{TYPES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Media (image/gif/video)</label>
                <div className="border-2 border-dashed border-purple-500/25 rounded-xl p-3 text-center"
                  onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files); }}>
                  <Upload className="h-5 w-5 text-purple-400/60 mx-auto mb-1" />
                  <label className="inline-block px-3 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-bold cursor-pointer">Browse<input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFile(e.target.files)} /></label>
                  {pct !== null && <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} /></div>}
                </div>
                {b.image_url && <img src={b.image_url} className="mt-2 h-20 rounded-lg object-cover" alt="" />}
                <Input label="Image URL" value={b.image_url || ""} onChange={(e) => set({ image_url: e.target.value })} />
                <Input label="Video URL (or upload)" value={b.video_url || ""} onChange={(e) => set({ video_url: e.target.value })} />
                {b.banner_type === "html" && <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">HTML content</label><textarea rows={3} value={b.html_content || ""} onChange={(e) => set({ html_content: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-cyan-200 font-mono p-3 rounded-xl" /></div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CTA Text" value={b.cta_text || ""} onChange={(e) => set({ cta_text: e.target.value })} />
                <Input label="CTA URL" value={b.cta_url || ""} onChange={(e) => set({ cta_url: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Background</label><input type="color" value={b.bg_color || "#12082b"} onChange={(e) => set({ bg_color: e.target.value })} className="w-full h-9 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Text</label><input type="color" value={b.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} className="w-full h-9 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Transition</label><select value={b.transition} onChange={(e) => set({ transition: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <Input label="Autoplay (ms)" type="number" value={String(b.autoplay_ms ?? 5000)} onChange={(e) => set({ autoplay_ms: parseInt(e.target.value) || 5000 })} />
              </div>
            </>)}

            {tab === "targeting" && (<>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Audience</label>
                <select value={b.target_audience} onChange={(e) => set({ target_audience: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">
                  {[["all", "All"], ["guests", "Guests"], ["users", "Logged-in"], ["role", "By role"], ["selected", "Selected users"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              {b.target_audience === "role" && <Input label="Roles (comma)" value={(toArr(b.target_roles)).join(", ")} onChange={(e) => set({ target_roles: toArr(e.target.value) })} />}
              {b.target_audience === "selected" && <Input label="User IDs (comma)" value={(toArr(b.target_users)).join(", ")} onChange={(e) => set({ target_users: toArr(e.target.value) })} />}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Priority" type="number" value={String(b.priority ?? 0)} onChange={(e) => set({ priority: parseInt(e.target.value) || 0 })} />
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Dismissible</label><select value={String(b.dismissible ?? 0)} onChange={(e) => set({ dismissible: parseInt(e.target.value) })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl"><option value="0">No</option><option value="1">Yes</option></select></div>
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Frequency</label>
                <select value={b.frequency} onChange={(e) => set({ frequency: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{[["always", "Always"], ["once", "Once"], ["once_per_session", "Once/session"], ["every_x_hours", "Every X hours"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              {b.frequency === "every_x_hours" && <Input label="Hours" type="number" value={String(b.frequency_hours ?? 24)} onChange={(e) => set({ frequency_hours: parseInt(e.target.value) || 24 })} />}
            </>)}

            {tab === "schedule" && (<>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Start</label><input type="datetime-local" value={b.start_at ? b.start_at.slice(0, 16) : ""} onChange={(e) => set({ start_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">End</label><input type="datetime-local" value={b.end_at ? b.end_at.slice(0, 16) : ""} onChange={(e) => set({ end_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Status</label><select value={b.status} onChange={(e) => set({ status: e.target.value, active: e.target.value === "published" ? 1 : 0 })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
            </>)}

            {tab === "ab" && (<>
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer"><input type="checkbox" checked={!!b.ab_enabled} onChange={(e) => set({ ab_enabled: e.target.checked ? 1 : 0, variant_b: e.target.checked ? (b.variant_b || { title: b.title, cta_text: b.cta_text }) : null })} /><span>Enable A/B testing (50/50)</span></label>
              {b.ab_enabled ? (
                <div className="space-y-3 p-3 rounded-xl bg-black/30 border border-purple-500/15">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase font-space">Variant B</span>
                  <Input label="B Title" value={b.variant_b?.title || ""} onChange={(e) => set({ variant_b: { ...(b.variant_b || {}), title: e.target.value } })} />
                  <Input label="B Description" value={b.variant_b?.description || ""} onChange={(e) => set({ variant_b: { ...(b.variant_b || {}), description: e.target.value } })} />
                  <Input label="B CTA Text" value={b.variant_b?.cta_text || ""} onChange={(e) => set({ variant_b: { ...(b.variant_b || {}), cta_text: e.target.value } })} />
                  <Input label="B Image URL" value={b.variant_b?.image_url || ""} onChange={(e) => set({ variant_b: { ...(b.variant_b || {}), image_url: e.target.value } })} />
                </div>
              ) : <p className="text-xs text-purple-200/40">Enable to compare two banner variants.</p>}
            </>)}

            {tab === "history" && (<>
              <span className="text-[10px] font-bold text-purple-200/60 uppercase font-space flex items-center gap-1"><History className="h-3 w-3" /> Versions</span>
              {versions.length === 0 ? <p className="text-xs text-purple-200/30 italic">No versions.</p> : versions.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-purple-500/10 text-xs"><div><span className="text-white font-bold">{v.changed_by}</span> <span className="text-purple-200/40">· {v.change_note} · {new Date(v.created_at).toLocaleString()}</span></div><button onClick={() => restore(v.id)} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 cursor-pointer"><RotateCcw className="h-3.5 w-3.5" /></button></div>
              ))}
              <div className="pt-2 border-t border-purple-500/10"><span className="text-[10px] font-bold text-purple-200/60 uppercase font-space">Audit</span>{audit.map((l, i) => <div key={i} className="text-[11px] text-purple-200/60"><span className="text-white font-bold">{l.username}</span> — {l.action}</div>)}</div>
            </>)}
          </div>

          {/* Live preview */}
          <div className="lg:w-1/2 bg-[#05020a] p-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-purple-200/60 uppercase font-space flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Preview</span>
              <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1"><button onClick={() => setPreview("desktop")} className={`p-1.5 rounded cursor-pointer ${preview === "desktop" ? "bg-purple-600 text-white" : "text-purple-200/50"}`}><Monitor className="h-4 w-4" /></button><button onClick={() => setPreview("mobile")} className={`p-1.5 rounded cursor-pointer ${preview === "mobile" ? "bg-purple-600 text-white" : "text-purple-200/50"}`}><Smartphone className="h-4 w-4" /></button></div>
            </div>
            <div className="flex-1 overflow-y-auto flex items-start justify-center">
              <div className={`${preview === "mobile" ? "w-[320px]" : "w-full"} mx-auto`}>
                <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-purple-500/20" style={{ background: b.bg_color || undefined, color: b.text_color || undefined }}>
                  {b.image_url && <img src={b.image_url} className="absolute inset-0 w-full h-full object-cover" alt="" />}
                  {b.banner_type === "video" && !b.image_url && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-purple-200/40 text-xs">▶ video</div>}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />
                  <div className="relative z-10 h-full flex flex-col justify-center p-5 max-w-sm">
                    <h3 className="text-xl font-black font-space text-white">{b.title || "Banner title"}</h3>
                    {b.description && <p className="text-xs text-white/80 mt-1">{b.description}</p>}
                    {b.cta_text && <button className="mt-2 inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold w-fit">{b.cta_text}<ArrowRight className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BannerAnalytics({ data, onClose }: { data: any; onClose: () => void }) {
  const series = data.series || [];
  const byDay: Record<string, number> = {};
  for (const s of series) if (s.event_type === "view") byDay[s.day] = (byDay[s.day] || 0) + s.count;
  const days = Object.keys(byDay).sort();
  const max = Math.max(1, ...days.map(d => byDay[d]));
  const t = data.totals || {};
  const ctr = t.views ? Math.round((t.clicks / t.views) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-2xl p-6 border border-purple-500/30 bg-[#0c0420] space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar-thin">
        <div className="flex justify-between items-center border-b border-purple-500/15 pb-3"><h4 className="text-sm font-bold font-space text-white">Analytics — {data.title}</h4><button onClick={onClose} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button></div>
        <div className="grid grid-cols-4 gap-3">
          {[["Views", t.views || 0], ["Clicks", t.clicks || 0], ["Dismissals", t.dismissals || 0], ["CTR", ctr + "%"]].map(([l, v]: any) => (
            <div key={l} className="p-3 rounded-xl bg-black/40 border border-purple-500/10 text-center"><span className="text-[9px] text-purple-200/40 uppercase font-bold block">{l}</span><span className="text-lg font-black font-space text-cyan-400">{v}</span></div>
          ))}
        </div>
        {data.ab_enabled ? <div className="grid grid-cols-2 gap-3 text-xs"><div className="p-3 rounded-xl bg-purple-600/10 border border-purple-500/20"><span className="font-bold text-purple-300">A</span><div className="text-purple-200/60 mt-1">V {t.views || 0} · C {t.clicks || 0}</div></div><div className="p-3 rounded-xl bg-cyan-600/10 border border-cyan-500/20"><span className="font-bold text-cyan-300">B</span><div className="text-purple-200/60 mt-1">V {t.views_b || 0} · C {t.clicks_b || 0}</div></div></div> : null}
        <div className="space-y-2"><span className="text-[10px] text-purple-200/50 uppercase font-bold font-space">Views (30d)</span>
          {days.length === 0 ? <p className="text-xs text-purple-200/30 italic">No data yet.</p> : (
            <div className="flex items-end gap-1 h-28 border-b border-purple-500/10 pb-1">{days.map(d => <div key={d} className="flex-1 bg-gradient-to-t from-purple-600 to-cyan-400 rounded-t" style={{ height: `${(byDay[d] / max) * 100}%`, minHeight: 2 }} title={`${d}: ${byDay[d]}`} />)}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
