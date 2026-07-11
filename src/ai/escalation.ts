// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — WhatsApp Escalation
// ————————————————————————————————————————————————————————————————
// Builds a complete, prefilled WhatsApp handoff so customers never repeat
// themselves. Only used when a human is genuinely required.

export interface EscalationSummary {
  customerName?: string | null;
  userId?: number | string | null;
  section?: string | null;
  status?: string;
  problem?: string;
  orderId?: string;
  reference?: string;
  service?: string;
  transcript?: { role: "user" | "assistant"; text: string }[];
}

// Normalize a phone number to bare digits for wa.me (strip +, spaces, dashes).
export function normalizeWhatsapp(num?: string | null): string {
  const digits = (num || "").replace(/\D/g, "");
  return digits || "2349016075160"; // sensible platform default
}

export function buildWhatsappMessage(s: EscalationSummary): string {
  const lines: string[] = [];
  lines.push("Hello Aurevashop Support 👋");
  lines.push("");
  lines.push("I was chatting with Aria (AI assistant) and need a human. Here are my details:");
  lines.push("");
  if (s.customerName) lines.push(`• Customer: ${s.customerName}`);
  if (s.userId != null && s.userId !== "") lines.push(`• User ID: ${s.userId}`);
  if (s.orderId) lines.push(`• Order ID: ${s.orderId}`);
  if (s.reference) lines.push(`• Reference: ${s.reference}`);
  if (s.service) lines.push(`• Service: ${s.service}`);
  if (s.section) lines.push(`• Current page: ${s.section}`);
  if (s.status) lines.push(`• Status: ${s.status}`);
  if (s.problem) { lines.push(""); lines.push(`Issue: ${s.problem}`); }

  const tx = (s.transcript || []).slice(-6);
  if (tx.length) {
    lines.push("");
    lines.push("Recent conversation:");
    for (const t of tx) {
      const who = t.role === "user" ? "Me" : "Aria";
      lines.push(`${who}: ${t.text.replace(/\n+/g, " ").slice(0, 180)}`);
    }
  }
  lines.push("");
  lines.push(`(Sent ${new Date().toLocaleString()})`);
  return lines.join("\n");
}

export function openWhatsapp(phone: string | undefined, summary: EscalationSummary): string {
  const num = normalizeWhatsapp(phone);
  const text = encodeURIComponent(buildWhatsappMessage(summary));
  const url = `https://wa.me/${num}?text=${text}`;
  try {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  } catch { /* ignore (sandbox) */ }
  return url;
}
