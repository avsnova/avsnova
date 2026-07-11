import { useState, useEffect } from "react";
import { Sliders, Save, Palette, Package, Search as SearchIcon, Bell, Loader2, Smartphone, ShieldCheck } from "lucide-react";
import { Card, Button, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import RichTextEditor from "./RichTextEditor";

/**
 * GlobalSettingsCenter — one place for platform-wide defaults that were previously
 * scattered. Uses the reusable PATCH /api/admin/settings endpoint (whitelisted keys).
 * Payment/AI secrets are intentionally NOT here — they stay in their dedicated tabs.
 */

interface SettingsShape {
  brand_primary_color?: string; brand_accent_color?: string; brand_tagline?: string;
  default_low_stock_threshold?: number; default_delivery_estimate?: string; default_warranty_period?: string;
  seo_default_title?: string; seo_default_description?: string; seo_default_keywords?: string;
  notify_low_stock?: number; notify_new_order?: number; sms_instructions?: string;
  security_instructions?: string;
  sms_cancel_delay?: number; sms_poll_interval?: number; sms_session_timeout?: number;
}

export default function GlobalSettingsCenter() {
  const { toast } = useToast();
  const [s, setS] = useState<SettingsShape>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { const res = await apiFetch("/api/settings"); setS((res && res.settings) || res || {}); }
    catch (e: any) { toast("Failed to load settings: " + e.message, "error"); }
    finally { setLoading(false); }
  })(); }, [toast]);

  const set = (patch: Partial<SettingsShape>) => setS((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({
        brand_primary_color: s.brand_primary_color, brand_accent_color: s.brand_accent_color, brand_tagline: s.brand_tagline,
        default_low_stock_threshold: s.default_low_stock_threshold, default_delivery_estimate: s.default_delivery_estimate, default_warranty_period: s.default_warranty_period,
        seo_default_title: s.seo_default_title, seo_default_description: s.seo_default_description, seo_default_keywords: s.seo_default_keywords,
        notify_low_stock: s.notify_low_stock ? 1 : 0, notify_new_order: s.notify_new_order ? 1 : 0,
        sms_instructions: s.sms_instructions, security_instructions: s.security_instructions,
        sms_cancel_delay: s.sms_cancel_delay, sms_poll_interval: s.sms_poll_interval, sms_session_timeout: s.sms_session_timeout,
      }) });
      toast("Platform settings saved.", "success");
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-8 text-center text-purple-300/50 text-xs"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</div>;

  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white"><Sliders className="h-4.5 w-4.5 text-cyan-400" /><h3 className="text-sm sm:text-base font-bold font-space">Global Settings Center</h3></div>
        <Button onClick={save} isLoading={saving} className="flex items-center gap-1"><Save className="h-4 w-4" /> Save</Button>
      </div>

      <Card className="space-y-4 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><Palette className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">Branding</h4></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="text-xs font-bold text-purple-200/70 font-space">Primary Color</label><div className="flex gap-2 mt-1"><input type="color" value={s.brand_primary_color || "#7c3aed"} onChange={(e) => set({ brand_primary_color: e.target.value })} className="h-10 w-12 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /><input value={s.brand_primary_color || ""} onChange={(e) => set({ brand_primary_color: e.target.value })} className={inputCls} /></div></div>
          <div><label className="text-xs font-bold text-purple-200/70 font-space">Accent Color</label><div className="flex gap-2 mt-1"><input type="color" value={s.brand_accent_color || "#22d3ee"} onChange={(e) => set({ brand_accent_color: e.target.value })} className="h-10 w-12 rounded-lg bg-black/40 border border-purple-500/20 cursor-pointer" /><input value={s.brand_accent_color || ""} onChange={(e) => set({ brand_accent_color: e.target.value })} className={inputCls} /></div></div>
          <Input label="Tagline" value={s.brand_tagline || ""} onChange={(e) => set({ brand_tagline: e.target.value })} placeholder="Your digital marketplace" />
        </div>
      </Card>

      <Card className="space-y-4 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><Package className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">Inventory & Delivery Defaults</h4></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Low-stock threshold" type="number" value={String(s.default_low_stock_threshold ?? 3)} onChange={(e) => set({ default_low_stock_threshold: parseInt(e.target.value) || 0 })} />
          <Input label="Default delivery estimate" value={s.default_delivery_estimate || ""} onChange={(e) => set({ default_delivery_estimate: e.target.value })} placeholder="Instant · within minutes" />
          <Input label="Default warranty period" value={s.default_warranty_period || ""} onChange={(e) => set({ default_warranty_period: e.target.value })} placeholder="30 days" />
        </div>
      </Card>

      <Card className="space-y-4 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><SearchIcon className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">SEO Defaults</h4></div>
        <Input label="Default SEO title" value={s.seo_default_title || ""} onChange={(e) => set({ seo_default_title: e.target.value })} placeholder="Aurevashop — Buy digital products instantly" />
        <div><label className="text-xs font-bold text-purple-200/70 font-space">Default SEO description</label><textarea rows={2} value={s.seo_default_description || ""} onChange={(e) => set({ seo_default_description: e.target.value })} className={`${inputCls} mt-1`} /></div>
        <Input label="Default keywords" value={s.seo_default_keywords || ""} onChange={(e) => set({ seo_default_keywords: e.target.value })} placeholder="digital, accounts, instant" />
      </Card>

      <Card className="space-y-3 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><Bell className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">Notification Defaults</h4></div>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-200/80"><input type="checkbox" checked={!!s.notify_low_stock} onChange={(e) => set({ notify_low_stock: e.target.checked ? 1 : 0 })} className="accent-cyan-500" /> Alert admins on low credential/stock levels</label>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-200/80"><input type="checkbox" checked={!!s.notify_new_order} onChange={(e) => set({ notify_new_order: e.target.checked ? 1 : 0 })} className="accent-cyan-500" /> Alert admins on new orders</label>
      </Card>

      <Card className="space-y-4 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><Smartphone className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">SMS Provider Timing</h4></div>
        <p className="text-[11px] text-purple-300/50">Applied server-side immediately — no rebuild or restart. Controls the SMS activation lifecycle.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Cancellation delay (sec)" type="number" value={String(s.sms_cancel_delay ?? 120)} onChange={(e) => set({ sms_cancel_delay: parseInt(e.target.value) || 0 })} />
          <Input label="Poll interval (sec)" type="number" value={String(s.sms_poll_interval ?? 4)} onChange={(e) => set({ sms_poll_interval: parseInt(e.target.value) || 0 })} />
          <Input label="Session timeout (sec)" type="number" value={String(s.sms_session_timeout ?? 1200)} onChange={(e) => set({ sms_session_timeout: parseInt(e.target.value) || 0 })} />
        </div>
      </Card>

      <Card className="space-y-3 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><SearchIcon className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">SMS Activation Instructions</h4></div>
        <p className="text-[11px] text-purple-300/50">Shown to customers on the SMS Activation panel. Use one instruction per line (e.g. "Use a VPN before activation", "Complete within 20 minutes"). Lines starting with <span className="font-mono">!</span> render as warnings.</p>
        <textarea rows={6} value={s.sms_instructions || ""} onChange={(e) => set({ sms_instructions: e.target.value })} className={`${inputCls} font-mono`} placeholder={"Use a VPN before activation.\nComplete activation within 20 minutes.\n!Numbers are non-refundable after successful delivery."} />
      </Card>

      <Card className="space-y-3 border border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-200"><ShieldCheck className="h-4 w-4 text-cyan-400" /><h4 className="text-sm font-bold font-space">Security Center Instructions</h4></div>
        <p className="text-[11px] text-purple-300/50">Rich-text instructions shown to every customer inside the Security Center of a purchased credential. A product's own Setup Guide overrides this when set. Changes appear immediately for customers.</p>
        <RichTextEditor value={s.security_instructions || ""} onChange={(html) => set({ security_instructions: html })} />
      </Card>
    </div>
  );
}
