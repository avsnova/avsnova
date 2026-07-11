import { useState, useEffect } from "react";
import { Input } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";

/**
 * DynamicCheckoutFields — renders the ADMIN-DEFINED checkout fields for a given module
 * (managed in Admin → Checkout Fields, Item 2). Values flow into the same `values` map the
 * rest of the checkout already sends as `customFieldsData`, so answers persist on the order.
 *
 * Fully additive: if an admin has defined no fields for the module, this renders nothing and
 * the existing checkout behaves exactly as before. `onValidityChange` reports whether all
 * required fields are filled so the parent can gate the Continue button.
 */
export type DynamicField = {
  id: number;
  field_key: string;
  label: string;
  type: string;
  placeholder?: string;
  help_text?: string;
  options?: string[];
  required?: number | boolean;
};

export default function DynamicCheckoutFields({
  module,
  values,
  onChange,
  onFieldsLoaded,
}: {
  module: string;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onFieldsLoaded?: (fields: DynamicField[]) => void;
}) {
  const [fields, setFields] = useState<DynamicField[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/checkout-fields/${encodeURIComponent(module)}`);
        if (!alive) return;
        const f = (r && r.fields) || [];
        setFields(f);
        onFieldsLoaded?.(f);
      } catch {
        if (alive) setFields([]);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  if (!fields.length) return null;

  const set = (key: string, val: string) => onChange({ ...values, [key]: val });
  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-sm text-white px-3 py-2.5 rounded-xl focus:outline-none placeholder-purple-200/25";
  const labelCls = "text-xs font-semibold text-purple-200/70 block mb-1.5";

  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const key = f.field_key || f.label;
        const val = values[key] || "";
        const required = !!f.required;
        const lbl = <>{f.label}{required && <span className="text-red-400"> *</span>}</>;

        if (f.type === "textarea") {
          return (
            <div key={f.id}>
              <label className={labelCls}>{lbl}</label>
              <textarea value={val} onChange={(e) => set(key, e.target.value)} placeholder={f.placeholder || ""} rows={3} className={inputCls} />
              {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
            </div>
          );
        }
        if (f.type === "select") {
          return (
            <div key={f.id}>
              <label className={labelCls}>{lbl}</label>
              <select value={val} onChange={(e) => set(key, e.target.value)} className={inputCls}>
                <option value="" className="bg-neutral-900">{f.placeholder || "Select…"}</option>
                {(f.options || []).map((o) => <option key={o} value={o} className="bg-neutral-900">{o}</option>)}
              </select>
              {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
            </div>
          );
        }
        if (f.type === "radio") {
          return (
            <div key={f.id}>
              <label className={labelCls}>{lbl}</label>
              <div className="flex flex-wrap gap-3">
                {(f.options || []).map((o) => (
                  <label key={o} className="flex items-center gap-1.5 text-sm text-purple-100 cursor-pointer">
                    <input type="radio" name={`f_${f.id}`} checked={val === o} onChange={() => set(key, o)} className="accent-cyan-500" /> {o}
                  </label>
                ))}
              </div>
              {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
            </div>
          );
        }
        if (f.type === "checkbox") {
          return (
            <div key={f.id}>
              <label className="flex items-center gap-2 text-sm text-purple-100 cursor-pointer">
                <input type="checkbox" checked={val === "true"} onChange={(e) => set(key, e.target.checked ? "true" : "")} className="accent-cyan-500 h-4 w-4" />
                {lbl}
              </label>
              {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
            </div>
          );
        }
        // text, number, email, phone, date, file → Input with mapped html type
        const htmlType = f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : f.type === "file" ? "file" : "text";
        return (
          <div key={f.id}>
            <Input
              label={f.label + (required ? " *" : "")}
              type={htmlType}
              value={htmlType === "file" ? undefined : val}
              onChange={(e: any) => set(key, htmlType === "file" ? (e.target.files?.[0]?.name || "") : e.target.value)}
              placeholder={f.placeholder || ""}
            />
            {f.help_text && <p className="text-[10px] text-purple-200/40 mt-1">{f.help_text}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Returns the admin checkout-field module name for a given checkout kind. */
export function moduleForCheckoutKind(kind: string): string {
  if (kind === "esim") return "esim";
  if (kind === "physical-sim") return "physical-sim";
  if (kind === "gift") return "gift";
  return "marketplace"; // physical, intl, digital
}
