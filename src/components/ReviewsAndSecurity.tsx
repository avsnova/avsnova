import { useState, useEffect } from "react";
import { 
  Star, ShieldCheck, Lock, RotateCcw, Activity, 
  ChevronDown, ChevronUp, AlertCircle, HelpCircle
} from "lucide-react";
import { useToast } from "./ui/Toast";

interface Testimonial {
  author: string;
  role: string;
  quote: string;
  stars: number;
  category: "ai" | "otp" | "smm" | "support";
  avatar: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    author: "@kelechi.m",
    role: "Social Media Manager",
    quote: "I've tried three other panels — none come close to AVS for speed and reliability. My SMM orders always deliver within minutes, and the rates are unbeatable.",
    stars: 5,
    category: "smm",
    avatar: "KM",
  },
  {
    author: "@dara.creates",
    role: "Freelance Designer",
    quote: "The AI Image Studio is an absolute game changer for my workflow. I get high-res client-ready visuals in 30 seconds flat. Worth every single cent.",
    stars: 5,
    category: "ai",
    avatar: "DC",
  },
  {
    author: "@techbro.ab",
    role: "Dev / Reseller",
    quote: "Virtual numbers for OTP are always fresh. Never failed me across 20+ different platforms. Aurevashop is the ultimate plug for API services.",
    stars: 5,
    category: "otp",
    avatar: "TB",
  },
  {
    author: "@funke_online",
    role: "Content Creator",
    quote: "Customer support actually responds fast. Had an API routing issue resolved in under 10 minutes on a Sunday night. Exceptional service quality!",
    stars: 5,
    category: "support",
    avatar: "FO",
  },
];

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "How fast is the service delivery?",
    answer: "Delivery is fully automated and instantaneous. Most services, including virtual numbers, SMM boosts, and AI renders, complete in under 3 seconds after execution confirmation.",
  },
  {
    question: "What payment methods are supported?",
    answer: "You can subscribe to our API tiers or pay directly via Instant Bank Transfer, or Debit Cards (secured via Paystack/Monnify).",
  },
  {
    question: "Is there a refund policy if a service fails?",
    answer: "Absolutely! We employ an automated refund guarantee. For example, if a virtual number does not receive its OTP code within the allocated time, the transaction is automatically credited back to your payment source instantly.",
  },
  {
    question: "Can I resell these services to my own clients?",
    answer: "Yes, Aurevashop is designed with resellers and developers in mind. All our software keys, digital services, and SMM tools are priced at wholesale rates, enabling you to package and resell them at a healthy margin.",
  },
];

export default function ReviewsAndSecurity() {
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<"all" | "ai" | "otp" | "smm" | "support">("all");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  // Real-time API ping simulation
  const [ping, setPing] = useState(24);
  useEffect(() => {
    const interval = setInterval(() => {
      setPing(prev => {
        const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2
        const next = prev + delta;
        return Math.min(Math.max(next, 18), 35); // Keep between 18ms and 35ms
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredTestimonials = activeFilter === "all" 
    ? TESTIMONIALS 
    : TESTIMONIALS.filter(t => t.category === activeFilter);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <>
      {/* ——— TESTIMONIALS SECTION ——— */}
      <section id="reviews" className="relative border-t border-purple-500/15 bg-black/35 py-24 px-6 overflow-hidden">
        
        {/* Glow Blob */}
        <div className="absolute top-1/3 -right-48 h-[500px] w-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
              User Testimonials
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight">
              Trusted by Thousands
            </h2>
            <p className="text-sm text-purple-200/60 mt-4 leading-relaxed">
              Read real feedback from developers, creators, and business managers utilizing our digital services ecosystem daily.
            </p>
          </div>

          {/* Testimonial Filters */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {[
              { id: "all", label: "Show All" },
              { id: "ai", label: "AI Creative Tools" },
              { id: "otp", label: "Virtual Numbers" },
              { id: "smm", label: "Growth Panel" },
              { id: "support", label: "Customer Support" },
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  activeFilter === filter.id 
                    ? "bg-purple-500/15 border-purple-500 text-white shadow-lg shadow-purple-500/5" 
                    : "bg-black/30 border-purple-500/10 text-purple-200/50 hover:text-purple-200 hover:border-purple-500/20"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Testimonial Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTestimonials.map((t, idx) => (
              <div
                key={idx}
                className="rounded-2xl p-6 glass-panel border border-purple-500/10 flex flex-col justify-between hover:border-purple-500/25 transition-all duration-300 animate-float"
                style={{ animationDelay: `${idx * 0.15}s` }}
              >
                <div>
                  {/* Rating */}
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="h-4.5 w-4.5 text-purple-400 fill-purple-400/30" />
                    ))}
                  </div>
                  <blockquote className="text-xs md:text-sm text-purple-200/80 leading-relaxed font-medium italic">
                    "{t.quote}"
                  </blockquote>
                </div>

                {/* Author Info */}
                <div className="flex items-center gap-3.5 border-t border-purple-500/10 pt-4 mt-6">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white font-space">{t.author}</span>
                      <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                    <span className="text-[10px] text-purple-200/40 font-semibold">{t.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ——— SECURITY & TRUST SECTION ——— */}
      <section className="relative py-24 px-6 max-w-7xl mx-auto z-10">
        
        {/* Glow Orb */}
        <div className="absolute bottom-1/3 -left-48 h-[500px] w-[500px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Security Info */}
          <div className="space-y-6">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
              Security Protocol
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight leading-tight">
              Military-Grade <br />
              <span className="text-gradient-purple-cyan text-glow-purple">Security & Encryption</span>
            </h2>
            <p className="text-sm md:text-base text-purple-200/60 leading-relaxed">
              Aurevashop applies rigorous enterprise protocols to secure your account logs, API routing, and service deliveries. We run our sandbox with equivalent defensive infrastructure.
            </p>
            {/* Grid details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
              <div className="flex gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 shadow-md">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-space">End-to-End TLS</h4>
                  <p className="text-[11px] text-purple-200/50 mt-1">256-bit encryption routing for all API triggers.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 shadow-md">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-space">Instant Refunds</h4>
                  <p className="text-[11px] text-purple-200/50 mt-1">Automated payment refunds if carrier delivery fails.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Interactive Security Monitor */}
          <div className="rounded-2xl p-6 glass-panel border border-purple-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 bg-cyan-500/10 rounded-bl-xl border-l border-b border-cyan-500/15 text-[9px] text-cyan-300 font-semibold uppercase tracking-wider">
              Network Guard
            </div>
            <div className="flex items-center gap-2 mb-6">
              <Activity className="h-5 w-5 text-cyan-400 animate-pulse" />
              <span className="text-xs font-bold text-white font-space uppercase tracking-wider">Secure Nodes Status</span>
            </div>

            {/* Simulated Live Monitor */}
            <div className="space-y-4 font-mono">
              <div className="bg-black/60 border border-purple-500/10 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-purple-200/40 uppercase font-semibold">Active Gateway Ping</div>
                  <div className="text-xl font-bold font-space text-white mt-1 flex items-baseline gap-1">
                    <span>{ping}</span>
                    <span className="text-xs font-normal text-cyan-400">ms</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-purple-200/40 uppercase font-semibold">Gateway Status</div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>99.98% OK</span>
                  </div>
                </div>
              </div>

              {/* Status List */}
              <div className="bg-black/40 border border-purple-500/10 rounded-xl p-4 space-y-2.5 text-[10px]">
                <div className="flex justify-between items-center">
                  <span className="text-purple-200/50">Core System API</span>
                  <span className="text-emerald-400 font-bold uppercase flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Operational
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-200/50">Carrier OTP Node</span>
                  <span className="text-emerald-400 font-bold uppercase flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Operational
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-purple-200/50">AI Render Engine</span>
                  <span className="text-emerald-400 font-bold uppercase flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Operational
                  </span>
                </div>
              </div>

              {/* Security certification list */}
              <div className="flex items-center justify-between text-[9px] text-purple-200/30 pt-2 border-t border-purple-500/10 font-inter">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                  Enterprise Node Compliant
                </span>
                <span>Uptime SLA Guaranteed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— FAQ SECTION ——— */}
      <section id="faq" className="relative border-t border-purple-500/15 bg-black/35 py-24 px-6 overflow-hidden">
        
        {/* Glow Orb */}
        <div className="absolute top-1/2 -right-48 h-[500px] w-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
              Help Center
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-purple-200/60 mt-4 leading-relaxed">
              Find instant answers regarding service delivery speeds, tier pathways, reselling options, and security integrations.
            </p>
          </div>

          {/* FAQ Accordion List */}
          <div className="space-y-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div 
                  key={idx}
                  className="rounded-2xl border border-purple-500/15 bg-black/30 overflow-hidden transition-all duration-300"
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left transition-colors hover:bg-white/5 cursor-pointer animate-float"
                  >
                    <div className="flex items-center gap-3 pr-4">
                      <HelpCircle className={`h-4.5 w-4.5 shrink-0 ${isOpen ? "text-purple-400" : "text-purple-200/40"}`} />
                      <span className="text-xs md:text-sm font-bold text-white font-space tracking-tight">
                        {faq.question}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4.5 w-4.5 text-purple-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4.5 w-4.5 text-purple-200/40 shrink-0" />
                    )}
                  </button>
                  <div 
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      isOpen ? "max-h-[200px] border-t border-purple-500/10" : "max-h-0"
                    }`}
                  >
                    <div className="p-6 text-xs md:text-sm text-purple-200/60 leading-relaxed bg-purple-950/10">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Prompt to contact */}
          <div className="text-center mt-12 bg-gradient-to-br from-purple-950/30 to-cyan-950/10 border border-purple-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white font-space">Still have questions?</h4>
                <p className="text-[11px] text-purple-200/50 mt-0.5">Our specialized customer support desk is active around the clock.</p>
              </div>
            </div>
            <a 
              href="#support"
              onClick={(e) => {
                e.preventDefault();
                toast("This simulates the support portal — in production it launches the live chat widget.", "info");
              }}
              className="px-4 py-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 hover:border-purple-500/35 rounded-xl text-xs font-bold text-purple-300 hover:text-white transition-all duration-250 shrink-0 cursor-pointer"
            >
              Start Chat Setup
            </a>
          </div>
        </div>
      </section>
    </>
  );
}