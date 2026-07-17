import { useState, useEffect } from "react";
import {
  Shield, Globe, Facebook, Instagram, Twitter, Music2, Linkedin, Youtube,
  Send, MessageCircle, Github, Link as LinkIcon,
} from "lucide-react";
import { apiFetch } from "../utils/api";

// Map a platform key to an icon + accessible label. Unknown/custom → generic link icon.
const PLATFORM_META: Record<string, { icon: any; label: string }> = {
  facebook: { icon: Facebook, label: "Facebook" },
  instagram: { icon: Instagram, label: "Instagram" },
  x: { icon: Twitter, label: "X (Twitter)" },
  tiktok: { icon: Music2, label: "TikTok" },
  linkedin: { icon: Linkedin, label: "LinkedIn" },
  youtube: { icon: Youtube, label: "YouTube" },
  telegram: { icon: Send, label: "Telegram" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  discord: { icon: MessageCircle, label: "Discord" },
  github: { icon: Github, label: "GitHub" },
  custom: { icon: LinkIcon, label: "Link" },
};

interface SocialLink { id: string; platform: string; label?: string; url: string }

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [brand, setBrand] = useState("AUREVASHOP DIGITAL (AVS)");
  const [domain, setDomain] = useState("avsnova.com");
  const [tagline, setTagline] = useState(
    "Your comprehensive, unified platform for instant global virtual verification codes, SMM organic growth panels, and secure software marketplace solutions."
  );
  const [social, setSocial] = useState<SocialLink[]>([]);

  useEffect(() => {
    let alive = true;
    // Branding from public settings (falls back to sensible defaults if unavailable).
    apiFetch("/api/settings").then((r) => {
      if (!alive || !r || !r.settings) return;
      const s = r.settings;
      if (s.site_name) setBrand(s.site_name);
      if (s.brand_tagline) setTagline(s.brand_tagline);
      if (s.external_support_url) {
        try { setDomain(new URL(s.external_support_url).hostname.replace(/^www\./, "")); }
        catch { /* keep default */ }
      }
    }).catch(() => {});
    // Admin-managed social links — only active ones are returned.
    apiFetch("/api/social-links").then((r) => {
      if (alive && r && Array.isArray(r.links)) setSocial(r.links);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <footer className="relative border-t border-purple-500/15 bg-black/50 pt-20 pb-8 px-6 overflow-hidden">
      {/* Glow */}
      <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10">

        {/* Footer Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">

          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-6">
            <a href="#" className="flex items-center gap-2 group select-none">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-md">
                <Shield className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-lg font-black font-space tracking-tight text-white">
                {brand}
              </span>
            </a>

            <p className="text-xs text-purple-200/50 leading-relaxed max-w-sm">
              {tagline}
            </p>

            {/* Social Icons — rendered ONLY when the admin has configured active links.
                When none exist, the entire section is hidden (no empty placeholder icons). */}
            {social.length > 0 && (
              <div className="flex flex-wrap gap-3.5">
                {social.map((s) => {
                  const meta = PLATFORM_META[s.platform] || PLATFORM_META.custom;
                  const Icon = meta.icon;
                  const label = s.label || meta.label;
                  return (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={label}
                      title={label}
                      className="h-8 w-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-purple-200/40 hover:text-white hover:bg-purple-500/10 hover:border-purple-500/20 transition-all"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Links Col 1: Services */}
          <div className="space-y-4">
            <h5 className="text-[11px] font-bold text-purple-200/40 uppercase tracking-widest font-space">Services</h5>
            <ul className="space-y-2.5 text-xs text-purple-200/60 font-medium">
              <li><a href="#services" className="hover:text-white transition-colors">SMM Growth Panel</a></li>
              <li><a href="#services" className="hover:text-white transition-colors">Digital Software Keys</a></li>
              <li><a href="#services" className="hover:text-white transition-colors">PDF Generator</a></li>
            </ul>
          </div>

          {/* Links Col 2: Company */}
          <div className="space-y-4">
            <h5 className="text-[11px] font-bold text-purple-200/40 uppercase tracking-widest font-space">Company</h5>
            <ul className="space-y-2.5 text-xs text-purple-200/60 font-medium">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pricing Structure</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Affiliate Program</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Digital Blog</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Press Kit</a></li>
            </ul>
          </div>

          {/* Links Col 3: Support */}
          <div className="space-y-4">
            <h5 className="text-[11px] font-bold text-purple-200/40 uppercase tracking-widest font-space">Support & Rules</h5>
            <ul className="space-y-2.5 text-xs text-purple-200/60 font-medium">
              <li><a href="#help" className="hover:text-white transition-colors">Help Center &amp; Guides</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Support</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Shield</a></li>
              <li><a href="#" className="hover:text-white transition-colors">API Documentation</a></li>
            </ul>
          </div>
        </div>

        {/* Payment Gateways / Trust badges Strip */}
        <div className="border-t border-purple-500/10 pt-8 pb-6 flex flex-wrap justify-between items-center gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] text-purple-200/40 font-bold uppercase tracking-wider font-space pr-2">Secure Channels</span>
            {["Paystack", "Flutterwave", "Monnify", "Mastercard", "Visa"].map((gw, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded bg-[#0d0720] border border-purple-500/10 text-[9px] font-mono text-purple-200/50 font-bold tracking-tight"
              >
                {gw}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-purple-200/30 flex items-center gap-1 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>All systems active (99.98%)</span>
          </div>
        </div>

        {/* Footer Bottom Copyright */}
        <div className="border-t border-purple-500/10 pt-6 mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-purple-200/40 font-semibold">
          <div>
            © {currentYear} {brand}. All rights reserved. · {domain}
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">Anti-Fraud Policy</a>
            <span>·</span>
            <a href="#" className="hover:text-white transition-colors">Refund Guarantee</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
