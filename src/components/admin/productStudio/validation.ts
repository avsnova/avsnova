import type { StudioForm } from "./types";

export interface StudioIssue {
  step: number;          // step index the issue belongs to
  severity: "error" | "warning";
  message: string;
}

// Smart validation across the whole form. Errors block publishing; warnings are advisory.
export function validateStudio(f: StudioForm, opts: { skuTaken?: boolean; idTaken?: boolean; availableCredentials?: number } = {}): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const price = parseFloat(f.price);
  const salePrice = f.sale_price ? parseFloat(f.sale_price) : NaN;
  const cost = f.cost_price ? parseFloat(f.cost_price) : NaN;

  // Step 0 — type
  if (!f.productType) issues.push({ step: 0, severity: "error", message: "Choose a product type." });

  // Step 1 — basic info
  if (!f.id.trim()) issues.push({ step: 1, severity: "error", message: "Product ID is required." });
  else if (opts.idTaken) issues.push({ step: 1, severity: "error", message: "This Product ID is already taken." });
  if (!f.name.trim()) issues.push({ step: 1, severity: "error", message: "Product name is required." });
  if (!f.description.trim()) issues.push({ step: 1, severity: "warning", message: "Full description is empty." });
  if (!f.short_description.trim()) issues.push({ step: 1, severity: "warning", message: "A short description improves cards & previews." });
  if (opts.skuTaken) issues.push({ step: 1, severity: "error", message: "This SKU is already used by another product." });

  // Step 2 — media
  const hasImage = /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(f.icon) || (f.multiple_images || "").split(",").some((s) => /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(s.trim()));
  if (!hasImage) issues.push({ step: 2, severity: "warning", message: "No product image uploaded (an emoji icon will be used)." });

  // Step 3 — inventory
  if (f.stockMode === "quantity") {
    const stock = parseInt(f.stock);
    if (isNaN(stock)) issues.push({ step: 3, severity: "error", message: "Enter a valid stock quantity." });
    else if (stock <= 0) issues.push({ step: 3, severity: "warning", message: "Stock is zero — product will show as out of stock." });
    else if (stock <= 3) issues.push({ step: 3, severity: "warning", message: "Low inventory (≤ 3)." });
  }

  // Step 4 — credentials (only relevant for pool-backed instant digital accounts/keys)
  const poolType = ["digital_account", "digital_key", "vpn", "software"].includes(f.productType) && f.delivery_type === "instant";
  if (poolType && f.stockMode === "credentials") {
    if ((opts.availableCredentials ?? 0) === 0) issues.push({ step: 4, severity: "warning", message: "No available credentials assigned to this product yet." });
    else if ((opts.availableCredentials ?? 0) <= 3) issues.push({ step: 4, severity: "warning", message: `Only ${opts.availableCredentials} credential(s) available.` });
  }

  // Step 5 — pricing
  if (isNaN(price) || price <= 0) issues.push({ step: 5, severity: "error", message: "A valid selling price is required." });
  if (!isNaN(salePrice)) {
    if (salePrice <= 0) issues.push({ step: 5, severity: "error", message: "Sale price must be positive." });
    else if (!isNaN(price) && salePrice >= price) issues.push({ step: 5, severity: "warning", message: "Sale price is not lower than the regular price." });
  }
  if (!isNaN(cost) && !isNaN(price) && cost > price) issues.push({ step: 5, severity: "warning", message: "Cost price is higher than selling price (negative margin)." });

  // Step 7 — variants
  for (const v of f.variants) {
    if (!v.name.trim()) issues.push({ step: 7, severity: "error", message: "A variant is missing a name." });
    if (v.price && isNaN(parseFloat(v.price))) issues.push({ step: 7, severity: "error", message: `Variant "${v.name}" has an invalid price.` });
  }

  // Step 8 — SEO
  if (!f.seo_title.trim()) issues.push({ step: 8, severity: "warning", message: "SEO title missing — helps discoverability." });
  if (!f.seo_description.trim()) issues.push({ step: 8, severity: "warning", message: "SEO description missing." });

  return issues;
}

// A 0-100 completeness/quality score for the Review step.
export function studioScore(f: StudioForm, issues: StudioIssue[]): number {
  let score = 100;
  for (const i of issues) score -= i.severity === "error" ? 15 : 5;
  return Math.max(0, Math.min(100, score));
}

export function seoScore(f: StudioForm): number {
  let s = 0;
  if (f.seo_title.trim()) s += 30;
  if (f.seo_description.trim()) s += 30;
  if (f.seo_keywords.trim()) s += 20;
  if (f.name.trim().length >= 5) s += 10;
  if ((f.tags || "").trim()) s += 10;
  return Math.min(100, s);
}
