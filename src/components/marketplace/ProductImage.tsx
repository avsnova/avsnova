import { useState } from "react";
import { resolveProductMedia, initialGradient, type MediaSource } from "./productMedia";

interface Props {
  product: MediaSource;
  /** Tailwind size classes for the wrapper (square by default). */
  className?: string;
  /** Rounded corners class. */
  rounded?: string;
  /** How the image fits: contain (logos) or cover (photos). */
  fit?: "contain" | "cover";
  alt?: string;
}

// Renders the best available product/category image (uploaded → brand logo → emoji → initial),
// preserving aspect ratio (never stretched/squashed), lazy-loaded, with a skeleton while loading
// and graceful fallback if an image fails.
export default function ProductImage({ product, className = "h-11 w-11", rounded = "rounded-xl", fit = "contain", alt }: Props) {
  const media = resolveProductMedia(product);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const label = alt || product.name || "product";

  // Image / brand logo
  if ((media.kind === "image" || media.kind === "brand") && media.src && !errored) {
    const isBrand = media.kind === "brand";
    return (
      <div className={`relative overflow-hidden ${rounded} ${className} bg-black/30 border border-purple-500/12 flex items-center justify-center shrink-0`}>
        {!loaded && <span className="absolute inset-0 animate-pulse bg-white/5" />}
        <img
          src={media.src}
          alt={label}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${isBrand ? "object-contain p-[18%]" : fit === "cover" ? "object-cover" : "object-contain p-1.5"}`}
        />
      </div>
    );
  }

  // Emoji tile (fallback when we still only have an emoji)
  if (media.kind === "emoji" && media.emoji) {
    return (
      <div className={`overflow-hidden ${rounded} ${className} bg-gradient-to-br from-purple-500/15 to-cyan-500/10 border border-purple-500/15 flex items-center justify-center shrink-0`}>
        <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{media.emoji}</span>
      </div>
    );
  }

  // Initial tile (final fallback)
  const grad = initialGradient(label);
  return (
    <div className={`overflow-hidden ${rounded} ${className} bg-gradient-to-br ${grad} border border-white/10 flex items-center justify-center shrink-0`}>
      <span className="font-bold font-space text-white/90" style={{ fontSize: "1.1em" }}>{media.initial}</span>
    </div>
  );
}
