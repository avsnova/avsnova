import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { apiFetch } from "../../utils/api";

// Feature 2 — PUBLIC form renderer. Recipients open /#form/<slug>. They only ever
// see the form (never the admin dashboard). Renders all supported field types and
// submits to the public endpoint.

interface FormField {
  id: string; type: string; label: string; placeholder?: string; description?: string;
  help_text?: string; required?: boolean; options?: string;
}

export default function FormPublicView({ slug }: { slug: string }) {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/forms/${encodeURIComponent(slug)}`);
        if (res && res.form) setForm(res.form);
        else setError("This form is not available.");
      } catch (e: any) {
        setError(e.message && e.message.includes("not available") ? "This form is not available." : "This form could not be loaded.");
      } finally { setLoading(false); }
    })();
  }, [slug]);

  const setVal = (id: string, v: any) => setValues((s) => ({ ...s, [id]: v }));

  const toggleMulti = (id: string, opt: string) => {
    setValues((s) => {
      const cur: string[] = Array.isArray(s[id]) ? s[id] : [];
      return { ...s, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // client-side required check
    for (const f of (form.fields as FormField[])) {
      if (f.required && !["heading", "paragraph", "divider"].includes(f.type)) {
        const v = values[f.id];
        if (v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)) {
          setError(`"${f.label}" is required.`);
          return;
        }
      }
    }
    setError("");
    setSubmitting(true);
    try {
      await apiFetch(`/api/forms/${encodeURIComponent(slug)}/submit`, { method: "POST", body: JSON.stringify({ answers: values }) });
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Submission failed. Please try again.");
    } finally { setSubmitting(false); }
  };

  const inputCls = "w-full bg-black/40 border border-purple-500/25 text-sm text-white px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-purple-500 placeholder-purple-200/30";

  const renderField = (f: FormField) => {
    if (f.type === "heading") return <h3 key={f.id} className="text-lg font-bold text-white font-space pt-2">{f.label}</h3>;
    if (f.type === "paragraph") return <p key={f.id} className="text-xs text-purple-200/60 leading-relaxed">{f.label}</p>;
    if (f.type === "divider") return <hr key={f.id} className="border-purple-500/15" />;

    const opts = String(f.options || "").split(",").map((o) => o.trim()).filter(Boolean);
    const label = (
      <label className="text-xs font-bold text-purple-200/80 block font-space mb-1.5">
        {f.label}{f.required ? <span className="text-red-400"> *</span> : ""}
      </label>
    );

    let control: React.ReactNode = null;
    switch (f.type) {
      case "long_text": control = <textarea rows={4} value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "email": control = <input type="email" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "phone": control = <input type="tel" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "number": control = <input type="number" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "password": control = <input type="password" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "date": control = <input type="date" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} className={inputCls} />; break;
      case "time": control = <input type="time" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} className={inputCls} />; break;
      case "url": control = <input type="url" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />; break;
      case "dropdown": control = (
        <select value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} className={inputCls}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ); break;
      case "radio": control = (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-purple-100 cursor-pointer">
              <input type="radio" name={f.id} checked={values[f.id] === o} onChange={() => setVal(f.id, o)} className="accent-purple-500 h-4 w-4" /> {o}
            </label>
          ))}
        </div>
      ); break;
      case "checkboxes":
      case "multiselect": control = (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-purple-100 cursor-pointer">
              <input type="checkbox" checked={Array.isArray(values[f.id]) && values[f.id].includes(o)} onChange={() => toggleMulti(f.id, o)} className="accent-purple-500 h-4 w-4" /> {o}
            </label>
          ))}
        </div>
      ); break;
      case "file": case "image": case "pdf": control = (
        <input type="text" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder || "Paste a file/image URL"} className={inputCls} />
      ); break;
      case "signature": control = <input type="text" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder="Type your full name as signature" className={inputCls + " italic font-space"} />; break;
      default: control = <input type="text" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} placeholder={f.placeholder} className={inputCls} />;
    }

    return (
      <div key={f.id}>
        {label}
        {control}
        {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#03000a] text-[#f5f0ff] relative overflow-x-clip flex items-start justify-center py-10 px-4">
      <div className="absolute top-[10%] left-[10%] w-72 h-72 rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-72 h-72 rounded-full bg-cyan-600/10 blur-[100px] pointer-events-none" />
      <div className="relative w-full max-w-lg z-10">
        <div className="text-center mb-6">
          <span className="text-2xl font-black font-space tracking-tight text-white">AVS<span className="text-cyan-400"> Nova</span></span>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-purple-500/20 bg-[#0b031d] p-10 text-center"><Loader2 className="h-6 w-6 animate-spin text-purple-400 mx-auto" /></div>
        ) : error && !form ? (
          <div className="rounded-3xl border border-red-500/25 bg-[#0b031d] p-10 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
            <p className="text-sm text-purple-200/70">{error}</p>
          </div>
        ) : done ? (
          <div className="rounded-3xl border border-emerald-500/25 bg-[#0b031d] p-10 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-bold text-white font-space">Submitted</h2>
            <p className="text-sm text-purple-200/70 leading-relaxed">{form.success_message || "Thank you! Your response has been recorded."}</p>
          </div>
        ) : form ? (
          <form onSubmit={submit} className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#12082b] to-[#0a0418] p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="border-b border-purple-500/15 pb-4">
              <h1 className="text-xl font-bold text-white font-space">{form.title}</h1>
              {form.description && <p className="text-xs text-purple-200/60 mt-1.5 leading-relaxed">{form.description}</p>}
              {form.instructions && <p className="text-[11px] text-cyan-300/70 mt-2 leading-relaxed bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-2.5">{form.instructions}</p>}
            </div>

            {(form.fields as FormField[]).map(renderField)}

            {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5 flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</div>}

            <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit"}
            </button>
            <p className="text-[10px] text-center text-purple-200/30">Powered by AVShop · Your data is submitted securely.</p>
          </form>
        ) : null}
      </div>
    </div>
  );
}
