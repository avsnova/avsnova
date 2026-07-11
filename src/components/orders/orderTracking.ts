// ————————————————————————————————————————————————————————————————
//  Aurevashop — Unified Order Tracking (shared across Marketplace, Gift, SMM)
// ————————————————————————————————————————————————————————————————
// One consistent status model + timeline used everywhere so every product type
// (digital products, accounts, gift cards, subscriptions, SMM, numbers…) follows
// the same premium experience. UI-only: derives rich states from existing order
// fields — no backend/API/DB changes.

export type OrderTone = "info" | "warning" | "success" | "danger" | "purple";

export interface OrderStatusMeta {
  key: string;          // canonical status key
  label: string;        // human label
  tone: OrderTone;      // badge/color tone
  step: number;         // position in the timeline (0 = stopped)
  description: string;  // short friendly description
  icon: string;         // lucide icon name (resolved by the badge component)
}

// The full premium timeline (mirrors the SMM panel's staged progression).
export const ORDER_TIMELINE: { key: string; label: string; description: string }[] = [
  { key: "placed", label: "Order Placed", description: "We received your order." },
  { key: "paid", label: "Payment Confirmed", description: "Your payment was confirmed." },
  { key: "waiting", label: "Waiting for Supplier", description: "Securing your item from our supplier." },
  { key: "processing", label: "Processing", description: "Preparing your order." },
  { key: "review", label: "Manual Review", description: "A specialist is verifying your order." },
  { key: "delivery", label: "Preparing Delivery", description: "Packaging your delivery." },
  { key: "delivered", label: "Delivered", description: "Your order has been delivered." },
];

// Map many raw backend statuses to a canonical step + presentation.
export function orderStatusMeta(rawStatus: string, hasCredentials = false): OrderStatusMeta {
  const s = (rawStatus || "").toLowerCase().trim();

  // Terminal negative states
  if (s === "cancelled" || s === "canceled")
    return { key: "cancelled", label: "Cancelled", tone: "danger", step: 0, description: "This order was cancelled.", icon: "Ban" };
  if (s === "refunded")
    return { key: "refunded", label: "Refunded", tone: "purple", step: 0, description: "This order was refunded to your wallet.", icon: "RotateCcw" };
  if (s === "failed")
    return { key: "failed", label: "Failed", tone: "danger", step: 0, description: "This order could not be completed. Any charge is refunded.", icon: "AlertTriangle" };

  // Completed / delivered
  if (s === "delivered" || s === "completed" || (s === "" && hasCredentials))
    return { key: "delivered", label: "Delivered", tone: "success", step: 7, description: "Your order has been delivered successfully.", icon: "CheckCircle2" };

  // Pending manual review (auto-refunded failed orders awaiting admin approval/rejection)
  if (s === "pending_review" || s === "pending review")
    return { key: "review", label: "Pending Manual Review", tone: "warning", step: 1, description: "This order couldn't be auto-processed and was refunded. Our team is reviewing it.", icon: "ShieldQuestion" };

  // Manual fulfillment (Item 2): paid order with no ready credential — our team prepares it.
  if (s === "manual_fulfillment" || s === "manual fulfillment")
    return { key: "processing", label: "Processing", tone: "info", step: 4, description: "Your order is currently being processed. We're verifying your account details to ensure everything is valid before delivery. This usually takes only a few minutes — please contact support if it takes longer.", icon: "Loader" };

  // Manual review
  if (s.includes("review") || s.includes("manual") || s.includes("inquiry"))
    return { key: "review", label: "Under Manual Review", tone: "warning", step: 5, description: "A support specialist is reviewing your order.", icon: "ShieldQuestion" };

  // Waiting for provider/supplier (checked before generic "preparing" so
  // "provider preparing" is treated as waiting-for-supplier, not delivery packaging).
  if (s.includes("waiting") || s.includes("supplier") || s.includes("provider"))
    return { key: "waiting", label: "Waiting for Provider", tone: "info", step: 3, description: "Securing your item from our supplier.", icon: "Hourglass" };

  // Preparing delivery
  if (s.includes("prepar") || s.includes("dispatch") || s.includes("shipping") || s.includes("shipped"))
    return { key: "delivery", label: "Preparing Delivery", tone: "info", step: 6, description: "We're preparing your delivery.", icon: "PackageCheck" };

  // Processing
  if (s.includes("processing") || s.includes("progress") || s.includes("running"))
    return { key: "processing", label: "Processing", tone: "info", step: 4, description: "We're processing your order.", icon: "Loader" };

  // Pending / paid / new (default early state)
  if (s === "paid" || s.includes("confirm"))
    return { key: "paid", label: "Payment Confirmed", tone: "info", step: 2, description: "Payment confirmed — starting your order.", icon: "Wallet" };

  return { key: "pending", label: "Pending", tone: "warning", step: 1, description: "Your order is safely queued.", icon: "Clock" };
}

// Is the order still "in flight" (should show support/waiting UX)?
export function isInFlight(meta: OrderStatusMeta): boolean {
  return meta.step >= 1 && meta.step <= 6;
}
export function isComplete(meta: OrderStatusMeta): boolean {
  return meta.key === "delivered";
}
export function isStopped(meta: OrderStatusMeta): boolean {
  return meta.step === 0;
}

// Friendly, non-alarming progress copy for in-flight orders (never raw errors).
export function friendlyProgress(meta: OrderStatusMeta): string {
  switch (meta.key) {
    case "pending": return "Your order is safely queued…";
    case "paid": return "Payment confirmed — starting your order…";
    case "waiting": return "Waiting for supplier — securing your item…";
    case "processing": return "Provider is preparing your order…";
    case "review": return "Currently under manual review by our team…";
    case "delivery": return "Preparing your delivery…";
    default: return "Still processing…";
  }
}

// Rough ETA text per stage (only shown when we can estimate).
export function etaFor(meta: OrderStatusMeta): string | null {
  switch (meta.key) {
    case "pending":
    case "paid": return "1–5 minutes";
    case "waiting": return "5–15 minutes";
    case "processing": return "5–10 minutes";
    case "review": return "10–30 minutes";
    case "delivery": return "1–5 minutes";
    default: return null;
  }
}

// Which destination a completed order belongs to (order routing).
export type OrderDestination = "inventory" | "gift-orders" | "subscriptions" | "service-orders";

export function orderDestination(category: string, productType?: string): OrderDestination {
  const c = (category || "").toLowerCase();
  const t = (productType || "").toLowerCase();
  if (c.includes("gift")) return "gift-orders";
  if (c.includes("smm") || c.includes("service")) return "service-orders";
  if (t.includes("subscription") || c.includes("subscription")) return "subscriptions";
  return "inventory";
}

export function destinationLabel(dest: OrderDestination): string {
  switch (dest) {
    case "gift-orders": return "Gift Orders";
    case "subscriptions": return "Subscriptions";
    case "service-orders": return "Service Orders";
    default: return "My Inventory";
  }
}

// Maps a destination to an app section id for navigation.
export function destinationSection(dest: OrderDestination): string {
  switch (dest) {
    case "gift-orders": return "My Gift Orders";
    case "service-orders": return "Orders";
    case "subscriptions": return "My Inventory";
    default: return "My Inventory";
  }
}

// "time since purchase" helper for support summaries.
export function timeSince(dateStr?: string): string {
  if (!dateStr) return "unknown";
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
