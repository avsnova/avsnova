import { useState, useEffect, useCallback } from "react";
import { Megaphone, Send, Loader2, Trash2, Wrench, PackageX, PackageCheck, Tag, Sparkles, Info, Radio } from "lucide-react";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import { apiFetch } from "../../../utils/api";
import { SectionCard, EmptyState } from "./aiAdminUi";

// Streamlined broadcast composer that publishes targeted announcements through the
// existing announcements API. These surface instantly inside the AI Assistant to the
// affected users only (page/role targeting handled server-side). No backend changes.

type Category = "maintenance" | "feature" | "promotion" | "news";

const TEMPLATES: { id: string; label: string; icon: typeof Wrench; category: Category; title: string; body: string; pages: string[] }[] = [
  { id: "provider", label: "Provider issue", icon: Wrench, category: "maintenance", title: "Provider maintenance in progress", body: "Some orders may be delayed due to provider maintenance. Estimated recovery: 2 hours. Your orders are safe and will complete automatically.", pages: ["Marketplace"] },
  { id: "outofstock", label: "Temporarily unavailable", icon: PackageX, category: "maintenance", title: "Temporarily unavailable", body: "This product/service is temporarily unavailable. We're restocking now — please check back shortly.", pages: ["Marketplace"] },
  { id: "restock", label: "Back in stock", icon: PackageCheck, category: "feature", title: "Back in stock", body: "Good news! This product is back in stock and ready to order.", pages: ["Marketplace"] },
  { id: "delay", label: "Orders delayed", icon: Radio, category: "maintenance", title: "Orders slightly delayed", body: "Orders are processing a little slower than usual due to high demand. Estimated recovery: 1 hour. Thanks for your patience!", pages: ["Marketplace", "SMM Panel"] },
  { id: "discount", label: "Discount / promo", icon: Tag, category: "promotion", title: "Limited-time discount", body: "Enjoy special pricing across the Marketplace for a limited time. Don't miss out!", pages: ["Marketplace"] },
  { id: "arrival", label: "New arrivals", icon: Sparkles, category: "feature", title: "New arrivals just landed", body: "Fresh products just arrived in the Marketplace. Be the first to grab them!", pages: ["Marketplace"] },
];

const PAGE_OPTIONS = ["Marketplace", "SMM Panel", "SMS Panel", "Wallet", "Dashboard", "Orders"];
const CATEGORY_TONE: Record<Category, string> = {
  maintenance: "text-amber-300", feature: "text-cyan-300", promotion: "text-emerald-300", news: "text-purple-300",
};

export default function AiBroadcastPanel() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("maintenance");
  const [pages, setPages] = useState<string[]>(["Marketplace"]);
  const [audience, setAudience] = useState<"all" | "customers">("all");
  const [eta, setEta] = useState("");
  const [expiresHours, setExpiresHours] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<any[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);

  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const res = await apiFetch("/api/admin/announcements");
      const list = (res?.announcements || []).filter((a: any) => a.status === "published");
      setActive(list);
    } catch { /* ignore */ }
    finally { setLoadingActive(false); }
  }, []);

  useEffect(() => { loadActive(); }, [loadActive]);

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    setTitle(t.title); setBody(t.body); setCategory(t.category); setPages(t.pages);
  };

  const togglePage = (p: string) => setPages((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const send = async () => {
    if (!title.trim()) { toast("Add a title for the broadcast.", "warning"); return; }
    if (pages.length === 0) { toast("Choose at least one page to target.", "warning"); return; }
    setSending(true);
    try {
      const finalBody = eta.trim() ? `${body.trim()}${body.trim() ? "\n\n" : ""}Estimated recovery: ${eta.trim()}.` : body.trim();
      const end_at = expiresHours > 0 ? new Date(Date.now() + expiresHours * 3600000).toISOString() : "";
      await apiFetch("/api/admin/announcements/save", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: finalBody,
          category,
          display_type: "floating",     // non-intrusive; primary surface is the AI assistant
          status: "published",
          dismissible: 1,
          target_audience: audience === "customers" ? "customers" : "all",
          target_pages: pages,
          priority: category === "maintenance" ? 10 : 5,
          start_at: new Date().toISOString(),
          end_at,
        }),
      });
      toast("Broadcast published — it's now live in the AI Assistant for targeted users.", "success", { big: true });
      setTitle(""); setBody(""); setEta(""); setExpiresHours(0);
      await loadActive();
    } catch (e: any) {
      toast("Failed to publish broadcast: " + (e?.message || "unknown"), "error");
    } finally {
      setSending(false);
    }
  };

  const remove = async (a: any) => {
    if (!(await confirm({ title: "Remove broadcast", message: `Take down "${a.title}"? Users will stop seeing it.`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await apiFetch(`/api/admin/announcements/delete/${a.id}`, { method: "DELETE" });
      toast("Broadcast removed.", "success");
      await loadActive();
    } catch { toast("Failed to remove broadcast.", "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/15 p-4 flex items-start gap-3">
        <Megaphone className="h-5 w-5 text-cyan-300 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-white">Live broadcasts through the AI Assistant</div>
          <p className="text-[11px] text-purple-200/50 mt-0.5">Publish provider issues, stock updates, maintenance or promos. Only users on the targeted pages see them — instantly, inside Aria.</p>
        </div>
      </div>

      <SectionCard title="Quick templates">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => applyTemplate(t)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/30 border border-purple-500/15 text-left hover:border-purple-500/35 transition-all cursor-pointer">
                <Icon className="h-4 w-4 text-purple-300 shrink-0" />
                <span className="text-[11px] font-bold text-purple-100">{t.label}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Compose broadcast">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Instagram orders delayed"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Explain what's happening in a friendly, reassuring way…"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 resize-none custom-scrollbar-thin" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 cursor-pointer">
                <option value="maintenance">Maintenance / Issue</option>
                <option value="feature">Update / Restock</option>
                <option value="promotion">Promotion / Discount</option>
                <option value="news">News</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Est. recovery (optional)</label>
              <input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. 2 hours"
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Auto-expire</label>
              <select value={expiresHours} onChange={(e) => setExpiresHours(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-black/40 border border-purple-500/20 text-sm text-white focus:outline-none focus:border-purple-500 cursor-pointer">
                <option value={0}>Never</option>
                <option value={2}>In 2 hours</option>
                <option value={6}>In 6 hours</option>
                <option value={24}>In 24 hours</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Show on pages (targeting)</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PAGE_OPTIONS.map((p) => (
                <button key={p} onClick={() => togglePage(p)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${pages.includes(p) ? "bg-purple-500/20 border-purple-500/40 text-white" : "bg-black/30 border-purple-500/15 text-purple-200/50 hover:text-white"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-purple-200/50 uppercase tracking-wider">Audience</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-black/40 border border-purple-500/20 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer">
              <option value="all">All users</option>
              <option value="customers">Customers only</option>
            </select>
          </div>

          {/* Preview */}
          {(title || body) && (
            <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-3">
              <div className="text-[10px] font-bold text-cyan-300/70 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Info className="h-3 w-3" /> Preview in Aria</div>
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shrink-0 text-[10px]">🤖</div>
                <div className="rounded-2xl rounded-bl-md bg-white/5 border border-purple-500/15 px-3 py-2 text-xs text-purple-100 whitespace-pre-wrap">
                  <span className={`font-bold ${CATEGORY_TONE[category]}`}>{category === "maintenance" ? "🛠️" : category === "promotion" ? "🎉" : category === "feature" ? "✨" : "📣"} {title || "Title"}</span>
                  {body && <>{"\n\n"}{body}</>}
                  {eta && <>{"\n\n"}Estimated recovery: {eta}.</>}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={send} disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-purple-500/20">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish broadcast
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Active broadcasts" right={<span className="text-[10px] text-purple-200/40">{active.length} live</span>}>
        {loadingActive ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />)}</div>
        ) : active.length === 0 ? (
          <EmptyState label="No active broadcasts. Published notices appear here." icon={<Megaphone className="h-7 w-7" />} />
        ) : (
          <div className="space-y-2">
            {active.map((a) => {
              const targetPages = (() => { try { return JSON.parse(a.target_pages || "[]"); } catch { return []; } })();
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-purple-500/12 bg-black/30 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{a.title}</div>
                    <div className="text-[10px] text-purple-200/40 mt-0.5">
                      {a.category} · {targetPages.length ? targetPages.join(", ") : "all pages"}{a.end_at ? ` · expires ${new Date(a.end_at).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <button onClick={() => remove(a)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 cursor-pointer shrink-0"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
