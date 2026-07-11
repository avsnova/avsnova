import { useState, useEffect, useCallback, useRef } from "react";
import { ShieldCheck, KeyRound, Lock, Unlock, Loader2, AlertTriangle, Clock, ScrollText } from "lucide-react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";

/**
 * AuthCodePanel — Admin Authorization Code management (Super Admin only).
 * A second layer of protection for high-risk actions, SEPARATE from the login password.
 * Lets the Super Admin set / change / enable / disable the code, unlock a 5-minute
 * privileged session, and review the privileged-action audit trail.
 *
 * NOTE: the actual enforcement + auto-mask prompt used by other panels lives in the
 * exported `useAuthCodeGate` hook + `AuthCodeModal` below.
 */

type Status = {
  configured: boolean; enabled: boolean; updatedAt: string | null; updatedBy: string | null;
  privileged: boolean; privilegedSecondsLeft: number; locked: boolean; lockRemainingSec: number;
  sessionMinutes: number; autoMaskSeconds: number; highRiskActions: Record<string, string>;
};

export default function AuthCodePanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState<any[]>([]);
  // Form state
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [unlockCode, setUnlockCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiFetch("/api/admin/auth-code/status");
      setStatus(s);
      const a = await apiFetch("/api/admin/auth-code/audit?limit=50").catch(() => ({ rows: [] }));
      setAudit(a.rows || []);
    } catch (e: any) {
      toast(e.status === 403 ? "Authorization Code is Super-Admin only." : "Failed to load: " + e.message, "error");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Live countdown of the privileged window.
  const [secsLeft, setSecsLeft] = useState(0);
  useEffect(() => { setSecsLeft(status?.privilegedSecondsLeft || 0); }, [status]);
  useEffect(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secsLeft]);

  const setCode = async () => {
    if (!/^[A-Za-z0-9]{6,8}$/.test(newCode)) { toast("Code must be 6–8 letters/digits.", "error"); return; }
    if (newCode !== confirmCode) { toast("Codes do not match.", "error"); return; }
    setBusy(true);
    try {
      await apiFetch("/api/admin/auth-code/set", { method: "POST", body: JSON.stringify({ newCode, currentCode }) });
      toast(status?.configured ? "Authorization code changed." : "Authorization code set.", "success");
      setNewCode(""); setConfirmCode(""); setCurrentCode("");
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };

  const toggle = async (enabled: boolean) => {
    const code = prompt(`Enter the current authorization code to ${enabled ? "enable" : "disable"} it:`);
    if (code == null) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/auth-code/toggle", { method: "POST", body: JSON.stringify({ enabled, currentCode: code }) });
      toast(enabled ? "Enabled." : "Disabled.", "success");
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };

  const unlock = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/auth-code/unlock", { method: "POST", body: JSON.stringify({ code: unlockCode }) });
      toast(`Privileged access granted for ${Math.round((r.privilegedSecondsLeft || 300) / 60)} min.`, "success");
      setUnlockCode("");
      load();
    } catch (e: any) { toast(e.message, "error"); load(); }
    finally { setBusy(false); }
  };

  const lockNow = async () => {
    setBusy(true);
    try { await apiFetch("/api/admin/auth-code/lock", { method: "POST" }); toast("Privileged access ended.", "info"); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading…</div>;
  if (!status) return <div className="py-16 text-center text-purple-300/50 text-xs">Unavailable.</div>;

  const mm = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5 font-inter text-left">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-400" /> Admin Authorization Code</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">A second layer of protection for high-risk actions — separate from your login password. Stored hashed, never in plain text. Enforced on both the website and the Telegram bot.</p>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase text-purple-300/50 font-bold">Status</p>
          <p className={`text-sm font-bold mt-1 ${status.configured && status.enabled ? "text-emerald-400" : "text-purple-300/70"}`}>{!status.configured ? "Not set" : status.enabled ? "Enabled" : "Disabled"}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-purple-300/50 font-bold">Privileged now</p>
          <p className={`text-sm font-bold mt-1 flex items-center gap-1 ${secsLeft > 0 ? "text-emerald-400" : "text-purple-300/70"}`}>{secsLeft > 0 ? <><Unlock className="h-3.5 w-3.5" /> {mm(secsLeft)}</> : <><Lock className="h-3.5 w-3.5" /> Locked</>}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-purple-300/50 font-bold">Session</p>
          <p className="text-sm font-bold mt-1 text-white">{status.sessionMinutes} min <span className="text-[10px] text-purple-300/50">(sliding)</span></p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-purple-300/50 font-bold">Last updated</p>
          <p className="text-[11px] font-medium mt-1 text-purple-200/80">{status.updatedAt ? new Date(status.updatedAt).toLocaleString() : "—"}</p>
        </Card>
      </div>

      {status.locked && (
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" /> Too many wrong attempts — locked for ~{Math.ceil(status.lockRemainingSec / 60)} more minute(s).
        </div>
      )}

      {/* Set / change code */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-400" /> {status.configured ? "Change code" : "Set code"}</p>
        {status.configured && (
          <Input type="password" placeholder="Current code" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} maxLength={8} autoComplete="off" />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="password" placeholder="New code (6–8 letters/digits)" value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={8} autoComplete="off" />
          <Input type="password" placeholder="Confirm new code" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} maxLength={8} autoComplete="off" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={setCode} disabled={busy} className="bg-amber-500/90 hover:bg-amber-500 text-black">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : status.configured ? "Change code" : "Set code"}</Button>
          {status.configured && status.enabled && <Button onClick={() => toggle(false)} disabled={busy} variant="outline">Disable</Button>}
          {status.configured && !status.enabled && <Button onClick={() => toggle(true)} disabled={busy} variant="outline">Enable</Button>}
        </div>
        <p className="text-[11px] text-purple-300/40">The code is required for: {Object.values(status.highRiskActions).join(", ")}.</p>
      </Card>

      {/* Unlock privileged session */}
      {status.configured && status.enabled && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-bold text-white flex items-center gap-2"><Unlock className="h-4 w-4 text-emerald-400" /> Privileged session</p>
          {secsLeft > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-emerald-300 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Active — {mm(secsLeft)} left (extends with each action)</span>
              <Button onClick={lockNow} disabled={busy} variant="outline" size="sm">Lock now</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="password" placeholder="Enter code to unlock" value={unlockCode} onChange={(e) => setUnlockCode(e.target.value)} maxLength={8} autoComplete="off" className="max-w-[220px]" onKeyDown={(e) => e.key === "Enter" && unlock()} />
              <Button onClick={unlock} disabled={busy || !unlockCode} className="bg-emerald-500/90 hover:bg-emerald-500 text-black">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}</Button>
            </div>
          )}
        </Card>
      )}

      {/* Audit trail */}
      <Card className="p-4">
        <p className="text-sm font-bold text-white flex items-center gap-2 mb-3"><ScrollText className="h-4 w-4 text-cyan-400" /> Privileged action log</p>
        <div className="max-h-72 overflow-auto rounded-lg border border-white/5">
          <table className="w-full text-[11px]">
            <thead className="text-purple-300/50 sticky top-0 bg-[#1a1030]">
              <tr><th className="text-left px-2 py-1.5">Time</th><th className="text-left px-2 py-1.5">Who</th><th className="text-left px-2 py-1.5">Ch</th><th className="text-left px-2 py-1.5">Action</th><th className="text-left px-2 py-1.5">Detail</th><th className="text-left px-2 py-1.5">Result</th></tr>
            </thead>
            <tbody>
              {audit.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-purple-300/40 py-6">No privileged actions recorded yet.</td></tr>
              ) : audit.map((r, i) => (
                <tr key={i} className="border-t border-white/5 text-purple-200/80">
                  <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-2 py-1.5">{r.actor_name}</td>
                  <td className="px-2 py-1.5">{r.channel === "telegram" ? "TG" : "web"}</td>
                  <td className="px-2 py-1.5">{r.action}</td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate" title={r.detail}>{r.detail}</td>
                  <td className={`px-2 py-1.5 font-bold ${r.status === "ok" ? "text-emerald-400" : r.status === "denied" || r.status === "locked" || r.status === "blocked" ? "text-red-400" : "text-purple-300/60"}`}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * AuthCodeModal — a lightweight on-demand unlock dialog other panels can render when a
 * high-risk call returns 401 authCodeRequired. Resolves via onUnlocked().
 */
export function AuthCodeModal({ open, action, onClose, onUnlocked }: { open: boolean; action?: string; onClose: () => void; onUnlocked: () => void; }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setCode(""); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);
  if (!open) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/admin/auth-code/unlock", { method: "POST", body: JSON.stringify({ code }) });
      toast("Access granted.", "success");
      onUnlocked();
      onClose();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1a1030] border border-amber-500/30 rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold text-white flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4 text-amber-400" /> Authorization required</p>
        <p className="text-xs text-purple-200/60 mb-3">This is a high-risk action{action ? ` (${action.replace(/_/g, " ")})` : ""}. Enter your Admin Authorization Code to continue.</p>
        <Input ref={inputRef} type="password" placeholder="Authorization code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoComplete="off" onKeyDown={(e) => e.key === "Enter" && code && submit()} />
        <div className="flex items-center gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !code} onClick={submit} className="bg-amber-500/90 hover:bg-amber-500 text-black">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}</Button>
        </div>
      </div>
    </div>
  );
}
