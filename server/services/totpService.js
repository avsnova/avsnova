import crypto from "crypto";

/**
 * TOTP (RFC 6238) service + secret encryption — zero external dependencies.
 * Provides: base32 decode, TOTP generation, secret validation, and AES-256-GCM
 * encryption/decryption of secrets at rest. Designed as a pluggable "auth method"
 * so Email OTP / SMS OTP can share the same Security Center architecture later.
 */

// ---- Base32 (RFC 4648) decode ----
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// Normalize a pasted secret OR an otpauth:// URI → the raw base32 secret.
export function extractSecret(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("otpauth://")) {
    try {
      const u = new URL(s);
      const secret = u.searchParams.get("secret");
      if (secret) return secret.replace(/\s/g, "").toUpperCase();
    } catch { /* fall through */ }
  }
  return s.replace(/\s/g, "").toUpperCase();
}

// ---- TOTP generation (SHA-1, 6 digits, 30s step by default) ----
export function generateTOTP(secretBase32, { step = 30, digits = 6, algorithm = "sha1", timestamp = Date.now() } = {}) {
  const key = base32Decode(secretBase32);
  if (key.length === 0) throw new Error("Empty secret");
  const counter = Math.floor(timestamp / 1000 / step);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac(algorithm, key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, "0");
  const secondsRemaining = step - (Math.floor(timestamp / 1000) % step);
  return { code: otp, secondsRemaining, step, digits, validUntil: Math.floor(timestamp / 1000 / step) * step * 1000 + step * 1000 };
}

// Validate that a secret is well-formed and can produce a TOTP.
export function validateSecret(raw) {
  try {
    const secret = extractSecret(raw);
    if (!secret || secret.length < 8) return { valid: false, error: "Secret is too short." };
    const key = base32Decode(secret);
    if (key.length < 5) return { valid: false, error: "Secret does not decode to enough bytes." };
    const { code } = generateTOTP(secret);
    if (!/^\d{6}$/.test(code)) return { valid: false, error: "Could not generate a valid code." };
    return { valid: true, secret };
  } catch (e) {
    return { valid: false, error: e.message || "Invalid secret." };
  }
}

// ---- AES-256-GCM encryption at rest ----
// Key derived from JWT_SECRET so secrets are never stored in plain text and require the
// server's env to decrypt. Format: v1:<iv_hex>:<tag_hex>:<ciphertext_hex>.
function encKey() {
  const base = process.env.JWT_SECRET || process.env.TOTP_ENC_KEY || "avs_totp_default_key";
  return crypto.createHash("sha256").update("totp:" + base).digest(); // 32 bytes
}
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}
export function decryptSecret(enc) {
  const parts = String(enc || "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Bad ciphertext format");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const ct = Buffer.from(parts[3], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
