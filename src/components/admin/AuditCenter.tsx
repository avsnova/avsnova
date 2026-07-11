import { useState, useEffect, useCallback } from "react";
import { History, Search, ChevronLeft, ChevronRight, Loader2, Download } from "lucide-react";
import { Card } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch, getApiBaseUrl, getSessionToken } from "../../utils/api";

/**
 * AuditCenter — centralized, searchable, paginated activity log.
 * Backed by /api/admin/audit-center. Every important action across the platform
 * (product edits, credential imports, sales, refunds, logins, settings changes)
 * flows through logAuditAction on the server and appears here.
 */

interface Row { id: number; user_id: number; username: string; action: string; ip_address: string; created_at: string; }

export default function AuditCenter() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(page));
      const res = await apiFetch(`/api/admin/audit-center?${params.toString()}`);
      setRows(res.rows || []); setTotal(res.total || 0); setTotalPages(res.totalPages || 1);
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [q, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  const exportCsv = () => {
    const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = ["id", "username", "action", "ip_address", "created_at"];
    const lines = [header.join(","), ...rows.map((r) => header.map((h) => esc((r as any)[h])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "audit-log.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const timeAgo = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  return (
    <Card className="space-y-4 border border-purple-500/10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-white"><History className="h-4.5 w-4.5 text-cyan-400" /><h3 className="text-sm sm:text-base font-bold font-space">Activity & Audit Center</h3></div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/50" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setQ(qInput); }} placeholder="Search action or user…" className="bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-xl focus:outline-none" />
          </div>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-purple-500/25 text-[11px] font-bold text-purple-200 flex items-center gap-1 cursor-pointer"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-purple-500/10">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-black/30 text-[10px] uppercase tracking-wider text-purple-300/60 font-space">
            <th className="p-2.5">User</th><th className="p-2.5">Action</th><th className="p-2.5 hidden md:table-cell">IP</th><th className="p-2.5 text-right">When</th>
          </tr></thead>
          <tbody className="divide-y divide-purple-500/5">
            {loading ? <tr><td colSpan={4} className="p-8 text-center text-purple-300/50"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-purple-300/50">No activity found.</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="p-2.5 font-bold text-white">{r.username}</td>
                  <td className="p-2.5 text-purple-200/80">{r.action}</td>
                  <td className="p-2.5 hidden md:table-cell font-mono text-purple-300/50">{r.ip_address}</td>
                  <td className="p-2.5 text-right text-purple-300/50 whitespace-nowrap">{timeAgo(r.created_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[11px] text-purple-300/60">
        <span>{total} event(s)</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </Card>
  );
}
