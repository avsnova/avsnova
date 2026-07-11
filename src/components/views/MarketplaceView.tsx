import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  ShoppingBag, Star, X, Search, ArrowRight, ShieldCheck, 
  CheckCircle2, Copy, 
  Clock, Key, Shield, Laptop, Network, Globe, Lock, Play, HelpCircle,
  Eye, QrCode, Clipboard, AlertTriangle, FileText, Download, ChevronDown, ChevronUp,
  Trash2, ThumbsUp, Sparkles, Tag, Video, BookOpen, Package, TrendingUp, Award, Share2, GitCompare
} from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { enterFocusMode } from "../../utils/uiFocusStore";
import { copyToClipboard } from "../../utils/clipboard";
import BannerDisplay from "../BannerDisplay";
import GiftDeliveryView from "./GiftDeliveryView";
import { Gift, Zap, Wallet } from "lucide-react";
import { startFlutterwavePayment, loadFlutterwaveSdk } from "../../utils/flutterwave";
import OrderSuccessScreen from "../orders/OrderSuccessScreen";
import { orderDestination, destinationLabel, destinationSection } from "../orders/orderTracking";
import ProductCard, { ProductCardSkeleton } from "../marketplace/ProductCard";
import WalletBalancePreview from "../marketplace/WalletBalancePreview";
import { ProductTrustBar, ProductStatusRow } from "../marketplace/ProductTrustBar";
import ProductGallery from "../marketplace/ProductGallery";
import ProductImage from "../marketplace/ProductImage";
import ExpandableSpecs from "../marketplace/ExpandableSpecs";
import CompactProductCard from "../marketplace/CompactProductCard";
import OrderSummaryStep from "../marketplace/OrderSummaryStep";
import DynamicCheckoutFields, { moduleForCheckoutKind } from "../marketplace/DynamicCheckoutFields";
import BackToTop from "../marketplace/BackToTop";
import MarketplaceHero from "../marketplace/MarketplaceHero";
import CompareBar from "../marketplace/CompareBar";
import EmptyState from "../marketplace/EmptyState";
import { shareProduct } from "../marketplace/shareProduct";
import { toggleCompare, isComparing } from "../marketplace/compareStore";

interface MarketplaceProduct {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  price: number; // Stored strictly in NGN base price
  rating: number;
  sales: number;
  icon: string;
  description: string;
  type: "physical" | "digital";
  delivery_type: "instant" | "manual" | "inquiry"; 
  stock: number;
  file_url?: string;
  custom_fields?: string; // Comma-separated custom form fields
  setup_guide?: string; // Setup instructions / installation guides
  featured?: number;
  newest?: number;
  popular?: number;
  multiple_images?: string; // Comma separated URLs for Gadgets
  specifications?: string; // Hardware specs
  youtube_url?: string; // Video URL for product tutorial
  how_to_buy_guide?: string; // Written buy guide
  shipping_type?: "local" | "international"; // Physical goods shipping mode
  related_products?: string; // Comma-separated manually-curated related product IDs
  status?: number;
  // Where this product is displayed in the app. Determines which dedicated module
  // (Marketplace / eSIM / Physical SIM) surfaces it — independent of its category.
  // Legacy products without this field default to "marketplace".
  display_location?: "marketplace" | "esim" | "physical-sim" | "gift" | string;
}

interface SystemSettings {
  site_name: string;
  whatsapp_number: string;
  external_support_url: string;
  site_logo: string;
  maintenance_mode: number;
}

interface Review {
  id: number;
  product_id: string;
  user_id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

// Which dedicated module this instance is rendering. "marketplace" is the full store
// (with the tab bar + gift sub-store); "esim" / "physical-sim" are focused pages that
// reuse the exact same design, layout, cards, category pills and modals — only the
// data (filtered by display_location) and hero copy differ.
export type MarketplaceScope = "marketplace" | "esim" | "physical-sim";

interface MarketplaceViewProps {
  walletBalance: number;
  orders: any[];
  onRefreshLedger?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system" | "service") => void;
  preselectedCategory?: string;
  // Optional tab to open on mount (e.g. "gifts" when arriving via "Browse Gift Store").
  initialTab?: string | null;
  onInitialTabConsumed?: () => void;
  onSelectSection?: (section: string) => void;
  userName?: string | null;
  userEmail?: string | null;
  // Dedicated-page scope (defaults to the full marketplace).
  scope?: MarketplaceScope;
}

// Per-scope identity used for the hero + empty states. Keeps every module visually
// consistent while swapping only copy/icon.
const SCOPE_META: Record<MarketplaceScope, { badge: string; title: string; subtitle: string; searchPlaceholder: string; emptyLabel: string }> = {
  "marketplace": {
    badge: "AVS Digital Marketplace",
    title: "",
    subtitle: "",
    searchPlaceholder: "Search accounts, VPNs, software, SIMs, streaming keys...",
    emptyLabel: "products",
  },
  "esim": {
    badge: "AVS eSIM Store",
    title: "Global eSIM data plans, activated instantly.",
    subtitle: "Stay connected in 190+ countries with instant QR-code eSIM activation — no physical SIM, no roaming bills.",
    searchPlaceholder: "Search eSIM data plans by country or region...",
    emptyLabel: "eSIM plans",
  },
  "physical-sim": {
    badge: "AVS Physical SIM Store",
    title: "Physical SIM cards, delivered to your door.",
    subtitle: "Order local and international physical SIM cards with generous data, voice and text bundles — shipped straight to you.",
    searchPlaceholder: "Search physical SIM cards by country or carrier...",
    emptyLabel: "physical SIM cards",
  },
};

const NIGERIA_STATES = [
  "Lagos", "Abuja FCT", "Kano", "Kaduna", "Rivers", "Oyo", "Delta", "Anambra", "Edo", "Ogun", 
  "Enugu", "Akwa Ibom", "Ondo", "Kwara", "Kogi", "Plateau", "Nasarawa", "Benue", "Taraba", 
  "Adamawa", "Gombe", "Borno", "Yobe", "Jigawa", "Bauchi", "Katsina", "Sokoto", "Zamfara", "Kebbi", 
  "Ebonyi", "Abia", "Imo", "Cross River", "Bayelsa"
];

// International express shipping flat rate (NGN) — must match backend fallback in /api/marketplace/buy
const INTERNATIONAL_SHIPPING_NGN = 15000;

// ——— Module-driven checkout routing (marketplace restructure) ———
// The checkout form + fulfilment a product uses is decided by its PRIMARY module
// (display_location), NOT by ad-hoc category/subcategory/type heuristics. This is what
// makes new products automatically inherit the right checkout: an admin only picks the
// section, and everything else follows.
//   esim         → eSIM activation form   (digital, manual fulfilment, no stock)
//   physical-sim → Nigeria delivery form  (shipped in NG, manual fulfilment, no stock)
//   gift         → International gift form (manual fulfilment, no stock)
//   marketplace  → legacy behaviour driven by product.type / shipping_type
export type CheckoutKind = "esim" | "physical-sim" | "gift" | "intl" | "physical" | "digital";
export function checkoutKindFor(p: { display_location?: string; category?: string; type?: string; shipping_type?: string }): CheckoutKind {
  const loc = String(p.display_location || "").toLowerCase().trim();
  if (loc === "esim") return "esim";
  if (loc === "physical-sim" || loc === "physical sim") return "physical-sim";
  if (loc === "gift" || p.category === "gifts") return "gift";
  // General AVS Marketplace: keep the flexible, type-based checkout.
  if (p.type === "physical" && p.shipping_type === "international") return "intl";
  if (p.type === "physical") return "physical";
  return "digital";
}
// Modules that never track stock and are always manually fulfilled.
export function isStocklessModule(p: { display_location?: string; category?: string }): boolean {
  const loc = String(p.display_location || "").toLowerCase().trim();
  return loc === "esim" || loc === "physical-sim" || loc === "physical sim" || loc === "gift" || p.category === "gifts";
}

export default function MarketplaceView({ 
  walletBalance, 
  orders, 
  onRefreshLedger, 
  onAddNotification,
  preselectedCategory,
  initialTab,
  onInitialTabConsumed,
  onSelectSection,
  userName,
  userEmail,
  scope = "marketplace",
}: MarketplaceViewProps) {
  const { toast } = useToast();
  // Dedicated pages (eSIM / Physical SIM) run in a focused mode: no tab bar, no
  // gift sub-store — just the scoped catalogue built from the shared components.
  const isDedicatedScope = scope !== "marketplace";
  const scopeMeta = SCOPE_META[scope];
  // Master states — restored from sessionStorage so a page refresh keeps the
  // user's selected tab and category filter (Requirement 5).
  // FEATURE 1: land on the product catalogue by default, unless a specific tab was requested
  // (e.g. arriving from "Browse Gift Store" which opens the "gifts" tab directly).
  const [activeTab, setActiveTab] = useState(initialTab || "catalogue"); // "catalogue", "purchased", "gifts"

  // Consume the requested initial tab exactly once so later manual navigation isn't overridden.
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      onInitialTabConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  const [marketCategory, setMarketCategory] = useState<string>(() => sessionStorage.getItem("avs_mkt_category") || "all");
  // Subcategory drill-down inside a category collection page ("" = show all in category).
  const [marketSubcategory, setMarketSubcategory] = useState<string>("");

  useEffect(() => {
    if (preselectedCategory) {
      setMarketCategory(preselectedCategory);
    }
  }, [preselectedCategory]);

  // Persist category selection only (tab always defaults to catalogue for product focus)
  useEffect(() => { sessionStorage.setItem("avs_mkt_category", marketCategory); }, [marketCategory]);

  const [marketFilter, setMarketFilter] = useState<"all" | "newest" | "popular" | "az" | "price_asc" | "price_desc" | "best_selling">("all");
  // Additional lightweight filters (Phase 4): product type + availability.
  const [typeFilter, setTypeFilter] = useState<"all" | "digital" | "physical">("all");
  const [availFilter, setAvailFilter] = useState<"all" | "in-stock" | "instant">("all");
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [managedSubs, setManagedSubs] = useState<any[]>([]);
  
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  // Homepage Builder config (enabled + ordered sections). Falls back to the default order.
  const [homeLayout, setHomeLayout] = useState<{ id: string; type: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Product Details Modal States
  const [detailedProduct, setDetailedProduct] = useState<MarketplaceProduct | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<"specs" | "tutorials" | "reviews">("specs");
  const [detailedReviews, setDetailedReviews] = useState<Review[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Active viewed eSIM or manual credentials state for professional popup modal (Requirement 12)
  const [viewedCredentialsOrder, setViewedCredentialsOrder] = useState<any | null>(null);


  // Bulk Purchase Quantity state (For instant Buy Now modal)
  const [purchaseQty, setPurchaseQty] = useState("1");
  // BUG 4: two-step checkout for non-gift modules — 1: details, 2: order summary.
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);

  // Dynamic Custom Form Fields Builder State (For instant Buy Now modal)
  const [customFieldsValues, setCustomFieldsValues] = useState<Record<string, string>>({});
  // Admin-defined dynamic checkout fields loaded for the current product's module (Item 2).
  const [dynamicCheckoutFields, setDynamicCheckoutFields] = useState<{ field_key: string; label: string; required?: number | boolean }[]>([]);

  const [settings, setSettings] = useState<SystemSettings>({
    site_name: "Aurevashop",
    whatsapp_number: "+2349016075160",
    external_support_url: "https://avslogs.org",
    site_logo: "🛡️",
    maintenance_mode: 0
  });

  // Physical checkout modal states (For instant Buy Now modal)
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null);
  const [giftCheckoutStep, setGiftCheckoutStep] = useState<1 | 2>(1);
  const [giftShipping, setGiftShipping] = useState({
    senderName: "",
    receiverName: "",
    country: "Nigeria",
    street: "",
    apartment: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
  });
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Shared premium order-success celebration.
  const [orderSuccess, setOrderSuccess] = useState<null | {
    productName: string; orderId: string | number; cost: number; eta?: string;
    destinationLabel: string; destinationSection: string; credentials?: string | null;
  }>(null);
  // Payment method for marketplace checkout: wallet (default) or Flutterwave.
  const [payMethod, setPayMethod] = useState<"wallet" | "flutterwave">("wallet");
  const [flwEnabled, setFlwEnabled] = useState(false);
  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    address: "",
    city: "",
    state: "Lagos",
    country: "Nigeria",
    postalCode: "",
    phone: "+234",
    notes: "" 
  });

  // International shipping details (Requirement 1) — only used when product.shipping_type === "international"
  const [intlShipping, setIntlShipping] = useState({
    // Recipient Information (Required)
    fullName: "",
    phone: "",
    email: "",
    country: "",
    state: "",
    city: "",
    postalCode: "",
    address: "",
    // Delivery Contact (Optional)
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    // Shipping Information
    notes: ""
  });

  // Inquiry / Quote Form Modal States
  const [selectedInquiryProduct, setSelectedInquiryProduct] = useState<MarketplaceProduct | null>(null);

  // Enter global focus mode while a checkout/inquiry modal is open so the floating AI
  // launcher shrinks out of the way and never blocks the purchase actions.
  useEffect(() => {
    if (!selectedProduct && !selectedInquiryProduct) return;
    const exit = enterFocusMode();
    return exit;
  }, [selectedProduct, selectedInquiryProduct]);
  const [isInquirySubmitting, setIsInquirySubmitting] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    quantity: "100",
    country: "Nigeria",
    specialRequests: ""
  });

  // Sliding banners carousel state (Requirement 5)
  const [banners, setBanners] = useState<any[]>([]);
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [openGuides, setOpenGuides] = useState<Record<string, boolean>>({});

  // Lock and restore background scrolling (Requirement 13)
  useEffect(() => {
    const isModalOpen = !!detailedProduct || !!selectedProduct || !!selectedInquiryProduct || !!viewedCredentialsOrder;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailedProduct, selectedProduct, selectedInquiryProduct, viewedCredentialsOrder]);

  const fetchBanners = async () => {
    try {
      const data = await apiFetch("/api/banners");
      if (data && Array.isArray(data)) {
        setBanners(data);
      }
    } catch (err) {}
  };

  const fetchProductsAndRates = async () => {
    try {
      setIsLoading(true);
      const prodData = await apiFetch("/api/marketplace/products");
      // Filter out disabled products on user panel
      const activeProducts = (prodData || []).filter((p: any) => p.status !== 0);
      setProducts(activeProducts);

      const catsList = await apiFetch("/api/categories");
      // Filter out disabled categories
      const activeCategories = (catsList || []).filter((c: any) => c.status !== 0 && c.type !== "smm");
      setCategoriesList(activeCategories);

      // Admin-managed subcategories (variants) — active only, ordered.
      try {
        const sc = await apiFetch("/api/subcategories");
        setManagedSubs(((sc && sc.subcategories) || []).filter((s: any) => s.status !== 0));
      } catch (e) { /* non-fatal */ }

      // Homepage Builder layout (public, enabled + ordered). Best-effort; falls back to default.
      try {
        const layout = await apiFetch("/api/homepage");
        if (Array.isArray(layout)) setHomeLayout(layout.map((s: any) => ({ id: s.id, type: s.type })));
      } catch { /* non-fatal */ }
    } catch (err: any) {
      console.error("Failed to load store catalog:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiFetch("/api/settings");
      if (data && data.settings) setSettings(data.settings);
    } catch (e) {}
  };

  useEffect(() => {
    fetchProductsAndRates();
    fetchSettings();
    fetchBanners();
    // Marketplace is Wallet-payment only — Flutterwave/gateway selectors are disabled
    // here by design (setFlwEnabled stays false so payMethod is always "wallet").
  }, []);

  // Sliding banners automatic transition
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveBannerIdx((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [banners]);

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      toast(`Could not copy. Manually: ${text}`, "error");
    }
  };

  // Flat "Local Shipping" fee for the Physical SIM module (default ₦0, admin-configurable).
  const physicalSimShippingNgn = Number((settings as any).shipping_cost_physical_sim ?? 0) || 0;

  const getShippingCostNgn = (stateName: string) => {
    // Physical SIM uses a single flat Local Shipping fee regardless of state.
    if (scope === "physical-sim") return physicalSimShippingNgn;
    if (!stateName) return 0;
    const lowerState = stateName.toLowerCase();
    const costLagos = Number((settings as any).shipping_cost_lagos !== undefined ? (settings as any).shipping_cost_lagos : 2000);
    const costAbuja = Number((settings as any).shipping_cost_abuja !== undefined ? (settings as any).shipping_cost_abuja : 3500);
    const costNational = Number((settings as any).shipping_cost_national !== undefined ? (settings as any).shipping_cost_national : 5000);
    
    if (lowerState.includes("lagos")) return costLagos;
    if (lowerState.includes("fct") || lowerState.includes("abuja")) return costAbuja;
    return costNational;
  };

  // BUG 3: an item is unbuyable when it has 0 stock AND its module tracks stock.
  // Stockless modules (eSIM / Physical SIM / Gift) are always available.
  const isSoldOut = (p: MarketplaceProduct): boolean => {
    if (!p) return false;
    if (p.delivery_type === "inquiry" || p.price === 0) return false; // inquiry items aren't "stock"
    if (isStocklessModule(p)) return false;
    return (p.stock ?? 0) <= 0;
  };

  // Compute per-line + total for the order summary (BUG 4).
  const computeOrderTotals = (p: MarketplaceProduct, qty: number) => {
    const ck = checkoutKindFor(p);
    const unit = Math.round(p.price);
    const fee = ck === "physical" ? getShippingCostNgn(shippingInfo.state)
      : ck === "physical-sim" ? getShippingCostNgn(shippingInfo.state)
      : ck === "intl" ? INTERNATIONAL_SHIPPING_NGN
      : 0;
    const subtotal = unit * qty;
    return { unit, fee, subtotal, total: subtotal + fee };
  };

  // BUG 4: validate the detail form, then advance to the Order Summary step.
  const proceedToSummary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const ck = checkoutKindFor(selectedProduct);
    if (isSoldOut(selectedProduct)) { toast("This product is out of stock.", "error"); return; }
    const qty = parseInt(purchaseQty) || 1;
    // Per-module required-field validation before showing the summary.
    if (ck === "physical-sim" || ck === "physical") {
      if (!shippingInfo.fullName || !shippingInfo.phone || !shippingInfo.address || !shippingInfo.city) {
        toast("Please complete all delivery fields.", "warning"); return;
      }
    } else if (ck === "intl") {
      if (!intlShipping.fullName || !intlShipping.phone || !intlShipping.email || !intlShipping.country || !intlShipping.address) {
        toast("Please complete all recipient fields.", "warning"); return;
      }
    } else if (ck === "esim") {
      const need = ["First Name", "Email Address", "Phone Number", "Device Brand", "Device Model", "Country of Use", "Area Code"];
      if (need.some((k) => !customFieldsValues[k])) { toast("Please complete all eSIM fields.", "warning"); return; }
    } else {
      // generic digital custom fields
      const fields = (selectedProduct.custom_fields || "").split(",").map((f) => f.trim()).filter(Boolean);
      if (fields.some((f) => !customFieldsValues[f])) { toast("Please fill in all required fields.", "warning"); return; }
    }
    // Admin-defined dynamic checkout fields (Item 2): enforce any marked Required.
    const missingDynamic = dynamicCheckoutFields.filter((f) => f.required && !customFieldsValues[f.field_key]);
    if (missingDynamic.length) { toast(`Please complete: ${missingDynamic.map((f) => f.label).join(", ")}`, "warning"); return; }
    if (!stocklessQtyOk(selectedProduct, qty)) return;
    setCheckoutStep(2);
  };

  // Quantity vs stock check used by both the summary step and final submit.
  const stocklessQtyOk = (p: MarketplaceProduct, qty: number): boolean => {
    if (isStocklessModule(p) || p.delivery_type === "inquiry") return qty >= 1;
    if (qty < 1) { toast("Quantity must be at least 1.", "error"); return false; }
    if (qty > (p.stock ?? 0)) { toast(`Only ${p.stock} left in stock.`, "error"); return false; }
    return true;
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseInt(purchaseQty) || 1;
    // Module-driven checkout: the product's section decides the form, fulfilment and stock rules.
    const ck = checkoutKindFor(selectedProduct);
    const stockless = isStocklessModule(selectedProduct);
    // Stock guards (backend also enforces these). Stockless modules (eSIM / Physical SIM /
    // Gift) never track stock, so skip these checks entirely for them.
    if (selectedProduct.delivery_type !== "inquiry" && !stockless) {
      if (selectedProduct.stock <= 0) { toast("This product is out of stock.", "error"); return; }
      if (qty < 1) { toast("Quantity must be at least 1.", "error"); return; }
      if (qty > selectedProduct.stock) { toast(`Requested quantity exceeds available stock. Only ${selectedProduct.stock} left.`, "error"); return; }
    }
    const priceNgn = Math.round(selectedProduct.price);
    const isIntl = ck === "intl";
    // Shipping: eSIM never ships; Physical SIM + Gift use their admin-set flat fees
    // (resolved server-side); general marketplace physical uses local/international tiers.
    const shippingNgn = (ck === "physical")
      ? getShippingCostNgn(shippingInfo.state)
      : (ck === "intl" ? INTERNATIONAL_SHIPPING_NGN : (ck === "physical-sim" ? getShippingCostNgn(shippingInfo.state) : 0));

    const totalCostNgn = (priceNgn * qty) + shippingNgn;

    // Build the shipping payload once (shared by wallet + Flutterwave flows).
    const buildShippingInfo = () => ck === "gift" ? {
      ...giftShipping,
      productName: selectedProduct.name,
      quantity: qty,
      isGift: true
    } : (ck === "physical-sim" || ck === "physical"
      ? { ...shippingInfo, shippingType: "local", productName: selectedProduct.name, quantity: qty }
      : (ck === "intl"
          ? { ...intlShipping, shippingType: "international", productName: selectedProduct.name, quantity: qty }
          : null));

    // ——— Flutterwave checkout path: order is created server-side after verification ———
    if (payMethod === "flutterwave") {
      setIsCheckingOut(true);
      try {
        const result = await startFlutterwavePayment({
          purpose: ck === "gift" ? "gift" : "marketplace",
          productId: selectedProduct.id,
          quantity: qty,
          shippingInfo: buildShippingInfo(),
          customerEmail: undefined,
          title: ck === "gift" ? "Gift Order" : "Marketplace Order",
          description: `${selectedProduct.name} (x${qty})`,
        });
        if (result.success) {
          if (onAddNotification) onAddNotification("Payment Successful", `Order for ${selectedProduct.name} (x${qty}) confirmed via Flutterwave.`, "payment");
          toast("🎉 Payment verified — your order is confirmed!", "success", { big: true });
          setSelectedProduct(null);
          setCustomFieldsValues({});
          setPurchaseQty("1");
          setGiftCheckoutStep(1); setCheckoutStep(1);
          setPayMethod("wallet");
          if (onRefreshLedger) await onRefreshLedger();
          await fetchProductsAndRates();
          if (!isDedicatedScope) setActiveTab("purchased");
        } else if (result.status === "cancelled") {
          toast("Payment was cancelled.", "warning");
        } else {
          throw new Error(result.error || "Payment failed.");
        }
      } catch (err: any) {
        toast("Flutterwave payment error: " + err.message, "error");
      } finally {
        setIsCheckingOut(false);
      }
      return;
    }

    if (walletBalance < totalCostNgn) {
      toast(`Insufficient balance — needs ₦${totalCostNgn.toLocaleString()}, you have ₦${walletBalance.toLocaleString()}.`, "error", { action: { label: "Fund wallet", onClick: () => { window.location.hash = "Wallet"; } } });
      return;
    }

    setIsCheckingOut(true);
    try {
      const processedShippingInfo = ck === "gift" ? {
        ...giftShipping,
        productName: selectedProduct.name,
        quantity: qty,
        isGift: true
      } : (ck === "physical-sim" || ck === "physical"
        ? {
            ...shippingInfo,
            shippingType: "local",
            productName: selectedProduct.name,
            quantity: qty
          }
        : (ck === "intl"
            ? {
                ...intlShipping,
                shippingType: "international",
                productName: selectedProduct.name,
                quantity: qty
              }
            : null));

      const res = await apiFetch("/api/marketplace/buy", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProduct.id,
          shippingInfo: processedShippingInfo,
          shippingCost: shippingNgn,
          quantity: qty,
          customFieldsData: customFieldsValues
        })
      });

      // BUG 1: order couldn't be auto-processed → wallet was refunded and the order is
      // in Pending Manual Review. Inform the user clearly; no charge stands.
      if (res && res.pendingReview) {
        if (onAddNotification) {
          onAddNotification("Order Pending Review", `${selectedProduct.name} couldn't be processed automatically. Your wallet was not charged; the order is in manual review.`, "system");
        }
        toast(res.message || "We couldn't complete this order automatically. Your wallet was not charged — the order is in Pending Manual Review.", "warning", { big: true });
        setIsCheckingOut(false);
        setSelectedProduct(null);
        setCustomFieldsValues({});
        setPurchaseQty("1");
        setGiftCheckoutStep(1); setCheckoutStep(1);
        if (onRefreshLedger) await onRefreshLedger();
        await fetchProductsAndRates();
        if (!isDedicatedScope) setActiveTab("purchased");
        return;
      }

      if (res && res.success) {
        if (onAddNotification) {
          onAddNotification("Purchase Successful", `Successfully ordered ${selectedProduct.name} (x${qty}).`, "payment");
        }
        toast(res.message || "🎉 Purchase completed successfully!", "success", { big: true });
        // Show the unified premium completion celebration, routed to the right destination.
        const dest = orderDestination(ck === "gift" ? "Gifts" : "Marketplace", selectedProduct.type);
        setOrderSuccess({
          productName: selectedProduct.name,
          orderId: (res.orderId || res.order_id || res.id || `MKT-${Date.now().toString().slice(-6)}`),
          cost: totalCostNgn,
          eta: (res.credentials || res.custom_credentials) ? undefined : "A few minutes",
          destinationLabel: destinationLabel(dest),
          destinationSection: destinationSection(dest),
          credentials: res.credentials || res.custom_credentials || null,
        });
        setIsCheckingOut(false);
        setSelectedProduct(null);
        setCustomFieldsValues({});
        setPurchaseQty("1");
        setGiftCheckoutStep(1); setCheckoutStep(1);
        setGiftShipping({
          senderName: "",
          receiverName: "",
          country: "Nigeria",
          street: "",
          apartment: "",
          city: "",
          state: "",
          zipCode: "",
          phone: "",
        });
        setIntlShipping({
          fullName: "", phone: "", email: "", country: "", state: "", city: "",
          postalCode: "", address: "", contactName: "", contactPhone: "", contactEmail: "", notes: ""
        });
        
        // Refresh and Redirect dynamically (Requirement 1 & 8)
        if (onRefreshLedger) await onRefreshLedger();
        await fetchProductsAndRates();
        if (!isDedicatedScope) setActiveTab("purchased"); // Redirect instantly to My Inventory & Setup Guide!
      } else {
        throw new Error((res && res.error) || "Failed to process order.");
      }
    } catch (err: any) {
      setIsCheckingOut(false);
      toast("Order process error: " + err.message, "error");
    }
  };

  // Inquiry / Request Quote Submission (Type C!)
  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiryProduct) return;
    setIsInquirySubmitting(true);

    try {
      const res = await apiFetch("/api/marketplace/inquiry", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedInquiryProduct.id,
          quantity: inquiryForm.quantity,
          customFieldsData: {
            "Client Name": inquiryForm.fullName,
            "Contact Email": inquiryForm.email,
            "Contact Phone": inquiryForm.phone,
            "Country": inquiryForm.country,
            ...customFieldsValues
          },
          notes: inquiryForm.specialRequests
        })
      });

      if (res && res.success) {
        toast(res.message || "Your quote request was dispatched!", "success");
        setSelectedInquiryProduct(null);
        setCustomFieldsValues({});
        setInquiryForm({ fullName: "", email: "", phone: "", quantity: "100", country: "Nigeria", specialRequests: "" });
        if (onRefreshLedger) onRefreshLedger();
      }
    } catch (err: any) {
      toast("Inquiry submission failed: " + err.message, "error");
    } finally {
      setIsInquirySubmitting(false);
    }
  };

  // --- REVIEWS & RATINGS IMPLEMENTATION ---
  const fetchProductReviews = async (productId: string) => {
    setIsReviewsLoading(true);
    try {
      const res = await apiFetch(`/api/reviews/${productId}`);
      if (res && res.success) {
        setDetailedReviews(res.reviews || []);
      }
    } catch (err) {
      console.error("Failed to fetch product reviews:", err);
    } finally {
      setIsReviewsLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedProduct) return;
    setIsSubmittingReview(true);
    try {
      const res = await apiFetch("/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({
          productId: detailedProduct.id,
          rating: newReviewRating,
          comment: newReviewComment
        })
      });
      if (res && res.success) {
        toast("Thank you! Your review has been recorded.", "success");
        setNewReviewComment("");
        setNewReviewRating(5);
        fetchProductReviews(detailedProduct.id);
        fetchProductsAndRates(); // Refresh avg rating
      } else {
        toast(res.error || "Failed to submit review.", "error");
      }
    } catch (err: any) {
      toast("Error submitting review: " + err.message, "error");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // ——— DISPLAY LOCATION SCOPING ———
  // A product's admin-assigned `display_location` decides which module surfaces it,
  // independent of its category. Legacy products (no display_location) stay in the
  // main Marketplace; the eSIM / Physical SIM pages fall back to a name/category
  // heuristic so they're never empty before the admin migrates existing items.
  const matchesScope = (prod: MarketplaceProduct): boolean => {
    const loc = String(prod.display_location || "").toLowerCase().trim();
    // Multi-section visibility (Req 8): a product may be surfaced in extra sections via
    // its `display_locations` array while its PRIMARY location still drives checkout.
    let extraLocs: string[] = [];
    try {
      const raw = (prod as any).display_locations;
      if (Array.isArray(raw)) extraLocs = raw.map((x: any) => String(x).toLowerCase().trim());
      else if (typeof raw === "string" && raw.trim()) extraLocs = (JSON.parse(raw) as any[]).map((x) => String(x).toLowerCase().trim());
    } catch { /* ignore malformed */ }
    const inSection = (key: string) => loc === key || extraLocs.includes(key);

    if (scope === "marketplace") {
      // Everything whose primary location is marketplace, PLUS anything explicitly
      // toggled to also appear in the general marketplace.
      return loc === "" || loc === "marketplace" || extraLocs.includes("marketplace");
    }
    const hay = `${prod.subcategory || ""} ${prod.category || ""} ${prod.name || ""}`.toLowerCase();
    if (scope === "esim") {
      if (loc || extraLocs.length) return inSection("esim");
      return /\besim\b/.test(hay);
    }
    if (scope === "physical-sim") {
      if (loc || extraLocs.length) return inSection("physical-sim") || inSection("physical sim");
      return /physical\s*sim|\bsim card\b/.test(hay) && !/\besim\b/.test(hay);
    }
    return true;
  };

  // Filtered and Sorted products lists
  const filteredProducts = products.filter((prod) => {
    if (prod.status === 0) return false;
    if (!matchesScope(prod)) return false;
    const matchesCategory = marketCategory === "all" || prod.category === marketCategory;
    const matchesSub = !marketSubcategory || (prod.subcategory || "").toLowerCase() === marketSubcategory.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = prod.name.toLowerCase().includes(q) ||
                          (prod.subcategory && prod.subcategory.toLowerCase().includes(q)) ||
                          (prod.description && prod.description.toLowerCase().includes(q));
    const matchesType = typeFilter === "all" || prod.type === typeFilter;
    const matchesAvail =
      availFilter === "all" ||
      (availFilter === "in-stock" && (prod.stock > 0 || prod.delivery_type === "inquiry")) ||
      (availFilter === "instant" && prod.delivery_type === "instant" && prod.stock > 0);
    return matchesCategory && matchesSub && matchesSearch && matchesType && matchesAvail;
  });

  // Sort applied on top of the filter (Newest / Best Selling / A-Z).
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (marketFilter === "newest") return (b.newest ? 1 : 0) - (a.newest ? 1 : 0) || (b.sales || 0) - (a.sales || 0);
    if (marketFilter === "popular") return ((b.popular ? 1 : 0) - (a.popular ? 1 : 0)) || (b.sales || 0) - (a.sales || 0);
    if (marketFilter === "best_selling") return (b.sales || 0) - (a.sales || 0);
    if (marketFilter === "price_asc") return a.price - b.price;
    if (marketFilter === "price_desc") return b.price - a.price;
    if (marketFilter === "az") return a.name.localeCompare(b.name);
    return 0;
  });

  // ——— Category-first homepage ———
  // Scope-aware: only products belonging to this module contribute categories/pills.
  const activeProducts = products.filter((p) => p.status !== 0 && matchesScope(p));
  // Category cards for the homepage (only categories that actually have live products,
  // plus any admin category flagged, so the grid reflects real inventory).
  const categoryCards = categoriesList
    .map((cat) => ({ ...cat, count: activeProducts.filter((p) => p.category === cat.id).length }))
    .filter((cat) => cat.count > 0);
  // Subcategories (collections) inside the currently opened category. Prefer the
  // admin-managed variants (respecting their order); append any product-derived ones
  // that aren't managed yet so nothing is hidden.
  const subcategoriesInCategory = (() => {
    if (marketCategory === "all") return [] as string[];
    const derived = Array.from(new Set(activeProducts.filter((p) => p.category === marketCategory && p.subcategory).map((p) => (p.subcategory as string))));
    const managed = managedSubs
      .filter((s) => s.category_id === marketCategory)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((s) => s.name as string);
    const seen = new Set(managed.map((n) => n.toLowerCase()));
    const extras = derived.filter((n) => !seen.has(n.toLowerCase())).sort();
    // Only surface managed variants that actually have products, plus derived extras.
    const managedWithProducts = managed.filter((n) => derived.some((d) => d.toLowerCase() === n.toLowerCase()));
    return [...managedWithProducts, ...extras];
  })();
  // Homepage = category grid, shown only when nothing is drilled into / searched / filtered.
  const isBrowsingHome = !searchQuery && marketCategory === "all" && typeFilter === "all" && availFilter === "all" && marketFilter === "all";

  // Shared card handlers (reused by grids + sliders). Memoized with stable identities
  // so the memoized product cards below don't all re-render on every parent state
  // change (search typing, hover, cart updates, etc.). setState setters are stable,
  // so these callbacks never need to be recreated.
  const handleCardViewDetails = useCallback((pr: MarketplaceProduct) => {
    setDetailedProduct(pr); fetchProductReviews(pr.id); setActiveDetailsTab("specs");
  }, []);
  const handleCardBuy = useCallback((pr: MarketplaceProduct) => {
    setSelectedProduct(pr); setCustomFieldsValues({}); setPurchaseQty("1"); setCheckoutStep(1);
  }, []);
  const handleCardQuote = useCallback((pr: MarketplaceProduct) => {
    setSelectedInquiryProduct(pr); setCustomFieldsValues({});
  }, []);
  const cardHandlers = useMemo(() => ({
    onViewDetails: handleCardViewDetails,
    onBuy: handleCardBuy,
    onQuote: handleCardQuote,
  }), [handleCardViewDetails, handleCardBuy, handleCardQuote]);

  // Get related products — MANUAL selection only (Requirement 3: no auto-generation)
  const getRelatedProducts = (product: MarketplaceProduct) => {
    const rawRelated = (product as any).related_products;
    if (!rawRelated || typeof rawRelated !== "string" || rawRelated.trim() === "") {
      return [];
    }
    const relatedIds = rawRelated
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);
    // Preserve the admin-defined order, only show products that still exist & are active
    return relatedIds
      .map((id: string) => products.find(p => String(p.id).toLowerCase() === id))
      .filter((p): p is MarketplaceProduct => !!p && p.id !== product.id);
  };

  // Auto "Similar products / Customers also viewed" — same category (then subcategory),
  // ranked by sales, excluding the current product & any manual related picks.
  const getSimilarProducts = (product: MarketplaceProduct, limit = 6): MarketplaceProduct[] => {
    const relatedIds = new Set(getRelatedProducts(product).map((p) => p.id));
    return products
      .filter((p) => p.status !== 0 && p.id !== product.id && !relatedIds.has(p.id) && p.category === product.category)
      .sort((a, b) => {
        const subA = a.subcategory === product.subcategory ? 1 : 0;
        const subB = b.subcategory === product.subcategory ? 1 : 0;
        if (subA !== subB) return subB - subA;
        return (b.sales || 0) - (a.sales || 0);
      })
      .slice(0, limit);
  };

  const renderCredentialsParser = (credentialsText: string) => {
    if (!credentialsText) return <span className="text-purple-200/30 italic">Awaiting fulfillment...</span>;
    
    const lines = credentialsText.split("\n").filter(l => l.trim().length > 0);
    
    return (
      <div className="space-y-3 mt-2 text-left">
        {lines.map((line, lIdx) => {
          const parts = line.split("|").map(p => p.trim());
          return (
            <div key={lIdx} className="p-3 bg-black/40 border border-purple-500/10 rounded-2xl space-y-2 font-mono text-xs">
              {lines.length > 1 && (
                <span className="text-[10px] text-cyan-400 font-bold block pb-1 border-b border-purple-500/5 font-space uppercase">Account Log #{lIdx + 1}</span>
              )}
              {parts.map((part, pIdx) => {
                let label = `Credentials Parameter ${pIdx + 1}`;
                let value = part;
                
                if (part.includes(":")) {
                  const colonIdx = part.indexOf(":");
                  label = part.slice(0, colonIdx).trim();
                  value = part.slice(colonIdx + 1).trim();
                } else if (part.includes("@")) {
                  label = "User Email / ID";
                } else if (pIdx === 1) {
                  label = "Access Password";
                } else if (pIdx === 2) {
                  label = "License Node Key";
                } else if (pIdx === 3) {
                  label = "Security Matrix Code";
                }
                
                return (
                  <div key={pIdx} className="flex items-center justify-between gap-4 p-2 bg-black/30 rounded-xl border border-purple-500/5 hover:border-purple-500/15 transition-all">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-purple-200/40 uppercase font-bold tracking-widest">{label}</span>
                      <span className="text-cyan-400 font-bold break-all select-all text-xs sm:text-sm mt-0.5">{value}</span>
                    </div>
                    <button 
                      onClick={() => handleCopy(value)}
                      className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white shrink-0 cursor-pointer"
                      title={`Copy ${label}`}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const getCategoryTitle = (catId: string) => {
    const found = categoriesList.find(c => c.id === catId);
    return found ? found.name : "Products";
  };

  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    if (url.includes("embed/")) return url;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube.com/embed/${match[2]}`;
    }
    return url;
  };

  return (
    <div className="space-y-8 font-inter">
      <BackToTop />
      <CompareBar
        onView={(id) => { const pr = products.find((x) => x.id === id); if (pr) { setDetailedProduct(pr); fetchProductReviews(pr.id); setActiveDetailsTab("specs"); } }}
        onBuy={(id) => { const pr = products.find((x) => x.id === id); if (pr) { if (pr.delivery_type === "inquiry" || pr.price === 0) { setSelectedInquiryProduct(pr); } else { setSelectedProduct(pr); setPurchaseQty("1"); setCheckoutStep(1); } setCustomFieldsValues({}); } }}
      />

      {/* ——— PREMIUM HERO (catalogue only) ——— */}
      {(activeTab === "catalogue" || isDedicatedScope) && (
        <MarketplaceHero
          productCount={activeProducts.length}
          categoryCount={categoryCards.length}
          onSearchFocus={() => searchInputRef.current?.focus()}
          badge={scopeMeta.badge}
          title={scopeMeta.title || undefined}
          subtitle={scopeMeta.subtitle || undefined}
          searchPlaceholder={isDedicatedScope ? scopeMeta.searchPlaceholder : undefined}
        />
      )}

      {/* ——— MARKETPLACE TAB NAVIGATION (hidden on dedicated eSIM / Physical SIM pages) ——— */}
      {!isDedicatedScope && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar-thin">
          {[
            { id: "catalogue", label: "Browse Products", icon: <ShoppingBag className="h-4 w-4" /> },
            { id: "purchased", label: "My Purchases", icon: <Package className="h-4 w-4" /> },
            { id: "gifts", label: "🎁 International Gift Delivery", icon: <Gift className="h-4 w-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 font-space ${
                activeTab === t.id
                  ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-md shadow-purple-500/20"
                  : "bg-black/40 border border-purple-500/15 text-purple-200/60 hover:text-white hover:border-purple-500/30"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ——— ADVANCED MARKETPLACE BANNER CAROUSEL (#11) ——— */}
      {activeTab === "catalogue" && <BannerDisplay position="marketplace" />}

      {/* ——— CATALOGUE VIEW (mirrors International Gift Delivery layout) ——— */}
      {(activeTab === "catalogue" || isDedicatedScope) && (
        <div className="space-y-8 relative">
          {/* Category navigation pills — identical styling to Gift Delivery categories.
              Only the content (real marketplace categories) differs. */}
          <div className="flex flex-wrap gap-2.5 relative z-10">
            <button
              onClick={() => { setMarketCategory("all"); setMarketSubcategory(""); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${marketCategory === "all" ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/10" : "bg-black/40 border-purple-500/15 text-purple-200/50 hover:text-white"}`}
            >
              🗂️ All Categories
            </button>
            {categoryCards.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setMarketCategory(cat.id); setMarketSubcategory(""); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border inline-flex items-center gap-1.5 ${marketCategory === cat.id ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/10" : "bg-black/40 border-purple-500/15 text-purple-200/50 hover:text-white"}`}
              >
                {cat.icon && <ProductImage product={{ icon: cat.icon, name: cat.name }} className="h-4 w-4" rounded="rounded" />}
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Products feed — full width (search + sort + responsive grid) */}
          <div className="space-y-6 relative z-10">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-purple-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={scopeMeta.searchPlaceholder}
                  className="w-full bg-black/40 border border-purple-500/20 text-xs sm:text-sm text-white pl-10 pr-4 py-3.5 rounded-xl focus:outline-none focus:border-purple-500 placeholder-purple-200/30"
                />
              </div>
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value as any)}
                className="bg-black/40 border border-purple-500/20 text-xs sm:text-sm text-white px-3 py-3.5 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer"
                aria-label="Sort products"
              >
                <option value="all">Sort: Featured</option>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="popular">Most Popular</option>
                <option value="best_selling">Best Selling</option>
                <option value="az">Alphabetical (A–Z)</option>
              </select>
            </div>

            {/* Sub-collection pills (variants) when a category is open — same pill styling */}
            {subcategoriesInCategory.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setMarketSubcategory("")} className={`px-3.5 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all border ${!marketSubcategory ? "bg-purple-600 text-white border-purple-500" : "bg-black/40 border-purple-500/15 text-purple-200/50 hover:text-white"}`}>All {getCategoryTitle(marketCategory)}</button>
                {subcategoriesInCategory.map((sub) => (
                  <button key={sub} onClick={() => setMarketSubcategory(sub)} className={`px-3.5 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all border ${marketSubcategory === sub ? "bg-purple-600 text-white border-purple-500" : "bg-black/40 border-purple-500/15 text-purple-200/50 hover:text-white"}`}>{sub}</button>
                ))}
              </div>
            )}

            {/* Product grid — 2 per row on mobile, 3 on tablet, 4 on desktop */}
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
                {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="text-center py-20 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">
                No matching {scopeMeta.emptyLabel} listed in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5 font-inter">
                {sortedProducts.map((prod) => (
                  <CompactProductCard key={prod.id} product={prod} featured={!!prod.featured} {...cardHandlers} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ——— TAB: PURCHASED / INVENTORY VIEW ——— */}
      {activeTab === "purchased" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-purple-500/15 pb-3 text-left">
            <Key className="h-5 w-5 text-purple-400" />
            <h3 className="text-base font-bold text-white font-space">Your Purchased Inventory & Guides</h3>
          </div>
          
          <div className="space-y-4 font-inter text-left">
            {orders.filter(o => o.category === "Marketplace" || o.category === "Marketplace (Inquiry)").length === 0 ? (
              <EmptyState
                illustration="orders"
                title="No purchases yet"
                subtitle="Your licenses, keys, accounts and tracking numbers will appear here after your first order."
                action={<button onClick={() => setActiveTab("catalogue")} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-bold cursor-pointer">Browse products</button>}
              />
            ) : (
              orders.filter(o => o.category === "Marketplace" || o.category === "Marketplace (Inquiry)").map((o) => {
                const prod = products.find(p => p.id === o.product_id);
                const hasGuide = prod && prod.setup_guide && prod.setup_guide.trim().length > 0;
                const isGuideOpen = !!openGuides[o.id];

                return (
                  <div key={o.id} className="p-4 rounded-2xl border border-purple-500/10 bg-black/30 hover:border-purple-500/20 transition-all space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm sm:text-base font-space">{o.name}</h4>
                          <Badge variant={o.status === "completed" || o.status === "delivered" ? "success" : "purple"}>
                            {o.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-[10px] font-mono text-purple-200/40 uppercase tracking-wider mt-1">
                          Order Ref: {o.id} · Qty: {o.quantity || 1} · Purchased: {new Date(o.created_at || Date.now()).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {hasGuide && (
                          <button 
                            onClick={() => setOpenGuides(prev => ({ ...prev, [o.id]: !isGuideOpen }))}
                            className="px-3 py-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 text-xs font-bold text-purple-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer font-space"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Setup Guide</span>
                            {isGuideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        
                        {/* Fulfill Details professional popup trigger (Requirement 12) */}
                        <Button 
                          size="sm" 
                          onClick={() => setViewedCredentialsOrder(o)} 
                          className="flex items-center gap-1.5 bg-cyan-600/35 hover:bg-cyan-500 text-white font-space text-[10px] font-bold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Credentials / Profile 📶</span>
                        </Button>
                      </div>
                    </div>

                    {/* Setup Guide Documentation Section */}
                    {isGuideOpen && prod && (
                      <div className="p-4 bg-purple-950/10 border border-purple-500/20 rounded-2xl text-xs text-purple-200 leading-relaxed text-left font-mono space-y-2 max-w-3xl">
                        <span className="font-bold text-purple-400 font-space uppercase block border-b border-purple-500/10 pb-1.5 mb-2">📚 Setup & Installation Guide</span>
                        <p className="whitespace-pre-wrap">{prod.setup_guide}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* ——— TAB: 🎁 INTERNATIONAL GIFT DELIVERY (dedicated mini-store inside Marketplace) ——— */}
      {activeTab === "gifts" && (
        <GiftDeliveryView
          walletBalance={walletBalance}
          orders={orders}
          onRefreshLedger={onRefreshLedger}
          onAddNotification={onAddNotification}
        />
      )}

      {/* ——— PRODUCT DETAILS MODAL (WITH INTEGRATED SPECS, TUTORIALS & REVIEWS) ——— */}
      {detailedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setDetailedProduct(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-purple-500/30 bg-[#0c0420] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar-thin text-left">
            
            <div className="flex justify-between items-start border-b border-purple-500/15 pb-3">
              <div className="flex items-center gap-4">
                <ProductImage product={detailedProduct} className="h-14 w-14" rounded="rounded-2xl" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                      {detailedProduct.subcategory || detailedProduct.category}
                    </span>
                    <Badge variant={detailedProduct.type === "physical" ? "info" : "purple"}>
                      {detailedProduct.type.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold font-space text-white">{detailedProduct.name}</h3>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={async () => { const r = await shareProduct(detailedProduct); if (r === "copied") toast("Product link copied", "success", { silent: true }); else if (r === "failed") toast("Couldn't share this product", "error"); }}
                  aria-label="Share product" title="Share"
                  className="p-1.5 rounded-lg text-purple-200/50 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Share2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => { const added = toggleCompare({ id: detailedProduct.id, name: detailedProduct.name, price: detailedProduct.price, icon: detailedProduct.icon, file_url: detailedProduct.file_url, multiple_images: detailedProduct.multiple_images, category: detailedProduct.category, type: detailedProduct.type, delivery_type: detailedProduct.delivery_type, stock: detailedProduct.stock, rating: detailedProduct.rating }); toast(added ? "Added to comparison" : "Removed from comparison", "success", { silent: true }); }}
                  aria-label="Compare product" title="Compare"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isComparing(detailedProduct.id) ? "text-cyan-300 bg-cyan-500/15" : "text-purple-200/50 hover:text-white hover:bg-white/5"}`}
                >
                  <GitCompare className="h-5 w-5" />
                </button>
                <button onClick={() => setDetailedProduct(null)} aria-label="Close" className="p-1.5 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Tabs for Details, How to Buy, Reviews */}
            <div className="flex border-b border-purple-500/10 gap-3 text-xs font-space">
              <button 
                onClick={() => setActiveDetailsTab("specs")} 
                className={`pb-2 border-b-2 font-bold px-1 transition-all ${activeDetailsTab === "specs" ? "border-purple-500 text-white" : "border-transparent text-purple-200/40"}`}
              >
                Specifications 📊
              </button>
              <button 
                onClick={() => setActiveDetailsTab("tutorials")} 
                className={`pb-2 border-b-2 font-bold px-1 transition-all ${activeDetailsTab === "tutorials" ? "border-purple-500 text-white" : "border-transparent text-purple-200/40"}`}
              >
                How to Buy 📚
              </button>
              <button 
                onClick={() => setActiveDetailsTab("reviews")} 
                className={`pb-2 border-b-2 font-bold px-1 transition-all ${activeDetailsTab === "reviews" ? "border-purple-500 text-white" : "border-transparent text-purple-200/40"}`}
              >
                Reviews & Ratings ⭐
              </button>
            </div>

            {/* TAB: Specifications & Specifications gallery */}
            {activeDetailsTab === "specs" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider font-space">Product Specifications</h4>
                  
                  {/* Premium product gallery: swipe, zoom, lightbox, thumbnails, skeleton */}
                  <ProductGallery
                    images={detailedProduct.multiple_images}
                    fallbackImage={detailedProduct.file_url}
                    icon={detailedProduct.icon}
                    alt={detailedProduct.name}
                  />

                  <p className="text-xs text-purple-200/70 leading-relaxed bg-black/30 p-4 rounded-2xl border border-purple-500/5 min-h-[80px]">
                    {detailedProduct.description}
                  </p>

                  {detailedProduct.specifications && (
                    <ExpandableSpecs specifications={detailedProduct.specifications} />
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-space">Purchase & stock Status</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs bg-black/20 p-4 rounded-2xl border border-purple-500/5">
                    <div>
                      <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Price</span>
                      <span className="text-white font-bold font-space text-base text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-white">
                        ₦{detailedProduct.price.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Fulfillment</span>
                      <span className="text-white font-bold font-space text-xs">
                        {detailedProduct.delivery_type.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Availability</span>
                      <span className={`font-bold font-space ${isSoldOut(detailedProduct) ? "text-red-400" : "text-emerald-400"}`}>
                        {isStocklessModule(detailedProduct) ? "Available" : isSoldOut(detailedProduct) ? "Out of Stock" : `${detailedProduct.stock} Available`}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Sales Count</span>
                      <span className="text-purple-300 font-bold font-space">
                        {detailedProduct.sales || 0} Delivered
                      </span>
                    </div>
                  </div>

                  {/* Delivery estimate + provider status */}
                  <ProductStatusRow product={detailedProduct} />

                  {/* Trust indicators */}
                  <ProductTrustBar product={detailedProduct} />

                  <div className="flex gap-2">
                    {detailedProduct.delivery_type === "inquiry" || detailedProduct.price === 0 ? (
                      <Button 
                        size="lg" 
                        onClick={() => {
                          setSelectedInquiryProduct(detailedProduct);
                          setDetailedProduct(null);
                          setCustomFieldsValues({});
                        }}
                        className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:brightness-110"
                      >
                        <span>Request Wholesale Quote 📑</span>
                      </Button>
                    ) : (
                      <Button 
                        size="lg" 
                        onClick={() => {
                          setSelectedProduct(detailedProduct);
                          setDetailedProduct(null);
                          setCustomFieldsValues({});
                          setPurchaseQty("1");
                          setCheckoutStep(1);
                        }}
                        disabled={isSoldOut(detailedProduct)}
                        className="w-full bg-gradient-to-r from-purple-600 to-purple-500 font-bold text-xs"
                      >
                        {isSoldOut(detailedProduct) ? "Out of Stock" : "⚡ Buy Now"}
                      </Button>
                    )}
                  </div>

                  {/* Related Products */}
                  <div className="space-y-3 pt-2">
                    {(() => {
                      const manual = getRelatedProducts(detailedProduct);
                      const list = manual.length > 0 ? manual : getSimilarProducts(detailedProduct, 5);
                      const heading = manual.length > 0 ? "Related Items" : "Customers also viewed";
                      return (<>
                    <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest font-space block">{heading}</span>
                    {list.length === 0 ? (
                      <div className="text-xs text-purple-200/30 italic">More products coming soon in this category.</div>
                    ) : (
                      list.map(relProd => (
                        <div 
                          key={relProd.id}
                          onClick={() => {
                            setDetailedProduct(relProd);
                            fetchProductReviews(relProd.id);
                            setActiveDetailsTab("specs");
                          }}
                          className="p-3 rounded-2xl border border-purple-500/10 bg-black/40 hover:border-purple-500/30 hover:bg-black/60 cursor-pointer transition-all flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <ProductImage product={relProd} className="h-9 w-9" rounded="rounded-lg" />
                            <div>
                              <span className="text-[10px] text-purple-200/40 block uppercase font-bold">{relProd.subcategory}</span>
                              <span className="font-bold text-white text-xs">{relProd.name}</span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-amber-300 font-mono shrink-0">₦{relProd.price.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                      </>);
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: How to Buy Tutorial section (Requirement 6) */}
            {activeDetailsTab === "tutorials" && (
              <div className="space-y-5">
                <div className="border-b border-purple-500/10 pb-2 flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider font-space">
                  <Play className="h-4 w-4" />
                  <span>How to purchase & use this item</span>
                </div>

                {detailedProduct.youtube_url ? (
                  <div className="space-y-2">
                    <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">🎬 video tutorial guide</span>
                    <div className="relative pb-[56.25%] h-0 rounded-2xl overflow-hidden border border-purple-500/15 shadow-lg bg-black">
                      <iframe
                        className="absolute top-0 left-0 w-full h-full border-0"
                        src={getEmbedUrl(detailedProduct.youtube_url)}
                        title="How to buy product video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-purple-950/10 border border-purple-500/10 rounded-2xl text-xs flex items-center gap-2 text-purple-200">
                    <Video className="h-4 w-4 text-purple-400" />
                    <span>No product-specific video tutorial available. See general system guide.</span>
                  </div>
                )}

                <div className="space-y-2 text-xs">
                  <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">📝 written step-by-step guidelines</span>
                  <div className="p-4 bg-black/40 border border-purple-500/10 rounded-2xl text-purple-200 leading-relaxed font-mono whitespace-pre-wrap">
                    {detailedProduct.how_to_buy_guide || "1. Double-check your wallet balance in NGN Naira.\n2. Click the 'Buy Now' button on this card.\n3. Input any required configuration parameters (device, brand, email, or shipping details).\n4. Authorize the checkout debit.\n5. You will be instantly redirected to the 'My Inventory & Setup Guides' dashboard where your keys, digital serial logs, or tracking IDs are deposited."}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button 
                    onClick={() => {
                      setSelectedProduct(detailedProduct);
                      setDetailedProduct(null);
                      setCustomFieldsValues({});
                      setPurchaseQty("1");
                    }}
                    disabled={detailedProduct.stock <= 0}
                    className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-xs px-6"
                  >
                    Proceed with Instant Purchase ➔
                  </Button>
                </div>
              </div>
            )}

            {/* TAB: Reviews Feed and rating submit */}
            {activeDetailsTab === "reviews" && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-white font-space">Customer Ratings & Reviews</h4>
                    <p className="text-xs text-purple-200/50 mt-0.5 font-inter">Read honest experiences of verified platform purchasers.</p>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-purple-500/5">
                    <span className="text-2xl font-black font-space text-amber-400">{detailedProduct.rating || "5.0"}</span>
                    <div className="text-xs">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} className={`h-3.5 w-3.5 ${star <= Math.round(detailedProduct.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-purple-200/20'}`} />
                        ))}
                      </div>
                      <span className="text-[10px] text-purple-200/40 uppercase font-bold block">Verified Rating</span>
                    </div>
                  </div>
                </div>

                {/* Review Input */}
                <form onSubmit={handleSubmitReview} className="p-4 bg-purple-950/10 border border-purple-500/15 rounded-2xl space-y-4">
                  <span className="text-xs font-bold text-purple-300 uppercase block font-space">Add Your Rating / Review</span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-200/60 font-medium">Select Star Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setNewReviewRating(star)}
                          className="p-1 cursor-pointer hover:scale-110 transition-transform"
                        >
                          <Star className={`h-5 w-5 ${star <= newReviewRating ? 'fill-amber-400 text-amber-400' : 'text-purple-200/30'}`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <textarea
                      required
                      rows={2}
                      value={newReviewComment}
                      onChange={(e) => setNewReviewComment(e.target.value)}
                      placeholder="Describe your installation or software license checkout experience..."
                      className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 focus:outline-none focus:border-purple-500 placeholder-purple-200/20 font-inter"
                    />
                  </div>

                  <Button type="submit" isLoading={isSubmittingReview} className="bg-purple-600 hover:bg-purple-500 text-xs font-bold px-6">
                    Publish My Review ⭐️
                  </Button>
                </form>

                {/* Reviews List */}
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar-thin">
                  {isReviewsLoading ? (
                    <div className="text-center py-6 text-xs text-purple-200/30 animate-pulse">Loading verified reviews...</div>
                  ) : detailedReviews.length === 0 ? (
                    <div className="text-center py-6 text-xs text-purple-200/30 italic">No reviews logged yet. Be the first to share your experience!</div>
                  ) : (
                    detailedReviews.map(rev => (
                      <div key={rev.id} className="p-4 rounded-2xl border border-purple-500/5 bg-black/20 space-y-2 text-xs">
                        <div className="flex justify-between items-center font-inter">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{rev.user_name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase font-mono font-bold tracking-widest">Verified Buyer</span>
                          </div>
                          <span className="text-[10px] text-purple-200/30">{rev.created_at}</span>
                        </div>
                        
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star key={star} className={`h-3 w-3 ${star <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-purple-200/10'}`} />
                          ))}
                        </div>

                        <p className="text-purple-200/70 leading-relaxed font-inter">{rev.comment}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ——— STICKY MOBILE PURCHASE BAR (mobile only) ——— */}
            <div className="sm:hidden sticky bottom-0 -mx-6 -mb-6 mt-2 px-4 py-3 bg-[#0c0420]/95 backdrop-blur-xl border-t border-purple-500/20 flex items-center gap-3">
              <div className="min-w-0">
                <div className="text-[9px] text-purple-200/40 uppercase font-bold tracking-wider">Price</div>
                <div className="text-base font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-white truncate">
                  {detailedProduct.price > 0 ? `₦${detailedProduct.price.toLocaleString()}` : "On request"}
                </div>
              </div>
              {detailedProduct.delivery_type === "inquiry" || detailedProduct.price === 0 ? (
                <button
                  onClick={() => { setSelectedInquiryProduct(detailedProduct); setDetailedProduct(null); setCustomFieldsValues({}); }}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-500 text-white text-sm font-bold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FileText className="h-4 w-4" /> Request Quote
                </button>
              ) : (
                <button
                  onClick={() => { setSelectedProduct(detailedProduct); setDetailedProduct(null); setCustomFieldsValues({}); setPurchaseQty("1"); }}
                  disabled={detailedProduct.stock <= 0}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Zap className="h-4 w-4" /> {detailedProduct.stock <= 0 ? "Out of stock" : "Buy Now"}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ——— MANUAL FULFILLMENT / CREDENTIALS PROFESSIONAL LARGE MODAL (Requirement 12) ——— */}
      {viewedCredentialsOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewedCredentialsOrder(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#070319] p-6 sm:p-8 shadow-2xl flex flex-col justify-between max-h-[85vh] overflow-y-auto custom-scrollbar-thin text-left font-inter">
            
            <div className="flex justify-between items-start border-b border-cyan-500/15 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">📡</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider block">Fulfillment Delivery Nodes</span>
                    <Badge variant="success">SECURE PROFILE</Badge>
                  </div>
                  <h3 className="text-xl font-bold font-space text-white">{viewedCredentialsOrder.name}</h3>
                </div>
              </div>
              <button onClick={() => setViewedCredentialsOrder(null)} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="py-6 space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar-thin text-xs sm:text-sm">
              
              <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/30 p-4 rounded-2xl border border-purple-500/5">
                <div>
                  <span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Order Identifier</span>
                  <span className="text-white font-bold">{viewedCredentialsOrder.id}</span>
                </div>
                <div>
                  <span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Purchase Date</span>
                  <span className="text-white font-bold">{new Date(viewedCredentialsOrder.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Ordered Quantity</span>
                  <span className="text-white font-bold">{viewedCredentialsOrder.quantity || 1} Unit(s)</span>
                </div>
                <div>
                  <span className="text-purple-200/40 block uppercase text-[9px] font-bold font-space">Fulfillment Cost</span>
                  <span className="text-emerald-400 font-bold">₦{viewedCredentialsOrder.price.toLocaleString()} NGN</span>
                </div>
              </div>

              {/* QR Code section (For eSIMs) */}
              {(viewedCredentialsOrder.esim_qr_code || viewedCredentialsOrder.esim_activation_code) && (
                <div className="p-4 bg-cyan-950/15 border border-cyan-500/20 rounded-2xl space-y-4">
                  <span className="font-bold text-cyan-400 font-space uppercase block border-b border-cyan-500/10 pb-1.5 text-xs">📶 eSIM ACTIVATION NODE DETAILS</span>
                  
                  <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
                    {viewedCredentialsOrder.esim_qr_code && (
                      <div className="p-4 bg-white rounded-3xl shrink-0 flex items-center justify-center shadow-lg w-40 h-44">
                        <QrCode className="h-32 w-32 text-black" />
                      </div>
                    )}
                    <div className="space-y-3 text-left w-full text-xs">
                      {viewedCredentialsOrder.esim_activation_code && (
                        <div>
                          <span className="text-purple-200/40 block uppercase text-[9px] font-bold">SM-DP+ Address & Activation Code</span>
                          <div className="flex items-center gap-2 mt-1 bg-black/40 p-2.5 rounded-xl border border-cyan-500/10 font-mono">
                            <span className="text-white font-bold truncate flex-1">{viewedCredentialsOrder.esim_activation_code}</span>
                            <button onClick={() => handleCopy(viewedCredentialsOrder.esim_activation_code)} className="p-1 rounded-lg text-cyan-400 hover:text-white cursor-pointer bg-cyan-500/10">
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {viewedCredentialsOrder.esim_instructions && (
                        <div>
                          <span className="text-purple-200/40 block uppercase text-[9px] font-bold">Activation steps</span>
                          <p className="text-purple-200/70 font-mono whitespace-pre-wrap leading-relaxed mt-1 text-[11px]">
                            {viewedCredentialsOrder.esim_instructions}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* General Digital Credentials display */}
              <div className="space-y-2">
                <span className="text-[10px] text-purple-200/40 uppercase font-bold tracking-widest block font-space">📦 LICENSES & SECURE DIGITAL SERIAL CODES</span>
                <div className="text-xs">
                  {viewedCredentialsOrder.custom_credentials ? (
                    renderCredentialsParser(viewedCredentialsOrder.custom_credentials)
                  ) : (
                    <div className="p-4 bg-black/40 border border-purple-500/5 rounded-2xl text-purple-200/50 italic text-center">
                      Processing: Awaiting manual administrator dispatch.
                    </div>
                  )}
                </div>
              </div>

              {/* Physical shipment tracking details */}
              {viewedCredentialsOrder.tracking_number && (
                <div className="p-4 bg-purple-950/15 border border-purple-500/10 rounded-2xl space-y-2">
                  <span className="text-[10px] text-purple-400 uppercase font-bold tracking-widest block font-space">🚚 National dispatch Logistics tracking</span>
                  <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-purple-500/5 font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-purple-200/40 uppercase block">Courier Tracking ID</span>
                      <span className="text-cyan-400 font-bold font-mono text-sm">{viewedCredentialsOrder.tracking_number}</span>
                    </div>
                    <button onClick={() => handleCopy(viewedCredentialsOrder.tracking_number)} className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-purple-400 hover:text-white">
                      <Copy className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              )}

            </div>

            <div className="pt-4 border-t border-cyan-500/10 flex justify-end">
              <Button size="lg" onClick={() => setViewedCredentialsOrder(null)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8">
                Dismiss Credentials Display
              </Button>
            </div>

          </div>
        </div>
      )}

      {/* ——— CHECKOUT MODAL (For instant Buy Now modal) ——— */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedProduct(null)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-purple-500/30 bg-[#0d0422] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar-thin text-left">
            <div className="flex justify-between items-start border-b border-purple-500/15 pb-4">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">Checkout Billing Process</span>
                <h3 className="text-lg font-bold font-space text-white">{selectedProduct.name}</h3>
              </div>
              <button onClick={() => setSelectedProduct(null)} aria-label="Close" className="p-1.5 rounded-lg text-purple-200/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Wallet-only payments across all Marketplace modules — no payment-method
                selector. Every checkout debits the AVS Wallet. */}

            {/* Which checkout form to render is decided by the product's MODULE
                (display_location), so new eSIM / Physical SIM / Gift products
                automatically inherit the correct form. */}
            {(() => { const ck = checkoutKindFor(selectedProduct); return (
            <>
            {ck === "gift" ? (
              <div className="space-y-4 text-xs font-inter">
                {/* Steps tracker */}
                <div className="flex justify-between items-center bg-purple-950/20 p-2.5 rounded-xl border border-purple-500/10 mb-2">
                  <span className={`font-space font-bold uppercase tracking-wider ${giftCheckoutStep === 1 ? "text-cyan-400" : "text-purple-200/40"}`}>
                    1. Delivery Details
                  </span>
                  <ArrowRight className="h-3 w-3 text-purple-200/30" />
                  <span className={`font-space font-bold uppercase tracking-wider ${giftCheckoutStep === 2 ? "text-cyan-400" : "text-purple-200/40"}`}>
                    2. Order Summary
                  </span>
                </div>

                {giftCheckoutStep === 1 ? (
                  <div className="space-y-4 text-left">
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-400 leading-normal flex items-start gap-2">
                      <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        <strong>Please make sure your address is correct and provided exactly in this form. Incorrect delivery information may delay or prevent successful delivery.</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input 
                        label="Sender Name" 
                        value={giftShipping.senderName} 
                        onChange={(e) => setGiftShipping({...giftShipping, senderName: e.target.value})} 
                        placeholder="John Doe" 
                        required 
                      />
                      <Input 
                        label="Receiver Name" 
                        value={giftShipping.receiverName} 
                        onChange={(e) => setGiftShipping({...giftShipping, receiverName: e.target.value})} 
                        placeholder="Jane Smith" 
                        required 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input 
                        label="Country" 
                        value={giftShipping.country} 
                        onChange={(e) => setGiftShipping({...giftShipping, country: e.target.value})} 
                        placeholder="e.g. United Kingdom" 
                        required 
                      />
                      <Input 
                        label="Receiver Phone (Optional)" 
                        value={giftShipping.phone} 
                        onChange={(e) => setGiftShipping({...giftShipping, phone: e.target.value})} 
                        placeholder="+44..." 
                      />
                    </div>

                    <Input 
                      label="Street Address" 
                      value={giftShipping.street} 
                      onChange={(e) => setGiftShipping({...giftShipping, street: e.target.value})} 
                      placeholder="e.g. 10 High Street" 
                      required 
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <Input 
                        label="Apartment" 
                        value={giftShipping.apartment} 
                        onChange={(e) => setGiftShipping({...giftShipping, apartment: e.target.value})} 
                        placeholder="Apt 4B" 
                      />
                      <Input 
                        label="City" 
                        value={giftShipping.city} 
                        onChange={(e) => setGiftShipping({...giftShipping, city: e.target.value})} 
                        placeholder="London" 
                        required 
                      />
                      <Input 
                        label="State / Province" 
                        value={giftShipping.state} 
                        onChange={(e) => setGiftShipping({...giftShipping, state: e.target.value})} 
                        placeholder="England" 
                        required 
                      />
                    </div>

                    <Input 
                      label="ZIP / Postal Code" 
                      value={giftShipping.zipCode} 
                      onChange={(e) => setGiftShipping({...giftShipping, zipCode: e.target.value})} 
                      placeholder="SW1A 1AA" 
                      required 
                    />

                    {/* Quantity Selector */}
                    <Input 
                      label="Purchase Quantity" 
                      type="number" 
                      value={purchaseQty} 
                      onChange={(e) => setPurchaseQty(e.target.value)} 
                      placeholder="1" 
                      min="1" 
                      required 
                    />

                    <Button 
                      onClick={() => {
                        const { senderName, receiverName, country, street, city, state, zipCode } = giftShipping;
                        if (!senderName || !receiverName || !country || !street || !city || !state || !zipCode) {
                          toast("Please fill in all required shipping fields.", "warning");
                          return;
                        }
                        setGiftCheckoutStep(2);
                      }}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 font-bold"
                    >
                      View Order Summary
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 text-left">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-space">Gift Order Summary</h4>
                    
                    <div className="p-4 bg-black/40 border border-purple-500/10 rounded-2xl space-y-3 font-mono text-xs">
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Product:</span>
                        <span className="text-white font-bold">{selectedProduct.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Quantity:</span>
                        <span className="text-white font-bold">x{purchaseQty}</span>
                      </div>
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Unit Price:</span>
                        <span className="text-white font-bold">₦{selectedProduct.price.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Sender:</span>
                        <span className="text-white font-bold">{giftShipping.senderName}</span>
                      </div>
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Receiver:</span>
                        <span className="text-white font-bold">{giftShipping.receiverName}</span>
                      </div>
                      <div className="flex justify-between border-b border-purple-500/5 pb-2">
                        <span className="text-purple-200/40">Delivery Address:</span>
                        <span className="text-white font-bold text-right break-words max-w-[200px]">
                          {giftShipping.street}, {giftShipping.apartment ? `${giftShipping.apartment}, ` : ""}{giftShipping.city}, {giftShipping.state}, {giftShipping.country} (ZIP: {giftShipping.zipCode})
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 font-bold text-sm text-cyan-400">
                        <span>Total Price:</span>
                        <span>₦{(selectedProduct.price * (parseInt(purchaseQty) || 1)).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setGiftCheckoutStep(1)}
                        className="flex-1 border-purple-500/25 text-white hover:bg-white/5 font-bold"
                      >
                        Edit Details
                      </Button>
                      <Button 
                        onClick={handleCheckoutSubmit}
                        isLoading={isCheckingOut}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-cyan-500 font-bold"
                      >
                        Confirm & Pay ⚡
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : ck === "intl" && checkoutStep === 2 ? (
              <OrderSummaryStep
                productName={selectedProduct.name}
                quantity={parseInt(purchaseQty) || 1}
                unitPrice={Math.round(selectedProduct.price)}
                fee={INTERNATIONAL_SHIPPING_NGN}
                feeLabel="International Shipping"
                total={Math.round(selectedProduct.price * (parseInt(purchaseQty) || 1) + INTERNATIONAL_SHIPPING_NGN)}
                details={[
                  { label: "Recipient", value: intlShipping.fullName },
                  { label: "Phone", value: intlShipping.phone },
                  { label: "Email", value: intlShipping.email },
                  { label: "Address", value: `${intlShipping.address}, ${intlShipping.city}, ${intlShipping.state}, ${intlShipping.country}` },
                ]}
                walletBalance={walletBalance}
                isSubmitting={isCheckingOut}
                onBack={() => setCheckoutStep(1)}
                onConfirm={() => handleCheckoutSubmit({ preventDefault: () => {} } as React.FormEvent)}
                confirmLabel="Confirm & Pay ⚡"
              />
            ) : ck === "intl" ? (
              /* ——— INTERNATIONAL SHIPPING CHECKOUT (Requirement 1) ——— */
              <form onSubmit={proceedToSummary} className="space-y-4">
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-300 leading-normal flex items-start gap-2">
                  <Globe className="h-4 w-4 shrink-0 mt-0.5" />
                  <span><strong>🌍 International Shipping:</strong> Please provide complete recipient and delivery details for cross-border dispatch.</span>
                </div>

                {/* Recipient Information (Required) */}
                <div className="space-y-3">
                  <span className="text-[10px] text-purple-300 uppercase font-bold tracking-widest font-space block border-b border-purple-500/10 pb-1">Recipient Information (Required)</span>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Full Name" value={intlShipping.fullName} onChange={(e) => setIntlShipping(prev => ({ ...prev, fullName: e.target.value }))} placeholder="Jane Doe" required />
                    <Input label="Phone Number" value={intlShipping.phone} onChange={(e) => setIntlShipping(prev => ({ ...prev, phone: e.target.value }))} placeholder="+1 555 010 2020" required />
                  </div>
                  <Input label="Email Address" type="email" value={intlShipping.email} onChange={(e) => setIntlShipping(prev => ({ ...prev, email: e.target.value }))} placeholder="jane@email.com" required />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Country" value={intlShipping.country} onChange={(e) => setIntlShipping(prev => ({ ...prev, country: e.target.value }))} placeholder="United States" required />
                    <Input label="State / Province / Region" value={intlShipping.state} onChange={(e) => setIntlShipping(prev => ({ ...prev, state: e.target.value }))} placeholder="California" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="City" value={intlShipping.city} onChange={(e) => setIntlShipping(prev => ({ ...prev, city: e.target.value }))} placeholder="Los Angeles" required />
                    <Input label="Postal / ZIP Code" value={intlShipping.postalCode} onChange={(e) => setIntlShipping(prev => ({ ...prev, postalCode: e.target.value }))} placeholder="90001" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-purple-200/70 block font-space">Full Delivery Address</label>
                    <textarea
                      value={intlShipping.address}
                      onChange={(e) => setIntlShipping(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Street, building, apartment/suite number..."
                      className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none font-inter placeholder-purple-200/20"
                      rows={2}
                      required
                    />
                  </div>
                </div>

                {/* Delivery Contact (Optional) */}
                <div className="space-y-3">
                  <span className="text-[10px] text-purple-300 uppercase font-bold tracking-widest font-space block border-b border-purple-500/10 pb-1">Delivery Contact (Optional)</span>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Contact Name" value={intlShipping.contactName} onChange={(e) => setIntlShipping(prev => ({ ...prev, contactName: e.target.value }))} placeholder="Optional" />
                    <Input label="Contact Phone Number" value={intlShipping.contactPhone} onChange={(e) => setIntlShipping(prev => ({ ...prev, contactPhone: e.target.value }))} placeholder="Optional" />
                  </div>
                  <Input label="Contact Email" type="email" value={intlShipping.contactEmail} onChange={(e) => setIntlShipping(prev => ({ ...prev, contactEmail: e.target.value }))} placeholder="Optional" />
                </div>

                {/* Shipping Information */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-purple-200/70 block font-space">Delivery Instructions / Notes (Optional)</label>
                  <textarea
                    value={intlShipping.notes}
                    onChange={(e) => setIntlShipping(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any special delivery instructions..."
                    className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none font-inter placeholder-purple-200/20"
                    rows={2}
                  />
                </div>

                <Button type="submit" className="w-full">
                  Continue to Order Summary
                </Button>
              </form>
            ) : (ck === "physical-sim" || ck === "physical") && checkoutStep === 2 ? (
              <OrderSummaryStep
                productName={selectedProduct.name}
                quantity={parseInt(purchaseQty) || 1}
                unitPrice={Math.round(selectedProduct.price)}
                fee={getShippingCostNgn(shippingInfo.state)}
                feeLabel={ck === "physical-sim" ? "Local Shipping" : "Shipping"}
                total={computeOrderTotals(selectedProduct, parseInt(purchaseQty) || 1).total}
                details={[
                  { label: "Receiver", value: shippingInfo.fullName },
                  { label: "Phone", value: shippingInfo.phone },
                  { label: "Address", value: `${shippingInfo.address}, ${shippingInfo.city}, ${shippingInfo.state}` },
                  ...(shippingInfo.notes ? [{ label: "Notes", value: shippingInfo.notes }] : []),
                ]}
                walletBalance={walletBalance}
                isSubmitting={isCheckingOut}
                onBack={() => setCheckoutStep(1)}
                onConfirm={() => handleCheckoutSubmit({ preventDefault: () => {} } as React.FormEvent)}
                confirmLabel="Confirm & Pay ⚡"
              />
            ) : ck === "physical-sim" || ck === "physical" ? (
              <form onSubmit={proceedToSummary} className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400 leading-normal flex items-start gap-2">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{ck === "physical-sim"
                    ? <><strong>📶 Physical SIM — Nigeria Delivery:</strong> Your SIM card is shipped to the address below.</>
                    : <><strong>🇳🇬 National Nigeria Shipping Only:</strong> Physical delivery collects details during checkout.</>}</span>
                </div>

                {/* BUG 5: quantity selector for Physical SIM (and general physical). */}
                <Input
                  label="Quantity"
                  type="number"
                  min="1"
                  value={purchaseQty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 1;
                    const capped = !isStocklessModule(selectedProduct) && selectedProduct.stock > 0 ? Math.min(v, selectedProduct.stock) : v;
                    setPurchaseQty(String(Math.max(1, capped)));
                  }}
                  required
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Receiver's Full Name" 
                    value={shippingInfo.fullName} 
                    onChange={(e) => setShippingInfo(prev => ({ ...prev, fullName: e.target.value }))} 
                    placeholder="John Doe" 
                    required 
                  />
                  <Input 
                    label="Call line / Phone Number" 
                    value={shippingInfo.phone} 
                    onChange={(e) => setShippingInfo(prev => ({ ...prev, phone: e.target.value }))} 
                    placeholder="+234 816..." 
                    required 
                  />
                </div>

                <Input 
                  label="Delivery Shipping Address" 
                  value={shippingInfo.address} 
                  onChange={(e) => setShippingInfo(prev => ({ ...prev, address: e.target.value }))} 
                  placeholder="Apartment, Street Name, State State" 
                  required 
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="City" 
                    value={shippingInfo.city} 
                    onChange={(e) => setShippingInfo(prev => ({ ...prev, city: e.target.value }))} 
                    placeholder="Ikeja" 
                    required 
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-purple-200/70 block font-space">Nigeria State</label>
                    <select
                      value={shippingInfo.state}
                      onChange={(e) => setShippingInfo(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none"
                    >
                      {NIGERIA_STATES.map((state) => (
                        <option key={state} value={state} className="bg-neutral-900">{state}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Shipping Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-purple-200/70 block font-space">Order Notes / Delivery Instructions</label>
                  <textarea
                    value={shippingInfo.notes}
                    onChange={(e) => setShippingInfo(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Provide color, extra guidelines or notes for GIGM dispatch rider..."
                    className="w-full bg-black/40 border border-purple-500/20 text-xs text-white p-3 rounded-xl focus:outline-none font-inter placeholder-purple-200/20"
                    rows={2}
                  />
                </div>

                <Button type="submit" className="w-full">
                  Continue to Order Summary
                </Button>
              </form>
            ) : ck === "esim" && checkoutStep === 2 ? (
              <OrderSummaryStep
                productName={selectedProduct.name}
                quantity={parseInt(purchaseQty) || 1}
                unitPrice={Math.round(selectedProduct.price)}
                fee={0}
                feeLabel="Delivery"
                total={Math.round(selectedProduct.price * (parseInt(purchaseQty) || 1))}
                details={[
                  { label: "Name", value: customFieldsValues["First Name"] || "" },
                  { label: "Email", value: customFieldsValues["Email Address"] || "" },
                  { label: "Phone", value: customFieldsValues["Phone Number"] || "" },
                  { label: "Device", value: `${customFieldsValues["Device Brand"] || ""} ${customFieldsValues["Device Model"] || ""}`.trim() },
                  { label: "Country", value: customFieldsValues["Country of Use"] || "" },
                  { label: "Area Code", value: customFieldsValues["Area Code"] || "" },
                ]}
                walletBalance={walletBalance}
                isSubmitting={isCheckingOut}
                onBack={() => setCheckoutStep(1)}
                onConfirm={() => handleCheckoutSubmit({ preventDefault: () => {} } as React.FormEvent)}
                confirmLabel="Confirm & Pay eSIM ⚡"
              />
            ) : ck !== "esim" && checkoutStep === 2 ? (
              <OrderSummaryStep
                productName={selectedProduct.name}
                quantity={parseInt(purchaseQty) || 1}
                unitPrice={Math.round(selectedProduct.price)}
                fee={0}
                feeLabel="Fees"
                total={Math.round(selectedProduct.price * (parseInt(purchaseQty) || 1))}
                details={Object.entries(customFieldsValues).filter(([, v]) => v).map(([k, v]) => ({ label: k, value: String(v) }))}
                walletBalance={walletBalance}
                isSubmitting={isCheckingOut}
                onBack={() => setCheckoutStep(1)}
                onConfirm={() => handleCheckoutSubmit({ preventDefault: () => {} } as React.FormEvent)}
                confirmLabel="Confirm & Pay ⚡"
              />
            ) : (
              <form onSubmit={proceedToSummary} className="space-y-4">
                
                {ck === "esim" && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400 leading-normal flex items-start gap-2.5">
                    <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <span><strong>⚠️ IMPORTANT:</strong> Your device must support eSIM technology and must not be carrier locked. Orders submitted with unsupported devices are not eligible for refunds after activation.</span>
                  </div>
                )}

                {/* BUG 2: eSIM has NO quantity selector. Other digital products keep it
                    (capped at stock when the module tracks stock). */}
                {ck !== "esim" && (
                  <Input 
                    label={`Quantity${selectedProduct.stock > 0 ? ` (${selectedProduct.stock} in stock)` : ""}`}
                    type="number" 
                    value={purchaseQty} 
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      const capped = selectedProduct.stock > 0 ? Math.min(v, selectedProduct.stock) : v;
                      setPurchaseQty(String(Math.max(1, capped)));
                    }}
                    placeholder="1" 
                    min="1" 
                    max={selectedProduct.stock > 0 ? String(selectedProduct.stock) : undefined}
                    required 
                  />
                )}

                {/* eSIM checkout form — auto-applied to EVERY eSIM product (Req 3).
                    Fields: First Name, Email, Phone, Device Brand, Device Model,
                    Country of Use, Area Code. */}
                {ck === "esim" ? (
                  <div className="space-y-4 text-left">
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="First Name" required value={customFieldsValues["First Name"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "First Name": e.target.value})} placeholder="John" />
                      <Input label="Email Address" required type="email" value={customFieldsValues["Email Address"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Email Address": e.target.value})} placeholder="john@example.com" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Phone Number" required value={customFieldsValues["Phone Number"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Phone Number": e.target.value})} placeholder="+234..." />
                      <Input label="Device Brand" required value={customFieldsValues["Device Brand"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Device Brand": e.target.value})} placeholder="Apple, Samsung" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input label="Device Model" required value={customFieldsValues["Device Model"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Device Model": e.target.value})} placeholder="iPhone 15" />
                      <Input label="Country of Use" required value={customFieldsValues["Country of Use"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Country of Use": e.target.value})} placeholder="United Kingdom" />
                      <Input label="Area Code" required value={customFieldsValues["Area Code"] || ""} onChange={(e) => setCustomFieldsValues({...customFieldsValues, "Area Code": e.target.value})} placeholder="+44" />
                    </div>
                  </div>
                ) : (
                  selectedProduct.custom_fields && selectedProduct.custom_fields.split(",").map(field => {
                    const fieldName = field.trim();
                    if (!fieldName) return null;
                    return (
                      <Input 
                        key={fieldName}
                        label={`Enter ${fieldName}`}
                        value={customFieldsValues[fieldName] || ""}
                        onChange={(e) => setCustomFieldsValues({ ...customFieldsValues, [fieldName]: e.target.value })}
                        placeholder={`Provide your ${fieldName.toLowerCase()}...`}
                        required
                      />
                    );
                  })
                )}

                {/* Admin-defined dynamic checkout fields (Item 2) — appear for the product's
                    module with zero code changes. Values persist on the order. */}
                <DynamicCheckoutFields
                  module={moduleForCheckoutKind(ck)}
                  values={customFieldsValues}
                  onChange={setCustomFieldsValues}
                  onFieldsLoaded={setDynamicCheckoutFields}
                />

                <Button type="submit" className="w-full">
                  Continue to Order Summary
                </Button>
              </form>
            )}
            </>
            ); })()}
          </div>
        </div>
      )}

      {/* ——— INQUIRY / REQUEST QUOTE MODAL (Type C!) ——— */}
      {selectedInquiryProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedInquiryProduct(null)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#030d22] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar-thin text-left">
            <div className="flex justify-between items-start border-b border-cyan-500/15 pb-4 text-cyan-400">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider block">Wholesale Quote Request Form</span>
                <h3 className="text-lg font-bold font-space">{selectedInquiryProduct.name}</h3>
              </div>
              <button onClick={() => setSelectedInquiryProduct(null)} className="p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-400 leading-normal flex items-start gap-2">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Submit this inquiry form. The admin sales desk will review your volume demands and message you via WhatsApp or support ticket with custom pricing.</span>
            </div>

            <form onSubmit={handleInquirySubmit} className="space-y-4 text-left text-xs">
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Contact Full Name" 
                  value={inquiryForm.fullName} 
                  required 
                  onChange={(e) => setInquiryForm({ ...inquiryForm, fullName: e.target.value })} 
                  placeholder="John Doe" 
                />
                <Input 
                  label="Contact Email" 
                  type="email" 
                  value={inquiryForm.email} 
                  required 
                  onChange={(e) => setInquiryForm({ ...inquiryForm, email: e.target.value })} 
                  placeholder="john@example.com" 
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input 
                  label="Quantity Demanded" 
                  type="number" 
                  value={inquiryForm.quantity} 
                  required 
                  onChange={(e) => setInquiryForm({ ...inquiryForm, quantity: e.target.value })} 
                  placeholder="100" 
                />
                <Input 
                  label="Country of Origin" 
                  value={inquiryForm.country} 
                  required 
                  onChange={(e) => setInquiryForm({ ...inquiryForm, country: e.target.value })} 
                  placeholder="Nigeria" 
                />
                <Input 
                  label="Callback WhatsApp / Phone" 
                  value={inquiryForm.phone} 
                  required 
                  onChange={(e) => setInquiryForm({ ...inquiryForm, phone: e.target.value })} 
                  placeholder="+234..." 
                />
              </div>

              {/* Dynamic product custom fields creation support */}
              {selectedInquiryProduct.custom_fields && selectedInquiryProduct.custom_fields.split(",").map(field => {
                const fieldName = field.trim();
                if (!fieldName) return null;
                return (
                  <Input 
                    key={fieldName}
                    label={`Inquiry Parameter: ${fieldName}`}
                    value={customFieldsValues[fieldName] || ""}
                    onChange={(e) => setCustomFieldsValues({ ...customFieldsValues, [fieldName]: e.target.value })}
                    placeholder={`Provide specialized demand details for ${fieldName.toLowerCase()}...`}
                    required
                  />
                );
              })}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-200/70 block font-space">Special requests or custom configurations</label>
                <textarea
                  value={inquiryForm.specialRequests}
                  onChange={(e) => setInquiryForm({ ...inquiryForm, specialRequests: e.target.value })}
                  placeholder="Provide precise details of custom demands, desired billing timeline, etc..."
                  className="w-full bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white p-3 focus:outline-none font-inter placeholder-purple-200/20"
                  rows={3}
                />
              </div>

              <Button type="submit" isLoading={isInquirySubmitting} className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:brightness-110">
                Submit Quote Inquiry 📑
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ——— UNIFIED PREMIUM ORDER-SUCCESS CELEBRATION ——— */}
      {orderSuccess && (
        <OrderSuccessScreen
          productName={orderSuccess.productName}
          orderId={orderSuccess.orderId}
          cost={orderSuccess.cost}
          eta={orderSuccess.eta}
          destinationLabel={orderSuccess.destinationLabel}
          credentials={orderSuccess.credentials}
          onCopy={(t) => handleCopy(t)}
          onView={() => { const s = orderSuccess.destinationSection; setOrderSuccess(null); onSelectSection?.(s); }}
          onContinue={() => { setOrderSuccess(null); setActiveTab("catalogue"); }}
        />
      )}
    </div>
  );
}