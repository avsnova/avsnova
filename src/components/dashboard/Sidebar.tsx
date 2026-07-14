import { useState } from "react";
import { 
  LayoutDashboard, Wallet, Smartphone, TrendingUp, ShoppingBag, 
  Package, RefreshCw, Bell, User, Settings, ChevronLeft, ChevronRight, ChevronDown,
  Shield, ShieldAlert, MessageSquare, HelpCircle, Key, Gift, LifeBuoy, Wifi, CreditCard, Users
} from "lucide-react";
import { cn } from "../../utils/cn";

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  active: number;
  order_index: number;
}

export interface SidebarProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  unreadNotifs: number;
  isAdmin?: boolean;
  dynamicSidebarItems?: SidebarItem[];
}

const iconMap: Record<string, any> = {
  LayoutDashboard,
  Wallet,
  Smartphone,
  TrendingUp,
  ShoppingBag,
  Package,
  RefreshCw,
  Bell,
  User,
  Settings,
  HelpCircle,
  MessageSquare,
  Key,
  Gift,
  LifeBuoy,
  Wifi,
  CreditCard,
  Users
};

// ——— MARKETPLACE GROUP (Option B) ———
// A single top-level "Marketplace" entry that expands to reveal its dedicated
// sub-modules. Each child opens its own page (App.tsx routes them). The child
// ids are also filtered out of the flat list so they never render twice.
const MARKETPLACE_PARENT_ID = "Marketplace";
interface MpChild { id: string; label: string; icon: any; children?: { id: string; label: string }[] }
const MARKETPLACE_CHILDREN: MpChild[] = [
  { id: "Marketplace", label: "AVS Marketplace", icon: ShoppingBag },
  { id: "Physical SIM", label: "Physical SIM", icon: CreditCard },
  { id: "eSIM", label: "eSIM", icon: Wifi },
  // International Gifting is a nested dropdown: its store page + "My Gift Orders".
  { id: "Gift Delivery", label: "International Gifting", icon: Gift, children: [
    { id: "Gift Delivery", label: "Gift Store" },
    { id: "My Gift Orders", label: "My Gift Orders" },
  ] },
];
// All ids that live inside the Marketplace group (used to hide them from the flat list).
const MARKETPLACE_CHILD_IDS = MARKETPLACE_CHILDREN.flatMap((c) => [c.id, ...(c.children ? c.children.map((s) => s.id) : [])]);
// Ids that should trigger the group to appear active/expanded.
const MARKETPLACE_ACTIVE_IDS = Array.from(new Set(MARKETPLACE_CHILD_IDS));

export default function Sidebar({
  activeSection,
  onSelectSection,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  unreadNotifs,
  isAdmin = false,
  dynamicSidebarItems = []
}: SidebarProps) {
  
  // High-fidelity fallback list
  const fallbackItems = [
    { id: "Dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { id: "Wallet", label: "AVS Wallet", icon: "Wallet" },
    { id: "SMS Panel", label: "Buy Number", icon: "Smartphone" },
    { id: "SMM Panel", label: "Social Media Growth", icon: "TrendingUp" },
    { id: "Marketplace", label: "Marketplace", icon: "ShoppingBag" },
    { id: "My Inventory", label: "My Inventory", icon: "Key" },
    { id: "Orders", label: "Orders & Tracking", icon: "Package" },
    { id: "Transactions", label: "Transactions", icon: "RefreshCw" },
    { id: "Referrals", label: "Refer & Earn", icon: "Users" },
    { id: "Notifications", label: "Security & Alerts", icon: "Bell" },
    { id: "Profile", label: "My Profile", icon: "User" },
    { id: "Settings", label: "System Settings", icon: "Settings" },
    { id: "How to Use", label: "How to Use", icon: "HelpCircle" },
    { id: "Support", label: "Support", icon: "LifeBuoy" },
  ];

  const activeItemsList = dynamicSidebarItems.length > 0 ? dynamicSidebarItems : fallbackItems;

  // Build the flat list, dropping any Marketplace child ids (they render inside the
  // expandable group instead). Ensure a Marketplace parent placeholder exists.
  const baseItems = activeItemsList
    .filter((item) => !(MARKETPLACE_CHILD_IDS.includes(item.id) && item.id !== MARKETPLACE_PARENT_ID))
    .map((item) => ({
      id: item.id,
      label: item.id === MARKETPLACE_PARENT_ID ? "Marketplace" : item.label,
      icon: iconMap[item.icon] || ShoppingBag,
      badge: item.id === "Notifications",
      isMarketplaceGroup: item.id === MARKETPLACE_PARENT_ID,
    }));

  // Guarantee the Marketplace group is present even if a custom backend list omitted it.
  const hasMarketplace = baseItems.some((i) => i.isMarketplaceGroup);
  if (!hasMarketplace) {
    baseItems.push({ id: MARKETPLACE_PARENT_ID, label: "Marketplace", icon: ShoppingBag, badge: false, isMarketplaceGroup: true });
  }

  const sidebarItems = isAdmin 
    ? [...baseItems, { id: "Admin Panel", label: "Admin Hub Console", icon: ShieldAlert, badge: false, isMarketplaceGroup: false }]
    : baseItems;

  // ——— Section grouping for a cleaner, more organized sidebar (Req 9) ———
  // We bucket the flat items into logical groups with subtle headers. The Marketplace
  // group and any unknown/custom items fall into sensible buckets automatically.
  const SECTION_OF: Record<string, string> = {
    "Dashboard": "Main", "Wallet": "Main", "SMS Panel": "Main", "SMM Panel": "Main",
    "Marketplace": "Shop",
    "My Inventory": "Account", "Orders": "Account", "Transactions": "Account",
    "Notifications": "Account", "Profile": "Account", "Settings": "Account",
    "How to Use": "Help", "Support": "Help",
    "Admin Panel": "Admin",
  };
  const SECTION_ORDER = ["Main", "Shop", "Account", "Help", "Admin"];
  const sectionFor = (it: any) => it.isMarketplaceGroup ? "Shop" : (SECTION_OF[it.id] || "Main");
  const groupedSections = SECTION_ORDER
    .map((sec) => ({ section: sec, items: sidebarItems.filter((it) => sectionFor(it) === sec) }))
    .filter((g) => g.items.length > 0);

  // The Marketplace group auto-expands whenever one of its children is active.
  const isMarketplaceChildActive = MARKETPLACE_ACTIVE_IDS.includes(activeSection);
  const [marketplaceOpen, setMarketplaceOpen] = useState<boolean>(isMarketplaceChildActive);
  // Keep it open when navigating into a child section from elsewhere.
  const marketplaceExpanded = marketplaceOpen || isMarketplaceChildActive;
  // Nested "International Gifting" sub-dropdown open state.
  const giftActive = activeSection === "Gift Delivery" || activeSection === "My Gift Orders";
  const [giftOpen, setGiftOpen] = useState<boolean>(giftActive);
  const giftExpanded = giftOpen || giftActive;

  const handleNavigate = (id: string) => {
    onSelectSection(id);
    if (isMobileOpen) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden" 
          onClick={onCloseMobile} 
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 bg-[#080415] border-r border-purple-500/15 flex flex-col justify-between transition-all duration-300 select-none",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Brand Logo Header */}
          <div className="h-20 flex items-center justify-between px-6 border-b border-purple-500/15 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                <Shield className="h-5 w-5 text-white animate-pulse-slow" />
              </div>
              {!isCollapsed && (
                <span className="text-lg font-black font-space tracking-tight bg-gradient-to-r from-white via-purple-100 to-cyan-400 bg-clip-text text-transparent truncate">
                  AVS PLATFORM
                </span>
              )}
            </div>
            {/* Desktop Collapse Toggle */}
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center p-1.5 rounded-lg text-purple-200/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>

          {/* Nav Links — grouped into clean, labelled sections */}
          <div className="flex-1 overflow-y-auto py-5 px-3 space-y-4 custom-scrollbar-thin">
            {groupedSections.map((group, gi) => (
              <div key={group.section} className="space-y-1">
                {!isCollapsed ? (
                  <div className="text-[9px] font-bold text-purple-200/35 uppercase tracking-[0.15em] font-space px-3 mb-1.5">
                    {group.section === "Main" ? "AVS Services" : group.section}
                  </div>
                ) : gi > 0 ? (
                  <div className="mx-3 my-2 border-t border-purple-500/10" />
                ) : null}

            {group.items.map((item) => {
              const Icon = item.icon;

              // ——— MARKETPLACE EXPANDABLE GROUP ———
              if (item.isMarketplaceGroup) {
                // When the rail is collapsed, the group behaves like a single icon that
                // jumps straight to the main Marketplace page.
                if (isCollapsed) {
                  const anyActive = isMarketplaceChildActive;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate("Marketplace")}
                      title="Marketplace"
                      className={cn(
                        "w-full flex items-center justify-center py-3 px-3.5 rounded-xl transition-all duration-200 cursor-pointer group relative",
                        anyActive
                          ? "bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-500/30 text-white"
                          : "text-purple-200/60 hover:text-white hover:bg-white/5 border border-transparent"
                      )}
                    >
                      <ShoppingBag className={cn("h-5 w-5 shrink-0", anyActive ? "text-purple-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                      {anyActive && (
                        <span className="absolute left-0 w-1 h-6 bg-gradient-to-b from-purple-500 to-cyan-400 rounded-r-full" />
                      )}
                    </button>
                  );
                }

                return (
                  <div key={item.id} className="space-y-1">
                    {/* Group header (toggles the submenu) */}
                    <button
                      onClick={() => setMarketplaceOpen((o) => !o)}
                      className={cn(
                        "w-full flex items-center gap-3.5 py-3 px-3.5 rounded-xl text-left text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer group relative",
                        isMarketplaceChildActive
                          ? "bg-gradient-to-r from-purple-600/15 to-purple-500/5 border border-purple-500/25 text-white font-bold"
                          : "text-purple-200/60 hover:text-white hover:bg-white/5 border border-transparent"
                      )}
                    >
                      <ShoppingBag className={cn("h-5 w-5 shrink-0 transition-colors", isMarketplaceChildActive ? "text-purple-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                      <span className="flex-1 truncate">Marketplace</span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", marketplaceExpanded ? "rotate-180" : "rotate-0")} />
                    </button>

                    {/* Submenu children */}
                    {marketplaceExpanded && (
                      <div className="pl-3 ml-3 border-l border-purple-500/15 space-y-1">
                        {MARKETPLACE_CHILDREN.map((child) => {
                          const ChildIcon = child.icon;
                          // Nested dropdown (e.g. International Gifting → Gift Store / My Gift Orders)
                          if (child.children && child.children.length) {
                            return (
                              <div key={child.id} className="space-y-1">
                                <button
                                  onClick={() => setGiftOpen((o) => !o)}
                                  className={cn(
                                    "w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left text-[11px] sm:text-xs font-semibold transition-all duration-200 cursor-pointer group relative",
                                    giftActive
                                      ? "bg-gradient-to-r from-purple-600/15 to-purple-500/5 border border-purple-500/25 text-white font-bold"
                                      : "text-purple-200/50 hover:text-white hover:bg-white/5 border border-transparent"
                                  )}
                                >
                                  <ChildIcon className={cn("h-4 w-4 shrink-0 transition-colors", giftActive ? "text-cyan-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                                  <span className="flex-1 truncate">{child.label}</span>
                                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", giftExpanded ? "rotate-180" : "rotate-0")} />
                                </button>
                                {giftExpanded && (
                                  <div className="pl-3 ml-3 border-l border-purple-500/15 space-y-1">
                                    {child.children.map((sub) => {
                                      const subActive = activeSection === sub.id;
                                      return (
                                        <button
                                          key={sub.id}
                                          onClick={() => handleNavigate(sub.id)}
                                          className={cn(
                                            "w-full flex items-center gap-2.5 py-2 px-3 rounded-lg text-left text-[11px] font-semibold transition-all duration-200 cursor-pointer group",
                                            subActive
                                              ? "bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-500/30 text-white font-bold"
                                              : "text-purple-200/50 hover:text-white hover:bg-white/5 border border-transparent"
                                          )}
                                        >
                                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", subActive ? "bg-cyan-400" : "bg-purple-500/40 group-hover:bg-purple-300")} />
                                          <span className="flex-1 truncate">{sub.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          const childActive = activeSection === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => handleNavigate(child.id)}
                              className={cn(
                                "w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left text-[11px] sm:text-xs font-semibold transition-all duration-200 cursor-pointer group relative",
                                childActive
                                  ? "bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-500/30 text-white font-bold shadow-lg shadow-purple-500/5"
                                  : "text-purple-200/50 hover:text-white hover:bg-white/5 border border-transparent"
                              )}
                            >
                              <ChildIcon className={cn("h-4 w-4 shrink-0 transition-colors", childActive ? "text-cyan-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                              <span className="flex-1 truncate">{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // ——— STANDARD NAV ITEM ———
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3.5 py-3 px-3.5 rounded-xl text-left text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer group relative",
                    isActive
                      ? "bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-500/30 text-white font-bold shadow-lg shadow-purple-500/5"
                      : "text-purple-200/60 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive ? "text-purple-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                  
                  {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {item.badge && unreadNotifs > 0 && !isCollapsed && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold shrink-0 font-space animate-pulse">
                      {unreadNotifs}
                    </span>
                  )}
                  {/* Collapsed active hint */}
                  {isActive && isCollapsed && (
                    <span className="absolute left-0 w-1 h-6 bg-gradient-to-b from-purple-500 to-cyan-400 rounded-r-full" />
                  )}
                </button>
              );
            })}
              </div>
            ))}
          </div>

          {/* Footer Widget */}
          {!isCollapsed && (
            <div className="p-4 border-t border-purple-500/15 bg-black/40 shrink-0">
              <div className="bg-[#110b24] border border-purple-500/20 rounded-xl p-3 text-xs space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-1.5 font-bold text-white font-space">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>AVS Secure Channel</span>
                </div>
                <p className="text-[11px] text-purple-200/60 leading-relaxed">
                  Enterprise digital access and activations.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
