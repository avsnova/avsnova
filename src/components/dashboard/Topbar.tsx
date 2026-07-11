import { useState } from "react";
import { Menu, Search, Bell, Wallet, ChevronDown, User, LogOut, ShieldCheck, Settings } from "lucide-react";
import { cn } from "../../utils/cn";

export interface TopbarProps {
  onToggleMobileSidebar: () => void;
  onToggleNotificationDrawer: () => void;
  unreadNotifs: number;
  walletBalance: number;
  userName: string;
  onSelectSection: (section: string) => void;
  isSidebarCollapsed: boolean;
  onLogout: () => void; // Fully functional logout callback
}

export default function Topbar({
  onToggleMobileSidebar,
  onToggleNotificationDrawer,
  unreadNotifs,
  walletBalance,
  userName,
  onSelectSection,
  isSidebarCollapsed,
  onLogout,
}: TopbarProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header 
      className={cn(
        "fixed top-0 right-0 h-20 bg-[#0a0518]/90 backdrop-blur-xl border-b border-purple-500/15 z-40 flex items-center justify-between px-6 transition-all duration-300 select-none",
        isSidebarCollapsed ? "md:left-20" : "md:left-64",
        "left-0"
      )}
      style={{ paddingLeft: "max(1.5rem, env(safe-area-inset-left))", paddingRight: "max(1.5rem, env(safe-area-inset-right))" }}
    >
      {/* Left items: Mobile menu & Global Search */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 rounded-xl border border-purple-500/20 bg-black/40 text-purple-200 hover:text-white transition-colors cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Global Search widget */}
        <div className="relative w-full max-w-xs hidden sm:block">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-purple-200/40">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Search API orders, transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-black/40 border border-purple-500/20 rounded-xl text-xs sm:text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-inter"
          />
        </div>
      </div>

      {/* Right items: Quick wallet info, Bell, Avatar */}
      <div className="flex items-center gap-4 sm:gap-6">
        
        {/* Quick Wallet Link */}
        <button
          onClick={() => onSelectSection("Wallet")}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/35 rounded-xl transition-all cursor-pointer group"
        >
          <Wallet className="h-4 w-4 text-purple-400 group-hover:scale-110 transition-transform" />
          <div className="text-left">
            <div className="text-[9px] text-purple-200/50 font-bold uppercase font-space tracking-wider hidden sm:block">AVS Wallet</div>
            <div className="text-xs sm:text-sm font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-purple-100 via-white to-cyan-200">
              ₦{walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </button>

        {/* Notification Bell */}
        <button
          onClick={() => onSelectSection("Notifications")}
          className="relative p-2.5 rounded-xl bg-black/40 hover:bg-white/5 border border-purple-500/20 hover:border-purple-500/40 text-purple-200 hover:text-white transition-all cursor-pointer"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadNotifs > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-purple-600 to-cyan-400 text-[10px] font-bold text-white flex items-center justify-center font-space shadow-md animate-bounce">
              {unreadNotifs}
            </span>
          )}
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-3 pl-2 pr-3 py-1.5 bg-black/40 hover:bg-white/5 border border-purple-500/20 hover:border-purple-500/35 rounded-xl transition-all cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shadow-md font-space">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-bold text-white font-space hidden md:block">{userName}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-purple-200/50 transition-transform hidden md:block ${isProfileMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {isProfileMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsProfileMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-[#0f0923] border border-purple-500/30 rounded-2xl p-2 shadow-2xl z-20 animate-float">
                <div className="p-3 border-b border-purple-500/15 mb-2">
                  <div className="text-[10px] text-purple-200/40 font-bold uppercase tracking-wider font-space">Signed in as</div>
                  <div className="text-xs font-bold text-white truncate mt-0.5">{userName}</div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold mt-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Production Enterprise Access</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onSelectSection("Profile");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold text-purple-200 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <User className="h-4 w-4 text-purple-400" />
                    <span>User Profile & Keys</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onSelectSection("Settings");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold text-purple-200 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4 text-purple-400" />
                    <span>System Settings</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer border-t border-purple-500/10 mt-1"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log Out Portal</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}