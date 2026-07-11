# Aurevashop — Developer Documentation

> A production-grade digital-commerce SaaS: SMS verification numbers, SMM services,
> a digital-goods marketplace (accounts, keys, VPNs, subscriptions), gift delivery,
> wallet/payments, and a full admin operations suite.

Last updated: 2026-07 · Stack: **React 19 + Vite (single-file build) · Node/Express · SQLite (MySQL-capable)**

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser (SPA)                                               │
│  React 19 · Vite single-file bundle (dist/index.html)       │
│  Hash-based routing · localStorage session token            │
└───────────────┬────────────────────────────────────────────┘
                │  fetch() → apiFetch() (Bearer token)
                ▼
┌────────────────────────────────────────────────────────────┐
│  Express API (server/index.js, ~6500 LOC)                   │
│  • Global auth gate on /api/admin/* (Admin/Super Admin)     │
│  • authenticateToken middleware (JWT)                        │
│  • Services: aiService, monnify, paga, grizzlySms           │
│  • SSE stream (/api/admin/events, token-authenticated)      │
└───────────────┬────────────────────────────────────────────┘
                │  db.js (dbRun/dbGet/dbAll, SQL dialect shim)
                ▼
┌────────────────────────────────────────────────────────────┐
│  SQLite database.sqlite  (or MySQL when DB_TYPE=mysql)      │
└────────────────────────────────────────────────────────────┘
```

### Frontend layout (`src/`)
- `App.tsx` — root: session restore + splash, hash routing, auth gate, help route, notifications, payment reconciliation.
- `main.tsx` — providers: `ErrorBoundary` → `ToastProvider` → `ConfirmProvider` → `NetworkStatusBanner` + `App`.
- `components/views/` — page-level views (Dashboard, Marketplace, Orders, Wallet, MyInventory, AdminPanel, etc.).
- `components/admin/` — reusable admin modules: `CredentialManager`, `MediaLibrary`, `OperationsCenter`, `HomepageBuilder`, `AuditCenter`, `GlobalSettingsCenter`, `UniversalSearch`, `productStudio/`.
- `components/ui/` — design system: `shadcn.tsx` (Card/Button/Input/Badge/Tabs/Modal/Skeleton), `Toast`, `ConfirmDialog`, `BrandIcon`.
- `components/marketplace/`, `components/orders/`, `components/dashboard/`, `components/ai/` — feature clusters.
- `ai/` — client AI assistant (knowledge base, provider abstraction, remote proxy).
- `utils/` — `api.ts` (apiFetch/token), `clipboard`, `flags`, `serviceLogos`, `cn`.

### Backend layout (`server/`)
- `index.js` — all routes + business logic + helpers.
- `db.js` — connection, `initDb()` schema/migrations, SQL dialect translation (SQLite⇄MySQL).
- `services/` — `aiService.js`, `monnifyService.js`, `pagaService.js`, `grizzlySms.js`.
- `routes/sms.js` — SMS verification router. `middleware/` — `requireRole`, `auditLog`.

---

## 2. Core Reusable Platform Systems

These are shared services every feature integrates with (avoid duplicating them):

| System | Backend | Frontend | Purpose |
|---|---|---|---|
| **Media Library** | `/api/admin/upload` (records + dedups), `/api/admin/media*` | `MediaLibrary.tsx`, `MediaPickerModal` | Single asset store; folders, tags, search, usage-tracking, SHA-256 dedup |
| **Credential Inventory** | `/api/admin/inventory/*` | `CredentialManager.tsx` | Central inventory for digital-product credentials; statuses, audit, bulk ops, auto-delivery |
| **Product Studio** | `/api/admin/products/*`, `/api/admin/product-templates` | `productStudio/ProductStudio.tsx` | Multi-step product workspace with live preview + validation |
| **Operations Center** | `/api/admin/operations` | `OperationsCenter.tsx` | Interactive admin hub; every metric deep-links to its module |
| **Homepage Builder** | `/api/admin/homepage`, `/api/homepage` | `HomepageBuilder.tsx` | Orderable, toggleable storefront sections |
| **Universal Search** | `/api/admin/search` | `UniversalSearch.tsx` | ⌘K command palette across products/orders/users/credentials |
| **Audit Center** | `/api/admin/audit-center`, `logAuditAction()` | `AuditCenter.tsx` | Searchable, paginated activity log |
| **Notifications** | `notify()`, `notifyAdmins()`, `/api/notifications*` | `NotificationsView`, `NotificationDrawer` | In-app + branded email, preference-aware |
| **Global Settings** | `/api/admin/settings` (PATCH, whitelisted) | `GlobalSettingsCenter.tsx` | Branding, inventory/delivery/SEO/notification defaults |

**Integration rules for new features:** uploads → Media Library · config → Global Settings · important actions → `logAuditAction` · inventory changes → `syncProductStockFromPool` · customer events → `notify()` · searchable data → extend `/api/admin/search`.

---

## 3. Database Schema (key tables)

- **users** — id, username, email, password, name, wallet_balance, phone, role, banned, frozen, 2fa/reset fields, notif_* prefs, created_at, last_login. Roles: `Super Admin`, `Admin`, `Support Staff`, `Customer`.
- **products** — id (text PK), name, category, subcategory, price, cost_price, markup, stock, type, delivery_type, icon, multiple_images, specifications, seo_*, variants (JSON), is_draft, featured/newest/popular, delivery_*, sku.
- **inventory_pool** — id, product_id, credentials, status (`available|reserved|sold|archived|disabled`), is_warranty, label/region/country/expiry/notes, order_id, sold_to_user_id, delivered_at, timestamps. *Central credential inventory.*
- **credential_audit** — immutable per-credential action log.
- **orders** — id, user_id, product_id, category, name, quantity, price, status, custom_credentials, esim_*, tracking_number, cost_price, profit, timestamps.
- **transactions** — id, user_id, reference, amount, type (`PURCHASE|deposit|REFUND|...`), category, description, payment_method, profit, cost.
- **notifications** — id, user_id, type, message, is_read, created_at (auto-pruned > 30 days).
- **media_library** — id, url, filename, mime, kind, folder, tags, size, hash, alt, uploaded_by.
- **homepage_sections** — id, title, type, enabled, order_index, config.
- **product_templates** — id, name, product_type, data (JSON).
- **settings** — single-row config (branding, payment keys, SMTP, AI, defaults).
- **audit_logs** — id, user_id, username, action, ip_address, created_at.
- Payments: **monnify_payments**, **flutterwave_payments** (+ webhooks). SMS: **virtual_numbers**, **sms_countries**, **sms_services**. Also banners, announcements, categories, services, reviews, wishlist, promo_codes, support_*.

### Indexes (hot paths)
`inventory_pool(product_id,status)`, `(status)`; `orders(user_id)`,`(status)`,`(category)`,`(product_id)`; `transactions(user_id)`,`(type)`; `notifications(user_id,is_read)`; `products(category)`; `media_library(folder)`,`(hash)`; payments by tx/pay ref; SMS by name/country.

### Migration model
Additive & idempotent in `db.js::initDb()` — `CREATE TABLE IF NOT EXISTS` + wrapped `ALTER TABLE … ADD COLUMN` in try/catch. Runs on every boot; safe to re-run. No destructive migrations.

---

## 4. API Reference (representative)

All admin routes sit behind the global `/api/admin` gate (JWT + Admin/Super Admin) **and** most have a secondary `isUserAdmin` check (defense-in-depth). Standard error shape: `{ error: string }`; success: `{ success: true, ... }` or the resource directly.

### Auth
- `POST /api/auth/register` · `POST /api/auth/login` → `{token,user}` · `GET /api/auth/me` · `POST /api/auth/forgot-password` · reset flow.

### Public
- `GET /api/settings` — **safe fields only, no secrets** · `GET /api/marketplace/products` · `GET /api/marketplace/gifts` · `GET /api/categories` · `GET /api/homepage`.

### Marketplace / orders (auth)
- `POST /api/marketplace/buy` — wallet checkout; auto-delivers credentials, syncs stock, notifies. · `POST /api/marketplace/inquiry` · `GET /api/orders`, `/api/notifications`.

### Credential Inventory (admin)
- `GET /api/admin/inventory/credentials?productId&status&warranty&q&page&pageSize`
- `POST /api/admin/inventory/credentials` · `PUT/:id` · `DELETE/:id` · `POST/:id/duplicate` · `POST/:id/assign`
- `POST /api/admin/inventory/credentials/bulk-status` · `/bulk-delete` · `POST /api/admin/inventory/bulk-upload`
- `GET /api/admin/inventory/stats` · `/summary` · `/audit` · `/export` (CSV)

### Products / Studio (admin)
- `POST /api/admin/products/create` · `/update/:id` · `/duplicate/:id` · `POST /api/admin/products/bulk` · `GET /api/admin/products/check?id&sku` · `product-templates` CRUD.

### Platform (admin)
- `GET /api/admin/operations` — dashboard aggregate · `GET/POST /api/admin/homepage` · `GET /api/admin/search?q`
- `GET /api/admin/media?folder&kind&q&page` · `PUT/DELETE /api/admin/media/:id` · `GET /api/admin/media/:id/usage` · `POST /api/admin/media/scan`
- `GET /api/admin/audit-center?q&user&page` · `PATCH /api/admin/settings` (whitelisted) · `GET /api/admin/settings/full` (secrets, admin-only)
- `GET /api/admin/events?token=<jwt>` — SSE live stream (token-authenticated).

Conventions: list endpoints return `{rows,total,page,pageSize,totalPages}`; filters via query params; mutations return `{success:true}`.

---

## 5. Environment Variables (`.env`)

```
JWT_SECRET=...                 # session signing (REQUIRED)
DB_TYPE=sqlite                 # or 'mysql' (+ MYSQL_HOST/USER/PASSWORD/DATABASE/PORT)
GEMINI_API_KEY=...             # AI assistant (server-side only)
# Payments
MONNIFY_API_KEY / MONNIFY_SECRET_KEY / MONNIFY_CONTRACT_CODE / MONNIFY_ENVIRONMENT
PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY
PAGA_PUBLIC_KEY / PAGA_SECRET_KEY / PAGA_HASH_KEY
FLUTTERWAVE_SECRET_KEY / FLUTTERWAVE_PUBLIC_KEY / FLUTTERWAVE_ENCRYPTION_KEY
# Email + SMS/SMM
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
GRIZZLY_SMS_API_KEY / JAP_API_URL / JAP_API_KEY
```
Secrets may also be stored in the `settings` table (DB overrides env at runtime for payment/AI/SMTP). **Never expose secrets to the frontend** — use `/api/admin/settings/full` (admin-gated) for the settings form; `/api/settings` is public and secret-free.

---

## 6. Deployment

1. `npm install`
2. `npm run build` → single-file `dist/index.html`
3. `node server/index.js` (serves API on :5000; also serves `/uploads`). Put a reverse proxy (nginx/Caddy) in front for TLS + serving `dist/`.
4. Persist `database.sqlite` and `uploads/` on durable storage (or set `DB_TYPE=mysql`).

**Backup & recovery:** back up `database.sqlite` (single file — copy while idle or use `.backup`) and the `uploads/` directory. Notifications auto-prune > 30 days. For MySQL, use standard `mysqldump`.

---

## 7. Key Workflows

- **Credential inventory:** admin imports credentials (bulk paste/CSV, dedup) → pool tracks status → customer buys instant digital product → `marketplace/buy` picks non-warranty `available` rows, marks `sold`, attaches to order, syncs stock, writes `credential_audit`, notifies buyer (in-app + email) and admins on shortage. Manual fulfilment via `/assign`.
- **Product management:** Studio (10 steps: type→basic→media→inventory→credentials→pricing→delivery→variants→SEO→review) with autosave drafts, templates, duplicate, live preview, smart validation. Drafts (`is_draft=1`) hidden from storefront.
- **Notifications:** `notify(userId,{category,message,email})` respects `notif_*` prefs (security bypasses); `notifyAdmins` fans out. Branded HTML via `avsEmailTemplate` + `emailBodies.*`.
- **Operations Center:** default admin tab; `/api/admin/operations` aggregate; every widget deep-links.
- **Homepage Builder → storefront:** admin orders/toggles sections; `MarketplaceView` reads `/api/homepage` to render discovery sliders in that order.
- **Media Library:** all uploads flow through `/api/admin/upload` (dedup + library record); usage tracking prevents deleting in-use assets.

---

## 8. Extension Guide

To add a new admin module:
1. Backend: add routes under `/api/admin/...` (inherits the global auth gate; add `isUserAdmin` for clarity). Return list shape `{rows,total,page,...}`.
2. Call `logAuditAction()` on mutations; `notify()` for customer-facing effects.
3. If it stores files → use the Media Library picker. If it stores config → add a whitelisted key to `SETTINGS_PATCHABLE` and surface it in `GlobalSettingsCenter`.
4. Frontend: build a component in `components/admin/`, reuse `Card/Button/Input/Badge/Toast/ConfirmDialog`; add a tab in `AdminPanel.tsx` (both permission branches).
5. If searchable, extend `/api/admin/search`. If it has dashboard-worthy metrics, add them to `/api/admin/operations` + a widget.
6. Test: `npx tsc --noEmit` (must be 0) + `npm run build` + a throwaway `verify.mjs` spawning the server; delete temp files.
