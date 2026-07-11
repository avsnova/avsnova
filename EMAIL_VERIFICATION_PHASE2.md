# Security Center — Phase 2: Email Verification

A modular, credential-based email verification system that plugs into the existing
Security Center architecture (same philosophy as the TOTP Authenticator). Every
credential independently selects its verification method (`None` / `Authenticator`
/ `Email Verification` / `SMS — coming later`). **Nothing is hardcoded** — all
provider and mailbox settings are managed from the Admin Dashboard, so the
development mailbox can be swapped for a production one without touching code.

---

## 1. Phase 1 — Existing email system audit & fix

The mailbox is now configured with working SpaceMail credentials
(`support@bluewaveglobal.online` on `mail.spacemail.com`), **verified live**:
- IMAP `993` SSL — login OK
- SMTP `465` SSL — auth OK (preferred)
- SMTP `587` STARTTLS — auth OK
- Test email sent & queued (`250 Ok`) end-to-end.

These values are **seeded from environment variables into the `settings` table on
first boot** (when no SMTP host is configured) and are then **fully editable from
the Admin Dashboard** — nothing is hardcoded in application logic. The email
system reads the saved DB values (falling back to env for any blank field).

### Default configuration (editable in Admin → Security Center → Email Verification → Email Settings)
| Field | Value |
|---|---|
| Username | `support@bluewaveglobal.online` |
| Password | stored encrypted; editable |
| IMAP | `mail.spacemail.com:993` SSL/TLS |
| SMTP | `mail.spacemail.com:465` SSL/TLS (or `587` STARTTLS) |
| POP3 | `mail.spacemail.com:995` SSL/TLS (optional) |

Improvements to `sendEmail()` (`server/index.js`):
- Loads config from the `settings` table, **merging over `.env`** (blank DB fields
  fall back to env — a partial settings row never breaks working delivery).
- Honors `smtp_secure` (SSL 465 vs STARTTLS 587) and `smtp_sender_name`.
- Respects a global `email_enabled` kill-switch.
- **Retry with backoff** (3 attempts, 1.5s→3s) on transient/connection errors;
  never retries auth failures.
- Connection pooling, clearer logging, and human-readable error reasons.
- Continues to append every message to `./emails.log` as an audit/fallback.

New admin tools (Security Center → Email Verification → **Email Settings**):
- Edit all SMTP + IMAP + POP3 fields (host/port/user/password/SSL/sender).
- **Test Connection** (runs IMAP login **and** SMTP auth together, showing a
  detailed per-protocol pass/fail panel), **Test IMAP**, **Test SMTP**, and
  **Send Test Email** (via the real `sendEmail`).
- Endpoints: `GET/PATCH /api/admin/email/settings`,
  `/settings/test-connection`, `/settings/test-imap`, `/settings/test-smtp`,
  `/settings/send-test`.

---

## 2. Email Provider Manager

Reusable connection profiles. Admin can configure name, IMAP host/port, SMTP
host/port, username, password (app password), SSL/TLS, sender name, sender email,
enable/disable. Creating a mailbox from a provider auto-fills host/port defaults.

Endpoints: `GET/POST/PUT/DELETE /api/admin/email/providers`.

## 3. Mailbox Manager

Each mailbox = one email account the system can read (IMAP) & send from (SMTP):
name, email address, IMAP config, SMTP config, status, last sync, last error,
enable/disable. Multiple mailboxes supported. Per-mailbox testing tools:
**Test IMAP**, **Test SMTP**, **Send Test Email**, **Search Test** (preview
parsed result before assigning rules to customers).

Endpoints: `GET/POST/PUT/DELETE /api/admin/email/mailboxes`,
`/mailboxes/list` (picker), `/mailboxes/:id/test-imap|test-smtp|send-test|search-test`.

Deleting a mailbox is **blocked** while credentials still link to it.

## 4. Credential Registration & Matching Rules

In Credential Inventory → edit a credential → **Email Verification** section:
- Linked Mailbox (required)
- Expected Sender (optional)
- Subject Keywords (comma-separated)
- Body Keywords (comma-separated)
- Maximum Email Age (2 / 5 / 10 / 30 min)

Stored on `inventory_pool` (`auth_type='email'`), reusing the pluggable
`auth_enabled`/`auth_type` columns. Endpoints:
`GET/POST /api/admin/inventory/:id/email-verify`,
`GET /api/admin/inventory/:id/email-verify/activity`.

## 5. Intelligent search & parsing

`server/services/emailVerifyService.js`:
- Connects via **IMAP** (`imapflow`), server-side filters by `SINCE` + optional
  `FROM`, then scans newest-first and applies subject/body keyword rules.
- Returns **only the newest matching email** (not just the latest inbox message),
  enforcing the max-age window strictly.
- Custom zero-dependency **MIME parser** (multipart, base64, quoted-printable).
- `extractCode()` — numeric OTP **and** alphanumeric codes, context-aware
  (ignores URLs, phone numbers, years, order IDs). `extractLink()` — prefers
  verification/confirm links, skips unsubscribe/asset URLs.
- **Passwords encrypted at rest** (AES-256-GCM, key derived from `JWT_SECRET`).
- Full mailbox contents / email source are **never** returned — only the extracted
  code and/or link.

## 6. Customer Security Center integration

`src/components/orders/SecurityCenter.tsx` — the Email tab activates automatically
for accounts using email verification. Shows masked mailbox, **Get Code**, and on
success: **Copy Code**, **Open Link** + **Copy Link** (both shown if the email has
both), last-updated time, and **Refresh**. Graceful "no email yet" guidance.

Endpoint: `POST /api/orders/:orderId/email-verify/code` (owner-only, logged).
`GET /api/orders/:orderId/security` now reports real email status.

## 7. Activity logging (`email_verify_activity`)

Logs mailbox connection, SMTP/IMAP tests, email retrieved, code/link extracted,
failed search, config updated, mailbox enabled/disabled — with timestamp, actor,
IP, mailbox, and detail. Surfaced in Security Center → Email Verification →
**Activity** and the credential edit modal.

## 8. Error handling

`humanizeError()` maps raw errors to meaningful messages: authentication failed,
timeout, connection refused, host not found, TLS/SSL mismatch, command rejected.
Applies to admins (tests) and customers (Get Code).

---

## Database (additive, backward-compatible migrations in `server/db.js`)
- `email_providers`, `mailboxes`, `email_verify_activity` tables.
- `inventory_pool`: `email_verify_mailbox_id`, `email_verify_sender`,
  `email_verify_subject_keywords`, `email_verify_body_keywords`, `email_verify_max_age`.
- `settings`: `smtp_secure`, `smtp_sender_name`, `imap_host`, `imap_port`,
  `imap_secure`, `email_enabled`, `email_default_max_age`.

## Development mailbox
Seed the Spacemail dev box from the Admin Dashboard (Provider + Mailbox), enter
the **correct** password, and click Test IMAP / Test SMTP / Send Test Email.
Later, replace it with any other mailbox entirely from the dashboard — no code
changes required.

## Future methods
SMS verification (and any future method) plugs into the same Security Center via
the `auth_type` discriminator without a redesign.
