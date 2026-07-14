import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { RefreshCw, Mail, Send, Star, Trash2, Plus, X } from "lucide-react";

// ——— Refunds module (Item 10) ———
export function RefundsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/refunds"); setRows(r.refunds || []); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/admin/refunds/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast(status === "completed" ? "Refund completed & wallet credited." : "Refund status updated.", "success");
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space">Refunds</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Track refund requests and progress. Marking a refund <b>Completed</b> credits the customer's wallet once.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>
      {loading ? <div className="py-10 text-center text-purple-200/40">Loading…</div> : rows.length === 0 ? (
        <div className="py-10 text-center text-purple-200/40 italic">No refunds recorded.</div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead><tr className="border-b border-purple-500/15 text-[10px] font-bold text-purple-200/40 uppercase tracking-wider font-space">
              <th className="py-3 px-3">Order</th><th className="py-3 px-3">Customer</th><th className="py-3 px-3">Amount</th><th className="py-3 px-3">Reason</th><th className="py-3 px-3">Status</th><th className="py-3 px-3 text-right">Set Status</th>
            </tr></thead>
            <tbody className="divide-y divide-purple-500/10 text-xs">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="py-3 px-3 font-mono text-cyan-400">{r.order_id || "—"}</td>
                  <td className="py-3 px-3"><div className="text-white font-bold">{r.customer_name || "—"}</div><div className="text-[10px] text-purple-200/40">{r.customer_email}</div></td>
                  <td className="py-3 px-3 font-mono text-emerald-400">₦{Number(r.amount || 0).toLocaleString()}</td>
                  <td className="py-3 px-3 text-purple-200/70 max-w-[200px] truncate">{r.reason || "—"}</td>
                  <td className="py-3 px-3"><Badge variant={r.status === "completed" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{String(r.status).toUpperCase()}</Badge></td>
                  <td className="py-3 px-3 text-right">
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="bg-black/40 border border-purple-500/20 text-[11px] text-white px-2 py-1 rounded-lg focus:outline-none">
                      {["pending", "approved", "processing", "completed", "rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ——— Customer Reports / Product Support (Item 10) ———
export function ReportsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState<any | null>(null);
  const [replyMsg, setReplyMsg] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/reports"); setRows(r.reports || []); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string) => {
    try { await apiFetch(`/api/admin/reports/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const sendReply = async () => {
    if (!replyMsg.trim()) { toast("Write a reply first.", "warning"); return; }
    setSending(true);
    try {
      const r = await apiFetch(`/api/admin/reports/${reply.id}/reply`, { method: "POST", body: JSON.stringify({ message: replyMsg }) });
      if (r.success) { toast(`Reply emailed to ${r.to}.`, "success", { big: true }); setReply(null); setReplyMsg(""); load(); }
      else toast(r.error || "Failed to send.", "error");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSending(false); }
  };
  const copyOne = async (r: any) => { const ok = await copyToClipboard(`Subject: ${r.subject}\nFrom: ${r.customer_email}\nOrder: ${r.order_id || "-"}\n\n${r.message}`); if (ok) toast("Report copied.", "success", { silent: true }); };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space">Customer Reports & Product Support</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Handle customer reports and support tickets. Reply sends an email directly to the customer.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>
      {loading ? <div className="py-10 text-center text-purple-200/40">Loading…</div> : rows.length === 0 ? (
        <div className="py-10 text-center text-purple-200/40 italic">No reports yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="p-4 rounded-xl border border-purple-500/10 bg-black/25 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-sm font-bold text-white">{r.subject || "Support request"}</span>
                  <div className="text-[10px] text-purple-200/40">{r.user_name || r.customer_name} · {r.user_email || r.customer_email} {r.order_id ? `· order ${r.order_id}` : ""} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.status === "resolved" || r.status === "closed" ? "success" : "warning"}>{String(r.status).toUpperCase()}</Badge>
                  <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="bg-black/40 border border-purple-500/20 text-[10px] text-white px-2 py-1 rounded-lg focus:outline-none">
                    {["open", "in_progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => copyOne(r)} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 cursor-pointer" title="Copy"><Send className="h-3.5 w-3.5 rotate-45" /></button>
                  <button onClick={() => { setReply(r); setReplyMsg(""); }} className="p-1.5 rounded-lg bg-purple-500/10 text-purple-300 cursor-pointer" title="Reply by email"><Mail className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="text-xs text-purple-100/90 bg-black/30 rounded-lg p-2 border border-purple-500/5">{r.message}</p>
              {r.admin_reply && <p className="text-[11px] text-emerald-300/80"><b>Your reply:</b> {r.admin_reply}</p>}
            </div>
          ))}
        </div>
      )}

      {reply && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !sending && setReply(null)} />
          <div className="relative w-full max-w-lg bg-[#0e0922] border border-purple-500/30 rounded-2xl p-5 shadow-2xl z-10 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold font-space text-white flex items-center gap-2"><Mail className="h-4 w-4 text-purple-300" /> Reply to {reply.customer_email || reply.user_email}</h3><button onClick={() => !sending && setReply(null)} className="text-purple-200/40 hover:text-white p-1 cursor-pointer"><X className="h-4 w-4" /></button></div>
            <div className="text-[11px] text-purple-200/50 bg-black/30 rounded-lg p-2 border border-purple-500/5">Re: {reply.subject}</div>
            <textarea value={replyMsg} onChange={(e) => setReplyMsg(e.target.value)} rows={6} placeholder="Type your reply — emailed directly to the customer." className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none placeholder-purple-200/20" />
            <div className="flex gap-2"><Button onClick={sendReply} isLoading={sending} className="flex-1 flex items-center justify-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send Reply</Button><Button variant="outline" onClick={() => setReply(null)} className="flex-1">Cancel</Button></div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ——— Customer Feedback (Item 10) ———
// ——— Feedback popup configuration (admin-controlled) ———
export function FeedbackConfigPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/feedback-config"); setCfg(r.config); }
    catch (e: any) { toast("Failed to load feedback config: " + e.message, "error"); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: any) => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/admin/feedback-config", { method: "POST", body: JSON.stringify(patch) });
      if (r.config) setCfg(r.config);
      toast("Feedback settings saved.", "success");
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  if (!cfg) return <Card className="p-4"><div className="py-6 text-center text-purple-200/40 text-xs">Loading feedback settings…</div></Card>;

  const inp = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500/40";
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space">Feedback Popup Settings</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Control the post-success feedback popup. It only appears after a customer successfully receives an SMS code.</p>
        </div>
        <button onClick={() => save({ enabled: !cfg.enabled })} disabled={saving}
          className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer ${cfg.enabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-neutral-600/30 text-neutral-400 border border-white/10"}`}>
          {cfg.enabled ? "ENABLED" : "DISABLED"}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Appearance delay (seconds)</label>
          <input type="number" min={0} max={120} defaultValue={cfg.delaySeconds} onBlur={(e) => save({ delaySeconds: parseInt(e.target.value) || 0 })} className={inp} />
          <p className="text-[9px] text-white/30">Wait this long after a code is received before showing the popup.</p>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Auto-dismiss timeout (seconds)</label>
          <input type="number" min={0} max={600} defaultValue={cfg.timeoutSeconds} onBlur={(e) => save({ timeoutSeconds: parseInt(e.target.value) || 0 })} className={inp} />
          <p className="text-[9px] text-white/30">Auto-close after N seconds. 0 = stays until the customer acts.</p>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Feedback requirement</label>
          <select value={cfg.required ? "1" : "0"} onChange={(e) => save({ required: e.target.value === "1" })} className={inp}>
            <option value="0">Optional (customer can dismiss)</option>
            <option value="1">Required (must submit a rating)</option>
          </select>
          <p className="text-[9px] text-white/30">Required hides the close button and disables auto-dismiss.</p>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-purple-200/60 uppercase tracking-wide">Popup position</label>
          <select value={cfg.position} onChange={(e) => save({ position: e.target.value })} className={inp}>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="center">Center</option>
          </select>
          <p className="text-[9px] text-white/30">Where the popup renders on the customer's screen.</p>
        </div>
      </div>
    </Card>
  );
}

export function FeedbackPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [avg, setAvg] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/feedback"); setRows(r.feedback || []); setAvg(r.average); setCount(r.count || 0); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
    <FeedbackConfigPanel />
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-space">Customer Feedback</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Post-purchase feedback from customers. {count} responses{avg ? ` · avg ${avg}★` : ""}.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>
      {loading ? <div className="py-10 text-center text-purple-200/40">Loading…</div> : rows.length === 0 ? (
        <div className="py-10 text-center text-purple-200/40 italic">No feedback yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <div key={f.id} className="p-3 rounded-xl border border-purple-500/10 bg-black/25 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? "text-amber-400 fill-amber-400" : "text-purple-500/30"}`} />)}
                </div>
                {f.comment && <p className="text-xs text-purple-100/90">{f.comment}</p>}
                <div className="text-[10px] text-purple-200/40 mt-0.5">{f.user_name || "Customer"} · {f.user_email || ""} {f.order_id ? `· order ${f.order_id}` : ""}</div>
              </div>
              <span className="text-[10px] font-mono text-purple-200/30 shrink-0">{f.created_at ? new Date(f.created_at).toLocaleDateString() : ""}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
    </div>
  );
}

// ——— Custom Settings (Item 9/10) ———
export function CustomSettingsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ label: "", skey: "", stype: "toggle", svalue: "1" });
  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/custom-settings"); setRows(r.settings || []); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.label.trim()) { toast("Label is required.", "warning"); return; }
    const skey = form.skey.trim() || form.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    try { await apiFetch("/api/admin/custom-settings", { method: "POST", body: JSON.stringify({ ...form, skey }) }); toast("Custom setting saved.", "success"); setForm({ label: "", skey: "", stype: "toggle", svalue: "1" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const toggle = async (s: any) => {
    try { await apiFetch("/api/admin/custom-settings", { method: "POST", body: JSON.stringify({ skey: s.skey, label: s.label, stype: s.stype, svalue: s.svalue === "1" ? "0" : "1" }) }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const del = async (id: number) => {
    try { await apiFetch(`/api/admin/custom-settings/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-white font-space">Custom Settings</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">Add your own toggles/values. New settings default <b>ON</b>.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]"><Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Show promo banner" /></div>
        <div className="w-32">
          <label className="text-xs font-bold text-purple-200/70 block font-space mb-1.5">Type</label>
          <select value={form.stype} onChange={(e) => setForm({ ...form, stype: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none">
            <option value="toggle">Toggle</option><option value="text">Text</option><option value="number">Number</option>
          </select>
        </div>
        {form.stype !== "toggle" && <div className="w-32"><Input label="Value" value={form.svalue} onChange={(e) => setForm({ ...form, svalue: e.target.value })} /></div>}
        <Button onClick={save} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {rows.length === 0 ? <div className="py-6 text-center text-purple-200/30 italic text-xs">No custom settings yet.</div> : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-purple-500/5">
              <div><span className="text-sm font-bold text-white">{s.label}</span><div className="text-[9px] text-purple-200/40 uppercase font-mono">{s.skey} · {s.stype}</div></div>
              <div className="flex items-center gap-2">
                {s.stype === "toggle" ? (
                  <button onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${s.svalue === "1" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-black/40 text-purple-300/50 border border-purple-500/20"}`}>{s.svalue === "1" ? "ON" : "OFF"}</button>
                ) : <span className="text-xs text-purple-100 font-mono">{s.svalue}</span>}
                <button onClick={() => del(s.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
