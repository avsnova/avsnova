import { useState } from "react";
import { Plus, Trash2, RotateCcw, GripVertical } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { PAGE_CONTEXT, type QuickReply } from "../../../ai/pageContext";
import { getQuickRepliesForPage, setQuickRepliesForPage, resetQuickRepliesForPage } from "../../../ai/aiContentStore";
import { EmptyState } from "./aiAdminUi";

const PAGE_KEYS = Object.keys(PAGE_CONTEXT);

export default function AiQuickReplyPanel() {
  const { toast } = useToast();
  const [page, setPage] = useState<string>(PAGE_KEYS[0]);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const replies = getQuickRepliesForPage(page);

  const update = (next: QuickReply[]) => { setQuickRepliesForPage(page, next); refresh(); };

  const addReply = () => update([...replies, { label: "New chip", send: "Tell me more" }]);
  const removeReply = (i: number) => update(replies.filter((_, idx) => idx !== i));
  const editReply = (i: number, patch: Partial<QuickReply>) => update(replies.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const reset = () => { resetQuickRepliesForPage(page); toast("Quick replies reset to defaults for this page.", "success"); refresh(); };

  return (
    <div className="space-y-4">
      {/* Page selector */}
      <div className="flex gap-1.5 overflow-x-auto custom-scrollbar-thin pb-1 -mx-1 px-1">
        {PAGE_KEYS.map((k) => (
          <button key={k} onClick={() => setPage(k)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              page === k ? "bg-purple-500/20 border border-purple-500/40 text-white" : "bg-black/30 border border-purple-500/10 text-purple-200/60 hover:text-white"
            }`}>
            {PAGE_CONTEXT[k].title}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#0c0522] to-[#05020a] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold font-space text-white">{PAGE_CONTEXT[page].title} — Quick Replies</h4>
            <p className="text-[11px] text-purple-200/40 mt-0.5">Shown as one-tap suggestion chips on this page.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200 text-[11px] font-bold hover:text-white cursor-pointer"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
            <button onClick={addReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-[11px] font-bold hover:brightness-110 cursor-pointer"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
        </div>

        {replies.length === 0 ? (
          <EmptyState label="No quick replies for this page yet. Add one to guide customers." />
        ) : (
          <div className="space-y-2">
            {replies.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-purple-500/12 bg-black/30 p-2.5">
                <GripVertical className="h-4 w-4 text-purple-300/20 shrink-0" />
                <input value={r.label} onChange={(e) => editReply(i, { label: e.target.value })} placeholder="Chip label"
                  className="w-1/3 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
                <input value={r.send} onChange={(e) => editReply(i, { send: e.target.value })} placeholder="Message it sends"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
                <button onClick={() => removeReply(i)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 cursor-pointer shrink-0"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Preview */}
        <div className="mt-4 pt-4 border-t border-purple-500/10">
          <div className="text-[10px] font-bold text-purple-200/40 uppercase tracking-wider mb-2">Preview</div>
          <div className="flex flex-wrap gap-1.5">
            {replies.map((r, i) => (
              <span key={i} className="rounded-full border border-purple-500/25 bg-purple-500/8 px-3 py-1.5 text-[11px] font-semibold text-purple-100">{r.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
