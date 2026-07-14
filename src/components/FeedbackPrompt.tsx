import { useState, useEffect, useRef } from "react";
import { Star, X } from "lucide-react";
import { apiFetch } from "../utils/api";
import { useToast } from "./ui/Toast";

/**
 * FeedbackPrompt — post-success feedback popup, fully admin-controlled.
 *
 * Behaviour (per product requirements):
 *  - Only appears AFTER an SMS code has been successfully received (backend /api/feedback/pending
 *    returns SMS orders that have a received code and are not cancelled/expired).
 *  - Admin controls everything via /api/feedback/config: enable/disable, appearance delay,
 *    auto-dismiss timeout, required vs optional, and on-screen position.
 *  - Dismissals persist server-side (/api/feedback/dismiss): once a customer closes it for an
 *    order it NEVER shows again for that order — across refreshes, logout/login, and revisits.
 *  - Only a brand-new qualifying order can trigger it again.
 */

interface FeedbackConfig {
  enabled: boolean;
  delaySeconds: number;
  timeoutSeconds: number;
  required: boolean;
  position: "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center";
}

const POSITION_CLASS: Record<string, string> = {
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

export default function FeedbackPrompt({ userName }: { userName: string | null }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<any | null>(null);
  const [config, setConfig] = useState<FeedbackConfig | null>(null);
  const [visible, setVisible] = useState(false); // becomes true only after the configured delay
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Session-level guard so we don't re-open the same order within this tab while the network
  // dismissal is in flight. The authoritative "never again" state lives server-side.
  const dismissedRef = useRef<Set<string>>(new Set());
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll for a qualifying pending order + the live admin config.
  useEffect(() => {
    if (!userName) return;
    let stop = false;
    const check = async () => {
      if (stop || (typeof document !== "undefined" && document.hidden)) return;
      if (pending) return; // already showing one
      try {
        const r = await apiFetch("/api/feedback/pending");
        if (stop) return;
        if (r && r.config) setConfig(r.config);
        if (r && r.config && !r.config.enabled) { setPending(null); return; }
        if (r && r.pending && !dismissedRef.current.has(r.pending.id)) {
          setConfig(r.config || null);
          setPending(r.pending);
        }
      } catch { /* ignore */ }
    };
    const t = setTimeout(check, 4000);
    const iv = setInterval(check, 60000);
    return () => { stop = true; clearTimeout(t); clearInterval(iv); };
  }, [userName, pending]);

  // Once a pending order is set, respect the configured appearance delay + auto-dismiss timeout.
  useEffect(() => {
    if (!pending) { setVisible(false); return; }
    const delayMs = Math.max(0, (config?.delaySeconds ?? 4)) * 1000;
    delayTimer.current = setTimeout(() => setVisible(true), delayMs);
    return () => { if (delayTimer.current) clearTimeout(delayTimer.current); };
  }, [pending, config]);

  // Auto-dismiss timeout (0 = never). A timeout counts as a dismissal (persisted) so it won't
  // nag the customer again — unless feedback is REQUIRED, in which case it stays open.
  useEffect(() => {
    if (!visible || !pending) return;
    const to = config?.timeoutSeconds ?? 0;
    if (to > 0 && !config?.required) {
      timeoutTimer.current = setTimeout(() => { void close(); }, to * 1000);
    }
    return () => { if (timeoutTimer.current) clearTimeout(timeoutTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pending, config]);

  if (!pending || !visible || !config || !config.enabled) return null;

  const persistDismiss = async (orderId: string) => {
    dismissedRef.current.add(orderId);
    try { await apiFetch("/api/feedback/dismiss", { method: "POST", body: JSON.stringify({ order_id: orderId }) }); }
    catch { /* best-effort; session guard still prevents re-open this tab */ }
  };

  const submit = async () => {
    if (rating < 1) { toast("Please pick a star rating.", "warning"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", { method: "POST", body: JSON.stringify({ order_id: pending.id, product_id: pending.product_id, rating, comment }) });
      toast("Thanks for your feedback! 💜", "success", { big: true });
      dismissedRef.current.add(pending.id); // a submitted order is naturally excluded server-side too
      setPending(null); setVisible(false); setRating(0); setComment("");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSubmitting(false); }
  };

  const close = async () => {
    // Required feedback cannot be closed without submitting.
    if (config.required) { toast("Please rate your experience to continue.", "warning"); return; }
    const id = pending.id;
    setPending(null); setVisible(false);
    await persistDismiss(id);
  };

  return (
    <div className={`fixed ${POSITION_CLASS[config.position] || POSITION_CLASS["bottom-left"]} z-[130] w-[calc(100%-2rem)] sm:w-80 rounded-2xl border border-purple-500/30 bg-[#0e0922] shadow-2xl p-4 animate-ai-pop-in`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-white font-space">How was your experience?</h4>
          <p className="text-[11px] text-purple-200/50 mt-0.5 line-clamp-1">{pending.name}{pending.number ? ` · ${pending.number}` : ""}</p>
        </div>
        {!config.required && (
          <button onClick={close} className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer" aria-label="Dismiss feedback"><X className="h-4 w-4" /></button>
        )}
      </div>
      <div className="flex items-center gap-1 my-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)} className="cursor-pointer p-0.5">
            <Star className={`h-6 w-6 transition-colors ${n <= (hover || rating) ? "text-amber-400 fill-amber-400" : "text-purple-500/30"}`} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Tell us more (optional)…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-2.5 rounded-xl focus:outline-none placeholder-purple-200/20 mb-2" />
      <button onClick={submit} disabled={submitting} className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{submitting ? "Sending…" : "Submit Feedback"}</button>
      {config.required && <p className="text-[10px] text-purple-200/40 text-center mt-2">Your feedback helps us improve — a quick rating is required.</p>}
    </div>
  );
}
