import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import ServicesAndFeatures from "./components/ServicesAndFeatures";
import DashboardSimulator from "./components/DashboardSimulator";
import ReviewsAndSecurity from "./components/ReviewsAndSecurity";
import Footer from "./components/Footer";
import AuthModals from "./components/AuthModals";

import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardHomeView from "./components/views/DashboardHomeView";
import WalletView from "./components/views/WalletView";
import SMSPanelView from "./components/views/SMSPanelView";
import SMMPanelView from "./components/views/SMMPanelView";
import MarketplaceView from "./components/views/MarketplaceView";
import ESIMView from "./components/views/ESIMView";
import PhysicalSIMView from "./components/views/PhysicalSIMView";
import GiftDeliveryView from "./components/views/GiftDeliveryView";
import MyInventoryView from "./components/views/MyInventoryView";
import HowToUseView from "./components/views/HowToUseView";
import SupportView from "./components/views/SupportView";
import OrdersView from "./components/views/OrdersView";
import MyGiftOrdersView from "./components/views/MyGiftOrdersView";
import TransactionsView from "./components/views/TransactionsView";
import NotificationsView from "./components/views/NotificationsView";
import ProfileView from "./components/views/ProfileView";
import ReferralView from "./components/views/ReferralView";
import SettingsView from "./components/views/SettingsView";
import AdminPanel from "./components/views/AdminPanel"; // Added Admin Panel
import AddMoneySheet from "./components/wallet/AddMoneySheet";
import AnnouncementDisplay from "./components/AnnouncementDisplay";
import HelpCenter, { parseHelpHash } from "./help/HelpCenter";
import FormPublicView from "./components/public/FormPublicView";
import DocsPublicView from "./components/public/DocsPublicView";

// Public, login-free routes: #form/<slug> (Form Builder) and #docs / #docs/<slug> (Knowledge Base).
function parsePublicHash(hash: string): { kind: "form" | "docs" | null; slug?: string } {
  let h = "";
  try { h = decodeURIComponent((hash || "").replace(/^#/, "")); } catch { h = (hash || "").replace(/^#/, ""); }
  if (h === "form" || h.startsWith("form/")) return { kind: "form", slug: h.split("/")[1] || "" };
  if (h === "docs" || h.startsWith("docs/")) return { kind: "docs", slug: h.split("/")[1] || undefined };
  return { kind: null };
}
import AiAssistant from "./components/ai/AiAssistant";
import FeedbackPrompt from "./components/FeedbackPrompt";

import { Sparkles, ArrowRight, ShieldCheck, Play } from "lucide-react";
import { useToast } from "./components/ui/Toast";
import { apiFetch, getSessionToken, setSessionToken, clearSessionToken, waitForBackend } from "./utils/api";
import { installAudioUnlock, detectSmsTransitions, notifyWaiting, notifyCodeReceived } from "./utils/smsNotifications";
import { installNotifyAudioUnlock } from "./utils/notifySound";
import { reconcileFlutterwavePayments } from "./utils/flutterwave";
import { reconcileMonnifyPayments, verifyMonnifyReturn } from "./utils/monnify";
import LandingHighlights from "./components/LandingHighlights";

import { 
  MOCK_ORDERS, MOCK_NOTIFICATIONS, 
  MOCK_SMM_SERVICES, 
  MOCK_MARKETPLACE_PRODUCTS, Transaction, Order 
} from "./mockData";

export default function App() {
  const { toast } = useToast();
  const [userName, setUserName] = useState<string | null>(null); // Null starts on the Landing page
  // True while we verify a stored session token on first load — prevents a "flash of
  // landing page" (FOUC) for returning, already-authenticated users.
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => !!getSessionToken());
  // Backend readiness gate: no API-dependent page, poller, or session restore runs
  // until GET /api/health succeeds. Prevents startup ECONNREFUSED / proxy-error spam.
  const [backendReady, setBackendReady] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userPhone, setUserPhone] = useState<string>("");
  const [activeSection, setActiveSection] = useState("Dashboard");
  // Public help-center route (#help / #help/<slug>) — readable without login.
  const [helpRoute, setHelpRoute] = useState<{ isHelp: boolean; slug?: string }>(() =>
    typeof window !== "undefined" ? parseHelpHash(window.location.hash) : { isHelp: false }
  );
  // Public login-free routes for the Form Builder + Knowledge Base.
  const [publicRoute, setPublicRoute] = useState<{ kind: "form" | "docs" | null; slug?: string }>(() =>
    typeof window !== "undefined" ? parsePublicHash(window.location.hash) : { kind: null }
  );
  // When navigating into the Marketplace we can request a specific tab to open
  // (e.g. "gifts" from "Browse Gift Store"). Consumed once by MarketplaceView.
  const [marketplaceInitialTab, setMarketplaceInitialTab] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0.0); // Synchronized with balance
  const [activeService, setActiveService] = useState(4); // Service selected in landing to preview in simulator
  const [isAdmin, setIsAdmin] = useState(false); // Admin status from backend

  // Paystack Public Key loaded dynamically from backend
  const [paystackPublicKey, setPaystackPublicKey] = useState("");

  // Currency Conversion states
  const [exchangeRate, setExchangeRate] = useState(1623.50);
  const [equivalentNaira, setEquivalentNaira] = useState(0.0);
  const [lastUpdated, setLastUpdated] = useState("Just now");
  const [smmBalance, setSmmBalance] = useState<number>(0.0);

  // Auth Modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalType, setAuthModalType] = useState<"login" | "signup">("login");

  // Master Lists (Fetched from Server where applicable)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [sidebarItems, setSidebarItems] = useState<any[]>([]);

  // Fund Wallet Modal state
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);

  // Dynamic Notification Trigger
  const addAppNotification = (title: string, message: string, type: "security" | "payment" | "system" | "service" | "refund" | "announcement") => {
    const newNotif = {
      id: `NOTIF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      title,
      message,
      type,
      time: "Just now",
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // Clear notifications badge instantly when active section changes to Notifications (Requirement 4!)
  // Site-wide: unlock audio on the first user interaction so SMS notification
  // sounds work by default across all pages/tabs (browsers require a gesture).
  useEffect(() => { installAudioUnlock(); installNotifyAudioUnlock(); }, []);

  // Wait for the backend to be healthy before anything else touches the API.
  useEffect(() => {
    let alive = true;
    waitForBackend().then(() => { if (alive) setBackendReady(true); });
    return () => { alive = false; };
  }, []);

  // Global SMS watcher: keeps polling active virtual numbers even when the user is
  // NOT on the SMS panel, so sound + browser notifications fire for new numbers,
  // codes and verification messages anywhere on the site. Gated on backend readiness.
  useEffect(() => {
    if (!backendReady) return;
    if (!userName) return;
    let stopped = false;
    const prev = new Map<string, any>();
    let seeded = false;
    const tick = async () => {
      if (stopped) return;
      // Skip polling while the tab is in the background — saves CPU/network and
      // prevents a backlog of queued work that makes the UI feel frozen on return.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const data = await apiFetch("/api/sms/numbers");
        if (!Array.isArray(data)) return;
        const snap = data.map((l: any) => ({ id: String(l.id), status: l.status, otpReceived: l.otpReceived, number: l.number, service: l.service }));
        if (seeded) {
          const { waiting, codeReceived } = detectSmsTransitions(prev, snap);
          waiting.forEach(notifyWaiting);
          codeReceived.forEach((line) => {
            notifyCodeReceived(line);
            addAppNotification("Verification code received", `${line.service || "Number"}: ${line.otpReceived}`, "service");
          });
        }
        prev.clear();
        for (const s of snap) prev.set(s.id, s);
        seeded = true;
      } catch (e) { /* ignore transient errors */ }
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [userName, backendReady]);

  // ——— Item 11: real-time wallet balance ———
  // Lightweight balance poll so top-ups, purchases and refunds reflect in the UI
  // without a manual refresh. Only fetches the (cheap) balance, only while signed in
  // and while the tab is visible, and only updates state when the value actually
  // changes (avoids needless re-renders).
  useEffect(() => {
    if (!backendReady || !userName) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const w = await apiFetch("/api/wallet/balance");
        if (stopped || !w) return;
        const next = (w.isAdmin && w.equivalentNaira) ? w.equivalentNaira : w.balance;
        if (typeof next === "number") {
          setWalletBalance((prev) => (prev === next ? prev : next));
        }
        if (w.smmBalance !== undefined) setSmmBalance((prev) => (prev === w.smmBalance ? prev : w.smmBalance));
      } catch { /* ignore transient errors */ }
    };
    const timer = setInterval(poll, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [userName, backendReady]);

  useEffect(() => {
    if (activeSection === "Notifications") {
      apiFetch("/api/notifications/read", { method: "POST" })
        .then(() => setUnreadNotifsCount(0))
        .catch(err => console.error("Failed to mark notifications as read:", err));
    }
  }, [activeSection]);

  const fetchUnreadNotificationsCount = async () => {
    try {
      const data = await apiFetch("/api/notifications");
      const unread = (data || []).filter((n: any) => n.is_read === 0).length;
      setUnreadNotifsCount(unread);
    } catch (err) {
      console.error("Failed to load notifications count:", err);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      setUserName(res.user.name);
      setUserEmail(res.user.email);
      setUserPhone(res.user.phone || "");
    } catch (err) {
      console.error("Failed to refresh user profile:", err);
    }
  };

  // --- RESTORE SESSION ON MOUNT (after backend is healthy) ---
  useEffect(() => {
    if (!backendReady) return;
    const restoreSession = async () => {
      const token = getSessionToken();
      if (token) {
        try {
          const res = await apiFetch("/api/auth/me");
          setUserName(res.user.name);
          setUserEmail(res.user.email);
          setUserPhone(res.user.phone || "");
          setWalletBalance(res.user.wallet_balance);
          
          const isAdminUser = res.user.role === "Super Admin" || res.user.role === "Admin";
          setIsAdmin(isAdminUser);

          // Safety net: if the user returned from a Flutterwave redirect (or the JS callback
          // never fired), reconcile any pending payments server-side BEFORE showing the balance.
          try {
            // Verify any Monnify redirect-return first (paymentReference in URL/localStorage).
            const ret = await verifyMonnifyReturn();
            if (ret && ret.success) {
              addAppNotification("Wallet Updated", "Your Monnify payment was verified and credited.", "payment");
            }
            const [recFlw, recMnf] = await Promise.all([reconcileFlutterwavePayments(), reconcileMonnifyPayments()]);
            const credited = (recFlw.credited || 0) + (recMnf.credited || 0);
            if (credited > 0) {
              addAppNotification("Wallet Updated", `${credited} pending payment(s) were verified and credited.`, "payment");
            }
          } catch { /* non-fatal */ }

          await refreshLedgerAndNumbers();
          await fetchUnreadNotificationsCount();
        } catch (e) {
          console.error("Session restoration failed, clearing token", e);
          clearSessionToken();
        }
      }
      setIsRestoringSession(false);
    };
    restoreSession();
  }, [backendReady]);

  // Page State Preservation & Navigation (Requirement 5)
  // Section names contain spaces (e.g. "SMS Panel"), so encode/decode the hash to
  // keep the URL valid and correctly restore the exact route after a refresh.
  useEffect(() => {
    let hashSection = "";
    try {
      hashSection = decodeURIComponent(window.location.hash.replace("#", ""));
    } catch {
      hashSection = window.location.hash.replace("#", "");
    }
    if (hashSection && hashSection !== "Dashboard") {
      setActiveSection(hashSection);
    } else {
      const savedSection = localStorage.getItem("avs_active_section");
      if (savedSection) setActiveSection(savedSection);
    }
  }, []);

  useEffect(() => {
    if (userName && !helpRoute.isHelp) {
      localStorage.setItem("avs_active_section", activeSection);
      const encoded = encodeURIComponent(activeSection);
      // Avoid pushing duplicate history entries / redundant hash writes
      if (decodeURIComponent(window.location.hash.replace("#", "")) !== activeSection) {
        window.location.hash = encoded;
      }
      // Opening the Wallet is a natural moment to reconcile any pending gateway payments.
      if (activeSection === "Wallet") {
        Promise.all([reconcileFlutterwavePayments(), reconcileMonnifyPayments()]).then(([recFlw, recMnf]) => {
          const credited = (recFlw.credited || 0) + (recMnf.credited || 0);
          if (credited > 0) {
            addAppNotification("Wallet Updated", `${credited} pending payment(s) were verified and credited.`, "payment");
            refreshLedgerAndNumbers();
          }
        }).catch(() => {});
      }
    }
  }, [activeSection, userName]);

  useEffect(() => {
    const handleHashChange = () => {
      const help = parseHelpHash(window.location.hash);
      setHelpRoute(help);
      const pub = parsePublicHash(window.location.hash);
      setPublicRoute(pub);
      if (help.isHelp || pub.kind) return; // public/help routes aren't dashboard sections
      let newHash = "";
      try {
        newHash = decodeURIComponent(window.location.hash.replace("#", ""));
      } catch {
        newHash = window.location.hash.replace("#", "");
      }
      if (newHash && newHash !== activeSection) {
        setActiveSection(newHash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [activeSection]);

  // Fetch updated transactions & allocated phone numbers
  const refreshLedgerAndNumbers = async () => {
    try {
      const walletData = await apiFetch("/api/wallet/balance");
      
      // If user is Admin, their balance is stored in Credits, so convert it to NGN dynamically!
      if (walletData.isAdmin && walletData.equivalentNaira) {
        setWalletBalance(walletData.equivalentNaira);
      } else {
        setWalletBalance(walletData.balance);
      }
      
      setTransactions(walletData.transactions);
      
      if (walletData.paystackPublicKey) setPaystackPublicKey(walletData.paystackPublicKey);
      if (walletData.isAdmin !== undefined) setIsAdmin(walletData.isAdmin);
      if (walletData.exchangeRate) setExchangeRate(walletData.exchangeRate);
      if (walletData.equivalentNaira) setEquivalentNaira(walletData.equivalentNaira);
      if (walletData.lastUpdated) setLastUpdated(walletData.lastUpdated);
      if (walletData.smmBalance !== undefined) setSmmBalance(walletData.smmBalance);

      const clientOrders = await apiFetch("/api/orders");
      setOrders(clientOrders || []);

      const notifsData = await apiFetch("/api/notifications");
      setNotifications(notifsData || []);
      const unreadCount = (notifsData || []).filter((n: any) => n.is_read === 0).length;
      setUnreadNotifsCount(unreadCount);

      const sidebarRes = await apiFetch("/api/sidebar");
      if (sidebarRes && Array.isArray(sidebarRes)) setSidebarItems(sidebarRes);
    } catch (e) {
      console.error("Failed to refresh ledger data:", e);
    }
  };

  const handleFundSuccess = async (amount: number, tx: Transaction) => {
    try {
      const depositMethod = tx.category;
      
      // Card checkout & promo redemptions are already credited on the backend; just refresh the
      // local balance/ledger. The success toast is shown by the Add Money sheet (no alert needed).
      await refreshLedgerAndNumbers();
      addAppNotification("Wallet Deposit Confirmed", `Your available balance was credited with ₦${amount.toLocaleString()} via ${depositMethod}.`, "payment");
    } catch (e: any) {
      console.error("Deposit refresh failed:", e.message);
    }
  };

  const handleLogout = () => {
    clearSessionToken();
    setUserName(null);
    setTransactions([]);
    setActiveSection("Dashboard");
    setIsAdmin(false);
    toast("You've been signed out securely. See you soon!", "info");
  };

  // Helper for microservice deduction (in-memory for non-core views for now)
  const handleDeductFunds = (amount: number, description: string): boolean => {
    if (walletBalance < amount) {
      toast(`Insufficient balance — this action needs ₦${amount.toLocaleString()}. Please add funds first.`, "error", { action: { label: "Add money", onClick: () => setIsFundModalOpen(true) } });
      setIsFundModalOpen(true);
      return false;
    }
    
    setWalletBalance(prev => prev - amount);
    
    // Add purchase transaction
    const newTx: Transaction = {
      id: `TX-${Math.floor(9000 + Math.random() * 1000)}`,
      type: "purchase",
      category: activeSection,
      amount: amount,
      status: "completed",
      date: "Just now",
      description: description,
      reference: `EXT-${activeSection.toUpperCase().slice(0, 3)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    };
    
    setTransactions(prev => [newTx, ...prev]);
    return true;
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  const triggerLogin = () => {
    setAuthModalType("login");
    setIsAuthModalOpen(true);
  };

  const triggerSignup = () => {
    setAuthModalType("signup");
    setIsAuthModalOpen(true);
  };

  // Render correct view based on activeSection state
  const renderActiveView = () => {
    switch (activeSection) {
      case "Dashboard":
        return (
          <DashboardHomeView 
            walletBalance={walletBalance}
            transactions={transactions}
            orders={orders}
            notifications={notifications}
            exchangeRate={exchangeRate}
            equivalentNaira={equivalentNaira}
            lastUpdated={lastUpdated}
            onSelectSection={setActiveSection}
            onOpenFundModal={() => setIsFundModalOpen(true)}
            isAdmin={isAdmin}
            userName={userName}
            userEmail={userEmail}
            userPhone={userPhone}
          />
        );
      case "Referrals":
        return <ReferralView />;
      case "Wallet":
        return (
          <WalletView 
            walletBalance={walletBalance}
            transactions={transactions}
            onOpenFundModal={() => setIsFundModalOpen(true)}
            onRefreshLedger={refreshLedgerAndNumbers}
            onSelectSection={setActiveSection}
            lastUpdated={lastUpdated}
          />
        );
      case "SMS Panel":
        return (
          <SMSPanelView 
            walletBalance={walletBalance}
            onAddNotification={addAppNotification}
          />
        );
      case "SMM Panel":
        return (
          <SMMPanelView 
            walletBalance={walletBalance}
            smmBalance={smmBalance}
            onRefreshLedger={refreshLedgerAndNumbers}
            onAddNotification={addAppNotification}
          />
        );
      case "Marketplace":
        return (
          <MarketplaceView 
            walletBalance={walletBalance}
            orders={orders}
            onRefreshLedger={refreshLedgerAndNumbers}
            onAddNotification={addAppNotification}
            initialTab={marketplaceInitialTab}
            onInitialTabConsumed={() => setMarketplaceInitialTab(null)}
            onSelectSection={setActiveSection}
            userName={userName}
            userEmail={userEmail}
          />
        );
      case "Gift Delivery":
        return (
          <GiftDeliveryView 
            walletBalance={walletBalance}
            orders={orders}
            onRefreshLedger={refreshLedgerAndNumbers}
            onAddNotification={addAppNotification}
          />
        );
      case "eSIM":
        return (
          <ESIMView
            walletBalance={walletBalance}
            orders={orders}
            onRefreshLedger={refreshLedgerAndNumbers}
            onAddNotification={addAppNotification}
            onSelectSection={setActiveSection}
            userName={userName}
            userEmail={userEmail}
          />
        );
      case "Physical SIM":
        return (
          <PhysicalSIMView
            walletBalance={walletBalance}
            orders={orders}
            onRefreshLedger={refreshLedgerAndNumbers}
            onAddNotification={addAppNotification}
            onSelectSection={setActiveSection}
            userName={userName}
            userEmail={userEmail}
          />
        );
      case "My Inventory":
        return <MyInventoryView userName={userName} userEmail={userEmail} onSelectSection={setActiveSection} />;
      case "How to Use":
        return <HowToUseView />;
      case "Support":
        return <SupportView />;
      case "Orders":
        return <OrdersView orders={orders} userName={userName} userEmail={userEmail} onSelectSection={setActiveSection} />;
      case "My Gift Orders":
        return <MyGiftOrdersView onGoToGiftStore={() => { setMarketplaceInitialTab("gifts"); setActiveSection("Marketplace"); }} userName={userName} userEmail={userEmail} onSelectSection={setActiveSection} />;
      case "Transactions":
        return <TransactionsView transactions={transactions} />;
      case "Notifications":
        return (
          <NotificationsView 
            onRefreshNotificationsCount={fetchUnreadNotificationsCount}
          />
        );
      case "Profile":
        return (
          <ProfileView 
            userName={userName || "Alex Carter"} 
            userEmail={userEmail}
            userPhone={userPhone}
            onRefreshUser={refreshUser}
          />
        );
      case "Settings":
        return <SettingsView />;
      case "Admin Panel":
        // Client-side Admin Route Security Guard (Requirement 3!)
        if (!userName || !isAdmin) {
          setTimeout(() => {
            setActiveSection("Dashboard");
            triggerLogin();
          }, 0);
          return null;
        }
        return <AdminPanel />;
      default:
        return (
          <DashboardHomeView 
            walletBalance={walletBalance}
            transactions={transactions}
            orders={orders}
            notifications={notifications}
            exchangeRate={exchangeRate}
            equivalentNaira={equivalentNaira}
            lastUpdated={lastUpdated}
            onSelectSection={setActiveSection}
            onOpenFundModal={() => setIsFundModalOpen(true)}
            isAdmin={isAdmin}
            userName={userName}
            userEmail={userEmail}
            userPhone={userPhone}
          />
        );
    }
  };

  // ——— BACKEND CONNECTING SPLASH ———
  // Shown while GET /api/health is still failing (server booting/restarting). The
  // help center is static and can render without the backend, so it bypasses this.
  if (!backendReady && !helpRoute.isHelp) {
    return (
      <div className="min-h-screen bg-[#05020a] flex flex-col items-center justify-center gap-5" role="status" aria-live="polite" aria-busy="true">
        <div className="text-2xl font-black font-space tracking-tight text-white select-none">
          AVS<span className="text-cyan-400">shop</span>
        </div>
        <div className="h-8 w-8 rounded-full border-2 border-purple-500/30 border-t-cyan-400 animate-spin" />
        <span className="text-xs text-purple-200/50 font-space">Connecting to server…</span>
      </div>
    );
  }

  // ——— SESSION RESTORE SPLASH ———
  // Shown briefly while a stored token is verified, so returning users never see a
  // flash of the marketing landing page before their dashboard loads.
  if (isRestoringSession && !helpRoute.isHelp && !publicRoute.kind) {
    return (
      <div className="min-h-screen bg-[#05020a] flex flex-col items-center justify-center gap-5" role="status" aria-live="polite" aria-busy="true">
        <div className="text-2xl font-black font-space tracking-tight text-white select-none">
          AVS<span className="text-cyan-400">shop</span>
        </div>
        <div className="h-8 w-8 rounded-full border-2 border-purple-500/30 border-t-cyan-400 animate-spin" />
        <span className="text-xs text-purple-200/50 font-space">Restoring your session…</span>
      </div>
    );
  }

  // ——— PUBLIC FORM (login-free, shareable: #form/<slug>) ———
  if (publicRoute.kind === "form") {
    return <FormPublicView slug={publicRoute.slug || ""} />;
  }

  // ——— PUBLIC KNOWLEDGE BASE / DOCS (login-free: #docs / #docs/<slug>) ———
  if (publicRoute.kind === "docs") {
    return (
      <DocsPublicView
        slug={publicRoute.slug}
        onNavigate={(slug) => { const h = slug ? `docs/${slug}` : "docs"; window.location.hash = h; setPublicRoute({ kind: "docs", slug }); }}
        onHome={() => { window.location.hash = ""; setPublicRoute({ kind: null }); }}
      />
    );
  }

  // ——— PUBLIC HELP CENTER (login-free, shareable: #help / #help/<slug>) ———
  // Rendered before the auth gate so visitors can only read guides; any attempt to
  // reach protected sections falls through to the normal login/landing flow.
  if (helpRoute.isHelp) {
    return (
      <HelpCenter
        slug={helpRoute.slug}
        onSignIn={() => { window.location.hash = ""; setHelpRoute({ isHelp: false }); setAuthModalType("login"); setIsAuthModalOpen(true); }}
        onSignUp={() => { window.location.hash = ""; setHelpRoute({ isHelp: false }); setAuthModalType("signup"); setIsAuthModalOpen(true); }}
        onNavigateSlug={(slug) => { window.location.hash = `help/${slug}`; setHelpRoute({ isHelp: true, slug }); }}
        onHome={() => { window.location.hash = "help"; setHelpRoute({ isHelp: true }); }}
      />
    );
  }

  // Standard Landing View if not logged in
  if (!userName) {
    return (
      <div className="min-h-screen bg-[#03000a] text-[#f5f0ff] relative overflow-x-clip">
        
        {/* Decorative Grid and Ambient Lights — rendered as cheap radial-gradients instead
            of heavy CSS blur filters to avoid per-frame GPU repaint cost (scroll jank). */}
        <div className="absolute top-[5%] left-[10%] w-48 h-48 md:w-96 md:h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(147,51,234,0.16) 0%, rgba(147,51,234,0) 70%)" }} />
        <div className="absolute top-[35%] right-[10%] w-48 h-48 md:w-96 md:h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(8,145,178,0.16) 0%, rgba(8,145,178,0) 70%)" }} />
        <div className="absolute bottom-[10%] left-[20%] w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(76,29,149,0.22) 0%, rgba(76,29,149,0) 70%)" }} />
        <div className="absolute inset-0 digital-grid opacity-15 pointer-events-none" />

        {/* Navigation */}
        <Navbar 
          userName={null}
          onLogout={() => {}}
          onLoginClick={triggerLogin}
          onSignupClick={triggerSignup}
        />

        {/* Hero Section */}
        <header className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center justify-center text-center z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-[10px] md:text-xs font-bold text-purple-300 uppercase tracking-widest mb-6 animate-pulse-slow">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Multi-Service digital gateway</span>
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black font-space tracking-tight text-white max-w-4xl leading-tight">
            The Complete Digital Service Hub, <br className="hidden md:inline" />
            <span className="text-gradient-purple-cyan text-glow-purple">Evolved for Extranet Excellence</span>
          </h1>

          <p className="text-xs md:text-sm lg:text-base text-purple-200/60 max-w-2xl mt-6 leading-relaxed">
            Procure multi-redundant secure phone lines for instant global OTP confirmations, expand your social reach, and purchase premium software keys in one unified system.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-10 w-full max-w-md">
            <button
              onClick={triggerSignup}
              className="w-full sm:flex-1 relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer font-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              <span>Create Free Account</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={triggerLogin}
              className="w-full sm:flex-1 px-8 py-3.5 rounded-xl bg-white/5 border border-purple-500/25 text-sm font-bold text-white hover:bg-white/10 hover:border-purple-500/40 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer font-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
            >
              <span>Log In</span>
            </button>
          </div>

          <button
            onClick={() => {
              const demoElement = document.getElementById("demo-simulator");
              if (demoElement) demoElement.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300/70 hover:text-white transition-colors cursor-pointer font-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded-lg px-3 py-1.5"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Or try the interactive demo</span>
          </button>

          <div className="mt-6 flex items-center justify-center gap-4 text-[10px] md:text-xs text-purple-200/40 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-emerald-500" /> No Card Required</span>
            <span>·</span>
            <span>100% Secure Channel</span>
          </div>
        </header>

        {/* Services & Features Section */}
        <ServicesAndFeatures onSelectService={(serviceId) => setActiveService(serviceId)} />

        {/* Stats, showcases, trust indicators & CTA (production-grade landing) */}
        <LandingHighlights onGetStarted={triggerSignup} />

        {/* Live Interactive Simulator Wrapper */}
        <div id="demo-simulator" className="py-24 px-6 max-w-7xl mx-auto z-10 relative">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
              Aurevashop Playground
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight">
              Test-Drive Aurevashop
            </h2>
            <p className="text-xs md:text-sm lg:text-base text-purple-200/60 mt-4 leading-relaxed">
              Examine our real-time execution speeds. Try our primary service modules inside this fully interactive, high-fidelity sandbox dashboard simulator.
            </p>
          </div>
          <DashboardSimulator initialTab={activeService} userName="Guest" />
          
          <div className="text-center mt-10">
            <p className="text-xs text-purple-200/40">
              Ready to unlock production keys and fund a real wallet?{" "}
              <button onClick={triggerSignup} className="text-cyan-400 font-bold hover:underline cursor-pointer">
                Create an enterprise account now →
              </button>
            </p>
          </div>
        </div>

        {/* Reviews, FAQ & Security Section */}
        <ReviewsAndSecurity />

        {/* Footer */}
        <Footer />

        {/* Authentication Modal */}
        <AuthModals 
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          type={authModalType}
          onSuccess={async (user: any, meta?: { isNew?: boolean }) => {
            setUserName(user.name);
            setUserEmail(user.email);
            setUserPhone(user.phone || "");
            setWalletBalance(user.wallet_balance);
            
            const isAdminUser = user.role === "Super Admin" || user.role === "Admin";
            setIsAdmin(isAdminUser);

            await refreshLedgerAndNumbers();
            await fetchUnreadNotificationsCount();
            toast(
              meta?.isNew
                ? `Account created successfully — welcome to Aurevashop, ${user.name}!`
                : isAdminUser
                ? `Welcome back, ${user.name} — authorized as ${user.role}.`
                : `Welcome back, ${user.name}! You're signed in.`,
              "success",
              { big: true }
            );
          }}
          toggleType={() => setAuthModalType(prev => prev === "login" ? "signup" : "login")}
        />

        {/* Live Admin Announcements for guests (landing page) */}
        <AnnouncementDisplay currentPage="landing" isLoggedIn={false} />

        {/* AI Assistant (Aria) — available to guests on the landing page */}
        <AiAssistant section={null} loggedIn={false} />
      </div>
    );
  }

  // Production Dashboard Layout if logged in
  return (
    <>
      <DashboardLayout
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        walletBalance={walletBalance}
        userName={userName || "Alex Carter"}
        unreadNotifs={unreadNotifsCount}
        isAdmin={isAdmin} // Passed down dynamically!
        onLogout={handleLogout} // Fully wired and functional!
      >
        {/* Keyed wrapper gives every section a smooth premium enter animation on navigation */}
        <div key={activeSection} className="animate-fade-up">
          {renderActiveView()}
        </div>
      </DashboardLayout>

      {/* Global Fund Wallet Modal */}
      <AddMoneySheet 
        isOpen={isFundModalOpen}
        onClose={() => setIsFundModalOpen(false)}
        onFundSuccess={handleFundSuccess}
        paystackPublicKey={paystackPublicKey}
        userEmail={userEmail}
      />

      {/* Live Admin Announcements (targets logged-in users, current page = active section) */}
      <AnnouncementDisplay currentPage={activeSection} isLoggedIn={true} />

      {/* AI Assistant (Aria) — context-aware across the entire dashboard */}
      <AiAssistant
        section={activeSection}
        loggedIn={true}
        userName={userName}
        userEmail={userEmail}
        walletBalance={walletBalance}
        onNavigate={(s) => setActiveSection(s)}
      />

      {/* Item 10: post-purchase feedback prompt */}
      <FeedbackPrompt userName={userName} />
    </>
  );
}