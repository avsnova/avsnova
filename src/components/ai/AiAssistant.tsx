import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, X, Send, Sparkles, Copy, Check, ArrowRight, MessageCircle, Loader2, ExternalLink, ThumbsUp, ThumbsDown } from "lucide-react";
import { type AssistantContext, type AssistantReply, type RichAction } from "../../ai/engine";
import { fetchAiStatus, streamRemote, type RemoteStatus } from "../../ai/remoteProvider";
import { getPageContext, type QuickReply } from "../../ai/pageContext";
import { useSessionMemory } from "../../ai/useSessionMemory";
import { openWhatsapp, type EscalationSummary } from "../../ai/escalation";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";
import { apiFetch } from "../../utils/api";
import { useUiFocusMode } from "../../utils/uiFocusStore";
import { playUiSound } from "../../utils/notifySound";
import { getAiConfig, subscribeAiConfig, isAiOperational, type AiConfig } from "../../ai/aiConfig";
import { getQuickRepliesForPage } from "../../ai/aiContentStore";
import { startConversation, logUserMessage, logAssistantMessage, recordEscalation, recordSatisfaction } from "../../ai/aiAnalytics";
import { onOpenAssistant, type AssistantOrderContext } from "../../ai/assistantBridge";
import { fetchNotices, noticeToMessage, markNoticeShown, wasNoticeShown, type AiNotice } from "../../ai/aiNotices";

interface AiAssistantProps {
  section: string | null;      // App activeSection, or null on landing
  loggedIn: boolean;
  userName?: string | null;
  userEmail?: string | null;
  walletBalance?: number;
  onNavigate?: (section: string) => void;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  suggestions?: QuickReply[];
  actions?: RichAction[];
  escalate?: boolean;
  streaming?: boolean;
  rated?: "up" | "down";
}

const OPEN_KEY = "avs_ai_open";
const SEEN_KEY = "avs_ai_greeted";

let msgId = 1;
const nextId = () => msgId++;

export default function AiAssistant({ section, loggedIn, userName, userEmail, walletBalance, onNavigate }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  // Focus mode: a checkout/purchase modal, SMS terminal, or form is active. The launcher
  // shrinks and proactive bubbles are suppressed so we never block a high-intent action.
  const focusMode = useUiFocusMode();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [proactiveText, setProactiveText] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState<string | undefined>(undefined);
  const [unread, setUnread] = useState(false);
  const [config, setConfig] = useState<AiConfig>(() => getAiConfig());

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProactive = useRef<number>(0);
  const promptsThisSession = useRef<number>(0);
  const convId = useRef<string | null>(null);
  const streamTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const remoteStatus = useRef<RemoteStatus | null>(null);
  // Order context injected by other components (e.g. an order's "Open AI Assistant").
  const orderContext = useRef<AssistantOrderContext | null>(null);
  const pendingAsk = useRef<string | null>(null);
  // Context-aware admin notices for the current page (delivered through the assistant).
  const [notices, setNotices] = useState<AiNotice[]>([]);
  const noticeInjected = useRef<Set<string>>(new Set());
  const { notePage, noteTopic, get: getMemory } = useSessionMemory();

  // Live-sync with the Admin AI config store.
  useEffect(() => subscribeAiConfig(setConfig), []);

  // Fetch backend AI provider status once (lightweight; cached 60s). Refresh when opened.
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetchAiStatus().then((s) => { if (!cancelled) remoteStatus.current = s; }).catch(() => {});
    return () => { cancelled = true; };
  }, [loggedIn]);

  const ctx = getPageContext(section, loggedIn);
  // Admin may override quick replies per page; fall back to Turn 1 defaults.
  const pageKey = loggedIn ? (section || "Dashboard") : "Landing";
  let pageQuickReplies: QuickReply[] = ctx.quickReplies;
  try { const ov = getQuickRepliesForPage(pageKey); if (ov && ov.length) pageQuickReplies = ov; } catch { /* ignore */ }

  // Lock page scroll only on small screens when the sheet is open.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Only flip state when the breakpoint actually changes → avoids re-rendering
    // the assistant on every resize tick while dragging a desktop window.
    const check = () => setIsMobile((prev) => {
      const next = window.innerWidth < 640;
      return prev === next ? prev : next;
    });
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);
  useBodyScrollLock(open && isMobile);

  // Restore open state (remember open/closed).
  useEffect(() => {
    try { if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true); } catch { /* sandbox */ }
  }, []);

  // Fetch the WhatsApp support number from public settings (no backend change).
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/settings")
      .then((d) => { if (!cancelled && d?.settings?.whatsapp_number) setWhatsappNumber(d.settings.whatsapp_number); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Track page for session memory + refresh contextual greeting when navigating.
  useEffect(() => { notePage(section); }, [section, notePage]);

  // Fetch context-aware admin notices for the current page (targeted server-side by
  // page/role/schedule). Only relevant notices surface — no unrelated announcements.
  useEffect(() => {
    if (!loggedIn) { setNotices([]); return; }
    let cancelled = false;
    fetchNotices(section, loggedIn).then((list) => { if (!cancelled) setNotices(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [section, loggedIn]);



  const persistOpen = (v: boolean) => { try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch { /* sandbox */ } };

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => { if (open) scrollToBottom(); }, [messages, thinking, open, scrollToBottom]);

  // Seed the greeting the first time the panel opens (or when empty).
  const ensureGreeting = useCallback(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      const op = isAiOperational();
      const greeting = op.reason === "maintenance"
        ? "🛠️ Aria is briefly in maintenance mode. I'll be back shortly — meanwhile you can still reach our team on WhatsApp if it's urgent."
        : ctx.greeting;
      return [{
        id: nextId(),
        role: "assistant",
        text: greeting,
        suggestions: pageQuickReplies,
      }];
    });
  }, [ctx.greeting, pageQuickReplies]);

  // Inject any unshown page notices into the conversation as friendly AI messages.
  const injectNotices = useCallback(() => {
    if (!notices.length) return;
    const fresh = notices.filter((n) => !noticeInjected.current.has(n.id));
    if (!fresh.length) return;
    setMessages((prev) => {
      const add = fresh.map((n) => {
        noticeInjected.current.add(n.id);
        markNoticeShown(n.id);
        return {
          id: nextId(), role: "assistant" as const, text: noticeToMessage(n),
          actions: n.ctaUrl && !/^https?:/i.test(n.ctaUrl)
            ? [{ label: n.ctaText || "Open", section: n.ctaUrl.replace(/^\//, ""), variant: "secondary" as const }]
            : undefined,
        };
      });
      return [...prev, ...add];
    });
  }, [notices]);

  const openPanel = () => {
    setOpen(true); persistOpen(true); setUnread(false); setProactiveText(null);
    ensureGreeting();
    // Surface page-relevant admin notices inside the chat.
    setTimeout(() => injectNotices(), 60);
    // Refresh provider status so streaming/provider changes take effect promptly.
    if (loggedIn) fetchAiStatus().then((s) => { remoteStatus.current = s; }).catch(() => {});
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* sandbox */ }
    setTimeout(() => inputRef.current?.focus(), 120);
  };
  const closePanel = () => { setOpen(false); persistOpen(false); };

  // React to newly fetched notices: if the panel is open, inject them into chat;
  // otherwise, nudge with a proactive bubble for the first unseen notice.
  useEffect(() => {
    if (!notices.length) return;
    if (open) { injectNotices(); return; }
    const firstUnseen = notices.find((n) => !wasNoticeShown(n.id));
    if (firstUnseen) {
      setProactiveText(firstUnseen.title);
      setUnread(true);
    }
  }, [notices, open, injectNotices]);

  // ————— Streaming reveal of an assistant reply —————
  const streamReply = useCallback((reply: AssistantReply) => {
    const id = nextId();
    setMessages((prev) => [...prev, { id, role: "assistant", text: "", streaming: true }]);
    const full = reply.text;
    // Reveal by word for a lively but fast feel.
    const words = full.split(/(\s+)/);
    let i = 0;
    const step = () => {
      i += 1;
      const partial = words.slice(0, i).join("");
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: partial } : m)));
      scrollToBottom();
      if (i < words.length) {
        const t = setTimeout(step, Math.max(4, config.typingSpeedMs));
        streamTimers.current.push(t);
      } else {
        setMessages((prev) => prev.map((m) => (m.id === id ? {
          ...m, streaming: false, suggestions: reply.suggestions, actions: reply.actions, escalate: reply.escalate,
        } : m)));
        if (!open) setUnread(true);
        try { playUiSound("info"); } catch { /* ignore */ }
      }
    };
    const t0 = setTimeout(step, 10);
    streamTimers.current.push(t0);
  }, [open, scrollToBottom, config.typingSpeedMs]);

  useEffect(() => () => { streamTimers.current.forEach(clearTimeout); }, []);

  // Real-streaming reveal: create an empty assistant bubble and append live deltas
  // as they arrive from the provider. Falls back to word-animation via streamReply
  // when the source is local/non-streaming (handled by the caller).
  const finalizeStreamed = useCallback((id: number, reply: AssistantReply) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? {
      ...m, streaming: false, text: reply.text || m.text,
      suggestions: reply.suggestions, actions: reply.actions, escalate: reply.escalate,
    } : m)));
    if (!open) setUnread(true);
    try { playUiSound("info"); } catch { /* ignore */ }
  }, [open]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput("");
    setProactiveText(null);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
    setThinking(true);

    // Start a conversation record on the first user message.
    if (!convId.current) {
      try { convId.current = startConversation({ page: pageKey, userName, userId: userEmail || null }); } catch { /* ignore */ }
    }
    try { if (convId.current) logUserMessage(convId.current, text); } catch { /* ignore */ }

    const op = isAiOperational();
    // Offline / maintenance: politely explain and offer WhatsApp; never process.
    if (!op.ok) {
      await new Promise((r) => setTimeout(r, 300));
      setThinking(false);
      streamReply({
        text: op.reason === "maintenance"
          ? "🛠️ Aria is in maintenance mode right now. Please try again shortly, or reach our team directly on WhatsApp."
          : "Aria is currently offline. Our team can still help you on WhatsApp.",
        confidence: 0, escalate: true,
        actions: [{ label: "Continue on WhatsApp", escalate: true, variant: "primary" }],
      });
      return;
    }

    const oc = orderContext.current;
    const aContext: AssistantContext = {
      section, loggedIn, userName, userId: userEmail || null, walletBalance, memory: getMemory(),
      order: oc ? {
        id: oc.orderId, product: oc.product, quantity: oc.quantity, status: oc.status,
        paymentStatus: oc.paymentStatus, category: oc.category, amount: oc.amount, timeSince: oc.timeSince,
      } : null,
    };
    // Transcript for provider context (last turns).
    const history = messages.filter((m) => !m.streaming).map((m) => ({ role: m.role, text: m.text }));
    const t0 = performance.now();

    // Create the live assistant bubble up-front so real tokens can stream in.
    const liveId = nextId();
    let started = false;
    let firstDelta = true;
    let acc = "";
    const finish = (reply: AssistantReply) => {
      const responseMs = Math.round(performance.now() - t0);
      noteTopic(reply.topicId);
      try {
        if (convId.current) logAssistantMessage(convId.current, reply.text, {
          confidence: reply.confidence, topicId: reply.topicId, escalated: reply.escalate, responseMs, page: pageKey,
        });
      } catch { /* ignore */ }
      if (!started) {
        // No live bubble was created (non-streaming path) → animate via streamReply.
        setThinking(false);
        streamReply(reply);
      } else {
        finalizeStreamed(liveId, reply);
      }
    };

    try {
      await streamRemote(text, aContext, remoteStatus.current, history, {
        onDelta: (d) => {
          if (firstDelta) {
            firstDelta = false; started = true;
            setThinking(false);
            setMessages((prev) => [...prev, { id: liveId, role: "assistant", text: "", streaming: true }]);
          }
          acc += d;
          setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, text: acc } : m)));
          scrollToBottom();
        },
        onDone: (_full, reply) => finish(reply),
        onError: () => {
          setThinking(false);
          streamReply({
            text: "I'm having trouble reaching the assistant right now. You can try again, or I can connect you to a human on WhatsApp.",
            confidence: 0.2, escalate: true,
            actions: [{ label: "Continue on WhatsApp", escalate: true, variant: "primary" }],
          });
        },
      });
    } catch {
      setThinking(false);
      streamReply({
        text: "I'm having trouble reaching the assistant right now. Please try again in a moment.",
        confidence: 0.2, escalate: true,
        actions: [{ label: "Continue on WhatsApp", escalate: true, variant: "primary" }],
      });
    }
  }, [thinking, section, loggedIn, userName, userEmail, walletBalance, getMemory, noteTopic, streamReply, finalizeStreamed, scrollToBottom, messages, pageKey]);

  // Bridge: other components (e.g. an order card) can open the assistant with order
  // context + a prefilled question. We open the panel and auto-send the question.
  useEffect(() => {
    return onOpenAssistant((octx) => {
      orderContext.current = octx || null;
      openPanel();
      const ask = octx?.ask;
      if (ask) {
        pendingAsk.current = ask;
        // Give the panel a beat to mount, then send once.
        setTimeout(() => {
          if (pendingAsk.current) { const q = pendingAsk.current; pendingAsk.current = null; send(q); }
        }, 400);
      }
    });
  }, [send]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (a: RichAction) => {
    if (a.escalate) return doEscalate();
    if (a.section && onNavigate) { onNavigate(a.section); if (isMobile) closePanel(); }
    else if (a.send) send(a.send);
  };

  const doEscalate = () => {
    // Respect the admin escalation toggle.
    if (!config.escalation.enabled) {
      setMessages((prev) => [...prev, {
        id: nextId(), role: "assistant",
        text: "Human handoff is currently disabled by the team, but I'll do my best to help you right here. Could you share a bit more detail?",
      }]);
      return;
    }
    const transcript = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const summary: EscalationSummary = {
      customerName: userName || undefined,
      userId: userEmail || undefined,
      section: section || "Landing",
      status: "Assisted by AI, needs human",
      problem: lastUser?.text || "Customer requested human support",
      transcript,
    };
    // Admin-configured number wins; otherwise fall back to platform settings/default.
    const number = config.escalation.whatsappNumber || whatsappNumber;
    openWhatsapp(number, summary);
    try { if (convId.current) recordEscalation(convId.current); } catch { /* ignore */ }
    setMessages((prev) => [...prev, {
      id: nextId(), role: "assistant",
      text: "I've opened WhatsApp with a full summary of our chat — your name, page and issue are already filled in, so you won't need to repeat anything. Our team will take it from here. 💬",
    }]);
  };

  const copyMsg = async (m: ChatMessage) => {
    try { await navigator.clipboard.writeText(m.text); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1500); } catch { /* ignore */ }
  };

  const rateMsg = (m: ChatMessage, up: boolean) => {
    if (m.rated) return;
    try { recordSatisfaction(up); } catch { /* ignore */ }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, rated: up ? "up" : "down" } : x)));
  };

  // ————— Proactive assistance (idle-based, cooldown-respecting, never spammy) —————
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (open) return; // don't nudge while already open
    if (!ctx.proactive) return;
    const p = config.proactive;
    if (!p.enabled) return;                                   // admin can disable proactivity
    if (isAiOperational().reason === "offline") return;       // no nudges when offline
    if (promptsThisSession.current >= p.maxPromptsPerSession) return; // cap per session
    idleTimer.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastProactive.current < p.cooldownMs) return;
      lastProactive.current = now;
      promptsThisSession.current += 1;
      setProactiveText(ctx.proactive);
      setUnread(true);
      try { playUiSound("info"); } catch { /* ignore */ }
    }, p.idleMs);
  }, [open, ctx.proactive, config.proactive]);

  useEffect(() => {
    resetIdle();
    // Throttle high-frequency events (mousemove/scroll can fire hundreds of times a
    // second). Without this, every pixel of movement cleared+rescheduled a timer,
    // which caused noticeable UI jank/lag. We reset the idle timer at most once/sec.
    let lastReset = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return;
      lastReset = now;
      resetIdle();
    };
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("click", onActivity, { passive: true });
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("click", onActivity);
    };
  }, [resetIdle]);

  // When navigating pages while open, gently refresh quick replies if the convo is fresh.
  useEffect(() => {
    if (!open) return;
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0].role !== "assistant") return prev;
      return [{ ...prev[0], text: ctx.greeting, suggestions: pageQuickReplies }];
    });
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
    if (e.key === "Escape") closePanel();
  };

  // When an admin sets the AI fully offline, hide the assistant entirely.
  if (config.status === "offline") return null;

  return (
    <>
      {/* ————— Floating button ————— */}
      {!open && (
        <div className={`fixed right-4 sm:bottom-6 sm:right-6 z-[150] flex flex-col items-end gap-2 transition-all duration-300 ${loggedIn ? "bottom-20" : "bottom-5"} ${focusMode ? "opacity-40 hover:opacity-100 scale-75 origin-bottom-right" : ""}`}>
          {/* Proactive bubble — never shown while a high-intent surface is active */}
          {proactiveText && !focusMode && (
            <div className="max-w-[240px] mb-1 rounded-2xl rounded-br-md border border-purple-500/30 bg-[#0c0620]/90 backdrop-blur-xl px-3.5 py-2.5 shadow-2xl animate-ai-pop-in relative">
              <button onClick={() => setProactiveText(null)} aria-label="Dismiss" className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-[#1a1030] border border-purple-500/30 text-purple-200/60 hover:text-white flex items-center justify-center cursor-pointer">
                <X className="h-3 w-3" />
              </button>
              <p className="text-xs text-purple-100 leading-snug">{proactiveText}</p>
              <button onClick={openPanel} className="mt-1.5 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer inline-flex items-center gap-1">
                Yes, help me <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
          <button
            onClick={openPanel}
            aria-label="Open AI assistant"
            className="relative h-14 w-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 shadow-2xl shadow-purple-500/30 flex items-center justify-center text-white hover:brightness-110 active:scale-95 transition-all animate-ai-halo cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            <Bot className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-[#03000a] flex items-center justify-center">
              <Sparkles className="h-2 w-2 text-emerald-900" />
            </span>
            {unread && <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-red-500 border-2 border-[#03000a] animate-pulse" />}
          </button>
        </div>
      )}

      {/* ————— Conversation panel ————— */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-[149] bg-black/50 backdrop-blur-sm sm:hidden animate-[fadeIn_0.2s_ease]" onClick={closePanel} aria-hidden="true" />
          <div
            role="dialog" aria-modal="true" aria-label="AI assistant"
            className="fixed z-[150] inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 w-full sm:w-[400px] h-[82vh] sm:h-[600px] sm:max-h-[calc(100vh-3rem)] flex flex-col rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0a0518]/95 backdrop-blur-2xl shadow-2xl overflow-hidden animate-ai-pop-in"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b border-purple-500/15 bg-gradient-to-r from-purple-600/15 to-cyan-500/10">
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg">
                <Bot className="h-5 w-5 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0a0518]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold font-space text-white flex items-center gap-1.5">Aria <span className="text-[9px] font-bold text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">AI</span></div>
                <div className="text-[10px] text-purple-200/50 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online · {ctx.title}</div>
              </div>
              <button onClick={closePanel} aria-label="Close assistant" className="text-purple-200/50 hover:text-white p-1.5 rounded-lg hover:bg-white/5 active:scale-90 transition-all cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 custom-scrollbar-thin">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id} m={m} copiedId={copiedId}
                  onCopy={() => copyMsg(m)} onAction={handleAction} onSuggest={(s) => send(s.send)}
                  onRate={(up) => rateMsg(m, up)}
                />
              ))}
              {thinking && <TypingIndicator />}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-purple-500/15 p-3 bg-black/30">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Ask Aria anything…"
                  aria-label="Message"
                  className="flex-1 resize-none max-h-28 rounded-2xl bg-black/50 border border-purple-500/20 px-4 py-2.5 text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 custom-scrollbar-thin"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || thinking}
                  aria-label="Send"
                  className="shrink-0 h-11 w-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white hover:brightness-110 active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {thinking ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
                </button>
              </div>
              <div className="mt-1.5 text-center text-[9px] text-purple-200/30">Aria can guide you & connect a human when needed</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ————————————————————————— Sub-components ————————————————————————— */

function MessageBubble({ m, copiedId, onCopy, onAction, onSuggest, onRate }: {
  m: ChatMessage; copiedId: number | null;
  onCopy: () => void; onAction: (a: RichAction) => void; onSuggest: (s: QuickReply) => void; onRate: (up: boolean) => void;
}) {
  const isUser = m.role === "user";
  return (
    <div className={`flex gap-2.5 animate-ai-msg-in ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 ${isUser ? "bg-white/10" : "bg-gradient-to-tr from-purple-600 to-cyan-500"}`}>
        {isUser ? <span className="text-[10px] font-bold text-white">You</span> : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className={`min-w-0 max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        <div className={`group relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? "bg-gradient-to-r from-purple-600 to-cyan-600 text-white rounded-br-md" : "bg-white/5 border border-purple-500/15 text-purple-100 rounded-bl-md"
        }`}>
          {m.text}
          {m.streaming && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-cyan-300/80 animate-pulse" />}
          {!isUser && !m.streaming && m.text.length > 40 && (
            <button onClick={onCopy} aria-label="Copy" className="absolute -bottom-2 -right-2 h-6 w-6 rounded-full bg-[#1a1030] border border-purple-500/25 text-purple-200/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              {copiedId === m.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Escalation card */}
        {m.escalate && !m.streaming && (
          <div className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-1"><MessageCircle className="h-4 w-4" /> Talk to a human</div>
            <p className="text-[11px] text-emerald-200/70 leading-snug">I'll prepare a full summary so you never repeat yourself.</p>
          </div>
        )}

        {/* Rich actions */}
        {!m.streaming && m.actions && m.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.actions.map((a, i) => (
              <button
                key={i} onClick={() => onAction(a)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  a.variant === "primary"
                    ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:brightness-110"
                    : "bg-white/5 border border-purple-500/25 text-purple-100 hover:bg-white/10"
                }`}
              >
                {a.escalate ? <MessageCircle className="h-3.5 w-3.5" /> : a.section ? <ArrowRight className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Suggested quick replies */}
        {!m.streaming && m.suggestions && m.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.suggestions.map((s, i) => (
              <button
                key={i} onClick={() => onSuggest(s)}
                className="rounded-full border border-purple-500/25 bg-purple-500/8 px-3 py-1.5 text-[11px] font-semibold text-purple-100 hover:bg-purple-500/20 hover:border-purple-500/40 active:scale-95 transition-all cursor-pointer"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Satisfaction rating (assistant answers only) */}
        {!isUser && !m.streaming && m.text.length > 40 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {m.rated ? (
              <span className="text-[10px] text-purple-200/40">{m.rated === "up" ? "Thanks for the feedback! 🙌" : "Thanks — I'll keep improving."}</span>
            ) : (
              <>
                <span className="text-[10px] text-purple-200/30">Helpful?</span>
                <button onClick={() => onRate(true)} aria-label="Helpful" className="p-1 rounded-md hover:bg-emerald-500/10 text-purple-200/40 hover:text-emerald-400 cursor-pointer"><ThumbsUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => onRate(false)} aria-label="Not helpful" className="p-1 rounded-md hover:bg-red-500/10 text-purple-200/40 hover:text-red-400 cursor-pointer"><ThumbsDown className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 animate-ai-msg-in">
      <div className="shrink-0 h-7 w-7 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center mt-0.5">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-white/5 border border-purple-500/15 px-4 py-3 flex items-center gap-1">
        <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animationDelay: "0ms" }} />
        <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animationDelay: "150ms" }} />
        <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
