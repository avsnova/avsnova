import { useState, useEffect } from "react";
import { Star, X } from "lucide-react";
import { apiFetch } from "../utils/api";
import { useToast } from "./ui/Toast";

// Item 10: after a completed purchase, prompt the customer for feedback.
// Polls once shortly after mount; shows a small card if a delivered order has no feedback yet.
export default function FeedbackPrompt({ userName }: { userName: string | null }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<any | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userName) return;
    let stop = false;
    const check = async () => {
      if (stop || typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await apiFetch("/api/feedback/pending");
        if (!stop && r && r.pending && !dismissed.has(r.pending.id)) setPending(r.pending);
      } catch { /* ignore */ }
    };
    const t = setTimeout(check, 4000);
    const iv = setInterval(check, 60000);
    return () => { stop = true; clearTimeout(t); clearInterval(iv); };
  }, [userName, dismissed]);

  if (!pending) return null;

  const submit = async () => {
    if (rating < 1) { toast("Please pick a star rating.", "warning"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", { method: "POST", body: JSON.stringify({ order_id: pending.id, product_id: pending.product_id, rating, comment }) });
      toast("Thanks for your feedback! 💜", "success", { big: true });
      setDismissed((d) => new Set(d).add(pending.id));
      setPending(null); setRating(0); setComment("");
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSubmitting(false); }
  };
  const close = () => { setDismissed((d) => new Set(d).add(pending.id)); setPending(null); };

  return (
    <div className="fixed bottom-4 left-4 z-[130] w-[calc(100%-2rem)] sm:w-80 rounded-2xl border border-purple-500/30 bg-[#0e0922] shadow-2xl p-4 animate-ai-pop-in">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-white font-space">How was your purchase?</h4>
          <p className="text-[11px] text-purple-200/50 mt-0.5 line-clamp-1">{pending.name}</p>
        </div>
        <button onClick={close} className="text-purple-200/40 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button>
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
    </div>
  );
}
