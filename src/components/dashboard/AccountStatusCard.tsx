import { ShieldCheck, ShieldAlert, Mail, Phone, User, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  userName?: string | null;
  userEmail?: string;
  userPhone?: string;
  isAdmin?: boolean;
  onManageProfile: () => void;
  onManageSecurity: () => void;
}

// Premium profile + account/security status summary for the dashboard.
export default function AccountStatusCard({ userName, userEmail, userPhone, isAdmin, onManageProfile, onManageSecurity }: Props) {
  const initial = (userName || "?").charAt(0).toUpperCase();
  const hasEmail = !!userEmail;
  const hasPhone = !!userPhone;
  // Simple completeness score from available profile fields.
  const filled = [hasEmail, hasPhone, !!userName].filter(Boolean).length;
  const completeness = Math.round((filled / 3) * 100);

  return (
    <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#12092a] to-[#0c051a] p-5 space-y-4">
      {/* Profile header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-lg font-bold font-space text-white shadow-lg shadow-purple-500/20">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white font-space truncate">{userName || "Your account"}</span>
            {isAdmin && <span className="text-[8px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded px-1.5 py-0.5">Admin</span>}
          </div>
          <div className="text-[11px] text-purple-200/50 truncate">{userEmail || "No email on file"}</div>
        </div>
      </div>

      {/* Completeness bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-purple-200/40 mb-1">
          <span>Profile completeness</span><span className={completeness === 100 ? "text-emerald-400" : "text-cyan-300"}>{completeness}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: `${completeness}%` }} />
        </div>
      </div>

      {/* Status rows */}
      <div className="space-y-2">
        <StatusRow ok={hasEmail} icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={hasEmail ? "Verified" : "Add email"} />
        <StatusRow ok={hasPhone} icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={hasPhone ? userPhone! : "Add phone"} />
        <StatusRow ok icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Account" value="Active & secure" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onManageProfile} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-xs font-bold text-purple-100 hover:bg-white/10 cursor-pointer transition-colors">
          <User className="h-3.5 w-3.5" /> Profile
        </button>
        <button onClick={onManageSecurity} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-xs font-bold text-purple-100 hover:bg-white/10 cursor-pointer transition-colors">
          <ShieldAlert className="h-3.5 w-3.5" /> Security
        </button>
      </div>
    </div>
  );
}

function StatusRow({ ok, icon, label, value }: { ok: boolean; icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2 text-purple-200/60">{icon}{label}</span>
      <span className={`flex items-center gap-1 font-bold ${ok ? "text-emerald-400" : "text-amber-400"}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        <span className="truncate max-w-[140px]">{value}</span>
      </span>
    </div>
  );
}
