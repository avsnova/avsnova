// ————————————————————————————————————————————————————————————————
//  Aurevashop Marketplace — Smart product media resolver (Phase 1)
// ————————————————————————————————————————————————————————————————
// Turns any product/category into the best available IMAGE instead of a raw emoji.
// Fallback chain (first hit wins):
//   1. An explicitly uploaded image (icon/file_url is a URL, or first of multiple_images)
//   2. A resolved brand logo (from the product/category NAME → Simple Icons CDN)
//   3. An emoji (if icon is an emoji) rendered on a branded tile
//   4. A generic initial tile
// UI-only: reads existing fields (icon, file_url, multiple_images, name). No backend change.

import { serviceLogoUrl } from "../../utils/serviceLogos";

export interface MediaSource {
  icon?: string;
  file_url?: string;
  multiple_images?: string;
  name?: string;
  category?: string;
}

const URL_RE = /^(https?:\/\/|\/uploads\/|data:image\/)/i;
const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i;

export function isImageRef(v?: string): boolean {
  if (!v) return false;
  const s = v.trim();
  // Uploaded/CDN URLs, local /uploads, or data URIs. Extension optional for /uploads & data.
  if (/^data:image\//i.test(s)) return true;
  if (/^\/uploads\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return IMG_EXT_RE.test(s) || /cdn\.simpleicons\.org|flagcdn\.com|githubusercontent|imgur|cloudinary|unsplash/i.test(s);
  return false;
}

// Detect an emoji (rough but effective: contains a non-ASCII pictographic char).
export function isEmoji(v?: string): boolean {
  if (!v) return false;
  const s = v.trim();
  if (URL_RE.test(s)) return false;
  // Any char outside basic latin / punctuation → treat as emoji/icon glyph.
  return /[\u203C-\uFFFF\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s) && s.length <= 6;
}

export interface ResolvedMedia {
  kind: "image" | "brand" | "emoji" | "initial";
  src?: string;           // for image/brand
  emoji?: string;         // for emoji
  initial?: string;       // for initial
}

// Resolve the best media for a product/category.
export function resolveProductMedia(p: MediaSource): ResolvedMedia {
  // 1. Explicit uploaded image on icon/file_url
  if (isImageRef(p.icon)) return { kind: "image", src: p.icon!.trim() };
  if (isImageRef(p.file_url)) return { kind: "image", src: p.file_url!.trim() };
  // first of multiple_images
  const firstMulti = (p.multiple_images || "").split(",").map((s) => s.trim()).find((s) => isImageRef(s));
  if (firstMulti) return { kind: "image", src: firstMulti };

  // 2. Brand logo resolved from the name (Facebook, Netflix, Apple/iCloud, Telegram…)
  const brand = serviceLogoUrl(p.name) || serviceLogoUrl(p.category);
  if (brand) return { kind: "brand", src: brand };

  // 3. Emoji fallback (existing icon that's an emoji)
  if (isEmoji(p.icon)) return { kind: "emoji", emoji: p.icon!.trim() };

  // 4. Initial tile from the name
  const initial = (p.name || p.category || "?").trim().charAt(0).toUpperCase() || "?";
  return { kind: "initial", initial };
}

// Deterministic gradient for initial tiles (stable per name).
export function initialGradient(seed: string): string {
  const palettes = [
    "from-purple-600/40 to-cyan-500/30",
    "from-cyan-600/40 to-blue-500/30",
    "from-amber-600/40 to-pink-500/30",
    "from-emerald-600/40 to-teal-500/30",
    "from-fuchsia-600/40 to-purple-500/30",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return palettes[h % palettes.length];
}
