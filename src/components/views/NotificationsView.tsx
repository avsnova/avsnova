import { useState, useEffect } from "react";
import { Bell, CheckCircle2, ShieldCheck, AlertCircle, CheckCheck, RefreshCw, Key, Shield, ShieldAlert, Laptop, Eye, HelpCircle } from "lucide-react";
import { Card, Button, Badge, Tabs } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";

export interface DBNotification {
  id: number;
  user_id: number;
  type: "security" | "payment" | "system";
  message: string;
  is_read: number;
  created_at: string;
}

interface NotificationsViewProps {
  onRefreshNotificationsCount?: () => void;
}

export default function NotificationsView({ onRefreshNotificationsCount }: NotificationsViewProps) {
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  
  // Real login/session history for this user (device, browser, OS, IP, time).
  const [sessions, setSessions] = useState<any[]>([]);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch("/api/notifications");
      setNotifications(data || []);
      if (onRefreshNotificationsCount) onRefreshNotificationsCount();
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Load the user's REAL login/session history (device, browser, OS, IP, time).
    (async () => {
      try {
        const r = await apiFetch("/api/profile/security-log");
        if (r && r.success) setSessions(r.sessions || []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch("/api/notifications/read", { method: "POST" });
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (activeTab === "all") return true;
    return n.type === activeTab;
  });

  return (
    <div className="space-y-8 font-inter">
      
      {/* ——— HEADER ——— */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-widest mb-1 font-space">
            <Bell className="h-4 w-4 animate-pulse" />
            <span>AVS Security Alerts Control</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">Security & Alerts Center</h2>
          <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
            Inspect live security logs, verified payment receipts, platform system events, and account session information.
          </p>
        </div>
        {notifications.some(n => n.is_read === 0) && (
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="secondary" size="md" onClick={handleMarkAllRead} className="flex items-center gap-2 text-xs font-bold font-space">
              <CheckCheck className="h-4 w-4 text-purple-400" />
              <span>Mark all read</span>
            </Button>
          </div>
        )}
      </div>

      {/* ——— REAL LOGIN & DEVICE HISTORY ——— */}
      <Card className="p-5 bg-gradient-to-br from-[#1b0821]/80 to-[#0c0414]/95 border border-purple-500/10 space-y-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-red-400 uppercase tracking-wider font-space flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Security & Login History</span>
          <Laptop className="h-4 w-4 text-purple-300/60" />
        </div>
        {sessions.length === 0 ? (
          <p className="text-xs text-purple-200/40">No login sessions recorded yet. Your device and login history will appear here.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Item 8: show only the 3 most recent login entries. */}
            {sessions.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-black/25 border border-purple-500/5">
                <span className="inline-flex items-center gap-1.5 text-purple-200/80 min-w-0">
                  <Laptop className="h-3 w-3 shrink-0" />
                  <span className="truncate">{s.browser || "Unknown"} · {s.os || "Unknown"} · {s.device || "Device"}</span>
                </span>
                <span className="text-purple-300/40 font-mono shrink-0 text-right">
                  {s.ip_address ? <span className="hidden sm:inline">{s.ip_address} · </span> : null}
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ——— TRANSACTION HISTORY & ACTIVITY TABS ——— */}
      <Card className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/15 pb-4 text-left">
          <div>
            <h3 className="text-sm md:text-base lg:text-lg font-bold text-white font-space tracking-tight">System Events & Security Log</h3>
            <p className="text-xs text-purple-200/60 mt-0.5">Filter alerts, payments, and system events in real-time</p>
          </div>
          <Tabs
            tabs={[
              { id: "all", label: "All Logs", count: notifications.length },
              { id: "security", label: "Security Logs", count: notifications.filter(t => t.type === "security").length },
              { id: "payment", label: "Payment Alerts", count: notifications.filter(t => t.type === "payment").length },
              { id: "system", label: "System Events", count: notifications.filter(t => t.type === "system").length },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id)}
          />
        </div>

        <div className="space-y-4 text-left">
          {isLoading ? (
            <div className="text-center py-16 space-y-3">
              <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mx-auto" />
              <p className="text-xs text-purple-200/50">Fetching live ledger feed...</p>
            </div>
          ) : filteredNotifs.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Bell className="h-12 w-12 text-purple-400/20 mx-auto animate-pulse" />
              <p className="text-sm font-semibold text-purple-200/50 font-space">No notifications found in this category</p>
              <p className="text-xs text-purple-200/30 max-w-xs mx-auto">Real system events, security alerts, and wallet receipts will be captured here.</p>
            </div>
          ) : (
            filteredNotifs.map((n) => (
              <div 
                key={n.id}
                className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row md:items-start gap-4 group relative ${
                  n.is_read === 1
                    ? "bg-black/30 border-purple-500/10 text-purple-200/70 hover:bg-black/50" 
                    : "bg-[#120a2e] border-purple-500/30 text-white shadow-xl shadow-purple-500/5 hover:border-purple-500/50"
                }`}
              >
                <div className={`p-3 rounded-2xl border shrink-0 shadow-md self-start ${
                  n.type === "payment" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                  n.type === "security" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                  "bg-purple-500/10 border-purple-500/20 text-purple-400"
                }`}>
                  {n.type === "payment" && <CheckCircle2 className="h-5 w-5" />}
                  {n.type === "security" && <ShieldCheck className="h-5 w-5" />}
                  {n.type === "system" && <AlertCircle className="h-5 w-5" />}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-bold font-space tracking-tight text-white group-hover:text-purple-200 transition-colors truncate">
                      {n.type.toUpperCase()} EVENT ALERT
                    </h3>
                    <span className="text-[10px] font-mono text-purple-200/40 shrink-0">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed font-inter">
                    {n.message}
                  </p>
                  <div className="text-[10px] text-purple-200/40 font-mono pt-1">
                    Event Source: AVS_NODE_{n.type.toUpperCase()}
                  </div>
                </div>
                {n.is_read === 0 && (
                  <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}