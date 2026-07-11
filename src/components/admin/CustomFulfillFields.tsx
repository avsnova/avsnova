import { Plus, Trash2 } from "lucide-react";

// Reusable "+ Add Field" block for the Fulfillment Dashboard. Lets admins add unlimited
// per-order custom fields (label + value) for any fulfillment type — same lightweight
// UX everywhere (eSIM, Physical SIM, Gift, Marketplace).
export default function CustomFulfillFields({
  fields, onChange,
}: {
  fields: { label: string; value: string }[];
  onChange: (fields: { label: string; value: string }[]) => void;
}) {
  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-2 rounded-lg focus:outline-none placeholder-purple-200/25";
  const add = () => onChange([...fields, { label: "", value: "" }]);
  const update = (i: number, patch: Partial<{ label: string; value: string }>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-xl border border-purple-500/10 bg-black/20 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Custom Fields</span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> Add Field
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-[10px] text-purple-200/30 italic">No custom fields. Click “Add Field” to include extra delivery details.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={f.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Field name" className={`${inputCls} w-2/5`} />
              <input value={f.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="Value" className={inputCls} />
              <button type="button" onClick={() => remove(i)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 hover:text-red-200 cursor-pointer shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
