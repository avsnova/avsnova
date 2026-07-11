// Feature 6 — Manual order "Copy Order Details" formatter.
// Produces clean, readable plain text ready to paste into WhatsApp / Telegram /
// Email / internal chat. Only includes fields that are actually present.

export interface CopyableOrder {
  id?: string | number;
  name?: string;                 // product name
  product_name?: string;
  quantity?: number;
  price?: number;
  status?: string;
  payment_status?: string;
  category?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  user_id?: number | string;
  custom_credentials?: string;
  target_link?: string;          // may hold JSON shipping/delivery info
  details?: string;              // notes / custom fields
  tracking_number?: string;
  created_at?: string;
  [key: string]: any;
}

function money(v: any): string {
  const n = Number(v);
  return isNaN(n) ? String(v ?? "") : `₦${n.toLocaleString()}`;
}

// Try to parse shipping/delivery info that the app stores as JSON in target_link.
function parseDelivery(order: CopyableOrder): Record<string, any> | null {
  const raw = order.target_link;
  if (!raw || typeof raw !== "string") return null;
  if (!(raw.trim().startsWith("{") || raw.trim().startsWith("["))) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function formatOrderForCopy(order: CopyableOrder): string {
  const L: string[] = [];
  const add = (label: string, value: any) => {
    if (value === undefined || value === null) return;
    const s = String(value).trim();
    if (s === "") return;
    L.push(`${label}: ${s}`);
  };

  L.push("🧾 ORDER DETAILS");
  L.push("─────────────────────");
  add("Order ID", order.id);
  add("Date", order.created_at ? new Date(order.created_at).toLocaleString() : "");
  add("Product", order.product_name || order.name);
  add("Category", order.category);
  add("Quantity", order.quantity ?? 1);
  add("Price", order.price != null ? money(order.price) : "");
  add("Payment Status", order.payment_status || "Paid");
  add("Order Status", order.status);

  // Customer block
  const custLines: string[] = [];
  const cadd = (label: string, v: any) => { if (v != null && String(v).trim() !== "") custLines.push(`${label}: ${v}`); };
  cadd("Name", order.customer_name);
  cadd("Email", order.customer_email);
  cadd("Phone", order.customer_phone);
  if (!order.customer_name && !order.customer_email && order.user_id != null) cadd("User ID", order.user_id);
  if (custLines.length) { L.push(""); L.push("👤 CUSTOMER"); L.push("─────────────────────"); L.push(...custLines); }

  // Delivery / shipping (parsed JSON when present)
  const d = parseDelivery(order);
  if (d) {
    const dl: string[] = [];
    const dadd = (label: string, v: any) => { if (v != null && String(v).trim() !== "") dl.push(`${label}: ${v}`); };
    dadd("Recipient", d.fullName || d.receiverName || d.name);
    dadd("Sender", d.senderName);
    dadd("Phone", d.phone || d.senderPhone);
    dadd("Email", d.email || d.senderEmail);
    const addr = [d.street || d.address, d.apartment, d.city, d.state, d.country].filter(Boolean).join(", ");
    dadd("Address", addr);
    dadd("Postal/ZIP", d.postalCode || d.zipCode);
    dadd("Delivery Date", d.deliveryDate);
    dadd("Delivery Time", d.deliveryTime);
    dadd("Instructions", d.instructions);
    dadd("Gift Message", d.giftMessage);
    // Any other custom fields inside the JSON we didn't explicitly map
    const known = new Set(["fullName", "receiverName", "name", "senderName", "phone", "senderPhone", "email", "senderEmail", "street", "address", "apartment", "city", "state", "country", "postalCode", "zipCode", "deliveryDate", "deliveryTime", "instructions", "giftMessage", "productName", "quantity", "isGift", "shippingType", "notes"]);
    Object.entries(d).forEach(([k, v]) => { if (!known.has(k) && v != null && String(v).trim() !== "" && typeof v !== "object") dl.push(`${k}: ${v}`); });
    if (dl.length) { L.push(""); L.push("📦 DELIVERY INFORMATION"); L.push("─────────────────────"); L.push(...dl); }
  } else if (order.target_link && String(order.target_link).trim() !== "") {
    L.push(""); L.push("📦 DELIVERY / TARGET"); L.push("─────────────────────"); L.push(String(order.target_link));
  }

  // Custom fields / customer notes (details often holds "key: value | key: value")
  if (order.details && String(order.details).trim() !== "" && !parseDelivery({ target_link: order.details } as any)) {
    L.push(""); L.push("📝 NOTES / CUSTOM FIELDS"); L.push("─────────────────────");
    L.push(String(order.details).replace(/\s+\|\s+/g, "\n"));
  }

  // Credentials
  if (order.custom_credentials && String(order.custom_credentials).trim() !== "" && !/^(processing|awaiting)/i.test(String(order.custom_credentials).trim())) {
    L.push(""); L.push("🔑 CREDENTIALS");
    L.push("─────────────────────");
    L.push(String(order.custom_credentials));
  }

  if (order.tracking_number) { L.push(""); add("Tracking Number", order.tracking_number); }

  L.push("");
  L.push("— Sent from AVShop Admin");
  return L.join("\n");
}
