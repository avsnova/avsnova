import { Check } from "lucide-react";
import { ORDER_TIMELINE, statusMeta } from "./smmHelpers";

// Animated progress timeline: Submitted → Processing → Accepted → Running → Completed.
export default function SmmOrderTimeline({ status }: { status: string }) {
  const meta = statusMeta(status);
  const cancelled = meta.tone === "danger";
  const currentStep = cancelled ? 0 : meta.step;

  if (cancelled) {
    return (
      <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3 text-center">
        <span className="text-xs font-bold text-red-300">{meta.label} — this order was stopped and any eligible funds refunded.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {ORDER_TIMELINE.map((label, i) => {
        const step = i + 1;
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <div key={label} className="flex-1 flex flex-col items-center relative">
            {/* connector */}
            {i > 0 && (
              <span className={`absolute right-1/2 top-3 h-0.5 w-full -z-0 ${step <= currentStep ? "bg-gradient-to-r from-purple-500 to-cyan-400" : "bg-white/10"}`} />
            )}
            <span className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center border-2 transition-all ${
              done ? "bg-emerald-500 border-emerald-500 text-white" :
              active ? "bg-gradient-to-tr from-purple-600 to-cyan-500 border-cyan-400 text-white animate-ai-halo" :
              "bg-black/40 border-white/15 text-purple-200/30"
            }`}>
              {done ? <Check className="h-3 w-3" /> : <span className="text-[9px] font-bold">{step}</span>}
            </span>
            <span className={`text-[8px] font-bold mt-1 text-center ${active ? "text-white" : done ? "text-emerald-400/70" : "text-purple-200/30"}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
