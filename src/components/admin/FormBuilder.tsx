import { useState, useEffect } from "react";
import {
  Plus, Trash, Copy, Edit, X, Save, Eye, ExternalLink, GripVertical, FileText,
  ClipboardList, Download, Search, ArrowLeft, Link2, CheckCircle2, Mail, Send
} from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";

// Feature 2 — Custom Form Builder (admin side).
// List → Editor (fields + settings) → Responses. Public rendering is FormPublicView.

const FIELD_TYPES: { type: string; label: string; group: string }[] = [
  { type: "short_text", label: "Short Text", group: "input" },
  { type: "long_text", label: "Long Text", group: "input" },
  { type: "email", label: "Email", group: "input" },
  { type: "phone", label: "Phone", group: "input" },
  { type: "number", label: "Number", group: "input" },
  { type: "password", label: "Password", group: "input" },
  { type: "date", label: "Date", group: "input" },
  { type: "time", label: "Time", group: "input" },
  { type: "url", label: "URL", group: "input" },
  { type: "dropdown", label: "Dropdown", group: "choice" },
  { type: "radio", label: "Radio Buttons", group: "choice" },
  { type: "checkboxes", label: "Checkboxes", group: "choice" },
  { type: "multiselect", label: "Multi-select", group: "choice" },
  { type: "file", label: "File Upload", group: "upload" },
  { type: "image", label: "Image Upload", group: "upload" },
  { type: "pdf", label: "PDF Upload", group: "upload" },
  { type: "signature", label: "Signature", group: "upload" },
  { type: "heading", label: "Heading", group: "layout" },
  { type: "paragraph", label: "Paragraph", group: "layout" },
  { type: "divider", label: "Divider", group: "layout" },
];

const TEMPLATES: { name: string; title: string; fields: any[] }[] = [
  { name: "Refund Request", title: "Refund Request", fields: [
    { type: "heading", label: "Refund Request" },
    { type: "short_text", label: "Full Name", required: true },
    { type: "email", label: "Email Address", required: true },
    { type: "short_text", label: "Order ID", required: true },
    { type: "dropdown", label: "Reason", options: "Not delivered,Wrong item,Not as described,Other", required: true },
    { type: "long_text", label: "Details", required: true },
    { type: "file", label: "Proof / Attachment" },
  ]},
  { name: "Identity Verification", title: "Identity Verification", fields: [
    { type: "heading", label: "Identity Verification" },
    { type: "short_text", label: "Full Legal Name", required: true },
    { type: "date", label: "Date of Birth", required: true },
    { type: "image", label: "Government ID (Front)", required: true },
    { type: "image", label: "Government ID (Back)" },
    { type: "image", label: "Selfie with ID" },
  ]},
  { name: "Account Verification", title: "Account Verification", fields: [
    { type: "short_text", label: "Username", required: true },
    { type: "email", label: "Account Email", required: true },
    { type: "phone", label: "Phone Number" },
    { type: "long_text", label: "Additional Info" },
  ]},
  { name: "Support Request", title: "Support Request", fields: [
    { type: "short_text", label: "Name", required: true },
    { type: "email", label: "Email", required: true },
    { type: "dropdown", label: "Category", options: "Billing,Technical,General,Other", required: true },
    { type: "long_text", label: "How can we help?", required: true },
  ]},
  { name: "Payment Confirmation", title: "Payment Confirmation", fields: [
    { type: "short_text", label: "Full Name", required: true },
    { type: "short_text", label: "Transaction Reference", required: true },
    { type: "number", label: "Amount (₦)", required: true },
    { type: "image", label: "Payment Proof", required: true },
  ]},
  { name: "Product Return", title: "Product Return", fields: [
    { type: "short_text", label: "Order ID", required: true },
    { type: "dropdown", label: "Reason", options: "Defective,Wrong item,Changed mind,Other", required: true },
    { type: "long_text", label: "Description" },
  ]},
  { name: "Complaint Form", title: "Complaint Form", fields: [
    { type: "short_text", label: "Name", required: true },
    { type: "email", label: "Email", required: true },
    { type: "long_text", label: "Your Complaint", required: true },
  ]},
  { name: "Partnership Application", title: "Partnership Application", fields: [
    { type: "short_text", label: "Company / Name", required: true },
    { type: "email", label: "Email", required: true },
    { type: "url", label: "Website / Social" },
    { type: "long_text", label: "Proposal", required: true },
  ]},
  { name: "Blank Form", title: "Untitled Form", fields: [] },
];

let uidCounter = 0;
const genId = () => `f${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  description?: string;
  help_text?: string;
  required?: boolean;
  options?: string;
}

export default function FormBuilder() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "edit" | "responses">("list");
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // editor state
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // responses state
  const [respForm, setRespForm] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [respFields, setRespFields] = useState<any[]>([]);
  const [respSearch, setRespSearch] = useState("");
  const [respFilter, setRespFilter] = useState("all");
  // Item 4: reply-to-respondent modal state.
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [replyEmail, setReplyEmail] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replySending, setReplySending] = useState(false);

  const loadForms = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/forms");
      if (res && res.forms) setForms(res.forms);
    } catch (e: any) { toast("Failed to load forms: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadForms(); }, []);

  const newForm = (template?: typeof TEMPLATES[number]) => {
    setForm({
      id: "", title: template ? template.title : "Untitled Form", description: "", instructions: "",
      status: "draft", success_message: "Thank you! Your response has been recorded.",
      fields: (template ? template.fields : []).map((f) => ({ ...f, id: genId() })),
    });
    setView("edit");
  };

  const editForm = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/forms/${id}`);
      if (res && res.form) {
        setForm({ ...res.form, fields: (res.form.fields || []).map((f: any) => ({ ...f, id: f.id || genId() })) });
        setView("edit");
      }
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const saveForm = async () => {
    if (!form.title.trim()) { toast("Title is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/forms/save", { method: "POST", body: JSON.stringify(form) });
      toast("Form saved.", "success");
      if (res && res.id && !form.id) setForm({ ...form, id: res.id, slug: res.slug });
      await loadForms();
    } catch (e: any) { toast("Failed to save: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const deleteForm = async (id: string) => {
    if (!confirm("Delete this form and all its responses?")) return;
    try { await apiFetch(`/api/admin/forms/${id}`, { method: "DELETE" }); toast("Form deleted.", "success"); loadForms(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const duplicateForm = async (id: string) => {
    try { await apiFetch(`/api/admin/forms/${id}/duplicate`, { method: "POST" }); toast("Form duplicated.", "success"); loadForms(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const openResponses = async (f: any) => {
    setRespForm(f);
    try {
      const res = await apiFetch(`/api/admin/forms/${f.id}/responses`);
      if (res && res.responses) setResponses(res.responses);
      // Prefer the authoritative field defs returned by the responses endpoint so
      // every answer renders with its label (the list item omits `fields`).
      if (res && Array.isArray(res.fields)) setRespFields(res.fields);
      setView("responses");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  const publicUrl = (slug: string) => `${window.location.origin}/#form/${slug}`;
  const copyLink = async (slug: string) => { const ok = await copyToClipboard(publicUrl(slug)); if (ok) toast("Public form link copied.", "success", { silent: true }); };

  // ——— Field editor helpers ———
  const addField = (type: string) => {
    const meta = FIELD_TYPES.find((t) => t.type === type);
    setForm((f: any) => ({ ...f, fields: [...f.fields, { id: genId(), type, label: meta ? meta.label : "Field", required: false, options: ["dropdown", "radio", "checkboxes", "multiselect"].includes(type) ? "Option 1,Option 2" : "" }] }));
  };
  const updateField = (id: string, patch: Partial<FormField>) => setForm((f: any) => ({ ...f, fields: f.fields.map((x: FormField) => x.id === id ? { ...x, ...patch } : x) }));
  const removeField = (id: string) => setForm((f: any) => ({ ...f, fields: f.fields.filter((x: FormField) => x.id !== id) }));
  const moveField = (id: string, dir: -1 | 1) => setForm((f: any) => {
    const idx = f.fields.findIndex((x: FormField) => x.id === id); const j = idx + dir;
    if (idx < 0 || j < 0 || j >= f.fields.length) return f;
    const next = [...f.fields]; [next[idx], next[j]] = [next[j], next[idx]]; return { ...f, fields: next };
  });

  // ============ LIST VIEW ============
  if (view === "list") {
    return (
      <div className="font-inter text-left space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><ClipboardList className="h-5 w-5 text-cyan-400" /> Custom Form Builder</h3>
            <p className="text-xs text-purple-200/50 mt-0.5">Create shareable forms with a public link. Responses are stored here.</p>
          </div>
          <Button onClick={() => newForm()} className="shrink-0 flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Form</Button>
        </div>

        {/* Templates */}
        <Card className="p-4 space-y-3 border-purple-500/15">
          <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Start from a template</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => newForm(t)} className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/15 text-[11px] font-bold text-purple-200/70 hover:text-white hover:border-purple-500/40 cursor-pointer transition-all">{t.name}</button>
            ))}
          </div>
        </Card>

        {loading ? <div className="text-center py-12 text-purple-200/40 text-sm">Loading…</div> : forms.length === 0 ? (
          <div className="text-center py-12 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">No forms yet. Create one above.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forms.map((f) => (
              <Card key={f.id} className="p-4 space-y-3 border-purple-500/10 bg-black/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-400 shrink-0" />
                      <h4 className="font-bold text-white text-sm truncate font-space">{f.title}</h4>
                    </div>
                    <p className="text-[11px] text-purple-200/40 mt-0.5 line-clamp-1">{f.description || "No description"}</p>
                  </div>
                  <Badge variant={f.status === "published" ? "success" : f.status === "archived" ? "warning" : "default"}>{f.status}</Badge>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-purple-200/40 font-mono">
                  <span>{f.submissions_count || 0} responses</span>
                  {f.is_template ? <span className="text-cyan-400">· template</span> : null}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-purple-500/10">
                  <button onClick={() => editForm(f.id)} className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 text-[10px] font-bold cursor-pointer flex items-center gap-1"><Edit className="h-3 w-3" /> Edit</button>
                  <button onClick={() => openResponses(f)} className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 text-[10px] font-bold cursor-pointer flex items-center gap-1"><ClipboardList className="h-3 w-3" /> Responses</button>
                  {f.status === "published" && <>
                    <button onClick={() => copyLink(f.slug)} className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/15 text-purple-200/70 text-[10px] font-bold cursor-pointer flex items-center gap-1"><Link2 className="h-3 w-3" /> Copy Link</button>
                    <a href={publicUrl(f.slug)} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/15 text-purple-200/70 text-[10px] font-bold cursor-pointer flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open</a>
                  </>}
                  <button onClick={() => duplicateForm(f.id)} className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/15 text-purple-200/70 text-[10px] font-bold cursor-pointer">Duplicate</button>
                  <button onClick={() => deleteForm(f.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer ml-auto"><Trash className="h-3.5 w-3.5" /></button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============ EDIT VIEW ============
  if (view === "edit" && form) {
    return (
      <div className="font-inter text-left space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => { setView("list"); loadForms(); }} className="flex items-center gap-1.5 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer"><ArrowLeft className="h-4 w-4" /> Back to forms</button>
          <div className="flex items-center gap-2">
            {form.slug && form.status === "published" && <button onClick={() => copyLink(form.slug)} className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200/70 text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Copy Public Link</button>}
            <Button onClick={saveForm} isLoading={saving} className="flex items-center gap-1.5"><Save className="h-4 w-4" /> Save Form</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Settings + palette */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3 border-purple-500/15">
              <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Form Settings</span>
              <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Description</label>
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-lg focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Instructions</label>
                <textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-lg focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-lg focus:outline-none">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-purple-200/70 block font-space uppercase">Success Message</label>
                <textarea rows={2} value={form.success_message} onChange={(e) => setForm({ ...form, success_message: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-lg focus:outline-none" />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-purple-200/70 cursor-pointer"><input type="checkbox" checked={!!form.is_template} onChange={(e) => setForm({ ...form, is_template: e.target.checked })} className="accent-purple-500 h-4 w-4" /> Save as reusable template</label>
            </Card>

            <Card className="p-4 space-y-2 border-purple-500/15">
              <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Add Field</span>
              <div className="grid grid-cols-2 gap-1.5">
                {FIELD_TYPES.map((t) => (
                  <button key={t.type} onClick={() => addField(t.type)} className="px-2 py-1.5 rounded-lg bg-black/40 border border-purple-500/15 text-[10px] font-bold text-purple-200/70 hover:text-white hover:border-purple-500/40 cursor-pointer text-left transition-all">+ {t.label}</button>
                ))}
              </div>
            </Card>
          </div>

          {/* Field list */}
          <div className="lg:col-span-2 space-y-3">
            {form.fields.length === 0 ? (
              <div className="text-center py-16 text-purple-200/30 italic text-sm border border-dashed border-purple-500/20 rounded-2xl bg-black/20">Add fields from the palette on the left.</div>
            ) : form.fields.map((fld: FormField) => (
              <Card key={fld.id} className="p-3 border-purple-500/10 bg-black/30">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button onClick={() => moveField(fld.id, -1)} className="text-purple-300/40 hover:text-white cursor-pointer text-[10px]">▲</button>
                    <GripVertical className="h-4 w-4 text-purple-300/30" />
                    <button onClick={() => moveField(fld.id, 1)} className="text-purple-300/40 hover:text-white cursor-pointer text-[10px]">▼</button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="purple">{FIELD_TYPES.find((t) => t.type === fld.type)?.label || fld.type}</Badge>
                      {!["heading", "paragraph", "divider"].includes(fld.type) && (
                        <label className="flex items-center gap-1.5 text-[10px] text-purple-200/60 cursor-pointer ml-auto"><input type="checkbox" checked={!!fld.required} onChange={(e) => updateField(fld.id, { required: e.target.checked })} className="accent-purple-500 h-3.5 w-3.5" /> Required</label>
                      )}
                    </div>
                    <Input label={fld.type === "divider" ? "(Divider — no label)" : "Label"} value={fld.label} onChange={(e) => updateField(fld.id, { label: e.target.value })} />
                    {!["heading", "paragraph", "divider"].includes(fld.type) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input label="Placeholder" value={fld.placeholder || ""} onChange={(e) => updateField(fld.id, { placeholder: e.target.value })} />
                        <Input label="Help Text" value={fld.help_text || ""} onChange={(e) => updateField(fld.id, { help_text: e.target.value })} />
                      </div>
                    )}
                    {["dropdown", "radio", "checkboxes", "multiselect"].includes(fld.type) && (
                      <Input label="Options (comma separated)" value={fld.options || ""} onChange={(e) => updateField(fld.id, { options: e.target.value })} />
                    )}
                  </div>
                  <button onClick={() => removeField(fld.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer"><Trash className="h-3.5 w-3.5" /></button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============ RESPONSES VIEW ============
  if (view === "responses" && respForm) {
    const fields: FormField[] = (respFields && respFields.length)
      ? respFields
      : (() => { try { return typeof respForm.fields === "string" ? JSON.parse(respForm.fields) : (respForm.fields || []); } catch { return []; } })();
    const answerFields = fields.filter((f) => !["heading", "paragraph", "divider"].includes(f.type));
    // Fallback: if a submitted answer key has no matching field def (legacy data),
    // still surface it so nothing is hidden.
    const extraKeys = (r: any) => Object.keys(r.answers || {}).filter((k) => !answerFields.some((f) => f.id === k));
    const filtered = responses.filter((r) => {
      if (respFilter !== "all" && r.status !== respFilter) return false;
      if (!respSearch.trim()) return true;
      const hay = JSON.stringify(r.answers || {}).toLowerCase();
      return hay.includes(respSearch.toLowerCase());
    });

    const exportCsv = () => {
      const headers = ["Submitted", "Status", ...answerFields.map((f) => f.label)];
      const rows = filtered.map((r) => [
        r.created_at, r.status,
        ...answerFields.map((f) => { const v = r.answers[f.id]; return Array.isArray(v) ? v.join("; ") : (v ?? ""); }),
      ]);
      const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const csv = "data:text/csv;charset=utf-8," + [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
      const link = document.createElement("a"); link.href = encodeURI(csv); link.download = `${respForm.slug || "form"}-responses.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const setStatus = async (rid: number, status: string) => {
      try { await apiFetch(`/api/admin/forms/responses/${rid}/status`, { method: "POST", body: JSON.stringify({ status }) }); setResponses((rs) => rs.map((r) => r.id === rid ? { ...r, status } : r)); }
      catch (e: any) { toast("Failed: " + e.message, "error"); }
    };
    const delResp = async (rid: number) => {
      if (!confirm("Delete this response?")) return;
      try { await apiFetch(`/api/admin/forms/responses/${rid}`, { method: "DELETE" }); setResponses((rs) => rs.filter((r) => r.id !== rid)); }
      catch (e: any) { toast("Failed: " + e.message, "error"); }
    };
    const copyOne = async (r: any) => { const text = answerFields.map((f) => `${f.label}: ${Array.isArray(r.answers[f.id]) ? r.answers[f.id].join(", ") : (r.answers[f.id] ?? "")}`).join("\n"); const ok = await copyToClipboard(text); if (ok) toast("Response copied.", "success", { silent: true }); };

    // Item 4: open the reply modal, pre-filling the respondent's detected email.
    const openReply = (r: any) => {
      const emailField = answerFields.find((f) => f.type === "email");
      let detected = emailField ? String(r.answers[emailField.id] || "") : "";
      if (!detected) {
        for (const v of Object.values(r.answers || {})) {
          const val = Array.isArray(v) ? v.join(" ") : String(v || "");
          const m = val.match(/[^\s@]+@[^\s@]+\.[^\s@]+/); if (m) { detected = m[0]; break; }
        }
      }
      setReplyTo(r); setReplyEmail(detected); setReplySubject(`Re: ${respForm.title}`); setReplyMessage("");
    };
    const sendReply = async () => {
      if (!replyMessage.trim()) { toast("Write a message to send.", "warning"); return; }
      setReplySending(true);
      try {
        const res = await apiFetch(`/api/admin/forms/responses/${replyTo.id}/reply`, { method: "POST", body: JSON.stringify({ to: replyEmail, subject: replySubject, message: replyMessage }) });
        if (res && res.success) {
          toast(`Reply sent to ${res.to}.`, "success", { big: true });
          setResponses((rs) => rs.map((x) => x.id === replyTo.id && x.status === "new" ? { ...x, status: "in_progress" } : x));
          setReplyTo(null);
        } else { toast(res?.error || "Failed to send reply.", "error"); }
      } catch (e: any) { toast("Failed: " + e.message, "error"); }
      finally { setReplySending(false); }
    };

    return (
      <div className="font-inter text-left space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button onClick={() => { setView("list"); loadForms(); }} className="flex items-center gap-1.5 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer"><ArrowLeft className="h-4 w-4" /> Back</button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} className="flex items-center gap-1.5 border-purple-500/25"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-white font-space">{respForm.title} — Responses</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">{responses.length} total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-purple-400" />
            <input value={respSearch} onChange={(e) => setRespSearch(e.target.value)} placeholder="Search responses…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-lg focus:outline-none" />
          </div>
          <select value={respFilter} onChange={(e) => setRespFilter(e.target.value)} className="bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-lg focus:outline-none">
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">No responses.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <Card key={r.id} className="p-4 border-purple-500/10 bg-black/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-purple-200/40">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span>
                  <div className="flex items-center gap-1.5">
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="bg-black/40 border border-purple-500/20 text-[10px] text-white px-2 py-1 rounded-lg focus:outline-none">
                      <option value="new">New</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button onClick={() => openReply(r)} className="p-1.5 rounded-lg bg-purple-500/10 text-purple-300 hover:text-white cursor-pointer" title="Reply by email"><Mail className="h-3.5 w-3.5" /></button>
                    <button onClick={() => copyOne(r)} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 cursor-pointer" title="Copy submission"><Copy className="h-3.5 w-3.5" /></button>
                    <button onClick={() => delResp(r.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer"><Trash className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {answerFields.map((f) => {
                    const v = r.answers[f.id];
                    const display = Array.isArray(v) ? v.join(", ") : String(v ?? "");
                    const isUpload = ["file", "image", "pdf", "signature"].includes(f.type);
                    const isUrl = typeof v === "string" && /^https?:\/\//i.test(v);
                    return (
                      <div key={f.id} className={`p-2 bg-black/30 rounded-lg border border-purple-500/5 ${f.type === "long_text" ? "sm:col-span-2" : ""}`}>
                        <span className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest block">{f.label}{f.required ? " *" : ""}</span>
                        {isUpload && isUrl ? (
                          <a href={v} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline break-all inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> View uploaded file</a>
                        ) : isUrl ? (
                          <a href={v} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline break-all">{display}</a>
                        ) : (
                          <span className="text-xs text-purple-100 break-all whitespace-pre-wrap">{display || <span className="text-purple-200/30 italic">—</span>}</span>
                        )}
                      </div>
                    );
                  })}
                  {/* Any answer without a matching field definition (legacy submissions). */}
                  {extraKeys(r).map((k) => {
                    const v = r.answers[k];
                    const display = Array.isArray(v) ? v.join(", ") : String(v ?? "");
                    return (
                      <div key={k} className="p-2 bg-black/30 rounded-lg border border-purple-500/5">
                        <span className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest block">{k}</span>
                        <span className="text-xs text-purple-100 break-all whitespace-pre-wrap">{display || <span className="text-purple-200/30 italic">—</span>}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Item 4: Reply-by-email modal — sends directly to the respondent. */}
        {replyTo && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !replySending && setReplyTo(null)} />
            <div className="relative w-full max-w-lg bg-[#0e0922] border border-purple-500/30 rounded-2xl p-5 shadow-2xl z-10 max-h-[88vh] overflow-y-auto space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold font-space text-white flex items-center gap-2"><Mail className="h-4 w-4 text-purple-300" /> Reply to Respondent</h3>
                <button onClick={() => !replySending && setReplyTo(null)} className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button>
              </div>
              <Input label="Recipient Email" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} placeholder="respondent@email.com" />
              <Input label="Subject" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} placeholder="Re: your submission" />
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-200/70 block font-space">Message</label>
                <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={6} placeholder="Type your reply — this is emailed directly to the respondent." className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none placeholder-purple-200/20" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={sendReply} isLoading={replySending} className="flex-1 flex items-center justify-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send Reply</Button>
                <Button variant="outline" onClick={() => setReplyTo(null)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
