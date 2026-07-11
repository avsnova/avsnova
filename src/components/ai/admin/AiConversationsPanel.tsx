import { useState, useEffect, useMemo } from "react";
import { Search, Download, X, User, Bot, Trash2 } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import {
  getAnalytics, subscribeAnalytics, setConversationStatus, assignConversation,
  setConversationNotes, clearAnalytics, type Conversation, type ConvStatus,
} from "../../../ai/aiAnalytics";
import { EmptyState } from "./aiAdminUi";

const STATUS_META: Record<ConvStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-cyan-500/15 border-cyan-500/25 text-cyan-300" },
  resolved: { label: "Resolved", cls: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300" },
  escalated: { label: "Escalated", cls: "bg-amber-500/15 border-amber-500/25 text-amber-300" },
  pending: { label: "Pending", cls: "bg-purple-500/15 border-purple-500/25 text-purple-300" },
};

export default function AiConversationsPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, force] = useState(0);
  useEffect(() => subscribeAnalytics(() => force((n) => n + 1)), []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ConvStatus>("all");
  const [selected, setSelected] = useState<Conversation | null>(null);

  const convs = getAnalytics().conversations;
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return convs.filter((c) =>
      (statusFilter === "all" || c.status === statusFilter) &&
      (!q || (c.userName || "").toLowerCase().includes(q) || c.page.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q)))
    );
  }, [convs, search, statusFilter]);

  const exportAll = () => {
    try {
      const blob = new Blob([JSON.stringify(convs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `aria_conversations_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast("Conversations exported.", "success");
    } catch { toast("Export failed.", "error"); }
  };

  const clearAll = async () => {
    if (!(await confirm({ title: "Clear analytics", message: "Delete all logged conversations and analytics from this device? This cannot be undone.", confirmLabel: "Clear all", danger: true }))) return;
    clearAnalytics(); setSelected(null); toast("Analytics cleared.", "success");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer">
          <option value="all">All statuses</option>
          <option value="active">Active</option><option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option><option value="pending">Pending</option>
        </select>
        <button onClick={exportAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-purple-200 text-xs font-bold hover:text-white cursor-pointer"><Download className="h-3.5 w-3.5" /> Export</button>
        <button onClick={clearAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
      </div>

      <div className="text-[11px] text-purple-200/40">{filtered.length} of {convs.length} conversations</div>

      {filtered.length === 0 ? (
        <EmptyState label="No conversations yet. Customer chats with Aria will appear here in real time." icon={<Bot className="h-7 w-7" />} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const first = c.messages.find((m) => m.role === "user");
            const meta = STATUS_META[c.status];
            return (
              <button key={c.id} onClick={() => setSelected(c)}
                className="w-full text-left rounded-xl border border-purple-500/12 bg-black/30 p-3.5 hover:border-purple-500/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-white truncate">{c.userName || "Guest"}</span>
                    <span className="text-[9px] text-purple-200/40">· {c.page}</span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[11px] text-purple-200/50 mt-1 truncate">{first?.text || "—"}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[9px] text-purple-200/30">
                  <span>{new Date(c.startedAt).toLocaleString()}</span>
                  <span>· {c.messages.length} msgs</span>
                  <span>· confidence {Math.round(c.avgConfidence * 100)}%</span>
                  {c.assignedTo && <span>· assigned: {c.assignedTo}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ConversationDrawer conv={selected} onClose={() => setSelected(null)}
          onStatus={(s) => { setConversationStatus(selected.id, s); setSelected({ ...selected, status: s }); toast(`Marked ${s}.`, "success"); }}
          onAssign={(to) => { assignConversation(selected.id, to); setSelected({ ...selected, assignedTo: to }); }}
          onNotes={(n) => { setConversationNotes(selected.id, n); setSelected({ ...selected, notes: n }); }}
        />
      )}
    </div>
  );
}

function ConversationDrawer({ conv, onClose, onStatus, onAssign, onNotes }: {
  conv: Conversation; onClose: () => void;
  onStatus: (s: ConvStatus) => void; onAssign: (to: string) => void; onNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(conv.notes || "");
  const [assignee, setAssignee] = useState(conv.assignedTo || "");
  return (
    <div className="fixed inset-0 z-[210] flex justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div className="relative w-full sm:max-w-md h-full bg-[#0a0518] border-l border-purple-500/20 shadow-2xl flex flex-col animate-[slideIn_0.25s_ease]">
        <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-purple-500/15">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{conv.userName || "Guest"}</div>
            <div className="text-[10px] text-purple-200/40">{conv.page} · {new Date(conv.startedAt).toLocaleString()}</div>
          </div>
          <button onClick={onClose} className="text-purple-200/50 hover:text-white p-1.5 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        {/* Controls */}
        <div className="shrink-0 p-3 border-b border-purple-500/10 space-y-2.5">
          <div className="flex gap-1.5">
            {(["active", "resolved", "escalated", "pending"] as ConvStatus[]).map((s) => (
              <button key={s} onClick={() => onStatus(s)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer ${
                  conv.status === s ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white" : "bg-black/40 border border-purple-500/15 text-purple-200/60 hover:text-white"
                }`}>{s}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} onBlur={() => onAssign(assignee)} placeholder="Assign to staff…"
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500" />
          </div>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-thin">
          {conv.messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`shrink-0 h-6 w-6 rounded-lg flex items-center justify-center ${m.role === "user" ? "bg-white/10" : "bg-gradient-to-tr from-purple-600 to-cyan-500"}`}>
                {m.role === "user" ? <User className="h-3.5 w-3.5 text-white" /> : <Bot className="h-3.5 w-3.5 text-white" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-gradient-to-r from-purple-600 to-cyan-600 text-white rounded-br-md" : "bg-white/5 border border-purple-500/15 text-purple-100 rounded-bl-md"}`}>{m.text}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="shrink-0 p-3 border-t border-purple-500/10">
          <span className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Admin notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onNotes(notes)} rows={2} placeholder="Add internal notes…"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 resize-none custom-scrollbar-thin" />
        </div>
      </div>
    </div>
  );
}
