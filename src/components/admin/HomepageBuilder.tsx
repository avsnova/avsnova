import { useState, useEffect } from "react";
import { GripVertical, Eye, EyeOff, Save, LayoutGrid, Loader2 } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * HomepageBuilder — admin-managed, orderable homepage sections.
 * Drag to reorder, toggle visibility, rename, then Save. Backed by
 * /api/admin/homepage. The storefront reads /api/homepage (enabled + ordered).
 */

interface Section { id: string; title: string; type: string; enabled: number; order_index: number; config?: string; }

export default function HomepageBuilder() {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { (async () => { try { setSections(await apiFetch("/api/admin/homepage")); } catch (e: any) { toast("Failed: " + e.message, "error"); } finally { setLoading(false); } })(); }, [toast]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSections(next); setDirty(true);
  };
  const toggle = (id: string) => { setSections((s) => s.map((x) => x.id === id ? { ...x, enabled: x.enabled ? 0 : 1 } : x)); setDirty(true); };
  const rename = (id: string, title: string) => { setSections((s) => s.map((x) => x.id === id ? { ...x, title } : x)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try { await apiFetch("/api/admin/homepage", { method: "POST", body: JSON.stringify({ sections }) }); toast("Homepage layout saved.", "success"); setDirty(false); }
    catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-8 text-center text-purple-300/50 text-xs"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>;

  return (
    <Card className="space-y-4 border border-purple-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white"><LayoutGrid className="h-4.5 w-4.5 text-cyan-400" /><h3 className="text-sm sm:text-base font-bold font-space">Homepage Builder</h3></div>
        <Button onClick={save} isLoading={saving} disabled={!dirty} className="flex items-center gap-1"><Save className="h-4 w-4" /> Save Layout</Button>
      </div>
      <p className="text-xs text-purple-200/50">Drag to reorder, toggle visibility, and rename the marketplace homepage sections. Changes apply to the storefront after saving.</p>
      <div className="space-y-2">
        {sections.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); }}
            className={`flex items-center gap-3 p-3 rounded-xl border bg-black/20 ${s.enabled ? "border-purple-500/20" : "border-purple-500/10 opacity-60"} ${dragIdx === i ? "ring-1 ring-cyan-500/40" : ""}`}
          >
            <GripVertical className="h-4 w-4 text-purple-300/40 cursor-grab shrink-0" />
            <span className="text-[10px] font-mono text-purple-300/40 w-5">{i + 1}</span>
            <input value={s.title} onChange={(e) => rename(s.id, e.target.value)} className="flex-1 bg-transparent text-sm text-white focus:outline-none border-b border-transparent focus:border-purple-500/30" />
            <span className="text-[9px] uppercase tracking-wider text-purple-300/40 font-space hidden sm:inline">{s.type}</span>
            <button onClick={() => toggle(s.id)} className={`p-1.5 rounded-lg cursor-pointer ${s.enabled ? "text-emerald-300 hover:bg-emerald-500/10" : "text-purple-300/40 hover:bg-white/5"}`} title={s.enabled ? "Enabled" : "Disabled"}>
              {s.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
