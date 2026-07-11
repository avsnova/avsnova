import { useState, useEffect, useRef } from "react";
import { X, Upload, Trash2, Eye, Send, Monitor, Smartphone, History, RotateCcw, FileText } from "lucide-react";
import { Button, Input, Badge } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import { useConfirm } from "../ui/ConfirmDialog";
import RichTextEditor from "./RichTextEditor";

// Ready-made templates (#5)
// Ready-to-edit demo announcement templates. Each uses a distinct display type/style so admins
// can pick a starting point, then edit every field (title, rich body, colours, CTA, targeting).
const TEMPLATES: Record<string, any> = {
  "Welcome to AVS Marketplace": { category: "news", display_type: "modal", title: "👋 Welcome to AVS Marketplace", body: "<p>Welcome aboard! Explore <b>digital services, SMS/SMM tools and International Gift Delivery</b> — all in one place.</p>", cta_text: "Start Exploring", cta_url: "/Marketplace", bg_color: "#4c1d95", text_color: "#ffffff" },
  "New Features Available": { category: "feature", display_type: "banner", title: "✨ New Features Available", body: "<p>We just shipped powerful new features. Check out what's new!</p>", cta_text: "See What's New", cta_url: "/Dashboard" },
  "System Maintenance": { category: "maintenance", display_type: "top_banner", title: "🛠️ Scheduled System Maintenance", body: "<p>We'll be performing maintenance soon. Some services may be briefly unavailable.</p>", bg_color: "#7f1d1d", text_color: "#ffffff" },
  "Holiday Promotion": { category: "promotion", display_type: "fullscreen", title: "🎄 Holiday Promotion", body: "<p>Celebrate the season with festive savings across the store!</p>", cta_text: "Shop Deals", cta_url: "/Marketplace", bg_color: "#b91c1c", text_color: "#ffffff" },
  "International Gift Delivery Now Available": { category: "feature", display_type: "modal", title: "🎁 International Gift Delivery Now Available", body: "<p>Send heartfelt gifts anywhere in the world — food, flowers, custom photo gifts and more.</p>", cta_text: "Send a Gift", cta_url: "/Marketplace", bg_color: "#db2777", text_color: "#ffffff" },
  "Flash Sale Starts Today": { category: "promotion", display_type: "popup", title: "⚡ Flash Sale Starts Today", body: "<p>Massive discounts for a limited time only. Don't miss out!</p>", cta_text: "Shop the Sale", cta_url: "/Marketplace", bg_color: "#7c3aed", text_color: "#ffffff" },
  "Referral Bonus": { category: "promotion", display_type: "floating", title: "💰 Referral Bonus", body: "<p>Invite friends and earn wallet credits when they sign up.</p>", cta_text: "Invite Friends", cta_url: "/Profile", bg_color: "#065f46", text_color: "#ffffff" },
  "Community Update": { category: "community", display_type: "banner", title: "👥 Community Update", body: "<p>Connect with other AVS users for tips, news and exclusive offers.</p>", cta_text: "Join Now", cta_url: "https://t.me/avslogs" },
};

const DISPLAY_TYPES = ["banner", "bottom_banner", "modal", "popup", "floating", "fullscreen", "slider"];
const CATEGORIES = ["promotion", "community", "event", "news", "feature", "maintenance"];

function toArr(v: any): string[] {
  if (Array.isArray(v)) return v;
  return String(v || "").split(",").map(s => s.trim()).filter(Boolean);
}

export default function AnnouncementEditor({ initial, onClose, onSaved, triggerToast }: {
  initial: any; onClose: () => void; onSaved: () => void; triggerToast?: (m: string, t?: any) => void;
}) {
  const confirm = useConfirm();
  const [a, setA] = useState<any>(() => ({
    frequency: "always", target_audience: "all", status: "published", dismissible: 1,
    priority: 0, timezone: "Africa/Lagos", ab_enabled: 0, variant_b: null,
    ...initial,
    images: toArr(initial?.images),
    target_roles: toArr(initial?.target_roles),
    target_pages: toArr(initial?.target_pages),
    target_users: toArr(initial?.target_users),
  }));
  const [tab, setTab] = useState<"content" | "targeting" | "schedule" | "ab" | "history">("content");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  const set = (patch: any) => setA((prev: any) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (tab === "history" && a.id) {
      apiFetch(`/api/admin/announcements/${a.id}/versions`).then(r => setVersions(r.versions || [])).catch(() => {});
      apiFetch(`/api/admin/announcements/${a.id}/audit`).then(r => setAuditLogs(r.logs || [])).catch(() => {});
    }
  }, [tab, a.id]);

  const applyTemplate = (name: string) => {
    const t = TEMPLATES[name];
    if (t) set({ ...t });
  };

  // Upload via base64 with a simulated-but-real progress using XHR-less fetch chunking is complex;
  // we read the file, then POST base64 to the server and show determinate progress on read.
  const uploadFile = (file: File) => new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 90)); };
    reader.onload = async () => {
      setUploadPct(95);
      try {
        const res = await apiFetch("/api/admin/upload", { method: "POST", body: JSON.stringify({ dataUrl: reader.result, filename: file.name }) });
        setUploadPct(100);
        setTimeout(() => setUploadPct(null), 600);
        resolve(res.url || null);
      } catch (e: any) {
        triggerToast?.("Upload failed: " + e.message, "error"); setUploadPct(null); resolve(null);
      }
    };
    reader.onerror = () => { setUploadPct(null); resolve(null); };
    reader.readAsDataURL(file);
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const isVideo = f.type.startsWith("video/");
      const url = await uploadFile(f);
      if (url) {
        // Use functional update so multiple files in one drop all append correctly.
        setA((prev: any) => isVideo ? { ...prev, video_url: url } : { ...prev, images: [...(prev.images || []), url] });
      }
    }
  };

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e: DragEvent) => { e.preventDefault(); el.classList.add("ring-2", "ring-cyan-400"); };
    const leave = () => el.classList.remove("ring-2", "ring-cyan-400");
    const drop = (e: DragEvent) => { e.preventDefault(); leave(); handleFiles(e.dataTransfer?.files || null); };
    el.addEventListener("dragover", over); el.addEventListener("dragleave", leave); el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragover", over); el.removeEventListener("dragleave", leave); el.removeEventListener("drop", drop); };
  }, [a.images]);

  // Unified save with optional status override so action buttons can publish/draft/archive/expire
  // in a single click. `closeAfter` keeps the editor open (e.g. for "Save Draft").
  const save = async (statusOverride?: string, closeAfter: boolean = true, successMsg?: string) => {
    if (!a.title?.trim()) { triggerToast?.("Title is required.", "error"); return; }
    if (statusOverride === "scheduled" && !a.start_at) { triggerToast?.("Set a Start date on the Schedule tab before scheduling.", "warning"); setTab("schedule"); return; }
    setSaving(true);
    try {
      const status = statusOverride || a.status;
      // "Expire" sets the end date to now so it disappears immediately for users.
      const endAt = statusOverride === "expired" ? new Date().toISOString() : a.end_at;
      const nextState = { ...a, status: statusOverride === "expired" ? "archived" : status, end_at: endAt };
      const payload = { ...nextState, images: nextState.images, target_roles: nextState.target_roles, target_pages: nextState.target_pages, target_users: nextState.target_users, variant_b: nextState.ab_enabled ? nextState.variant_b : null };
      const res = await apiFetch("/api/admin/announcements/save", { method: "POST", body: JSON.stringify(payload) });
      setA((p: any) => ({ ...p, id: p.id || res?.id || res?.announcement?.id, status: nextState.status, end_at: endAt }));
      triggerToast?.(successMsg || "Announcement saved.");
      if (closeAfter) onSaved();
    } catch (e: any) { triggerToast?.("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!a.id) { onClose(); return; }
    if (!(await confirm("Permanently delete this announcement? This cannot be undone."))) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/announcements/delete/${a.id}`, { method: "DELETE" });
      triggerToast?.("Announcement deleted.", "success"); onSaved();
    } catch (e: any) { triggerToast?.("Delete failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    try {
      await apiFetch("/api/admin/announcements/test", { method: "POST", body: JSON.stringify({ title: a.title, body: a.body }) });
      triggerToast?.("Test sent to your notifications.");
    } catch (e: any) { triggerToast?.("Test failed: " + e.message, "error"); }
  };

  const restore = async (versionId: number) => {
    if (!a.id || !(await confirm("Restore this version? Current state is snapshotted first."))) return;
    try {
      await apiFetch(`/api/admin/announcements/${a.id}/restore/${versionId}`, { method: "POST" });
      triggerToast?.("Version restored.");
      onSaved();
    } catch (e: any) { triggerToast?.("Restore failed: " + e.message, "error"); }
  };

  const TabBtn = ({ id, label }: any) => (
    <button onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === id ? "bg-purple-600 text-white" : "text-purple-200/50 hover:text-white"}`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-stretch justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl m-2 sm:m-6 rounded-2xl border border-purple-500/30 bg-[#0a0418] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-purple-500/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold font-space text-white truncate">{a.id ? "Edit" : "New"} Announcement</h3>
            <Badge variant={a.status === "published" ? "success" : a.status === "scheduled" ? "warning" : a.status === "archived" ? "danger" : "default"}>{a.status || "draft"}</Badge>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button disabled={saving} onClick={sendTest} className="hidden sm:inline-flex items-center px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-bold text-purple-200 hover:text-white cursor-pointer disabled:opacity-50"><Send className="h-3.5 w-3.5 mr-1" />Test</button>
            <button disabled={saving} onClick={() => save("draft", false, "Draft saved.")} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-purple-100 hover:text-white cursor-pointer disabled:opacity-50">Save Draft</button>
            {a.start_at && (
              <button disabled={saving} onClick={() => save("scheduled", true, "Announcement scheduled.")} className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer disabled:opacity-50">Schedule</button>
            )}
            {a.status === "published" && (
              <button disabled={saving} onClick={() => save("expired", true, "Announcement expired.")} className="px-2.5 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-[11px] font-bold text-orange-300 hover:text-orange-200 cursor-pointer disabled:opacity-50">Expire</button>
            )}
            {a.status !== "archived"
              ? <button disabled={saving} onClick={() => save("archived", true, "Announcement archived.")} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-purple-100 hover:text-white cursor-pointer disabled:opacity-50">Archive</button>
              : null}
            {a.id
              ? <Button size="sm" isLoading={saving} onClick={() => save("published", true, "Announcement updated & live.")}>Update</Button>
              : <Button size="sm" isLoading={saving} onClick={() => save("published", true, "Announcement published & live.")}>Publish</Button>}
            {a.id && <button disabled={saving} onClick={del} className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-[11px] font-bold text-red-300 hover:text-red-200 cursor-pointer disabled:opacity-50">Delete</button>}
            <button onClick={onClose} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* LEFT: form */}
          <div className="lg:w-1/2 overflow-y-auto custom-scrollbar-thin p-5 space-y-4 border-r border-purple-500/10">
            {/* Templates */}
            <div>
              <label className="text-[10px] font-bold text-purple-200/60 uppercase font-space flex items-center gap-1 mb-1.5"><FileText className="h-3 w-3" /> Templates</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(TEMPLATES).map(t => (
                  <button key={t} onClick={() => applyTemplate(t)} className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-200 hover:text-white hover:border-purple-500/40 cursor-pointer">{t}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-1.5 border-b border-purple-500/10 pb-2">
              <TabBtn id="content" label="Content" />
              <TabBtn id="targeting" label="Targeting" />
              <TabBtn id="schedule" label="Schedule" />
              <TabBtn id="ab" label="A/B Test" />
              {a.id && <TabBtn id="history" label="History" />}
            </div>

            {tab === "content" && (<>
              <Input label="Title" value={a.title || ""} onChange={(e) => set({ title: e.target.value })} required />
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Body (rich text)</label>
                <RichTextEditor value={a.body || ""} onChange={(html) => set({ body: html })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Category</label>
                  <select value={a.category} onChange={(e) => set({ category: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Display Type</label>
                  <select value={a.display_type} onChange={(e) => set({ display_type: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">{DISPLAY_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>

              {/* Media upload with drag & drop + progress */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Media (images / video)</label>
                <div ref={dropRef} className="border-2 border-dashed border-purple-500/25 rounded-xl p-4 text-center transition-all">
                  <Upload className="h-6 w-6 text-purple-400/60 mx-auto mb-1" />
                  <p className="text-[11px] text-purple-200/50">Drag & drop images/video here, or</p>
                  <label className="inline-block mt-1.5 px-3 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-bold cursor-pointer">
                    Browse files
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                  </label>
                  {uploadPct !== null && (
                    <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadPct}%` }} /></div>
                  )}
                </div>
                {a.images?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {a.images.map((url: string, i: number) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="h-16 w-16 object-cover rounded-lg border border-purple-500/20" />
                        <button onClick={() => set({ images: a.images.filter((_: any, j: number) => j !== i) })} className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-500 text-white cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <Input label="Video URL (or upload above)" value={a.video_url || ""} onChange={(e) => set({ video_url: e.target.value })} placeholder="https://youtube.com/watch?v=… or /uploads/…" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="CTA Text" value={a.cta_text || ""} onChange={(e) => set({ cta_text: e.target.value })} />
                <Input label="CTA URL / route" value={a.cta_url || ""} onChange={(e) => set({ cta_url: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Background</label><input type="color" value={a.bg_color || "#12082b"} onChange={(e) => set({ bg_color: e.target.value })} className="w-full h-9 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Text Color</label><input type="color" value={a.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} className="w-full h-9 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /></div>
              </div>
            </>)}

            {tab === "targeting" && (<>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Audience</label>
                <select value={a.target_audience} onChange={(e) => set({ target_audience: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">
                  {[["all", "All"], ["guests", "Guests only"], ["users", "Logged-in only"], ["role", "By role"], ["selected", "Selected users"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {a.target_audience === "role" && <Input label="Roles (comma separated)" value={(a.target_roles || []).join(", ")} onChange={(e) => set({ target_roles: toArr(e.target.value) })} placeholder="Customer, Admin" />}
              {a.target_audience === "selected" && <Input label="User IDs (comma separated)" value={(a.target_users || []).join(", ")} onChange={(e) => set({ target_users: toArr(e.target.value) })} placeholder="4, 12" />}
              <Input label="Pages (comma separated, blank = all)" value={(a.target_pages || []).join(", ")} onChange={(e) => set({ target_pages: toArr(e.target.value) })} placeholder="Dashboard, Marketplace, landing" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Frequency</label>
                  <select value={a.frequency} onChange={(e) => set({ frequency: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">
                    {[["always", "Always"], ["once", "Show once"], ["once_per_session", "Once/session"], ["every_login", "Every login"], ["every_x_hours", "Every X hours"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {a.frequency === "every_x_hours" && <Input label="Hours" type="number" value={String(a.frequency_hours ?? 24)} onChange={(e) => set({ frequency_hours: parseInt(e.target.value) || 24 })} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Priority" type="number" value={String(a.priority ?? 0)} onChange={(e) => set({ priority: parseInt(e.target.value) || 0 })} />
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Dismissible</label>
                  <select value={String(a.dismissible ?? 1)} onChange={(e) => set({ dismissible: parseInt(e.target.value) })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl"><option value="1">Yes</option><option value="0">No</option></select>
                </div>
              </div>
            </>)}

            {tab === "schedule" && (<>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Start</label>
                  <input type="datetime-local" value={a.start_at ? a.start_at.slice(0, 16) : ""} onChange={(e) => set({ start_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">End (expiry)</label>
                  <input type="datetime-local" value={a.end_at ? a.end_at.slice(0, 16) : ""} onChange={(e) => set({ end_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl" /></div>
                <Input label="Timezone" value={a.timezone || "Africa/Lagos"} onChange={(e) => set({ timezone: e.target.value })} />
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Recurring</label>
                  <select value={a.recurring || "none"} onChange={(e) => set({ recurring: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl">
                    {["none", "daily", "weekly", "monthly"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Status</label>
                  <select value={a.status} onChange={(e) => set({ status: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
                </div>
              </div>
            </>)}

            {tab === "ab" && (<>
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input type="checkbox" checked={!!a.ab_enabled} onChange={(e) => set({ ab_enabled: e.target.checked ? 1 : 0, variant_b: e.target.checked ? (a.variant_b || { title: a.title, body: a.body }) : null })} />
                <span>Enable A/B testing (50/50 split)</span>
              </label>
              {a.ab_enabled ? (
                <div className="space-y-3 p-3 rounded-xl bg-black/30 border border-purple-500/15">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase font-space">Variant B</span>
                  <Input label="Variant B Title" value={a.variant_b?.title || ""} onChange={(e) => set({ variant_b: { ...(a.variant_b || {}), title: e.target.value } })} />
                  <div className="space-y-1.5"><label className="text-[10px] font-bold text-purple-200/70 uppercase font-space">Variant B Body</label>
                    <RichTextEditor value={a.variant_b?.body || ""} onChange={(html) => set({ variant_b: { ...(a.variant_b || {}), body: html } })} />
                  </div>
                  <Input label="Variant B CTA Text" value={a.variant_b?.cta_text || ""} onChange={(e) => set({ variant_b: { ...(a.variant_b || {}), cta_text: e.target.value } })} />
                </div>
              ) : <p className="text-xs text-purple-200/40">Enable to test two variants and compare views/clicks/CTR per variant.</p>}
            </>)}

            {tab === "history" && (<>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-purple-200/60 uppercase font-space flex items-center gap-1"><History className="h-3 w-3" /> Version History</span>
                {versions.length === 0 ? <p className="text-xs text-purple-200/30 italic">No versions yet.</p> : versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-purple-500/10 text-xs">
                    <div><span className="text-white font-bold">{v.changed_by}</span> <span className="text-purple-200/40">· {v.change_note} · {new Date(v.created_at).toLocaleString()}</span></div>
                    <button onClick={() => restore(v.id)} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 hover:text-white cursor-pointer" title="Restore"><RotateCcw className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-3 border-t border-purple-500/10">
                <span className="text-[10px] font-bold text-purple-200/60 uppercase font-space">Audit Trail</span>
                {auditLogs.length === 0 ? <p className="text-xs text-purple-200/30 italic">No audit entries.</p> : auditLogs.map((l, i) => (
                  <div key={i} className="text-[11px] text-purple-200/60"><span className="text-white font-bold">{l.username}</span> — {l.action} <span className="text-purple-200/30">({new Date(l.created_at).toLocaleString()})</span></div>
                ))}
              </div>
            </>)}
          </div>

          {/* RIGHT: live preview */}
          <div className="lg:w-1/2 bg-[#05020a] p-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-xs font-bold text-purple-200/60 uppercase font-space flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Live Preview</span>
              <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
                <button onClick={() => setPreviewMode("desktop")} className={`p-1.5 rounded cursor-pointer ${previewMode === "desktop" ? "bg-purple-600 text-white" : "text-purple-200/50"}`}><Monitor className="h-4 w-4" /></button>
                <button onClick={() => setPreviewMode("mobile")} className={`p-1.5 rounded cursor-pointer ${previewMode === "mobile" ? "bg-purple-600 text-white" : "text-purple-200/50"}`}><Smartphone className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar-thin flex items-start justify-center">
              <div className={`transition-all ${previewMode === "mobile" ? "w-[320px]" : "w-full"} mx-auto`}>
                <PreviewCard a={a} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Static preview that mirrors the runtime look for the chosen display type.
function PreviewCard({ a }: { a: any }) {
  const style = { background: a.bg_color || undefined, color: a.text_color || undefined };
  const body = <div className="announcement-body text-sm opacity-90" dangerouslySetInnerHTML={{ __html: a.body || "<p class='opacity-40'>Body preview…</p>" }} />;
  const cta = a.cta_text ? <button className="mt-2 inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-white/15 border border-white/20 text-xs font-bold">{a.cta_text}</button> : null;

  if (a.display_type === "modal" || a.display_type === "popup" || a.display_type === "fullscreen") {
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-br from-[#160b32] to-[#080416] shadow-2xl" style={style}>
        {a.video_url ? <div className="p-3 pb-0"><div className="aspect-video bg-black/60 rounded-lg flex items-center justify-center text-[10px] text-purple-200/40">▶ video</div></div> : (a.images?.[0] && <img src={a.images[0]} className="w-full max-h-40 object-cover" alt="" />)}
        <div className="p-5 text-center space-y-2">
          <h3 className="text-lg font-black font-space text-white">{a.title || "Title preview"}</h3>
          {body}{cta}
        </div>
      </div>
    );
  }
  if (a.display_type === "floating") {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[#1a0f38] to-[#0a0418] border border-purple-500/30 shadow-2xl p-4 max-w-xs" style={style}>
        <h4 className="font-bold text-white text-sm font-space">{a.title || "Title preview"}</h4>{body}
        {a.images?.[0] && <img src={a.images[0]} className="mt-2 rounded-lg w-full max-h-24 object-cover" alt="" />}
        {cta}
      </div>
    );
  }
  if (a.display_type === "slider") {
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-500/20 bg-gradient-to-r from-[#1a0f38] to-[#0a0418] p-4 flex gap-3" style={style}>
        {a.images?.[0] && <img src={a.images[0]} className="w-32 h-24 object-cover rounded-xl" alt="" />}
        <div className="flex-1"><h4 className="font-black font-space text-white">{a.title || "Title preview"}</h4>{body}{cta}</div>
      </div>
    );
  }
  // banners
  return (
    <div className="rounded-xl bg-gradient-to-r from-purple-700 to-cyan-600 text-white px-4 py-3 flex items-center justify-between gap-3" style={style}>
      <div className="min-w-0"><span className="font-bold text-sm">{a.title || "Title preview"}</span><div className="text-xs opacity-80">{body}</div></div>
      {cta}
    </div>
  );
}
