import { useState, useEffect, useRef } from "react";
import {
  Users, ShoppingBag, Smartphone, TrendingUp, ShieldCheck, Zap, Globe, Clock,
  Star, Lock, CheckCircle2, ArrowRight, CreditCard, Headphones
} from "lucide-react";

// Animated count-up number that triggers when scrolled into view.
function Counter({ to, suffix = "", prefix = "", duration = 1600 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.floor(eased * to));
          if (p < 1) requestAnimationFrame(step);
          else setVal(to);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

const STATS = [
  { icon: Users, value: 25000, suffix: "+", label: "Active Users", color: "text-purple-300" },
  { icon: Smartphone, value: 180, suffix: "+", label: "Countries Covered", color: "text-cyan-300" },
  { icon: ShoppingBag, value: 120000, suffix: "+", label: "Orders Delivered", color: "text-emerald-300" },
  { icon: TrendingUp, value: 99, suffix: "%", label: "Uptime Reliability", color: "text-amber-300" },
];

const TRUST = [
  { icon: Zap, title: "Instant Delivery", desc: "Automated fulfillment in seconds." },
  { icon: ShieldCheck, title: "Bank-grade Security", desc: "Encrypted wallet & transactions." },
  { icon: Globe, title: "Global Coverage", desc: "Numbers & services worldwide." },
  { icon: Clock, title: "24/7 Support", desc: "Real humans, always online." },
  { icon: Lock, title: "Private by Design", desc: "Your data stays yours." },
  { icon: CreditCard, title: "Flexible Payments", desc: "Paystack, Paga & recharge codes." },
];

const SHOWCASE = [
  {
    icon: Smartphone, tag: "SMS Verification", title: "Virtual Numbers, On Demand",
    desc: "Rent secure phone numbers to receive OTPs from any platform — WhatsApp, Telegram, Google, and 500+ services worldwide.",
    points: ["Instant number allocation", "Auto-refund if no code", "Real-time code delivery"],
    accent: "from-cyan-500/20 to-blue-500/10", ring: "border-cyan-500/25",
  },
  {
    icon: TrendingUp, tag: "Social Media Growth", title: "Grow Your Reach, Fast",
    desc: "Boost followers, likes, views and engagement across Instagram, TikTok, YouTube, X and more — at wholesale rates.",
    points: ["Real, high-quality engagement", "Drip-feed & instant options", "Transparent live pricing"],
    accent: "from-purple-500/20 to-pink-500/10", ring: "border-purple-500/25",
  },
  {
    icon: ShoppingBag, tag: "Digital Marketplace", title: "Premium Products & Keys",
    desc: "Software licenses, premium accounts, VPNs, gift cards and physical gadgets — delivered instantly to your inventory.",
    points: ["Instant digital delivery", "International shipping", "Verified, secure products"],
    accent: "from-emerald-500/20 to-teal-500/10", ring: "border-emerald-500/25",
  },
];

export default function LandingHighlights({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="relative z-10">
      {/* ——— Stats / Counters ——— */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#12082b]/70 to-[#080416]/90 p-5 sm:p-6 text-center hover:border-purple-500/30 transition-all">
              <s.icon className={`h-6 w-6 mx-auto mb-2 ${s.color}`} />
              <div className={`text-2xl sm:text-3xl font-black font-space ${s.color}`}>
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <div className="text-[10px] sm:text-xs text-purple-200/50 mt-1 uppercase tracking-wide font-space">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Service showcases ——— */}
      <section className="py-16 px-6 max-w-6xl mx-auto space-y-6">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-3 font-space">What we offer</span>
          <h2 className="text-2xl md:text-4xl font-extrabold font-space text-white tracking-tight">One platform. Every digital service.</h2>
          <p className="text-xs md:text-sm text-purple-200/60 mt-3">Everything you need — verification, growth, and premium products — in a single, unified dashboard.</p>
        </div>

        {SHOWCASE.map((s, i) => (
          <div key={s.tag} className={`grid md:grid-cols-2 gap-6 items-center rounded-3xl border ${s.ring} bg-gradient-to-br ${s.accent} p-6 sm:p-8 ${i % 2 === 1 ? "md:[direction:rtl]" : ""}`}>
            <div className="[direction:ltr] space-y-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/70 uppercase tracking-widest font-space"><s.icon className="h-4 w-4" /> {s.tag}</span>
              <h3 className="text-xl sm:text-2xl font-black font-space text-white">{s.title}</h3>
              <p className="text-xs sm:text-sm text-purple-100/70 leading-relaxed">{s.desc}</p>
              <ul className="space-y-1.5 pt-1">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-xs sm:text-sm text-purple-100/80"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> {p}</li>
                ))}
              </ul>
              <button onClick={onGetStarted} className="mt-3 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer font-space">
                <span>Get Started</span><ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="[direction:ltr] relative h-40 sm:h-56 rounded-2xl bg-black/30 border border-white/10 overflow-hidden flex items-center justify-center">
              <s.icon className="h-20 w-20 text-white/10" />
              <div className="absolute inset-0 bg-grid opacity-10" />
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-white/50 font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ——— Trust indicators ——— */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3 font-space">Why choose us</span>
          <h2 className="text-2xl md:text-4xl font-extrabold font-space text-white tracking-tight">Built for trust & speed</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRUST.map((t) => (
            <div key={t.title} className="flex items-start gap-3 rounded-2xl border border-purple-500/15 bg-black/30 p-5 hover:border-purple-500/30 transition-all">
              <span className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-cyan-400 shrink-0"><t.icon className="h-5 w-5" /></span>
              <div>
                <h4 className="font-bold text-white text-sm font-space">{t.title}</h4>
                <p className="text-xs text-purple-200/60 mt-0.5 leading-relaxed">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
        {/* rating strip */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-purple-200/60 text-xs">
          <div className="flex items-center gap-1">{[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</div>
          <span className="font-space">Rated <span className="text-white font-bold">4.9/5</span> by thousands of verified customers</span>
          <span className="hidden sm:inline">·</span>
          <span className="flex items-center gap-1"><Headphones className="h-4 w-4 text-emerald-400" /> 24/7 human support</span>
        </div>
      </section>

      {/* ——— Final CTA band ——— */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl border border-purple-500/25 bg-gradient-to-r from-purple-700/30 via-[#0c0420] to-cyan-700/20 p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10" />
          <div className="relative z-10">
            <h2 className="text-2xl md:text-4xl font-black font-space text-white tracking-tight">Ready to get started?</h2>
            <p className="text-xs md:text-sm text-purple-200/70 mt-3 max-w-xl mx-auto">Create your free account in seconds. No card required — fund your wallet only when you're ready to buy.</p>
            <button onClick={onGetStarted} className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer font-space shadow-lg shadow-purple-500/25">
              <span>Create Free Account</span><ArrowRight className="h-4 w-4" />
            </button>
            <div className="mt-5 flex items-center justify-center gap-4 text-[10px] text-purple-200/40 font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-emerald-500" /> No Card Required</span>
              <span>·</span>
              <span>Instant Setup</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
