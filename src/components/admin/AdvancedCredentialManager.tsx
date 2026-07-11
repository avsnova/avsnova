import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash, Copy, Eye, EyeOff, GripVertical, Save, Settings2, KeyRound, CheckCircle2 } from "lucide-react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { AuthCodeModal } from "./AuthCodePanel";

// Auto-mask a revealed secret after this many ms (mirrors server autoMaskSeconds).
const AUTO_MASK_MS = 45000;

// Feature 1 — Advanced Credential Manager.
// Opened for a specific product. Two panes: (1) dynamic FIELD SCHEMA editor
// (add/edit/delete/reorder/duplicate, unlimited custom fields, many field types),
// (2) the actual CREDENTIALS list with per-field show/hide + copy + copy-all.

const FIELD_TYPES = ["text", "password", "email", "number", "phone", "url", "date", "dropdown", "checkbox", "textarea", "file"];

interface CredField {
  id?: number;
  field_key?: string;
  label: string;
  type: string;
  options?: string;
  required?: number | boolean;
  is_secret?: number | boolean;
  placeholder?: string;
  help_text?: string;
  is_custom?: number | boolean;
}

interface CredRow {
  id: number;
  status: string;
  values: Record<string, any>;
  updated_by?: string;
  updated_at?: string;
}

interface Props {
  product: { id: string; name: string };
  onClose: () => void;
}

export default function AdvancedCredentialManager({ product, onClose }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"credentials" | "schema">("credentials");
  const [fields, setFields] = useState<CredField[]>([]);
  const [credentials, setCredentials] = useState<CredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSchema, setSavingSchema] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<CredRow | null>(null);
  const [creating, setCreating] = useState<Record<string, any> | null>(null);
  // Admin Authorization Code: on a 401 authCodeRequired, we open this modal and retry on unlock.
  const [authModal, setAuthModal] = useState<{ action?: string; retry: () => void } | null>(null);
  // Per-secret auto-mask timers so a revealed value re-hides itself after a short window.
  const maskTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [sc, cr] = await Promise.all([
        apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}/credential-schema`),
        apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}/credentials`),
      ]);
      if (sc && sc.fields) setFields(sc.fields);
      if (cr && cr.credentials) setCredentials(cr.credentials);
    } catch (e: any) {
      toast("Failed to load credentials: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      // Clear any pending auto-mask timers so nothing fires after unmount.
      Object.values(maskTimers.current).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Toggle a secret's visibility. Revealing schedules an auto re-mask after AUTO_MASK_MS.
  const toggleSecret = (rk: string) => {
    setReveal((r) => {
      const next = !r[rk];
      if (maskTimers.current[rk]) { clearTimeout(maskTimers.current[rk]); delete maskTimers.current[rk]; }
      if (next) {
        maskTimers.current[rk] = setTimeout(() => {
          setReveal((rr) => ({ ...rr, [rk]: false }));
          delete maskTimers.current[rk];
        }, AUTO_MASK_MS);
      }
      return { ...r, [rk]: next };
    });
  };

  // Close handler that first re-masks everything (secrets never linger after the dialog closes).
  const handleClose = () => {
    Object.values(maskTimers.current).forEach(clearTimeout);
    maskTimers.current = {};
    setReveal({});
    onClose();
  };

  // ——— Schema editor helpers ———
  const addField = () => setFields((f) => [...f, { label: "New Field", type: "text", is_custom: 1, required: 0, is_secret: 0 }]);
  const updateField = (i: number, patch: Partial<CredField>) => setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeField = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));
  const duplicateField = (i: number) => setFields((f) => { const copy = { ...f[i], id: undefined, field_key: undefined, label: f[i].label + " (Copy)", is_custom: 1 }; const next = [...f]; next.splice(i + 1, 0, copy); return next; });
  const moveField = (i: number, dir: -1 | 1) => setFields((f) => { const j = i + dir; if (j < 0 || j >= f.length) return f; const next = [...f]; [next[i], next[j]] = [next[j], next[i]]; return next; });

  const saveSchema = async () => {
    setSavingSchema(true);
    try {
      const res = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}/credential-schema`, {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      if (res && res.fields) setFields(res.fields);
      toast("Credential field schema saved.", "success");
    } catch (e: any) {
      toast("Failed to save schema: " + e.message, "error");
    } finally {
      setSavingSchema(false);
    }
  };

  // ——— Credential CRUD ———
  const blankValues = () => { const v: Record<string, any> = {}; fields.forEach((f) => { v[f.field_key || f.label] = f.type === "checkbox" ? false : ""; }); return v; };

  const saveNew = async () => {
    if (!creating) return;
    try {
      await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}/credentials`, { method: "POST", body: JSON.stringify({ values: creating }) });
      toast("Credential added.", "success");
      setCreating(null);
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}/credentials/${editing.id}`, { method: "PUT", body: JSON.stringify({ values: editing.values }) });
      toast("Credential updated.", "success");
      setEditing(null);
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const deleteCred = async (id: number) => {
    if (!confirm("Delete this credential permanently?")) return;
    try {
      await apiFetch(`/api/admin/inventory/credentials/${id}`, { method: "DELETE" });
      toast("Credential deleted.", "success");
      load();
    } catch (e: any) {
      // High-risk action guarded by the Admin Authorization Code → prompt, then retry.
      if (e.authCodeRequired) { setAuthModal({ action: e.action, retry: () => deleteCred(id) }); return; }
      toast("Failed: " + e.message, "error");
    }
  };

  const copy = async (text: string, key: string) => {
    const ok = await copyToClipboard(String(text ?? ""));
    if (ok) { setReveal((r) => ({ ...r, [`copied_${key}`]: true })); setTimeout(() => setReveal((r) => ({ ...r, [`copied_${key}`]: false })), 1500); }
  };

  const copyAll = async (row: CredRow) => {
    const text = fields.map((f) => `${f.label}: ${row.values[f.field_key || f.label] ?? ""}`).join("\n");
    const ok = await copyToClipboard(text);
    if (ok) toast("All credentials copied.", "success", { silent: true });
  };

  const fieldInput = (f: CredField, value: any, onChange: (v: any) => void) => {
    const key = f.field_key || f.label;
    const common = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-purple-500";
    if (f.type === "textarea") return <textarea rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} className={common} />;
    if (f.type === "checkbox") return <label className="flex items-center gap-2 text-xs text-purple-200/80 cursor-pointer"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-purple-500 h-4 w-4" /> {f.placeholder || "Yes"}</label>;
    if (f.type === "dropdown") return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={common}>
        <option value="">Select…</option>
        {String(f.options || "").split(",").map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    if (f.type === "file") return <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="File URL / path" className={common} />;
    const inputType = f.type === "password" ? (reveal[`in_${key}`] ? "text" : "password") : (["email", "number", "date", "url"].includes(f.type) ? f.type : (f.type === "phone" ? "tel" : "text"));
    return (
      <div className="relative">
        <input type={inputType} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} className={common + (f.type === "password" ? " pr-9" : "")} />
        {f.type === "password" && (
          <button type="button" onClick={() => setReveal((r) => ({ ...r, [`in_${key}`]: !r[`in_${key}`] }))} className="absolute right-2 top-2 text-purple-300/60 hover:text-white cursor-pointer">
            {reveal[`in_${key}`] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-purple-500/30 bg-[#0a041c] shadow-2xl flex flex-col text-left font-inter">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-500/15 p-5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-300"><KeyRound className="h-5 w-5" /></span>
            <div>
              <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider block">Advanced Credential Manager</span>
              <h3 className="text-lg font-bold font-space text-white">{product.name}</h3>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white hover:bg-white/5 cursor-pointer"><X className="h-6 w-6" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4 shrink-0">
          <button onClick={() => setTab("credentials")} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === "credentials" ? "bg-purple-600 text-white" : "bg-black/30 text-purple-200/60 hover:text-white"}`}>Credentials ({credentials.length})</button>
          <button onClick={() => setTab("schema")} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 ${tab === "schema" ? "bg-purple-600 text-white" : "bg-black/30 text-purple-200/60 hover:text-white"}`}><Settings2 className="h-3.5 w-3.5" /> Field Schema ({fields.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar-thin p-5">
          {loading ? (
            <div className="text-center py-16 text-purple-200/40 text-sm">Loading…</div>
          ) : tab === "schema" ? (
            /* ——— SCHEMA EDITOR ——— */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-purple-200/50 max-w-lg leading-relaxed">Define the credential fields for this product. Add unlimited custom fields, choose types, mark secrets, reorder, and duplicate. Passwords/secrets are hidden by default when viewing.</p>
                <Button size="sm" onClick={addField} className="shrink-0 flex items-center gap-1"><Plus className="h-4 w-4" /> Add Field</Button>
              </div>
              {fields.map((f, i) => (
                <Card key={i} className="p-3 border-purple-500/10 bg-black/30">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-0.5 pt-1">
                      <button onClick={() => moveField(i, -1)} className="text-purple-300/40 hover:text-white cursor-pointer text-[10px]">▲</button>
                      <GripVertical className="h-4 w-4 text-purple-300/30" />
                      <button onClick={() => moveField(i, 1)} className="text-purple-300/40 hover:text-white cursor-pointer text-[10px]">▼</button>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input label="Label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Type</label>
                        <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value, is_secret: e.target.value === "password" ? 1 : f.is_secret })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-lg focus:outline-none">
                          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      {f.type === "dropdown" && <Input label="Options (comma separated)" value={f.options || ""} onChange={(e) => updateField(i, { options: e.target.value })} />}
                      <Input label="Placeholder" value={f.placeholder || ""} onChange={(e) => updateField(i, { placeholder: e.target.value })} />
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-purple-200/70 cursor-pointer"><input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked ? 1 : 0 })} className="accent-purple-500 h-3.5 w-3.5" /> Required</label>
                        <label className="flex items-center gap-1.5 text-[11px] text-purple-200/70 cursor-pointer"><input type="checkbox" checked={!!f.is_secret} onChange={(e) => updateField(i, { is_secret: e.target.checked ? 1 : 0 })} className="accent-purple-500 h-3.5 w-3.5" /> Secret</label>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => duplicateField(i)} title="Duplicate" className="p-1.5 rounded-lg bg-purple-500/10 text-purple-300 hover:text-white cursor-pointer"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeField(i)} title="Delete" className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer"><Trash className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </Card>
              ))}
              <div className="flex justify-end pt-2">
                <Button onClick={saveSchema} isLoading={savingSchema} className="flex items-center gap-1.5"><Save className="h-4 w-4" /> Save Schema</Button>
              </div>
            </div>
          ) : (
            /* ——— CREDENTIALS LIST ——— */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-purple-200/50">All credential records for this product.</p>
                <Button size="sm" onClick={() => setCreating(blankValues())} className="flex items-center gap-1"><Plus className="h-4 w-4" /> Add Credential</Button>
              </div>
              {credentials.length === 0 ? (
                <div className="text-center py-12 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">No credentials yet. Click "Add Credential".</div>
              ) : credentials.map((row) => (
                <Card key={row.id} className="p-4 border-purple-500/10 bg-black/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${row.status === "sold" ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{row.status}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => copyAll(row)} className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px] font-bold cursor-pointer flex items-center gap-1"><Copy className="h-3 w-3" /> Copy All</button>
                      <button onClick={() => setEditing({ ...row, values: { ...row.values } })} className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 text-[10px] font-bold cursor-pointer">Edit</button>
                      <button onClick={() => deleteCred(row.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer"><Trash className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fields.map((f) => {
                      const key = f.field_key || f.label;
                      const val = row.values[key];
                      if (val == null || String(val) === "") return null;
                      const rk = `${row.id}_${key}`;
                      const secret = !!f.is_secret;
                      const shown = reveal[rk];
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 p-2 bg-black/30 rounded-lg border border-purple-500/5">
                          <div className="min-w-0">
                            <span className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest block">{f.label}</span>
                            <span className="text-xs text-cyan-300 font-mono break-all">{secret && !shown ? "••••••••" : String(val)}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {secret && <button onClick={() => toggleSecret(rk)} className="p-1 rounded text-purple-300/60 hover:text-white cursor-pointer">{shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>}
                            <button onClick={() => copy(String(val), rk)} className="p-1 rounded text-purple-300/60 hover:text-white cursor-pointer">{reveal[`copied_${rk}`] ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {row.updated_by && <div className="text-[9px] text-purple-200/30 font-mono">Last updated by {row.updated_by}{row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString()}` : ""}</div>}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit sub-modal */}
        {(creating || editing) && (
          <div className="absolute inset-0 z-[10] flex items-center justify-center p-4 bg-black/70">
            <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar-thin p-5 border-purple-500/30 bg-[#0c0420] space-y-4">
              <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
                <h4 className="text-sm font-bold text-white font-space">{creating ? "Add Credential" : "Edit Credential"}</h4>
                <button onClick={() => { setCreating(null); setEditing(null); }} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-3">
                {fields.map((f) => {
                  const key = f.field_key || f.label;
                  const target = creating || (editing ? editing.values : {});
                  const setVal = (v: any) => { if (creating) setCreating({ ...creating, [key]: v }); else if (editing) setEditing({ ...editing, values: { ...editing.values, [key]: v } }); };
                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">{f.label}{f.required ? " *" : ""}</label>
                      {fieldInput(f, target[key], setVal)}
                      {f.help_text && <p className="text-[9px] text-purple-200/40">{f.help_text}</p>}
                    </div>
                  );
                })}
                <Button onClick={creating ? saveNew : saveEdit} className="w-full flex items-center justify-center gap-1.5"><Save className="h-4 w-4" /> Save Credential</Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* High-risk unlock modal (Admin Authorization Code). Retries the guarded action on success. */}
      <AuthCodeModal
        open={!!authModal}
        action={authModal?.action}
        onClose={() => setAuthModal(null)}
        onUnlocked={() => { const r = authModal?.retry; setAuthModal(null); if (r) r(); }}
      />
    </div>
  );
}
