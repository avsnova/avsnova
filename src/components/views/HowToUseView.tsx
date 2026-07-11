import { useState, useEffect } from "react";
import { 
  HelpCircle, Play, FileText, ChevronDown, ChevronUp, RefreshCw, 
  Layers, CheckCircle, Video, BookOpen, AlertCircle
} from "lucide-react";
import { Card, Button, Badge } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";
import { HELP_GUIDES } from "../../help/helpGuides";
import { ServiceLogo } from "../ui/BrandIcon";

interface Tutorial {
  id: string;
  title: string;
  type: "general" | "product";
  product_id?: string;
  video_url?: string;
  written_guide?: string;
  image_url?: string;
  faq_json?: string; // Stored as a JSON string of Array<{q, a}>
  order_index: number;
}

export default function HowToUseView() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTutorialId, setExpandedTutorialId] = useState<string | null>(null);

  const fetchTutorials = async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch("/api/tutorials?type=general");
      if (data) {
        setTutorials(data);
        if (data.length > 0) {
          setExpandedTutorialId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load help center tutorials:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTutorials();
  }, []);

  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    // If it's already an embed URL, return as-is
    if (url.includes("embed/")) return url;
    
    // Parse standard youtube links
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube.com/embed/${match[2]}`;
    }
    return url;
  };

  return (
    <div className="space-y-8 font-inter">
      {/* Header */}
      <div className="pb-4 border-b border-purple-500/10 text-left">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <HelpCircle className="h-4 w-4" />
          <span>AVS Knowledgebase & Help Portal</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">How to Use the AVS Platform</h2>
        <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Learn how to deploy eSIMs, configure virtual numbers, obtain digital software keys, and maximize your system capabilities.
        </p>
      </div>

      {/* Service Guides — deep-link to the public, shareable Help Center */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white font-space"><BookOpen className="h-4 w-4 text-cyan-300" /> Service Guides</h3>
          <a href="#help" className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer">Open Help Center →</a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {HELP_GUIDES.slice(0, 8).map((g) => (
            <a key={g.slug} href={`#help/${g.slug}`}
              className="flex items-center gap-2.5 rounded-2xl border border-purple-500/12 bg-black/30 p-3 hover:border-purple-500/35 transition-all cursor-pointer">
              <span className="h-9 w-9 rounded-xl bg-white/5 border border-purple-500/12 flex items-center justify-center shrink-0">
                <ServiceLogo name={g.brand || g.title} fallback={g.emoji} size={20} />
              </span>
              <span className="text-xs font-bold text-white truncate">{g.title}</span>
            </a>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 space-y-3">
          <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mx-auto" />
          <p className="text-xs text-purple-200/50">Loading platform tutorials...</p>
        </div>
      ) : tutorials.length === 0 ? (
        <div className="text-center py-20 text-purple-200/30 text-sm italic">
          No platform tutorials found. Please contact the system administrator.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
          
          {/* Tutorial List Column */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest font-space px-2">Guides List</h3>
            <div className="space-y-2">
              {tutorials.map((tut) => {
                const isExpanded = expandedTutorialId === tut.id;
                return (
                  <div
                    key={tut.id}
                    onClick={() => setExpandedTutorialId(tut.id)}
                    className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-4 ${isExpanded ? "bg-purple-600/10 border-purple-500 text-white" : "bg-black/20 border-purple-500/10 text-purple-200 hover:text-white hover:border-purple-500/30"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                        {tut.video_url ? <Video className="h-4.5 w-4.5" /> : <BookOpen className="h-4.5 w-4.5" />}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[10px] text-purple-200/40 uppercase block font-bold tracking-wider font-space">Guide #{tut.order_index}</span>
                        <span className="font-bold text-xs sm:text-sm font-space truncate block">{tut.title}</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-purple-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-purple-200/40" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Tutorial Content Detail View */}
          <div className="lg:col-span-7 space-y-6">
            {(() => {
              const activeTut = tutorials.find(t => t.id === expandedTutorialId);
              if (!activeTut) return null;

              // Parse FAQ json if exists
              let faqs: Array<{q: string, a: string}> = [];
              if (activeTut.faq_json) {
                try {
                  faqs = JSON.parse(activeTut.faq_json);
                } catch (e) {}
              }

              const isVideo = activeTut.video_url && activeTut.video_url.trim().length > 0;

              return (
                <Card className="p-6 border-purple-500/20 bg-gradient-to-br from-[#110729]/80 to-[#080215]/95 space-y-6">
                  {/* Title banner */}
                  <div className="border-b border-purple-500/15 pb-4">
                    <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider block mb-1">Active Learning Module</span>
                    <h3 className="text-lg sm:text-xl font-bold font-space text-white">{activeTut.title}</h3>
                  </div>

                  {/* YouTube Embedded Video Player */}
                  {isVideo && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">🎬 Interactive Video Tutorial</span>
                      <div className="relative pb-[56.25%] h-0 rounded-2xl overflow-hidden border border-purple-500/15 shadow-lg bg-black">
                        <iframe
                          className="absolute top-0 left-0 w-full h-full border-0"
                          src={getEmbedUrl(activeTut.video_url || "")}
                          title={activeTut.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}

                  {/* Written Step-by-Step Instructions */}
                  {activeTut.written_guide && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">📝 Written Instructions</span>
                      <div className="p-4 bg-black/40 border border-purple-500/10 rounded-2xl text-xs sm:text-sm text-purple-200 leading-relaxed font-mono whitespace-pre-wrap text-left">
                        {activeTut.written_guide}
                      </div>
                    </div>
                  )}

                  {/* FAQ Accordion Section */}
                  {faqs.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-purple-500/10">
                      <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">💡 Frequently Asked Questions</span>
                      <div className="space-y-2.5">
                        {faqs.map((faq, fIdx) => (
                          <div key={fIdx} className="p-3.5 bg-black/20 border border-purple-500/5 rounded-xl space-y-1.5 text-xs text-left">
                            <span className="font-bold text-white block">Q: {faq.q}</span>
                            <p className="text-purple-200/60 leading-relaxed">A: {faq.a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom safety notice */}
                  <div className="p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-xl text-[10px] text-cyan-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Need specialized operational or hardware integration details? Contact our enterprise help desk via Live Whatsapp Support.</span>
                  </div>

                </Card>
              );
            })()}
          </div>

        </div>
      )}
    </div>
  );
}