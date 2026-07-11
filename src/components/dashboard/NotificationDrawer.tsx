import { X, Bell, CheckCircle2, RefreshCw, AlertCircle, Sparkles, CheckCheck } from "lucide-react";
import { NotificationItem } from "../../mockData";
import { Button } from "../ui/shadcn";
import { cn } from "../../utils/cn";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSelectSection: (section: string) => void;
}

export default function NotificationDrawer({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onClearAll,
  onSelectSection,
}: NotificationDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-[#0c061d] border-l border-purple-500/20 shadow-2xl z-50 flex flex-col justify-between select-none animate-float">
        
        {/* Header */}
        <div className="p-6 border-b border-purple-500/15 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Bell className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-space tracking-tight">Notifications</h3>
              <p className="text-[10px] text-purple-200/50">Real-time alerts & platform logs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-purple-200/50 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-12">
              <Bell className="h-10 w-10 text-purple-400/20 animate-pulse" />
              <p className="text-xs font-semibold text-purple-200/50 font-space">Your inbox is clear</p>
              <p className="text-[10px] text-purple-200/30 max-w-[200px]">We'll notify you here upon automated transaction triggers or API status shifts.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "p-4 rounded-2xl border transition-all duration-200 space-y-2 relative group",
                  n.read 
                    ? "bg-black/20 border-purple-500/10 text-purple-200/70" 
                    : "bg-[#110a28] border-purple-500/30 text-white shadow-lg shadow-purple-500/5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {n.type === "payment" && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {n.type === "refund" && <RefreshCw className="h-4 w-4 text-cyan-400 shrink-0" />}
                    {n.type === "service" && <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />}
                    {n.type === "announcement" && <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />}
                    <h4 className="text-xs font-bold font-space truncate">{n.title}</h4>
                  </div>
                  <span className="text-[9px] font-mono text-purple-200/40 shrink-0">{n.time}</span>
                </div>
                <p className="text-[11px] text-purple-200/70 leading-relaxed font-inter">
                  {n.message}
                </p>
                {!n.read && (
                  <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-purple-500/15 bg-black/40 space-y-2 shrink-0">
          {notifications.length > 0 && (
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={onMarkAllRead}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px]"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onClearAll}
                className="px-3 text-[11px]"
              >
                Clear
              </Button>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              onClose();
              onSelectSection("Notifications");
            }}
            className="w-full text-xs text-purple-300 hover:bg-purple-500/10"
          >
            Open Full Notifications Center →
          </Button>
        </div>
      </div>
    </>
  );
}