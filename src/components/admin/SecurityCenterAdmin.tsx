import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, KeyRound, Activity, Ban, CheckCircle2, Loader2, HelpCircle, X,
  Sliders, TrendingUp, Save, Smartphone, Mail,
} from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import EmailCenterAdmin from "./EmailCenterAdmin";
import AuthCodePanel from "./AuthCodePanel";

/**
 * SecurityCenterAdmin — the admin Security Center hub (Phase 1: Authenticator/TOTP).
 * Tabbed: Authenticator + Email Verification are fully active; only SMS is "Coming Soon". Dashboard KPIs, recent activity,
 * top-used credentials, global usage-limit default, and a built-in Help section.
 */

export default function SecurityCenterAdmin() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"dashboard" | "email" | "authcode" | "help">("dashboard");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [globalLimit, setGlobalLimit] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/security/dashboard");
      setData(r);
      setGlobalLimit(r?.stats?.globalDefault ?? 0);
    } catch (e: any) { toast("Failed to load Security Center: " + e.message, "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const saveGlobal = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ totp_default_limit: globalLimit }) });
      toast("Global usage limit saved.", "success");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 font-inter text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-400" /> Security Center</h3>
          <p className="text-xs text-purple-200/50 mt-0.5">Manage authenticator (TOTP) &amp; email verification across all credentials. SMS verification arrives in a future phase.</p>
        </div>
      </div>

      {/* Method tabs (future-proof) */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: "dashboard", label: "Authenticator", icon: <KeyRound className="h-3.5 w-3.5" /> },
          { id: "email", label: "Email Verification", icon: <Mail className="h-3.5 w-3.5" /> },
          { id: "authcode", label: "Authorization Code", icon: <KeyRound className="h-3.5 w-3.5" /> },
          { id: "help", label: "Help & Docs", icon: <HelpCircle className="h-3.5 w-3.5" /> },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 cursor-pointer ${tab === t.id ? "bg-cyan-500/20 text-white border border-cyan-500/30" : "bg-black/20 text-purple-300/60 border border-transparent hover:text-purple-200"}`}>{t.icon}{t.label}</button>
        ))}
        <span className="px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 bg-black/10 text-purple-300/30 border border-transparent"><Smartphone className="h-3.5 w-3.5" />SMS <span className="text-[8px] uppercase bg-purple-500/15 rounded px-1">Soon</span></span>
      </div>

      {tab === "email" ? (
        <EmailCenterAdmin />
      ) : tab === "authcode" ? (
        <AuthCodePanel />
      ) : loading ? (
        <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading…</div>
      ) : tab === "help" ? (
        <HelpSection />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={<KeyRound className="h-4 w-4" />} label="Authenticator Enabled" value={data?.stats?.withAuth ?? 0} tone="text-emerald-300" />
            <Kpi icon={<Ban className="h-4 w-4" />} label="Without Auth" value={data?.stats?.withoutAuth ?? 0} tone="text-neutral-300" />
            <Kpi icon={<Activity className="h-4 w-4" />} label="Codes Today" value={data?.stats?.codesToday ?? 0} tone="text-cyan-300" />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Codes (all-time)" value={data?.stats?.codesTotal ?? 0} tone="text-purple-300" />
            <Kpi icon={<Ban className="h-4 w-4" />} label="Limit Reached" value={data?.stats?.limitReached ?? 0} tone="text-amber-300" />
          </div>

          {/* Global usage limit */}
          <Card className="border border-purple-500/10 space-y-3">
            <div className="flex items-center gap-2 text-purple-200"><Sliders className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">Global "Get Code" Usage Limit</h4></div>
            <p className="text-[11px] text-purple-300/50">Default max code requests per credential (0 = unlimited). Individual credentials can override this.</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <button key={n} onClick={() => setGlobalLimit(n)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${globalLimit === n ? "bg-cyan-500/20 border-cyan-500/40 text-white" : "bg-black/20 border-purple-500/15 text-purple-300/60 hover:text-white"}`}>{n === 0 ? "Unlimited" : n}</button>
              ))}
              <input type="number" min={0} value={globalLimit} onChange={(e) => setGlobalLimit(parseInt(e.target.value) || 0)} className="w-24 bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2 rounded-xl focus:outline-none" placeholder="Custom" />
              <Button onClick={saveGlobal} isLoading={saving} className="flex items-center gap-1"><Save className="h-3.5 w-3.5" /> Save</Button>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent activity */}
            <Card className="border border-purple-500/10">
              <h4 className="text-sm font-bold font-space text-white flex items-center gap-2 mb-3"><Activity className="h-4 w-4 text-cyan-400" /> Recent Code Activity</h4>
              {(!data?.recent || data.recent.length === 0) ? <p className="text-xs text-purple-300/40">No code generations recorded yet.</p> : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {data.recent.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-black/20 border border-purple-500/5">
                      <span className="text-purple-200/80 truncate">{a.product_name || `Order ${a.order_id}`}</span>
                      <span className="text-purple-300/40 shrink-0">{a.device}/{a.browser} · {new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Top used */}
            <Card className="border border-purple-500/10">
              <h4 className="text-sm font-bold font-space text-white flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-emerald-400" /> Top-Used Credentials</h4>
              {(!data?.topUsed || data.topUsed.length === 0) ? <p className="text-xs text-purple-300/40">No authenticator usage yet.</p> : (
                <div className="space-y-1.5">
                  {data.topUsed.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-black/20 border border-purple-500/5">
                      <span className="text-purple-200/80 truncate">{c.product_name || c.product_id} · <span className="text-purple-300/50">{c.email || `#${c.id}`}</span></span>
                      <span className="text-cyan-300 font-bold shrink-0">{c.totp_usage_count} uses</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <p className="text-[11px] text-purple-300/40">Configure a credential's authenticator (secret, QR, per-credential limit, reset usage) in the <span className="text-cyan-300 font-bold">Credential Inventory</span> tab → edit any credential → Authenticator section.</p>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-purple-300/60 text-[10px] font-space uppercase tracking-wide">{icon}{label}</div>
      <div className={`text-xl font-bold font-space mt-1 ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function HelpSection() {
  const faqs: [string, string][] = [
    ["What is an authenticator code?", "A one-time 6-digit code (TOTP) that changes every 30 seconds, used as a second verification step for an account."],
    ["How do I configure it?", "Open Credential Inventory, edit a credential, open the Authenticator section, paste the secret or upload the QR code, validate, and save. The secret is encrypted at rest."],
    ["How do customers use it?", "On their purchased account page, they open the Security Center and tap Get Code. The current code appears with a live countdown and a Copy button."],
    ["How do I replace a secret?", "Edit the credential, paste the new secret in the Authenticator section, validate, and Save — this overwrites the previous secret."],
    ["Why do codes expire?", "TOTP codes are time-based and rotate every 30 seconds for security. When one expires, the next is generated automatically."],
    ["Why do usage limits exist?", "They prevent abuse and credential sharing. Set a global default or per-credential override; reset or grant more requests anytime."],
  ];
  return (
    <Card className="border border-purple-500/10 space-y-3">
      <h4 className="text-sm font-bold font-space text-white flex items-center gap-2"><HelpCircle className="h-4 w-4 text-cyan-400" /> How the Authenticator works</h4>
      <div className="space-y-2">
        {faqs.map(([q, a], i) => (
          <div key={i} className="p-3 rounded-xl bg-black/20 border border-purple-500/5">
            <div className="text-[12px] font-bold text-white flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-cyan-400/70 mt-0.5 shrink-0" />{q}</div>
            <p className="text-[11px] text-purple-200/60 mt-1 ml-5.5 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
