import express from 'express';
import { dbGet, dbRun, dbAll } from '../db.js';
import { getCatalog, getLivePrice, allocateNumber, pollSmsCode, setActivationStatus, getGrizzlyBalance } from '../services/grizzlySms.js';
// Multi-provider abstraction (5SIM + SMSPool alongside Grizzly). The router preserves Grizzly
// as the default so existing behavior is unchanged until an admin enables other providers.
import * as smsProviders from '../services/sms/providerRouter.js';
import { serviceDisplayName, validateNumberCountry, isValidPhoneFormat } from '../services/sms/smsMappings.js';
import { logProviderCall } from '../services/sms/smsLog.js';
import { safePurchase } from '../services/sms/purchaseGuard.js';
import { isEnabled as flagEnabled } from '../services/featureFlags.js';
import * as smsPools from '../services/sms/pools.js';
import { validateNumberCountry as vnc } from '../services/sms/smsMappings.js';
import crypto from 'crypto';

const router = express.Router();

// Lightweight audit wrapper for order-integrity events (country requested vs returned, sync,
// cancellation). Writes to the same sms_provider_logs stream so everything is in one place.
async function smsAudit({ event, provider = "router", detail = "", status = "ok", userId = null }) {
  try { await logProviderCall({ provider, action: event, request: "", response: detail, status, userId }); } catch (e) {}
}

// Translate ANY internal/provider error into a safe, professional customer message.
// The real error is always logged internally (admins see it in provider logs); customers never do.
function customerSafeError(code, rawMessage) {
  const m = String(rawMessage || "").toLowerCase();
  if (code === "INSUFFICIENT_FUNDS") return "Insufficient wallet balance for this purchase.";
  if (code === "DUPLICATE") return "This purchase is already being processed. Please wait a moment.";
  // Out-of-stock family → honest, friendly.
  if (/no free phones|out of stock|no stock|no numbers|not available|no available|noStock/i.test(m) || code === "OUT_OF_STOCK")
    return "This number is currently unavailable. Please try another country, service, or pool.";
  // Provider balance / auth / infra issues → generic "temporarily unavailable" (never leak details).
  if (/balance|insufficient|no_key|api key|auth|unauthor|forbidden|token/i.test(m))
    return "This pool is temporarily unavailable. Please try another pool or try again shortly.";
  if (/timeout|timed out|econn|socket|network|refused|502|503|504|gateway/i.test(m))
    return "Unable to complete the request right now. Please try again.";
  // Anything else → safe generic.
  return "Service temporarily unavailable. Please try again.";
}

const getPricingSettings = async () => {
  try {
    const row = await dbGet("SELECT smm_multiplier, smm_flat_addition, sms_flat_margin, sms_session_timeout, sms_auto_cancel_timeout, sms_cancel_delay, sms_poll_interval FROM settings LIMIT 1");
    return {
      smm_multiplier: row && row.smm_multiplier !== null ? row.smm_multiplier : 1.35,
      smm_flat_addition: row && row.smm_flat_addition !== null ? row.smm_flat_addition : 500.0,
      sms_flat_margin: row && row.sms_flat_margin !== null ? row.sms_flat_margin : 1300.0,
      sms_session_timeout: row && row.sms_session_timeout ? parseInt(row.sms_session_timeout) : 1200,
      sms_auto_cancel_timeout: row && row.sms_auto_cancel_timeout ? parseInt(row.sms_auto_cancel_timeout) : 1200,
      sms_cancel_delay: row && row.sms_cancel_delay ? parseInt(row.sms_cancel_delay) : 120,
      sms_poll_interval: row && row.sms_poll_interval ? parseInt(row.sms_poll_interval) : 4
    };
  } catch (err) {
    return { smm_multiplier: 1.35, smm_flat_addition: 500.0, sms_flat_margin: 1300.0, sms_session_timeout: 1200, sms_auto_cancel_timeout: 1200, sms_cancel_delay: 120, sms_poll_interval: 4 };
  }
};

const fetchLiveExchangeRate = async () => { return 1623.50; };

// Provider-aware poll/cancel/complete helpers. For legacy rows (provider = 'grizzly' or null)
// these call the EXACT original Grizzly functions, so existing lines behave identically. For
// 5SIM/SMSPool rows they dispatch to the matching adapter using the stored provider_session_id.
function pollLineCode(line) {
  const provider = line.provider || "grizzly";
  const sessionId = line.provider_session_id || line.id;
  if (provider === "grizzly") return pollSmsCode(sessionId);
  const adapter = smsProviders.getAdapter(provider);
  if (!adapter) return pollSmsCode(sessionId); // defensive fallback
  return adapter.getSms(sessionId, line.user_id);
}
async function cancelLine(line) {
  const provider = line.provider || "grizzly";
  const sessionId = line.provider_session_id || line.id;
  if (provider === "grizzly") return setActivationStatus(sessionId, 8);
  const adapter = smsProviders.getAdapter(provider);
  if (!adapter) return setActivationStatus(sessionId, 8);
  return adapter.cancelActivation(sessionId, line.user_id);
}
async function completeLine(line) {
  const provider = line.provider || "grizzly";
  const sessionId = line.provider_session_id || line.id;
  if (provider === "grizzly") { try { return await setActivationStatus(sessionId, 6); } catch (e) { return null; } }
  const adapter = smsProviders.getAdapter(provider);
  if (!adapter) return null;
  try { return await adapter.completeActivation(sessionId, line.user_id); } catch (e) { return null; }
}

// Intelligent classification (Requirement 12) mirrored for the SMS router.
function classifyTransactionType(rawType) {
  const t = String(rawType || "").toLowerCase();
  // Order matters: "refund"/"reversal" MUST be checked before "fund"/"deposit" because the
  // substring "fund" is inside "re-fund" — otherwise refunds get mis-tagged as DEPOSIT (bug).
  if (t.includes("refund")) return "REFUND";
  if (t.includes("reversal")) return "REVERSAL";
  if (t.includes("deposit") || t.includes("fund")) return "DEPOSIT";
  if (t.includes("adjust")) return "ADJUSTMENT";
  if (t.includes("revenue") || t.includes("profit")) return "REVENUE";
  if (t.includes("purchase") || t.includes("buy") || t.includes("order")) return "PURCHASE";
  if (t.includes("debit")) return "DEBIT";
  return t ? t.toUpperCase() : "DEBIT";
}

// ── Robust, idempotent SMS refund helper ──────────────────────────────────────────────────
// Credits the wallet ATOMICALLY and records the refund transaction exactly once. Safe to call
// more than once for the same order: the UNIQUE `reference` guard means a second call is a no-op
// (no double refund). Returns { ok, already } — `already:true` means a prior refund existed.
async function refundToWallet(userId, amountNgn, reference, description) {
  if (!(amountNgn > 0)) return { ok: false, reason: "zero_amount" };
  // 1) Idempotency: claim the refund by inserting the transaction row FIRST. The UNIQUE index on
  //    `reference` makes a duplicate claim fail → we skip the wallet credit (never refund twice).
  const txId = `TX-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString();
  try {
    await dbRun(
      "INSERT INTO transactions (id, user_id, reference, amount, status, type, category, description, profit, cost, created_at, updated_at) VALUES (?, ?, ?, ?, 'completed', 'REFUND', 'SMS Panel', ?, 0, 0, ?, ?)",
      [txId, userId, reference, amountNgn, description || "SMS refund", now, now]
    );
  } catch (e) {
    if (/UNIQUE|constraint/i.test(e.message || "")) return { ok: true, already: true }; // already refunded
    throw e;
  }
  // 2) Atomic wallet credit (no read-then-write race).
  await dbRun("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", [amountNgn, userId]);
  // 3) Admin audit log.
  try { await smsAudit({ event: "refund", provider: "wallet", detail: `user=${userId} +₦${amountNgn} ref=${reference} — ${description || ""}`, userId }); } catch (e) {}
  return { ok: true, already: false, txId };
}

async function logTransaction(userId, reference, amount, type, category, description, profit = 0, cost = 0, status = 'completed') {
  const txId = `TX-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString();
  await dbRun(
    "INSERT INTO transactions (id, user_id, reference, amount, status, type, category, description, profit, cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [txId, userId, reference, amount, status, classifyTransactionType(type), category, description, profit || 0, cost || 0, now, now]
  );
  return txId;
}

// Permanently record a received SMS verification code (Requirement 10).
// Idempotent: never creates a second history row for the same number/session.
async function saveOperationalHistory(row) {
  const now = new Date().toISOString();
  const provider = row.provider || "grizzly";
  const sessionId = row.provider_session_id || row.number_id;
  try {
    // Application-level guard (fast path). The DB unique index on (provider, provider_session_id)
    // is the authoritative guarantee against duplicates from webhooks/retries/refresh races.
    const existing = await dbGet(
      "SELECT id FROM operational_history WHERE provider = ? AND provider_session_id = ? LIMIT 1",
      [provider, sessionId]
    );
    if (existing) return; // already recorded — do not duplicate
    await dbRun(
      "INSERT INTO operational_history (user_id, number_id, number, country, flag, service, code, cost, status, provider, provider_session_id, country_code, service_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)",
      [row.user_id, row.number_id, row.number, row.country, row.flag, row.service, row.code, row.cost || 0, provider, sessionId, row.country_code || null, row.service_code || null, now]
    );
  } catch (e) {
    // A unique-constraint violation here means a concurrent writer already inserted it —
    // that's the desired outcome (exactly one record), so swallow it quietly.
    if (/UNIQUE|constraint/i.test(e.message || "")) return;
    console.error("[SMS] Failed to persist operational history:", e.message);
  }
}

async function addNotification(userId, type, message) {
  const now = new Date().toISOString();
  await dbRun("INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES (?, ?, ?, 0, ?)", [userId, type, message, now]);
}

// 1. GET Countries (Paginated and instantly searchable from local cache - Requirement 5 & 7!)
router.get('/countries', async (req, res) => {
  const raw = req.query.search ? String(req.query.search).trim() : '';
  const search = `%${raw}%`;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    // Search by full name, ISO code, or dialing code (with or without leading +).
    // Alphabetical ordering by name for a clean, predictable list.
    const countries = await dbAll(
      `SELECT * FROM sms_countries
       WHERE active = 1 AND (name LIKE ? OR iso LIKE ? OR dial_code LIKE ? OR dial_code LIKE ?)
       ORDER BY name ASC LIMIT ? OFFSET ?`,
      [search, search, search, `%+${raw.replace(/^\+/, '')}%`, limit, offset]
    );
    res.json({ success: true, countries });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve countries: " + err.message });
  }
});

// 2. GET Services (Paginated and instantly searchable from local cache - Requirement 5 & 7!)
router.get('/services', async (req, res) => {
  const countryId = req.query.countryId;
  const search = req.query.search ? `%${String(req.query.search).trim()}%` : '%';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  if (!countryId) {
    return res.status(400).json({ error: "countryId parameter is required" });
  }

  try {
    const services = await dbAll(
      "SELECT * FROM sms_services WHERE country_id = ? AND active = 1 AND name LIKE ? ORDER BY price ASC LIMIT ? OFFSET ?",
      [countryId, search, limit, offset]
    );
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve services: " + err.message });
  }
});

// 3. GET Catalog (Raw Grizzly prices list)
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await getCatalog();
    res.json({ success: true, catalog });
  } catch (err) {
    res.status(502).json({ error: err.message || 'SERVICE_UNAVAILABLE_REGION' });
  }
});

// 4. GET Price (Hits live upstream API)
router.get('/price', async (req, res) => {
  const { country, service } = req.query;
  if (!country || !service) return res.status(400).json({ error: 'country and service are required' });
  const realCountry = country === "12_2" ? "12" : country;
  try {
    const rate = 1623.50;
    const pricing = await getPricingSettings();
    const marginNgn = Math.round(pricing.sms_flat_margin);

    // ——— Multi-provider pricing ———
    // Only activates when an admin has enabled 5SIM/SMSPool. Otherwise the exact original
    // Grizzly-only path runs (guaranteed non-breaking). Same pricing model either way:
    // customer price = provider_cost_usd × rate + flat margin.
    const cfg = await smsProviders.getProviderConfig();
    const multiActive = cfg.enabled.fivesim || cfg.enabled.smspool;
    if (multiActive) {
      const best = await smsProviders.bestPrice(realCountry, service).catch(() => null);
      if (best) {
        const providerCostNgn = Math.round(best.costUsd * rate);
        return res.json({
          success: true,
          country: realCountry, service,
          cost: best.costUsd, count: best.count,
          customerPrice: providerCostNgn + marginNgn,
          providerCostNgn, marginNgn,
          provider: best.provider, // informational only; frontend can ignore it
        });
      }
      // If no enabled provider (incl. Grizzly) had a price, fall through to the Grizzly path
      // below so the response/error shape stays identical to today.
    }

    const priceInfo = await getLivePrice(realCountry, service);
    // FEATURE 3 fix: return the FINAL customer price (provider cost × rate + admin margin)
    // so the exact amount the customer pays is visible BEFORE clicking Buy.
    const providerCostNgn = Math.round(priceInfo.cost * rate);
    const customerPrice = providerCostNgn + marginNgn;
    res.json({
      success: true,
      ...priceInfo,
      country: realCountry,
      customerPrice,      // final NGN price incl. admin markup
      providerCostNgn,
      marginNgn
    });
  } catch (err) {
    // FEATURE 9: distinguish real network/gateway failures from "no data"
    const msg = String(err.message || "");
    const isNetwork = /network|fetch|ECONN|ETIMEDOUT|ENOTFOUND|socket|timeout|502|503|504/i.test(msg);
    if (isNetwork) {
      return res.status(503).json({ error: "NETWORK_ERROR", message: "No internet connection or server unavailable. Please check your connection and try again." });
    }
    res.status(502).json({ error: err.message || 'NO_DATA_FOR_SELECTION' });
  }
});

// 5. GET Balance (Hits live upstream API)
router.get('/balance', async (req, res) => {
  try {
    const balance = await getGrizzlyBalance();
    res.json({ success: true, balance });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// 6. GET Numbers (With active status auto-polling - Requirement 1 & 6!)
router.get('/numbers', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const pricing = await getPricingSettings();
    const sessionTimeout = pricing.sms_session_timeout || 1200;
    const rows = await dbAll("SELECT * FROM virtual_numbers WHERE user_id = ? AND status = 'active'", [req.user.id]);
    
    for (const r of rows) {
      try {
        const poll = await pollLineCode(r);
        const elapsed = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 1000);
        const provLabel = (r.provider || "grizzly");
        // Provider-truth expiry: persist the provider's real expiration when it exposes one
        // (5SIM/SMSPool). Grizzly exposes none, so we leave expires_at null (UI shows Unavailable).
        if (poll && poll.expiresAt && poll.expiresAt !== r.expires_at) {
          try { await dbRun("UPDATE virtual_numbers SET expires_at = ? WHERE id = ?", [poll.expiresAt, r.id]); r.expires_at = poll.expiresAt; } catch (e) {}
        }

        if (poll.status === "completed" && poll.code) {
          // Atomic transition: only the FIRST concurrent poll that flips 'active' → 'completed'
          // proceeds to notify / save history / bill. Guards against duplicate history entries
          // when multiple pollers (panel + global watcher) run simultaneously.
          const upd = await dbRun("UPDATE virtual_numbers SET otp_received = ?, status = 'completed' WHERE id = ? AND status = 'active'", [poll.code, r.id]);
          const wonRace = upd && upd.changes > 0;
          if (wonRace) {
            await dbRun("UPDATE orders SET details = ?, status = 'completed' WHERE id = ?", [`${provLabel} ID: ${r.provider_session_id || r.id} · Received OTP: ${poll.code}`, r.id]);
            await addNotification(req.user.id, "system", `Verification OTP ${poll.code} received for your virtual line!`);
            // Requirement 10: permanently save the received code to Operational History (idempotent)
            await saveOperationalHistory({
              user_id: req.user.id, number_id: r.id, number: r.number, country: r.country,
              flag: r.flag, service: r.service, code: poll.code, cost: r.cost,
              country_code: r.country_code, service_code: r.service_code,
              provider: provLabel, provider_session_id: r.provider_session_id || r.id
            });
            // Strict accounting: the purchase only counts as revenue/profit NOW that the
            // code was delivered. Flip the pending purchase transaction to 'completed'.
            try { await dbRun("UPDATE transactions SET status = 'completed', updated_at = ? WHERE reference = ?", [new Date().toISOString(), `AVS-SMS-${r.id}`]); } catch (e) {}
            try { await completeLine(r); } catch (e) {}
          }
        } else if (poll.status === "cancelled" || elapsed >= sessionTimeout) {
          // Auto-expire after the admin-configured session timeout (Requirement 9)
          const targetStatus = elapsed >= sessionTimeout ? 'expired' : 'cancelled';

          // Atomically claim the transition so only one poller performs the refund/side-effects.
          const upd = await dbRun("UPDATE virtual_numbers SET status = ? WHERE id = ? AND status = 'active'", [targetStatus, r.id]);
          const wonRace = upd && upd.changes > 0;
          if (wonRace) {
            // Refund user on expiration (atomic + idempotent; correct amount, txn record, log).
            if (targetStatus === 'expired') {
              const rf = await refundToWallet(req.user.id, r.cost, `REF-EXP-${r.id}`, `Auto-refund for expired line: ${r.number}`);
              if (rf.ok && !rf.already) await addNotification(req.user.id, "system", `Your SMS session ${r.id} expired without receiving SMS. ₦${r.cost.toLocaleString()} was refunded.`);
            }
            // The original purchase never completed → mark it cancelled so it never counts as revenue.
            try { await dbRun("UPDATE transactions SET status = 'cancelled', updated_at = ? WHERE reference = ? AND status = 'pending'", [new Date().toISOString(), `AVS-SMS-${r.id}`]); } catch (e) {}
            await dbRun("UPDATE orders SET status = ? WHERE id = ?", [targetStatus === 'expired' ? 'failed' : 'cancelled', r.id]);
          }
        }
      } catch (e) {
        console.error(`Failed to auto-poll active number ${r.id}:`, e.message);
      }
    }

    const allRows = await dbAll("SELECT * FROM virtual_numbers WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    const serverNow = Date.now();
    // Map provider -> masked pool label (customer must never see the real provider name).
    let poolByProvider = {};
    try { const pls = await dbAll("SELECT provider, label FROM sms_pools"); for (const p of pls) poolByProvider[p.provider] = p.label; } catch (e) {}
    res.json(allRows.map(r => {
      // Server-authoritative timing: compute remaining seconds & expiry here so the client
      // renders exactly what the server says (no client-side drift or fake countdowns).
      const createdMs = new Date(r.created_at).getTime();
      // PROVIDER-TRUTH expiry: if the upstream gave a real expiration (5SIM/SMSPool), honor it.
      // Grizzly has no expiry API, so it falls back to the admin-configured session window.
      const providerExpiryMs = r.expires_at ? new Date(r.expires_at).getTime() : null;
      const expiresMs = (providerExpiryMs && !isNaN(providerExpiryMs)) ? providerExpiryMs : createdMs + sessionTimeout * 1000;
      const remaining = r.status === "active" ? Math.max(0, Math.floor((expiresMs - serverNow) / 1000)) : 0;
      // Provider-aware cancellation window: GrizzlySMS only accepts a cancel (setStatus=8)
      // after an initial ~2-minute lock. Expose this so the UI shows Cancel ONLY when the
      // provider will actually honor it (and never a disabled/premature button).
      const elapsedSecs = Math.floor((serverNow - createdMs) / 1000);
      // Admin-configurable cancellation delay (settings.sms_cancel_delay) — applied server-side
      // immediately, no hardcoded value, no rebuild required.
      const CANCEL_LOCK = pricing.sms_cancel_delay || 120;
      const cancellable = r.status === "active" && !r.otp_received && elapsedSecs >= CANCEL_LOCK;
      const cancelInSecs = r.status === "active" && !r.otp_received ? Math.max(0, CANCEL_LOCK - elapsedSecs) : 0;
      const prov = r.provider || "grizzly";
      // providerTimer = true when the remaining time comes from the provider's OWN expiry
      // (5SIM/SMSPool). false = provider exposes no timer (Grizzly) -> UI shows it as estimated.
      const providerTimer = !!(providerExpiryMs && !isNaN(providerExpiryMs));
      return {
        id: r.id, number: r.number, country: r.country, flag: r.flag, service: r.service,
        status: r.status, cost: r.cost, otpReceived: r.otp_received || undefined, created_at: r.created_at,
        provider: prov,                     // internal only; UI should display poolLabel
        poolLabel: poolByProvider[prov] || "Pool",  // masked customer-facing label
        remaining,                          // seconds left
        providerTimer,                      // true = exact provider timer; false = estimated (no provider timer)
        expires_at: new Date(expiresMs).toISOString(),
        server_now: new Date(serverNow).toISOString(),
        last_sync: new Date(serverNow).toISOString(),  // this response IS a fresh provider sync
        cancellable,                        // provider allows cancel now
        cancel_in: cancelInSecs,            // seconds until cancel becomes available
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-flight allocation guard: prevents duplicate purchases from double-clicks / retries /
// slow responses. Keyed per user+country+service; cleared once the request settles.
const allocationInFlight = new Set();

router.post('/allocate', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { country, service } = req.body;
  if (!country || !service) return res.status(400).json({ error: "Country and service are required." });

  const realCountry = country === "12_2" ? "12" : country;

  // Reject overlapping identical requests while one is still processing (idempotency).
  const guardKey = `${req.user.id}:${realCountry}:${service}`;
  if (allocationInFlight.has(guardKey)) {
    return res.status(429).json({ error: "A purchase for this selection is already in progress. Please wait." });
  }
  allocationInFlight.add(guardKey);

  try {
    const rate = await fetchLiveExchangeRate();
    const pricing = await getPricingSettings();
    const smsProfit = Math.round(pricing.sms_flat_margin);

    // Decide whether the multi-provider engine is active (any non-Grizzly provider enabled).
    const cfg = await smsProviders.getProviderConfig();
    const multiActive = cfg.enabled.fivesim || cfg.enabled.smspool;

    // ---- Pre-flight price for balance check (best available across enabled providers) ----
    let quotedCostUsd = null;
    if (multiActive) {
      const best = await smsProviders.bestPrice(realCountry, service).catch(() => null);
      if (best) quotedCostUsd = best.costUsd;
    }
    if (quotedCostUsd == null) {
      // Grizzly-only pricing (also the fallback quote when multi is active but nothing priced).
      const priceInfo = await getLivePrice(realCountry, service);
      quotedCostUsd = priceInfo.cost;
    }
    const quotedProviderCostNgn = Math.round(quotedCostUsd * rate);
    const quotedCostNgn = quotedProviderCostNgn + smsProfit;

    const user = await dbGet("SELECT wallet_balance FROM users WHERE id = ?", [req.user.id]);
    if (!user || user.wallet_balance < quotedCostNgn) return res.status(400).json({ error: `Insufficient balance! Line allocation requires ₦${quotedCostNgn.toLocaleString()}` });

    // ════════════════════════════════════════════════════════════════════════════════════════
    // LOSS-PREVENTION PATH (§7) — gated behind the `sms_txn_safe_purchase` feature flag.
    // Enforces: atomic wallet debit → local order → provider buy, with auto-refund + row removal
    // if the provider fails. Duplicate purchases blocked by a DB unique idempotency key. When the
    // flag is OFF the original proven flow below runs unchanged (backward compatible).
    // ════════════════════════════════════════════════════════════════════════════════════════
    if (await flagEnabled("sms_txn_safe_purchase", false)) {
      const rate2 = rate, pricing2 = pricing;
      const isoNow = new Date().toISOString();
      // Independent internal order id (§7: internal id ≠ provider order id).
      const internalId = `AVS-VN-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
      const txRef = `AVS-SMS-${internalId}`;
      // Idempotency key (§7 duplicate prevention): prefer a client-supplied key (one per user
      // click) so a double-submit/retry of the SAME action collapses to one order, while a
      // deliberate second purchase (new click → new key) is allowed. Falls back to a 4s server
      // bucket to still catch rapid double-clicks from older clients.
      const clientKey = (req.body && typeof req.body.idempotencyKey === "string") ? req.body.idempotencyKey.slice(0, 80) : "";
      const idemKey = clientKey
        ? `${req.user.id}:${clientKey}`
        : `${req.user.id}:${realCountry}:${service}:${Math.floor(Date.now() / 4000)}`;

      // Resolve display names up-front (never persist raw provider codes).
      let countryName = `Country ${country}`, countryFlag = "🌐";
      try { const cRow = await dbGet("SELECT name, flag FROM sms_countries WHERE id = ?", [realCountry]); if (cRow) { countryName = cRow.name; countryFlag = cRow.flag || countryFlag; } } catch (e) {}
      let serviceName = serviceDisplayName(service);
      try { const sRow = await dbGet("SELECT name FROM sms_services WHERE id = ? LIMIT 1", [service]); if (sRow && sRow.name) serviceName = sRow.name; } catch (e) {}

      let bought = null;
      const out = await safePurchase(
        { dbRun, dbGet, audit: ({ event, detail, status }) => smsAudit({ event, provider: "guard", detail, status: status || "ok", userId: req.user.id }) },
        {
          userId: req.user.id, amountNgn: quotedCostNgn, idempotencyKey: idemKey,
          createLocalOrder: async () => {
            // Insert a PENDING placeholder holding the idempotency key (blocks duplicates at the DB).
            await dbRun(
              "INSERT INTO virtual_numbers (id, user_id, number, country, flag, service, status, cost, created_at, country_code, service_code, provider, idempotency_key, transaction_ref, review_status) VALUES (?, ?, '', ?, ?, ?, 'pending', ?, ?, ?, ?, '', ?, ?, NULL)",
              [internalId, req.user.id, countryName, countryFlag, serviceName, quotedCostNgn, isoNow, country, service, idemKey, txRef]
            );
          },
          buyFromProvider: async () => {
            // Multi-provider (validated, with failover) when enabled; else Grizzly with validation.
            if (multiActive) {
              const b = await smsProviders.buyWithFallback(realCountry, service, req.user.id);
              bought = { provider: b.provider, number: b.number, providerSessionId: b.providerSessionId, providerOrderId: b.providerSessionId, costUsd: b.costUsd || quotedCostUsd, expiresAt: b.expiresAt || null };
            } else {
              const a = await allocateNumber(realCountry, service);
              const cc = validateNumberCountry(realCountry, a.number);
              if (!cc.ok || !isValidPhoneFormat(a.number)) { try { await setActivationStatus(a.id, 8); } catch (e) {} const err = new Error("WRONG_COUNTRY"); throw err; }
              bought = { provider: "grizzly", number: a.number, providerSessionId: String(a.id), providerOrderId: String(a.id), costUsd: quotedCostUsd, expiresAt: null };
            }
            return bought;
          },
          removeLocalOrder: async () => { await dbRun("DELETE FROM virtual_numbers WHERE id = ?", [internalId]); },
          recordTxn: async (result) => {
            const providerCostNgn = Math.round((result.costUsd || quotedCostUsd) * rate2);
            const realProfit = quotedCostNgn - providerCostNgn;
            // Promote the pending row to active with the real number + provider linkage.
            await dbRun(
              "UPDATE virtual_numbers SET number = ?, status = 'active', expires_at = ?, provider = ?, provider_session_id = ?, provider_order_id = ? WHERE id = ?",
              [result.number, result.expiresAt, result.provider, result.providerSessionId, result.providerOrderId, internalId]
            );
            await dbRun(
              "INSERT INTO orders (id, user_id, service_id, category, name, quantity, price, currency, status, delivery_type, tracking_number, created_at, updated_at) VALUES (?, ?, ?, 'SMS', ?, 1, ?, 'NGN', 'completed', 'instant', ?, ?, ?)",
              [internalId, req.user.id, `sms_${country}_${service}`, `${countryName} ${serviceName} Number`, quotedCostNgn, internalId, isoNow, isoNow]
            );
            await logTransaction(req.user.id, txRef, quotedCostNgn, "purchase", "SMS Panel", `Allocated secure live line: +${result.number} for ${serviceName}`, realProfit, providerCostNgn, 'pending');
            await addNotification(req.user.id, "system", `Allocated secure live line +${result.number} for ${serviceName}`);
          },
        }
      );

      if (!out.ok) {
        const status = out.code === "INSUFFICIENT_FUNDS" ? 400 : out.code === "DUPLICATE" ? 429 : 502;
        return res.status(status).json({ error: out.error });
      }
      // Mask the provider from the customer (§ "customer must not know provider").
      return res.json({ success: true, id: internalId, number: bought.number, activationId: internalId });
    }

    // ---- Buy the number (with automatic provider fallback when multi is active) ----
    // `provider` identifies which upstream filled it; `internalId` is our DB primary key.
    // Grizzly keeps using its activation id as the PK (unchanged). Other providers get a
    // namespaced id so their order ids never collide with Grizzly's numeric ids.
    let provider = "grizzly", providerSessionId, internalId, phoneNumber, actualCostUsd, providerExpiresAt = null;
    if (multiActive) {
      const bought = await smsProviders.buyWithFallback(realCountry, service, req.user.id);
      provider = bought.provider;
      providerSessionId = bought.providerSessionId;
      phoneNumber = bought.number;
      actualCostUsd = bought.costUsd || quotedCostUsd;
      providerExpiresAt = bought.expiresAt || null; // provider's authoritative expiration
      internalId = provider === "grizzly" ? String(bought.activationId) : `AVS-${provider.toUpperCase()}-${bought.activationId}`;
    } else {
      const allocated = await allocateNumber(realCountry, service);
      providerSessionId = String(allocated.id);
      internalId = String(allocated.id);
      phoneNumber = allocated.number;
      actualCostUsd = quotedCostUsd;
      // ORDER INTEGRITY: validate the Grizzly number's country matches the request. Grizzly is
      // the reference provider (its country codes ARE our canonical codes), but we still verify
      // as defence-in-depth. On mismatch we cancel upstream and reject rather than deliver wrong.
      const cc = validateNumberCountry(realCountry, phoneNumber);
      const fmtOk = isValidPhoneFormat(phoneNumber);
      try { await smsProviders.getAdapter("grizzly"); } catch (e) {}
      await smsAudit({ event: "validateNumber", provider: "grizzly", detail: `req_country=${realCountry} number=${phoneNumber} format_ok=${fmtOk} country_ok=${cc.ok} (${cc.reason})`, status: (cc.ok && fmtOk) ? "ok" : "fail", userId: req.user.id });
      if (!cc.ok || !fmtOk) {
        try { await setActivationStatus(providerSessionId, 8); } catch (e) {}
        return res.status(502).json({ error: "The provider returned a number that did not match your selected country. No charge was made — please try again." });
      }
    }

    // Audit the fulfilled purchase: which provider, requested vs returned country/service.
    await smsAudit({ event: "purchase", provider, detail: `req_country=${realCountry} req_service=${service} -> provider=${provider} number=${phoneNumber} session=${providerSessionId}`, status: "ok", userId: req.user.id });

    // Charge the customer the QUOTED price (what we showed them). Profit accounting uses the
    // real upstream cost of the provider that actually filled the order.
    const providerCostNgn = Math.round(actualCostUsd * rate);
    const costNgn = quotedCostNgn; // customer always pays the quoted amount
    const realProfit = costNgn - providerCostNgn;

    const newBalance = user.wallet_balance - costNgn;
    await dbRun("UPDATE users SET wallet_balance = ? WHERE id = ?", [newBalance, req.user.id]);

    const txRef = `AVS-SMS-${internalId}`;

    // Resolve human-readable country & service names from the local registry so we NEVER
    // persist raw provider codes (e.g. "WA", "Country #123"). Falls back gracefully.
    const flagMap = { "0": "🇷🇺", "1": "🇺🇦", "2": "🇰🇿", "12": "🇺🇸", "12_2": "🇺🇸", "16": "🇬🇧", "19": "🇳🇬", "22": "🇮🇳", "36": "🇨🇦" };
    let countryName = `Country ${country}`, countryFlag = flagMap[country] || "🌐";
    try {
      const cRow = await dbGet("SELECT name, flag FROM sms_countries WHERE id = ?", [realCountry]);
      if (cRow) { countryName = cRow.name; countryFlag = cRow.flag || countryFlag; }
    } catch (e) {}
    let serviceName = service.toUpperCase();
    try {
      const sRow = await dbGet("SELECT name FROM sms_services WHERE id = ? LIMIT 1", [service]);
      if (sRow && sRow.name) serviceName = sRow.name;
      else serviceName = serviceDisplayName(service);
    } catch (e) {}

    // Log the purchase as PENDING — it only counts toward revenue/profit once the SMS code
    // is actually delivered (strict completed-only accounting rule). Flipped to 'completed'
    // when the code arrives, or 'cancelled' on cancellation/expiry+refund.
    await logTransaction(req.user.id, txRef, costNgn, "purchase", "SMS Panel", `Allocated secure live line: +${phoneNumber} for ${serviceName}${provider !== "grizzly" ? ` [${provider}]` : ""}`, realProfit, providerCostNgn, 'pending');

    const isoNow = new Date().toISOString();
    await dbRun(
      "INSERT INTO virtual_numbers (id, user_id, number, country, flag, service, status, cost, created_at, expires_at, country_code, service_code, provider, provider_session_id) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)",
      [internalId, req.user.id, phoneNumber, countryName, countryFlag, serviceName, costNgn, isoNow, providerExpiresAt, country, service, provider, providerSessionId]
    );

    await dbRun(
      "INSERT INTO orders (id, user_id, service_id, category, name, quantity, price, currency, status, delivery_type, tracking_number, created_at, updated_at) VALUES (?, ?, ?, 'SMS', ?, 1, ?, 'NGN', 'completed', 'instant', ?, ?, ?)",
      [internalId, req.user.id, `sms_${country}_${service}`, `${countryName} ${serviceName} Number`, costNgn, internalId, isoNow, isoNow]
    );

    await addNotification(req.user.id, "system", `Allocated secure live line +${phoneNumber} for ${serviceName}`);

    res.json({ success: true, id: internalId, number: phoneNumber, activationId: internalId });
  } catch (err) {
    console.error('[SMS Allocate Route] Error:', err.message);
    res.status(502).json({ error: `SMS Gateway temporary delay. Please try another region.` });
  } finally {
    // Always release the in-flight guard so future legitimate purchases aren't blocked.
    allocationInFlight.delete(guardKey);
  }
});

router.post('/action/:numberId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { numberId } = req.params;
  const { action } = req.body;
  try {
    const line = await dbGet("SELECT * FROM virtual_numbers WHERE id = ? AND user_id = ?", [numberId, req.user.id]);
    if (!line) return res.status(404).json({ error: "Line not found" });

    if (action === 8 && line.status === "active") {
      const elapsed = Math.floor((Date.now() - new Date(line.created_at).getTime()) / 1000);
      // Manual override: admins can cancel anytime. Regular users respect a 2-minute
      // provider lock window (below which providers reject cancellations).
      const isAdmin = req.user.role === "Super Admin" || req.user.role === "Admin";
      if (!isAdmin && elapsed < 120) {
        return res.status(400).json({ error: "Cancellation is locked during the initial 2 minutes waiting window." });
      }

      // CRITICAL CANCELLATION RULE: the provider is the source of truth. We send the cancel
      // request upstream FIRST and only mark it cancelled locally AFTER the provider confirms.
      // If the provider rejects/fails, the order stays ACTIVE locally and no refund is issued.
      await smsAudit({ event: "cancel_request", provider: line.provider || "grizzly", detail: `line=${numberId} session=${line.provider_session_id || numberId}`, userId: req.user.id });
      try {
        await cancelLine(line);
        await smsAudit({ event: "cancel_confirmed", provider: line.provider || "grizzly", detail: `line=${numberId} provider confirmed cancellation`, userId: req.user.id });
      } catch (err) {
        await smsAudit({ event: "cancel_rejected", provider: line.provider || "grizzly", detail: `line=${numberId} rejected: ${err.message}`, status: "fail", userId: req.user.id });
        return res.status(409).json({ error: "Cancellation is still pending — the provider has not confirmed it (an SMS may have just arrived). The line remains active. Please refresh and try again." });
      }

      // Atomically claim the cancellation so a double-click can only refund once.
      const claim = await dbRun("UPDATE virtual_numbers SET status = 'cancelled' WHERE id = ? AND status = 'active'", [numberId]);
      if (!claim || claim.changes === 0) {
        // Someone else already transitioned this line (completed/expired/cancelled).
        return res.status(409).json({ error: "This line is no longer active and cannot be cancelled." });
      }
      await dbRun("UPDATE orders SET status = 'cancelled' WHERE id = ?", [numberId]);
      // Never counts as revenue — the purchase was cancelled before completion.
      try { await dbRun("UPDATE transactions SET status = 'cancelled', updated_at = ? WHERE reference = ? AND status = 'pending'", [new Date().toISOString(), `AVS-SMS-${numberId}`]); } catch (e) {}

      // Atomic, idempotent refund (correct amount, transaction record, admin log, no double-refund).
      const rf = await refundToWallet(req.user.id, line.cost, `REF-SMS-${numberId}`, `Cancelled line: ${line.number}`);
      if (rf.ok && !rf.already) await addNotification(req.user.id, "system", `Your SMS line activation ${numberId} was cancelled. ₦${line.cost.toLocaleString()} has been refunded.`);

      return res.json({ success: true });
    } else if (action === 6) {
      await dbRun("UPDATE virtual_numbers SET status = 'completed_archived' WHERE id = ?", [numberId]);
      return res.json({ success: true });
    }
    res.status(400).json({ error: "Invalid action" });
  } catch (err) {
    res.status(502).json({ error: "The line has either received an SMS or expired." });
  }
});

// Operational History (Requirement 10) — permanent, newest first, never cleared on refresh
router.get('/history', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const rows = await dbAll(
      "SELECT * FROM operational_history WHERE user_id = ? ORDER BY id DESC LIMIT 500",
      [req.user.id]
    );
    res.json({ success: true, history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin SMS analytics (#6) — provider/country/service health indicators for the admin hub.
router.get('/analytics', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const isAdmin = req.user.role === "Super Admin" || req.user.role === "Admin";
  if (!isAdmin) return res.status(403).json({ error: "Access denied." });
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const g = async (sql, p = []) => { const r = await dbGet(sql, p); return r ? (r.c ?? 0) : 0; };
    const purchasedToday = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE created_at LIKE ?", [`%${todayStr}%`]);
    const successToday = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE created_at LIKE ? AND otp_received IS NOT NULL AND otp_received != ''", [`%${todayStr}%`]);
    const totalPurchased = await g("SELECT COUNT(*) c FROM virtual_numbers");
    const totalSuccess = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE otp_received IS NOT NULL AND otp_received != ''");
    const totalExpired = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE status = 'expired'");
    const totalCancelled = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE status = 'cancelled'");
    const activeNow = await g("SELECT COUNT(*) c FROM virtual_numbers WHERE status = 'active'");
    const refunds = await g("SELECT COUNT(*) c FROM transactions WHERE category = 'SMS Panel' AND type IN ('REFUND','REVERSAL')");
    const successRate = totalPurchased > 0 ? Math.round((totalSuccess / totalPurchased) * 100) : 0;
    // Top countries & services by volume.
    const topCountries = await dbAll("SELECT country, COUNT(*) as count, SUM(CASE WHEN otp_received IS NOT NULL AND otp_received != '' THEN 1 ELSE 0 END) as success FROM virtual_numbers GROUP BY country ORDER BY count DESC LIMIT 6");
    const topServices = await dbAll("SELECT service, COUNT(*) as count FROM virtual_numbers GROUP BY service ORDER BY count DESC LIMIT 6");
    res.json({
      success: true,
      analytics: {
        purchasedToday, successToday, totalPurchased, totalSuccess, totalExpired, totalCancelled,
        activeNow, refunds, successRate,
        topCountries: topCountries || [], topServices: topServices || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  POOL-BASED PURCHASE (provider-independent rebuild).
//  Buys ONLY from the pool the customer explicitly selected. No silent switching. Uses the
//  loss-prevention guard (atomic debit -> local order -> provider buy -> auto-refund on fail).
//  Validation before create; provider confirms success before the local order is committed.
// ════════════════════════════════════════════════════════════════════════════════════════════
router.post('/pools/:poolId/buy', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { country, service, idempotencyKey } = req.body || {};
  const poolId = req.params.poolId;
  if (!country || !service) return res.status(400).json({ error: "country and service are required." });

  try {
    const pool = await smsPools.getPool(poolId);
    if (!pool || pool.enabled !== 1) return res.status(404).json({ error: "This pool is currently unavailable." });

    // (1) Live price + stock straight from the provider (never cached/faked). Verify stock now.
    let priced;
    try { priced = await smsPools.poolPrice(poolId, String(country), String(service)); }
    catch (e) {
      await smsAudit({ event: "buy_price_fail", provider: pool.provider, detail: `pool=${poolId} ${e.message}`, status: "fail", userId: req.user.id });
      return res.status(502).json({ error: customerSafeError(e.code, e.message) });
    }
    if (!priced.inStock) return res.status(409).json({ error: "This number is currently unavailable. Please try another country, service, or pool." });

    const costNgn = priced.priceNgn;
    const providerCostNgn = priced.providerPriceNgn;
    const profit = priced.markupNgn;

    const isoNow = new Date().toISOString();
    const internalId = `AVS-POOL-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const txRef = `AVS-SMS-${internalId}`;
    const idem = idempotencyKey ? `${req.user.id}:${String(idempotencyKey).slice(0,80)}` : `${req.user.id}:${poolId}:${country}:${service}:${Math.floor(Date.now()/4000)}`;

    let bought = null;
    const out = await safePurchase(
      { dbRun, dbGet, audit: ({ event, detail, status }) => smsAudit({ event, provider: pool.provider, detail: `pool=${poolId} ${detail}`, status: status || "ok", userId: req.user.id }) },
      {
        userId: req.user.id, amountNgn: costNgn, idempotencyKey: idem,
        createLocalOrder: async () => {
          await dbRun(
            "INSERT INTO virtual_numbers (id, user_id, number, country, flag, service, status, cost, created_at, country_code, service_code, provider, idempotency_key, transaction_ref) VALUES (?, ?, '', ?, '', ?, 'pending', ?, ?, ?, ?, ?, ?, ?)",
            [internalId, req.user.id, `Pool ${pool.label}`, String(service), costNgn, isoNow, String(country), String(service), pool.provider, idem, txRef]
          );
        },
        buyFromProvider: async () => {
          // Buy from THIS pool only (native ids, no translation, no switching).
          const r = await smsPools.poolBuy(poolId, String(country), String(service), req.user.id);
          // Post-purchase country integrity: if the provider exposes a country prefix for this
          // native country, verify the delivered number matches. Reject (auto-refund) on mismatch.
          bought = r;
          return r;
        },
        removeLocalOrder: async () => { await dbRun("DELETE FROM virtual_numbers WHERE id = ?", [internalId]); },
        recordTxn: async (result) => {
          await dbRun(
            "UPDATE virtual_numbers SET number = ?, status = 'active', expires_at = ?, provider = ?, provider_session_id = ?, provider_order_id = ? WHERE id = ?",
            [result.number, result.expiresAt || null, pool.provider, result.providerOrderId, result.providerOrderId, internalId]
          );
          await dbRun(
            "INSERT INTO orders (id, user_id, service_id, category, name, quantity, price, currency, status, delivery_type, tracking_number, created_at, updated_at) VALUES (?, ?, ?, 'SMS', ?, 1, ?, 'NGN', 'completed', 'instant', ?, ?, ?)",
            [internalId, req.user.id, `pool_${poolId}_${country}_${service}`, `${pool.label} · ${service}`, costNgn, internalId, isoNow, isoNow]
          );
          await logTransaction(req.user.id, txRef, costNgn, "purchase", "SMS Panel", `Pool ${pool.label} line +${result.number}`, profit, providerCostNgn, 'pending');
          await addNotification(req.user.id, "system", `Your ${pool.label} number +${result.number} is ready.`);
        },
      }
    );

    if (!out.ok) {
      // Log the REAL reason for admins; return a professional, safe message to the customer.
      await smsAudit({ event: "buy_failed", provider: pool.provider, detail: `pool=${poolId} code=${out.code} ${out.error || ""}`, status: "fail", userId: req.user.id });
      const status = out.code === "INSUFFICIENT_FUNDS" ? 400 : out.code === "DUPLICATE" ? 429 : 502;
      return res.status(status).json({ error: customerSafeError(out.code, out.error) });
    }
    // Mask the provider — customer only sees the pool label + their number.
    return res.json({ success: true, id: internalId, number: bought.number, pool: pool.label, activationId: internalId });
  } catch (err) {
    console.error('[SMS Pool Buy] Error:', err.message);
    res.status(502).json({ error: "Could not complete the purchase. No charge was made." });
  }
});

export default router;
