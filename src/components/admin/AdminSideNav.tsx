import { useState, useEffect, useMemo } from "react";
import { ChevronDown, Search, Menu, X } from "lucide-react";
import { cn } from "../../utils/cn";

// A single clickable admin destination. `tab` maps to an existing AdminPanel tab id;
// `coming` marks a module that's part of the new information architecture but not built yet.
export interface AdminNavItem {
  label: string;
  tab?: string;
  coming?: boolean;
}

export interface AdminNavSection {
  id: string;
  label: string;
  icon: any;
  items: AdminNavItem[];
}

// The stable id used for routing (matches AdminPanel's `activeTab`).
export function adminNavItemId(it: AdminNavItem): string {
  return it.coming ? `coming:${it.label}` : (it.tab || "");
}

// Friendly placeholder pane for new-IA modules that don't have a backing feature yet.
// Keeps the navigation complete/scalable without faking functionality.
export function AdminComingSoon({ title }: { title: string }) {
  return (
    <div className="font-inter text-left">
      <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#12082b] to-[#0a0418] p-10 text-center space-y-3">
        <div className="text-4xl">🧩</div>
        <h3 className="text-lg font-bold text-white font-space">{title}</h3>
        <p className="text-xs text-purple-200/60 max-w-md mx-auto leading-relaxed">
          This module is part of the new admin information architecture. The navigation is ready —
          the feature can be built here later without disturbing the existing tabs.
        </p>
        <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-300 uppercase tracking-widest">
          Coming soon
        </span>
      </div>
    </div>
  );
}

interface Props {
  sections: AdminNavSection[];
  activeTab: string;
  onSelect: (tab: string) => void;
  isAllowed: (item: AdminNavItem) => boolean;
}

const OPEN_KEY = "avs_admin_nav_open";

export default function AdminSideNav({ sections, activeTab, onSelect, isAllowed }: Props) {
  const findSectionOf = (tab: string) =>
    sections.find((s) => s.items.some((it) => adminNavItemId(it) === tab))?.id;

  // Accordion: only one section open at a time; remember it across refreshes.
  const [openSection, setOpenSection] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved) return saved;
    } catch { /* sandbox */ }
    return findSectionOf(activeTab) || (sections[0] ? sections[0].id : "");
  });

  // Auto-expand the section that owns the active tab when navigation changes.
  useEffect(() => {
    const sec = findSectionOf(activeTab);
    if (sec && sec !== openSection) {
      setOpenSection(sec);
      try { localStorage.setItem(OPEN_KEY, sec); } catch { /* sandbox */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleSection = (id: string) => {
    setOpenSection((prev) => {
      const next = prev === id ? "" : id;
      try { localStorage.setItem(OPEN_KEY, next); } catch { /* sandbox */ }
      return next;
    });
  };

  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const flat = useMemo(
    () => sections.flatMap((s) => s.items.map((it) => ({ ...it, sectionLabel: s.label }))),
    [sections]
  );
  const results = q ? flat.filter((it) => isAllowed(it) && it.label.toLowerCase().includes(q)) : [];

  const go = (it: AdminNavItem) => {
    onSelect(adminNavItemId(it));
    setMobileOpen(false);
  };

  const itemButton = (it: AdminNavItem, showSection?: string) => {
    const id = adminNavItemId(it);
    const active = activeTab === id;
    return (
      <button
        key={id + (showSection || "")}
        onClick={() => go(it)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[11px] sm:text-xs font-semibold transition-all cursor-pointer group",
          active
            ? "bg-gradient-to-r from-purple-600/25 to-purple-500/10 border border-purple-500/30 text-white shadow-lg shadow-purple-500/5"
            : "text-purple-200/60 hover:text-white hover:bg-white/5 border border-transparent"
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", active ? "bg-cyan-400" : "bg-purple-500/30 group-hover:bg-purple-400/60")} />
          <span className="truncate">{it.label}</span>
        </span>
        {showSection && <span className="text-[9px] text-purple-200/30 shrink-0 truncate max-w-[80px]">{showSection}</span>}
        {it.coming && !showSection && <span className="text-[8px] font-bold uppercase text-amber-300/70 shrink-0">soon</span>}
      </button>
    );
  };

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="rounded-2xl border border-purple-500/15 bg-[#0a0518]/80 backdrop-blur-sm p-3 lg:sticky lg:top-24 space-y-3">
        {/* Mobile header / toggle */}
        <div className="flex items-center justify-between lg:hidden">
          <span className="text-xs font-bold text-white font-space uppercase tracking-wider">Admin Menu</span>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-1.5 rounded-lg text-purple-200/60 hover:text-white hover:bg-white/5 cursor-pointer"
            aria-label="Toggle admin menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className={cn(mobileOpen ? "block" : "hidden", "lg:block space-y-3")}>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-purple-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search admin…"
              className="w-full bg-black/40 border border-purple-500/20 text-[11px] text-white pl-8 pr-3 py-2 rounded-lg focus:outline-none focus:border-purple-500 placeholder-purple-200/30"
            />
          </div>

          {/* Search results (flat) */}
          {q ? (
            <div className="space-y-1 max-h-[70vh] overflow-y-auto custom-scrollbar-thin pr-1">
              {results.length === 0 ? (
                <div className="text-[11px] text-purple-200/30 italic px-2 py-3 text-center">No matches.</div>
              ) : (
                results.map((it) => itemButton(it, it.sectionLabel))
              )}
            </div>
          ) : (
            /* Grouped accordion */
            <nav className="space-y-1 max-h-[72vh] overflow-y-auto custom-scrollbar-thin pr-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const visibleItems = section.items.filter(isAllowed);
                if (visibleItems.length === 0) return null;
                const isOpen = openSection === section.id;
                const hasActive = visibleItems.some((it) => adminNavItemId(it) === activeTab);
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => toggleSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer group",
                        hasActive
                          ? "text-white"
                          : "text-purple-200/70 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", hasActive ? "text-purple-400" : "text-purple-300/40 group-hover:text-purple-200")} />
                      <span className="flex-1 truncate font-space">{section.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isOpen ? "rotate-180" : "rotate-0")} />
                    </button>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-300 ease-in-out",
                        isOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="pl-3 ml-3 border-l border-purple-500/15 space-y-1 py-1">
                        {visibleItems.map((it) => itemButton(it))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </aside>
  );
}
