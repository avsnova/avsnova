import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Smartphone, RefreshCw, Copy, CheckCircle2, ArrowRight, Bell, BellOff,
  Search, X, ChevronRight, Loader2, Zap, Clock, Wallet, ShieldCheck, MessageSquare,
  AlertTriangle, Sparkles, Star, Radio, Ban, Timer, Info
} from "lucide-react";
import { Card, Button } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import PoolBuyNumber from "./PoolBuyNumber";
import { copyToClipboard, toLocalNumber } from "../../utils/clipboard";
import { CountryFlag, ServiceLogo } from "../ui/BrandIcon";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";
import { enterFocusMode } from "../../utils/uiFocusStore";
import { matchGuideForService } from "../../help/helpGuides";
import {
  enableSmsAlerts, disableSmsAlerts, areSmsAlertsEnabled,
  detectSmsTransitions, type SmsLineSnapshot
} from "../../utils/smsNotifications";

interface SMSPanelViewProps {
  walletBalance: number;
  onRefreshNumbers?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system") => void;
}

interface ActiveLine {
  id: string;
  number: string;
  country: string;
  flag: string;
  service: string;
  status: "active" | "completed" | "expired" | "cancelled";
  cost: number;
  otpReceived?: string;
  created_at: string;
  // Server-authoritative timing (source of truth for the countdown).
  remaining?: number;        // seconds left, computed server-side
  expires_at?: string;
  provider?: string;
  cancellable?: boolean;     // provider allows cancellation now
  cancel_in?: number;        // seconds until cancellation becomes available
}

interface CatalogItem { id: string; name: string; flag?: string; icon?: string; dial_code?: string; iso?: string; }

// 1. Instant-Load Pre-cached Branded Countries with Flags (Requirement 1!)
// CORRECTNESS FIX: the previous hardcoded country list had WRONG provider IDs (e.g. "France"=6 which is Indonesia on Grizzly, "Germany"=4 which is Philippines), causing wrong-country numbers. We now NEVER ship a hardcoded catalog — the list comes ONLY from the live/verified /api/sms/countries endpoint (backed by the DB synced from the provider API). Empty fallback shows a loading state instead of corrupt data.
const PRE_CACHED_COUNTRIES: CatalogItem[] = [];

// 2. Instant-Load Pre-cached Branded 150 Approved Services with Official Logos (Requirement 2, 3 & 4!)
// CORRECTNESS FIX: hardcoded service catalog removed for the same reason. Services come ONLY from the live /api/sms/services endpoint (verified provider data).
const PRE_CACHED_SERVICES: CatalogItem[] = [];

// Smart Quick Access — the most-requested regions & platforms surfaced first for one-tap selection.
// CORRECTNESS FIX: these quick-access IDs are the AUTHORITATIVE GrizzlySMS country IDs
// (verified against the live getCountries API). The previous values were WRONG
// (France="6" is Indonesia, Germany="4" is Philippines) — the exact cause of the
// "select France, receive Indonesia" bug. Verified: USA=12, UK=16, Canada=36, France=78,
// Germany=43, Nigeria=19, India=22.
const POPULAR_COUNTRIES: CatalogItem[] = [
  { id: "12", name: "USA", flag: "🇺🇸" },
  { id: "16", name: "United Kingdom", flag: "🇬🇧" },
  { id: "36", name: "Canada", flag: "🇨🇦" },
  { id: "78", name: "France", flag: "🇫🇷" },
  { id: "43", name: "Germany", flag: "🇩🇪" },
  { id: "19", name: "Nigeria", flag: "🇳🇬" },
  { id: "22", name: "India", flag: "🇮🇳" },
];
const POPULAR_SERVICES: CatalogItem[] = [
  { id: "fb", name: "Facebook", icon: "🔵" },
  { id: "ig", name: "Instagram + Threads", icon: "📸" },
  { id: "wa", name: "WhatsApp", icon: "🟢" },
  { id: "tg", name: "Telegram", icon: "✈️" },
  { id: "go", name: "Google", icon: "🌐" },
  { id: "ds", name: "Discord", icon: "👾" },
  { id: "tw", name: "Twitter / X", icon: "🐦" },
  { id: "dr", name: "OpenAI", icon: "✨" },
  { id: "ap", name: "Apple", icon: "🍎" },
  { id: "bi", name: "Binance", icon: "🪙" },
  { id: "am_", name: "Amazon", icon: "🛍️" },
  { id: "nf", name: "Netflix", icon: "🍿" },
];

// Progressive, reassuring loading messages while the provider searches for a number.
const SEARCH_STAGES = [
  "🔍 Searching for the best available number…",
  "⏳ Contacting our provider…",
  "🔄 Checking availability…",
  "🌍 Finding the best available number…",
  "📱 Reserving your number…",
  "Almost done…",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Detect provider messages that mean "still working / try again" vs a genuine, permanent stop.
// Anything transient triggers an automatic silent retry before we ever surface an error.
function isRetryable(msg: string) {
  const m = (msg || "").toLowerCase();
  return /gateway|temporar|blocked|unavailable|no number|not available|no available|try again|busy|rate|timeout|timed out|slow|provider|502|503|504|out of stock|rented|all lines/.test(m);
}
// Insufficient-balance style problems should surface immediately — retrying won't help.
function isHardStop(msg: string) {
  const m = (msg || "").toLowerCase();
  return /insufficient|balance|not enough|fund|unauthor|401|403|token|forbidden|login/.test(m);
}
// Turn technical provider text into a friendly, trustworthy explanation.
function friendlyError(msg: string) {
  const m = (msg || "").toLowerCase();
  if (isHardStop(m)) return "Your wallet balance is too low for this number. Please add funds and try again.";
  if (/no number|not available|no available|out of stock|rented|all lines/.test(m)) {
    return "No numbers are available for this country & service right now. Please try another combination or check back shortly.";
  }
  if (/slow|timeout|timed out/.test(m)) return "Our provider is responding slowly. Please wait a moment and try again.";
  return "We couldn't reserve a number just now. Please try again in a few seconds.";
}

type PurchaseStage = "idle" | "searching" | "reserved" | "failed";

export default function SMSPanelView({ walletBalance, onRefreshNumbers, onAddNotification }: SMSPanelViewProps) {
  const { toast } = useToast();
  const [balance, setBalance] = useState(walletBalance);
  // Provider-independent "pools" mode: if an admin has enabled any customer-visible pool, use the
  // new provider-based Buy Number experience. Otherwise fall back to the classic view (fully
  // reversible — disabling all pools restores the old UI). Loading is null → brief neutral state.
  const [poolsMode, setPoolsMode] = useState<null | boolean>(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/sms/pools").then((r) => { if (alive) setPoolsMode(!!(r && r.pools && r.pools.length > 0)); }).catch(() => { if (alive) setPoolsMode(false); });
    return () => { alive = false; };
  }, []);

  // Dynamic Catalog Paginated & Searchable States (Requirement 1, 2, 3!)
  const [countriesList, setCountriesList] = useState<any[]>([]);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>("");
  // Resolved metadata (name/flag/icon) so the selected chips render correctly even
  // if the item isn't in the currently-filtered list.
  const [countryMeta, setCountryMeta] = useState<CatalogItem | null>(null);
  const [serviceMeta, setServiceMeta] = useState<CatalogItem | null>(null);

  const [countrySearch, setCountrySearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [countryPage, setCountryPage] = useState(1);
  const [servicePage, setServicePage] = useState(1);
  const [hasMoreCountries, setHasMoreCountries] = useState(true);
  const [hasMoreServices, setHasMoreServices] = useState(true);

  // Which searchable picker sheet is open (mobile-first, scroll-locked).
  const [picker, setPicker] = useState<null | "country" | "service">(null);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeLines, setActiveLines] = useState<ActiveLine[]>([]);
  // Client timestamp of the last successful /numbers fetch — used to derive an accurate,
  // drift-free countdown from the server's authoritative `remaining` value.
  const [linesFetchedAt, setLinesFetchedAt] = useState<number>(Date.now());
  const [completedLines, setCompletedLines] = useState<ActiveLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Intelligent purchase flow (progress feedback + retries + success transition).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchaseStage, setPurchaseStage] = useState<PurchaseStage>("idle");
  const [stageMsg, setStageMsg] = useState<string>(SEARCH_STAGES[0]);
  const [attemptInfo, setAttemptInfo] = useState<string>("");

  // Real-time SMS alerts (Item 1)
  const [alertsOn, setAlertsOn] = useState(areSmsAlertsEnabled());
  const prevSnapshotRef = useRef<Map<string, SmsLineSnapshot>>(new Map());

  // Permanent operational history (Item 5) — sourced from the dedicated backend ledger.
  const [opHistory, setOpHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;
  const loadHistory = async () => {
    try {
      const res = await apiFetch("/api/sms/history");
      if (res && res.success && Array.isArray(res.history)) setOpHistory(res.history);
    } catch (e) { /* ignore */ }
  };

  const [nowTimestamp, setNowTimestamp] = useState(Date.now());

  // Admin-configurable SMS session/cancel timeouts (FEATURE 4) — fetched live so
  // changes in the Admin Panel apply instantly without code changes.
  const [sessionTimeout, setSessionTimeout] = useState(1200);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [autoCancelTimeout, setAutoCancelTimeout] = useState(1200);
  // Admin-editable activation instructions (one per line; lines starting with "!" are warnings).
  const [smsInstructions, setSmsInstructions] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/settings");
        if (data && data.settings) {
          if (data.settings.sms_session_timeout) setSessionTimeout(parseInt(data.settings.sms_session_timeout));
          if (data.settings.sms_auto_cancel_timeout) setAutoCancelTimeout(parseInt(data.settings.sms_auto_cancel_timeout));
          if (typeof data.settings.sms_instructions === "string") setSmsInstructions(data.settings.sms_instructions);
        }
      } catch (e) { /* keep defaults */ }
    })();
  }, []);

  // Timers interval countdown (Requirement 1 & 4!)
  // Only run the 1s clock when there's actually an active line whose countdown is
  // displayed — otherwise ticking would re-render this large panel every second for
  // no visible reason. Also pauses while the tab is backgrounded.
  useEffect(() => {
    if (activeLines.length === 0) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeLines.length]);

  // Fetch paginated countries list with Priority order (Requirement 3!)
  const fetchCountries = async (searchVal: string, pageNum: number, append = false) => {
    try {
      const data = await apiFetch(`/api/sms/countries?search=${searchVal}&page=${pageNum}&limit=50`);
      if (data && data.success && Array.isArray(data.countries) && data.countries.length > 0) {
        let newList = data.countries;
        if (append) {
          newList = [...countriesList, ...data.countries];
        }

        // Remove duplicates if any
        const seen = new Set();
        const uniqueList = newList.filter((c: any) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        // Priority country sort: USA Server 1, USA Server 2, Canada, United Kingdom first (Requirement 3!)
        const priorityOrder = ["USA Server 1", "USA Server 2", "Canada", "United Kingdom"];
        const sorted = uniqueList.sort((a: any, b: any) => {
          const indexA = priorityOrder.indexOf(a.name);
          const indexB = priorityOrder.indexOf(b.name);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;

          return a.name.localeCompare(b.name);
        });

        setCountriesList(sorted);
        if (sorted.length > 0 && !selectedCountry) {
          pickCountry(sorted[0], false);
        }
        setHasMoreCountries(data.countries.length === 50);
      } else {
        // Fallback if returned list is empty
        setCountriesList(PRE_CACHED_COUNTRIES);
        if (PRE_CACHED_COUNTRIES.length > 0 && !selectedCountry) {
          pickCountry(PRE_CACHED_COUNTRIES[0], false);
        }
      }
    } catch (err) {
      console.error("Failed to load countries list, falling back to pre-cached countries:", err);
      setCountriesList(PRE_CACHED_COUNTRIES);
      if (PRE_CACHED_COUNTRIES.length > 0 && !selectedCountry) {
        pickCountry(PRE_CACHED_COUNTRIES[0], false);
      }
    }
  };

  // Fetch paginated services list with Priority order (Requirement 1 & 2!)
  const fetchServices = async (countryIdVal: string, searchVal: string, pageNum: number, append = false) => {
    if (!countryIdVal) return;
    try {
      const data = await apiFetch(`/api/sms/services?countryId=${countryIdVal}&search=${searchVal}&page=${pageNum}&limit=50`);
      if (data && data.success && Array.isArray(data.services) && data.services.length > 0) {
        let newList = data.services;
        if (append) {
          newList = [...servicesList, ...data.services];
        }

        // Remove duplicates if any
        const seen = new Set();
        const uniqueList = newList.filter((s: any) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });

        // Priority service sort: WhatsApp, Facebook, Instagram, Telegram, Google Voice (Requirement 1, 2, 4!)
        const priorityServices = ["wa", "fb", "ig", "tg", "gv"];
        const sorted = uniqueList.sort((a: any, b: any) => {
          const indexA = priorityServices.indexOf(a.id);
          const indexB = priorityServices.indexOf(b.id);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;

          return a.name.localeCompare(b.name);
        });

        setServicesList(sorted);
        if (sorted.length > 0 && !selectedService) {
          pickService(sorted[0], false);
        }
        setHasMoreServices(data.services.length === 50);
      } else {
        // Fallback if returned list is empty
        setServicesList(PRE_CACHED_SERVICES);
        if (PRE_CACHED_SERVICES.length > 0 && !selectedService) {
          pickService(PRE_CACHED_SERVICES[0], false);
        }
      }
    } catch (err) {
      console.error("Failed to load services list, falling back to pre-cached services:", err);
      setServicesList(PRE_CACHED_SERVICES);
      if (PRE_CACHED_SERVICES.length > 0 && !selectedService) {
        pickService(PRE_CACHED_SERVICES[0], false);
      }
    }
  };

  // Selection helpers keep both the backend-facing id and the display metadata in sync,
  // and close the picker sheet for a smooth one-tap experience.
  const pickCountry = (c: CatalogItem, closeSheet = true) => {
    setSelectedCountry(c.id);
    setCountryMeta({ id: c.id, name: c.name, flag: c.flag, dial_code: c.dial_code, iso: c.iso });
    // Country change invalidates the current service selection's price context.
    if (closeSheet) setPicker(null);
  };
  const pickService = (s: CatalogItem, closeSheet = true) => {
    setSelectedService(s.id);
    setServiceMeta({ id: s.id, name: s.name, icon: s.icon });
    if (closeSheet) setPicker(null);
  };

  // Load numbers and balance on mount
  const loadNumbersAndBalance = async () => {
    setIsLoading(true);
    setErrorState(null);
    try {
      const data = await apiFetch("/api/sms/numbers");
      if (Array.isArray(data)) {
        // Seed the alert baseline WITHOUT firing alerts for pre-existing lines on first load.
        const baseline = new Map<string, SmsLineSnapshot>();
        for (const l of data) baseline.set(String(l.id), { id: String(l.id), status: l.status, otpReceived: l.otpReceived, number: l.number, service: l.service });
        prevSnapshotRef.current = baseline;
        setLinesFetchedAt(Date.now());
        setActiveLines(data.filter((l: any) => l.status === "active"));
        setCompletedLines(data.filter((l: any) => l.status === "completed" || l.status === "completed_archived"));
      }

      const walletData = await apiFetch("/api/wallet/balance");
      if (walletData && walletData.success) {
        setBalance(walletData.balance);
      }
    } catch (err: any) {
      console.error("Failed to load SMS system data:", err);
      if (err.message && (err.message.includes("401") || err.message.includes("403") || err.message.includes("token") || err.message.includes("UNAUTHENTICATED"))) {
        setErrorState("Please log in to your account to check line availability.");
      } else {
        setErrorState("We're reconnecting to the network. Your numbers will appear here in a moment.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setBalance(walletBalance);
    loadNumbersAndBalance();
    loadHistory();
    fetchCountries("", 1);
  }, [walletBalance]);

  // Handle country search change
  useEffect(() => {
    setCountryPage(1);
    fetchCountries(countrySearch, 1);
  }, [countrySearch]);

  // Handle service search change or country selection change
  useEffect(() => {
    setServicePage(1);
    fetchServices(selectedCountry, serviceSearch, 1);
  }, [selectedCountry, serviceSearch]);

  // Fetch live price strictly once selected (Requirement 3!)
  const fetchPrice = async () => {
    if (!selectedCountry || !selectedService) return;
    setIsPriceLoading(true);
    setLivePrice(null);
    setLiveCount(null);
    setErrorState(null);
    try {
      const res = await apiFetch(`/api/sms/price?country=${selectedCountry}&service=${selectedService}`);
      if (res && res.success) {
        // FEATURE 3: use backend-computed final customer price (incl. admin markup),
        // shown BEFORE the user clicks Buy — no hidden reveal at checkout.
        const priceNgn = res.customerPrice != null ? Math.round(res.customerPrice) : Math.round(res.cost * 1623.50 + 1300);
        setLivePrice(priceNgn);
        setLiveCount(res.count);
        setErrorState(null);
      } else {
        throw new Error(res.error || "Out of stock");
      }
    } catch (err: any) {
      console.warn("Failed to retrieve live price:", err);
      setLivePrice(null);
      setLiveCount(0);
      // FEATURE 9: surface real network errors instead of "no number"
      const m = String(err?.message || "");
      if (/NETWORK_ERROR|network|internet|unavailable|failed to fetch|503|502|504/i.test(m)) {
        setErrorState("No internet connection or server unavailable. Please check your connection and try again.");
      }
    } finally {
      setIsPriceLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
  }, [selectedCountry, selectedService]);

  // Dynamic Poller for active lines using primitive length dependency
  const activeLinesLength = activeLines.length;
  useEffect(() => {
    if (activeLinesLength === 0) return;
    const poller = setInterval(() => {
      // Pause polling when the tab is backgrounded to prevent CPU/network churn.
      if (typeof document !== "undefined" && document.hidden) return;
      loadNumbersOnly();
    }, 4000);
    return () => clearInterval(poller);
  }, [activeLinesLength]);

  // Detect transitions for panel-local concerns (history refresh) only.
  const processSnapshotTransitions = (data: any[]) => {
    const snap: SmsLineSnapshot[] = data.map((l: any) => ({
      id: String(l.id), status: l.status, otpReceived: l.otpReceived, number: l.number, service: l.service
    }));
    const { codeReceived } = detectSmsTransitions(prevSnapshotRef.current, snap);
    // Refresh the permanent history ledger whenever a code lands, and celebrate it.
    if (codeReceived.length > 0) {
      loadHistory();
      const first = codeReceived[0] as any;
      toast(`SMS received for +${first?.number || "your number"}. Tap to copy the code.`, "success", { big: true });
    }
    const nextMap = new Map<string, SmsLineSnapshot>();
    for (const s of snap) nextMap.set(s.id, s);
    prevSnapshotRef.current = nextMap;
  };

  const loadNumbersOnly = async () => {
    try {
      const data = await apiFetch("/api/sms/numbers");
      if (Array.isArray(data)) {
        processSnapshotTransitions(data);
        setLinesFetchedAt(Date.now());
        setActiveLines(data.filter((l: any) => l.status === "active" || l.status === "completed"));
        setCompletedLines(data.filter((l: any) => l.status === "completed_archived"));
      }
    } catch (err) {
      console.error("SMS Status Background Poller Error:", err);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedText(text);
      // Automatic success notification after copying (unified toast).
      toast(`${label} copied to clipboard`, "success");
      setTimeout(() => setCopiedText(null), 1500);
    } else {
      toast(`Could not copy ${label}. Copy manually: ${text}`, "error");
    }
  };

  // Step 1: validate and open the confirmation card so users always see exactly what
  // they're buying (country, service, price, balance) before any money is reserved.
  // One-click reorder from Operation History (#5): re-select the original country & service,
  // scroll to the top purchase area, and let the normal price/confirmation flow take over.
  const handlePurchaseAgain = (h: any) => {
    const cc = h.country_code, sc = h.service_code;
    if (!cc || !sc) { toast("This record predates one-click reorder. Please select manually.", "warning"); return; }
    pickCountry({ id: cc, name: h.country, flag: h.flag }, false);
    pickService({ id: sc, name: h.service }, false);
    setPicker(null);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
    toast(`Re-selected ${h.service} · ${h.country}. Confirm to buy again.`, "info");
  };

  const handleBuyNumber = () => {
    if (!selectedCountry || !selectedService || livePrice === null) {
      toast("Select both a country and a service to continue.", "warning");
      return;
    }
    if (balance < livePrice) {
      toast(`Insufficient balance — needs ₦${livePrice.toLocaleString()}, you have ₦${balance.toLocaleString()}.`, "error", { action: { label: "Add money", onClick: () => { window.location.hash = "Wallet"; } } });
      return;
    }
    setConfirmOpen(true);
  };

  // Step 2: actually allocate (called from the confirmation card).
  const executePurchase = async () => {
    setConfirmOpen(false);
    if (!selectedCountry || !selectedService || livePrice === null) return;
    setIsOrdering(true);
    setErrorState(null);
    setPurchaseStage("searching");
    setStageMsg(SEARCH_STAGES[0]);
    setAttemptInfo("");

    // Cycle reassuring progress messages while we work.
    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, SEARCH_STAGES.length - 1);
      setStageMsg(SEARCH_STAGES[msgIdx]);
    }, 1800);

    const maxAttempts = 4;
    let attempt = 0;
    let lastErr = "";

    try {
      while (attempt < maxAttempts) {
        attempt++;
        if (attempt > 1) setAttemptInfo(`Retrying — attempt ${attempt} of ${maxAttempts}…`);
        try {
          const res = await apiFetch("/api/sms/allocate", {
            method: "POST",
            body: JSON.stringify({ country: selectedCountry, service: selectedService }),
          });

          if (res && res.success) {
            clearInterval(msgTimer);
            setPurchaseStage("reserved");
            setStageMsg(`Number +${res.number} reserved!`);
            setAttemptInfo("");
            toast(`Number +${res.number} reserved. Waiting for SMS…`, "success", { big: true });
            await loadNumbersAndBalance();
            if (onRefreshNumbers) onRefreshNumbers();
            // Smooth transition: hold the success state briefly, then return to idle.
            await sleep(2000);
            setPurchaseStage("idle");
            setIsOrdering(false);
            return;
          }
          lastErr = res?.error || "";
          if (isHardStop(lastErr) || !isRetryable(lastErr)) break;
        } catch (err: any) {
          lastErr = err?.message || "";
          // A network failure may have happened AFTER the server already allocated a number.
          // Reconcile before retrying so we never double-purchase: if a new active line now
          // exists, treat this as success instead of firing another allocation.
          try {
            const check = await apiFetch("/api/sms/numbers");
            if (Array.isArray(check)) {
              const known = new Set(prevSnapshotRef.current.keys());
              const fresh = check.find((l: any) => l.status === "active" && !known.has(String(l.id)));
              if (fresh) {
                clearInterval(msgTimer);
                setPurchaseStage("reserved");
                setStageMsg(`Number +${fresh.number} reserved!`);
                toast(`Number +${fresh.number} reserved. Waiting for SMS…`, "success", { big: true });
                await loadNumbersAndBalance();
                if (onRefreshNumbers) onRefreshNumbers();
                await sleep(2000);
                setPurchaseStage("idle");
                setIsOrdering(false);
                return;
              }
            }
          } catch { /* reconcile failed; fall through to normal retry logic */ }
          if (isHardStop(lastErr) || !isRetryable(lastErr)) break;
        }
        // Retryable: pause before the next silent attempt.
        if (attempt < maxAttempts) await sleep(2200);
      }

      // Every attempt has genuinely failed — now (and only now) show a friendly message.
      clearInterval(msgTimer);
      setPurchaseStage("idle");
      setIsOrdering(false);
      setAttemptInfo("");
      const friendly = friendlyError(lastErr);
      toast(friendly, isHardStop(lastErr) ? "error" : "warning",
        isHardStop(lastErr) ? { action: { label: "Add money", onClick: () => { window.location.hash = "Wallet"; } } } : undefined);
    } finally {
      clearInterval(msgTimer);
    }
  };

  // Complete and archive line locally so it stays visible in terminal until clicked (Requirement 4!)
  const handleDismissLine = async (id: string) => {
    try {
      const res = await apiFetch(`/api/sms/action/${id}`, {
        method: "POST",
        body: JSON.stringify({ action: 6 }) // action 6 is finish/dismiss
      });

      if (res && res.success) {
        await loadNumbersAndBalance();
      }
    } catch (err) {
      console.error("Failed to dismiss session:", err);
    }
  };

  // Provider-confirmed cancellation. Only shown when the backend reports `cancellable`
  // (i.e. the provider will actually honor it). Local UI updates ONLY after the provider
  // confirms via the backend — if it rejects, the session stays active.
  const handleCancelLine = async (id: string) => {
    try {
      const res = await apiFetch(`/api/sms/action/${id}`, { method: "POST", body: JSON.stringify({ action: 8 }) });
      if (res && res.success) {
        toast("Number cancelled — funds refunded to your wallet.", "success");
        await loadNumbersAndBalance();
        if (onRefreshNumbers) onRefreshNumbers();
      } else {
        throw new Error(res?.error || "Provider did not confirm the cancellation.");
      }
    } catch (err: any) {
      // Provider rejected (e.g. an SMS just arrived) → keep the session active, inform the user.
      toast(err.message || "Cancellation not available right now — the number is still active.", "error");
      await loadNumbersAndBalance();
    }
  };

  const toggleSound = async () => {
    if (!alertsOn) {
      const okEnabled = await enableSmsAlerts();
      setAlertsOn(okEnabled);
      if (okEnabled) {
        toast("Sound alerts on — you'll be notified for new numbers and codes.", "success");
        if (onAddNotification) onAddNotification("Notification Sound On", "You'll get a sound + notification for new numbers, codes and verification messages.", "system");
      }
    } else {
      disableSmsAlerts();
      setAlertsOn(false);
      toast("Sound alerts muted.", "info");
    }
  };

  const canBuy = !isOrdering && livePrice !== null && liveCount !== 0 && purchaseStage === "idle";
  const awaitingCount = activeLines.filter(l => l.status === "active").length;

  // Operation History: client-side search + pagination over the permanent ledger.
  const filteredHistory = (() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return opHistory;
    return opHistory.filter((h) =>
      [h.number, h.service, h.country, h.code, h.number_id, h.id].some((v) => String(v || "").toLowerCase().includes(q))
    );
  })();
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const pagedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  // Provider-independent pools mode → render the new Buy Number experience.
  if (poolsMode === true) {
    return <PoolBuyNumber walletBalance={balance} onAddNotification={onAddNotification} />;
  }

  return (
    <div className="space-y-6 font-inter relative text-left pb-4">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
            <Smartphone className="h-4 w-4 animate-pulse" />
            <span>AVS Virtual Line Activations</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">Rent Secure Numbers</h2>
          <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl">
            Pick a country, choose a service, and receive verification codes instantly. Fast, automated, and mobile-first.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={toggleSound}
            title={alertsOn ? "Notification sound ON — click to mute" : "Notification sound OFF — click to enable"}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer font-space active:scale-95 ${
              alertsOn
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-black/30 border-purple-500/20 text-purple-200/60 hover:text-white"
            }`}
          >
            {alertsOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{alertsOn ? "Sound On" : "Sound Off"}</span>
          </button>
          <Button onClick={loadNumbersAndBalance} size="md" className="flex items-center gap-1.5 cursor-pointer active:scale-95">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Balance" value={`₦${balance.toLocaleString()}`} tone="white" />
        <StatCard icon={<Radio className="h-4 w-4" />} label="Awaiting SMS" value={`${awaitingCount}`} tone="cyan" />
        <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Completed" value={`${completedLines.length}`} tone="emerald" />
      </div>

      {/* Admin-configurable activation instructions */}
      <SmsInstructions text={smsInstructions} serviceName={serviceMeta?.name} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* PURCHASE CARD */}
        <div className="lg:col-span-7 xl:col-span-8">
          <Card className="p-5 sm:p-6 bg-gradient-to-br from-[#0d0725] to-[#06030d] border border-purple-500/15 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold font-space text-white">New Activation</h3>
              <span className="text-[10px] font-bold text-purple-200/40 uppercase tracking-wider">Step-by-step</span>
            </div>

            {/* STEP 1 — Country */}
            <StepSelector
              step={1}
              label="Choose Country"
              placeholder="Select a country"
              selectedIcon={countryMeta ? <CountryFlag emoji={countryMeta.flag} country={countryMeta.name} size={26} /> : null}
              selectedName={countryMeta ? `${countryMeta.name}${countryMeta.dial_code ? ` (${countryMeta.dial_code})` : ""}` : undefined}
              onOpen={() => setPicker("country")}
            />

            {/* Popular countries — one-tap quick access */}
            <QuickAccessRow
              title="Popular countries"
              items={POPULAR_COUNTRIES}
              selectedId={selectedCountry}
              onPick={(it) => pickCountry(it)}
              renderIcon={(it) => <CountryFlag emoji={it.flag} country={it.name} size={20} />}
            />

            {/* STEP 2 — Service */}
            <StepSelector
              step={2}
              label="Choose Service"
              placeholder="Select a service"
              selectedIcon={serviceMeta ? <ServiceLogo name={serviceMeta.name} fallback={serviceMeta.icon} size={24} /> : null}
              selectedName={serviceMeta?.name}
              onOpen={() => setPicker("service")}
            />

            {/* Popular services — one-tap quick access */}
            <QuickAccessRow
              title="Popular services"
              items={POPULAR_SERVICES}
              selectedId={selectedService}
              onPick={(it) => pickService(it)}
              renderIcon={(it) => <ServiceLogo name={it.name} fallback={it.icon} size={18} />}
            />

            {/* STEP 3 — Price & Availability */}
            <div className="rounded-2xl bg-purple-950/25 border border-purple-500/15 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">
                  <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-200 flex items-center justify-center text-[10px]">3</span>
                  Price &amp; Availability
                </div>
                {isPriceLoading ? (
                  <span className="text-cyan-400 text-xs font-bold flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</span>
                ) : livePrice !== null && liveCount !== null && liveCount > 0 ? (
                  <div className="text-right">
                    <div className="text-emerald-400 font-bold font-space text-lg leading-none">₦{livePrice.toLocaleString()}</div>
                    <div className="text-[10px] text-emerald-300/70 font-semibold mt-0.5">{liveCount.toLocaleString()} available</div>
                  </div>
                ) : (
                  <span className="text-amber-400 text-xs font-bold">Out of stock — try another</span>
                )}
              </div>
            </div>

            {/* Live network error (only shown when it's a real connectivity failure) */}
            {errorState && (
              <div className="flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-3.5 py-2.5 text-xs text-cyan-300">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorState}</span>
              </div>
            )}

            {/* Intelligent search / progress state OR the Buy button */}
            {purchaseStage === "searching" ? (
              <SearchingPanel message={stageMsg} attemptInfo={attemptInfo} />
            ) : purchaseStage === "reserved" ? (
              <ReservedPanel message={stageMsg} />
            ) : (
              <button
                onClick={handleBuyNumber}
                disabled={!canBuy}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-2xl font-bold font-space text-sm text-white hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
              >
                <Zap className="h-4.5 w-4.5" />
                <span>{livePrice !== null && liveCount !== 0 ? `Buy Number · ₦${livePrice.toLocaleString()}` : "Select country & service"}</span>
                {livePrice !== null && liveCount !== 0 && <ArrowRight className="h-4.5 w-4.5" />}
              </button>
            )}
          </Card>
        </div>

        {/* ACTIVE ACTIVATIONS (AWAITING SMS SECTION) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold font-space text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-cyan-400" /> Your Numbers
            </h3>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </div>

          {activeLines.length === 0 ? (
            <Card className="p-6 bg-gradient-to-br from-[#0c0522] to-[#05020a] border border-purple-500/15 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
              <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                <Smartphone className="h-7 w-7 text-cyan-400/50" />
              </div>
              <p className="text-sm font-bold text-white">No active numbers yet</p>
              <p className="text-xs text-purple-200/50 max-w-[220px]">Rent a dedicated line above to start receiving verification codes here.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeLines.map(line => (
                <NumberCard
                  key={line.id}
                  line={line}
                  now={nowTimestamp}
                  fetchedAt={linesFetchedAt}
                  sessionTimeout={sessionTimeout}
                  copiedText={copiedText}
                  onCopy={handleCopy}
                  onCancel={handleCancelLine}
                  onDismiss={handleDismissLine}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SMS TRANSACTION & RETRIEVED HISTORY LEDGER */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-[#0c0522] to-[#05020a] border border-purple-500/15">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-purple-500/10 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold font-space text-white">Operations History</h3>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">Permanent Records</span>
          </div>
          {opHistory.length > 0 && (
            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-300/50" />
              <input
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                placeholder="Search number, service, code…"
                aria-label="Search operation history"
                className="w-full bg-black/40 border border-purple-500/20 text-xs text-white pl-8 pr-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
              />
            </div>
          )}
        </div>

        {opHistory.length === 0 ? (
          <div className="text-center py-8 text-purple-200/40 text-xs">
            No completed activations yet. Your captured codes will be permanently logged here.
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-purple-200/40 text-xs">
            No records match "{historySearch}". Try a different search.
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-2.5 sm:hidden">
              {pagedHistory.map(line => (
                <div key={line.id} className="rounded-xl bg-black/40 border border-purple-500/10 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                      <ServiceLogo name={line.service} fallback="📱" size={16} /> {line.service}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-purple-200/60">
                      <CountryFlag emoji={line.flag} country={line.country} size={16} /> {line.country}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={() => handleCopy(line.number, "Phone number")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-200/80 cursor-pointer">
                      <span className="select-all">{line.number}</span>
                      {copiedText === line.number ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-purple-300/60" />}
                    </button>
                    <span className="text-[11px] text-cyan-400 font-semibold">₦{Number(line.cost || 0).toLocaleString()}</span>
                  </div>
                  {line.code && (
                    <button onClick={() => handleCopy(line.code, "OTP Code")} className="w-full flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 cursor-pointer">
                      <span className="text-[10px] font-bold text-emerald-300/70 uppercase tracking-wider">Code</span>
                      <span className="inline-flex items-center gap-1.5 font-black text-emerald-400 tracking-widest font-space text-sm">
                        {line.code}
                        {copiedText === line.code ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  )}
                  {line.service_code && line.country_code && (
                    <button onClick={() => handlePurchaseAgain(line)} className="w-full mt-1 py-2 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] font-bold text-purple-200 hover:bg-purple-500/20 active:scale-[0.98] transition cursor-pointer inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50">
                      <RefreshCw className="h-3 w-3" /> Purchase Again
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-purple-200/80">
                <thead>
                  <tr className="border-b border-purple-500/10 text-purple-200/40 font-bold uppercase tracking-wider text-[9px]">
                    <th className="pb-3">Session</th>
                    <th className="pb-3">Service</th>
                    <th className="pb-3">Number</th>
                    <th className="pb-3">Country</th>
                    <th className="pb-3">Price</th>
                    <th className="pb-3 text-right">Captured OTP</th>
                    <th className="pb-3 text-right">Reorder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/5">
                  {pagedHistory.map(line => (
                    <tr key={line.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 font-bold text-purple-300">{line.number_id || line.id}</td>
                      <td className="py-3"><span className="inline-flex items-center gap-1.5"><ServiceLogo name={line.service} fallback="📱" size={14} /> {line.service}</span></td>
                      <td className="py-3 font-semibold text-white">
                        <div className="flex items-center gap-1.5">
                          <span className="select-all">{line.number}</span>
                          <button onClick={() => handleCopy(line.number, "Phone number")} className="p-1 rounded hover:bg-white/5 text-purple-300 transition-colors cursor-pointer" title="Copy Phone Number">
                            {copiedText === line.number ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3"><span className="inline-flex items-center gap-1.5"><CountryFlag emoji={line.flag} country={line.country} size={16} /> {line.country}</span></td>
                      <td className="py-3 text-cyan-400 font-semibold">₦{Number(line.cost || 0).toLocaleString()}</td>
                      <td className="py-3 text-right font-black text-emerald-400 text-sm">
                        <div className="flex items-center justify-end gap-1.5 font-space">
                          <span className="select-all tracking-wider">{line.code || "Completed"}</span>
                          {line.code && (
                            <button onClick={() => handleCopy(line.code, "OTP Code")} className="p-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 transition-colors cursor-pointer" title="Copy OTP Code">
                              {copiedText === line.code ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        {line.service_code && line.country_code ? (
                          <button onClick={() => handlePurchaseAgain(line)} className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[10px] font-bold text-purple-200 hover:bg-purple-500/20 transition cursor-pointer inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50" title="Purchase this service & country again">
                            <RefreshCw className="h-3 w-3" /> Again
                          </button>
                        ) : <span className="text-purple-300/20">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-[11px] text-purple-300/60">
                <span>{filteredHistory.length} record{filteredHistory.length === 1 ? "" : "s"}</span>
                <div className="flex items-center gap-2">
                  <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} aria-label="Previous page" className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 hover:bg-white/5 cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"><ChevronRight className="h-3.5 w-3.5 rotate-180" /></button>
                  <span className="font-space">Page {historyPage} / {historyTotalPages}</span>
                  <button disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))} aria-label="Next page" className="p-1.5 rounded-lg border border-purple-500/20 disabled:opacity-30 hover:bg-white/5 cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* SEARCHABLE PICKER SHEET (country / service) */}
      {picker && (
        <PickerSheet
          kind={picker}
          onClose={() => setPicker(null)}
          search={picker === "country" ? countrySearch : serviceSearch}
          setSearch={picker === "country" ? setCountrySearch : setServiceSearch}
          list={picker === "country" ? countriesList : servicesList}
          popular={picker === "country" ? POPULAR_COUNTRIES : POPULAR_SERVICES}
          selectedId={picker === "country" ? selectedCountry : selectedService}
          onPick={(it) => (picker === "country" ? pickCountry(it) : pickService(it))}
          hasMore={picker === "country" ? hasMoreCountries : hasMoreServices}
          onLoadMore={() => {
            if (picker === "country") {
              const next = countryPage + 1; setCountryPage(next); fetchCountries(countrySearch, next, true);
            } else {
              const next = servicePage + 1; setServicePage(next); fetchServices(selectedCountry, serviceSearch, next, true);
            }
          }}
        />
      )}

      {/* PURCHASE CONFIRMATION CARD — prevents accidental purchases (#4) */}
      {confirmOpen && (
        <PurchaseConfirmCard
          country={countryMeta}
          service={serviceMeta}
          price={livePrice}
          balance={balance}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={executePurchase}
        />
      )}
    </div>
  );
}

/* ————————————————————————————— Sub-components ————————————————————————————— */

// Modern confirmation summary shown before any purchase. Accessible (dialog role,
// focus-visible, Escape to close) and mobile-friendly (bottom sheet on small screens).
function PurchaseConfirmCard({ country, service, price, balance, onCancel, onConfirm }: {
  country: CatalogItem | null; service: CatalogItem | null; price: number | null; balance: number;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    const exitFocus = enterFocusMode(); // keep the AI launcher out of the way during checkout
    return () => { window.removeEventListener("keydown", onKey); exitFocus(); };
  }, [onCancel]);
  const after = price !== null ? balance - price : balance;
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-purple-500/10 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-purple-300/50 font-space">{label}</span>
      <span className="text-sm font-bold text-white">{children}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[195] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm purchase">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#0e0922] border border-purple-500/30 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl z-10 animate-[slideUp_0.25s_ease] sm:animate-none">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-10 w-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center"><Zap className="h-5 w-5 text-cyan-400" /></span>
          <div>
            <h3 className="text-base font-bold font-space text-white">Confirm your purchase</h3>
            <p className="text-[11px] text-purple-300/50">Review the details before paying</p>
          </div>
        </div>
        <div className="rounded-2xl bg-black/30 border border-purple-500/10 px-4 py-1 mb-4">
          <Row label="Country"><span className="inline-flex items-center gap-1.5"><CountryFlag emoji={country?.flag} country={country?.name || ""} size={18} /> {country?.name}{country?.dial_code ? ` (${country.dial_code})` : ""}</span></Row>
          <Row label="Service"><span className="inline-flex items-center gap-1.5"><ServiceLogo name={service?.name || ""} fallback={service?.icon} size={18} /> {service?.name}</span></Row>
          <Row label="Number price"><span className="text-emerald-400">₦{(price ?? 0).toLocaleString()}</span></Row>
          <Row label="Wallet balance">₦{balance.toLocaleString()}</Row>
          <Row label="Balance after"><span className={after < 0 ? "text-red-400" : "text-purple-100"}>₦{after.toLocaleString()}</span></Row>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2 mb-4">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Once a number receives an SMS, the purchase cannot be undone.</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/5 border border-purple-500/20 text-sm font-bold text-white hover:bg-white/10 active:scale-[0.98] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-sm font-bold text-white hover:brightness-110 active:scale-[0.98] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">Purchase Number</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "white" | "cyan" | "emerald" }) {
  const color = tone === "cyan" ? "text-cyan-400" : tone === "emerald" ? "text-emerald-400" : "text-white";
  return (
    <Card className="p-3.5 bg-gradient-to-br from-[#0f0a28] to-[#04020a] border border-purple-500/10">
      <div className={`flex items-center gap-1.5 ${color} opacity-70`}>{icon}</div>
      <div className="text-[9px] font-bold text-purple-200/40 uppercase tracking-widest font-space mt-2 truncate">{label}</div>
      <div className={`text-base sm:text-lg font-bold font-space mt-0.5 ${color} truncate`}>{value}</div>
    </Card>
  );
}

function StepSelector({ step, label, placeholder, selectedIcon, selectedName, onOpen }: {
  step: number; label: string; placeholder: string; selectedIcon: ReactNode; selectedName?: string; onOpen: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-bold text-purple-200/60 uppercase tracking-wider font-space">
        <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-200 flex items-center justify-center text-[10px]">{step}</span>
        {label}
      </div>
      <button
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-black/40 border border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer active:scale-[0.99] text-left"
      >
        <span className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white/5">
          {selectedIcon || <Search className="h-4 w-4 text-purple-300/40" />}
        </span>
        <span className={`flex-1 truncate text-sm font-bold ${selectedName ? "text-white" : "text-purple-200/40"}`}>
          {selectedName || placeholder}
        </span>
        <ChevronRight className="h-4.5 w-4.5 text-purple-300/40 shrink-0" />
      </button>
    </div>
  );
}

function QuickAccessRow({ title, items, selectedId, onPick, renderIcon }: {
  title: string; items: CatalogItem[]; selectedId: string; onPick: (it: CatalogItem) => void; renderIcon: (it: CatalogItem) => ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300/80 uppercase tracking-wider font-space">
        <Star className="h-3 w-3 fill-amber-300/40" /> {title}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar-thin">
        {items.map(it => {
          const active = selectedId === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                active ? "bg-purple-500/25 border-purple-500 text-white shadow-md shadow-purple-500/10" : "bg-black/30 border-purple-500/10 text-purple-200/70 hover:text-white hover:border-purple-500/30"
              }`}
            >
              <span className="h-4 w-4 flex items-center justify-center">{renderIcon(it)}</span>
              <span className="whitespace-nowrap">{it.name}</span>
              {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchingPanel({ message, attemptInfo }: { message: string; attemptInfo: string }) {
  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/30 to-purple-950/20 p-5 text-center animate-fade-up">
      <div className="mx-auto h-14 w-14 rounded-full bg-cyan-500/10 flex items-center justify-center mb-3 relative">
        <span className="absolute inset-0 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
        <Smartphone className="h-6 w-6 text-cyan-300" />
      </div>
      <p className="text-sm font-bold text-white font-space transition-all">{message}</p>
      <p className="text-[11px] text-cyan-300/70 mt-1.5">{attemptInfo || "This usually takes just a few seconds. Hang tight — we're on it."}</p>
      <div className="mt-4 h-1 w-full rounded-full bg-black/40 overflow-hidden">
        <span className="block h-full bg-gradient-to-r from-cyan-400 to-purple-500 animate-toast-progress" style={{ animationDuration: "12000ms" }} />
      </div>
    </div>
  );
}

function ReservedPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 p-5 text-center animate-fade-up">
      <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3 animate-check-pop">
        <CheckCircle2 className="h-7 w-7 text-emerald-400" />
      </div>
      <p className="text-sm font-bold text-emerald-50 font-space">{message}</p>
      <p className="text-[11px] text-emerald-300/70 mt-1.5">Number reserved successfully — now waiting for your SMS.</p>
    </div>
  );
}

// Premium status badge with its own color, icon and behavior.
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: ReactNode; pulse?: boolean }> = {
    active: { label: "Waiting for SMS", cls: "bg-amber-500/15 border-amber-500/30 text-amber-300", icon: <Timer className="h-3 w-3" />, pulse: true },
    completed: { label: "SMS Received", cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
    expired: { label: "Expired", cls: "bg-gray-500/15 border-gray-500/30 text-gray-300", icon: <Clock className="h-3 w-3" /> },
    cancelled: { label: "Cancelled", cls: "bg-red-500/15 border-red-500/30 text-red-300", icon: <Ban className="h-3 w-3" /> },
  };
  const m = map[status] || map.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${m.cls}`}>
      <span className={m.pulse ? "animate-pulse" : ""}>{m.icon}</span>
      {m.label}
    </span>
  );
}

// Admin-configurable activation instructions. Parses one instruction per line;
// lines beginning with "!" are rendered as warnings. Collapsible to save space.
function SmsInstructions({ text, serviceName }: { text: string; serviceName?: string }) {
  const [open, setOpen] = useState(true);
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  // Service-specific guidance auto-matched from the shared Help Center guides (#10).
  const guide = serviceName ? matchGuideForService(serviceName) : undefined;
  const serviceTips = guide ? [...(guide.bestPractices || []), ...(guide.notes || [])].slice(0, 4) : [];
  if (lines.length === 0 && serviceTips.length === 0) return null;
  return (
    <Card className="p-4 sm:p-5 bg-gradient-to-br from-[#0d0725] to-[#06030d] border border-cyan-500/15">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded-lg"
      >
        <span className="flex items-center gap-2 text-sm font-bold font-space text-white">
          <Info className="h-4 w-4 text-cyan-400" />
          {guide ? `How to use ${guide.title} verification` : "Before you activate"}
        </span>
        <ChevronRight className={`h-4 w-4 text-purple-300/50 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {/* Service-specific tips (auto-selected by the chosen service) */}
          {serviceTips.length > 0 && (
            <ul className="space-y-1.5">
              {serviceTips.map((t, i) => (
                <li key={"svc" + i} className="flex items-start gap-2 text-[12px] leading-relaxed text-purple-200/70">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cyan-400/60" />
                  <span>{t}</span>
                </li>
              ))}
              {guide && (
                <li>
                  <a href={`#help/${guide.slug}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 mt-1">
                    Read the full {guide.title} guide <ArrowRight className="h-3 w-3" />
                  </a>
                </li>
              )}
            </ul>
          )}
          {/* Global admin-configured instructions */}
          {lines.length > 0 && (
            <ul className={`space-y-1.5 ${serviceTips.length > 0 ? "border-t border-purple-500/10 pt-3" : ""}`}>
              {lines.map((l, i) => {
                const warn = l.startsWith("!");
                const content = warn ? l.slice(1).trim() : l;
                return (
                  <li key={i} className={`flex items-start gap-2 text-[12px] leading-relaxed ${warn ? "text-amber-300" : "text-purple-200/70"}`}>
                    {warn ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cyan-400/60" />}
                    <span>{content}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function NumberCard({ line, now, fetchedAt, sessionTimeout, copiedText, onCopy, onCancel, onDismiss }: {
  line: ActiveLine; now: number; fetchedAt: number; sessionTimeout: number; copiedText: string | null;
  onCopy: (t: string, label: string) => void; onCancel: (id: string) => void; onDismiss: (id: string) => void;
}) {
  // Server-authoritative countdown: start from the server's `remaining` (captured at the
  // last poll) and subtract only the local seconds elapsed since then. Falls back to a
  // created_at computation for older payloads. Never negative, never drifts across refreshes.
  const secsSinceFetch = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  const sessionTimeLeft = typeof line.remaining === "number"
    ? Math.max(0, line.remaining - secsSinceFetch)
    : Math.max(0, sessionTimeout - Math.floor((now - new Date(line.created_at).getTime()) / 1000));
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const hasCode = line.status === "completed" && line.otpReceived;

  return (
    <Card className="p-4 bg-gradient-to-br from-[#0c0522] to-[#05020a] border border-purple-500/15 space-y-3">
      {/* Top: identity + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center relative">
            <ServiceLogo name={line.service} fallback="📱" size={20} />
            <span className="absolute -bottom-1 -right-1"><CountryFlag emoji={line.flag} country={line.country} size={14} /></span>
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{line.service}</div>
            <div className="text-[10px] text-purple-200/50 truncate">{line.country}</div>
          </div>
        </div>
        <StatusBadge status={line.status} />
      </div>

      {/* Number row with the full number + two copy options (full / local) */}
      <div className="rounded-xl bg-black/40 border border-purple-500/10 overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <span className="text-sm font-bold text-white select-all tracking-wide">{line.number}</span>
        </div>
        <div className="grid grid-cols-2 border-t border-purple-500/10">
          <button
            onClick={() => onCopy(line.number, "Full number")}
            aria-label="Copy full number"
            className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-purple-300/70 uppercase hover:bg-white/5 border-r border-purple-500/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
          >
            {copiedText === line.number ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Full</>}
          </button>
          <button
            onClick={() => onCopy(toLocalNumber(line.number), "Local number")}
            aria-label="Copy local number without country code"
            className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-purple-300/70 uppercase hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
          >
            {copiedText === toLocalNumber(line.number) ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Local</>}
          </button>
        </div>
      </div>

      {/* OTP / waiting */}
      {hasCode ? (
        <button
          onClick={() => onCopy(line.otpReceived!, "OTP Code")}
          className="w-full flex items-center justify-between rounded-xl bg-emerald-500/12 border border-emerald-500/30 px-3.5 py-3 cursor-pointer hover:brightness-110 transition-all active:scale-[0.99] animate-fade-up"
        >
          <span className="text-[10px] font-bold text-emerald-300/70 uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Your code</span>
          <span className="inline-flex items-center gap-2 font-black text-emerald-400 font-space text-lg tracking-[0.25em]">
            {line.otpReceived}
            {copiedText === line.otpReceived ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </span>
        </button>
      ) : (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 px-3.5 py-2.5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
          <span className="text-[11px] text-amber-200/80 font-semibold">Listening for your verification code…</span>
        </div>
      )}

      {/* Footer: timers + actions */}
      <div className="flex items-center justify-between text-[10px] font-mono text-purple-200/50 pt-0.5">
        {line.status === "active" ? (
          <span className={`flex items-center gap-1 font-semibold ${sessionTimeLeft <= 0 ? "text-red-400" : sessionTimeLeft <= 60 ? "text-red-400 animate-pulse" : sessionTimeLeft <= 180 ? "text-amber-400" : "text-purple-200/50"}`}>
            <Clock className="h-3 w-3" />
            {sessionTimeLeft > 0 ? `${fmt(sessionTimeLeft)} Remaining` : "Expired"}
          </span>
        ) : (
          <span className="text-emerald-400/70 font-semibold">Completed</span>
        )}

        {line.status === "active" && (
          line.cancellable ? (
            // Provider now allows cancellation → offer it (backend confirms with provider).
            <button onClick={() => onCancel(line.id)} className="inline-flex items-center gap-1 text-red-400/80 hover:text-red-400 font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 rounded" aria-label="Cancel number">
              <Ban className="h-3 w-3" /> Cancel Number
            </button>
          ) : (
            <span className="text-purple-200/40 inline-flex items-center gap-1" title="Cancellation becomes available if supported by the provider.">
              <Loader2 className="h-3 w-3 animate-spin" /> Waiting for SMS…
            </span>
          )
        )}
        {line.status === "completed" && (
          <button onClick={() => onDismiss(line.id)} className="inline-flex items-center gap-1 text-emerald-400/80 hover:text-emerald-400 font-bold cursor-pointer">
            Done <CheckCircle2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </Card>
  );
}

// Mobile-first searchable picker as a bottom-sheet (desktop: centered modal).
function PickerSheet({ kind, onClose, search, setSearch, list, popular, selectedId, onPick, hasMore, onLoadMore }: {
  kind: "country" | "service";
  onClose: () => void;
  search: string;
  setSearch: (v: string) => void;
  list: any[];
  popular: CatalogItem[];
  selectedId: string;
  onPick: (it: CatalogItem) => void;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  useBodyScrollLock(true);
  const isCountry = kind === "country";
  const title = isCountry ? "Select a country" : "Select a service";
  const placeholder = isCountry ? "Search countries…" : "Search services…";

  return (
    <div className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#0c0620] shadow-2xl animate-sheet-up overflow-hidden">
        {/* Grab handle (mobile) */}
        <div className="sm:hidden pt-2.5 flex justify-center"><span className="h-1 w-10 rounded-full bg-white/20" /></div>

        {/* Header + search */}
        <div className="p-4 pb-3 border-b border-purple-500/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold font-space text-white">{title}</h3>
            <button onClick={onClose} className="text-purple-200/40 hover:text-white cursor-pointer p-1" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300/40" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-10 pr-9 py-3 bg-black/50 border border-purple-500/20 rounded-xl text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 font-semibold"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300/40 hover:text-white cursor-pointer" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar-thin">
          {!search && (
            <>
              <div className="px-1 py-1 text-[10px] font-bold text-amber-300/80 uppercase tracking-wider flex items-center gap-1.5"><Star className="h-3 w-3 fill-amber-300/40" /> Popular</div>
              {popular.map(it => (
                <PickerRow key={`pop-${it.id}`} item={it} isCountry={isCountry} active={selectedId === it.id} onPick={onPick} />
              ))}
              <div className="px-1 pt-3 pb-1 text-[10px] font-bold text-purple-200/40 uppercase tracking-wider">All {isCountry ? "countries" : "services"}</div>
            </>
          )}
          {list.length === 0 ? (
            <div className="text-center py-10 text-xs text-purple-200/40">No matches for “{search}”.</div>
          ) : (
            list.map((it: any) => (
              <PickerRow key={it.id} item={it} isCountry={isCountry} active={selectedId === it.id} onPick={onPick} />
            ))
          )}
          {hasMore && !search && (
            <button onClick={onLoadMore} className="w-full mt-2 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-200 hover:text-white cursor-pointer">
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PickerRow({ item, isCountry, active, onPick }: { item: any; isCountry: boolean; active: boolean; onPick: (it: CatalogItem) => void }) {
  return (
    <button
      onClick={() => onPick(item)}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all cursor-pointer active:scale-[0.99] ${
        active ? "bg-purple-500/20 border-purple-500 shadow-md shadow-purple-500/10" : "bg-black/20 border-transparent hover:bg-white/5"
      }`}
    >
      <span className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white/5">
        {isCountry ? <CountryFlag emoji={item.flag} country={item.name} size={22} /> : <ServiceLogo name={item.name} fallback={item.icon} size={22} />}
      </span>
      <span className={`flex-1 truncate text-sm font-bold ${active ? "text-white" : "text-purple-100/80"}`}>
        {item.name}
        {isCountry && item.dial_code ? <span className="ml-1.5 text-[11px] font-mono font-normal text-purple-300/50">({item.dial_code})</span> : null}
      </span>
      {active && <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0" />}
    </button>
  );
}
