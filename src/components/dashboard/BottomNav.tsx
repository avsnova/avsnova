import { LayoutDashboard, Wallet, ShoppingBag, Package, Menu } from "lucide-react";
import { cn } from "../../utils/cn";

interface BottomNavProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  onOpenMenu: () => void;
}

// Mobile-only bottom navigation bar (fintech-style). Reuses existing routing via onSelectSection.
// Hidden on md+ where the sidebar is shown. Safe-area aware for notched devices.
export default function BottomNav({ activeSection, onSelectSection, onOpenMenu }: BottomNavProps) {
  const items = [
    { id: "Dashboard", label: "Home", icon: LayoutDashboard },
    { id: "Wallet", label: "Wallet", icon: Wallet },
    { id: "Marketplace", label: "Shop", icon: ShoppingBag },
    { id: "Orders", label: "Orders", icon: Package },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0a0518]/95 backdrop-blur-xl border-t border-purple-500/20 flex items-stretch justify-around px-1 pt-1.5"
      style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = activeSection === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onSelectSection(it.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors cursor-pointer",
              active ? "text-cyan-300" : "text-purple-200/50 hover:text-purple-100"
            )}
          >
            <span className={cn("relative flex items-center justify-center h-7 w-12 rounded-full transition-all", active && "bg-purple-500/15")}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-bold font-space">{it.label}</span>
          </button>
        );
      })}
      <button
        onClick={onOpenMenu}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-purple-200/50 hover:text-purple-100 transition-colors cursor-pointer"
        aria-label="Open menu"
      >
        <span className="flex items-center justify-center h-7 w-12 rounded-full"><Menu className="h-5 w-5" /></span>
        <span className="text-[10px] font-bold font-space">Menu</span>
      </button>
    </nav>
  );
}
