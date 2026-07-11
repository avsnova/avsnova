import { useState, useEffect } from "react";
import { Settings, Bell, Save, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { Card, Button, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { areUiSoundsEnabled, setUiSoundsEnabled, playUiSound } from "../../utils/notifySound";

export default function SettingsView() {
  const { toast } = useToast();
  const [uiSounds, setUiSounds] = useState<boolean>(areUiSoundsEnabled());
  // Notification switches
  const [notifService, setNotifService] = useState(true);
  const [notifPayment, setNotifPayment] = useState(true);
  const [notifRefund, setNotifRefund] = useState(true);
  const [notifMarket, setNotifMarket] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences from database
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await apiFetch("/api/profile/preferences");
        if (res.success && res.preferences) {
          setNotifService(res.preferences.notifService);
          setNotifPayment(res.preferences.notifPayment);
          setNotifRefund(res.preferences.notifRefund);
          setNotifMarket(res.preferences.notifMarket);
        }
      } catch (err) {
        console.error("Failed to load preferences:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiFetch("/api/profile/preferences", {
        method: "POST",
        body: JSON.stringify({
          notifService,
          notifPayment,
          notifRefund,
          notifMarket
        })
      });
      if (res.success) {
        toast("Preferences saved successfully.", "success");
      }
    } catch (err: any) {
      toast("Failed to save preferences: " + err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 font-inter">
      
      {/* ——— HEADER ——— */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <Settings className="h-4 w-4" />
          <span>AVS Platform Settings & Alerts</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">System Settings</h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Customize your real-time push alerts, deposit receipt delivery, and global news broadcast alerts.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 space-y-3">
          <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mx-auto" />
          <p className="text-xs text-purple-200/50 font-space">Loading preferences...</p>
        </div>
      ) : (
        <form onSubmit={handleSaveSettings} className="space-y-8">
          
          {/* ——— NOTIFICATION PREFERENCES CARD ——— */}
          <Card className="space-y-6">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-md">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-space tracking-tight">Push Broadcast & Email Alerts</h3>
                  <p className="text-xs text-purple-200/50">Filter the automated logs delivered to your dashboard and inbox</p>
                </div>
              </div>
              <Badge variant="info">AVS Alert Node</Badge>
            </div>

            <div className="space-y-4 max-w-2xl">
              {[
                { label: "AVS Service Updates & Operational Logs", desc: "Get instantly notified when API nodes undergo driver updates or capacity upgrades.", checked: notifService, onChange: (val: boolean) => setNotifService(val) },
                { label: "AVS Wallet Instant Deposit Confirmations", desc: "Receive immediate push receipts upon successful bank transfer or credit card wallet top-ups.", checked: notifPayment, onChange: (val: boolean) => setNotifPayment(val) },
                { label: "Automated Line Refund Receipts", desc: "Receive automated ledger notifications when failed virtual number activations are automatically refunded to your AVS Wallet.", checked: notifRefund, onChange: (val: boolean) => setNotifRefund(val) },
                { label: "Marketplace Flash Sales & Wholesale Discounts", desc: "Get early access notifications of exclusive digital keys, software license invitations, and eSIM campaigns.", checked: notifMarket, onChange: (val: boolean) => setNotifMarket(val) },
              ].map((pref, idx) => (
                <label key={idx} className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-black/30 border border-purple-500/15 hover:bg-black/50 transition-colors cursor-pointer select-none">
                  <div className="space-y-0.5">
                    <div className="text-xs sm:text-sm font-bold text-white font-space">{pref.label}</div>
                    <div className="text-xs text-purple-200/60 font-inter">{pref.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={pref.checked}
                    onChange={(e) => pref.onChange(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-purple-500/30 bg-black text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <div className="pt-4 border-t border-purple-500/15 flex items-center justify-end">
              <Button type="submit" size="lg" isLoading={isSaving} className="flex items-center justify-center gap-2">
                <Save className="h-4 w-4" />
                <span>Save Alert Preferences</span>
              </Button>
            </div>
          </Card>
        </form>
      )}

      {/* ——— SOUND PREFERENCES (instant, persisted locally) ——— */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2 border-b border-purple-500/15 pb-3">
          {uiSounds ? <Volume2 className="h-5 w-5 text-cyan-400" /> : <VolumeX className="h-5 w-5 text-purple-300/50" />}
          <div>
            <h3 className="text-sm font-bold font-space text-white">Interaction Sounds</h3>
            <p className="text-[11px] text-purple-200/50">Subtle audio cues for payments, incoming SMS & notifications.</p>
          </div>
        </div>
        <label className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-black/30 border border-purple-500/15 hover:bg-black/50 transition-colors cursor-pointer select-none">
          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-bold text-white font-space">Enable Sound Effects</div>
            <div className="text-xs text-purple-200/60 font-inter">Plays a short, tasteful cue on success, error and celebrations. Enabled by default.</div>
          </div>
          <input
            type="checkbox"
            checked={uiSounds}
            onChange={(e) => {
              const on = e.target.checked;
              setUiSounds(on);
              setUiSoundsEnabled(on);
              if (on) playUiSound("success");
              toast(on ? "Sound effects enabled" : "Sound effects muted", "info", { silent: !on });
            }}
            className="mt-1 h-5 w-5 rounded border-purple-500/30 bg-black text-purple-600 focus:ring-purple-500 cursor-pointer"
          />
        </label>
      </Card>
    </div>
  );
}