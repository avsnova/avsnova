import { useState, useRef, useCallback } from "react";
import { UploadCloud, X, Star, Loader2, GripVertical, Link2 } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { useToast } from "../ui/Toast";

interface Props {
  /** Current cover image URL/emoji (product.icon). */
  cover?: string;
  /** Current gallery, comma-separated URLs (product.multiple_images). */
  gallery?: string;
  onCoverChange: (value: string) => void;
  onGalleryChange: (value: string) => void;
  /** If false, only the cover uploader shows (no gallery). */
  multiple?: boolean;
  label?: string;
}

const MAX_MB = 8;

// Reusable admin image manager: drag-and-drop, multi-upload, preview, reorder,
// choose cover, delete, and a URL-paste fallback. Uploads via /api/admin/upload
// (base64 → /uploads). Backward compatible: cover maps to `icon`, gallery to
// `multiple_images` (comma-separated) — the same fields the marketplace already reads.
export default function ImageUploader({ cover, gallery, onCoverChange, onGalleryChange, multiple = true, label = "Product Images" }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const galleryList = (gallery || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isImg = (v?: string) => !!v && /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(v);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) { toast(`"${file.name}" isn't an image.`, "warning"); return null; }
    if (file.size > MAX_MB * 1024 * 1024) { toast(`"${file.name}" is larger than ${MAX_MB}MB.`, "warning"); return null; }
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const resp = await apiFetch("/api/admin/upload", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name }) });
    return resp?.url || null;
  }, [toast]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of arr) {
        const url = await uploadFile(f);
        if (url) urls.push(url);
      }
      if (urls.length) {
        // First upload becomes cover if none set; rest (and extras) go to gallery.
        let coverSet = isImg(cover);
        const newGallery = [...galleryList];
        for (const u of urls) {
          if (!coverSet) { onCoverChange(u); coverSet = true; }
          else if (multiple && !newGallery.includes(u)) newGallery.push(u);
        }
        if (multiple) onGalleryChange(newGallery.join(", "));
        toast(`Uploaded ${urls.length} image${urls.length > 1 ? "s" : ""}.`, "success");
      }
    } catch (e: any) {
      toast("Upload failed: " + (e?.message || "unknown"), "error");
    } finally {
      setUploading(false);
    }
  }, [uploadFile, cover, galleryList, multiple, onCoverChange, onGalleryChange, toast]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeGallery = (url: string) => onGalleryChange(galleryList.filter((u) => u !== url).join(", "));
  const makeCover = (url: string) => {
    // Swap: current cover (if an image) drops into gallery; chosen becomes cover.
    const rest = galleryList.filter((u) => u !== url);
    if (isImg(cover) && cover && !rest.includes(cover)) rest.unshift(cover);
    onCoverChange(url);
    onGalleryChange(rest.join(", "));
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const arr = [...galleryList];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    onGalleryChange(arr.join(", "));
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    if (!isImg(u) && !/^https?:\/\//i.test(u)) { toast("Enter a valid image URL.", "warning"); return; }
    if (!isImg(cover)) onCoverChange(u);
    else if (multiple && !galleryList.includes(u)) onGalleryChange([...galleryList, u].join(", "));
    setUrlInput("");
  };

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold text-purple-200/70 block font-space">{label}</label>

      {/* Cover preview */}
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 rounded-2xl border border-purple-500/20 bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
          {isImg(cover) ? (
            <img src={cover} alt="cover" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="text-3xl">{cover || "📦"}</span>
          )}
        </div>
        <div className="text-[11px] text-purple-200/50 leading-relaxed">
          <div className="font-bold text-purple-200/70 flex items-center gap-1"><Star className="h-3 w-3 text-amber-400 fill-amber-400" /> Cover image</div>
          <div>Shown on cards & product page. Emoji/brand-name still works as a fallback.</div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${dragOver ? "border-cyan-400 bg-cyan-500/5" : "border-purple-500/25 hover:border-purple-500/40 bg-black/20"}`}
      >
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" multiple={multiple} className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-cyan-300 text-xs font-bold"><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <UploadCloud className="h-6 w-6 text-purple-300/60" />
            <div className="text-xs font-bold text-purple-100">Drag &amp; drop or click to upload</div>
            <div className="text-[10px] text-purple-200/40">PNG, JPG, WebP, SVG, GIF · up to {MAX_MB}MB{multiple ? " · multiple allowed" : ""}</div>
          </div>
        )}
      </div>

      {/* URL fallback */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/40" />
          <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
            placeholder="…or paste an image URL" className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
        </div>
        <button type="button" onClick={addUrl} className="px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-200 text-xs font-bold hover:text-white cursor-pointer">Add</button>
      </div>

      {/* Gallery grid */}
      {multiple && galleryList.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-purple-200/40 uppercase tracking-wider">Gallery ({galleryList.length}) — drag to reorder, click ★ to set cover</div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {galleryList.map((url, i) => (
              <div
                key={url + i}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                className="relative group aspect-square rounded-xl border border-purple-500/15 bg-black/40 overflow-hidden"
              >
                {isImg(url) ? <img src={url} alt={`img ${i + 1}`} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-lg">🖼️</div>}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button type="button" onClick={() => makeCover(url)} title="Set as cover" className="h-6 w-6 rounded-lg bg-white/15 flex items-center justify-center text-amber-300 hover:bg-white/25 cursor-pointer"><Star className="h-3 w-3" /></button>
                  <button type="button" onClick={() => removeGallery(url)} title="Remove" className="h-6 w-6 rounded-lg bg-white/15 flex items-center justify-center text-red-300 hover:bg-white/25 cursor-pointer"><X className="h-3 w-3" /></button>
                </div>
                <GripVertical className="absolute top-0.5 left-0.5 h-3 w-3 text-white/40" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
