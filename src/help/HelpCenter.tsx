import { useState } from "react";
import {
  ShieldCheck, Search, ChevronRight, ArrowLeft, BookOpen, HelpCircle, Wrench, Lightbulb, Info, LogIn, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";
import { HELP_GUIDES, getGuide, searchGuides, type HelpGuide } from "./helpGuides";
import { ServiceLogo } from "../components/ui/BrandIcon";

// Public, login-free Help Center. Rendered by App BEFORE the auth gate when the hash
// is #help or #help/<slug>. Shareable & safe — exposes only guide content, with clear
// CTAs to sign in / create an account for the full platform.

function Shell({ children, onSignIn, onSignUp }: { children: React.ReactNode; onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="min-h-screen bg-[#03000a] text-[#f5f0ff] relative overflow-x-clip">
      <div className="absolute top-[8%] left-[8%] w-72 h-72 rounded-full bg-purple-600/10 blur-[110px] pointer-events-none" />
      <div className="absolute top-[45%] right-[8%] w-72 h-72 rounded-full bg-cyan-600/10 blur-[110px] pointer-events-none" />
      <div className="absolute inset-0 digital-grid opacity-10 pointer-events-none" />

      {/* Public header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-black/50 border-b border-purple-500/15">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2 group">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg"><ShieldCheck className="h-5 w-5 text-white" /></span>
            <span className="text-lg font-black font-space bg-gradient-to-r from-white to-cyan-300 bg-clip-text text-transparent">Aurevashop <span className="text-purple-300/70 font-bold">Help</span></span>
          </a>
          <div className="flex items-center gap-2">
            <button onClick={onSignIn} className="text-xs font-bold text-purple-200/80 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer">Log In</button>
            <button onClick={onSignUp} className="text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 rounded-xl hover:brightness-110 cursor-pointer inline-flex items-center gap-1.5">Create Account <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>

      <footer className="relative z-10 border-t border-purple-500/10 mt-16 py-8 text-center text-xs text-purple-200/40">
        © {new Date().getFullYear()} Aurevashop · <button onClick={onSignIn} className="text-cyan-400 hover:underline cursor-pointer">Sign in to your account</button>
      </footer>
    </div>
  );
}

export default function HelpCenter({ slug, onSignIn, onSignUp, onNavigateSlug, onHome }: {
  slug?: string; onSignIn: () => void; onSignUp: () => void; onNavigateSlug: (slug: string) => void; onHome: () => void;
}) {
  const guide = slug ? getGuide(slug) : undefined;
  if (slug && guide) return <Shell onSignIn={onSignIn} onSignUp={onSignUp}><GuideView guide={guide} onBack={onHome} onSignUp={onSignUp} /></Shell>;
  return <Shell onSignIn={onSignIn} onSignUp={onSignUp}><HelpIndex onOpen={onNavigateSlug} notFound={!!slug && !guide} /></Shell>;
}

function HelpIndex({ onOpen, notFound }: { onOpen: (slug: string) => void; notFound: boolean }) {
  const [q, setQ] = useState("");
  const results = searchGuides(q);
  const categories = Array.from(new Set(results.map((g) => g.category)));

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-purple-500/25 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-200"><BookOpen className="h-3.5 w-3.5 text-cyan-300" /> Knowledge Center</div>
        <h1 className="text-3xl sm:text-4xl font-black font-space">How can we help?</h1>
        <p className="text-sm text-purple-200/60 max-w-xl mx-auto">Guides, FAQs and troubleshooting for every Aurevashop service — free to read and share.</p>
        <div className="relative max-w-md mx-auto pt-2">
          <Search className="absolute left-3.5 top-1/2 translate-y-0.5 h-4 w-4 text-purple-300/50" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides (Facebook, Netflix, VPN…)"
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
        </div>
      </div>

      {notFound && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300 text-xs text-center py-2.5">That guide wasn't found — browse all guides below.</div>}

      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-purple-300/70 font-space">{cat}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.filter((g) => g.category === cat).map((g) => (
              <button key={g.slug} onClick={() => onOpen(g.slug)}
                className="text-left rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#12082b]/70 to-[#090317]/90 p-4 hover:border-purple-500/35 card-lift cursor-pointer flex items-start gap-3">
                <span className="h-11 w-11 rounded-xl bg-white/5 border border-purple-500/12 flex items-center justify-center shrink-0">
                  <ServiceLogo name={g.brand || g.title} fallback={g.emoji} size={24} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white font-space flex items-center gap-1">{g.title} <ChevronRight className="h-3.5 w-3.5 text-purple-300/40" /></div>
                  <div className="text-[11px] text-purple-200/50 mt-0.5 line-clamp-2">{g.tagline}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {results.length === 0 && <div className="text-center text-sm text-purple-200/40 py-10">No guides match "{q}".</div>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-purple-500/15 bg-black/25 p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white font-space mb-3">{icon}{title}</h3>
      {children}
    </div>
  );
}

function GuideView({ guide, onBack, onSignUp }: { guide: HelpGuide; onBack: () => void; onSignUp: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <article className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-300 hover:text-white cursor-pointer"><ArrowLeft className="h-3.5 w-3.5" /> All guides</button>

      {/* Hero */}
      <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#1a0f3d] to-[#0a0418] p-6 flex items-center gap-4">
        <span className="h-16 w-16 rounded-2xl bg-white/5 border border-purple-500/15 flex items-center justify-center shrink-0">
          <ServiceLogo name={guide.brand || guide.title} fallback={guide.emoji} size={36} />
        </span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300/70">{guide.category}</div>
          <h1 className="text-2xl sm:text-3xl font-black font-space text-white">{guide.title}</h1>
          <p className="text-sm text-purple-200/60 mt-1">{guide.tagline}</p>
        </div>
      </div>

      <Section icon={<Info className="h-4 w-4 text-cyan-300" />} title="What it is">
        <p className="text-sm text-purple-200/70 leading-relaxed">{guide.what}</p>
      </Section>

      <Section icon={<BookOpen className="h-4 w-4 text-purple-300" />} title="How to use it">
        <ol className="space-y-2">
          {guide.howto.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-purple-100/80">
              <span className="shrink-0 h-6 w-6 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-500 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<HelpCircle className="h-4 w-4 text-emerald-300" />} title="Frequently asked questions">
        <div className="space-y-2">
          {guide.faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-purple-500/10 bg-black/30 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03]">
                <span className="text-sm font-bold text-white">{f.q}</span>
                {openFaq === i ? <ChevronUp className="h-4 w-4 text-purple-300/50 shrink-0" /> : <ChevronDown className="h-4 w-4 text-purple-300/50 shrink-0" />}
              </button>
              {openFaq === i && <div className="px-4 pb-3 text-sm text-purple-200/70 leading-relaxed animate-fade-up">{f.a}</div>}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section icon={<Wrench className="h-4 w-4 text-amber-300" />} title="Troubleshooting">
          <ul className="space-y-1.5">{guide.troubleshooting.map((t, i) => <li key={i} className="text-sm text-purple-200/70 flex gap-2"><span className="text-amber-400">•</span>{t}</li>)}</ul>
        </Section>
        <Section icon={<Lightbulb className="h-4 w-4 text-cyan-300" />} title="Best practices">
          <ul className="space-y-1.5">{guide.bestPractices.map((t, i) => <li key={i} className="text-sm text-purple-200/70 flex gap-2"><span className="text-cyan-400">•</span>{t}</li>)}</ul>
        </Section>
      </div>

      {guide.notes.length > 0 && (
        <div className="rounded-2xl border border-purple-500/10 bg-purple-950/15 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300/60 mb-1.5">Important notes</div>
          <ul className="space-y-1">{guide.notes.map((n, i) => <li key={i} className="text-xs text-purple-200/60 flex gap-2"><span>•</span>{n}</li>)}</ul>
        </div>
      )}

      {/* CTA */}
      <div className="rounded-3xl border border-purple-500/25 bg-gradient-to-r from-purple-600/15 to-cyan-500/10 p-6 text-center">
        <h3 className="text-lg font-bold font-space text-white">Ready to get started?</h3>
        <p className="text-sm text-purple-200/60 mt-1">Create a free account to browse, buy and instantly receive {guide.title}.</p>
        <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold px-6 py-3 rounded-2xl hover:brightness-110 active:scale-95 transition-all cursor-pointer">
          <LogIn className="h-4 w-4" /> Create Free Account
        </button>
      </div>
    </article>
  );
}

// Public route detection from the hash. Returns { isHelp, slug } for #help / #help/<slug>.
export function parseHelpHash(hash: string): { isHelp: boolean; slug?: string } {
  const h = decodeURIComponent((hash || "").replace(/^#/, ""));
  if (h === "help") return { isHelp: true };
  const m = h.match(/^help\/(.+)$/);
  if (m) return { isHelp: true, slug: m[1] };
  return { isHelp: false };
}
