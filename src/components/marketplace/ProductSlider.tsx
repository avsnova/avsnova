import { useRef, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  title: string;
  icon?: ReactNode;
  accent?: "purple" | "amber" | "cyan" | "emerald";
  children: ReactNode;          // a row of cards
  onViewAll?: () => void;
  count?: number;               // optional item count shown next to the title
}

// Reusable horizontal product slider with:
//  • native touch-swipe (mobile) + CSS scroll-snap
//  • click-and-drag scrolling (desktop, pointer events)
//  • vertical mouse-wheel / trackpad → horizontal scroll (without hijacking page scroll
//    once an edge is reached, so the page keeps scrolling naturally)
//  • arrow controls (desktop)
// Lightweight (no timers) for 60fps performance.
export default function ProductSlider({ title, icon, accent = "purple", children, onViewAll, count }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByDir = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 640), behavior: "smooth" });
  };

  // Vertical wheel → horizontal scroll, but only while there is room to scroll in that
  // direction; otherwise let the event bubble so the page scrolls naturally.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Trackpads already send horizontal deltaX; only translate dominant-vertical wheels.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return; // let page scroll
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Click-and-drag to scroll (desktop). Uses pointer events; suppresses click after a drag.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let down = false, startX = 0, startScroll = 0, moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // native touch scroll handles this
      down = true; moved = false;
      startX = e.clientX; startScroll = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = startScroll - dx;
    };
    const endDrag = () => {
      if (!down) return;
      down = false;
      if (moved) { el.dataset.dragged = "1"; setTimeout(() => { delete el.dataset.dragged; }, 60); }
      el.classList.remove("cursor-grabbing");
    };
    const onDownWithCursor = (e: PointerEvent) => { onDown(e); if (down) el.classList.add("cursor-grabbing"); };
    // Block click bubbling right after a drag so a card isn't accidentally opened.
    const onClickCapture = (e: MouseEvent) => { if (el.dataset.dragged) { e.stopPropagation(); e.preventDefault(); } };
    el.addEventListener("pointerdown", onDownWithCursor);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onDownWithCursor);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  const accentText =
    accent === "amber" ? "text-amber-400" : accent === "cyan" ? "text-cyan-300" : accent === "emerald" ? "text-emerald-400" : "text-purple-300";

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider font-space ${accentText}`}>
          {icon}
          <span>{title}</span>
          {typeof count === "number" && count > 0 && <span className="text-[10px] font-mono text-purple-200/40 normal-case">({count})</span>}
        </h3>
        <div className="flex items-center gap-1.5">
          {onViewAll && (
            <button onClick={onViewAll} className="text-[11px] font-bold text-purple-200/50 hover:text-white cursor-pointer mr-1">View all</button>
          )}
          <button onClick={() => scrollByDir(-1)} aria-label="Scroll left"
            className="hidden sm:flex h-8 w-8 rounded-full bg-black/40 border border-purple-500/20 items-center justify-center text-purple-200/70 hover:text-white hover:border-purple-500/40 cursor-pointer active:scale-90 transition-all">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => scrollByDir(1)} aria-label="Scroll right"
            className="hidden sm:flex h-8 w-8 rounded-full bg-black/40 border border-purple-500/20 items-center justify-center text-purple-200/70 hover:text-white hover:border-purple-500/40 cursor-pointer active:scale-90 transition-all">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x custom-scrollbar-thin select-none sm:cursor-grab"
        style={{ scrollbarWidth: "thin" }}
      >
        {children}
      </div>
    </section>
  );
}
