import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { CheckCircle2, X, Info, AlertTriangle, TriangleAlert, PartyPopper } from "lucide-react";
import { playUiSound } from "../../utils/notifySound";

export type ToastVariant = "success" | "info" | "error" | "warning";
export interface ToastOptions {
  big?: boolean;              // celebratory banner (confetti + longer)
  duration?: number;         // ms; 0 = sticky
  action?: { label: string; onClick: () => void };
  silent?: boolean;          // suppress sound for this toast
}
interface ToastItem { id: number; message: string; variant: ToastVariant; big?: boolean; duration: number; action?: ToastOptions["action"]; }
interface ToastCtx {
  toast: (message: string, variant?: ToastVariant, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => 0, dismiss: () => {} });
export const useToast = () => useContext(Ctx);

const ACCENT: Record<ToastVariant, string> = {
  success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-50",
  error: "bg-red-500/15 border-red-500/30 text-red-50",
  warning: "bg-amber-500/15 border-amber-500/30 text-amber-50",
  info: "bg-cyan-500/15 border-cyan-500/30 text-cyan-50",
};
const BAR: Record<ToastVariant, string> = {
  success: "bg-emerald-400", error: "bg-red-400", warning: "bg-amber-400", info: "bg-cyan-400",
};
function Icon({ v }: { v: ToastVariant }) {
  if (v === "success") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (v === "error") return <AlertTriangle className="h-5 w-5 text-red-400" />;
  if (v === "warning") return <TriangleAlert className="h-5 w-5 text-amber-400" />;
  return <Info className="h-5 w-5 text-cyan-300" />;
}

// Tasteful confetti burst (pure CSS/SVG, no library) shown for big celebrations.
function Confetti() {
  const bits = Array.from({ length: 14 });
  const colors = ["#34d399", "#22d3ee", "#a855f7", "#f59e0b", "#f472b6"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((_, i) => (
        <span
          key={i}
          className="absolute top-0 h-1.5 w-1.5 rounded-[1px] animate-confetti"
          style={{
            left: `${(i / bits.length) * 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 5) * 60}ms`,
            transform: `rotate(${i * 40}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);

  const toast = useCallback((message: string, variant: ToastVariant = "success", opts?: ToastOptions) => {
    const id = Date.now() + Math.random();
    const duration = opts?.duration ?? (opts?.big ? 5200 : opts?.action ? 6000 : 2800);
    setItems((prev) => [...prev.slice(-4), { id, message, variant, big: opts?.big, duration, action: opts?.action }]);
    if (!opts?.silent) {
      playUiSound(opts?.big ? "celebrate" : variant === "warning" ? "info" : variant);
    }
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      {/* aria-live region announces toasts to screen readers */}
      <div
        className="fixed z-[200] top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 flex flex-col gap-2 w-[calc(100%-2rem)] sm:w-auto sm:max-w-sm pointer-events-none"
        role="region" aria-label="Notifications"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [leaving] = useState(false);
  const cls = item.big ? "bg-gradient-to-r from-emerald-500/25 to-emerald-600/15 border-emerald-400/40 text-emerald-50" : ACCENT[item.variant];
  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      aria-live={item.variant === "error" ? "assertive" : "polite"}
      className={[
        "pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl",
        item.variant === "error" ? "animate-toast-shake" : "animate-toast-in",
        leaving ? "opacity-0" : "",
        cls,
      ].join(" ")}
    >
      {item.big && <Confetti />}
      <span className="shrink-0 mt-0.5 relative z-10">{item.big ? <PartyPopper className="h-5 w-5 text-emerald-300" /> : <Icon v={item.variant} />}</span>
      <div className="flex-1 min-w-0 relative z-10">
        <span className={`block ${item.big ? "text-sm font-bold font-space" : "text-xs font-semibold"} leading-snug`}>{item.message}</span>
        {item.action && (
          <button
            onClick={() => { item.action!.onClick(); onDismiss(); }}
            className="mt-1.5 text-[11px] font-bold underline underline-offset-2 hover:opacity-80 cursor-pointer"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-white/40 hover:text-white cursor-pointer relative z-10" aria-label="Dismiss notification">
        <X className="h-4 w-4" />
      </button>
      {item.duration > 0 && (
        <span className="absolute bottom-0 left-0 h-0.5 w-full opacity-40">
          <span className={`block h-full ${BAR[item.variant]} animate-toast-progress`} style={{ animationDuration: `${item.duration}ms` }} />
        </span>
      )}
    </div>
  );
}
