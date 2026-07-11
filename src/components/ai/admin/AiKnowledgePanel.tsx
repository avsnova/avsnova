import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Eye, Download, Upload, History, RotateCcw, X, Save, Play } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import {
  getKnowledge, upsertKnowledge, deleteKnowledge, toggleKnowledge, exportKnowledge, importKnowledge,
  resetKnowledge, snapshotKnowledge, getKnowledgeVersions, restoreKnowledgeVersion,
} from "../../../ai/aiContentStore";
import type { KnowledgeCategory, KnowledgeEntry } from "../../../ai/knowledgeBase";
import { askAssistant } from "../../../ai/engine";
import { Toggle, EmptyState } from "./aiAdminUi";

const CATEGORIES: KnowledgeCategory[] = ["sms", "wallet", "payments", "marketplace", "smm", "ai-services", "orders", "account", "referral", "policy", "merchant", "general"];

const blankEntry = (): KnowledgeEntry => ({ id: "", category: "general", title: "", keywords: [], answer: "", enabled: true });

export default function AiKnowledgePanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | KnowledgeCategory>("all");
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [preview, setPreview] = useState<{ q: string; a: string } | null>(null);

  const list = getKnowledge();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return list.filter((k) =>
      (catFilter === "all" || k.category === catFilter) &&
      (!q || k.title.toLowerCase().includes(q) || k.keywords.some((kw) => kw.toLowerCase().includes(q)) || k.answer.toLowerCase().includes(q))
    );
  }, [list, search, catFilter]);

  const openNew = () => { setEditing(blankEntry()); setIsNew(true); };
  const openEdit = (e: KnowledgeEntry) => { setEditing({ ...e, keywords: [...e.keywords] }); setIsNew(false); };

  const save = () => {
    if (!editing) return;
    const id = (editing.id || editing.title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!editing.title.trim()) { toast("Title is required.", "error"); return; }
    if (!editing.answer.trim()) { toast("Answer is required.", "error"); return; }
    if (isNew && list.some((k) => k.id === id)) { toast("An entry with this ID already exists.", "error"); return; }
    snapshotKnowledge(isNew ? `Before adding "${editing.title}"` : `Before editing "${editing.title}"`);
    upsertKnowledge({ ...editing, id });
    toast(isNew ? "Knowledge entry added." : "Knowledge entry updated.", "success");
    setEditing(null); refresh();
  };

  const del = async (e: KnowledgeEntry) => {
    if (!(await confirm({ title: "Delete entry", message: `Delete "${e.title}"? The AI will stop using this knowledge.`, confirmLabel: "Delete", danger: true }))) return;
    snapshotKnowledge(`Before deleting "${e.title}"`);
    deleteKnowledge(e.id);
    toast("Knowledge entry deleted.", "success"); refresh();
  };

  const doExport = () => {
    try {
      const blob = new Blob([exportKnowledge()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `aria_knowledge_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast("Knowledge exported.", "success");
    } catch { toast("Export failed.", "error"); }
  };

  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      snapshotKnowledge("Before import");
      const res = importKnowledge(String(reader.result));
      if (res.ok) { toast(`Imported ${res.count} entries.`, "success"); refresh(); }
      else toast(res.error || "Import failed.", "error");
    };
    reader.readAsText(file); e.target.value = "";
  };

  const doReset = async () => {
    if (!(await confirm({ title: "Reset knowledge", message: "Restore the built-in knowledge base? Your custom entries will be replaced.", confirmLabel: "Reset", danger: true }))) return;
    snapshotKnowledge("Before reset to defaults");
    resetKnowledge(); toast("Knowledge reset to defaults.", "success"); refresh();
  };

  const runPreview = async () => {
    if (!editing) return;
    const q = editing.keywords[0] || editing.title;
    const reply = await askAssistant(q, { section: editing.section || null, loggedIn: true });
    setPreview({ q, a: reply.text });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer"><Plus className="h-3.5 w-3.5" /> Add</button>
        <button onClick={() => setShowVersions(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200 text-xs font-bold hover:text-white cursor-pointer"><History className="h-3.5 w-3.5" /> History</button>
        <button onClick={doExport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200 text-xs font-bold hover:text-white cursor-pointer"><Download className="h-3.5 w-3.5" /> Export</button>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200 text-xs font-bold hover:text-white cursor-pointer">
          <Upload className="h-3.5 w-3.5" /> Import
          <input type="file" accept="application/json" onChange={doImport} className="hidden" />
        </label>
        <button onClick={doReset} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 cursor-pointer"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      </div>

      <div className="text-[11px] text-purple-200/40">{filtered.length} of {list.length} entries · {list.filter((k) => k.enabled !== false).length} active</div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState label="No knowledge entries match your filters." icon={<BookIcon />} />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-xl border border-purple-500/12 bg-black/30 p-3.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">{e.title}</span>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">{e.category}</span>
                  {e.needsHuman && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">human</span>}
                  {e.section && <span className="text-[9px] text-cyan-300/70">→ {e.section}</span>}
                </div>
                <p className="text-[11px] text-purple-200/50 mt-1 line-clamp-2">{e.answer}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {e.keywords.slice(0, 6).map((kw, i) => <span key={i} className="text-[9px] text-purple-200/50 bg-white/5 rounded px-1.5 py-0.5">{kw}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Toggle checked={e.enabled !== false} onChange={(v) => { toggleKnowledge(e.id, v); refresh(); }} />
                <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-white/5 text-purple-300 cursor-pointer" title="Edit"><Edit2 className="h-4 w-4" /></button>
                <button onClick={() => del(e)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 cursor-pointer" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <Modal title={isNew ? "New knowledge entry" : "Edit knowledge entry"} onClose={() => { setEditing(null); setPreview(null); }}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Title">
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
              </Labeled>
              <Labeled label="Category">
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as KnowledgeCategory })}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 cursor-pointer">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Labeled>
            </div>
            <Labeled label="Keywords (comma separated)">
              <input value={editing.keywords.join(", ")} onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
            </Labeled>
            <Labeled label="Answer">
              <textarea value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} rows={5}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 resize-none custom-scrollbar-thin" />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Deep-link section (optional)">
                <input value={editing.section || ""} onChange={(e) => setEditing({ ...editing, section: e.target.value || undefined })} placeholder="e.g. Wallet"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
              </Labeled>
              <div className="flex items-end gap-4 pb-1">
                <Toggle checked={editing.enabled !== false} onChange={(v) => setEditing({ ...editing, enabled: v })} label="Enabled" />
                <Toggle checked={!!editing.needsHuman} onChange={(v) => setEditing({ ...editing, needsHuman: v })} label="Needs human" />
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Live preview</span>
                <button onClick={runPreview} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"><Play className="h-3 w-3" /> Test</button>
              </div>
              {preview ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-purple-200/60">Q: “{preview.q}”</div>
                  <div className="text-xs text-purple-100 whitespace-pre-wrap bg-black/30 rounded-lg p-2.5">{preview.a}</div>
                </div>
              ) : <p className="text-[11px] text-purple-200/40">Tap Test to see how Aria answers using this knowledge.</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setEditing(null); setPreview(null); }} className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-purple-100 hover:bg-white/10 cursor-pointer">Cancel</button>
              <button onClick={save} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold hover:brightness-110 cursor-pointer"><Save className="h-4 w-4" /> Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Versions modal */}
      {showVersions && (
        <Modal title="Version history" onClose={() => setShowVersions(false)}>
          {getKnowledgeVersions().length === 0 ? (
            <EmptyState label="No snapshots yet. Edits auto-snapshot before applying." />
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar-thin">
              {getKnowledgeVersions().map((v) => (
                <div key={v.ts} className="flex items-center justify-between rounded-xl border border-purple-500/12 bg-black/30 p-3">
                  <div>
                    <div className="text-xs font-bold text-white">{v.label}</div>
                    <div className="text-[10px] text-purple-200/40">{new Date(v.ts).toLocaleString()} · {v.snapshot.length} entries</div>
                  </div>
                  <button onClick={() => { restoreKnowledgeVersion(v.ts); toast("Version restored.", "success"); setShowVersions(false); refresh(); }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"><RotateCcw className="h-3 w-3" /> Restore</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0c0620] p-5 sm:p-6 shadow-2xl animate-sheet-up custom-scrollbar-thin">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold font-space text-white">{title}</h3>
          <button onClick={onClose} className="text-purple-200/50 hover:text-white p-1 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BookIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" /></svg>; }
