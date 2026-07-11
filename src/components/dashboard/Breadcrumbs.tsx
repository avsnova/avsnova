import { Home, ChevronRight } from "lucide-react";

// Maps section ids to human labels + logical parent (for a 2-level breadcrumb trail).
const PARENT: Record<string, string> = {
  Wallet: "Dashboard", "SMS Panel": "Dashboard", "SMM Panel": "Dashboard",
  Marketplace: "Dashboard", "Gift Delivery": "Marketplace", "My Gift Orders": "Orders",
  eSIM: "Marketplace", "Physical SIM": "Marketplace",
  "My Inventory": "Dashboard", Orders: "Dashboard", Transactions: "Wallet",
  Notifications: "Dashboard", Profile: "Dashboard", Settings: "Dashboard",
  "How to Use": "Dashboard", Support: "Dashboard", "Admin Panel": "Dashboard",
};

const LABEL: Record<string, string> = {
  Dashboard: "Dashboard", Wallet: "Wallet", "SMS Panel": "Buy Number", "SMM Panel": "SMM Panel",
  Marketplace: "Marketplace", "Gift Delivery": "Gift Store", "My Gift Orders": "Gift Orders",
  eSIM: "eSIM", "Physical SIM": "Physical SIM",
  "My Inventory": "My Inventory", Orders: "Orders", Transactions: "Transactions",
  Notifications: "Notifications", Profile: "Profile", Settings: "Settings",
  "How to Use": "Help Center", Support: "Support", "Admin Panel": "Admin",
};

export default function Breadcrumbs({ section, onSelectSection }: { section: string; onSelectSection: (s: string) => void }) {
  if (!section || section === "Dashboard") return null;
  const parent = PARENT[section];
  const trail: string[] = [];
  if (parent && parent !== "Dashboard") trail.push(parent);
  trail.push(section);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-200/50 mb-1 flex-wrap">
      <button onClick={() => onSelectSection("Dashboard")} className="inline-flex items-center gap-1 hover:text-white transition-colors cursor-pointer">
        <Home className="h-3.5 w-3.5" /> Dashboard
      </button>
      {trail.map((s, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={s} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-purple-200/30" />
            {isLast ? (
              <span className="text-white font-bold">{LABEL[s] || s}</span>
            ) : (
              <button onClick={() => onSelectSection(s)} className="hover:text-white transition-colors cursor-pointer">{LABEL[s] || s}</button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
