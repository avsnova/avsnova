import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, X, Maximize2 } from "lucide-react";

interface Props {
  /** Comma-separated image URLs (product.multiple_images). */
  images?: string;
  /** Single fallback image URL (product.file_url) — only used if it looks like an image. */
  fallbackImage?: string;
  /** Emoji/icon fallback when there are no images at all. */
  icon?: string;
  alt?: string;
}

const isImageUrl = (u?: string) =>
  !!u && /^https?:\/\//i.test(u) && /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(u);

function parseImages(images?: string, fallback?: string): string[] {
  const list = (images || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length > 0) return list;
  if (isImageUrl(fallback)) return [fallback!];
  return [];
}

// Premium product gallery: swipeable (touch), tap-to-zoom, full-screen lightbox,
// thumbnails, smooth transitions and per-image skeleton loading. Falls back to a
// large emoji tile when a product has no images (digital services).
export default function ProductGallery({ images, fallbackImage, icon, alt = "Product image" }: Props) {
  const urls = parseImages(images, fallbackImage);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = urls.length;
  const clamp = useCallback((i: number) => (count ? (i + count) % count : 0), [count]);
  const go = useCallback((dir: number) => setIndex((i) => clamp(i + dir)), [clamp]);

  useEffect(() => { setIndex(0); }, [images, fallbackImage]);

  // Keyboard nav within the lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [lightbox, go]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  // No images → premium emoji tile (keeps digital-service products looking intentional).
  if (count === 0) {
    return (
      <div className="w-full aspect-[4/3] sm:h-56 rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#160b34] to-[#0a0418] flex items-center justify-center">
        <span className="text-6xl opacity-90">{icon || "📦"}</span>
      </div>
    );
  }

  const showControls = count > 1;
  const currentBroken = errored[index];

  return (
    <>
      <div className="space-y-3">
        {/* Main stage */}
        <div
          className="relative w-full aspect-[4/3] sm:h-56 rounded-2xl border border-purple-500/15 overflow-hidden bg-black/60 group"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Skeleton while loading */}
          {!loaded[index] && !currentBroken && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 to-white/10" />
          )}

          {currentBroken ? (
            <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-80">{icon || "📦"}</div>
          ) : (
            <img
              key={index}
              src={urls[index]}
              alt={`${alt} ${index + 1}`}
              onLoad={() => setLoaded((p) => ({ ...p, [index]: true }))}
              onError={() => setErrored((p) => ({ ...p, [index]: true }))}
              className={`w-full h-full object-contain transition-opacity duration-300 animate-fade-up ${loaded[index] ? "opacity-100" : "opacity-0"} cursor-zoom-in`}
              onClick={() => setLightbox(true)}
              loading="lazy"
            />
          )}

          {/* Zoom hint */}
          {!currentBroken && (
            <button
              onClick={() => setLightbox(true)}
              aria-label="Zoom image"
              className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          )}

          {/* Prev/Next (desktop hover / always on mobile) */}
          {showControls && (
            <>
              <button onClick={() => go(-1)} aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer active:scale-90 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>
              <button onClick={() => go(1)} aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer active:scale-90 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
              {/* Dots */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {urls.map((_, i) => (
                  <button key={i} onClick={() => setIndex(i)} aria-label={`Go to image ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${i === index ? "w-5 bg-cyan-400" : "w-1.5 bg-white/30 hover:bg-white/50"}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Thumbnails */}
        {showControls && (
          <div className="flex gap-2 overflow-x-auto pr-2 pb-1 custom-scrollbar-thin">
            {urls.map((u, i) => (
              <button key={i} onClick={() => setIndex(i)}
                className={`w-12 h-12 rounded-xl border overflow-hidden bg-black/40 flex items-center justify-center shrink-0 transition-all cursor-pointer ${i === index ? "border-cyan-400 scale-105" : "border-purple-500/10 hover:border-purple-500/30"}`}>
                {errored[i] ? <span className="text-lg">{icon || "📦"}</span> : <img src={u} className="object-cover w-full h-full" alt={`thumbnail ${i + 1}`} onError={() => setErrored((p) => ({ ...p, [i]: true }))} loading="lazy" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full-screen lightbox */}
      {lightbox && !currentBroken && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" role="dialog" aria-modal="true" aria-label="Image viewer"
          onClick={() => setLightbox(false)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button onClick={() => setLightbox(false)} aria-label="Close" className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white hover:bg-white/20 cursor-pointer z-10">
            <X className="h-5 w-5" />
          </button>
          <img src={urls[index]} alt={`${alt} ${index + 1} full`} className="max-w-[92vw] max-h-[85vh] object-contain animate-fade-up" onClick={(e) => e.stopPropagation()} />
          {showControls && (
            <>
              <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous"
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white hover:bg-white/20 cursor-pointer active:scale-90">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next"
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white hover:bg-white/20 cursor-pointer active:scale-90">
                <ChevronRight className="h-6 w-6" />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/70 text-xs font-mono">
                <Maximize2 className="h-3.5 w-3.5" /> {index + 1} / {count}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
