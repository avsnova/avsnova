import type { ReactNode } from "react";

/* Reusable premium primitives for the AI Admin Console (glassmorphism, charts). */

export function MetricCard({ icon, label, value, sub, tone = "purple" }: {
  icon: ReactNode; label: string; value: string; sub?: string; tone?: "purple" | "cyan" | "emerald" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    purple: "text-purple-300 from-purple-500/15", cyan: "text-cyan-300 from-cyan-500/15",
    emerald: "text-emerald-300 from-emerald-500/15", amber: "text-amber-300 from-amber-500/15",
    red: "text-red-300 from-red-500/15",
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#0f0a28] to-[#04020a] p-4">
      <div className={`absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl bg-gradient-to-br ${tones[tone]} to-transparent`} />
      <div className={`flex items-center gap-1.5 ${tones[tone].split(" ")[0]} opacity-80 relative z-10`}>{icon}</div>
      <div className="text-[9px] font-bold text-purple-200/40 uppercase tracking-widest font-space mt-2.5 relative z-10">{label}</div>
      <div className="text-xl font-bold font-space text-white mt-0.5 relative z-10 truncate">{value}</div>
      {sub && <div className="text-[10px] text-purple-200/50 mt-0.5 relative z-10">{sub}</div>}
    </div>
  );
}

export function BarList({ items, emptyLabel, accent = "purple" }: {
  items: { label: string; value: number }[]; emptyLabel: string; accent?: "purple" | "cyan" | "emerald";
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const bar = accent === "cyan" ? "from-cyan-500 to-cyan-400" : accent === "emerald" ? "from-emerald-500 to-emerald-400" : "from-purple-500 to-cyan-400";
  if (items.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-purple-100/80 truncate pr-2 capitalize">{it.label}</span>
            <span className="text-purple-200/50 font-bold shrink-0">{it.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all duration-500`} style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ value, label, sub, color = "#34d399" }: { value: number; label: string; sub?: string; color?: string }) {
  const pct = Math.round(value * 100);
  const r = 34, c = 2 * Math.PI * r;
  const dash = (value * c);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`} className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold font-space text-white">{pct}%</div>
      </div>
      <div>
        <div className="text-sm font-bold text-white font-space">{label}</div>
        {sub && <div className="text-[11px] text-purple-200/50 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
      {icon && <div className="text-purple-300/30">{icon}</div>}
      <p className="text-xs text-purple-200/40">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-white/5 animate-pulse ${className}`} />;
}

export function SectionCard({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#0c0522] to-[#05020a] p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold font-space text-white">{title}</h4>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 cursor-pointer ${label ? "" : ""}`}
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-gradient-to-r from-purple-600 to-cyan-500" : "bg-white/10"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      {label && <span className="text-xs font-semibold text-purple-100">{label}</span>}
    </button>
  );
}
