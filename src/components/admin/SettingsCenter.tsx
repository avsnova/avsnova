import { useState, useEffect } from "react";
import {
  Settings2, CreditCard, Bot, Smartphone, Mail, Bell, ShieldCheck, Palette,
  ChevronRight, CheckCircle2, XCircle, Loader2, Sliders,
} from "lucide-react";
import { Card } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";

/**
 * SettingsCenter — an enterprise-style hub that organizes every configurable area into
 * clear categories with live status, and deep-links to the existing admin tabs that own
 * each configuration surface. This centralizes navigation WITHOUT duplicating the mature,
 * already-tested settings screens (payments, AI console, platform defaults, security).
 */

interface Props { onNavigate: (tab: string) => void; }

interface Group {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tab: string;
  items: string[];
  status?: { label: string; ok: boolean }[];
}

export default function SettingsCenter({ onNavigate }: Props) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await apiFetch("/api/settings"); setSettings(r?.settings || {}); }
      catch { setSettings({}); }
      finally { setLoading(false); }
    })();
  }, []);

  const flwOn = settings?.flutterwave_enabled === 1;
  const mnfOn = settings?.monnify_enabled === 1;

  const groups: Group[] = [
    {
      key: "general", title: "General & Branding", desc: "Site identity, colors, tagline, inventory/delivery/SEO defaults.",
      icon: <Palette className="h-5 w-5" />, tab: "platform",
      items: ["Website name & logo", "Brand colors & tagline", "Inventory & delivery defaults", "SEO defaults", "Notification defaults"],
    },
    {
      key: "system", title: "System Settings & Alerts", desc: "Core gateways, shipping costs, SMS margins, SMTP credentials.",
      icon: <Sliders className="h-5 w-5" />, tab: "settings",
      items: ["Shipping costs", "SMS/SMM pricing", "SMTP email credentials", "Paystack / Paga keys", "API providers"],
    },
    {
      key: "flutterwave", title: "Flutterwave Payments", desc: "Card & bank payments via Flutterwave.",
      icon: <CreditCard className="h-5 w-5" />, tab: "flutterwave",
      items: ["API & secret keys", "Environment", "Webhook", "Test connection"],
      status: [{ label: flwOn ? "Enabled" : "Disabled", ok: flwOn }, { label: settings?.flutterwave_environment === "live" ? "Production" : "Sandbox", ok: settings?.flutterwave_environment === "live" }],
    },
    {
      key: "monnify", title: "Monnify Payments", desc: "Reserved accounts & bank transfers via Monnify.",
      icon: <CreditCard className="h-5 w-5" />, tab: "monnify",
      items: ["API & secret keys", "Contract code", "Environment", "Test connection"],
      status: [{ label: mnfOn ? "Enabled" : "Disabled", ok: mnfOn }, { label: settings?.monnify_environment === "live" ? "Production" : "Sandbox", ok: settings?.monnify_environment === "live" }],
    },
    {
      key: "ai", title: "AI Assistant", desc: "OpenAI, Gemini, Claude providers, models, prompts & usage.",
      icon: <Bot className="h-5 w-5" />, tab: "ai",
      items: ["Provider & model", "API keys", "Temperature & limits", "Knowledge base", "Test connection"],
    },
    {
      key: "sms", title: "SMS Verification", desc: "Provider keys, pricing, session timeouts & activation instructions.",
      icon: <Smartphone className="h-5 w-5" />, tab: "sms",
      items: ["Provider API key", "SMS margin", "Session & cancel timeouts", "Activation instructions"],
    },
    {
      key: "email", title: "Email & Notifications", desc: "SMTP sender, templates, announcements & alert defaults.",
      icon: <Mail className="h-5 w-5" />, tab: "settings",
      items: ["SMTP host & sender", "Branded templates", "Announcement bar", "Notification toggles"],
    },
    {
      key: "announcements", title: "Announcements & Banners", desc: "Marketing bars, popups and marketplace banners with scheduling.",
      icon: <Bell className="h-5 w-5" />, tab: "announcements",
      items: ["Announcement bar", "Popups", "Scheduling & targeting", "Marketplace banners"],
    },
    {
      key: "security", title: "Security & Access", desc: "Roles, permissions, audit log & access rules.",
      icon: <ShieldCheck className="h-5 w-5" />, tab: "permissions",
      items: ["Role-based permissions", "Custom roles", "Audit log retention", "Admin access rules"],
    },
  ];

  if (loading) return <div className="py-16 text-center text-purple-300/50 text-xs"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading settings…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight flex items-center gap-2"><Settings2 className="h-5 w-5 text-cyan-400" /> Settings Center</h3>
        <p className="text-xs text-purple-200/50 mt-0.5">Every configurable area of the platform, organized in one place. Select a category to manage it.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => onNavigate(g.tab)}
            className="text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 rounded-2xl"
          >
            <Card className="h-full border border-purple-500/10 hover:border-purple-500/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">{g.icon}</span>
                <ChevronRight className="h-4 w-4 text-purple-300/30 group-hover:text-white transition-colors" />
              </div>
              <h4 className="text-sm font-bold text-white font-space">{g.title}</h4>
              <p className="text-[11px] text-purple-200/50 mt-0.5 leading-relaxed">{g.desc}</p>
              {g.status && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {g.status.map((s, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide ${s.ok ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : "bg-neutral-500/10 border-neutral-500/25 text-neutral-400"}`}>
                      {s.ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}{s.label}
                    </span>
                  ))}
                </div>
              )}
              <ul className="mt-3 space-y-1 border-t border-purple-500/5 pt-2">
                {g.items.slice(0, 4).map((it, i) => (
                  <li key={i} className="text-[10px] text-purple-300/40 flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-purple-400/40" />{it}</li>
                ))}
              </ul>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
