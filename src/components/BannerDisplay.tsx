import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, ArrowRight } from "lucide-react";
import { apiFetch, getApiBaseUrl } from "../utils/api";

const API_BASE = getApiBaseUrl();

function freqShouldShow(b: any): boolean {
  const f = b.frequency || "always";
  if (f === "always") return true;
  const k = `avs_bnr_${b.id}`;
  if (f === "once") return !localStorage.getItem(k);
  if (f === "once_per_session") return !sessionStorage.getItem(`avs_bnr_s_${b.id}`);
  if (f === "every_x_hours") { const l = localStorage.getItem(k); return !l || (Date.now() - parseInt(l)) > (b.frequency_hours || 24) * 3600e3; }
  return true;
}
function markShown(b: any) {
  const f = b.frequency || "always";
  if (f === "once") localStorage.setItem(`avs_bnr_${b.id}`, "1");
  else if (f === "once_per_session") sessionStorage.setItem(`avs_bnr_s_${b.id}`, "1");
  else if (f === "every_x_hours") localStorage.setItem(`avs_bnr_${b.id}`, String(Date.now()));
}

// Renders the media for a single banner (image / gif / video / html)
function BannerMedia({ b }: { b: any }) {
  const type = b.banner_type || (b.video_url ? "video" : "image");
  if (type === "html" && b.html_content) {
    return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: b.html_content }} />;
  }
  if (type === "video" && b.video_url) {
    const isFile = /\.(mp4|webm|mov)(\?|$)/i.test(b.video_url) || b.video_url.startsWith("/uploads/");
    if (isFile) return <video src={b.video_url} autoPlay muted loop playsInline className="w-full h-full object-cover" />;
    let embed = b.video_url; const yt = b.video_url.match(/(?:youtu\.be\/|watch\?v=|embed\/)([\w-]{11})/);
    if (yt) embed = `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&controls=0`;
    return <iframe src={embed} className="w-full h-full border-0" allow="autoplay; encrypted-media" title={b.title} />;
  }
  if (b.image_url) return <img src={b.image_url} alt={b.title} loading="lazy" className="w-full h-full object-cover" />;
  return null;
}

export default function BannerDisplay({ position, className = "" }: { position: string; className?: string }) {
  const [banners, setBanners] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const viewedRef = useRef<Set<string>>(new Set());
  const touchX = useRef<number | null>(null);
  const hoverRef = useRef(false);

  const fetchBanners = useCallback(async () => {
    try {
      const list = await apiFetch(`/api/banners?position=${encodeURIComponent(position)}`);
      if (Array.isArray(list)) setBanners(list.filter(freqShouldShow));
    } catch (e) { /* ignore */ }
  }, [position]);

  useEffect(() => {
    fetchBanners();
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_BASE}/api/banners/stream`);
      es.onmessage = (ev) => { try { const d = JSON.parse(ev.data); if (d?.type?.startsWith("BANNER")) fetchBanners(); } catch {} };
    } catch (e) {}
    const t = setInterval(fetchBanners, 60000);
    return () => { if (es) es.close(); clearInterval(t); };
  }, [fetchBanners]);

  const visible = banners.filter(b => !dismissed.has(b.id));

  // Autoplay
  useEffect(() => {
    if (visible.length <= 1) return;
    const ms = visible[idx]?.autoplay_ms || 5000;
    const t = setInterval(() => { if (!hoverRef.current) setIdx(i => (i + 1) % visible.length); }, ms);
    return () => clearInterval(t);
  }, [visible.length, idx]);

  // Track view once
  useEffect(() => {
    const b = visible[idx];
    if (b && !viewedRef.current.has(b.id)) {
      viewedRef.current.add(b.id); markShown(b);
      apiFetch(`/api/banners/${b.id}/view`, { method: "POST", body: JSON.stringify({ variant: b._variant || "A" }) }).catch(() => {});
    }
  }, [idx, visible]);

  if (visible.length === 0) return null;
  const safeIdx = Math.min(idx, visible.length - 1);
  const b = visible[safeIdx];

  const onClick = (bn: any) => {
    apiFetch(`/api/banners/${bn.id}/click`, { method: "POST", body: JSON.stringify({ variant: bn._variant || "A" }) }).catch(() => {});
    if (bn.cta_url) { if (/^https?:\/\//.test(bn.cta_url)) window.open(bn.cta_url, "_blank", "noopener"); else window.location.hash = bn.cta_url.replace(/^\/?/, ""); }
  };
  const onDismiss = (bn: any) => {
    setDismissed(prev => new Set(prev).add(bn.id));
    apiFetch(`/api/banners/${bn.id}/dismiss`, { method: "POST", body: JSON.stringify({ permanent: true }) }).catch(() => {});
  };
  const go = (d: number) => setIdx(i => (i + d + visible.length) % visible.length);

  const transition = b.transition || "slide";
  const animClass = transition === "fade" ? "animate-[fadeIn_.4s_ease]" : transition === "zoom" ? "animate-[popIn_.35s_ease]" : "animate-[slideIn_.35s_ease]";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-purple-500/20 group ${className}`}
      onMouseEnter={() => (hoverRef.current = true)}
      onMouseLeave={() => (hoverRef.current = false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div key={b.id} className={`relative ${animClass}`} style={{ background: b.bg_color || undefined, color: b.text_color || undefined }}>
        <div className="relative w-full h-40 sm:h-52 md:h-60 cursor-pointer" onClick={() => onClick(b)}>
          <div className="absolute inset-0"><BannerMedia b={b} /></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          <div className="relative z-10 h-full flex flex-col justify-center p-5 sm:p-8 max-w-xl">
            <h3 className="text-lg sm:text-2xl md:text-3xl font-black font-space text-white leading-tight drop-shadow">{b.title}</h3>
            {b.description && <p className="text-xs sm:text-sm text-white/80 mt-1.5 line-clamp-2 drop-shadow">{b.description}</p>}
            {b.cta_text && (
              <button onClick={(e) => { e.stopPropagation(); onClick(b); }} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-xs sm:text-sm hover:brightness-110 transition-all cursor-pointer w-fit">
                <span>{b.cta_text}</span><ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {b.dismissible === 1 && (
          <button onClick={() => onDismiss(b)} className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white cursor-pointer"><X className="h-4 w-4" /></button>
        )}
      </div>

      {visible.length > 1 && (<>
        <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><ChevronRight className="h-5 w-5" /></button>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
          {visible.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === safeIdx ? "w-6 bg-cyan-400" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      </>)}
    </div>
  );
}
