import { useState } from "react";
import { flagUrl } from "../../utils/flags";
import { serviceLogoUrl } from "../../utils/serviceLogos";

// ————— Country flag (#2) —————
// Renders an official SVG flag; falls back to the emoji flag if the image can't load
// (e.g. no network in the in-app preview).
export function CountryFlag({
  emoji,
  country,
  size = 20,
  className = "",
}: { emoji?: string; country?: string; size?: number; className?: string }) {
  const url = flagUrl(emoji, country);
  const [errored, setErrored] = useState(false);

  if (!url || errored) {
    return <span className={className} style={{ fontSize: size * 0.9, lineHeight: 1 }}>{emoji || "🌐"}</span>;
  }
  return (
    <img
      src={url}
      alt={country || "flag"}
      onError={() => setErrored(true)}
      width={size}
      height={Math.round(size * 0.72)}
      className={`inline-block rounded-[3px] object-cover shadow-sm ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: Math.round(size * 0.72) }}
      loading="lazy"
    />
  );
}

// ————— Service logo (#3) —————
// Renders an official brand logo; falls back to the provided emoji/icon if unknown
// or the image can't load.
export function ServiceLogo({
  name,
  fallback,
  size = 22,
  className = "",
}: { name?: string; fallback?: string; size?: number; className?: string }) {
  const url = serviceLogoUrl(name);
  const [errored, setErrored] = useState(false);

  if (!url || errored) {
    return <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1 }}>{fallback || "📦"}</span>;
  }
  return (
    <img
      src={url}
      alt={name || "service"}
      onError={() => setErrored(true)}
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}
