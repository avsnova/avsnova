import { copyToClipboard } from "../../utils/clipboard";

// Share a product via the native Web Share API when available, else copy a link.
// Returns "shared" | "copied" | "failed".
export async function shareProduct(p: { id: string; name: string; price?: number }): Promise<"shared" | "copied" | "failed"> {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/#Marketplace?product=${encodeURIComponent(p.id)}`;
  const text = `Check out ${p.name}${p.price ? ` — ₦${p.price.toLocaleString()}` : ""} on Aurevashop`;
  try {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: p.name, text, url });
      return "shared";
    }
  } catch {
    // user cancelled or share failed → fall through to copy
  }
  const ok = await copyToClipboard(`${text}\n${url}`);
  return ok ? "copied" : "failed";
}
