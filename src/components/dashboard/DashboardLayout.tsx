import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import BottomNav from "./BottomNav";
import Breadcrumbs from "./Breadcrumbs";
import { cn } from "../../utils/cn";

interface DashboardLayoutProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  walletBalance: number;
  userName: string;
  unreadNotifs: number; // passed down dynamically!
  isAdmin?: boolean;
  onLogout: () => void;
  children: React.ReactNode;
  dynamicSidebarItems?: any[];
}

export default function DashboardLayout({
  activeSection,
  onSelectSection,
  walletBalance,
  userName,
  unreadNotifs,
  isAdmin = false,
  onLogout,
  children,
  dynamicSidebarItems,
}: DashboardLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Smart responsive sidebar auto-collapse for tablet viewports.
  // Debounced so dragging the desktop window edge doesn't fire dozens of
  // handler calls per second (a source of jank on desktop Chromium/Firefox).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const apply = () => {
      const w = window.innerWidth;
      const shouldCollapse = w >= 768 && w < 1140;
      // Only update when the value actually changes → avoids redundant re-renders.
      setIsSidebarCollapsed((prev) => (prev === shouldCollapse ? prev : shouldCollapse));
    };
    const handleResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener("resize", handleResize); };
  }, []);

  return (
    <div className="min-h-screen bg-[#03000a] text-[#f5f0ff] relative flex overflow-x-clip selection:bg-purple-500/30 selection:text-white">
      
      {/* ——— BACKGROUND DECORATIVE GRIDS & ORBS ——— */}
      {/* Soft ambient glows rendered as cheap radial-gradients instead of large CSS blur
          filters. Big blur-[140px] elements force the GPU to recompute a costly blur on
          every repaint (a major scroll/interaction jank source); radial-gradients are
          effectively free and look identical for these faint orbs. */}
      <div
        className="absolute top-[10%] left-[5%] w-[300px] h-[300px] md:w-[600px] md:h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(147,51,234,0.10) 0%, rgba(147,51,234,0) 70%)" }}
      />
      <div
        className="absolute top-[50%] right-[5%] w-[300px] h-[300px] md:w-[600px] md:h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(8,145,178,0.10) 0%, rgba(8,145,178,0) 70%)" }}
      />
      <div className="absolute inset-0 digital-grid opacity-15 pointer-events-none" />

      {/* ——— SIDEBAR ——— */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        unreadNotifs={unreadNotifs}
        isAdmin={isAdmin}
        dynamicSidebarItems={dynamicSidebarItems}
      />

      {/* ——— TOPBAR ——— */}
      <Topbar
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onToggleNotificationDrawer={() => {}} // Navigation handled internally
        unreadNotifs={unreadNotifs}
        walletBalance={walletBalance}
        userName={userName}
        onSelectSection={onSelectSection}
        isSidebarCollapsed={isSidebarCollapsed}
        onLogout={onLogout}
      />

      {/* ——— MAIN CONTENT CONTAINER ——— */}
      {/* NOTE: we intentionally avoid creating a stacking/clipping context here (no z-index,
          no transform, no overflow-hidden). Otherwise `fixed z-50` modals rendered inside the
          page content would be trapped below the fixed header (z-40) and clipped. Modals must be
          able to layer above the entire app. */}
      <main
        className={cn(
          "flex-1 pt-20 transition-all duration-300 min-h-screen flex flex-col justify-between w-full",
          isSidebarCollapsed ? "md:pl-20" : "md:pl-64",
          "pl-0"
        )}
      >
        {/* pb accounts for the mobile bottom navigation bar so content is never hidden behind it */}
        <div className="p-4 sm:p-6 md:p-8 pb-28 md:pb-8 max-w-7xl mx-auto w-full flex-1 space-y-8">
          <Breadcrumbs section={activeSection} onSelectSection={onSelectSection} />
          {children}
        </div>

        {/* Footer Bar within Dashboard */}
        <footer className="p-6 pb-28 md:pb-6 border-t border-purple-500/10 bg-black/30 text-center text-xs text-purple-200/40 font-semibold mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div>© 2026 AUREVASHOP. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Platform Status: 100% Operational
            </span>
            <span>·</span>
            <span>PCI-DSS Compliant Secure Channel</span>
          </div>
        </footer>
      </main>

      {/* ——— MOBILE BOTTOM NAVIGATION ——— */}
      <BottomNav
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        onOpenMenu={() => setIsMobileSidebarOpen(true)}
      />
    </div>
  );
}