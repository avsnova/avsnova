import { useState, useEffect, useCallback, useRef } from "react";
import {
  Image as ImageIcon, Film, FileText, Search, UploadCloud, Trash, X, Check,
  Folder, Loader2, Link2, Copy, Info, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";

/**
 * MediaLibrary — the platform's single, reusable asset manager.
 * Two modes:
 *   • Standalone (default) — full management surface (admin tab).
 *   • Picker (onPick provided) — same grid, clicking an asset returns its URL.
 * Backed by /api/admin/media*. Uploads flow through /api/admin/upload which
 * records into media_library (with duplicate detection), so every module shares it.
 */

interface MediaItem {
  id: number; url: string; filename?: string; mime?: string; kind?: string;
  folder?: string; tags?: string; size?: number; alt?: string; created_at?: string;
}
interface FolderCount { folder: string; c: number; }

interface Props {
  /** When provided, the component acts as a picker and calls this with the chosen URL. */
  onPick?: (url: string) => void;
  /** Restrict to a media kind. */
  kindFilter?: "image" | "video" | "document";
  /** Compact height for embedding in modals. */
  compact?: boolean;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-4 w-4" />, video: <Film className="h-4 w-4" />, document: <FileText className="h-4 w-4" />,
};

export default function MediaLibrary({ onPick, kindFilter, compact }: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<FolderCount[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [folder, setFolder] = useState("all");
  const [kind, setKind] = useState<string>(kindFilter || "all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (folder !== "all") params.set("folder", folder);
      if (kind !== "all") params.set("kind", kind);
      if (q) params.set("q", q);
      params.set("page", String(page));
      const res = await apiFetch(`/api/admin/media?${params.toString()}`);
      setRows(res.rows || []); setTotal(res.total || 0); setTotalPages(res.totalPages || 1); setFolders(res.folders || []);
    } catch (err: any) { toast("Failed to load media: " + err.message, "error"); }
    finally { setLoading(false); }
  }, [folder, kind, q, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [folder, kind, q]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    let ok = 0, dup = 0;
    for (const f of arr) {
      try {
        const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
        const resp = await apiFetch("/api/admin/upload", { method: "POST", body: JSON.stringify({ dataUrl, filename: f.name, folder: folder !== "all" ? folder : "General" }) });
        if (resp?.duplicate) dup++; else ok++;
      } catch (err: any) { toast(`"${f.name}" failed: ` + err.message, "error"); }
    }
    setUploading(false);
    toast(`Uploaded ${ok} file(s)${dup ? `, ${dup} duplicate(s) reused` : ""}.`, "success");
    load();
  }, [folder, load, toast]);

  const del = async (m: MediaItem) => {
    if (!(await confirm({ title: "Delete asset", message: `Delete "${m.filename || m.url}"? If it's in use you'll be warned.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await apiFetch(`/api/admin/media/${m.id}`, { method: "DELETE" });
      toast("Deleted.", "success"); setDetail(null); load();
    } catch (err: any) {
      // 409 = in use
      if (err.message && err.message.toLowerCase().includes("in use")) {
        if (await confirm({ title: "Asset in use", message: err.message + " Delete anyway?", confirmLabel: "Force delete", danger: true })) {
          try { await apiFetch(`/api/admin/media/${m.id}?force=1`, { method: "DELETE" }); toast("Force-deleted.", "success"); setDetail(null); load(); }
          catch (e: any) { toast("Failed: " + e.message, "error"); }
        }
      } else toast("Delete failed: " + err.message, "error");
    }
  };

  const isImg = (m: MediaItem) => (m.kind === "image") || /\.(png|jpe?g|webp|gif)$/i.test(m.url);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-4 transition ${dragOver ? "border-cyan-500/60 bg-cyan-500/5" : "border-purple-500/20 bg-black/20"}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-purple-200/70 text-xs">
            <UploadCloud className="h-4 w-4 text-cyan-400" />
            Drag & drop files here, or
            <button onClick={() => inputRef.current?.click()} className="text-cyan-300 font-bold underline cursor-pointer">browse</button>
            <input ref={inputRef} type="file" multiple accept={kindFilter === "image" ? "image/*" : undefined} className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
          </div>
          {uploading && <span className="text-[11px] text-cyan-300 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/50" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setQ(qInput); }} placeholder="Search filename, tags…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-xl focus:outline-none" />
        </div>
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
          <option value="all" className="bg-neutral-900">All folders</option>
          {folders.map((f) => <option key={f.folder} value={f.folder} className="bg-neutral-900">{f.folder} ({f.c})</option>)}
        </select>
        {!kindFilter && (
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none">
            <option value="all" className="bg-neutral-900">All types</option>
            <option value="image" className="bg-neutral-900">Images</option>
            <option value="video" className="bg-neutral-900">Videos</option>
            <option value="document" className="bg-neutral-900">Documents</option>
          </select>
        )}
      </div>

      {/* Grid */}
      <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 ${compact ? "max-h-[300px] overflow-y-auto" : ""}`}>
        {loading ? (
          <div className="col-span-full py-8 text-center text-purple-300/50 text-xs"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>
        ) : rows.length === 0 ? (
          <div className="col-span-full py-8 text-center text-purple-300/50 text-xs">No media yet. Upload files above.</div>
        ) : rows.map((m) => (
          <div key={m.id} className="group relative aspect-square rounded-xl overflow-hidden border border-purple-500/15 bg-black/40">
            <button
              onClick={() => onPick ? onPick(m.url) : setDetail(m)}
              className="w-full h-full flex items-center justify-center cursor-pointer"
              title={m.filename}
            >
              {isImg(m) ? <img src={m.url} alt={m.alt || m.filename} className="w-full h-full object-cover" loading="lazy" /> : <div className="text-purple-300/60 flex flex-col items-center gap-1">{KIND_ICON[m.kind || "document"]}<span className="text-[8px] px-1 truncate max-w-full">{m.filename}</span></div>}
            </button>
            {onPick && <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/20 pointer-events-none flex items-center justify-center"><Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100" /></div>}
            {!onPick && (
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => setDetail(m)} className="p-1 rounded bg-black/70 text-cyan-300 cursor-pointer" title="Details"><Info className="h-3 w-3" /></button>
                <button onClick={() => del(m)} className="p-1 rounded bg-black/70 text-red-300 cursor-pointer" title="Delete"><Trash className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[11px] text-purple-300/60">
        <span>{total} asset(s)</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {detail && <MediaDetail item={detail} onClose={() => setDetail(null)} onDelete={() => del(detail)} onSaved={load} />}
    </div>
  );
}

function MediaDetail({ item, onClose, onDelete, onSaved }: { item: MediaItem; onClose: () => void; onDelete: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [folder, setFolder] = useState(item.folder || "General");
  const [tags, setTags] = useState(item.tags || "");
  const [alt, setAlt] = useState(item.alt || "");
  const [usage, setUsage] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const isImg = (item.kind === "image") || /\.(png|jpe?g|webp|gif)$/i.test(item.url);

  useEffect(() => { (async () => { try { const r = await apiFetch(`/api/admin/media/${item.id}/usage`); setUsage(r.usage || []); } catch { setUsage([]); } })(); }, [item.id]);

  const save = async () => {
    setSaving(true);
    try { await apiFetch(`/api/admin/media/${item.id}`, { method: "PUT", body: JSON.stringify({ folder, tags, alt }) }); toast("Saved.", "success"); onSaved(); onClose(); }
    catch (err: any) { toast("Failed: " + err.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg my-8 bg-[#0e0922] border border-purple-500/30 rounded-2xl p-6 shadow-2xl z-10">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-bold font-space text-white">Asset Details</h3>
          <button onClick={onClose} className="text-purple-200/40 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="aspect-video rounded-xl overflow-hidden bg-black/40 flex items-center justify-center mb-3">
          {isImg ? <img src={item.url} alt={item.alt} className="max-h-full max-w-full object-contain" /> : <FileText className="h-12 w-12 text-purple-300/40" />}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 text-[10px] font-mono text-purple-200/60 truncate bg-black/30 border border-purple-500/15 rounded-lg px-2 py-1.5">{item.url}</div>
          <button onClick={async () => { await copyToClipboard(item.url); toast("URL copied.", "success"); }} className="p-2 rounded-lg border border-purple-500/20 text-cyan-300 cursor-pointer"><Copy className="h-3.5 w-3.5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="text-[11px] font-bold text-purple-200/70 font-space">Folder</label><input value={folder} onChange={(e) => setFolder(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none mt-1" /></div>
          <div><label className="text-[11px] font-bold text-purple-200/70 font-space">Tags</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma,separated" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none mt-1" /></div>
        </div>
        <div className="mb-3"><label className="text-[11px] font-bold text-purple-200/70 font-space">Alt text</label><input value={alt} onChange={(e) => setAlt(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none mt-1" /></div>
        <div className="mb-4">
          <span className="text-[11px] font-bold text-purple-200/70 font-space">Used in</span>
          {usage === null ? <p className="text-[11px] text-purple-300/40 mt-1">Checking…</p>
            : usage.length === 0 ? <p className="text-[11px] text-emerald-300/70 mt-1">Not used anywhere — safe to delete.</p>
            : <div className="flex flex-wrap gap-1.5 mt-1">{usage.map((u, i) => <span key={i} className="px-2 py-0.5 rounded-md border border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-200">{u.type}: {u.label}</span>)}</div>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={save} isLoading={saving} className="flex-1">Save</Button>
          <button onClick={onDelete} className="px-4 py-2 rounded-lg border border-red-500/25 text-red-300 text-sm font-bold cursor-pointer flex items-center gap-1"><Trash className="h-3.5 w-3.5" /> Delete</button>
        </div>
      </div>
    </div>
  );
}

// Lightweight picker modal wrapper for reuse across the platform.
export function MediaPickerModal({ open, onClose, onPick, kindFilter }: { open: boolean; onClose: () => void; onPick: (url: string) => void; kindFilter?: "image" | "video" | "document" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl my-8 bg-[#0e0922] border border-purple-500/30 rounded-2xl p-6 shadow-2xl z-10">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-base font-bold font-space text-white">Choose from Media Library</h3>
          <button onClick={onClose} className="text-purple-200/40 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <MediaLibrary onPick={(url) => { onPick(url); onClose(); }} kindFilter={kindFilter} compact />
      </div>
    </div>
  );
}
