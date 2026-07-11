import crypto from "crypto";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

/**
 * Email Verification service — Security Center Phase 2.
 *
 * Pluggable "auth method" that mirrors the TOTP architecture: each credential
 * independently selects Email Verification and links a mailbox + matching rules.
 *
 * Responsibilities:
 *  - AES-256-GCM encryption of mailbox/provider passwords at rest.
 *  - IMAP connection testing + intelligent, rule-based newest-matching-email search.
 *  - Robust parsing of verification CODES (numeric/alphanumeric) and LINKS.
 *  - SMTP connection testing + test-email sending.
 *
 * Security: the raw mailbox password and full email source are NEVER returned to
 * customers. Only the extracted code / link (and a masked sender/subject for
 * admins) leave this module.
 */

// ---------------------------------------------------------------------------
// Encryption at rest (shares the JWT_SECRET-derived key strategy as TOTP).
// Format: v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
// ---------------------------------------------------------------------------
function encKey() {
  const base = process.env.JWT_SECRET || process.env.MAIL_ENC_KEY || "avs_mail_default_key";
  return crypto.createHash("sha256").update("mail:" + base).digest();
}
export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}
export function decryptSecret(enc) {
  if (!enc) return "";
  const parts = String(enc).split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    // Backward-compat: treat as plaintext if it isn't in our format.
    return String(enc);
  }
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const ct = Buffer.from(parts[3], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Mask an email address for display: jo***@ex***.com
export function maskEmail(addr) {
  const s = String(addr || "").trim();
  const at = s.indexOf("@");
  if (at < 1) return s ? s[0] + "***" : "";
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const maskLocal = local.length <= 2 ? local[0] + "*" : local.slice(0, 2) + "***";
  const dot = domain.lastIndexOf(".");
  const maskDomain = dot > 1 ? domain.slice(0, 2) + "***" + domain.slice(dot) : domain.slice(0, 1) + "***";
  return `${maskLocal}@${maskDomain}`;
}

// ---------------------------------------------------------------------------
// Parsing — extract verification code(s) and link(s) from an email body.
// ---------------------------------------------------------------------------

// Strip HTML → readable text (keep href links so they can be extracted).
function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  // Preserve href targets inline so URL extraction still works after tag stripping.
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, " $1 ");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|td|h\d|li)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
  return s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// FORWARDED EMAIL DETECTION (modular)
// If a verification email is forwarded into our mailbox, the real sender/recipient/
// subject live inside the quoted forwarded block. We detect the forward boundary,
// parse the inner original headers, and strip the forwarding chrome so downstream
// parsing behaves as if the original arrived directly. Multiple formats supported.
// ---------------------------------------------------------------------------
const FORWARD_MARKERS = [
  /-{2,}\s*forwarded message\s*-{2,}/i,
  /begin forwarded message[:\s]/i,
  /-{2,}\s*original message\s*-{2,}/i,
  /^\s*forwarded message\s*$/im,
];

// Returns { isForwarded, boundaryIndex, original: { from, to, subject, date } }
export function detectForwarded(text) {
  const s = String(text || "");
  if (!s) return { isForwarded: false };
  let boundaryIndex = -1;
  for (const re of FORWARD_MARKERS) {
    const m = s.match(re);
    if (m && (boundaryIndex === -1 || (m.index ?? 0) < boundaryIndex)) boundaryIndex = m.index ?? -1;
  }
  // Also handle Gmail/Outlook "On <date>, <name> <addr> wrote:" quoting.
  if (boundaryIndex === -1) {
    const onWrote = s.match(/On .{3,80}?<[^>]+@[^>]+>\s*wrote:/i);
    if (onWrote) boundaryIndex = onWrote.index ?? -1;
  }
  if (boundaryIndex === -1) return { isForwarded: false };

  // Parse the original headers that typically follow the marker.
  const after = s.slice(boundaryIndex);
  const grab = (label) => {
    const m = after.match(new RegExp(`^\\s*${label}\\s*:?\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  const addr = (v) => { const m = String(v).match(/[^\s<>"]+@[^\s<>"]+/); return m ? m[0].toLowerCase() : String(v).trim().toLowerCase(); };
  const fromRaw = grab("From");
  const toRaw = grab("To");
  const subject = grab("Subject");
  const date = grab("Date") || grab("Sent");

  return {
    isForwarded: true,
    boundaryIndex,
    original: {
      from: fromRaw ? addr(fromRaw) : "",
      to: toRaw ? addr(toRaw) : "",
      subject: subject || "",
      date: date || "",
    },
  };
}

// Given the full body text, return the ORIGINAL message content when forwarded
// (strips the forwarding chrome), else the text unchanged.
export function stripForwardingChrome(text) {
  const det = detectForwarded(text);
  if (!det.isForwarded) return { text, forwarded: null };
  const inner = String(text).slice(det.boundaryIndex);
  // Drop the header lines (From/To/Subject/Date) so the body scan starts at content.
  const body = inner.replace(/^\s*(from|to|subject|date|sent|reply-to|cc)\s*:.*$/gim, "").trim();
  return { text: body || inner, forwarded: det.original };
}

// Extract the most likely verification link (http/https). Prefers URLs that look
// like verification/confirmation links; falls back to the first URL found.
export function extractLink(text, html) {
  const sources = [];
  if (html) {
    const re = /href\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) sources.push(m[1]);
  }
  const urlRe = /https?:\/\/[^\s"'<>)\]]+/gi;
  const plain = String(text || "");
  let m;
  while ((m = urlRe.exec(plain))) sources.push(m[0]);

  const urls = sources
    .map((u) => u.trim().replace(/[.,;:]+$/, ""))
    .filter((u) => /^https?:\/\//i.test(u))
    // Ignore obvious tracking/unsubscribe/image assets.
    .filter((u) => !/unsubscribe|\.(png|jpe?g|gif|svg|css|js|ico)(\?|$)/i.test(u));

  if (urls.length === 0) return null;
  const KEYS = /(verif|confirm|activate|validate|login|signin|sign-in|magic|token|code|auth|secure|reset|approve|authorize|continue)/i;
  const preferred = urls.find((u) => KEYS.test(u));
  return unwrapTrackingUrl(preferred || urls[0]);
}

// Resolve common tracking/redirect wrappers to the final destination when the real
// URL is carried in a query param (e.g. ...?url=<encoded>, ?u=, ?target=, ?redirect=).
export function unwrapTrackingUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const WRAP_HOSTS = /(sendgrid|mailchimp|list-manage|mandrillapp|sparkpostmail|hubspot|click|track|link|awstrack|mailgun|customeriomail|braze|salesforce|exct)/i;
    const PARAMS = ["url", "u", "target", "redirect", "redirect_uri", "destination", "dest", "link", "q"];
    if (WRAP_HOSTS.test(u.hostname) || u.pathname.includes("/ls/click") || u.pathname.includes("/wf/click")) {
      for (const p of PARAMS) {
        const v = u.searchParams.get(p);
        if (v && /^https?:/i.test(decodeURIComponent(v))) return decodeURIComponent(v);
      }
    }
  } catch (e) { /* not a parseable URL — return as-is */ }
  return url;
}

// ---------------------------------------------------------------------------
// CONFIDENCE-RANKED CODE EXTRACTION
// Returns ALL plausible codes with a confidence score so callers can pick the
// best, detect low-confidence situations, and avoid guessing. Signals: proximity
// to keywords, standalone-line layout, exact configured length, numeric-OTP shape.
// ---------------------------------------------------------------------------
const CODE_KEYWORDS = /(verification|verify|security|one[\s-]?time|otp|passcode|pass\s?code|access|login|log[\s-]?in|sign[\s-]?in|confirm(?:ation)?|authenticat|2fa|two[\s-]?factor|\bcode\b|\bpin\b|activate|authorize|approve)/i;

export function extractCodeCandidates(text, options = {}) {
  const s = String(text || "").replace(/https?:\/\/[^\s"'<>)\]]+/gi, " ");
  if (!s) return [];
  const otpLen = parseInt(options.otpLength) || 0;
  const candidates = [];
  const seen = new Set();
  const push = (raw, score, why) => {
    const c = String(raw).replace(/[-\s]/g, "");
    let val = null;
    if (/^\d{4,10}$/.test(c)) val = c;
    else if (/^[A-Z0-9]{4,10}$/i.test(c) && /\d/.test(c) && /[A-Z]/i.test(c)) val = c.toUpperCase();
    if (!val) return;
    if (otpLen && val.length !== otpLen) score -= 3;
    if (otpLen && val.length === otpLen) score += 4;
    if (/^\d+$/.test(val)) score += 1; // numeric OTPs are most common
    if (seen.has(val)) { // duplicate → keep the highest score
      const ex = candidates.find((x) => x.code === val); if (ex && score > ex.score) { ex.score = score; ex.why = why; }
      return;
    }
    seen.add(val); candidates.push({ code: val, score, why });
  };

  // 1) Custom regex (highest confidence when admin-configured).
  if (options.regex) {
    try { const re = new RegExp(options.regex, "i"); const m = s.match(re); if (m) push(m[1] || m[0], 10, "custom-regex"); } catch (e) {}
  }
  // 2) Codes appearing shortly AFTER a keyword. We locate each keyword, then scan a
  //    short window of following text for the first valid code token. This tolerates
  //    filler words ("your login code is 918273", "one-time password: A7X9K2").
  let km; const kwGlobal = new RegExp(CODE_KEYWORDS.source, "gi");
  while ((km = kwGlobal.exec(s))) {
    const window = s.slice(km.index + km[0].length, km.index + km[0].length + 48);
    const num = window.match(/\b(\d{4,10}|\d{3}[- ]\d{3})\b/);
    if (num) { push(num[1], 8, "after-keyword"); continue; }
    // Scan all alphanumeric tokens in the window; push() keeps only valid codes
    // (must contain a digit + a letter), so filler words like "password" are ignored.
    let am; const alnumRe = /\b([A-Z0-9]{4,10})\b/gi;
    while ((am = alnumRe.exec(window))) push(am[1], 8, "after-keyword");
  }
  // 3) Standalone code on its own line (very common OTP layout).
  for (const l of s.split(/\n/).map((x) => x.trim())) {
    if (/^\d{4,8}$/.test(l) || /^\d{3}[- ]\d{3}$/.test(l) || (/^[A-Z0-9]{4,8}$/i.test(l) && /\d/.test(l) && /[A-Z]/i.test(l))) push(l, 6, "standalone-line");
  }
  // 4) Any numeric block near overall context (weak).
  if (CODE_KEYWORDS.test(s)) { let nm; const nRe = /\b(\d{4,8})\b/g; while ((nm = nRe.exec(s))) push(nm[1], 3, "numeric-in-context"); }

  return candidates.sort((a, b) => b.score - a.score);
}

// Extract a verification CODE (numeric OTP or alphanumeric). Uses contextual
// keywords to disambiguate from phone numbers, years, order IDs, etc.
// Options: { regex } custom pattern (first capture group or whole match wins);
//          { otpLength } force an exact N-digit code.
export function extractCode(text, options = {}) {
  // Remove URLs first so query-string tokens (e.g. ?token=abc123) are never
  // mistaken for verification codes.
  const s = String(text || "").replace(/https?:\/\/[^\s"'<>)\]]+/gi, " ");
  if (!s) return null;

  // 0) Admin-supplied custom regex takes priority (most precise).
  if (options.regex) {
    try {
      const re = new RegExp(options.regex, options.regex.flags || "i");
      const m = s.match(re);
      if (m) return (m[1] || m[0]).trim();
    } catch (e) { /* invalid regex → fall through to heuristics */ }
  }

  // 0b) Fixed OTP length overrides the generic 4-8 heuristic.
  const otpLen = parseInt(options.otpLength) || 0;
  if (otpLen >= 3 && otpLen <= 12) {
    const CTX = /(verification|verify|security|one[\s-]?time|otp|passcode|pass\s?code|access|login|sign[\s-]?in|confirm|authenticat|2fa|\bcode\b|\bpin\b)/i;
    const scoped = CTX.test(s) ? s.slice(s.search(CTX)) : s;
    const exact = scoped.match(new RegExp(`\\b(\\d{${otpLen}})\\b`));
    if (exact) return exact[1];
    const anywhere = s.match(new RegExp(`\\b(\\d{${otpLen}})\\b`));
    if (anywhere) return anywhere[1];
  }

  const CONTEXT = /(verification|verify|security|one[\s-]?time|otp|passcode|pass\s?code|access|login|log[\s-]?in|sign[\s-]?in|confirm(?:ation)?|authenticat|2fa|two[\s-]?factor|\bcode\b|\bpin\b)/i;

  // A code candidate is EITHER a pure numeric block (4-8 digits, optionally split
  // 3-3) OR an alphanumeric block (4-8 chars) that contains at least one digit —
  // this prevents plain keyword words ("code", "token", "below") being captured.
  const isValidCode = (raw) => {
    const c = raw.replace(/[-\s]/g, "");
    if (/^\d{4,8}$/.test(c)) return c;
    if (/^[A-Z0-9]{4,8}$/i.test(c) && /\d/.test(c) && /[A-Z]/i.test(c)) return c.toUpperCase();
    return null;
  };

  const hasContext = CONTEXT.test(s);

  // 1) When context keywords exist, search the text AFTER the first keyword for
  //    the first valid code (prefer numeric OTP, then alphanumeric).
  if (hasContext) {
    const after = s.slice(s.search(CONTEXT));
    const numeric = after.match(/\b(\d{3}[- ]\d{3}|\d{4,8})\b/);
    if (numeric) { const v = isValidCode(numeric[1]); if (v) return v; }
    const tokenRe = /\b([A-Z0-9]{4,8})\b/gi;
    let m;
    while ((m = tokenRe.exec(after))) { const v = isValidCode(m[1]); if (v) return v; }
  }

  // 2) A standalone numeric/alphanumeric block on its own line (common OTP layout).
  const line = s.split(/\n/).map((l) => l.trim())
    .find((l) => /^\d{4,8}$/.test(l) || /^\d{3}[- ]\d{3}$/.test(l) || (/^[A-Z0-9]{4,8}$/i.test(l) && /\d/.test(l) && /[A-Z]/i.test(l)));
  if (line) { const v = isValidCode(line); if (v) return v; }

  // 3) No context and no obvious layout → do not guess (avoid false positives).
  return null;
}

// Parse an email object → { code, link, confidence, forwarded, candidates }.
// Backward-compatible: still returns { code, link }. options: { regex, otpLength,
// extractLink, linkOnly, forwardedEnabled }.
export function parseVerification(email, options = {}) {
  const html = email.html || "";
  let text = email.text || htmlToText(html);

  // Forwarded email: parse the ORIGINAL inner message when present.
  let forwarded = null;
  if (options.forwardedEnabled !== false) {
    const stripped = stripForwardingChrome(text);
    if (stripped.forwarded) { forwarded = stripped.forwarded; text = stripped.text; }
  }

  const combined = (email.subject ? email.subject + "\n" : "") + text;

  // Link-only products skip code extraction entirely.
  if (options.linkOnly) {
    const link = extractLink(text, html);
    return { code: null, link: link || null, confidence: link ? 6 : 0, forwarded, candidates: [] };
  }

  const candidates = extractCodeCandidates(combined, options);
  const best = candidates[0] || null;
  // Keep the proven extractCode() as a fallback so nothing regresses.
  const code = best ? best.code : extractCode(combined, options);
  const link = options.extractLink === false ? null : extractLink(text, html);
  const confidence = best ? best.score : (code ? 4 : 0);
  return { code: code || null, link: link || null, confidence, forwarded, candidates };
}

// ---------------------------------------------------------------------------
// IMAP — connect + intelligent newest-matching-email search.
// ---------------------------------------------------------------------------

function buildImapClient(mb) {
  const secure = mb.imap_secure === 0 ? false : true;
  return new ImapFlow({
    host: mb.imap_host,
    port: parseInt(mb.imap_port) || (secure ? 993 : 143),
    secure,
    auth: { user: mb.username, pass: mb.password },
    logger: false,
    connectionTimeout: 15000,
    greetTimeout: 10000,
    socketTimeout: 25000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: false },
  });
}

// Test an IMAP connection. Returns { ok, error?, mailboxExists? }.
export async function testImap(mb) {
  if (!mb.imap_host) return { ok: false, error: "IMAP host is not configured." };
  if (!mb.username) return { ok: false, error: "Mailbox username is not configured." };
  let client;
  try {
    client = buildImapClient(mb);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let exists = 0;
    try { exists = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0; }
    finally { lock.release(); }
    await client.logout().catch(() => {});
    return { ok: true, mailboxExists: exists };
  } catch (err) {
    try { if (client) client.close(); } catch (e) {}
    return { ok: false, error: humanizeError(err) };
  }
}

/**
 * Search for the NEWEST email matching the configured rules.
 * rules = { sender, subjectKeywords[], bodyKeywords[], maxAgeSec }
 * Returns { ok, matched, email?, reason?, searchTimeMs, scanned }.
 * `email` (when matched) = { from, subject, date, text, html } — internal only.
 */
export async function searchMatching(mb, rules) {
  const started = Date.now();
  const log = { startedAt: new Date().toISOString(), mailbox: maskEmail(mb.username || mb.imap_host || ""), forwardedDetected: false, senderMatched: false, recipientMatched: false, subjectMatched: false };
  if (!mb.imap_host) return { ok: false, matched: false, reason: "IMAP host is not configured.", searchTimeMs: 0, scanned: 0, log };
  const maxAge = Math.max(30, parseInt(rules.maxAgeSec) || 600);
  const sinceDate = new Date(Date.now() - maxAge * 1000);
  const subjectKw = (rules.subjectKeywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const bodyKw = (rules.bodyKeywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const ignoreKw = (rules.ignoreKeywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const senders = String(rules.sender || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  const sender = senders[0] || "";
  const senderDomain = String(rules.senderDomain || "").toLowerCase().trim().replace(/^@/, "");
  const recipient = String(rules.recipient || "").toLowerCase().trim();
  const preferUnread = rules.preferUnread !== false;
  const forwardedEnabled = rules.forwardedEnabled !== false;
  const excludeUids = new Set((rules.excludeUids || []).map(String));

  let client;
  let scanned = 0;
  try {
    client = buildImapClient(mb);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Server-side filter first (SINCE + optional FROM) to cut down the set.
      const criteria = { since: sinceDate };
      if (sender) criteria.from = sender;
      let uids = [];
      try { uids = await client.search(criteria, { uid: true }); } catch (e) { uids = []; }
      if (!uids || uids.length === 0) {
        const total = client.mailbox.exists || 0;
        if (total > 0) {
          const start = Math.max(1, total - 40);
          const collected = [];
          for await (const m of client.fetch(`${start}:*`, { uid: true })) collected.push(m.uid);
          uids = collected;
        }
      }
      // Newest first, capped.
      uids = uids.sort((a, b) => b - a).slice(0, 60);

      // Which UIDs are unread (for prioritization)? Best-effort.
      let unreadSet = new Set();
      if (preferUnread) {
        try { const un = await client.search({ since: sinceDate, seen: false }, { uid: true }); (un || []).forEach((u) => unreadSet.add(u)); } catch (e) {}
      }

      const scored = []; // { candidate, matchScore }
      for (const uid of uids) {
        if (excludeUids.has(String(uid))) continue;
        let msg = null;
        try {
          for await (const m of client.fetch(String(uid), { envelope: true, source: true, internalDate: true }, { uid: true })) { msg = m; break; }
        } catch (e) { continue; }
        if (!msg) continue;
        scanned++;
        const env = msg.envelope || {};
        const date = msg.internalDate || (env.date ? new Date(env.date) : null);
        if (date && date < sinceDate) continue;
        let fromAddr = ((env.from && env.from[0] && env.from[0].address) || "").toLowerCase();
        let toAddrs = (env.to || []).map((t) => (t.address || "").toLowerCase());
        let subject = env.subject || "";

        const parsed = await parseSource(msg.source);
        let bodyText = parsed.text || "";

        // Forwarded-email handling: if the body is a forward, prefer the ORIGINAL
        // sender/recipient/subject for matching. Detected forwards are prioritized.
        let isForwarded = false;
        if (forwardedEnabled) {
          const det = detectForwarded((subject ? subject + "\n" : "") + bodyText);
          if (det.isForwarded) {
            isForwarded = true; log.forwardedDetected = true;
            if (det.original.from) fromAddr = det.original.from;
            if (det.original.to) toAddrs = [det.original.to, ...toAddrs];
            if (det.original.subject) subject = det.original.subject;
          }
        }

        // ——— Confidence scoring (don't hard-reject; rank) ———
        let score = 0;
        let senderOk = !senders.length && !senderDomain;
        if (senders.length && senders.some((sndr) => fromAddr.includes(sndr))) { score += 5; senderOk = true; log.senderMatched = true; }
        if (senderDomain && fromAddr.endsWith("@" + senderDomain)) { score += 4; senderOk = true; log.senderMatched = true; }
        // Enforce sender only when configured AND it's a direct (non-forwarded) email.
        if ((senders.length || senderDomain) && !senderOk && !isForwarded) continue;

        if (recipient && toAddrs.some((t) => t.includes(recipient))) { score += 4; log.recipientMatched = true; }
        else if (recipient) { score -= 1; }

        const subjLower = subject.toLowerCase();
        if (subjectKw.length) {
          if (subjectKw.some((k) => subjLower.includes(k))) { score += 3; log.subjectMatched = true; }
          else if (!isForwarded) continue; // subject filter strict for direct mail
        }

        const scanText = (subject + "\n" + bodyText).toLowerCase();
        if (ignoreKw.length && ignoreKw.some((k) => scanText.includes(k))) continue;
        if (bodyKw.length) {
          if (bodyKw.some((k) => scanText.includes(k))) score += 2;
          else if (!isForwarded && !subjectKw.length) continue;
        }

        if (isForwarded) score += 2;               // prioritize forwarded (per spec)
        if (unreadSet.has(uid)) score += 3;        // prioritize unread
        if (date) score += Math.max(0, 3 - (Date.now() - date.getTime()) / (maxAge * 1000) * 3); // recency

        scored.push({
          matchScore: score,
          _dateMs: date ? date.getTime() : 0,
          candidate: { uid: String(uid), from: fromAddr, to: toAddrs[0] || "", subject, date: date ? date.toISOString() : null, text: bodyText, html: parsed.html, forwarded: isForwarded, unread: unreadSet.has(uid) },
        });
      }

      lock.release();
      await client.logout().catch(() => {});

      if (scored.length === 0) {
        return { ok: true, matched: false, reason: buildNoMatchReason({ sender, subjectKw, bodyKw, maxAge, scanned }), searchTimeMs: Date.now() - started, scanned, log };
      }
      // Rank by match confidence, then recency.
      scored.sort((a, b) => (b.matchScore - a.matchScore) || (b._dateMs - a._dateMs));
      const best = scored[0].candidate;
      log.matchConfidence = Math.round(scored[0].matchScore * 10) / 10;
      log.senderMatchedFinal = best.from;
      log.completedAt = new Date().toISOString();
      return { ok: true, matched: true, email: best, matchConfidence: scored[0].matchScore, alternatives: scored.length - 1, searchTimeMs: Date.now() - started, scanned, log };
    } catch (err) {
      try { lock.release(); } catch (e) {}
      throw err;
    }
  } catch (err) {
    try { if (client) client.close(); } catch (e) {}
    return { ok: false, matched: false, reason: humanizeError(err), searchTimeMs: Date.now() - started, scanned, log };
  }
}

function buildNoMatchReason({ sender, subjectKw, bodyKw, maxAge, scanned }) {
  const bits = [];
  if (sender) bits.push(`sender "${sender}"`);
  if (subjectKw.length) bits.push(`subject contains ${subjectKw.map((k) => `"${k}"`).join(" or ")}`);
  if (bodyKw.length) bits.push(`body contains ${bodyKw.map((k) => `"${k}"`).join(" or ")}`);
  const rules = bits.length ? bits.join(", ") : "any email";
  return `No email newer than ${Math.round(maxAge / 60)} min matched (${rules}). Scanned ${scanned} recent message(s).`;
}

// Minimal MIME source parser (no external mailparser dependency).
// Extracts text/plain and text/html bodies from a raw RFC822 buffer.
async function parseSource(source) {
  const raw = source ? source.toString("utf8") : "";
  return parseMime(raw);
}

function decodeBody(body, encoding, charset) {
  let buf;
  const enc = (encoding || "").toLowerCase();
  if (enc.includes("base64")) {
    buf = Buffer.from(body.replace(/\s+/g, ""), "base64");
  } else if (enc.includes("quoted-printable")) {
    const qp = body
      .replace(/=\r?\n/g, "")
      .replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    buf = Buffer.from(qp, "binary");
  } else {
    buf = Buffer.from(body, "utf8");
  }
  try {
    if (charset && /utf-?8/i.test(charset)) return buf.toString("utf8");
    return buf.toString("utf8");
  } catch (e) { return buf.toString("utf8"); }
}

function splitHeaders(block) {
  const idx = block.search(/\r?\n\r?\n/);
  const headPart = idx === -1 ? block : block.slice(0, idx);
  const bodyPart = idx === -1 ? "" : block.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  const unfolded = headPart.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const c = line.indexOf(":");
    if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
  }
  return { headers, body: bodyPart };
}

function parseMime(raw) {
  const { headers, body } = splitHeaders(raw);
  const ctype = headers["content-type"] || "text/plain";
  const cte = headers["content-transfer-encoding"] || "";
  const charsetMatch = ctype.match(/charset="?([^";]+)"?/i);
  const charset = charsetMatch ? charsetMatch[1] : "utf-8";

  if (/multipart\//i.test(ctype)) {
    const bMatch = ctype.match(/boundary="?([^";]+)"?/i);
    if (bMatch) {
      const boundary = bMatch[1];
      const parts = body.split(new RegExp("--" + boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:--)?\\s*", "g"));
      let text = "", html = "";
      for (const part of parts) {
        if (!part || !part.trim()) continue;
        const sub = parseMime(part);
        if (sub.text && !text) text = sub.text;
        if (sub.html && !html) html = sub.html;
        // Prefer richest content across nested multiparts.
        if (sub.html) html = html || sub.html;
        if (sub.text) text = text || sub.text;
      }
      return { text, html };
    }
  }

  const decoded = decodeBody(body, cte, charset);
  if (/text\/html/i.test(ctype)) return { text: htmlToText(decoded), html: decoded };
  return { text: decoded, html: "" };
}

// ---------------------------------------------------------------------------
// SMTP — test connection + send test email.
// ---------------------------------------------------------------------------
function buildTransport(mb) {
  const port = parseInt(mb.smtp_port) || 587;
  const secure = mb.smtp_secure === 1 || port === 465;
  return nodemailer.createTransport({
    host: mb.smtp_host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user: mb.username, pass: mb.password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { minVersion: "TLSv1.2" },
  });
}

export async function testSmtp(mb) {
  if (!mb.smtp_host) return { ok: false, error: "SMTP host is not configured." };
  try {
    const t = buildTransport(mb);
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: humanizeError(err) };
  }
}

export async function sendTestEmail(mb, to) {
  if (!mb.smtp_host) return { ok: false, error: "SMTP host is not configured." };
  const recipient = to || mb.email_address || mb.username;
  if (!recipient) return { ok: false, error: "No recipient address available." };
  try {
    const t = buildTransport(mb);
    const fromName = mb.sender_name || "Aurevashop";
    const fromEmail = mb.sender_email || mb.email_address || mb.username;
    await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: recipient,
      subject: "Aurevashop — Mailbox Test",
      text: "This is a test email from Aurevashop confirming this mailbox can send mail.",
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;padding:16px"><h2>Mailbox Test ✅</h2><p>This is a test email from <b>Aurevashop</b> confirming the SMTP settings for <b>${maskEmail(fromEmail)}</b> are working.</p></div>`,
    });
    return { ok: true, to: recipient };
  } catch (err) {
    return { ok: false, error: humanizeError(err) };
  }
}

// Turn raw connection/auth errors into meaningful admin-facing messages.
export function humanizeError(err) {
  const code = err && err.code;
  const authFail = err && (err.authenticationFailed || err.serverResponseCode === "AUTHENTICATIONFAILED");
  const respText = (err && (err.responseText || err.response)) || "";
  const msg = ((err && err.message) || String(err)) + (respText ? ` (${respText})` : "");
  if (authFail || code === "EAUTH" || /535|authentication ?failed|invalid login|AUTHENTICATIONFAILED|LOGIN failed|\[AUTH\]/i.test(msg)) {
    return "Authentication failed — the username or password/app-password is incorrect or expired.";
  }
  if (/command failed/i.test(msg) && !respText) {
    return "The mail server rejected the command — usually an incorrect username/password or the account is not enabled for IMAP access.";
  }
  if (code === "ETIMEOUT" || code === "ETIMEDOUT" || /timeout/i.test(msg)) {
    return "Connection timed out — check the host, port, and SSL/TLS setting, or that the server is reachable.";
  }
  if (code === "ECONNREFUSED" || /refused/i.test(msg)) {
    return "Connection refused — the host/port is wrong or the mail service is not accepting connections.";
  }
  if (code === "ENOTFOUND" || code === "EDNS" || /getaddrinfo|not found/i.test(msg)) {
    return "Host not found — check the IMAP/SMTP hostname.";
  }
  if (/certificate|self signed|tls/i.test(msg)) {
    return "TLS/SSL error — check the SSL setting and port (993/465 = SSL, 143/587 = STARTTLS).";
  }
  return msg || "Unknown connection error.";
}
