import { useState, useEffect } from "react";
import {
  MessageSquare, ExternalLink, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
  Mail, Send, MessageCircle, Users, Phone, Globe, LifeBuoy, Copy, CheckCircle2
} from "lucide-react";
import { Card } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";

// Icon registry so admins can reference icons by name
const ICONS: Record<string, any> = {
  Mail, Send, MessageCircle, Users, Phone, Globe, MessageSquare, LifeBuoy, ExternalLink
};
function iconFor(name?: string) {
  const C = (name && ICONS[name]) || MessageSquare;
  return <C className="h-5 w-5" />;
}

interface ContactMethod { id: string; label: string; value: string; type: string; icon?: string; }
interface CommunityLink { id: string; label: string; url: string; icon?: string; description?: string; }
interface Faq { id: string; question: string; answer: string; }

export default function SupportView() {
  const [contactMethods, setContactMethods] = useState<ContactMethod[]>([]);
  const [communityLinks, setCommunityLinks] = useState<CommunityLink[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch("/api/support/config");
      if (data && data.success) {
        setContactMethods(data.contactMethods || []);
        setCommunityLinks(data.communityLinks || []);
        setFaqs(data.faqs || []);
      }
    } catch (err) {
      console.error("Failed to load support config:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleContact = async (m: ContactMethod) => {
    if (m.type === "email") {
      const ok = await copyToClipboard(m.value);
      if (ok) { setCopied(m.id); setTimeout(() => setCopied(null), 1500); }
      window.location.href = `mailto:${m.value}`;
    } else if (m.type === "phone") {
      window.location.href = `tel:${m.value}`;
    } else {
      window.open(m.value, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="space-y-8 font-inter relative">
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* HERO */}
      <div className="relative z-10 overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#12082b]/80 to-[#05020a]/95 p-8 sm:p-10 text-left">
        <div className="flex items-center gap-2.5 text-cyan-400 font-semibold text-xs uppercase tracking-widest mb-2 font-space">
          <LifeBuoy className="h-4 w-4 animate-pulse-slow" />
          <span>AVShop Support Center</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-black font-space tracking-tight text-white leading-none">
          How can we help you?
        </h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-3 max-w-2xl leading-relaxed">
          Reach our verified support desks, join the community, or browse the FAQ. Our team responds fast across all official channels.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20 relative z-10">
          <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin mx-auto" />
          <p className="text-xs text-purple-200/50 font-mono mt-3">Loading support channels…</p>
        </div>
      ) : (
        <>
          {/* CONTACT METHODS */}
          <div className="relative z-10 space-y-4">
            <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider font-space">Contact Us Directly</h3>
            {contactMethods.length === 0 ? (
              <p className="text-xs text-purple-200/30 italic">No contact methods available right now.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {contactMethods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleContact(m)}
                    className="group flex items-center gap-4 p-5 rounded-2xl border border-purple-500/15 bg-black/30 hover:border-cyan-400/40 hover:bg-black/50 transition-all cursor-pointer text-left"
                  >
                    <span className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/15 text-cyan-400 group-hover:scale-105 transition-transform">
                      {iconFor(m.icon)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-white text-sm font-space">{m.label}</span>
                      <span className="block text-[11px] text-purple-200/50 truncate mt-0.5 font-mono">{m.value}</span>
                    </span>
                    {m.type === "email" && (
                      copied === m.id
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 ml-auto shrink-0" />
                        : <Copy className="h-4 w-4 text-purple-300/40 ml-auto shrink-0 group-hover:text-cyan-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* COMMUNITY LINKS */}
          {communityLinks.length > 0 && (
            <div className="relative z-10 space-y-4">
              <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider font-space">Join the Community</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {communityLinks.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => window.open(c.url, "_blank", "noopener,noreferrer")}
                    className="group flex items-center justify-between gap-4 p-5 rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#0e0624]/80 to-[#050212]/95 hover:border-cyan-400/40 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/15 text-cyan-400">{iconFor(c.icon)}</span>
                      <div className="min-w-0">
                        <span className="block font-bold text-white text-sm font-space">{c.label}</span>
                        {c.description && <span className="block text-[11px] text-purple-200/50 mt-0.5 truncate">{c.description}</span>}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-purple-300/40 group-hover:text-cyan-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FAQ ACCORDION */}
          {faqs.length > 0 && (
            <div className="relative z-10 space-y-4">
              <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider font-space">Frequently Asked Questions</h3>
              <div className="space-y-2.5">
                {faqs.map((f) => {
                  const open = openFaq === f.id;
                  return (
                    <div key={f.id} className="rounded-2xl border border-purple-500/15 bg-black/30 overflow-hidden">
                      <button
                        onClick={() => setOpenFaq(open ? null : f.id)}
                        className="w-full flex items-center justify-between gap-4 p-4 text-left cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <span className="font-bold text-white text-sm">{f.question}</span>
                        {open ? <ChevronUp className="h-4 w-4 text-cyan-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-purple-300/50 shrink-0" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 text-xs text-purple-200/70 leading-relaxed border-t border-purple-500/10 pt-3 whitespace-pre-wrap">
                          {f.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Security note */}
          <div className="p-4 bg-cyan-950/15 border border-cyan-500/20 rounded-2xl text-xs sm:text-sm text-cyan-400 leading-relaxed flex items-start gap-3 relative z-10">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider block text-[10px] font-space mb-0.5">Stay Safe</span>
              <span>Our support team will never ask for your password, 2FA codes, or full card details. Only use the official channels listed above.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
