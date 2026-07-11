import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

// Floating back-to-top button. Appears after scrolling down; scrolls the nearest
// scrollable ancestor (the dashboard content area) or the window to the top.
export default function BackToTop({ threshold = 500 }: { threshold?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // The dashboard scrolls an inner container; fall back to window.
    const scroller =
      document.querySelector<HTMLElement>("[data-scroll-container]") ||
      document.scrollingElement ||
      document.documentElement;
    const target: HTMLElement | Window = scroller === document.documentElement ? window : (scroller as HTMLElement);
    const getTop = () => (target === window ? window.scrollY : (scroller as HTMLElement).scrollTop);
    const onScroll = () => setShow(getTop() > threshold);
    onScroll();
    (target as any).addEventListener("scroll", onScroll, { passive: true });
    return () => (target as any).removeEventListener("scroll", onScroll);
  }, [threshold]);

  const toTop = () => {
    const scroller = document.querySelector<HTMLElement>("[data-scroll-container]") || document.scrollingElement || document.documentElement;
    if (scroller === document.documentElement) window.scrollTo({ top: 0, behavior: "smooth" });
    else (scroller as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!show) return null;
  return (
    <button
      onClick={toTop}
      aria-label="Back to top"
      className="fixed bottom-24 sm:bottom-8 left-4 sm:left-6 z-[140] h-11 w-11 rounded-full bg-black/60 backdrop-blur-xl border border-purple-500/30 text-purple-100 hover:text-white hover:border-purple-500/50 shadow-lg flex items-center justify-center cursor-pointer active:scale-90 transition-all animate-ai-pop-in"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
