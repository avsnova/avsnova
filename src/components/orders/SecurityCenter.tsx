import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldCheck, KeyRound, Copy, CheckCircle2, RefreshCw, Loader2, HelpCircle, X, Mail, Lock,
  Link2, ExternalLink, Inbox, AlertTriangle, Clock, History, Info, ChevronDown, ChevronUp, Eye, EyeOff, FileText,
} from "lucide-react";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { useToast } from "../ui/Toast";

/**
 * SecurityCenter — per-purchased-account security panel (Phase 1: TOTP Authenticator).
 * Sections: Email Verification + TOTP Authenticator (always shown when the product has credentials).
 * The code is generated on demand (Get Code), counts down in real time, and auto-refreshes
 * when it expires. The secret is never exposed — only the current code + expiry come back.
 */

interface Props { orderId: string; }
interface CredentialInfo {
  username?: string; password?: string; email?: string;
  recovery_email?: string; recovery_phone?: string; loginUrl?: string;
  type?: string; status?: string; raw?: string;
}
interface SecurityStatus {
  credential?: CredentialInfo | null;
  instructions?: string;
  productName?: string;
  authenticator?: { active: boolean; lastUsed?: string | null; limit?: number; used?: number; remaining?: number };
  email?: { active: boolean; comingSoon?: boolean; mailbox?: string; mailboxMasked?: string; disabled?: boolean };
  sms?: { active: boolean; comingSoon?: boolean };
}

export default function SecurityCenter({ orderId }: Props) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/orders/${orderId}/security`);
        if (alive) setStatus(r);
      }
      catch { if (alive) setStatus(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (loading) return <div className="py-4 text-center text-purple-300/40 text-xs"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>;
  if (!status) return null;

  const cred = status.credential;
  const emailActive = !!status.email?.active || !!status.email?.disabled;
  const authActive = !!status.authenticator?.active;
  const hasInstructions = !!(status.instructions && status.instructions.trim());
  // Render only if there is something meaningful to show for this account.
  if (!cred && !authActive && !emailActive && !hasInstructions) return null;

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#0c1526] to-[#06030d] p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-bold font-space text-white"><ShieldCheck className="h-5 w-5 text-cyan-400" /> Security Center</span>
        <button onClick={() => setShowHelp(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300/80 hover:text-cyan-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded px-1.5 py-0.5">
          <HelpCircle className="h-3.5 w-3.5" /> How to use
        </button>
      </div>

      {/* Top guidance notice */}
      <div className="flex items-start gap-2 rounded-xl bg-cyan-500/8 border border-cyan-500/20 p-3">
        <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-cyan-100/80">Your purchased credential is shown below. Follow the instructions carefully before requesting verification codes.</p>
      </div>

      {/* Credential Information */}
      {cred && <CredentialCard cred={cred} />}

      {/* Verification Methods — Email Verification + TOTP Authenticator are ALWAYS shown
          whenever the product has credentials, even when not yet configured (Req 3). */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Verification Methods</h4>

        {/* Email Verification — always visible */}
        <MethodSection icon={<Mail className="h-4 w-4 text-purple-300" />} title="Email Verification" statusLabel={emailActive ? (status.email?.disabled ? "Unavailable" : "Configured") : "Not configured"} statusTone={emailActive && !status.email?.disabled ? "emerald" : "amber"} defaultOpen={emailActive}>
          {emailActive
            ? <EmailVerifyPanel orderId={orderId} mailbox={status.email?.mailbox} mailboxMasked={status.email?.mailboxMasked} disabled={!!status.email?.disabled} />
            : <p className="text-[11px] text-purple-300/50 py-1">No Email Verification has been configured for this product.</p>}
        </MethodSection>

        {/* TOTP Authenticator — always visible */}
        <MethodSection icon={<KeyRound className="h-4 w-4 text-cyan-300" />} title="TOTP Authenticator" statusLabel={authActive ? "Configured" : "Not configured"} statusTone={authActive ? "emerald" : "amber"} defaultOpen={authActive && !emailActive}>
          {authActive
            ? <AuthenticatorPanel orderId={orderId} lastUsed={status.authenticator?.lastUsed} initialRemaining={status.authenticator?.remaining} initialLimit={status.authenticator?.limit} initialUsed={status.authenticator?.used} />
            : <p className="text-[11px] text-purple-300/50 py-1">No TOTP Authenticator has been configured for this product.</p>}
        </MethodSection>
      </div>

      {/* Administrator instructions — scrollable panel below the credential */}
      {hasInstructions && (
        <div className="rounded-xl border border-purple-500/10 bg-black/20">
          <button onClick={() => setShowInstructions((s) => !s)} className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-200/70 uppercase tracking-wider font-space"><FileText className="h-3.5 w-3.5" /> Instructions</span>
            {showInstructions ? <ChevronUp className="h-4 w-4 text-purple-300/50" /> : <ChevronDown className="h-4 w-4 text-purple-300/50" />}
          </button>
          {showInstructions && (
            <div className="px-3 pb-3">
              <div
                className="max-h-56 overflow-y-auto custom-scrollbar-thin text-[12px] leading-relaxed text-purple-100/80 prose-invert avs-instructions"
                dangerouslySetInnerHTML={{ __html: sanitizeInstructions(status.instructions || "") }}
              />
            </div>
          )}
        </div>
      )}

      {showHelp && <HowToModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// Minimal HTML sanitizer for admin-authored instructions: strips script/style/event
// handlers and javascript: URLs while keeping common rich-text formatting tags.
function sanitizeInstructions(html: string): string {
  let s = String(html || "");
  s = s.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, "");
  s = s.replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "").replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/javascript:/gi, "");
  return s;
}

// Prominent credential card: username, password, copy buttons, status, type.
function CredentialCard({ cred }: { cred: CredentialInfo }) {
  const { toast } = useToast();
  const hasStructured = !!(cred.username || cred.password || cred.email);
  const typeLabel = cred.type === "authenticator" ? "Authenticator-protected" : cred.type === "email" ? "Email-verified" : "Login Credential";

  const copy = async (val: string, label: string) => {
    if (!val) return;
    const ok = await copyToClipboard(val);
    if (ok) toast(`${label} copied`, "success", { silent: true });
    else toast(`Could not copy ${label}. Please copy manually.`, "error");
  };

  return (
    <div className="rounded-xl border border-cyan-500/15 bg-black/30 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">Credential Information</span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-300 rounded px-1.5 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> {cred.status || "Delivered"}
        </span>
      </div>

      {hasStructured ? (
        <div className="space-y-2">
          <CredentialField label="Username" value={cred.username || cred.email || ""} onCopy={() => copy(cred.username || cred.email || "", "Username")} />
          <CredentialField label="Password" value={cred.password || ""} secret onCopy={() => copy(cred.password || "", "Password")} />
          {cred.recovery_email && <CredentialField label="Recovery Email" value={cred.recovery_email} onCopy={() => copy(cred.recovery_email || "", "Recovery email")} />}
          {cred.recovery_phone && <CredentialField label="Recovery Phone" value={cred.recovery_phone} onCopy={() => copy(cred.recovery_phone || "", "Recovery phone")} />}
        </div>
      ) : cred.raw ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-200/50 uppercase">Account Information</span>
            <button onClick={() => copy(cred.raw || "", "Credential")} className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer"><Copy className="h-3 w-3" /> Copy all</button>
          </div>
          <pre className="text-[11px] text-purple-100/80 font-mono whitespace-pre-wrap break-all bg-black/40 rounded-lg p-2.5 max-h-40 overflow-y-auto custom-scrollbar-thin">{cred.raw}</pre>
        </div>
      ) : (
        <p className="text-[11px] text-purple-300/40 italic">Awaiting fulfillment…</p>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-purple-300/50">
        <span className="inline-flex items-center gap-1 bg-purple-500/10 border border-purple-500/15 rounded px-1.5 py-0.5 font-bold text-purple-200/70">{typeLabel}</span>
      </div>
    </div>
  );
}

function CredentialField({ label, value, secret, onCopy }: { label: string; value: string; secret?: boolean; onCopy: () => void }) {
  const [show, setShow] = useState(!secret);
  const display = value ? (show ? value : "•".repeat(Math.min(12, Math.max(6, value.length)))) : "—";
  return (
    <div className="flex items-center gap-2 bg-black/40 rounded-lg border border-purple-500/10 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase font-bold text-purple-200/40 font-space">{label}</div>
        <div className="text-xs font-mono text-white truncate">{display}</div>
      </div>
      {secret && value && (
        <button onClick={() => setShow((s) => !s)} className="p-1.5 rounded-lg text-purple-300/60 hover:text-white hover:bg-white/5 cursor-pointer shrink-0" title={show ? "Hide" : "Show"}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      <button onClick={onCopy} disabled={!value} className="p-1.5 rounded-lg text-cyan-300 hover:text-white hover:bg-cyan-500/15 cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed" title={`Copy ${label}`}>
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Collapsible verification method section with a status pill.
function MethodSection({ icon, title, statusLabel, statusTone, defaultOpen, children }: { icon: React.ReactNode; title: string; statusLabel: string; statusTone: "emerald" | "amber"; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toneCls = statusTone === "emerald" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300";
  return (
    <div className="rounded-xl border border-purple-500/10 bg-black/20 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/5">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-white">{icon} {title}</span>
        <span className="inline-flex items-center gap-2">
          <span className={`text-[9px] uppercase font-bold rounded px-1.5 py-0.5 ${toneCls}`}>{statusLabel}</span>
          {open ? <ChevronUp className="h-4 w-4 text-purple-300/50" /> : <ChevronDown className="h-4 w-4 text-purple-300/50" />}
        </span>
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function AuthenticatorPanel({ orderId, lastUsed, initialRemaining, initialLimit, initialUsed }: { orderId: string; lastUsed?: string | null; initialRemaining?: number; initialLimit?: number; initialUsed?: number }) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [step, setStep] = useState(30);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // Usage limit state: remaining -1 = unlimited; 0 = none left.
  const [remaining, setRemaining] = useState<number>(initialRemaining ?? -1);
  const [limit, setLimit] = useState<number>(initialLimit ?? 0);
  const [limitReached, setLimitReached] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Security rule: stop generating updates when the panel unmounts / user leaves.
      mountedRef.current = false;
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/orders/${orderId}/totp/code`, { method: "POST" });
      if (!mountedRef.current) return;
      setCode(r.code);
      setSecondsLeft(r.secondsRemaining);
      setStep(r.step || 30);
      if (typeof r.remaining === "number") setRemaining(r.remaining);
      if (typeof r.limit === "number") setLimit(r.limit);
    } catch (err: any) {
      if (err.message && /maximum number of code requests|limitReached/i.test(err.message)) {
        setLimitReached(true);
        // Stop any running countdown so it doesn't try to auto-refresh past the limit.
        if (tickRef.current) clearInterval(tickRef.current);
      }
      toast(err.message || "Could not generate code.", "error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orderId, toast]);

  // Real-time countdown; auto-refresh the code when it expires.
  useEffect(() => {
    if (code === null) return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // Only auto-refresh if the customer still has requests left (or unlimited).
          if (remaining === -1 || remaining > 0) fetchCode();
          else { if (tickRef.current) clearInterval(tickRef.current); setLimitReached(true); }
          return step;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [code, step, fetchCode, remaining]);

  const doCopy = async () => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) { setCopied(true); toast("Code copied to clipboard", "success", { silent: true }); setTimeout(() => setCopied(false), 1500); }
    else toast("Could not copy the code. Please copy it manually.", "error");
  };

  const pct = Math.max(0, Math.min(100, (secondsLeft / step) * 100));
  const urgent = secondsLeft <= 5;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Authenticator Active</span>
        {limit > 0 && !limitReached && <span className="text-[10px] text-purple-300/50">{remaining === -1 ? "" : `${remaining} of ${limit} requests left`}</span>}
      </div>

      {limitReached ? (
        <div className="py-5 text-center space-y-1.5">
          <Lock className="h-5 w-5 text-amber-400 mx-auto" />
          <p className="text-xs font-bold text-amber-300">Code request limit reached</p>
          <p className="text-[11px] text-purple-300/50">You've used all available code requests for this account. Please contact support if you need additional access.</p>
        </div>
      ) : code === null ? (
        <button
          onClick={fetchCode}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 text-sm font-bold text-white hover:brightness-110 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Get Code
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-black/40 border border-cyan-500/25 p-4 text-center">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300/60 font-space mb-1">Current Code</div>
            <div className="text-3xl font-black font-space tracking-[0.3em] text-white tabular-nums" aria-live="polite">{code}</div>
            {/* Countdown ring/bar */}
            <div className="mt-3 h-1.5 rounded-full bg-black/50 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ease-linear ${urgent ? "bg-red-400" : "bg-cyan-400"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`text-[11px] mt-1.5 font-mono ${urgent ? "text-red-400" : "text-purple-300/60"}`}>Expires in {secondsLeft}s</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={doCopy} className="py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
              {copied ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy Code</>}
            </button>
            <button onClick={fetchCode} disabled={loading || remaining === 0} title={remaining === 0 ? "No requests remaining" : undefined} className="py-2.5 rounded-xl bg-white/5 border border-purple-500/25 text-xs font-bold text-purple-200 hover:bg-white/10 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailVerifyPanel({ orderId, mailbox, mailboxMasked, disabled }: { orderId: string; mailbox?: string; mailboxMasked?: string; disabled?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<{ code?: string | null; link?: string | null; receivedAt?: string; subject?: string; sender?: string; senderName?: string; forwarded?: boolean; lowConfidence?: boolean; candidates?: string[] } | null>(null);
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [history, setHistory] = useState<{ action: string; status: string; detail?: string; created_at: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const mountedRef = useRef(true);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; progressTimers.current.forEach(clearTimeout); }; }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/orders/${orderId}/email-verify/history`);
      if (mountedRef.current && r.success) setHistory(r.history || []);
    } catch { /* non-fatal */ }
  }, [orderId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Log a customer-side event (copy/open) to the activity trail (#6). Non-blocking.
  const logEvent = useCallback((action: string) => {
    apiFetch(`/api/orders/${orderId}/email-verify/event`, { method: "POST", body: JSON.stringify({ action }) }).then(() => loadHistory()).catch(() => {});
  }, [orderId, loadHistory]);

  const fetchCode = useCallback(async () => {
    setLoading(true); setNoMatch(null); setResult(null);
    // Staged progress feedback (#8) so the button never appears frozen.
    progressTimers.current.forEach(clearTimeout);
    const steps = ["Connecting…", "Searching mailbox…", "Reading email…", "Extracting code…"];
    setProgress(steps[0]);
    progressTimers.current = steps.slice(1).map((label, i) =>
      setTimeout(() => { if (mountedRef.current) setProgress(label); }, (i + 1) * 900)
    );
    try {
      const r = await apiFetch(`/api/orders/${orderId}/email-verify/code`, { method: "POST" });
      if (!mountedRef.current) return;
      progressTimers.current.forEach(clearTimeout);
      setProgress("Done");
      // Friendly, non-technical messaging only (Req 2, 7). Internals never surfaced.
      const FRIENDLY_NONE = "We couldn't find a recent verification code. Please wait a moment and try again. If the problem continues, contact Support.";
      if (r.matched && (r.code || r.link)) {
        setResult({ code: r.code, link: r.link, receivedAt: r.receivedAt, subject: r.subject, sender: r.sender, senderName: r.senderName, forwarded: r.forwarded, lowConfidence: r.lowConfidence, candidates: r.candidates });
        setLastUpdated(new Date().toISOString());
        setFailCount(0);
        if (r.lowConfidence && !r.code) setNoMatch(FRIENDLY_NONE);
      } else {
        setResult(null);
        setNoMatch(FRIENDLY_NONE);
        setLastUpdated(new Date().toISOString());
        setFailCount((n) => n + 1);
      }
      loadHistory();
    } catch (err: any) {
      progressTimers.current.forEach(clearTimeout);
      // Never expose technical errors to customers (Req 7).
      if (mountedRef.current) { setProgress(""); setNoMatch("We couldn't complete the search right now. Please wait a moment and try again."); setFailCount((n) => n + 1); }
      loadHistory();
    } finally {
      if (mountedRef.current) { setLoading(false); setTimeout(() => { if (mountedRef.current) setProgress(""); }, 600); }
    }
  }, [orderId, toast, loadHistory]);

  const doCopy = async (value: string, which: "code" | "link") => {
    const ok = await copyToClipboard(value);
    if (ok) {
      if (which === "code") { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500); logEvent("code_copied"); }
      else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500); logEvent("link_copied"); }
      toast(which === "code" ? "Code copied" : "Link copied", "success", { silent: true });
    } else toast("Could not copy. Please copy manually.", "error");
  };

  if (disabled) {
    return (
      <div className="py-6 text-center space-y-2">
        <AlertTriangle className="h-5 w-5 text-amber-400 mx-auto" />
        <p className="text-xs font-bold text-amber-300">Email verification temporarily unavailable</p>
        <p className="text-[11px] text-purple-300/50">The linked mailbox is currently disabled. Please contact support.</p>
      </div>
    );
  }

  // Friendly status indicator (Req 9) — never exposes internals.
  const statusLabel = loading ? "Searching…"
    : result?.code ? "Verification Code Found"
    : result?.link ? "Verification Link Found"
    : failCount >= 3 ? "Contact Support"
    : noMatch ? "No Verification Email Found"
    : "Ready to Search";
  const statusTone = result?.code || result?.link ? "text-emerald-300"
    : loading ? "text-cyan-300"
    : failCount >= 3 ? "text-red-300"
    : noMatch ? "text-amber-300" : "text-purple-300/60";

  return (
    <div className="space-y-3">
      {/* Simple customer guide above Get Code (Req 4) — no technical details. */}
      <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3">
        <p className="text-[11px] font-bold text-cyan-200 mb-1.5">How to Retrieve Your Verification Code</p>
        <ol className="text-[11px] text-purple-100/80 leading-relaxed list-decimal list-inside space-y-0.5">
          <li>Use the email address assigned to this account where required.</li>
          <li>Request the verification code from the service or website.</li>
          <li>Wait a few moments for the verification email to arrive.</li>
          <li>Return to this page.</li>
          <li>Click <b>Get Code</b>.</li>
          <li>The system will get your code.</li>
        </ol>
      </div>

      {!result && !noMatch ? (
        <button
          onClick={fetchCode}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 text-sm font-bold text-white hover:brightness-110 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching…</> : <><Mail className="h-4 w-4" /> Get Code</>}
        </button>
      ) : (
        <div className="space-y-3">
          {result?.code && (
            <div className="rounded-2xl bg-black/40 border border-cyan-500/25 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300/60 font-space mb-1">Verification Code {result.senderName ? `· ${result.senderName}` : ""}{result.forwarded ? " · forwarded" : ""}</div>
              <div className="text-3xl font-black font-space tracking-[0.25em] text-white tabular-nums break-all">{result.code}</div>
              {result.receivedAt && <div className="text-[10px] text-purple-300/40 mt-1">Received {timeAgo(result.receivedAt)}{result.sender ? ` · ${result.sender}` : ""}</div>}
              {result.lowConfidence && result.candidates && result.candidates.length > 1 && (
                <div className="text-[10px] text-amber-300/70 mt-1.5">Other possible codes: {result.candidates.filter((c) => c !== result.code).join(", ")}</div>
              )}
              <button onClick={() => doCopy(result.code!, "code")} className="mt-3 w-full py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
                {copiedCode ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy Code</>}
              </button>
            </div>
          )}

          {result?.link && (
            <div className="rounded-2xl bg-black/40 border border-purple-500/25 p-3.5 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-purple-300/60 font-space inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> Verification Link</div>
              <div className="text-[11px] text-purple-200/70 break-all font-mono bg-black/30 rounded-lg p-2 max-h-16 overflow-y-auto">{result.link}</div>
              <div className="grid grid-cols-2 gap-2">
                <a href={result.link} target="_blank" rel="noopener noreferrer" onClick={() => logEvent("link_opened")} className="py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 text-xs font-bold text-white hover:brightness-110 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Link
                </a>
                <button onClick={() => doCopy(result.link!, "link")} className="py-2.5 rounded-xl bg-white/5 border border-purple-500/25 text-xs font-bold text-purple-200 hover:bg-white/10 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5">
                  {copiedLink ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy Link</>}
                </button>
              </div>
            </div>
          )}

          {noMatch && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-center space-y-1">
              <Clock className="h-4 w-4 text-amber-400 mx-auto" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">{noMatch}</p>
            </div>
          )}

          {/* Support guidance after repeated failures (Req 10) */}
          {failCount >= 3 && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 text-center">
              <p className="text-[11px] text-red-200/80 leading-relaxed">If you have already requested a verification email and it still cannot be found after several attempts, please contact Support for assistance.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-purple-300/40">{lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}` : ""}</span>
            <button onClick={fetchCode} disabled={loading} className="px-3 py-2 rounded-xl bg-white/5 border border-purple-500/25 text-xs font-bold text-purple-200 hover:bg-white/10 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Try Again
            </button>
          </div>
        </div>
      )}

      {/* Verification status indicator (Req 9) — friendly, no technical detail. */}
      <div className="flex items-center justify-center gap-2 pt-0.5">
        <span className={`h-1.5 w-1.5 rounded-full ${result?.code || result?.link ? "bg-emerald-400" : loading ? "bg-cyan-400 animate-pulse" : failCount >= 3 ? "bg-red-400" : noMatch ? "bg-amber-400" : "bg-purple-400/50"}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>{statusLabel}</span>
      </div>

      {/* Verification History */}
      <div className="border-t border-purple-500/10 pt-2">
        <button onClick={() => setShowHistory((s) => !s)} className="w-full flex items-center justify-between text-[11px] font-bold text-purple-300/70 hover:text-purple-200 cursor-pointer">
          <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Verification History</span>
          <span className="text-[10px] text-purple-300/40">{history.length ? `${history.length}` : ""} {showHistory ? "▲" : "▼"}</span>
        </button>
        {showHistory && (
          history.length === 0 ? (
            <p className="text-[10px] text-purple-300/40 mt-2 text-center py-2">No retrievals yet.</p>
          ) : (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[10px] p-1.5 rounded-lg bg-black/20 border border-purple-500/5">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${h.status === "ok" ? "bg-emerald-400" : h.status === "empty" ? "bg-amber-400" : "bg-red-400"}`} />
                    <span className="text-purple-200/70 truncate">{HISTORY_LABELS[h.action] || h.action}</span>
                  </span>
                  <span className="text-purple-300/40 shrink-0">{new Date(h.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Customer-safe labels only (Req 2) — no backend internals surfaced.
const HISTORY_LABELS: Record<string, string> = {
  code_extracted: "Code retrieved",
  link_extracted: "Link retrieved",
  displayed_to_customer: "Shown to you",
  code_copied: "Copied code",
  link_copied: "Copied link",
  link_opened: "Opened link",
};

// Compact relative time ("2 minutes ago") for received timestamps.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}

function HowToModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const steps = [
    "Open your purchased account and go to the Security Center.",
    "Authenticator: click Get Code for a 6-digit time-based code that refreshes every 30 seconds.",
    "Email Verification: trigger a code from the service, then click Get Code to fetch the newest matching email.",
    "Click Copy Code (or Open/Copy Link if a verification link is shown).",
    "Paste the code or open the link where the service asks for verification.",
    "Use Refresh if the newest code/email hasn't arrived yet.",
    "Never share your verification code or link with anyone.",
  ];
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="How to use authenticator codes">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0e0922] border border-purple-500/30 rounded-2xl p-6 shadow-2xl z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold font-space text-white flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-cyan-400" /> Using Verification Codes</h3>
          <button onClick={onClose} aria-label="Close" className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-purple-200/80 leading-relaxed">
              <span className="shrink-0 h-5 w-5 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
