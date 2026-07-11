import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;
const Ctx = createContext<ConfirmFn>(async () => window.confirm("Are you sure?"));
export const useConfirm = () => useContext(Ctx);

// Promise-based premium confirmation dialog. Drop-in async replacement for window.confirm():
//   if (!(await confirm("Delete this?"))) return;
// Blurred backdrop, rounded corners, keyboard accessible (Esc cancels, Enter confirms), animated.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const open = !!state;
  useBodyScrollLock(open);

  const confirm = useCallback<ConfirmFn>((optsOrMsg) => {
    const opts = typeof optsOrMsg === "string" ? { message: optsOrMsg } : optsOrMsg;
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = (val: boolean) => { state?.resolve(val); setState(null); };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {open && state && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-labelledby="confirm-title"
          onKeyDown={(e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); }}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-purple-500/25 bg-[#0c0620] shadow-2xl p-6 animate-sheet-up">
            <button onClick={() => close(false)} className="absolute top-4 right-4 text-purple-200/40 hover:text-white cursor-pointer" aria-label="Cancel"><X className="h-5 w-5" /></button>
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-4 ${state.opts.danger !== false ? "bg-red-500/15 text-red-400" : "bg-purple-500/15 text-purple-300"}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 id="confirm-title" className="text-base font-bold font-space text-white mb-1.5">{state.opts.title || "Please confirm"}</h3>
            <p className="text-sm text-purple-200/70 leading-relaxed mb-6">{state.opts.message}</p>
            <div className="flex gap-2.5">
              <button onClick={() => close(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-purple-100 hover:bg-white/10 transition-colors cursor-pointer">
                {state.opts.cancelLabel || "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all cursor-pointer ${state.opts.danger !== false ? "bg-gradient-to-r from-red-600 to-red-500 hover:brightness-110" : "bg-gradient-to-r from-purple-600 to-cyan-500 hover:brightness-110"}`}
              >
                {state.opts.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
