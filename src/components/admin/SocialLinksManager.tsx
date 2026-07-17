import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../utils/api";
import { Plus, Trash2, Eye, EyeOff, Save, RefreshCw, Link as LinkIcon, GripVertical } from "lucide-react";

/**
 * SocialLinksManager — fully admin-controlled social media links for the footer + emails.
 * Add / edit / remove / hide any link. When no ACTIVE links exist, the public footer hides
 * the entire social section (no empty icons). Backed by /api/admin/social-links.
 */

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "telegram", label: "Telegram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "discord", label: "Discord" },
  { id: "github", label: "GitHub" },
  { id: "custom", label: "Custom URL" },
];

interface Row { id: string; platform: string; label?: string; url: string; active: number; order_index: number }

export default function SocialLinksManager() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ platform: "facebook", label: "", url: "", order_index: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/social-links"); setRows(r.links || []); }
    catch (e: any) { toast("Failed to load social links: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.url.trim()) { toast("Enter a URL.", "warning"); return; }
    setSaving(true);
    try {
      await apiFetch("/api/admin/social-links", { method: "POST", body: JSON.stringify({ ...form, order_index: parseInt(form.order_index) || 0 }) });
      toast("Social link added.", "success");
      setForm({ platform: "facebook", label: "", url: "", order_index: "0" });
      await load();
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const update = async (row: Row) => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/social-links", { method: "POST", body: JSON.stringify(row) });
      toast("Saved.", "success");
      await load();
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const toggle = async (row: Row) => {
    try { await apiFetch(`/api/admin/social-links/${row.id}/toggle`, { method: "POST" }); await load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const remove = async (row: Row) => {
    const ok = await confirm({ title: "Delete this social link?", message: `${row.platform} — ${row.url}`, confirmLabel: "Delete", danger: true, cancelLabel: "Keep" });
    if (!ok) return;
    try { await apiFetch(`/api/admin/social-links/${row.id}`, { method: "DELETE" }); toast("Deleted.", "success"); await load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const inp = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500/40";
  const activeCount = rows.filter((r) => r.active === 1).length;

  return (
    <div className="space-y-4 font-inter text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><LinkIcon className="h-5 w-5 text-cyan-400" /> Social Links</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Add, edit, hide or remove social media links shown in the footer and emails. {activeCount === 0 ? "No active links — the social section is currently hidden on the site." : `${activeCount} active link${activeCount === 1 ? "" : "s"} showing on the site.`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="cursor-pointer"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
      </div>

      {/* Add new */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-bold text-white">Add a link</div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div className="sm:col-span-3">
            <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Platform</label>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={inp}>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-6">
            <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">URL</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Order</label>
            <input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: e.target.value })} className={inp} />
          </div>
          <div className="sm:col-span-1">
            <Button size="sm" onClick={add} disabled={saving} className="w-full cursor-pointer"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        {form.platform === "custom" && (
          <Input label="Custom label (optional)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Our Blog" />
        )}
      </Card>

      {/* Existing */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-purple-200/40 text-xs">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-purple-200/40 text-xs italic">No social links yet. Add one above — until then, the social section stays hidden on the site.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row) => (
              <div key={row.id} className={`flex items-center gap-2 p-3 ${row.active ? "" : "opacity-50"}`}>
                <GripVertical className="h-4 w-4 text-white/20 shrink-0" />
                <select value={row.platform} onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, platform: e.target.value } : r))} className={inp + " max-w-[130px]"}>
                  {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <input value={row.url} onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, url: e.target.value } : r))} className={inp + " flex-1 min-w-0"} />
                <input type="number" value={row.order_index} onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, order_index: parseInt(e.target.value) || 0 } : r))} className={inp + " max-w-[64px]"} title="Display order" />
                <Button size="sm" variant="outline" onClick={() => update(row)} disabled={saving} className="cursor-pointer shrink-0" title="Save changes"><Save className="h-3.5 w-3.5" /></Button>
                <button onClick={() => toggle(row)} title={row.active ? "Visible — click to hide" : "Hidden — click to show"} className={`p-1.5 rounded-lg cursor-pointer border shrink-0 ${row.active ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" : "bg-white/5 text-white/40 border-white/10"}`}>
                  {row.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => remove(row)} title="Delete" className="p-1.5 rounded-lg cursor-pointer border border-red-500/25 bg-red-500/10 text-red-300 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
