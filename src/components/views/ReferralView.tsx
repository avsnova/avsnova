import { useState, useEffect, useCallback } from "react";
import { Users, Gift, Copy, Check, Share2, Wallet, Clock3, CheckCircle2, Sparkles } from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";

/**
 * ReferralView — customer "Refer & Earn" dashboard. Shows the user's referral code + share
 * link, program terms (all admin-configured), lifetime stats, and their list of invitees.
 */
export default function ReferralView() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch("/api/referrals/me"); setData(r); }
    catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const code = data?.code || "";
  const shareLink = typeof window !== "undefined" && code ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : "";
  const money = (v: any) => `₦${Math.round(Number(v) || 0).toLocaleString()}`;

  const copy = async (text: string, which: "code" | "link") => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(which); toast("Copied to clipboard!", "success"); setTimeout(() => setCopied(null), 1500); }
    else toast("Couldn't copy — please copy manually.", "error");
  };

  const share = async () => {
    const text = `Join me on Aureavashop and let's both earn! Use my referral link:`;
    try {
      if (navigator.share) { await navigator.share({ title: "Aureavashop Referral", text, url: shareLink }); }
      else { await copy(shareLink, "link"); }
    } catch { /* user cancelled share */ }
  };

  if (loading) return <div className="py-16 text-center text-purple-200/40 text-sm"><Sparkles className="h-6 w-6 mx-auto mb-2 animate-pulse" />Loading your referral dashboard…</div>;

  if (data && data.enabled === false) {
    return (
      <Card className="p-10 text-center space-y-2">
        <Users className="h-10 w-10 mx-auto text-purple-300/40" />
        <h3 className="text-lg font-bold text-white font-space">Referrals are currently paused</h3>
        <p className="text-sm text-purple-200/50">The referral program isn't active right now. Please check back soon.</p>
      </Card>
    );
  }

  const cfg = data?.config || {};
  const stats = data?.stats || {};
  const referrals = data?.referrals || [];

  return (
    <div className="space-y-6 font-inter text-left">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <Users className="h-4 w-4" /> <span>Refer &amp; Earn</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">Invite friends, earn rewards</h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Share your code. When a friend signs up{cfg.signupBonus > 0 ? ` they get ${money(cfg.signupBonus)}, and` : " and"} makes their first purchase of {money(cfg.qualifyAmount)}+, you earn <span className="text-emerald-400 font-bold">{money(cfg.referrerBonus)}</span> in wallet credit.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Total earned" value={money(stats.totalEarned)} tone="text-emerald-400" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Friends invited" value={String(stats.invited || 0)} tone="text-white" />
        <StatCard icon={<Clock3 className="h-4 w-4" />} label="Pending" value={String(stats.pending || 0)} tone="text-amber-300" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Rewarded" value={String(stats.rewarded || 0)} tone="text-cyan-300" />
      </div>

      {/* Share card */}
      <Card className="space-y-4 bg-gradient-to-br from-[#12082b] to-[#0a0418] border border-purple-500/25">
        <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-cyan-400" /><h3 className="text-sm font-bold text-white font-space">Your referral code</h3></div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-purple-500/25 bg-black/40 px-4 py-3">
            <span className="font-mono font-bold text-lg text-white tracking-wider select-all">{code || "—"}</span>
            <button onClick={() => copy(code, "code")} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer">
              {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy
            </button>
          </div>
          <Button onClick={share} className="flex items-center justify-center gap-1.5"><Share2 className="h-4 w-4" /> Share link</Button>
        </div>
        {shareLink && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-purple-500/10 bg-black/30 px-3 py-2">
            <span className="font-mono text-[11px] text-purple-200/60 truncate">{shareLink}</span>
            <button onClick={() => copy(shareLink, "link")} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer">
              {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <HowStep n={1} text="Share your code or link with friends." />
          <HowStep n={2} text={`They sign up${cfg.signupBonus > 0 ? ` and get ${money(cfg.signupBonus)}` : ""}.`} />
          <HowStep n={3} text={`They spend ${money(cfg.qualifyAmount)}+ → you earn ${money(cfg.referrerBonus)}.`} />
        </div>
      </Card>

      {/* Invitees */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-white font-space">Your invites</h3>
        {referrals.length === 0 ? (
          <div className="py-8 text-center text-purple-200/40 text-xs">No invites yet. Share your code to get started!</div>
        ) : (
          <div className="space-y-2">
            {referrals.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-purple-500/10 bg-black/30">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.name}</div>
                  <div className="text-[10px] text-purple-200/40">{r.date ? new Date(r.date).toLocaleDateString() : ""}</div>
                </div>
                {r.status === "rewarded" ? (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"><CheckCircle2 className="h-3.5 w-3.5" /> +{money(r.bonus)}</span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25"><Clock3 className="h-3.5 w-3.5" /> Pending</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#0f0a28] to-[#04020a] p-3.5">
      <div className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest flex items-center gap-1">{icon} {label}</div>
      <div className={`text-lg font-bold font-space mt-1 ${tone}`}>{value}</div>
    </div>
  );
}
function HowStep({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-black/20 border border-purple-500/10 p-2.5">
      <span className="h-5 w-5 shrink-0 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-bold flex items-center justify-center">{n}</span>
      <span className="text-[11px] text-purple-200/70 leading-snug">{text}</span>
    </div>
  );
}
