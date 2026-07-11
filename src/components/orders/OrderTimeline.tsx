import { Check } from "lucide-react";
import { ORDER_TIMELINE, orderStatusMeta, friendlyProgress, etaFor } from "./orderTracking";

// Premium animated timeline shared platform-wide (mirrors the SMM panel style, extended
// with the full Marketplace stages). Compact by default; `detailed` shows descriptions.
export default function OrderTimeline({ status, hasCredentials, detailed = false }: { status: string; hasCredentials?: boolean; detailed?: boolean }) {
  const meta = orderStatusMeta(status, hasCredentials);

  if (meta.step === 0) {
    const tone = meta.key === "refunded" ? "purple" : "red";
    return (
      <div className={`rounded-xl border p-3 text-center ${tone === "purple" ? "bg-purple-500/8 border-purple-500/20" : "bg-red-500/8 border-red-500/20"}`}>
        <span className={`text-xs font-bold ${tone === "purple" ? "text-purple-300" : "text-red-300"}`}>{meta.label} — {meta.description}</span>
      </div>
    );
  }

  const current = meta.step;

  if (detailed) {
    return (
      <div className="space-y-0">
        {ORDER_TIMELINE.map((stage, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const pending = step > current;
          const isLast = i === ORDER_TIMELINE.length - 1;
          const eta = active ? etaFor(meta) : null;
          return (
            <div key={stage.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                  done ? "bg-emerald-500 border-emerald-500 text-white" :
                  active ? "bg-gradient-to-tr from-purple-600 to-cyan-500 border-cyan-400 text-white animate-ai-halo" :
                  "bg-black/40 border-white/15 text-purple-200/30"
                }`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{step}</span>}
                </span>
                {!isLast && <span className={`w-0.5 flex-1 min-h-[22px] ${step < current ? "bg-gradient-to-b from-emerald-500 to-cyan-400" : "bg-white/10"}`} />}
              </div>
              <div className={`pb-4 ${pending ? "opacity-40" : ""}`}>
                <div className={`text-xs font-bold font-space ${active ? "text-white" : done ? "text-emerald-400/80" : "text-purple-200/50"}`}>{stage.label}</div>
                <div className="text-[11px] text-purple-200/50 mt-0.5">{active ? friendlyProgress(meta) : stage.description}</div>
                {eta && <div className="text-[10px] text-cyan-300/70 mt-0.5">Est. {eta}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Compact horizontal timeline
  return (
    <div className="flex items-center">
      {ORDER_TIMELINE.map((stage, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={stage.key} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full -z-0 ${step <= current ? "bg-gradient-to-r from-purple-500 to-cyan-400" : "bg-white/10"}`} />}
            <span className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center border-2 transition-all ${
              done ? "bg-emerald-500 border-emerald-500 text-white" :
              active ? "bg-gradient-to-tr from-purple-600 to-cyan-500 border-cyan-400 text-white animate-ai-halo" :
              "bg-black/40 border-white/15 text-purple-200/30"
            }`}>
              {done ? <Check className="h-3 w-3" /> : <span className="text-[9px] font-bold">{step}</span>}
            </span>
            <span className={`text-[7.5px] leading-tight font-bold mt-1 text-center max-w-[52px] ${active ? "text-white" : done ? "text-emerald-400/70" : "text-purple-200/30"}`}>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}
