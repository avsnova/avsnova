import { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, Megaphone } from "lucide-react";
import { apiFetch, getApiBaseUrl } from "../utils/api";

const API_BASE = getApiBaseUrl();

// Renders admin rich-text/HTML body safely-ish (admins are trusted authors).
function RichBody({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Renders a video: supports uploaded files (/uploads/...) and embed URLs (YouTube/Vimeo).
function AnnVideo({ url }: { url?: string }) {
  if (!url) return null;
  const isFile = /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.startsWith("/uploads/");
  if (isFile) {
    return <video src={url} controls className="w-full rounded-lg max-h-56 bg-black" />;
  }
  // embed
  let embed = url;
  const yt = url.match(/(?:youtu\.be\/|watch\?v=|embed\/)([\w-]{11})/);
  if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
      <iframe src={embed} className="absolute inset-0 w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="announcement video" />
    </div>
  );
}

// Frequency gating stored client-side (per browser) — complements server "don't show again".
function freqKey(id: string) { return `avs_ann_${id}`; }
function sessionKey(id: string) { return `avs_ann_sess_${id}`; }

function shouldShow(a: any): boolean {
  const freq = a.frequency || "always";
  if (freq === "always") return true;
  if (freq === "once") {
    return !localStorage.getItem(freqKey(a.id));
  }
  if (freq === "once_per_session") {
    return !sessionStorage.getItem(sessionKey(a.id));
  }
  if (freq === "every_x_hours") {
    const last = localStorage.getItem(freqKey(a.id));
    if (!last) return true;
    const hours = (a.frequency_hours || 24);
    return (Date.now() - parseInt(last)) > hours * 3600 * 1000;
  }
  return true; // "every_login" and unknown => show
}

function markShown(a: any) {
  const freq = a.frequency || "always";
  if (freq === "once") localStorage.setItem(freqKey(a.id), "1");
  else if (freq === "once_per_session") sessionStorage.setItem(sessionKey(a.id), "1");
  else if (freq === "every_x_hours") localStorage.setItem(freqKey(a.id), String(Date.now()));
}

interface Props {
  currentPage?: string;   // used for page targeting (matches target_pages)
  isLoggedIn?: boolean;
}

export default function AnnouncementDisplay({ currentPage, isLoggedIn }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const viewedRef = useRef<Set<string>>(new Set());

  const fetchActive = useCallback(async () => {
    try {
      const q = currentPage ? `?page=${encodeURIComponent(currentPage)}` : "";
      const res = await apiFetch(`/api/announcements/active${q}`);
      if (res && res.success) {
        // Respect client-side frequency gating
        const visible = (res.announcements || []).filter(shouldShow);
        setItems(visible);
      }
    } catch (e) { /* ignore */ }
  }, [currentPage]);

  useEffect(() => {
    fetchActive();
    // Real-time via SSE: new/updated announcements appear instantly (no polling).
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_BASE}/api/announcements/stream`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data && data.type && data.type.startsWith("ANNOUNCEMENT")) fetchActive();
        } catch {}
      };
      es.onerror = () => { /* browser auto-reconnects; polling fallback below covers gaps */ };
    } catch (e) { /* SSE unsupported */ }
    // Lightweight polling fallback (60s) in case SSE is blocked by a proxy.
    const t = setInterval(fetchActive, 60000);
    return () => { if (es) es.close(); clearInterval(t); };
  }, [fetchActive]);

  // Fire a view once per announcement per mount + mark frequency.
  useEffect(() => {
    for (const a of items) {
      if (!viewedRef.current.has(a.id)) {
        viewedRef.current.add(a.id);
        markShown(a);
        apiFetch(`/api/announcements/${a.id}/view`, { method: "POST", body: JSON.stringify({ variant: a._variant || "A" }) }).catch(() => {});
      }
    }
  }, [items]);

  const handleDismiss = async (a: any, permanent = false) => {
    setDismissed(prev => new Set(prev).add(a.id));
    try {
      await apiFetch(`/api/announcements/${a.id}/dismiss`, {
        method: "POST",
        body: JSON.stringify({ permanent, variant: a._variant || "A" }),
      });
    } catch (e) { /* ignore */ }
  };

  const handleCta = async (a: any) => {
    apiFetch(`/api/announcements/${a.id}/click`, { method: "POST", body: JSON.stringify({ variant: a._variant || "A" }) }).catch(() => {});
    if (a.cta_url) {
      if (/^https?:\/\//.test(a.cta_url)) window.open(a.cta_url, "_blank", "noopener");
      else window.location.hash = a.cta_url.replace(/^\/?/, "");
    }
  };

  const active = items.filter(a => !dismissed.has(a.id));
  if (active.length === 0) return null;

  const style = (a: any) => ({
    background: a.bg_color || undefined,
    color: a.text_color || undefined,
  });

  // Render each announcement per its display type. Highest priority handled first.
  const banners = active.filter(a => a.display_type === "banner" || a.display_type === "top_banner");
  const bottomBanners = active.filter(a => a.display_type === "bottom_banner");
  const floats = active.filter(a => a.display_type === "floating");
  const modals = active.filter(a => a.display_type === "modal" || a.display_type === "popup" || a.display_type === "fullscreen");
  const sliders = active.filter(a => a.display_type === "slider");

  const CTA = ({ a }: { a: any }) => a.cta_text ? (
    <button onClick={() => handleCta(a)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold transition-all cursor-pointer shrink-0">
      <span>{a.cta_text}</span><ArrowRight className="h-3.5 w-3.5" />
    </button>
  ) : null;

  const DismissBtns = ({ a }: { a: any }) => a.dismissible ? (
    <div className="flex items-center gap-2 shrink-0">
      {(a.frequency !== "always") && (
        <button onClick={() => handleDismiss(a, true)} className="text-[10px] underline opacity-70 hover:opacity-100 cursor-pointer">Don't show again</button>
      )}
      <button onClick={() => handleDismiss(a)} className="p-1 rounded hover:bg-white/15 cursor-pointer"><X className="h-4 w-4" /></button>
    </div>
  ) : null;

  return (
    <>
      {/* Top banners */}
      {banners.map(a => (
        <div key={a.id} style={style(a)} className="w-full bg-gradient-to-r from-purple-700 to-cyan-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 animate-[slideDown_.3s_ease] shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <Megaphone className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-sm">{a.title}</span>
              {a.body && <span className="text-xs opacity-80 ml-2 hidden sm:inline">{a.body}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0"><CTA a={a} /><DismissBtns a={a} /></div>
        </div>
      ))}

      {/* Floating cards (bottom-right) */}
      <div className="fixed bottom-5 right-5 z-[60] space-y-3 max-w-sm w-[calc(100%-2.5rem)] sm:w-80">
        {floats.map(a => (
          <div key={a.id} style={style(a)} className="rounded-2xl bg-gradient-to-br from-[#1a0f38] to-[#0a0418] border border-purple-500/30 shadow-2xl p-4 animate-[slideUp_.3s_ease]">
            <div className="flex items-start justify-between gap-3">
              <span className="text-purple-300"><Megaphone className="h-5 w-5" /></span>
              <DismissBtns a={a} />
            </div>
            <h4 className="font-bold text-white text-sm mt-2 font-space">{a.title}</h4>
            {a.body && <p className="text-xs text-purple-200/70 mt-1 leading-relaxed">{a.body}</p>}
            {a.images?.[0] && <img src={a.images[0]} alt="" className="mt-2 rounded-lg w-full object-cover max-h-32" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
            <div className="mt-3"><CTA a={a} /></div>
          </div>
        ))}
      </div>

      {/* Bottom banners */}
      {bottomBanners.map(a => (
        <div key={a.id} style={style(a)} className="fixed bottom-0 left-0 right-0 z-[55] bg-gradient-to-r from-purple-700 to-cyan-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-2xl animate-[slideUp_.3s_ease]">
          <div className="flex items-center gap-3 min-w-0"><Megaphone className="h-4 w-4 shrink-0" /><span className="font-bold text-sm truncate">{a.title}</span><span className="text-xs opacity-80 hidden sm:inline">{a.body}</span></div>
          <div className="flex items-center gap-3"><CTA a={a} /><DismissBtns a={a} /></div>
        </div>
      ))}

      {/* Modals / popups / fullscreen (show one at a time — highest priority) */}
      {modals.length > 0 && (() => {
        const a = modals[0];
        const full = a.display_type === "fullscreen";
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_.2s_ease]">
            <div style={style(a)} className={`relative bg-gradient-to-br from-[#160b32] to-[#080416] border border-purple-500/30 rounded-3xl shadow-2xl overflow-hidden ${full ? "w-full h-full max-w-3xl max-h-[90vh]" : "w-full max-w-md"} animate-[popIn_.25s_ease]`}>
              {a.dismissible && <button onClick={() => handleDismiss(a)} className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white cursor-pointer"><X className="h-5 w-5" /></button>}
              {a.video_url ? <div className="p-4 pb-0"><AnnVideo url={a.video_url} /></div> : (a.images?.[0] && <img src={a.images[0]} alt="" className="w-full max-h-48 object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />)}
              <div className="p-6 text-center space-y-3 overflow-y-auto">
                <h3 className="text-xl font-black font-space text-white">{a.title}</h3>
                {a.body && <RichBody html={a.body} className="text-sm text-purple-200/70 leading-relaxed announcement-body" />}
                {a.cta_text && (
                  <button onClick={() => handleCta(a)} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-sm hover:brightness-110 transition-all cursor-pointer mt-2">
                    <span>{a.cta_text}</span><ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {a.dismissible && a.frequency !== "always" && (
                  <div><button onClick={() => handleDismiss(a, true)} className="text-[11px] text-purple-200/40 underline hover:text-purple-200/70 cursor-pointer mt-2">Don't show this again</button></div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Homepage slider/carousel (auto-advancing) */}
      {sliders.length > 0 && <AnnouncementSlider items={sliders} onCta={handleCta} onDismiss={handleDismiss} />}
    </>
  );
}

// Auto-advancing slider for "slider" display type announcements.
function AnnouncementSlider({ items, onCta, onDismiss }: { items: any[]; onCta: (a: any) => void; onDismiss: (a: any, p?: boolean) => void }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length]);
  const a = items[Math.min(idx, items.length - 1)];
  if (!a) return null;
  return (
    <div className="w-full rounded-2xl overflow-hidden border border-purple-500/20 bg-gradient-to-r from-[#1a0f38] to-[#0a0418] relative animate-[fadeIn_.3s_ease]" style={{ background: a.bg_color || undefined, color: a.text_color || undefined }}>
      <div className="flex flex-col sm:flex-row items-center gap-4 p-5">
        {a.images?.[0] && <img src={a.images[0]} alt="" className="w-full sm:w-40 h-28 object-cover rounded-xl" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
        <div className="flex-1 min-w-0 text-left">
          <h4 className="font-black font-space text-white text-lg">{a.title}</h4>
          {a.body && <RichBody html={a.body} className="text-xs text-purple-200/70 mt-1 announcement-body line-clamp-2" />}
          {a.cta_text && (
            <button onClick={() => onCta(a)} className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold cursor-pointer">
              <span>{a.cta_text}</span><ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {a.dismissible && <button onClick={() => onDismiss(a)} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 cursor-pointer"><X className="h-4 w-4" /></button>}
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === idx ? "w-5 bg-cyan-400" : "w-1.5 bg-purple-500/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
