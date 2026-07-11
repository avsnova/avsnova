# Aurevashop Marketplace — Redesign Migration Plan

A phased plan to transform the marketplace into a premium digital marketplace **without
breaking auth, payments, orders, admin workflows, or existing APIs**. Each phase is
independently shippable and tested (`tsc` + `build` + backend regression) before the next.

## Architecture audit (current state)

- **Media infra already exists & is battle-tested** (used by SMS/SMM panels):
  - `src/utils/serviceLogos.ts` → `serviceLogoUrl(name)` → Simple Icons CDN brand SVGs.
  - `src/utils/flags.ts` → country SVG flags.
  - `src/components/ui/BrandIcon.tsx` → `ServiceLogo` / `CountryFlag` with emoji fallback.
  - Backend `POST /api/admin/upload` (base64 → `/uploads/*`, returns public URL) — already live.
- **DB fields already present:** `products.icon`, `products.file_url`, `products.multiple_images`,
  `categories.icon`. No schema change strictly required for images (icon can hold an emoji, a
  brand name, or an uploaded URL).
- **Marketplace still renders raw emoji** via `{prod.icon || "📦"}` in cards, detail modal,
  categories, recently-viewed.
- Reusable components already built in prior turns: `ProductCard`, `ProductGallery`,
  `ProductTrustBar`, `WalletBalancePreview`, `availability.ts`, `recentlyViewed.ts`, and the
  unified order-tracking system.

## Guiding principles

- **Zero regressions**: preserve every API contract, callback, payment path, admin flow.
- **UI-only where possible**; additive backend only when strictly necessary & backward-compatible.
- **Graceful fallback chain** for imagery: uploaded image → brand logo (resolved from name) →
  emoji/initial → generic tile. Works offline in the sandbox preview.
- Reuse existing components; avoid duplicated UI.

## Phases

### ✅ Phase 1 — Real images everywhere (this turn)
Introduce a single smart resolver `productMedia.ts` and a `ProductImage` component that renders
the best available image for any product/category and **replaces raw emoji** across the
marketplace (cards, detail, categories, recently-viewed). Fallback chain guarantees no broken UI.
- Deliverables: `productMedia.ts`, `ProductImage.tsx`; wire into `ProductCard`, category chips,
  recently-viewed, detail header.
- Test: tsc + build + resolver unit tests + backend regression.

### ✅ Phase 2 — Admin image management (DONE)
Reusable `ImageUploader` (drag-drop, multi-upload, preview, reorder, choose cover, delete,
URL-paste fallback) wired into new-product form, edit-product form, and category form via the
existing `/api/admin/upload`. Backward compatible: cover→`icon`, gallery→`multiple_images`.

### ✅ Phase 3 — Rich previews (DONE)
`ExpandableSpecs` collapsible rich-preview panel (parses existing `specifications`, supports
`## Group` sections). Verified badges (SVG) on cards.

### ✅ Phase 4 — Discovery (DONE)
`ProductSlider` reusable carousel (swipe, snap, arrows). Homepage sliders: Featured, Trending,
Best Sellers, New Arrivals (real data from `featured`/`popular`/`sales`/`newest`). Extended
search (name+subcategory+description) + instant type & availability filters (no reload).

### ✅ Phase 5 — Navigation & performance (DONE)
`BackToTop` floating button; lazy-loaded images; skeletons; CSS scroll-snap sliders (60fps, no
JS timers). Category chips now use real images.

### ✅ Phase 6 — (covered across phases) trust, availability, recently-viewed, order tracking.

### Phase 2 (original notes) — Admin image management
Drag-and-drop multi-image uploader in the product editor (cover + gallery), preview before save,
reorder, delete. Uses existing `/api/admin/upload`. Category image upload.

### Phase 3 — Rich product cards + previews + variants
Quick View, verification/featured badges as SVG, expandable rich previews (account specs), and a
variant/option system (country/region variants with per-variant price/stock) — additive JSON field.

### Phase 4 — Discovery: homepage sliders, sections, advanced search & filters
Featured carousel (autoplay/swipe/loop), Trending/Best Sellers/New/Recommended sliders, advanced
instant search (suggestions, recent/popular, typo tolerance), and rich filters.

### Phase 5 — Product detail page + navigation + a11y + performance
Full detail page polish, breadcrumbs, sticky nav, back-to-top, keyboard/screen-reader support,
lazy-loading & responsive images, virtualization where useful.

### Phase 6 — AI shopping assistant + comparison + wishlist
Product recommendations via the existing AI, side-by-side comparison, wishlist, purchase-confidence
section. (Live Activity Feed only if real view/order data is added — no fake urgency.)

## Rollback
Each phase is isolated to new files + localized edits, so any phase can be reverted independently.
