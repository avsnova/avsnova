import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Package, Folder, ShoppingBag, User, Key, X, CornerDownLeft, Loader2 } from "lucide-react";
import { apiFetch } from "../../utils/api";

/**
 * UniversalSearch — a global command palette for the admin console.
 * Opens with Ctrl/Cmd+K. Searches products, categories, orders, customers,
 * and credentials via /api/admin/search. Keyboard-navigable (↑/↓/Enter/Esc).
 * onNavigate(section) lets the host switch admin tabs to the matching area.
 */

interface Result { type: string; id: string | number; title: string; subtitle?: string; section: string; }
interface Props { onNavigate: (section: string, result: Result) => void; }

const TYPE_ICON: Record<string, React.ReactNode> = {
  product: <Package className="h-4 w-4 text-cyan-400" />,
  category: <Folder className="h-4 w-4 text-purple-400" />,
  order: <ShoppingBag className="h-4 w-4 text-emerald-400" />,
  customer: <User className="h-4 w-4 text-amber-400" />,
  credential: <Key className="h-4 w-4 text-pink-400" />,
};

export default function UniversalSearch({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); else { setQ(""); setResults([]); setActive(0); } }, [open]);

  // Debounced search
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { const r = await apiFetch(`/api/admin/search?q=${encodeURIComponent(q)}`); setResults(r.results || []); setActive(0); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const choose = useCallback((r: Result) => { onNavigate(r.section, r); setOpen(false); }, [onNavigate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); choose(results[active]); }
  };

  return (
    <>
      {/* Trigger button (also shows the shortcut) */}
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/20 bg-black/30 text-purple-300/60 hover:text-white hover:border-purple-500/40 text-xs cursor-pointer">
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search everything</span>
        <kbd className="hidden sm:inline ml-1 px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/25 text-[9px] font-mono">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-xl bg-[#0e0922] border border-purple-500/30 rounded-2xl shadow-2xl z-10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-purple-500/15">
              <Search className="h-4 w-4 text-purple-300/50" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search products, orders, customers, credentials…" className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-purple-300/40" />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-purple-300/50" />}
              <button onClick={() => setOpen(false)} className="text-purple-300/40 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-purple-300/40">{q ? "No results found." : "Type to search across the platform."}</div>
              ) : results.map((r, i) => (
                <button key={r.type + r.id} onClick={() => choose(r)} onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer ${i === active ? "bg-purple-500/15" : "hover:bg-white/5"}`}>
                  <span className="shrink-0">{TYPE_ICON[r.type] || <Search className="h-4 w-4" />}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{r.title}</div>
                    {r.subtitle && <div className="text-[11px] text-purple-300/50 truncate">{r.subtitle}</div>}
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-purple-300/40 font-space">{r.type}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-purple-300/40" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
