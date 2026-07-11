import { useState, useEffect } from "react";
import { Menu, X, Shield, LogOut, ChevronDown, Sparkles, LogIn, UserPlus, ArrowRight } from "lucide-react";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";

interface NavbarProps {
  userName: string | null;
  onLogout: () => void;
  onLoginClick: () => void;
  onSignupClick: () => void;
}

export default function Navbar({
  userName,
  onLogout,
  onLoginClick,
  onSignupClick,
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open (prevents layout jump / scroll bleed).
  useBodyScrollLock(isOpen);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the drawer on Escape for keyboard users.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const menuItems = [
    { label: "Services", href: "#services" },
    { label: "Why Us", href: "#why" },
    { label: "How It Works", href: "#how" },
    { label: "Reviews", href: "#reviews" },
    { label: "Security & FAQ", href: "#faq" },
  ];

  const initial = (userName || "?").charAt(0).toUpperCase();

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? "py-3 bg-black/80 backdrop-blur-xl border-b border-purple-500/15 shadow-lg shadow-black/30"
          : "py-4 sm:py-5 bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">

        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group select-none shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60" aria-label="Aurevashop home">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform duration-300">
            <Shield className="h-5 w-5 text-white animate-pulse-slow" />
          </div>
          <span className="text-lg sm:text-xl font-black font-space tracking-tight bg-gradient-to-r from-white via-purple-100 to-cyan-400 bg-clip-text text-transparent group-hover:brightness-110 transition-all">
            Aurevashop
          </span>
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-7 lg:gap-8">
          {menuItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="relative text-xs font-semibold text-purple-200/60 hover:text-white transition-colors duration-200 py-1 after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-gradient-to-r after:from-purple-400 after:to-cyan-400 hover:after:w-full after:transition-all after:duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded"
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {userName ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-xs font-semibold text-white hover:bg-purple-500/20 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              >
                <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center font-bold text-[10px]">
                  {initial}
                </div>
                <span>{userName}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#0e0a21] border border-purple-500/20 p-1.5 shadow-2xl z-20 animate-fade-up" role="menu">
                    <div className="px-3 py-2 text-[10px] font-bold text-purple-200/40 uppercase tracking-wider border-b border-purple-500/10 mb-1">
                      Account Operations
                    </div>
                    <button
                      onClick={() => { setDropdownOpen(false); onLogout(); }}
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={onLoginClick}
                className="flex items-center gap-1.5 text-xs font-semibold text-purple-200/80 hover:text-white transition-colors cursor-pointer px-4 py-2 hover:bg-white/5 rounded-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Log In</span>
              </button>
              <button
                onClick={onSignupClick}
                className="relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 hover:shadow-purple-500/40 hover:brightness-110 active:scale-95 transition-all duration-250 cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              >
                <span>Create Account</span>
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Mobile right cluster: primary CTA (guests) + hamburger — auth always reachable */}
        <div className="flex md:hidden items-center gap-2">
          {!userName && (
            <button
              onClick={onSignupClick}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-3.5 py-2 text-[11px] font-bold text-white shadow-md shadow-purple-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Sign Up</span>
            </button>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-drawer"
            className="text-purple-100 hover:text-white p-2 rounded-lg hover:bg-white/5 active:scale-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ——— Mobile Drawer (always mounted for smooth slide; no layout jump) ——— */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed top-0 right-0 bottom-0 w-[82%] max-w-xs bg-[#080514] border-l border-purple-500/20 z-40 md:hidden shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-purple-500/10 shrink-0">
          <span className="flex items-center gap-2 select-none">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </span>
            <span className="text-base font-black font-space text-white">Aurevashop</span>
          </span>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="text-purple-200/60 hover:text-white p-1.5 rounded-lg hover:bg-white/5 active:scale-90 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar-thin px-5 py-6 flex flex-col">
          {/* AUTH FIRST — always at the very top for effortless access */}
          {userName ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-purple-500/5 border border-purple-500/15 text-xs text-white">
                <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center font-bold text-sm">
                  {initial}
                </div>
                <div>
                  <div className="text-[9px] text-purple-200/40 uppercase font-semibold tracking-wider">Signed in as</div>
                  <div className="font-bold text-sm">{userName}</div>
                </div>
              </div>
              <button
                onClick={() => { setIsOpen(false); onLogout(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <button
                onClick={() => { setIsOpen(false); onSignupClick(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 text-sm font-bold text-white shadow-lg shadow-purple-500/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                <UserPlus className="h-4.5 w-4.5" />
                <span>Create Account</span>
              </button>
              <button
                onClick={() => { setIsOpen(false); onLoginClick(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-purple-500/25 bg-white/5 text-sm font-bold text-white hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
              >
                <LogIn className="h-4.5 w-4.5" />
                <span>Log In</span>
              </button>
            </div>
          )}

          {/* Navigation links */}
          <div className="mt-8">
            <div className="text-[10px] font-bold text-purple-200/40 uppercase tracking-wider mb-3 px-1">Explore</div>
            <div className="flex flex-col gap-1">
              {menuItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold text-purple-200/70 hover:text-white hover:bg-white/5 active:scale-[0.99] transition-all"
                >
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-purple-300/30" />
                </a>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="flex items-center gap-1.5 text-[10px] text-purple-200/30 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>All systems active · 99.98% uptime</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
