import { useState, useEffect } from "react";
import { Plus, Trash, Edit, Save, ArrowLeft, BookOpen, Eye, History, ExternalLink, Search, RotateCcw } from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { renderDocHtml } from "./docMarkdown";

// Feature 3 — Knowledge Base & Documentation CMS (admin side).
// Uses a lightweight Markdown-ish rich body (headings, bold, lists, tables, code
// blocks w/ syntax highlighting, callouts, quotes, images, links). Public reading
// is DocsPublicView. Editing here supports categories, version history, draft/
// published, public/admin visibility and related articles.

const DEFAULT_CATEGORIES = ["Getting Started", "Guides", "Policies", "Developer", "Support", "General"];

// Seed titles that replace hardcoded help pages (admin can create these in one click).
const SUGGESTED = [
  "How to Use", "WhatsApp Guide", "API Documentation", "Marketplace Guide", "eSIM Guide",
  "Gift Delivery Guide", "Refund Policy", "Privacy Policy", "Terms & Conditions", "FAQ",
  "Troubleshooting", "Developer Documentation", "Release Notes",
];

export default function DocsManager() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "edit">("list");
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [doc, setDoc] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/admin/docs"); if (res && res.docs) setDocs(res.docs); }
    catch (e: any) { toast("Failed to load docs: " + e.message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const newDoc = (title = "Untitled Document") => {
    setDoc({ id: "", title, category: "General", excerpt: "", body: "", icon: "📄", status: "draft", visibility: "public", related: "", order_index: 0 });
    setVersions([]); setPreview(false); setShowVersions(false); setView("edit");
  };

  const editDoc = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/docs/${id}`);
      if (res && res.doc) { setDoc(res.doc); setVersions(res.versions || []); setPreview(false); setShowVersions(false); setView("edit"); }
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const saveDoc = async () => {
    if (!doc.title.trim()) { toast("Title is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/docs/save", { method: "POST", body: JSON.stringify(doc) });
      toast("Document saved.", "success");
      if (res && res.id) { setDoc({ ...doc, id: res.id, slug: res.slug }); const r2 = await apiFetch(`/api/admin/docs/${res.id}`); if (r2 && r2.versions) setVersions(r2.versions); }
      await load();
    } catch (e: any) { toast("Failed to save: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Delete this document permanently?")) return;
    try { await apiFetch(`/api/admin/docs/${id}`, { method: "DELETE" }); toast("Deleted.", "success"); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const restoreVersion = async (vid: number) => {
    if (!doc.id || !confirm("Restore this version? Current content is snapshotted first.")) return;
    try { await apiFetch(`/api/admin/docs/${doc.id}/restore/${vid}`, { method: "POST" }); toast("Version restored.", "success"); editDoc(doc.id); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const publicUrl = (slug: string) => `${window.location.origin}/#docs/${slug}`;

  // ============ LIST ============
  if (view === "list") {
    const filtered = docs.filter((d) => !search.trim() || (d.title + d.category).toLowerCase().includes(search.toLowerCase()));
    const grouped: Record<string, any[]> = {};
    filtered.forEach((d) => { (grouped[d.category] = grouped[d.category] || []).push(d); });
    return (
      <div className="font-inter text-left space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><BookOpen className="h-5 w-5 text-cyan-400" /> Knowledge Base & Documentation</h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Create and publish documentation. Replaces hardcoded help pages.</p>
          </div>
          <Button onClick={() => newDoc()} className="shrink-0 flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Document</Button>
        </div>

        <Card className="p-4 space-y-3 border-purple-500/15">
          <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Quick-create standard pages</span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.filter((s) => !docs.some((d) => d.title.toLowerCase() === s.toLowerCase())).map((s) => (
              <button key={s} onClick={() => newDoc(s)} className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/15 text-[11px] font-bold text-purple-200/70 hover:text-white hover:border-purple-500/40 cursor-pointer transition-all">+ {s}</button>
            ))}
          </div>
        </Card>

        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-purple-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-lg focus:outline-none" />
        </div>

        {loading ? <div className="text-center py-12 text-purple-200/40 text-sm">Loading…</div> : filtered.length === 0 ? (
          <div className="text-center py-12 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">No documents yet.</div>
        ) : Object.keys(grouped).sort().map((cat) => (
          <div key={cat} className="space-y-2">
            <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider font-space">{cat}</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {grouped[cat].map((d) => (
                <Card key={d.id} className="p-3.5 border-purple-500/10 bg-black/30 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="text-xl shrink-0">{d.icon || "📄"}</span>
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-sm truncate font-space">{d.title}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={d.status === "published" ? "success" : d.status === "archived" ? "warning" : "default"}>{d.status}</Badge>
                        <span className="text-[9px] text-purple-200/40 uppercase font-bold">{d.visibility}</span>
                        <span className="text-[9px] text-purple-200/30 font-mono">{d.views || 0} views</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {d.status === "published" && d.visibility === "public" && <a href={publicUrl(d.slug)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-black/40 border border-purple-500/15 text-purple-200/70 cursor-pointer" title="Open public page"><ExternalLink className="h-3.5 w-3.5" /></a>}
                    <button onClick={() => editDoc(d.id)} className="p-1.5 rounded-lg bg-purple-500/10 text-purple-300 cursor-pointer"><Edit className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteDoc(d.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer"><Trash className="h-3.5 w-3.5" /></button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ============ EDIT ============
  if (view === "edit" && doc) {
    return (
      <div className="font-inter text-left space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => { setView("list"); load(); }} className="flex items-center gap-1.5 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer"><ArrowLeft className="h-4 w-4" /> Back</button>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreview((p) => !p)} className={`px-3 py-2 rounded-xl text-[11px] font-bold cursor-pointer flex items-center gap-1.5 ${preview ? "bg-purple-600 text-white" : "bg-black/40 border border-purple-500/20 text-purple-200/70"}`}><Eye className="h-3.5 w-3.5" /> {preview ? "Editing" : "Preview"}</button>
            {doc.id && <button onClick={() => setShowVersions((v) => !v)} className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200/70 text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Versions ({versions.length})</button>}
            <Button onClick={saveDoc} isLoading={saving} className="flex items-center gap-1.5"><Save className="h-4 w-4" /> Save</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Meta */}
          <Card className="p-4 space-y-3 border-purple-500/15">
            <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Document Settings</span>
            <Input label="Title" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
            <Input label="Icon (emoji)" value={doc.icon} onChange={(e) => setDoc({ ...doc, icon: e.target.value })} />
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Category</label>
              <input list="doc-cats" value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-lg focus:outline-none" />
              <datalist id="doc-cats">{DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Excerpt</label>
              <textarea rows={2} value={doc.excerpt} onChange={(e) => setDoc({ ...doc, excerpt: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-lg focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Status</label>
                <select value={doc.status} onChange={(e) => setDoc({ ...doc, status: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2 py-2.5 rounded-lg focus:outline-none">
                  <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Visibility</label>
                <select value={doc.visibility} onChange={(e) => setDoc({ ...doc, visibility: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2 py-2.5 rounded-lg focus:outline-none">
                  <option value="public">Public</option><option value="admin">Admin only</option>
                </select>
              </div>
            </div>
            <Input label="Related slugs (comma separated)" value={doc.related || ""} onChange={(e) => setDoc({ ...doc, related: e.target.value })} />
            {doc.slug && <p className="text-[9px] text-purple-200/40 font-mono break-all">URL: /#docs/{doc.slug}</p>}

            {showVersions && (
              <div className="pt-2 border-t border-purple-500/10 space-y-1.5">
                <span className="text-[10px] font-bold text-purple-200/60 uppercase font-space">Version History</span>
                {versions.length === 0 ? <p className="text-[10px] text-purple-200/30 italic">No previous versions.</p> : versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 p-2 bg-black/30 rounded-lg text-[10px]">
                    <span className="text-purple-200/60 truncate">{v.created_at ? new Date(v.created_at).toLocaleString() : ""} · {v.changed_by || "admin"}</span>
                    <button onClick={() => restoreVersion(v.id)} className="p-1 rounded text-cyan-300 hover:text-white cursor-pointer" title="Restore"><RotateCcw className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Body / preview */}
          <div className="lg:col-span-2">
            {preview ? (
              <Card className="p-6 border-purple-500/15 bg-[#0c0420]">
                <div className="avs-doc" dangerouslySetInnerHTML={{ __html: renderDocHtml(doc.body || "") }} />
              </Card>
            ) : (
              <Card className="p-4 space-y-2 border-purple-500/15">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Content</span>
                  <span className="text-[9px] text-purple-200/40">Markdown: # Heading · **bold** · *italic* · - list · `code` · ```lang блок``` · &gt; quote · :::info callout::: · | tables |</span>
                </div>
                <textarea
                  value={doc.body}
                  onChange={(e) => setDoc({ ...doc, body: e.target.value })}
                  rows={22}
                  placeholder={"# Getting Started\n\nWrite your documentation here.\n\n## Steps\n\n1. First step\n2. Second step\n\n```js\nconsole.log('hello');\n```\n\n> A helpful quote\n\n:::info\nA callout box.\n:::"}
                  className="w-full bg-black/40 border border-purple-500/20 text-xs text-purple-100 font-mono p-3 rounded-lg focus:outline-none leading-relaxed"
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
