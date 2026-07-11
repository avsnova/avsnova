import { useEffect } from "react";

// Locks background scrolling while a modal/dialog is open. Safe to use multiple times
// concurrently: we ref-count active locks on a data attribute so restoring only happens
// once the last open modal closes. This freezes the background page (no scroll) whenever
// any dialog is open, consistently across the whole app.
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const current = parseInt(body.getAttribute("data-scroll-locks") || "0", 10);
    const next = current + 1;
    body.setAttribute("data-scroll-locks", String(next));
    if (current === 0) {
      body.dataset.prevOverflow = body.style.overflow || "";
      body.style.overflow = "hidden";
    }
    return () => {
      const c = parseInt(body.getAttribute("data-scroll-locks") || "1", 10);
      const n = Math.max(0, c - 1);
      body.setAttribute("data-scroll-locks", String(n));
      if (n === 0) {
        body.style.overflow = body.dataset.prevOverflow || "";
        delete body.dataset.prevOverflow;
      }
    };
  }, [active]);
}
