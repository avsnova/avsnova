// Richer availability indicator derived from REAL fields (stock + delivery_type).
// No fake urgency — labels reflect only actual stock/delivery data.

export interface AvailabilityInput {
  stock: number;
  delivery_type: "instant" | "manual" | "inquiry";
  price: number;
  // Stockless modules (eSIM / Physical SIM / Gift) are always available.
  display_location?: string;
  category?: string;
}

function isStockless(p: AvailabilityInput): boolean {
  const loc = String(p.display_location || "").toLowerCase().trim();
  return loc === "esim" || loc === "physical-sim" || loc === "physical sim" || loc === "gift" || p.category === "gifts";
}

export interface Availability {
  label: string;
  emoji: string;
  tone: "emerald" | "cyan" | "amber" | "red" | "purple";
}

export function getAvailability(p: AvailabilityInput): Availability {
  const isInquiry = p.delivery_type === "inquiry" || p.price === 0;
  if (isInquiry) return { label: "Available on Request", emoji: "💬", tone: "purple" };
  // Stockless modules never show a stock-based state — always available.
  if (isStockless(p)) return { label: "Available Now", emoji: "🟢", tone: "emerald" };
  if (p.stock <= 0) return { label: "Restocking Soon", emoji: "⏳", tone: "amber" };
  if (p.delivery_type === "instant") {
    // Instant + healthy stock = strongest signal.
    if (p.stock <= 5) return { label: "Limited Stock", emoji: "📦", tone: "amber" };
    return { label: "Instant Delivery", emoji: "⚡", tone: "cyan" };
  }
  if (p.stock <= 5) return { label: "Limited Stock", emoji: "📦", tone: "amber" };
  return { label: "Available Now", emoji: "🟢", tone: "emerald" };
}

export const AVAILABILITY_TONE_CLASS: Record<Availability["tone"], string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};
