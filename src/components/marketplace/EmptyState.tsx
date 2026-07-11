import type { ReactNode } from "react";

// Reusable illustrated empty state (inline SVG — no external assets, sandbox-safe).
// Consistent premium look across every marketplace surface.
type Illustration = "box" | "search" | "cart" | "orders" | "star" | "compare";

function Art({ kind }: { kind: Illustration }) {
  const common = "drop-shadow-[0_8px_24px_rgba(124,58,237,0.35)]";
  switch (kind) {
    case "search":
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <circle cx="52" cy="52" r="30" stroke="url(#es-s)" strokeWidth="5" opacity="0.9" />
          <line x1="74" y1="74" x2="98" y2="98" stroke="url(#es-s)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="52" cy="52" r="14" fill="#a855f7" opacity="0.15" />
        </svg>
      );
    case "cart":
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <path d="M24 30h12l10 44h44l10-30H44" stroke="url(#es-c)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="52" cy="90" r="7" fill="url(#es-c)" /><circle cx="86" cy="90" r="7" fill="url(#es-c)" />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <rect x="30" y="24" width="60" height="72" rx="8" stroke="url(#es-o)" strokeWidth="5" />
          <line x1="42" y1="44" x2="78" y2="44" stroke="url(#es-o)" strokeWidth="4" strokeLinecap="round" />
          <line x1="42" y1="58" x2="78" y2="58" stroke="url(#es-o)" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
          <line x1="42" y1="72" x2="64" y2="72" stroke="url(#es-o)" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
          <path d="M60 26l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3z" stroke="url(#es-st)" strokeWidth="5" strokeLinejoin="round" fill="#a855f7" fillOpacity="0.1" />
        </svg>
      );
    case "compare":
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-cmp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <rect x="22" y="30" width="34" height="60" rx="8" stroke="url(#es-cmp)" strokeWidth="5" />
          <rect x="64" y="30" width="34" height="60" rx="8" stroke="url(#es-cmp)" strokeWidth="5" opacity="0.6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" className={`h-28 w-28 ${common}`} fill="none" aria-hidden="true">
          <defs><linearGradient id="es-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <path d="M60 26l32 16v36L60 94 28 78V42z" stroke="url(#es-b)" strokeWidth="5" strokeLinejoin="round" fill="#a855f7" fillOpacity="0.08" />
          <path d="M28 42l32 16 32-16M60 58v36" stroke="url(#es-b)" strokeWidth="4" strokeLinejoin="round" opacity="0.7" />
        </svg>
      );
  }
}

export default function EmptyState({
  illustration = "box", title, subtitle, action,
}: { illustration?: Illustration; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4 gap-3 animate-fade-up">
      <Art kind={illustration} />
      <h3 className="text-base font-bold text-white font-space mt-1">{title}</h3>
      {subtitle && <p className="text-xs text-purple-200/50 max-w-sm leading-relaxed">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
