import { useState, useEffect } from "react";
import { Search, BookOpen, ArrowLeft, Loader2, ChevronRight, Home } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { renderDocHtml } from "../admin/docMarkdown";

// Feature 3 — PUBLIC documentation / knowledge base (Notion/GitBook-style).
// #docs → index (grouped + search); #docs/<slug> → article with related links.

interface DocMeta { slug: string; title: string; category: string; excerpt?: string; icon?: string; }

export default function DocsPublicView({ slug, onNavigate, onHome }: { slug?: string; onNavigate: (slug?: string) => void; onHome: () => void }) {
  const [index, setIndex] = useState<DocMeta[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [article, setArticle] = useState<any>(null);
  const [related, setRelated] = useState<DocMeta[]>([]);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try { const res = await apiFetch("/api/docs"); if (res && res.docs) setIndex(res.docs); }
      catch { /* ignore */ } finally { setLoadingIndex(false); }
    })();
  }, []);

  useEffect(() => {
    if (!slug) { setArticle(null); return; }
    setLoadingArticle(true); setError("");
    (async () => {
      try {
        const res = await apiFetch(`/api/docs/${encodeURIComponent(slug)}`);
        if (res && res.doc) { setArticle(res.doc); setRelated(res.related || []); }
        else setError("Document not found.");
      } catch (e: any) {
        setError(e.message && e.message.includes("restricted") ? "This document is restricted." : "Document not found.");
      } finally { setLoadingArticle(false); }
    })();
  }, [slug]);

  const grouped: Record<string, DocMeta[]> = {};
  const filtered = index.filter((d) => !search.trim() || (d.title + d.category + (d.excerpt || "")).toLowerCase().includes(search.toLowerCase()));
  filtered.forEach((d) => { (grouped[d.category] = grouped[d.category] || []).push(d); });

  return (
    <div className="min-h-screen bg-[#03000a] text-[#f5f0ff] relative overflow-x-clip">
      <div className="absolute top-[5%] left-[5%] w-72 h-72 rounded-full bg-purple-600/10 blur-[110px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[5%] w-72 h-72 rounded-full bg-cyan-600/10 blur-[110px] pointer-events-none" />

      {/* Top bar */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#05020a]/80 border-b border-purple-500/15">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button onClick={onHome} className="flex items-center gap-2 cursor-pointer">
            <span className="text-lg font-black font-space tracking-tight text-white">AVS<span className="text-cyan-400">shop</span></span>
            <span className="text-[10px] text-purple-200/40 uppercase tracking-widest font-bold hidden sm:inline">Docs</span>
          </button>
          <button onClick={onHome} className="flex items-center gap-1.5 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer"><Home className="h-4 w-4" /> Home</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 relative z-10 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar index */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-purple-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search docs…" className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-lg focus:outline-none focus:border-purple-500" />
            </div>
            {loadingIndex ? <Loader2 className="h-5 w-5 animate-spin text-purple-400" /> : Object.keys(grouped).sort().map((cat) => (
              <div key={cat} className="space-y-1">
                <span className="text-[10px] font-bold text-purple-300/70 uppercase tracking-wider font-space">{cat}</span>
                {grouped[cat].map((d) => (
                  <button key={d.slug} onClick={() => onNavigate(d.slug)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${slug === d.slug ? "bg-purple-600/20 border border-purple-500/30 text-white" : "text-purple-200/60 hover:text-white hover:bg-white/5"}`}>
                    <span>{d.icon || "📄"}</span><span className="truncate">{d.title}</span>
                  </button>
                ))}
              </div>
            ))}
            {!loadingIndex && index.length === 0 && <p className="text-[11px] text-purple-200/30 italic">No documentation published yet.</p>}
          </div>
        </aside>

        {/* Content */}
        <main className="lg:col-span-3 min-w-0">
          {!slug ? (
            <div className="space-y-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-purple-500/25 px-3 py-1 text-[10px] font-bold text-purple-200 uppercase tracking-widest font-space mb-3"><BookOpen className="h-3.5 w-3.5 text-cyan-300" /> Knowledge Base</div>
                <h1 className="text-3xl font-black font-space text-white">How can we help?</h1>
                <p className="text-sm text-purple-200/60 mt-2">Browse guides, policies and developer documentation.</p>
              </div>
              {loadingIndex ? <Loader2 className="h-6 w-6 animate-spin text-purple-400" /> : Object.keys(grouped).sort().map((cat) => (
                <div key={cat} className="space-y-3">
                  <h2 className="text-sm font-bold text-purple-300 uppercase tracking-wider font-space">{cat}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {grouped[cat].map((d) => (
                      <button key={d.slug} onClick={() => onNavigate(d.slug)} className="text-left p-4 rounded-2xl border border-purple-500/15 bg-black/30 hover:border-purple-500/40 hover:bg-black/50 transition-all cursor-pointer group">
                        <div className="flex items-center gap-2.5 mb-1"><span className="text-xl">{d.icon || "📄"}</span><h3 className="font-bold text-white text-sm font-space group-hover:text-purple-300">{d.title}</h3></div>
                        {d.excerpt && <p className="text-[11px] text-purple-200/50 leading-relaxed line-clamp-2">{d.excerpt}</p>}
                        <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400 font-bold mt-2">Read <ChevronRight className="h-3 w-3" /></span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : loadingArticle ? (
            <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-purple-400 mx-auto" /></div>
          ) : error ? (
            <div className="py-20 text-center space-y-3">
              <p className="text-sm text-purple-200/60">{error}</p>
              <button onClick={() => onNavigate(undefined)} className="text-xs font-bold text-cyan-400 hover:underline cursor-pointer">← Back to all docs</button>
            </div>
          ) : article ? (
            <article className="space-y-5">
              <button onClick={() => onNavigate(undefined)} className="flex items-center gap-1.5 text-xs font-bold text-purple-200/60 hover:text-white cursor-pointer"><ArrowLeft className="h-4 w-4" /> All documentation</button>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{article.icon || "📄"}</span>
                <div>
                  <span className="text-[10px] text-purple-300/60 uppercase tracking-wider font-bold font-space">{article.category}</span>
                  <h1 className="text-2xl font-black font-space text-white">{article.title}</h1>
                </div>
              </div>
              <div className="avs-doc rounded-2xl border border-purple-500/15 bg-[#0b031d]/60 p-6" dangerouslySetInnerHTML={{ __html: renderDocHtml(article.body || "") }} />
              {article.updated_at && <p className="text-[10px] text-purple-200/30 font-mono">Last updated {new Date(article.updated_at).toLocaleDateString()}</p>}
              {related.length > 0 && (
                <div className="pt-4 border-t border-purple-500/15 space-y-2">
                  <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider font-space">Related articles</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {related.map((r) => (
                      <button key={r.slug} onClick={() => onNavigate(r.slug)} className="text-left p-3 rounded-xl border border-purple-500/10 bg-black/30 hover:border-purple-500/30 cursor-pointer flex items-center gap-2">
                        <span>{r.icon || "📄"}</span><span className="text-xs font-bold text-white truncate">{r.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ) : null}
        </main>
      </div>
    </div>
  );
}
