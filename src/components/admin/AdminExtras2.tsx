import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../utils/api";
import { History, RotateCcw, Plus, Trash2, Edit, ChevronUp, ChevronDown, Save, X, RefreshCw, CheckCircle2, AlertTriangle, Send } from "lucide-react";

/* ============================================================================
 * Item 11 — Settings Rollback / Recovery
 * Lists settings snapshots (auto-created before every settings change) and lets
 * the admin restore any previous configuration in one click.
 * ========================================================================== */
export function SettingsRollbackPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/settings/snapshots"); setRows(r.snapshots || []); }
    catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (id: number) => {
    const ok = await confirm({ title: "Restore this configuration?", message: "Your current settings will be snapshotted first (so this is reversible), then reverted to the selected restore point.", confirmLabel: "Restore", danger: false });
    if (!ok) return;
    setRestoringId(id);
    try { await apiFetch(`/api/admin/settings/snapshots/${id}/restore`, { method: "POST" }); toast("Settings restored from snapshot.", "success"); load(); }
    catch (e: any) { toast("Restore failed: " + e.message, "error"); }
    finally { setRestoringId(null); }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space flex items-center gap-2"><History className="h-4 w-4 text-cyan-400" /> Settings Rollback</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">A restore point is saved automatically before every settings change. Restore any previous configuration in one click.</p>
        </div>
        <Button size="sm" onClick={load} className="shrink-0">Refresh</Button>
      </div>
      {loading ? <div className="py-6 text-center text-purple-200/40 text-xs">Loading restore points…</div>
        : rows.length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No restore points yet. They appear automatically after you change and save settings.</div>
        : (
          <div className="space-y-2">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-purple-500/10">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{s.change_note || "Settings change"}</div>
                  <div className="text-[10px] text-purple-200/40 mt-0.5">by {s.changed_by || "Admin"} · {new Date(s.created_at).toLocaleString()}</div>
                </div>
                <Button size="sm" onClick={() => restore(s.id)} isLoading={restoringId === s.id} className="shrink-0 flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            ))}
          </div>
        )}
    </Card>
  );
}

/* ============================================================================
 * Item 6 — Editable SMM Instructions
 * ========================================================================== */
export function SmmInstructionsPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/smm/instructions"); setRows(r.instructions || []); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.title.trim() && !form.body.trim()) { toast("Enter a title or body.", "warning"); return; }
    try { await apiFetch("/api/admin/smm/instructions", { method: "POST", body: JSON.stringify({ ...form, order_index: rows.length }) }); toast("Instruction added.", "success"); setForm({ title: "", body: "" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const saveEdit = async () => {
    if (!editing) return;
    try { await apiFetch(`/api/admin/smm/instructions/${editing.id}`, { method: "PUT", body: JSON.stringify({ title: editing.title, body: editing.body }) }); toast("Saved.", "success"); setEditing(null); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const toggle = async (s: any) => {
    try { await apiFetch(`/api/admin/smm/instructions/${s.id}`, { method: "PUT", body: JSON.stringify({ enabled: s.enabled ? 0 : 1 }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const del = async (id: number) => {
    const ok = await confirm({ title: "Delete instruction?", message: "This will remove it from the SMM order page.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try { await apiFetch(`/api/admin/smm/instructions/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rows]; const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    try { for (let i = 0; i < next.length; i++) await apiFetch(`/api/admin/smm/instructions/${next[i].id}`, { method: "PUT", body: JSON.stringify({ order_index: i }) }); }
    catch { load(); }
  };

  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none";
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-white font-space">SMM Order Instructions</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">These blocks appear automatically on the SMM order page. Create, edit, reorder, enable/disable — no code needed.</p>
      </div>
      <div className="space-y-2 p-3 rounded-xl border border-purple-500/10 bg-black/20">
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. How to place an order" />
        <div className="space-y-1">
          <label className="text-xs font-bold text-purple-200/70 font-space">Body</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} placeholder="Instruction text shown to customers…" className={inputCls} />
        </div>
        <Button onClick={add} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add Instruction</Button>
      </div>
      {rows.length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No instructions yet.</div> : (
        <div className="space-y-2">
          {rows.map((s, idx) => (
            <div key={s.id} className="p-3 rounded-xl bg-black/30 border border-purple-500/10">
              {editing && editing.id === s.id ? (
                <div className="space-y-2">
                  <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={3} className={inputCls} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)} className="flex items-center gap-1"><X className="h-3.5 w-3.5" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white">{s.title || "(untitled)"}</div>
                    <div className="text-[11px] text-purple-200/60 whitespace-pre-wrap mt-0.5">{s.body}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(idx, -1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(idx, 1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${s.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-black/40 text-purple-300/50 border border-purple-500/20"}`}>{s.enabled ? "ON" : "OFF"}</button>
                    <button onClick={() => setEditing({ id: s.id, title: s.title, body: s.body })} className="p-1.5 rounded-lg bg-black/40 text-cyan-300 cursor-pointer"><Edit className="h-3.5 w-3.5" /></button>
                    <button onClick={() => del(s.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * SMS Panel Instructions — admin-managed blocks shown on the customer SMS page.
 * Mirrors SmmInstructionsPanel (add/edit/enable/reorder/delete). Same proven pattern.
 * ========================================================================== */
export function SmsInstructionsPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/sms/instructions"); setRows(r.instructions || []); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.title.trim() && !form.body.trim()) { toast("Enter a title or body.", "warning"); return; }
    try { await apiFetch("/api/admin/sms/instructions", { method: "POST", body: JSON.stringify({ ...form, order_index: rows.length }) }); toast("Instruction added.", "success"); setForm({ title: "", body: "" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const saveEdit = async () => {
    if (!editing) return;
    try { await apiFetch(`/api/admin/sms/instructions/${editing.id}`, { method: "PUT", body: JSON.stringify({ title: editing.title, body: editing.body }) }); toast("Saved.", "success"); setEditing(null); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const toggle = async (s: any) => {
    try { await apiFetch(`/api/admin/sms/instructions/${s.id}`, { method: "PUT", body: JSON.stringify({ enabled: s.enabled ? 0 : 1 }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const del = async (id: number) => {
    const ok = await confirm({ title: "Delete instruction?", message: "This will remove it from the SMS panel.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try { await apiFetch(`/api/admin/sms/instructions/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rows]; const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    try { for (let i = 0; i < next.length; i++) await apiFetch(`/api/admin/sms/instructions/${next[i].id}`, { method: "PUT", body: JSON.stringify({ order_index: i }) }); }
    catch { load(); }
  };

  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none";
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-white font-space">SMS Panel Instructions</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">These blocks appear automatically on the customer SMS (Buy Number) page — purchase guidelines, refund policy, waiting info, notices. Create, edit, reorder, enable/disable — no code needed.</p>
      </div>
      <div className="space-y-2 p-3 rounded-xl border border-purple-500/10 bg-black/20">
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Refund Policy" />
        <div className="space-y-1">
          <label className="text-xs font-bold text-purple-200/70 font-space">Body</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} placeholder="Instruction text shown to customers…" className={inputCls} />
        </div>
        <Button onClick={add} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add Instruction</Button>
      </div>
      {rows.length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No instructions yet.</div> : (
        <div className="space-y-2">
          {rows.map((s, idx) => (
            <div key={s.id} className="p-3 rounded-xl bg-black/30 border border-purple-500/10">
              {editing && editing.id === s.id ? (
                <div className="space-y-2">
                  <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={3} className={inputCls} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)} className="flex items-center gap-1"><X className="h-3.5 w-3.5" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white">{s.title || "(untitled)"}</div>
                    <div className="text-[11px] text-purple-200/60 whitespace-pre-wrap mt-0.5">{s.body}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(idx, -1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(idx, 1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${s.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-black/40 text-purple-300/50 border border-purple-500/20"}`}>{s.enabled ? "ON" : "OFF"}</button>
                    <button onClick={() => setEditing({ id: s.id, title: s.title, body: s.body })} className="p-1.5 rounded-lg bg-black/40 text-cyan-300 cursor-pointer"><Edit className="h-3.5 w-3.5" /></button>
                    <button onClick={() => del(s.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * Item 2 — Dynamic Checkout Fields (per module)
 * ========================================================================== */
const CHECKOUT_MODULES = [
  { id: "marketplace", label: "Marketplace" },
  { id: "physical-sim", label: "Physical SIM" },
  { id: "esim", label: "eSIM" },
  { id: "gift", label: "Gift Delivery" },
];
const FIELD_TYPES = ["text", "number", "email", "phone", "textarea", "select", "checkbox", "radio", "date", "file"];

export function CheckoutFieldsPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [module, setModule] = useState("marketplace");
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ label: "", type: "text", placeholder: "", help_text: "", required: false, options: "" });

  const load = useCallback(async () => {
    try { const r = await apiFetch(`/api/admin/checkout-fields?module=${module}`); setRows(r.fields || []); } catch { /* silent */ }
  }, [module]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.label.trim()) { toast("Label is required.", "warning"); return; }
    const needsOptions = form.type === "select" || form.type === "radio";
    const options = needsOptions ? form.options.split(",").map((x) => x.trim()).filter(Boolean) : [];
    if (needsOptions && options.length === 0) { toast("Add at least one option (comma separated).", "warning"); return; }
    try {
      await apiFetch("/api/admin/checkout-fields", { method: "POST", body: JSON.stringify({ module, label: form.label, type: form.type, placeholder: form.placeholder, help_text: form.help_text, required: form.required, options, order_index: rows.length }) });
      toast("Field added.", "success");
      setForm({ label: "", type: "text", placeholder: "", help_text: "", required: false, options: "" });
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const toggle = async (f: any) => {
    try { await apiFetch(`/api/admin/checkout-fields/${f.id}`, { method: "PUT", body: JSON.stringify({ enabled: f.enabled ? 0 : 1 }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const toggleRequired = async (f: any) => {
    try { await apiFetch(`/api/admin/checkout-fields/${f.id}`, { method: "PUT", body: JSON.stringify({ required: f.required ? 0 : 1 }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const del = async (id: number) => {
    const ok = await confirm({ title: "Delete checkout field?", message: "Customers will no longer see this field at checkout.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try { await apiFetch(`/api/admin/checkout-fields/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rows]; const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    try { await apiFetch("/api/admin/checkout-fields/reorder", { method: "POST", body: JSON.stringify({ order: next.map((f) => f.id) }) }); }
    catch { load(); }
  };

  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none";
  const needsOptions = form.type === "select" || form.type === "radio";
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-white font-space">Dynamic Checkout Fields</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">Add, edit, reorder and require checkout inputs per service — no code changes ever needed.</p>
      </div>

      {/* Module tabs */}
      <div className="flex flex-wrap gap-2">
        {CHECKOUT_MODULES.map((m) => (
          <button key={m.id} onClick={() => setModule(m.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${module === m.id ? "bg-cyan-600/30 border border-cyan-500/40 text-white" : "bg-black/30 border border-purple-500/10 text-purple-200/50 hover:text-white"}`}>{m.label}</button>
        ))}
      </div>

      {/* Add field */}
      <div className="space-y-2 p-3 rounded-xl border border-purple-500/10 bg-black/20">
        <div className="grid grid-cols-2 gap-2">
          <Input label="Field label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Delivery Address" />
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200/70 font-space">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
              {FIELD_TYPES.map((t) => <option key={t} value={t} className="bg-neutral-900">{t}</option>)}
            </select>
          </div>
          <Input label="Placeholder" value={form.placeholder} onChange={(e) => setForm({ ...form, placeholder: e.target.value })} placeholder="Shown inside the input" />
          <Input label="Help text (optional)" value={form.help_text} onChange={(e) => setForm({ ...form, help_text: e.target.value })} placeholder="Shown under the input" />
        </div>
        {needsOptions && <Input label="Options (comma separated)" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="e.g. Small, Medium, Large" />}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-purple-200/70 cursor-pointer">
            <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} className="accent-cyan-500 h-4 w-4" /> Required
          </label>
          <Button onClick={add} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add Field</Button>
        </div>
      </div>

      {/* Field list */}
      {rows.length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No custom fields for this service yet.</div> : (
        <div className="space-y-2">
          {rows.map((f, idx) => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/30 border border-purple-500/10">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{f.label} {f.required ? <span className="text-red-400">*</span> : null}</div>
                <div className="text-[10px] text-purple-200/40 font-mono">{f.field_key} · {f.type}{Array.isArray(f.options) && f.options.length ? ` · [${f.options.join(", ")}]` : ""}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(idx, -1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => move(idx, 1)} className="p-1.5 rounded-lg bg-black/40 text-purple-200/60 hover:text-white cursor-pointer"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => toggleRequired(f)} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${f.required ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-black/40 text-purple-300/50 border border-purple-500/20"}`}>REQ</button>
                <button onClick={() => toggle(f)} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${f.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-black/40 text-purple-300/50 border border-purple-500/20"}`}>{f.enabled ? "ON" : "OFF"}</button>
                <button onClick={() => del(f.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * Item 3 — SMM Sync Health (provider synchronization audit + manual re-sync)
 * ========================================================================== */
export function SmmSyncHealthPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<any>({ entries: [], lastServicesSync: null, failuresLast24h: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/gateway/sync-log"); setData(r); }
    catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try { const r = await apiFetch("/api/admin/gateway/sync-smm-now", { method: "POST" }); toast(`Synced ${r.count} SMM services.`, "success"); load(); }
    catch (e: any) { toast("Sync failed: " + e.message, "error"); }
    finally { setSyncing(false); }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space">SMM Sync Health</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Provider synchronization audit — services, pricing, balance and order-status. Auto-syncs every 6 hours with retry; admins are alerted after repeated failures.</p>
        </div>
        <Button size="sm" onClick={syncNow} isLoading={syncing} className="shrink-0 flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Sync now</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
          <div className="text-[10px] text-purple-200/50 uppercase tracking-wide">Last services sync</div>
          <div className="text-sm font-bold text-white mt-0.5">{data.lastServicesSync ? new Date(data.lastServicesSync).toLocaleString() : "—"}</div>
        </div>
        <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
          <div className="text-[10px] text-purple-200/50 uppercase tracking-wide">Failures (24h)</div>
          <div className={`text-sm font-bold mt-0.5 ${data.failuresLast24h > 0 ? "text-amber-300" : "text-emerald-300"}`}>{data.failuresLast24h ?? 0}</div>
        </div>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar-thin">
        {loading ? <div className="py-4 text-center text-purple-200/40 text-xs">Loading…</div>
          : (data.entries || []).length === 0 ? <div className="py-4 text-center text-purple-200/30 italic text-xs">No sync activity logged yet.</div>
          : (data.entries || []).map((e: any, i: number) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-purple-500/5 bg-black/20 text-[11px]">
              {e.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
              <span className="text-purple-200/60 font-mono uppercase w-24 shrink-0">{e.kind}</span>
              <span className="text-white flex-1 truncate">{e.detail}</span>
              <span className="text-purple-200/30 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
      </div>
    </Card>
  );
}

/* ============================================================================
 * Referral / Affiliate Program — admin config + overview
 * ========================================================================== */
export function ReferralAdminPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<any>({ config: {}, stats: {}, recent: [] });
  const [form, setForm] = useState<any>({ enabled: true, referrerBonus: "", signupBonus: "", qualifyAmount: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/referrals");
      setData(r);
      setForm({
        enabled: r.config.enabled,
        referrerBonus: String(r.config.referrerBonus ?? ""),
        signupBonus: String(r.config.signupBonus ?? ""),
        qualifyAmount: String(r.config.qualifyAmount ?? ""),
      });
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/referrals/config", { method: "POST", body: JSON.stringify({
        enabled: form.enabled,
        referrerBonus: parseFloat(form.referrerBonus) || 0,
        signupBonus: parseFloat(form.signupBonus) || 0,
        qualifyAmount: parseFloat(form.qualifyAmount) || 0,
      }) });
      toast("Referral settings saved.", "success");
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const money = (v: any) => `₦${Math.round(Number(v) || 0).toLocaleString()}`;
  const s = data.stats || {};
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-white font-space">Referral Program</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Reward customers for inviting friends. All amounts in ₦ — no code changes needed.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total referrals" value={String(s.total || 0)} tone="text-white" />
          <Kpi label="Pending" value={String(s.pending || 0)} tone="text-amber-300" />
          <Kpi label="Rewarded" value={String(s.rewarded || 0)} tone="text-emerald-300" />
          <Kpi label="Total paid" value={money(s.totalPaid)} tone="text-cyan-300" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-purple-200/70 cursor-pointer">
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-cyan-500 h-4 w-4" /> Program enabled
          </label>
          <Input label="Referrer bonus (₦)" type="number" value={form.referrerBonus} onChange={(e) => setForm({ ...form, referrerBonus: e.target.value })} placeholder="500" />
          <Input label="Signup bonus to new user (₦)" type="number" value={form.signupBonus} onChange={(e) => setForm({ ...form, signupBonus: e.target.value })} placeholder="0" />
          <Input label="Qualifying first-spend (₦)" type="number" value={form.qualifyAmount} onChange={(e) => setForm({ ...form, qualifyAmount: e.target.value })} placeholder="1000" />
        </div>
        <Button onClick={save} isLoading={saving} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save settings</Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white font-space">Recent referrals</h3>
          <Button size="sm" onClick={load} className="shrink-0">Refresh</Button>
        </div>
        {loading ? <div className="py-6 text-center text-purple-200/40 text-xs">Loading…</div>
          : (data.recent || []).length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No referrals yet.</div>
          : (
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar-thin">
              {(data.recent || []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-purple-500/10 bg-black/30 text-[12px]">
                  <div className="min-w-0">
                    <div className="text-white truncate"><span className="text-purple-200/50">Inviter:</span> {r.referrer_name} <span className="text-purple-200/30">({r.referrer_email})</span></div>
                    <div className="text-white truncate"><span className="text-purple-200/50">Joined:</span> {r.referred_name} <span className="text-purple-200/30">({r.referred_email})</span></div>
                  </div>
                  <div className="text-right shrink-0">
                    {r.status === "rewarded"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">+{money(r.referrer_bonus)}</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">pending</span>}
                    <div className="text-[9px] text-purple-200/30 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
      <div className="text-[10px] text-purple-200/50 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-space mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

/* ============================================================================
 * Telegram Bot — admin management (status, webhook, staff RBAC, action log)
 * ========================================================================== */
export function TelegramAdminPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<any>({ configured: false, staff: [] });
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [form, setForm] = useState<{ chatId: string; displayName: string; role: string; permissions: string[] }>({ chatId: "", displayName: "", role: "viewer", permissions: [] });
  const [busy, setBusy] = useState("");
  // Dashboard-managed config editor.
  const [cfg, setCfg] = useState<any>({ enabled: true, botToken: "", groupChatId: "", digestHour: 20, minSeverity: "info", disabledCategories: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/telegram/status"); setData(r);
      if (r.config) setCfg({ enabled: r.config.enabled, botToken: "", groupChatId: r.config.groupChatId || "", digestHour: r.config.digestHour ?? 20, minSeverity: r.config.minSeverity || "info", disabledCategories: r.config.disabledCategories || [] });
      const l = await apiFetch("/api/admin/telegram/log"); setLog(l.entries || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveConfig = () => {
    const body: any = { enabled: cfg.enabled, groupChatId: cfg.groupChatId, digestHour: cfg.digestHour, minSeverity: cfg.minSeverity, disabledCategories: cfg.disabledCategories };
    if (cfg.botToken && cfg.botToken.trim()) body.botToken = cfg.botToken.trim();
    act(() => apiFetch("/api/admin/telegram/config", { method: "POST", body: JSON.stringify(body) }), "Telegram config saved.").then(() => setCfg((c: any) => ({ ...c, botToken: "" })));
  };
  const toggleCategory = (key: string) => setCfg((c: any) => ({ ...c, disabledCategories: c.disabledCategories.includes(key) ? c.disabledCategories.filter((k: string) => k !== key) : [...c.disabledCategories, key] }));
  const togglePerm = (key: string) => setForm((f) => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter((k) => k !== key) : [...f.permissions, key] }));

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast(ok, "success"); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const setWebhook = () => {
    if (!/^https:\/\/.+/.test(webhookUrl.trim())) { toast("Enter a valid https URL ending in /api/telegram/webhook", "warning"); return; }
    setBusy("wh"); act(() => apiFetch("/api/admin/telegram/set-webhook", { method: "POST", body: JSON.stringify({ url: webhookUrl.trim() }) }), "Webhook registered.").finally(() => setBusy(""));
  };
  const addStaff = () => {
    if (!form.chatId.trim()) { toast("Chat ID is required.", "warning"); return; }
    act(() => apiFetch("/api/admin/telegram/staff", { method: "POST", body: JSON.stringify(form) }), "Staff saved.").then(() => setForm({ chatId: "", displayName: "", role: "viewer", permissions: [] }));
  };
  const removeStaff = async (id: number) => {
    if (!(await confirm({ title: "Remove staff?", message: "They will no longer receive alerts or be able to act.", confirmLabel: "Remove", danger: true }))) return;
    act(() => apiFetch(`/api/admin/telegram/staff/${id}`, { method: "DELETE" }), "Removed.");
  };
  const test = () => act(() => apiFetch("/api/admin/telegram/test", { method: "POST" }), "Test alert sent to all active staff.");
  const digest = () => act(() => apiFetch("/api/admin/telegram/digest", { method: "POST" }), "Daily summary sent to all active staff.");
  // Self-service: generate a one-time code to link MY Telegram to MY account.
  const [linkInfo, setLinkInfo] = useState<any>(null);
  const generateLink = async () => {
    try { const r = await apiFetch("/api/telegram/link/generate", { method: "POST" }); setLinkInfo(r); toast("Link code generated.", "success"); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none";
  const bot = data.me && !data.me.error ? data.me : null;
  const wh = data.webhook && !data.webhook.error ? data.webhook : null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white font-space flex items-center gap-2"><Send className="h-4 w-4 text-cyan-400" /> Telegram Bot</h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Real-time alerts + interactive staff actions. Configure the bot token below (or via the <code>TELEGRAM_BOT_TOKEN</code> env var as a fallback).</p>
          </div>
          <Button size="sm" onClick={load} className="shrink-0"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>

        {/* Status */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Token" value={data.configured ? "Configured" : "Missing"} tone={data.configured ? "text-emerald-300" : "text-red-300"} />
          <Kpi label="Bot" value={bot ? `@${bot.username}` : "—"} tone="text-white" />
          <Kpi label="Webhook" value={wh && wh.url ? "Active" : "Not set"} tone={wh && wh.url ? "text-emerald-300" : "text-amber-300"} />
          <Kpi label="Secret header" value={data.hasWebhookSecret ? "On" : "Off"} tone={data.hasWebhookSecret ? "text-emerald-300" : "text-purple-300/60"} />
        </div>
        {!data.configured && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-200/90">
            Set <code>TELEGRAM_BOT_TOKEN</code> (and optionally <code>TELEGRAM_WEBHOOK_SECRET</code>) in the server environment, then restart. Create a bot with @BotFather to get a token.
          </div>
        )}
        {wh && wh.last_error_message && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-2.5 text-[11px] text-red-300">Webhook last error: {wh.last_error_message}</div>
        )}

        {/* Webhook setup */}
        <div className="space-y-2 p-3 rounded-xl border border-purple-500/10 bg-black/20">
          <label className="text-xs font-bold text-purple-200/70 font-space">Webhook URL</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://yourdomain.com/api/telegram/webhook" className={inputCls} />
            <Button size="sm" onClick={setWebhook} isLoading={busy === "wh"} disabled={!data.configured} className="shrink-0">Register</Button>
            <Button size="sm" onClick={test} disabled={!data.configured} className="shrink-0 bg-cyan-600/30 border border-cyan-500/30">Send test</Button>
            <Button size="sm" onClick={digest} disabled={!data.configured} className="shrink-0 bg-purple-600/30 border border-purple-500/30">Send digest</Button>
          </div>
          <p className="text-[10px] text-purple-200/40">Must be a public HTTPS URL. Staff send <code>/start</code> to the bot to get their Chat ID.</p>
        </div>
      </Card>

      {/* Self-service linking */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white font-space">Link my Telegram</h3>
            <p className="text-[11px] text-purple-200/50 mt-0.5">Generate a one-time code, then send <code>/link &lt;code&gt;</code> to the bot to connect your own account (no manual Chat ID needed).</p>
          </div>
          <Button size="sm" onClick={generateLink} className="shrink-0">Generate code</Button>
        </div>
        {linkInfo && (
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 text-center">
            <div className="text-[10px] text-purple-200/50 uppercase tracking-wide">Your one-time code (valid {linkInfo.expiresInMinutes}m)</div>
            <div className="text-2xl font-bold font-mono text-cyan-300 tracking-widest my-1 select-all">{linkInfo.code}</div>
            <div className="text-[11px] text-purple-200/70">Open {linkInfo.botHandle} and send: <code>/link {linkInfo.code}</code></div>
          </div>
        )}
      </Card>

      {/* Configuration (dashboard-managed; DB overrides env) */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-white font-space">Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-xs text-purple-200/70 cursor-pointer">
            <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="accent-cyan-500 h-4 w-4" /> Telegram enabled
          </label>
          <div className="text-[10px] text-purple-200/40 flex items-center">Token source: <span className="ml-1 font-mono text-purple-200/70">{data.config?.tokenSource || "none"}{data.config?.tokenMasked ? ` (${data.config.tokenMasked})` : ""}</span></div>
          <Input label="Bot token (leave blank to keep current)" value={cfg.botToken} onChange={(e) => setCfg({ ...cfg, botToken: e.target.value })} placeholder="paste to update…" />
          <Input label="Group chat ID (optional)" value={cfg.groupChatId} onChange={(e) => setCfg({ ...cfg, groupChatId: e.target.value })} placeholder="-1001234567890" />
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200/70 font-space">Daily digest hour (0–23)</label>
            <input type="number" min={0} max={23} value={cfg.digestHour} onChange={(e) => setCfg({ ...cfg, digestHour: parseInt(e.target.value) || 0 })} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200/70 font-space">Minimum alert severity</label>
            <select value={cfg.minSeverity} onChange={(e) => setCfg({ ...cfg, minSeverity: e.target.value })} className={inputCls}>
              <option value="info">Info (all alerts)</option>
              <option value="warning">Warning &amp; above</option>
              <option value="critical">Critical only</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-purple-200/70 font-space block mb-1.5">Muted notification categories</label>
          <div className="flex flex-wrap gap-1.5">
            {(data.alertCategories || []).map((k: string) => {
              const muted = cfg.disabledCategories.includes(k);
              return <button key={k} type="button" onClick={() => toggleCategory(k)} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${muted ? "bg-red-500/15 text-red-300 border border-red-500/30 line-through" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"}`}>{k}</button>;
            })}
          </div>
          <p className="text-[10px] text-purple-200/40 mt-1">Green = on, red = muted. Click to toggle.</p>
        </div>
        <Button size="sm" onClick={saveConfig} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save configuration</Button>
      </Card>

      {/* Staff RBAC */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-white font-space">Authorized Staff (role &amp; granular permissions)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl border border-purple-500/10 bg-black/20">
          <Input label="Chat ID" value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="123456789" />
          <Input label="Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Jane (Support)" />
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-200/70 font-space">Role (baseline)</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
              <option value="viewer">Viewer (alerts + view)</option>
              <option value="support">Support (+ tickets)</option>
              <option value="manager">Manager (+ approve orders)</option>
              <option value="admin">Admin (all)</option>
            </select>
          </div>
          <div className="flex items-end"><Button onClick={addStaff} className="w-full flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add / Update</Button></div>
        </div>
        <div className="p-3 rounded-xl border border-purple-500/10 bg-black/20">
          <label className="text-xs font-bold text-purple-200/70 font-space block mb-1.5">Granular permissions (optional — overrides role tier for this staffer)</label>
          <div className="flex flex-wrap gap-1.5">
            {(data.capabilities || []).map((k: string) => {
              const on = form.permissions.includes(k);
              return <button key={k} type="button" onClick={() => togglePerm(k)} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${on ? "bg-cyan-600/30 text-white border border-cyan-500/40" : "bg-black/30 text-purple-200/50 border border-purple-500/15"}`}>{k}</button>;
            })}
          </div>
          <p className="text-[10px] text-purple-200/40 mt-1">Leave none selected to use the role tier. Selecting specific capabilities restricts this staffer to exactly those.</p>
        </div>
        {(data.staff || []).length === 0 ? <div className="py-4 text-center text-purple-200/30 italic text-xs">No staff authorized yet.</div> : (
          <div className="space-y-2">
            {(data.staff || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-purple-500/10 bg-black/30 text-[12px]">
                <div className="min-w-0">
                  <div className="text-white font-semibold truncate">{s.display_name || s.username || "Staff"} <span className="text-[10px] font-mono text-purple-200/40">#{s.chat_id}</span></div>
                  <div className="text-[10px] text-purple-200/40">{s.permissions && s.permissions.trim() ? `Custom: ${s.permissions}` : (s.last_action_at ? `Last action ${new Date(s.last_action_at).toLocaleString()}` : "Role-based · no actions yet")}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">{s.role}</span>
                  <button onClick={() => removeStaff(s.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Action log */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-white font-space">Telegram Activity Log</h3>
        {log.length === 0 ? <div className="py-4 text-center text-purple-200/30 italic text-xs">No activity yet.</div> : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar-thin">
            {log.map((e, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-purple-500/5 bg-black/20 text-[11px]">
                {e.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <span className="text-purple-200/50 w-10 shrink-0 uppercase">{e.direction}</span>
                <span className="text-cyan-200 font-mono w-32 shrink-0 truncate">{e.action}</span>
                <span className="text-white flex-1 truncate">{e.staff_name ? `${e.staff_name}: ` : ""}{e.detail}</span>
                <span className="text-purple-200/30 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
