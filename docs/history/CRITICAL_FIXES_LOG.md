# Critical Fixes — Backend Startup, Email Code Retrieval, Inventory & Purchasing

All items below are implemented, live-tested, and verified (TSC 0, build OK).

## 1. Backend startup & Vite proxy (no more ECONNREFUSED)
- **`GET /api/health`** (public, DB-checked) returns `{ status, ready, uptimeSec, time }`.
- Frontend `waitForBackend()` (`src/utils/api.ts`) polls health with **exponential backoff**
  (0.5s→1s→2s→4s, capped 5s), de-duplicated via a shared promise, cached once ready.
- `App.tsx` shows a **"Connecting to server…"** splash and gates session restore, the
  global SMS poller, and all API-dependent rendering on `backendReady`.
- Vite proxy already returns a clean 503 on transient backend unavailability.

## 2. Email Code Retrieval (reads third-party codes from the purchased mailbox)
- Per-credential IMAP config (`email_verify_mode='self'`): address, password (encrypted),
  IMAP host/port/SSL, matching rules (sender / subject / body keywords / max age).
  A `'shared'` admin-mailbox mode is also supported.
- Customer Security Center: **Get Code, Refresh, Copy Code, Copy Link, Open Link,
  Last Updated, Verification History, masked mailbox, status.** Behaves like TOTP but reads mail.
- Endpoints: `POST /api/orders/:id/email-verify/code`, `GET /api/orders/:id/email-verify/history`,
  `POST /api/admin/inventory/:id/email-verify` (+`/test`, `/activity`), `GET .../email-verify`.
- **Live-verified** against SpaceMail: IMAP login OK, real code + link extracted end-to-end.
- Fixed an imapflow UID-fetch bug (`{uid:true}` must be the 3rd arg) that caused "scanned 0".
- Only **SMS** shows "Coming Soon" (customer + admin). All Email "Coming Soon" placeholders removed.

## 3. Credential editing — loads & preserves every saved value
- Edit form pre-fills all fields; partial updates never wipe untouched fields
  (email/username/password/2FA/recovery/supplier/tags/notes/multiplier + email-verify config).

## 4. Credential Clone — full duplicate as Draft/Unpublished
- `POST /api/admin/inventory/credentials/:id/duplicate` copies **all** fields incl. TOTP config
  and full Email Verification config; resets sale counters; sets `workflow='draft'`.

## 5–9. Inventory & purchasing
- **Stock validation** (backend `/api/marketplace/buy`): rejects missing/draft/inactive/out-of-stock
  before any wallet debit; **quantity validation** ("Only X item(s) remaining in stock").
- Client mirrors guards in the checkout modal (caps qty to stock, disables Buy at 0).
- **Product cards**: "N Remaining" / "Only 1 Left" / disabled **Out of Stock** button.
- **Live stock**: products refetched after each successful purchase (wallet + Flutterwave),
  keeping Marketplace / Details / Checkout / Admin / Inventory Manager in sync — no page reload.
- Note: this platform uses direct **Buy Now** (no cart), so "Add to Cart" maps to Buy Now.

## Test summary (live)
- Integration: 15/15 (health, clone-all-fields incl. email config, edit-preserves, stock,
  draft/out-of-stock/over-quantity blocks).
- End-to-end email retrieval: 8/8 (real email sent → code `422174` + link extracted by the
  customer, history + security status correct, SMS still "coming soon").

## Security Center UI/UX Refinement (latest)
- **One organized card per credential**: top guidance notice → prominent **Credential
  Information** (Username, Password with show/hide, recovery fields, or raw block) with
  working **Copy** buttons on every field + success toasts (uses the iOS/Android-safe
  `copyToClipboard`) → unified **Verification Methods** (Authenticator + Email + SMS all
  listed together, collapsible, each with a status pill) → scrollable **Instructions** panel.
- **Verification methods shown together**: Authenticator ("Configured" + Get Code), Email
  Verification ("Configured" + Get Email Code, Copy Code / Copy Link / Open Link / History),
  and **SMS Verification = "Coming Soon"** (the only remaining placeholder).
- **Terminology fixed**: removed "License Key / Secure Serial / Serial Number / License Node
  Key / Fulfillment Delivery Nodes" → "Purchased Credential / Credential Information /
  Login Credentials / Username / Password".
- **Editable instructions**: `GET/PATCH` global `security_instructions` (rich HTML via
  `RichTextEditor` in Global Settings); a product's `setup_guide` overrides it. Rendered in a
  sanitized, scrollable panel; changes appear immediately for customers.
- **Backend `/api/orders/:id/security`** now returns the structured `credential`
  (username/password/recovery/type/status/raw) + resolved `instructions` + productName.
- **Bug fix**: `GlobalSettingsCenter` was reading `/api/settings` at the wrong nesting level
  (`res` instead of `res.settings`) so it never loaded saved values — now corrected.
- Live end-to-end re-verified: real email → code + link extracted by the customer; credential
  card populated; product setup_guide override applied; SMS still "Coming Soon". 13/14 checks
  (the 1 "fail" was a test asserting the wrong JSON key; endpoint confirmed correct).

## Email Verification — polish pass (smart parser, test tools, progress, history)
- **#1 Live-verified again**: real email → IMAP → code + link extracted (proven end-to-end).
- **#4 Smart parser (per credential)**: sender, subject/body keywords, **ignore keywords**,
  **custom regex** (priority), **OTP length**, **extract-link toggle**, **alternate sender
  address**, max age. Persisted on `inventory_pool` (email_verify_ignore_keywords / _regex /
  _otp_length / _extract_link / _alt_address). `extractCode(text, {regex,otpLength})` and
  `parseVerification(email,{...})` honour them; `searchMatching` applies ignore keywords +
  multi-sender allow-list.
- **#5 Test Rule button**: `POST /api/admin/inventory/:id/email-verify/test-rule` runs the
  full search+parse with the (unsaved) form values and returns Matched Email → Sender /
  Subject / Code / Link / Status. Rendered inline in the admin credential editor.
- **#6 Expanded activity log**: mailbox_connected → search_started → email_retrieved →
  code_extracted → link_extracted → displayed_to_customer → code_copied / link_copied /
  link_opened (customer copy/open events via `POST .../email-verify/event`).
- **#7 Email history**: customer panel shows "Received N minutes ago", sender name, and a
  collapsible timeline (60 latest events) with friendly labels.
- **#8 Progress feedback**: Get Email Code button cycles Connecting… → Searching mailbox… →
  Reading email… → Extracting code… → Done (never appears frozen).
- **#3 Admin instructions**: RichTextEditor now also has **Warning box** + **Code block**
  buttons (plus bold/italic/underline, bullet/numbered lists, links, images, tables, colors,
  HTML source). Instructions are DB-backed (`security_instructions`, product `setup_guide`
  override) and render live in a sanitized scrollable panel.
- Tests: 17/17 live checks pass (advanced rules persist+apply, test-rule matches & extracts,
  ignore-keywords skip promo email, expanded history steps present, customer retrieval + copy
  event). TSC 0, build OK, workspace clean.

## Marketplace Redesign (compact carousels + modern categories + sticky bar)
- **ProductSlider** upgraded: native touch-swipe + CSS snap, **click-and-drag** (pointer
  events, suppresses accidental card-open after a drag), and **vertical wheel/trackpad →
  horizontal scroll** that releases to page-scroll at the edges (never "stuck"). Arrow
  controls + optional item count + "View all".
- **CompactProductCard** (new): dense "Recently Viewed"-style card with thumbnail, price,
  live stock ("N left"/"1 left"), Featured/Sold-Out tags, and a one-tap Buy/Quote action.
  Reuses `ProductCardData` so it's drop-in with existing handlers.
- **Featured / Trending / Best Sellers / New Arrivals** now render as compact horizontal
  carousels (was large 64-72 rem cards) with tighter spacing; "View all" jumps to the
  matching quick-filter.
- **Sticky search + quick-filter bar** (top-2, blurred) stays reachable while browsing.
- **Modern category cards**: horizontal, swipeable icon cards with per-category product
  counts, replacing the flat chip row.
- TSC 0, build OK. No behavioural regressions (grids, detail modal, checkout unchanged).

## Marketplace — Category-First Architecture
- **Removed** the Featured / Newest / Popular homepage slider sections entirely.
- **Homepage = category grid**: responsive category cards (2 cols mobile → 5 desktop) with
  icon, name, live product count, and a "Browse Options →" affordance. Only categories that
  contain live products are shown, so the home stays clean at any catalogue size.
- **Navigation flow**: Marketplace → Category (collection) → (optional Subcategory chips) →
  Product Details → Checkout, with a breadcrumb (Marketplace / Category / Subcategory) and
  back-to-categories.
- **Collection page**: subcategory drill-down chips (auto-derived from products'
  `subcategory`), smart Filters (type + availability) and a Sort control (Default / Newest /
  Best Selling / A–Z). Uses the existing `category`/`subcategory` data model — no schema change,
  no duplicate product entries.
- **Responsive compact product cards** (`CompactProductCard`): 2 per row on mobile, 3 on
  tablet, 4–5 on desktop; each shows image, name, price, short description (sm+), live stock,
  **Buy Now** + **View Details** buttons, Featured/Sold-Out tags. Rounded corners, hover lift,
  modern shadow, uniform sizing.
- Recently-viewed strip retained (compact) on the home.
- TSC 0, build OK (bundle ~14 KB smaller), boot + products/categories endpoints verified.

### Honest scope note (follow-ups, not built this turn)
- Deeper **multi-level** category tree (Category → Subcategory → Variant as distinct admin
  entities) and **dynamic category CRUD / reordering / per-type smart filters** from the admin
  dashboard remain follow-ups. Current drill-down uses the existing category + subcategory
  fields (two real levels) which covers the primary "collection then variants" UX; a dedicated
  variant table + admin manager is the next step.
- International Gift Delivery still uses the existing gifts tab; converting it to a stockless
  service module is a separate queued task.

## Admin Dynamic Category & Variant Management
- **DB**: added `subcategories` table (category_id, name, icon, description, order_index,
  status, featured) + `categories.featured` flag. Additive, backward compatible.
- **Backend endpoints** (all admin-guarded + audit-logged):
  - Categories: create (dup-ID guard), update (+featured), **reorder**, **toggle**
    (status/featured), delete (**guarded** if products still use it, cascades subcategories).
  - Subcategories: `GET /api/subcategories[?category=]` (public), create (dup-name guard),
    update (renames sync `products.subcategory`), **reorder**, delete (**guarded** if in use).
- **Admin UI** (`CategoryManager.tsx`, new "Categories & Variants 🗂️" tab): collapsible
  category rows with up/down reorder, feature/enable/disable toggles, edit & delete;
  nested per-category variant list with add/edit/reorder/delete; modals for both. Nothing
  requires code changes — fully DB-driven.
- **Smart product assignment**: product form's Subcategory field is now a datalist populated
  from the selected category's managed variants (admin can pick or type a new one); saving
  files the product under Marketplace → Category → Variant automatically (no duplicates).
- **Storefront**: collection page now orders variant chips by the admin-defined order
  (managed variants first, product-derived extras appended), so drill-down reflects the
  admin's structure.
- Tests: 14/14 CRUD/reorder/toggle/guard checks + 8/8 end-to-end (create category+variant →
  assign product → verify grouping + delete guards). TSC 0, build OK.
