// ============================================================================
//  Telegram Bot Service — pure Bot API wrapper (no DB, no business logic).
//  The bot token is read from the environment (TELEGRAM_BOT_TOKEN); an optional
//  webhook secret (TELEGRAM_WEBHOOK_SECRET) hardens the inbound webhook.
//  Every function is a graceful no-op when the token is not configured, so the
//  platform runs fine without Telegram set up.
// ============================================================================

const API_BASE = "https://api.telegram.org";

// Runtime config overrides (populated from DB settings by index.js). DB wins over env so the
// Super Admin can manage the token/secret from the dashboard; env remains a safe fallback.
let _override = { token: "", secret: "" };
export function setConfig({ token, secret } = {}) {
  if (token !== undefined) _override.token = token || "";
  if (secret !== undefined) _override.secret = secret || "";
}

export function getBotToken() {
  return _override.token || process.env.TELEGRAM_BOT_TOKEN || "";
}

export function getWebhookSecret() {
  return _override.secret || process.env.TELEGRAM_WEBHOOK_SECRET || "";
}

export function isTelegramConfigured() {
  return !!getBotToken();
}

// Low-level call to the Telegram Bot API. Returns { ok, result } | { ok:false, error }.
async function tgCall(method, payload) {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return { ok: false, error: (data && data.description) || `Telegram API error (${res.status})` };
    return { ok: true, result: data.result };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "Telegram request timed out." : err.message };
  }
}

// Confirm the token is valid + return the bot identity.
export async function getMe() {
  return tgCall("getMe", {});
}

// Send a plain (HTML) message to a chat.
export async function sendMessage(chatId, text, { buttons, disablePreview = true } = {}) {
  if (!chatId) return { ok: false, error: "No chat id." };
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: disablePreview,
  };
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  return tgCall("sendMessage", payload);
}

// Acknowledge a callback query (removes the "loading" spinner on the button).
export async function answerCallback(callbackQueryId, text, { alert = false } = {}) {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text: text || "", show_alert: alert });
}

// Replace a message's text (used after an action so the card reflects the new state).
export async function editMessageText(chatId, messageId, text, { buttons } = {}) {
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  return tgCall("editMessageText", payload);
}

// Remove the inline keyboard from a message (e.g. after an order is approved).
export async function clearButtons(chatId, messageId) {
  return tgCall("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

// Register / remove the webhook. secret is sent in the X-Telegram-Bot-Api-Secret-Token header.
export async function setWebhook(url, secret) {
  const payload = { url, allowed_updates: ["message", "callback_query"] };
  if (secret) payload.secret_token = secret;
  return tgCall("setWebhook", payload);
}
export async function deleteWebhook() {
  return tgCall("deleteWebhook", { drop_pending_updates: false });
}
export async function getWebhookInfo() {
  return tgCall("getWebhookInfo", {});
}

// Long-poll for updates (used in localhost/dev when there's no public webhook URL).
// Uses a longer socket timeout than the default tgCall since long-polling holds the
// connection open for up to `timeout` seconds.
export async function getUpdates(offset, timeout = 25) {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), (timeout + 10) * 1000);
    const res = await fetch(`${API_BASE}/bot${token}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: offset || undefined, timeout, allowed_updates: ["message", "callback_query"] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return { ok: false, error: (data && data.description) || `Telegram API error (${res.status})` };
    return { ok: true, result: data.result };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "getUpdates timed out." : err.message };
  }
}

// Send an in-memory document (e.g. a generated CSV/report) to a chat. `content` may be a
// string or Buffer; `filename` sets the download name. Uses multipart/form-data.
export async function sendDocument(chatId, filename, content, { caption } = {}) {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." };
  if (!chatId) return { ok: false, error: "No chat id." };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) { form.append("caption", caption); form.append("parse_mode", "HTML"); }
    const blob = new Blob([content], { type: "text/csv" });
    form.append("document", blob, filename || "report.csv");
    const res = await fetch(`${API_BASE}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return { ok: false, error: (data && data.description) || `Telegram API error (${res.status})` };
    return { ok: true, result: data.result };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "sendDocument timed out." : err.message };
  }
}

// Escape user-supplied text for safe HTML parse_mode.
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
