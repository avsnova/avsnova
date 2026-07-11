import { useState, useEffect, useCallback } from "react";
import {
  Mail, Inbox, Server, Plus, Trash2, Save, Loader2, CheckCircle2, XCircle, Send, Search,
  Power, Settings2, Activity, Edit, RefreshCw, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { apiFetch } from "../../utils/api";

/**
 * EmailCenterAdmin — Security Center Phase 2 admin hub.
 * Sub-tabs: Global Settings (SMTP/IMAP fix + test) · Providers · Mailboxes · Activity.
 * Nothing is hardcoded — every provider/mailbox setting is DB-managed here, so the
 * development mailbox can be swapped for another entirely from this dashboard.
 */

type SubTab = "settings" | "providers" | "aliases" | "mailboxes" | "activity";

export default function EmailCenterAdmin() {
  const [sub, setSub] = useState<SubTab>("settings");
  const [dashboard, setDashboard] = useState<any>(null);
  const loadDash = useCallback(async () => {
    try { const r = await apiFetch("/api/admin/email/dashboard"); setDashboard(r); } catch (e) { /* silent */ }
  }, []);
  useEffect(() => { loadDash(); }, [loadDash]);

  const tabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "settings", label: "Global SMTP/IMAP", icon: <Settings2 className="h-3.5 w-3.5" /> },
    { id: "providers", label: "Connections", icon: <Server className="h-3.5 w-3.5" /> },
    { id: "aliases", label: "SMTP Aliases", icon: <Mail className="h-3.5 w-3.5" /> },
    { id: "mailboxes", label: "Mailboxes", icon: <Inbox className="h-3.5 w-3.5" /> },
    { id: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi icon={<Inbox className="h-4 w-4" />} label="Mailboxes" value={dashboard?.stats?.mailboxes ?? 0} tone="text-cyan-300" />
        <MiniKpi icon={<CheckCircle2 className="h-4 w-4" />} label="Credentials Using Email" value={dashboard?.stats?.credsUsingEmail ?? 0} tone="text-emerald-300" />
        <MiniKpi icon={<Mail className="h-4 w-4" />} label="Codes Retrieved Today" value={dashboard?.stats?.retrievedToday ?? 0} tone="text-purple-300" />
        <MiniKpi icon={<AlertTriangle className="h-4 w-4" />} label="Failed Today" value={dashboard?.stats?.failedToday ?? 0} tone="text-amber-300" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 cursor-pointer ${sub === t.id ? "bg-cyan-500/20 text-white border border-cyan-500/30" : "bg-black/20 text-purple-300/60 border border-transparent hover:text-purple-200"}`}>{t.icon}{t.label}</button>
        ))}
      </div>

      {sub === "settings" && <GlobalEmailSettings />}
      {sub === "providers" && <ProvidersManager />}
      {sub === "aliases" && <AliasesManager />}
      {sub === "mailboxes" && <MailboxesManager onChange={loadDash} />}
      {sub === "activity" && <ActivityFeed dashboard={dashboard} onReload={loadDash} />}
    </div>
  );
}

function MiniKpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-purple-300/60 text-[10px] font-space uppercase tracking-wide">{icon}{label}</div>
      <div className={`text-xl font-bold font-space mt-1 ${tone}`}>{Number(value).toLocaleString()}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global SMTP/IMAP settings (Phase 1 fix + Test tools).
// ---------------------------------------------------------------------------
function GlobalEmailSettings() {
  const { toast } = useToast();
  const [s, setS] = useState<any>({});
  const [hasPass, setHasPass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ imap?: { ok: boolean; error?: string | null; mailboxExists?: number | null }; smtp?: { ok: boolean; error?: string | null } } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/email/settings"); setS(r.settings || {}); setHasPass(!!r.settings?.has_smtp_pass); }
    catch (e: any) { toast("Failed to load settings: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        smtp_host: s.smtp_host || "", smtp_port: parseInt(s.smtp_port) || 465, smtp_user: s.smtp_user || "",
        smtp_from: s.smtp_from || "", smtp_secure: s.smtp_secure ? 1 : 0, smtp_sender_name: s.smtp_sender_name || "",
        imap_host: s.imap_host || "", imap_port: parseInt(s.imap_port) || 993, imap_secure: s.imap_secure ? 1 : 0,
        pop3_host: s.pop3_host || "", pop3_port: parseInt(s.pop3_port) || 995, pop3_secure: s.pop3_secure ? 1 : 0,
        email_enabled: s.email_enabled === 0 ? 0 : 1, email_default_max_age: parseInt(s.email_default_max_age) || 600,
      };
      if (s.smtp_pass && s.smtp_pass.trim()) payload.smtp_pass = s.smtp_pass;
      await apiFetch("/api/admin/email/settings", { method: "PATCH", body: JSON.stringify(payload) });
      toast("Email settings saved.", "success"); set("smtp_pass", ""); load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const test = async (kind: "connection" | "imap" | "smtp" | "send") => {
    setTesting(kind);
    if (kind === "connection") setTestResult(null);
    try {
      if (kind === "connection") {
        const r = await apiFetch("/api/admin/email/settings/test-connection", { method: "POST" });
        setTestResult({ imap: r.imap, smtp: r.smtp });
        toast(r.success ? "Connection OK ✅ (IMAP + SMTP)" : "One or more checks failed — see details below.", r.success ? "success" : "error", { big: r.success });
      } else if (kind === "imap") {
        const r = await apiFetch("/api/admin/email/settings/test-imap", { method: "POST" });
        toast(r.success ? `IMAP OK ✅${r.mailboxExists != null ? ` (${r.mailboxExists} messages)` : ""}` : "IMAP failed: " + r.error, r.success ? "success" : "error", { big: !r.success });
      } else if (kind === "smtp") {
        const r = await apiFetch("/api/admin/email/settings/test-smtp", { method: "POST" });
        toast(r.success ? "SMTP connection OK ✅" : "SMTP failed: " + r.error, r.success ? "success" : "error", { big: !r.success });
      } else {
        const r = await apiFetch("/api/admin/email/settings/send-test", { method: "POST", body: JSON.stringify({ to: testTo || undefined }) });
        toast(r.success ? `Test email sent (${r.method}) ✅` : "Send failed: " + r.error, r.success ? "success" : "error", { big: !r.success });
      }
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setTesting(null); }
  };

  if (loading) return <Loading />;

  return (
    <Card className="border border-purple-500/10 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold font-space text-white flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-400" /> Email Settings — SMTP / IMAP / POP3</h4>
        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70">
          <input type="checkbox" checked={s.email_enabled !== 0} onChange={(e) => set("email_enabled", e.target.checked ? 1 : 0)} className="accent-cyan-500" />
          <Power className="h-3.5 w-3.5" /> Email sending {s.email_enabled !== 0 ? "enabled" : "disabled"}
        </label>
      </div>
      <p className="text-[11px] text-purple-300/50">These credentials power all outgoing platform email (OTP, order, payment). They are also the fallback for mailbox verification. Passwords are stored encrypted.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="SMTP Host" value={s.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="mail.spacemail.com" />
        <Input label="SMTP Port" type="number" value={s.smtp_port || ""} onChange={(e) => set("smtp_port", e.target.value)} placeholder="587" />
        <Input label="SMTP Username" value={s.smtp_user || ""} onChange={(e) => set("smtp_user", e.target.value)} placeholder="hello@domain.com" />
        <PasswordField label={`SMTP Password ${hasPass ? "(saved — leave blank to keep)" : ""}`} value={s.smtp_pass || ""} onChange={(v) => set("smtp_pass", v)} placeholder={hasPass ? "••••••••" : "app password"} />
        <Input label="Sender Name" value={s.smtp_sender_name || ""} onChange={(e) => set("smtp_sender_name", e.target.value)} placeholder="Aurevashop Support" />
        <Input label="From Address (full)" value={s.smtp_from || ""} onChange={(e) => set("smtp_from", e.target.value)} placeholder='"Aurevashop" <hello@domain.com>' />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70">
        <input type="checkbox" checked={!!s.smtp_secure} onChange={(e) => set("smtp_secure", e.target.checked ? 1 : 0)} className="accent-cyan-500" /> SMTP uses implicit SSL/TLS (port 465). Leave off for STARTTLS (587).
      </label>

      <div className="border-t border-purple-500/10 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="IMAP Host (incoming)" value={s.imap_host || ""} onChange={(e) => set("imap_host", e.target.value)} placeholder="mail.spacemail.com" />
        <Input label="IMAP Port" type="number" value={s.imap_port || ""} onChange={(e) => set("imap_port", e.target.value)} placeholder="993" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70">
        <input type="checkbox" checked={s.imap_secure !== 0} onChange={(e) => set("imap_secure", e.target.checked ? 1 : 0)} className="accent-cyan-500" /> IMAP uses SSL/TLS (port 993)
      </label>

      <div className="border-t border-purple-500/10 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="POP3 Host (optional incoming)" value={s.pop3_host || ""} onChange={(e) => set("pop3_host", e.target.value)} placeholder="mail.spacemail.com" />
        <Input label="POP3 Port" type="number" value={s.pop3_port || ""} onChange={(e) => set("pop3_port", e.target.value)} placeholder="995" />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70">
          <input type="checkbox" checked={s.pop3_secure !== 0} onChange={(e) => set("pop3_secure", e.target.checked ? 1 : 0)} className="accent-cyan-500" /> POP3 uses SSL/TLS (port 995)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-purple-200/70">Default max email age (sec)</span>
          <input type="number" value={s.email_default_max_age || 600} onChange={(e) => set("email_default_max_age", e.target.value)} className="w-24 bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-1.5 rounded-xl focus:outline-none" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap border-t border-purple-500/10 pt-3">
        <Button onClick={save} isLoading={saving} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save Settings</Button>
        <button onClick={() => test("connection")} disabled={testing !== null} className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">{testing === "connection" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Test Connection</button>
        <button onClick={() => test("imap")} disabled={testing !== null} className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">{testing === "imap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />} Test IMAP</button>
        <button onClick={() => test("smtp")} disabled={testing !== null} className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">{testing === "smtp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />} Test SMTP</button>
        <div className="flex items-center gap-1">
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="test recipient (optional)" className="w-48 bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none" />
          <button onClick={() => test("send")} disabled={testing !== null} className="px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-xs font-bold text-purple-200 hover:bg-purple-500/25 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">{testing === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send Test Email</button>
        </div>
      </div>

      {testResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ProtoResult label="IMAP (incoming)" ok={testResult.imap?.ok} error={testResult.imap?.error} extra={testResult.imap?.ok && testResult.imap?.mailboxExists != null ? `${testResult.imap.mailboxExists} messages in INBOX` : undefined} />
          <ProtoResult label="SMTP (outgoing)" ok={testResult.smtp?.ok} error={testResult.smtp?.error} extra={testResult.smtp?.ok ? "Authentication succeeded" : undefined} />
        </div>
      )}
    </Card>
  );
}

function ProtoResult({ label, ok, error, extra }: { label: string; ok?: boolean; error?: string | null; extra?: string }) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5"}`}>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
        <span className={ok ? "text-emerald-200" : "text-red-200"}>{label}: {ok ? "OK" : "Failed"}</span>
      </div>
      {ok && extra && <p className="text-[11px] text-emerald-300/60 mt-1">{extra}</p>}
      {!ok && error && <p className="text-[11px] text-red-300/70 mt-1 leading-relaxed">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
const emptyProvider = { name: "", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 587, username: "", password: "", use_ssl: true, sender_name: "", sender_email: "", enabled: true };

function ProvidersManager() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/email/providers"); setRows(r.providers || []); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const [verifying, setVerifying] = useState<number | null>(null);

  const del = async (id: number) => {
    if (!(await confirm({ title: "Delete provider?", message: "This provider profile will be removed. Mailboxes already created from it are unaffected.", danger: true, confirmLabel: "Delete" }))) return;
    try { await apiFetch(`/api/admin/email/providers/${id}`, { method: "DELETE" }); toast("Provider deleted.", "success"); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  // Real-time OTP verification: sends a live test email through the connection and reads
  // it back via IMAP, then marks the connection verified/publishable.
  const verify = async (id: number) => {
    setVerifying(id);
    toast("Sending a real test email and waiting for it to arrive… this can take ~20s.", "info");
    try {
      const r = await apiFetch(`/api/admin/email/providers/${id}/verify`, { method: "POST" });
      if (r.success && r.verified) toast("✅ " + (r.message || "Connection verified — you can publish it."), "success", { big: true });
      else toast("❌ Verification failed" + (r.stage ? ` at ${r.stage.toUpperCase()}` : "") + ": " + (r.error || "unknown error"), "error");
    } catch (e: any) { toast("Verification error: " + e.message, "error"); }
    finally { setVerifying(null); load(); }
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-purple-300/50">Email connections. Use <b>Verify</b> to run a real-time OTP round-trip (send + receive) before publishing a connection.</p>
        <Button onClick={() => setEditing({ ...emptyProvider })} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New Connection</Button>
      </div>
      {rows.length === 0 ? <EmptyState text="No connections yet. Create one to speed up mailbox setup." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((p) => (
            <div key={p.id} className="rounded-xl border border-purple-500/10 bg-black/20 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-cyan-400" /> {p.name}</span>
                <div className="flex items-center gap-1">
                  <IconBtn title="Edit" onClick={() => setEditing({ ...p, password: "" })}><Edit className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn title="Delete" onClick={() => del(p.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
              <div className="text-[11px] text-purple-300/50">IMAP {p.imap_host || "—"}:{p.imap_port} · SMTP {p.smtp_host || "—"}:{p.smtp_port}</div>
              <div className="text-[11px] text-purple-300/40">{p.username || "no username"} {p.has_password ? "· 🔑 saved" : ""} {p.enabled ? "" : "· disabled"}</div>
              <div className="flex items-center justify-between pt-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${p.verified ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : p.verify_status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                  {p.verified ? "✓ Verified" : p.verify_status === "failed" ? "✗ Failed" : "Unverified"}
                </span>
                <button onClick={() => verify(p.id)} disabled={verifying === p.id} className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">
                  {verifying === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} {verifying === p.id ? "Testing…" : "Verify (real-time OTP)"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <ProviderModal provider={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ProviderModal({ provider, onClose, onSaved }: { provider: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>(provider);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name) { toast("Provider name is required.", "error"); return; }
    setSaving(true);
    try {
      if (f.id) await apiFetch(`/api/admin/email/providers/${f.id}`, { method: "PUT", body: JSON.stringify(f) });
      else await apiFetch("/api/admin/email/providers", { method: "POST", body: JSON.stringify(f) });
      toast("Provider saved.", "success"); onSaved();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };
  return (
    <Overlay title={f.id ? "Edit Provider" : "New Provider"} onClose={onClose}>
      <div className="space-y-3">
        <Input label="Provider Name" value={f.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Spacemail / Gmail / Zoho…" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="IMAP Host" value={f.imap_host || ""} onChange={(e) => set("imap_host", e.target.value)} placeholder="imap.host.com" />
          <Input label="IMAP Port" type="number" value={f.imap_port || ""} onChange={(e) => set("imap_port", e.target.value)} />
          <Input label="SMTP Host" value={f.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.host.com" />
          <Input label="SMTP Port" type="number" value={f.smtp_port || ""} onChange={(e) => set("smtp_port", e.target.value)} />
          <Input label="Username" value={f.username || ""} onChange={(e) => set("username", e.target.value)} />
          <PasswordField label={`Password ${f.has_password ? "(leave blank to keep)" : ""}`} value={f.password || ""} onChange={(v) => set("password", v)} />
          <Input label="Sender Name" value={f.sender_name || ""} onChange={(e) => set("sender_name", e.target.value)} />
          <Input label="Sender Email" value={f.sender_email || ""} onChange={(e) => set("sender_email", e.target.value)} />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={!!f.use_ssl} onChange={(e) => set("use_ssl", e.target.checked)} className="accent-cyan-500" /> Use SSL/TLS</label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={f.enabled !== false} onChange={(e) => set("enabled", e.target.checked)} className="accent-cyan-500" /> Enabled</label>
        </div>
        <Button onClick={save} isLoading={saving} className="w-full">{f.id ? "Save Changes" : "Create Provider"}</Button>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------------
const emptyMailbox = { name: "", email_address: "", provider_id: "", imap_host: "", imap_port: 993, imap_secure: true, smtp_host: "", smtp_port: 587, smtp_secure: false, username: "", password: "", sender_name: "", sender_email: "", enabled: true };

function MailboxesManager({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [searchFor, setSearchFor] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([apiFetch("/api/admin/email/mailboxes"), apiFetch("/api/admin/email/providers")]);
      setRows(r.mailboxes || []); setProviders(p.providers || []);
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const runTest = async (id: number, kind: "test-imap" | "test-smtp" | "send-test") => {
    setTestingId(id);
    try {
      const r = await apiFetch(`/api/admin/email/mailboxes/${id}/${kind}`, { method: "POST", body: JSON.stringify({}) });
      const label = kind === "test-imap" ? "IMAP" : kind === "test-smtp" ? "SMTP" : "Send";
      toast(r.success ? `${label} OK ✅${r.mailboxExists != null ? ` (${r.mailboxExists} messages)` : ""}${r.to ? ` → ${r.to}` : ""}` : `${label} failed: ${r.error}`, r.success ? "success" : "error", { big: !r.success });
      load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setTestingId(null); }
  };

  const del = async (id: number) => {
    if (!(await confirm({ title: "Delete mailbox?", message: "The mailbox will be removed. This is blocked if credentials still use it.", danger: true, confirmLabel: "Delete" }))) return;
    try { await apiFetch(`/api/admin/email/mailboxes/${id}`, { method: "DELETE" }); toast("Mailbox deleted.", "success"); load(); onChange(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-purple-300/50">Each mailbox is one email account the system can read (IMAP) and send from (SMTP). Swap the development mailbox for any other here — no code changes.</p>
        <Button onClick={() => setEditing({ ...emptyMailbox })} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New Mailbox</Button>
      </div>
      {rows.length === 0 ? <EmptyState text="No mailboxes yet. Add one to enable email verification." /> : (
        <div className="space-y-2">
          {rows.map((m) => (
            <div key={m.id} className="rounded-xl border border-purple-500/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-sm font-bold text-white flex items-center gap-1.5"><Inbox className="h-3.5 w-3.5 text-cyan-400" /> {m.name} <StatusPill status={m.status} enabled={m.enabled} /></span>
                  <div className="text-[11px] text-purple-300/50 mt-0.5">{m.email_masked || "—"} · IMAP {m.imap_host || "—"}:{m.imap_port} · SMTP {m.smtp_host || "—"}:{m.smtp_port}</div>
                  {m.last_error && <div className="text-[10px] text-red-300/70 mt-0.5 truncate max-w-md">⚠ {m.last_error}</div>}
                  {m.last_sync && <div className="text-[10px] text-emerald-300/50 mt-0.5">Last OK: {new Date(m.last_sync).toLocaleString()}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn title="Edit" onClick={() => setEditing({ ...m, password: "", provider_id: m.provider_id || "" })}><Edit className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn title="Delete" onClick={() => del(m.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <TestBtn label="Test IMAP" onClick={() => runTest(m.id, "test-imap")} busy={testingId === m.id} icon={<Server className="h-3 w-3" />} />
                <TestBtn label="Test SMTP" onClick={() => runTest(m.id, "test-smtp")} busy={testingId === m.id} icon={<Send className="h-3 w-3" />} />
                <TestBtn label="Send Test Email" onClick={() => runTest(m.id, "send-test")} busy={testingId === m.id} icon={<Mail className="h-3 w-3" />} />
                <TestBtn label="Search Test" onClick={() => setSearchFor(m)} busy={false} icon={<Search className="h-3 w-3" />} />
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <MailboxModal mailbox={editing} providers={providers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChange(); }} />}
      {searchFor && <SearchTestModal mailbox={searchFor} onClose={() => setSearchFor(null)} />}
    </div>
  );
}

function MailboxModal({ mailbox, providers, onClose, onSaved }: { mailbox: any; providers: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>(mailbox);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const applyProvider = (pid: string) => {
    set("provider_id", pid);
    const p = providers.find((x) => String(x.id) === String(pid));
    if (p) setF((prev: any) => ({ ...prev, provider_id: pid, imap_host: p.imap_host, imap_port: p.imap_port, smtp_host: p.smtp_host, smtp_port: p.smtp_port, imap_secure: !!p.use_ssl, smtp_secure: p.smtp_port === 465, sender_name: prev.sender_name || p.sender_name, sender_email: prev.sender_email || p.sender_email }));
  };

  const save = async () => {
    if (!f.name) { toast("Mailbox name is required.", "error"); return; }
    setSaving(true);
    try {
      const payload = { ...f, provider_id: f.provider_id || null };
      if (f.id) await apiFetch(`/api/admin/email/mailboxes/${f.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/api/admin/email/mailboxes", { method: "POST", body: JSON.stringify(payload) });
      toast("Mailbox saved.", "success"); onSaved();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <Overlay title={f.id ? "Edit Mailbox" : "New Mailbox"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Mailbox Name" value={f.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Verification Inbox" />
          <Input label="Email Address" value={f.email_address || ""} onChange={(e) => set("email_address", e.target.value)} placeholder="verify@domain.com" />
        </div>
        {providers.length > 0 && (
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200/70 font-space">Provider (optional — auto-fills hosts)</label>
            <select value={f.provider_id || ""} onChange={(e) => applyProvider(e.target.value)} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 focus:outline-none">
              <option value="" className="bg-neutral-900">— None (manual) —</option>
              {providers.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="IMAP Host" value={f.imap_host || ""} onChange={(e) => set("imap_host", e.target.value)} placeholder="imap.host.com" />
          <Input label="IMAP Port" type="number" value={f.imap_port || ""} onChange={(e) => set("imap_port", e.target.value)} />
          <Input label="SMTP Host" value={f.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.host.com" />
          <Input label="SMTP Port" type="number" value={f.smtp_port || ""} onChange={(e) => set("smtp_port", e.target.value)} />
          <Input label="Username" value={f.username || ""} onChange={(e) => set("username", e.target.value)} placeholder="full email / login" />
          <PasswordField label={`Password ${f.has_password ? "(leave blank to keep)" : ""}`} value={f.password || ""} onChange={(v) => set("password", v)} />
          <Input label="Sender Name" value={f.sender_name || ""} onChange={(e) => set("sender_name", e.target.value)} />
          <Input label="Sender Email" value={f.sender_email || ""} onChange={(e) => set("sender_email", e.target.value)} />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={f.imap_secure !== false} onChange={(e) => set("imap_secure", e.target.checked)} className="accent-cyan-500" /> IMAP SSL (993)</label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={!!f.smtp_secure} onChange={(e) => set("smtp_secure", e.target.checked)} className="accent-cyan-500" /> SMTP SSL (465)</label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={f.enabled !== false} onChange={(e) => set("enabled", e.target.checked)} className="accent-cyan-500" /> Enabled</label>
        </div>
        <Button onClick={save} isLoading={saving} className="w-full">{f.id ? "Save Changes" : "Create Mailbox"}</Button>
      </div>
    </Overlay>
  );
}

function SearchTestModal({ mailbox, onClose }: { mailbox: any; onClose: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ sender: "", subjectKeywords: "", bodyKeywords: "", maxAgeSec: 600 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await apiFetch(`/api/admin/email/mailboxes/${mailbox.id}/search-test`, { method: "POST", body: JSON.stringify(f) });
      setResult(r);
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <Overlay title={`Search Test — ${mailbox.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] text-purple-300/50">Verify your matching rules against the live mailbox before assigning them to customers.</p>
        <Input label="Expected Sender (optional)" value={f.sender} onChange={(e) => set("sender", e.target.value)} placeholder="accounts@example.com" />
        <Input label="Subject Keywords (comma-separated)" value={f.subjectKeywords} onChange={(e) => set("subjectKeywords", e.target.value)} placeholder="Netflix, verification" />
        <Input label="Body Keywords (comma-separated)" value={f.bodyKeywords} onChange={(e) => set("bodyKeywords", e.target.value)} placeholder="code, verify" />
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-purple-200/70 font-space">Maximum Email Age</label>
          <select value={f.maxAgeSec} onChange={(e) => set("maxAgeSec", parseInt(e.target.value))} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 focus:outline-none">
            <option value={120} className="bg-neutral-900">2 minutes</option>
            <option value={300} className="bg-neutral-900">5 minutes</option>
            <option value={600} className="bg-neutral-900">10 minutes</option>
            <option value={1800} className="bg-neutral-900">30 minutes</option>
          </select>
        </div>
        <Button onClick={run} isLoading={busy} className="w-full flex items-center justify-center gap-1"><Search className="h-3.5 w-3.5" /> Run Search</Button>

        {result && (
          <div className="rounded-xl border border-purple-500/15 bg-black/30 p-3 space-y-2 text-[12px]">
            <div className="flex items-center gap-2">
              {result.matched ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-amber-400" />}
              <span className="font-bold text-white">{result.matched ? "Matched Email" : "No Match"}</span>
              <span className="text-[10px] text-purple-300/40 ml-auto">{result.searchTimeMs}ms · scanned {result.scanned}</span>
            </div>
            {result.matched && result.preview && (
              <div className="text-purple-200/70 space-y-0.5">
                <div><span className="text-purple-300/40">From:</span> {result.preview.from}</div>
                <div><span className="text-purple-300/40">Subject:</span> {result.preview.subject}</div>
                <div><span className="text-purple-300/40">Date:</span> {result.preview.date ? new Date(result.preview.date).toLocaleString() : "—"}</div>
                <div className="pt-1"><span className="text-purple-300/40">Extracted Code:</span> <span className="font-mono font-bold text-cyan-300">{result.code || "— none —"}</span></div>
                <div className="break-all"><span className="text-purple-300/40">Extracted Link:</span> <span className="font-mono text-purple-300">{result.link || "— none —"}</span></div>
              </div>
            )}
            {!result.matched && <p className="text-amber-200/70 text-[11px]">{result.reason}</p>}
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
function ActivityFeed({ dashboard, onReload }: { dashboard: any; onReload: () => void }) {
  const recent = dashboard?.recent || [];
  return (
    <Card className="border border-purple-500/10">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold font-space text-white flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" /> Email Activity Log</h4>
        <button onClick={onReload} className="text-[11px] font-bold text-cyan-300/80 hover:text-cyan-300 cursor-pointer inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Refresh</button>
      </div>
      {recent.length === 0 ? <p className="text-xs text-purple-300/40">No email activity recorded yet.</p> : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {recent.map((a: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-black/20 border border-purple-500/5">
              <span className="flex items-center gap-1.5 min-w-0">
                <ActionDot status={a.status} />
                <span className="font-bold text-purple-200/80">{a.action}</span>
                <span className="text-purple-300/40 truncate">{a.mailbox_name ? `· ${a.mailbox_name}` : ""} {a.detail ? `· ${a.detail}` : ""}</span>
              </span>
              <span className="text-purple-300/40 shrink-0">{a.actor || "system"} · {new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Small shared UI helpers
// ---------------------------------------------------------------------------
function Loading() { return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading…</div>; }
function EmptyState({ text }: { text: string }) { return <div className="py-10 text-center text-purple-300/40 text-xs">{text}</div>; }
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="p-1.5 rounded-lg border border-purple-500/15 bg-black/20 text-purple-200/70 hover:text-white hover:bg-white/5 cursor-pointer">{children}</button>;
}
function TestBtn({ label, onClick, busy, icon }: { label: string; onClick: () => void; busy: boolean; icon: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-[11px] font-bold text-cyan-200/80 hover:bg-cyan-500/15 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}{label}</button>;
}
function StatusPill({ status, enabled }: { status?: string; enabled?: number }) {
  if (enabled === 0) return <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-500/20 text-neutral-300">Disabled</span>;
  if (status === "connected") return <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Connected</span>;
  if (status === "error") return <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Error</span>;
  return <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">Unknown</span>;
}
function ActionDot({ status }: { status?: string }) {
  const cls = status === "ok" ? "bg-emerald-400" : status === "fail" ? "bg-red-400" : status === "empty" ? "bg-amber-400" : "bg-purple-400";
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cls}`} />;
}
function PasswordField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-purple-200/70 font-space">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-2.5 pr-9 focus:outline-none" />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-300/50 hover:text-purple-200 cursor-pointer">{show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
      </div>
    </div>
  );
}
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0e0922] border border-purple-500/30 rounded-2xl p-5 shadow-2xl z-10 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold font-space text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"><XCircle className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ——— SMTP Aliases: alternate sender identities + purpose routing ———
const PURPOSES = ["general", "notifications", "otp", "marketing", "support", "receipts"];
const emptyAlias = { label: "", from_name: "Aurevashop", from_email: "", purpose: "general", enabled: true };

function AliasesManager() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/admin/email/aliases"); setRows(r.aliases || []); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async (f: any) => {
    if (!f.label || !f.from_email) { toast("Label and from email are required.", "error"); return; }
    try {
      if (f.id) await apiFetch(`/api/admin/email/aliases/${f.id}`, { method: "PUT", body: JSON.stringify(f) });
      else await apiFetch("/api/admin/email/aliases", { method: "POST", body: JSON.stringify(f) });
      toast("Alias saved.", "success"); setEditing(null); load();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
  };
  const del = async (id: number) => {
    if (!(await confirm({ title: "Delete alias?", message: "This sender alias will be removed.", danger: true, confirmLabel: "Delete" }))) return;
    try { await apiFetch(`/api/admin/email/aliases/${id}`, { method: "DELETE" }); toast("Alias deleted.", "success"); load(); }
    catch (e: any) { toast("Failed: " + e.message, "error"); }
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-purple-300/50">Alternate sender addresses under the same account. Assign a <b>purpose</b> so the right identity is used for OTP, notifications, marketing, etc.</p>
        <Button onClick={() => setEditing({ ...emptyAlias })} className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New Alias</Button>
      </div>
      {rows.length === 0 ? <EmptyState text="No aliases yet." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((a) => (
            <div key={a.id} className="rounded-xl border border-purple-500/10 bg-black/20 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-cyan-400" /> {a.label}</span>
                <div className="flex items-center gap-1">
                  <IconBtn title="Edit" onClick={() => setEditing({ ...a, enabled: a.enabled !== 0 })}><Edit className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn title="Delete" onClick={() => del(a.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
              <div className="text-[11px] text-purple-300/50">{a.from_name} &lt;{a.from_email}&gt;</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">{a.purpose}</span>
                {a.enabled === 0 && <span className="text-[10px] text-red-400 font-bold">disabled</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Overlay title={editing.id ? "Edit Alias" : "New Alias"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Input label="Label" value={editing.label || ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. OTP Sender" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="From Name" value={editing.from_name || ""} onChange={(e) => setEditing({ ...editing, from_name: e.target.value })} placeholder="Aurevashop" />
              <Input label="From Email" value={editing.from_email || ""} onChange={(e) => setEditing({ ...editing, from_email: e.target.value })} placeholder="hello@avslogs.org" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200/70 block font-space">Purpose</label>
              <select value={editing.purpose || "general"} onChange={(e) => setEditing({ ...editing, purpose: e.target.value })} className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none">
                {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-purple-200/70"><input type="checkbox" checked={editing.enabled !== false} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="accent-cyan-500" /> Enabled</label>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save(editing)} className="flex-1">Save Alias</Button>
              <Button variant="outline" onClick={() => setEditing(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
