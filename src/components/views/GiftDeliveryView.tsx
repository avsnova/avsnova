import { useState, useEffect } from "react";
import { 
  Gift, Search, Eye, AlertTriangle, Shield, ArrowRight, X, Star, 
  HelpCircle, RefreshCw, FileText, CheckCircle2, Download, Copy, Phone, MapPin, Mail, User,
  ShoppingCart, Trash2, Plus, Minus
} from "lucide-react";
import { Zap, Wallet } from "lucide-react";
import { Card, Button, Badge, Input } from "../ui/shadcn";
import { useToast } from "../ui/Toast";
import { apiFetch } from "../../utils/api";
import { copyToClipboard } from "../../utils/clipboard";
import { startFlutterwavePayment, loadFlutterwaveSdk } from "../../utils/flutterwave";

interface MarketplaceProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  rating: number;
  sales: number;
  icon: string;
  description: string;
  type: "physical" | "digital";
  delivery_type: "instant" | "manual" | "inquiry";
  stock: number;
  file_url?: string;
  custom_fields?: string;
  setup_guide?: string;
  featured?: number | boolean;
  popular?: number | boolean;
  newest?: number | boolean;
  created_at?: string;
  sku?: string;
  delivery_countries?: string;
  delivery_estimate?: string;
  multiple_images?: string;
}

interface GiftOrder {
  id: string;
  product_id: string;
  category: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  target_link: string; // Stored serialized shipping JSON
  created_at: string;
  updated_at: string;
  tracking_number?: string;
}

interface GiftCartItem {
  product: MarketplaceProduct;
  quantity: number;
}

interface GiftDeliveryViewProps {
  walletBalance: number;
  orders: any[];
  onRefreshLedger?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system" | "service") => void;
}

const GIFT_SUBCATEGORIES = [
  { id: "all", label: "All Gifts", icon: "🎁" },
  { id: "Food", label: "Food 🍽️", icon: "🍽️" },
  { id: "Custom Photo Gifts", label: "Custom Photo Gifts 🖼️", icon: "🎨" },
  { id: "Clothes", label: "Clothes 👕", icon: "👕" },
  { id: "Florist", label: "Florist 💐", icon: "💐" },
  { id: "Accessories", label: "Accessories 💍", icon: "💍" },
  { id: "Books & Documents", label: "Books & Documents 📚", icon: "📚" }
];

// Reusable dedicated International Gift Delivery form (Sender / Recipient / Delivery details).
// Shared by both the cart checkout and the instant Buy-Now checkout so validation & fields stay
// perfectly in sync. All required fields are marked; optional extras cover greeting card,
// anonymous & surprise delivery per spec.
function DeliveryFormFields({ form, set }: { form: any; set: (patch: any) => void }) {
  const inputCls = "w-full bg-black/40 border border-purple-500/20 text-xs text-white px-3 py-2.5 rounded-xl focus:outline-none";
  return (
    <div className="space-y-4 text-xs">
      {/* Sender Information */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-[10px] font-space">
          <User className="h-3.5 w-3.5" /> Sender Information
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sender's Full Name" value={form.senderName} onChange={(e) => set({ senderName: e.target.value })} placeholder="Your Name" required />
          <Input label="Sender's Email Address" type="email" value={form.senderEmail} onChange={(e) => set({ senderEmail: e.target.value })} placeholder="you@email.com" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sender's Phone Number (Optional)" value={form.senderPhone} onChange={(e) => set({ senderPhone: e.target.value })} placeholder="+234..." />
          <Input label="Sender's Country" value={form.senderCountry} onChange={(e) => set({ senderCountry: e.target.value })} placeholder="e.g. Nigeria" required />
        </div>
      </div>

      {/* Recipient Information */}
      <div className="space-y-3 pt-2 border-t border-purple-500/10">
        <div className="flex items-center gap-2 text-pink-400 font-bold uppercase tracking-wider text-[10px] font-space">
          <MapPin className="h-3.5 w-3.5" /> Recipient Information
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Receiver's Full Name" value={form.receiverName} onChange={(e) => set({ receiverName: e.target.value })} placeholder="Receiver's Name" required />
          <Input label="Country" value={form.country} onChange={(e) => set({ country: e.target.value })} placeholder="e.g. United Kingdom" required />
        </div>
        <Input label="Full Delivery Address" value={form.street} onChange={(e) => set({ street: e.target.value })} placeholder="e.g. 10 High Street" required />
        <div className="grid grid-cols-3 gap-2">
          <Input label="Apartment / Building" value={form.apartment} onChange={(e) => set({ apartment: e.target.value })} placeholder="Apt 4B" />
          <Input label="City" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="London" required />
          <Input label="State / Province" value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="England" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="ZIP / Postal Code (Optional)" value={form.zipCode} onChange={(e) => set({ zipCode: e.target.value })} placeholder="SW1A 1AA" />
          <Input label="Receiver's Phone Number" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+44..." required />
        </div>
      </div>

      {/* Delivery Details */}
      <div className="space-y-3 pt-2 border-t border-purple-500/10">
        <div className="flex items-center gap-2 text-purple-300 font-bold uppercase tracking-wider text-[10px] font-space">
          <Gift className="h-3.5 w-3.5" /> Delivery Details
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-purple-200/70 block font-space">Preferred Delivery Date</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => set({ deliveryDate: e.target.value })} className={inputCls} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-purple-200/70 block font-space">Delivery Instructions</label>
          <textarea value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={2} placeholder="e.g. Leave with the front desk / call on arrival" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-purple-200/70 block font-space">Gift Message</label>
          <textarea value={form.giftMessage} onChange={(e) => set({ giftMessage: e.target.value })} rows={2} placeholder="Write a heartfelt message for the recipient..." className={inputCls} />
        </div>
        <div className="grid grid-cols-1 gap-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-purple-200/80">
            <input type="checkbox" checked={form.greetingCard} onChange={(e) => set({ greetingCard: e.target.checked })} className="accent-pink-500 h-4 w-4" />
            <span>Include a printed Greeting Card (optional)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-purple-200/80">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} className="accent-pink-500 h-4 w-4" />
            <span>Anonymous Delivery — hide my name from the recipient</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-purple-200/80">
            <input type="checkbox" checked={form.surprise} onChange={(e) => set({ surprise: e.target.checked })} className="accent-pink-500 h-4 w-4" />
            <span>Surprise Delivery — do not contact recipient before arrival</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default function GiftDeliveryView({ 
  walletBalance, 
  orders, 
  onRefreshLedger, 
  onAddNotification 
}: GiftDeliveryViewProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [giftOrders, setGiftOrders] = useState<GiftOrder[]>([]);
  const [activeSubcategory, setActiveSubcategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "popular" | "best_selling">("newest");
  const [isLoading, setIsLoading] = useState(true);

  // Stateful Gifting Shopping Cart (Requirement 23 & 24)
  const [cart, setCart] = useState<GiftCartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOutCart, setIsCheckingOutCart] = useState(false);

  // Selected Product for Instant Buy Now Modal
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1); // 1: Delivery Details, 2: Order Summary
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [giftPayMethod, setGiftPayMethod] = useState<"wallet" | "flutterwave">("wallet");
  const [flwEnabled, setFlwEnabled] = useState(false);

  // Dedicated International Gift Delivery form — full sender/recipient/delivery breakdown.
  const blankShippingForm = {
    // Sender information
    senderName: "",
    senderEmail: "",
    senderPhone: "",
    senderCountry: "",
    // Recipient information
    receiverName: "",
    country: "",
    street: "",
    apartment: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    // Delivery details
    deliveryDate: "",
    deliveryTime: "",
    instructions: "",
    giftMessage: "",
    greetingCard: false,
    anonymous: false,
    surprise: false,
    notes: ""
  };
  const [shippingForm, setShippingForm] = useState({ ...blankShippingForm });

  // Receipt & Details Popups
  const [viewedReceiptOrder, setViewedReceiptOrder] = useState<GiftOrder | null>(null);

  // Load cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem("avs_gift_cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {}
    }
  }, []);

  const saveCartToStorage = (updatedCart: GiftCartItem[]) => {
    setCart(updatedCart);
    localStorage.setItem("avs_gift_cart", JSON.stringify(updatedCart));
  };

  const fetchGiftCatalog = async () => {
    try {
      setIsLoading(true);
      const prodData = await apiFetch("/api/marketplace/gifts");
      // Filter strictly active ones
      const giftItems = (prodData || []).filter((p: any) => p.status !== 0);
      setProducts(giftItems);

      const ordData = await apiFetch("/api/orders");
      // Filter strictly for gift orders
      const userGiftOrders = (ordData || []).filter(
        (o: any) => o.category === "Marketplace" && o.product_id?.startsWith("gift")
      );
      setGiftOrders(userGiftOrders);
    } catch (e) {
      console.error("Failed to load gifts catalog:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGiftCatalog();
  }, [orders]);

  // International Gifting is Wallet-payment only — no gateway selector (flwEnabled stays false).

  // Handle locking background scroll (Requirement 13)
  useEffect(() => {
    const isModalOpen = !!selectedProduct || !!viewedReceiptOrder || isCartOpen;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedProduct, viewedReceiptOrder, isCartOpen]);

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
  };

  // --- CART OPERATIONS ---
  const handleAddToCart = (product: MarketplaceProduct) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    let updatedCart = [...cart];
    
    if (existingIndex > -1) {
      updatedCart[existingIndex].quantity += 1;
    } else {
      updatedCart.push({
        product,
        quantity: 1
      });
    }

    saveCartToStorage(updatedCart);
    toast(`"${product.name}" added to your Gift Cart 🛒`, "success", { silent: true });
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(index);
      return;
    }
    let updatedCart = [...cart];
    updatedCart[index].quantity = newQty;
    saveCartToStorage(updatedCart);
  };

  const handleRemoveCartItem = (index: number) => {
    let updatedCart = [...cart];
    updatedCart.splice(index, 1);
    saveCartToStorage(updatedCart);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  };

  // Validate the dedicated delivery form. Returns an error string or null when valid.
  const validateShipping = (): string | null => {
    const f = shippingForm;
    const required: [string, string][] = [
      [f.senderName, "Sender's Full Name"],
      [f.senderEmail, "Sender's Email Address"],
      // Sender's Phone Number is optional.
      [f.senderCountry, "Sender's Country"],
      [f.receiverName, "Receiver's Full Name"],
      [f.country, "Recipient Country"],
      [f.street, "Full Delivery Address"],
      // Apartment / Building is optional.
      [f.city, "City"],
      [f.state, "State / Province"],
      [f.phone, "Receiver's Phone Number"],
      [f.deliveryDate, "Preferred Delivery Date"],
    ];
    for (const [val, label] of required) {
      if (!String(val || "").trim()) return `Please provide: ${label}`;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.senderEmail.trim())) return "Please provide a valid sender email address.";
    return null;
  };

  const handleCartCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const vErr = validateShipping();
    if (vErr) { toast(vErr, "warning"); return; }

    const totalCost = getCartTotal();

    if (walletBalance < totalCost) {
      toast(`Insufficient balance — needs ₦${totalCost.toLocaleString()}, you have ₦${walletBalance.toLocaleString()}.`, "error", { action: { label: "Fund wallet", onClick: () => { window.location.hash = "Wallet"; } } });
      return;
    }

    setIsCheckingOutCart(true);

    try {
      let successCount = 0;

      for (const item of cart) {
        const itemPrice = Math.round(item.product.price * item.quantity);
        const res = await apiFetch("/api/marketplace/buy", {
          method: "POST",
          body: JSON.stringify({
            productId: item.product.id,
            shippingInfo: {
              ...shippingForm,
              productName: item.product.name,
              quantity: item.quantity,
              isGift: true
            },
            shippingCost: 0,
            quantity: item.quantity
          })
        });

        if (res && res.success) {
          successCount++;
        }
      }

      if (successCount === cart.length) {
        if (onAddNotification) {
          onAddNotification("Gifts Order Dispatched", `Successfully sent ${successCount} gift item(s) to ${shippingForm.receiverName}.`, "payment");
        }
        toast(`🎉 All ${successCount} gift(s) paid & scheduled for delivery!`, "success", { big: true });
        saveCartToStorage([]); // Clear cart
        setIsCartOpen(false);
        setShippingForm({ ...blankShippingForm });
        if (onRefreshLedger) onRefreshLedger();
        fetchGiftCatalog();
      } else if (successCount > 0) {
        toast(`Partially complete: ${successCount}/${cart.length} purchased. Remaining kept in cart.`, "warning");
        const remainingCart = cart.slice(successCount);
        saveCartToStorage(remainingCart);
        if (onRefreshLedger) onRefreshLedger();
        fetchGiftCatalog();
      } else {
        toast("Gift checkout failed. Check wallet balance and recipient country.", "error");
      }

    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setIsCheckingOutCart(false);
    }
  };

  // --- INSTANT BUY NOW SINGLE CHECKOUT ---
  const handleInstantCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const vErr = validateShipping();
    if (vErr) { toast(vErr, "warning"); return; }

    const qty = parseInt(purchaseQty) || 1;
    const totalPrice = Math.round(selectedProduct.price * qty);

    const giftShippingPayload = {
      ...shippingForm,
      productName: selectedProduct.name,
      quantity: qty,
      isGift: true
    };

    // ——— Flutterwave path: gift order created server-side after verification ———
    if (giftPayMethod === "flutterwave") {
      setIsCheckingOut(true);
      try {
        const result = await startFlutterwavePayment({
          purpose: "gift",
          productId: selectedProduct.id,
          quantity: qty,
          shippingInfo: giftShippingPayload,
          title: "International Gift Delivery",
          description: `${selectedProduct.name} (x${qty})`,
        });
        if (result.success) {
          if (onAddNotification) onAddNotification("Gift Order Completed", `Successfully ordered "${selectedProduct.name}" (x${qty}) for ${shippingForm.receiverName} via Flutterwave.`, "payment");
          toast("🎉 Payment verified — your gift order is confirmed!", "success", { big: true });
          setSelectedProduct(null);
          setCheckoutStep(1);
          setPurchaseQty("1");
          setGiftPayMethod("wallet");
          setShippingForm({ ...blankShippingForm });
          if (onRefreshLedger) onRefreshLedger();
          fetchGiftCatalog();
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

    if (walletBalance < totalPrice) {
      toast(`Insufficient balance — needs ₦${totalPrice.toLocaleString()}, you have ₦${walletBalance.toLocaleString()}.`, "error", { action: { label: "Fund wallet", onClick: () => { window.location.hash = "Wallet"; } } });
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await apiFetch("/api/marketplace/buy", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProduct.id,
          shippingInfo: {
            ...shippingForm,
            productName: selectedProduct.name,
            quantity: qty,
            isGift: true
          },
          shippingCost: 0,
          quantity: qty
        })
      });

      if (res && res.success) {
        if (onAddNotification) {
          onAddNotification("Gift Order Completed", `Successfully ordered "${selectedProduct.name}" (x${qty}) for delivery to ${shippingForm.receiverName}.`, "payment");
        }
        toast(res.message || "🎉 Gift order submitted successfully!", "success", { big: true });
        setSelectedProduct(null);
        setCheckoutStep(1);
        setPurchaseQty("1");
        setShippingForm({ ...blankShippingForm });
        if (onRefreshLedger) onRefreshLedger();
        fetchGiftCatalog();
      } else {
        throw new Error(res.error || "Fulfillment check failed.");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSub = activeSubcategory === "all" || p.subcategory === activeSubcategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSub && matchesSearch;
  }).sort((a: any, b: any) => {
    switch (sortBy) {
      case "price_asc": return a.price - b.price;
      case "price_desc": return b.price - a.price;
      case "popular": return (b.popular ? 1 : 0) - (a.popular ? 1 : 0) || (b.sales || 0) - (a.sales || 0);
      case "best_selling": return (b.sales || 0) - (a.sales || 0);
      case "newest":
      default:
        // Newest first: created_at desc when present, otherwise keep server order.
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    }
  });

  // Featured / recommended rails (Requirement 7) — derived from admin flags.
  const featuredGifts = products.filter((p: any) => p.featured).slice(0, 6);

  return (
    <div className="space-y-8 font-inter text-left relative">
      
      {/* Ambient backgrounds */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Page Header */}
      <div className="pb-4 border-b border-purple-500/10 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
            <Gift className="h-4 w-4 animate-pulse-slow" />
            <span>AVS Global Gifting Gateway</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-space text-white">International Gift Delivery</h2>
          <p className="text-xs sm:text-sm text-purple-200/60 mt-1 max-w-2xl leading-relaxed">
            Surprise friends, family, and associates globally. Send organic food packs, custom photo frames, tailored hoodies, premium flower bouquets, and books delivered securely straight to their doorsteps.
          </p>
        </div>

        {/* Dynamic Gift Cart Floating Button */}
        <button 
          onClick={() => setIsCartOpen(true)}
          className="relative px-5 py-2.5 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-600/20 to-cyan-500/10 text-xs font-bold text-cyan-400 hover:text-white hover:border-cyan-400 transition-all flex items-center gap-2 cursor-pointer font-space shadow-md"
        >
          <ShoppingCart className="h-4.5 w-4.5" />
          <span>Gift Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</span>
          {cart.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-mono font-bold text-[9px] w-5 h-5 rounded-full flex items-center justify-center border border-[#0c041d] animate-bounce">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Primary Gifting navigation Tabs */}
      <div className="flex flex-wrap gap-2.5 relative z-10">
        {GIFT_SUBCATEGORIES.map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubcategory(sub.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${activeSubcategory === sub.id ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/10" : "bg-black/40 border-purple-500/15 text-purple-200/50 hover:text-white"}`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Main UI layout columns: Gifting Products Feed & Gifting Orders Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative z-10">
        
        {/* Left Column: Gifts Feed */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-purple-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search florist packages, gourmet food, canvas photo gifts..."
                className="w-full bg-black/40 border border-purple-500/20 text-xs sm:text-sm text-white pl-10 pr-4 py-3.5 rounded-xl focus:outline-none focus:border-purple-500 placeholder-purple-200/30"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black/40 border border-purple-500/20 text-xs sm:text-sm text-white px-3 py-3.5 rounded-xl focus:outline-none focus:border-purple-500 cursor-pointer"
              aria-label="Sort gifts"
            >
              <option value="newest">Sort: Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="popular">Most Popular</option>
              <option value="best_selling">Best Selling</option>
            </select>
          </div>

          {/* Featured & Recommended rail (Requirement 7) */}
          {featuredGifts.length > 0 && activeSubcategory === "all" && !searchQuery && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider font-space">
                <Star className="h-4 w-4 fill-amber-300" /> <span>Featured &amp; Recommended Gifts</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar-thin">
                {featuredGifts.map((prod: any) => (
                  <button
                    key={`feat_${prod.id}`}
                    onClick={() => { setSelectedProduct(prod); setCheckoutStep(1); setPurchaseQty("1"); }}
                    className="shrink-0 w-40 text-left p-3 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-purple-600/5 hover:border-amber-400/40 transition-all cursor-pointer"
                  >
                    <div className="text-2xl mb-1.5">{prod.icon}</div>
                    <div className="text-xs font-bold text-white font-space line-clamp-1">{prod.name}</div>
                    <div className="text-[10px] text-purple-200/50 mb-1">{prod.subcategory}</div>
                    <div className="text-xs font-mono font-extrabold text-amber-300">₦{prod.price.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-20 space-y-3">
              <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mx-auto" />
              <p className="text-xs text-purple-200/50">Fetching catalog details...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-purple-200/30 italic text-sm border border-purple-500/10 rounded-2xl bg-black/20">
              No matching gift items listed in this category.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-inter">
              {filteredProducts.map(prod => (
                <Card key={prod.id} hoverable className="p-4 space-y-4 flex flex-col justify-between border-purple-500/10 bg-gradient-to-br from-[#100727]/60 to-[#080213]/90 relative overflow-hidden group text-left">
                  <div className="absolute top-0 right-0 bg-purple-600/10 text-purple-300 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-bl-lg border-l border-b border-purple-500/10">
                    {prod.subcategory}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-3xl p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">{prod.icon}</span>
                      <div>
                        <h4 className="font-extrabold text-white text-sm font-space group-hover:text-purple-300 transition-colors">{prod.name}</h4>
                        {/* International Gifting is stockless — always available, unlimited orders. */}
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">Available Worldwide</span>
                      </div>
                    </div>
                    <p className="text-xs text-purple-200/60 leading-relaxed min-h-[50px]">{prod.description}</p>
                    {(prod as any).delivery_estimate && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-cyan-300/80 font-medium">
                        <MapPin className="h-3 w-3" /> <span>{(prod as any).delivery_estimate}</span>
                      </div>
                    )}
                    {prod.featured ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        <Star className="h-2.5 w-2.5 fill-amber-300" /> Featured
                      </span>
                    ) : null}
                  </div>

                  <div className="pt-3 border-t border-purple-500/10 flex items-center justify-between">
                    <div>
                      <span className="text-purple-200/40 block text-[9px] font-bold font-space uppercase">Unit price</span>
                      <span className="text-white font-extrabold font-mono text-sm sm:text-base">₦{prod.price.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleAddToCart(prod)}
                        className="border-purple-500/20 text-white font-bold text-xs"
                      >
                        <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                        <span>Add Cart</span>
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedProduct(prod);
                          setCheckoutStep(1);
                          setPurchaseQty("1");
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-[11px] font-bold font-space"
                      >
                        Buy Now ⚡
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: User Gift Delivery Orders Log */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="p-5 border-purple-500/15 bg-black/40 space-y-4">
            <div className="border-b border-purple-500/10 pb-3">
              <h3 className="text-xs sm:text-sm font-bold text-white font-space uppercase tracking-wider block">Gifts Delivery History</h3>
              <p className="text-[11px] text-purple-200/40 mt-0.5">Track your active global gift deliveries</p>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar-thin text-xs">
              {giftOrders.length === 0 ? (
                <div className="py-12 text-center text-purple-200/20 italic font-inter">No international gift deliveries logged.</div>
              ) : (
                giftOrders.map(o => (
                  <div key={o.id} className="p-3.5 rounded-2xl bg-black/30 border border-purple-500/10 hover:border-purple-500/25 transition-all space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-mono text-[10px] font-bold text-cyan-400">Order Ref: {o.id}</div>
                      <Badge variant={o.status === "completed" || o.status === "delivered" ? "success" : o.status === "processing" ? "info" : "warning"}>
                        {o.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">{o.name}</h4>
                      <span className="text-[10px] text-purple-200/40 font-mono block mt-0.5">Qty: {o.quantity || 1} · Total: ₦{o.price.toLocaleString()}</span>
                    </div>

                    <div className="pt-2 border-t border-purple-500/5 flex justify-between items-center">
                      <span className="text-[9px] text-purple-200/30 font-mono">{new Date(o.created_at).toLocaleDateString()}</span>
                      <button
                        onClick={() => setViewedReceiptOrder(o)}
                        className="text-[10px] text-cyan-400 font-bold hover:underline bg-transparent border-none p-0 cursor-pointer flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3" />
                        <span>View Receipt</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

      </div>

      {/* ——— SHOPPING CART DRAWER / MODAL ——— */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-lg h-full border-l border-purple-500/30 bg-[#0b031d] p-6 shadow-2xl flex flex-col justify-between overflow-y-auto custom-scrollbar-thin text-left">
            
            {/* Cart Header */}
            <div>
              <div className="flex justify-between items-center border-b border-purple-500/15 pb-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-lg font-bold font-space text-white">Your Gift Delivery Cart</h3>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-1 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="py-24 text-center text-purple-200/30 text-sm italic font-inter space-y-4">
                  <Gift className="h-12 w-12 mx-auto text-purple-500/20" />
                  <p>Your gift delivery cart is completely empty.</p>
                  <Button size="sm" onClick={() => setIsCartOpen(false)}>Browse Gift Catalog</Button>
                </div>
              ) : (
                <div className="space-y-6 mt-6">
                  {cart.map((item, index) => (
                    <div key={`${item.product.id}-${index}`} className="p-4 rounded-2xl border border-purple-500/10 bg-black/30 space-y-4 text-xs">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 shrink-0">
                            {item.product.icon || "🎁"}
                          </span>
                          <div>
                            <span className="text-[9px] text-purple-200/40 block uppercase font-bold tracking-wider">{item.product.subcategory}</span>
                            <h4 className="font-bold text-white text-sm font-space">{item.product.name}</h4>
                            <span className="text-xs text-amber-300 font-bold font-mono">₦{item.product.price.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Remove item */}
                        <button 
                          onClick={() => handleRemoveCartItem(index)}
                          className="p-1.5 rounded-lg text-purple-200/40 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>

                      {/* Quantity Incrementor */}
                      <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-xl border border-purple-500/5">
                        <span className="text-xs text-purple-200/60 font-medium">Quantity:</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleUpdateCartQty(index, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-purple-500/10 text-white font-bold hover:bg-purple-500/20 flex items-center justify-center cursor-pointer text-xs"
                          >
                            -
                          </button>
                          <span className="text-xs font-mono font-bold text-white w-8 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => handleUpdateCartQty(index, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-purple-500/10 text-white font-bold hover:bg-purple-500/20 flex items-center justify-center cursor-pointer text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Checkout Bottom Form */}
            {cart.length > 0 && (
              <form onSubmit={handleCartCheckoutSubmit} className="pt-6 border-t border-purple-500/15 space-y-4 bg-[#0b031d] sticky bottom-0 z-10 text-xs">
                
                <div className="p-3 bg-cyan-500/5 border border-cyan-500/15 rounded-xl text-cyan-400 leading-normal flex items-start gap-2">
                  <Shield className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>Please make sure your address is correct and provided exactly in this form. Incorrect delivery information may delay or prevent successful delivery.</strong>
                  </span>
                </div>

                <DeliveryFormFields form={shippingForm} set={(patch) => setShippingForm({ ...shippingForm, ...patch })} />

                {/* Bill Breakdown */}
                <div className="p-4 bg-black/40 border border-purple-500/15 rounded-2xl text-xs space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-purple-200/40">Subtotal:</span>
                    <span className="text-white">₦{getCartTotal().toLocaleString()}</span>
                  </div>
                  <div className="border-t border-purple-500/10 pt-2 flex justify-between font-bold text-sm">
                    <span className="text-cyan-400 font-space uppercase">Unified Bill:</span>
                    <span className="text-white">₦{getCartTotal().toLocaleString()}</span>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  isLoading={isCheckingOutCart}
                  className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:brightness-110 font-bold font-space uppercase text-xs py-3"
                >
                  Pay & Authorize Cart Checkout
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ——— INSTANT BUY NOW SINGLE CHECKOUT MODAL ——— */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedProduct(null)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-purple-500/30 bg-[#0b031c] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar-thin text-left font-inter">
            
            <div className="flex justify-between items-start border-b border-purple-500/15 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">{selectedProduct.icon}</span>
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">Special Gift Order</span>
                  <h3 className="text-lg font-bold font-space text-white">{selectedProduct.name}</h3>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-1 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Stepper tracker */}
            <div className="flex justify-between items-center bg-purple-950/20 p-2.5 rounded-xl border border-purple-500/10 text-xs">
              <span className={`font-space font-bold uppercase tracking-wider ${checkoutStep === 1 ? "text-cyan-400 animate-pulse" : "text-purple-200/40"}`}>
                1. Delivery details
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-purple-200/30" />
              <span className={`font-space font-bold uppercase tracking-wider ${checkoutStep === 2 ? "text-cyan-400 animate-pulse" : "text-purple-200/40"}`}>
                2. Gifting Summary
              </span>
            </div>

            {checkoutStep === 1 ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const vErr = validateShipping();
                  if (vErr) { toast(vErr, "warning"); return; }
                  setCheckoutStep(2);
                }} 
                className="space-y-4 text-xs"
              >
                <div className="p-3.5 bg-cyan-500/5 border border-cyan-500/15 rounded-xl text-cyan-400 leading-normal flex items-start gap-2.5">
                  <Shield className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium leading-relaxed">
                    <strong>Please make sure your address is correct and provided exactly in this form. Incorrect delivery information may delay or prevent successful delivery.</strong>
                  </span>
                </div>

                <DeliveryFormFields form={shippingForm} set={(patch) => setShippingForm({ ...shippingForm, ...patch })} />

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

                <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 font-bold font-space uppercase">
                  Verify & Generate Order Summary
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-left">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-space">Gifting order verification card</h4>
                
                <div className="p-4 bg-black/40 border border-purple-500/10 rounded-2xl space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Product:</span>
                    <span className="text-white font-bold">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Quantity:</span>
                    <span className="text-white font-bold">x{purchaseQty}</span>
                  </div>
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Unit Price:</span>
                    <span className="text-white font-bold">₦{selectedProduct.price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Sender:</span>
                    <span className="text-white font-bold">{shippingForm.senderName}</span>
                  </div>
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Receiver:</span>
                    <span className="text-white font-bold">{shippingForm.receiverName}</span>
                  </div>
                  <div className="flex justify-between border-b border-purple-500/5 pb-1.5">
                    <span className="text-purple-200/40">Delivery Address:</span>
                    <span className="text-white font-bold text-right break-words max-w-[200px]">
                      {shippingForm.street}, {shippingForm.apartment ? `${shippingForm.apartment}, ` : ""}{shippingForm.city}, {shippingForm.state}, {shippingForm.country} (ZIP: {shippingForm.zipCode})
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 font-bold text-sm text-cyan-400">
                    <span>Total Price:</span>
                    <span>₦{(selectedProduct.price * (parseInt(purchaseQty) || 1)).toLocaleString()}</span>
                  </div>
                </div>

                {/* Payment method selector (shown when Flutterwave is enabled) */}
                {/* Wallet-only payment — no payment-method selector. */}

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setCheckoutStep(1)}
                    className="flex-1 border-purple-500/25 text-white hover:bg-white/5 font-bold"
                  >
                    Edit Details
                  </Button>
                  <Button 
                    onClick={handleInstantCheckoutSubmit}
                    isLoading={isCheckingOut}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-cyan-500 font-bold"
                  >
                    Confirm & Pay ⚡
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ——— DETAILED PRINTABLE RECEIPT POPUP MODAL ——— */}
      {viewedReceiptOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewedReceiptOrder(null)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#080318] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar-thin text-left font-inter">
            
            <div className="flex justify-between items-start border-b border-cyan-500/15 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-3xl p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">🧾</span>
                <div>
                  <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider block">Official Receipt Log</span>
                  <h3 className="text-lg font-bold font-space text-white">AVS-GIFT-{viewedReceiptOrder.id}</h3>
                </div>
              </div>
              <button onClick={() => setViewedReceiptOrder(null)} className="p-1.5 rounded-lg text-purple-200/40 hover:text-white transition-colors cursor-pointer">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div id="gift-receipt-pane" className="space-y-4 text-xs sm:text-sm font-mono p-4 bg-black/40 border border-purple-500/10 rounded-2xl leading-normal text-purple-200">
              <div className="text-center font-bold text-white border-b border-purple-500/10 pb-3 font-space uppercase text-sm">
                AUREVASHOP GIFT TRANSACTION
              </div>
              
              <div className="flex justify-between"><span className="text-purple-200/40">Order Ref ID:</span><span className="text-white font-bold">{viewedReceiptOrder.id}</span></div>
              <div className="flex justify-between"><span className="text-purple-200/40">Fulfillment Status:</span><span className="text-cyan-400 font-bold uppercase">{viewedReceiptOrder.status}</span></div>
              <div className="flex justify-between"><span className="text-purple-200/40">Payment Status:</span><span className="text-emerald-400 font-bold uppercase">PAID (AVS Wallet)</span></div>
              <div className="flex justify-between"><span className="text-purple-200/40">Timestamp:</span><span className="text-white font-bold">{new Date(viewedReceiptOrder.created_at).toLocaleString()}</span></div>

              <div className="border-t border-purple-500/5 pt-3 mt-3">
                <span className="text-white font-bold block pb-1 border-b border-purple-500/5 mb-1.5">ITEMIZATION</span>
                <div className="flex justify-between">
                  <span className="text-purple-100">{viewedReceiptOrder.name}</span>
                  <span className="text-white">x{viewedReceiptOrder.quantity || 1}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-400 mt-1.5 text-sm">
                  <span>Grand Total:</span>
                  <span>₦{viewedReceiptOrder.price.toLocaleString()}</span>
                </div>
              </div>

              {/* Shipping info */}
              {(() => {
                let sDetails: any = {};
                try {
                  if (viewedReceiptOrder.target_link && viewedReceiptOrder.target_link.startsWith("{")) {
                    sDetails = JSON.parse(viewedReceiptOrder.target_link);
                  }
                } catch (e) {}
                
                if (!sDetails.street) return null;
                return (
                  <div className="border-t border-purple-500/5 pt-3 mt-3 text-left">
                    <span className="text-white font-bold block pb-1 border-b border-purple-500/5 mb-1.5 font-space">SHIPPING LOGISTICS DEPLOYMENT</span>
                    <div className="space-y-1 text-xs">
                      <div>Sender Name: <span className="text-white font-bold">{sDetails.senderName}</span></div>
                      <div>Recipient Name: <span className="text-white font-bold">{sDetails.receiverName}</span></div>
                      <div>Location Destination: <span className="text-white">{sDetails.street}, {sDetails.apartment ? `${sDetails.apartment}, ` : ""}{sDetails.city}, {sDetails.state}, {sDetails.country} (ZIP: {sDetails.zipCode})</span></div>
                      {sDetails.phone && <div>Receiver Phone: <span className="text-white">{sDetails.phone}</span></div>}
                      {viewedReceiptOrder.tracking_number && <div>Courier Tracking ID: <span className="text-cyan-400 font-bold font-mono">{viewedReceiptOrder.tracking_number}</span></div>}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-4 border-t border-purple-500/10 flex justify-between gap-3 text-xs">
              <Button 
                variant="outline" 
                onClick={() => window.print()}
                className="flex-1 border-purple-500/20 text-white font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Print / Download Receipt</span>
              </Button>
              <Button onClick={() => setViewedReceiptOrder(null)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold flex-1">
                Dismiss Panel
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}