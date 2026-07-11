// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Secure Provider Adapters (server-side only)
// ————————————————————————————————————————————————————————————————
// API keys NEVER leave the server. Keys are read from DB settings first, then
// environment variables. Each adapter exposes:
//   - complete(opts)  -> { text, usage }         (non-streaming)
//   - stream(opts, onDelta) -> { text, usage }   (streaming; falls back internally)
// A tiny timeout wrapper + friendly error normalization keeps the client clean.

const DEFAULTS = {
  openai: { model: "gpt-4o-mini", base: "https://api.openai.com/v1" },
  gemini: { model: "gemini-2.5-flash-lite", base: "https://generativelanguage.googleapis.com/v1beta" },
  claude: { model: "claude-3-5-sonnet-20241022", base: "https://api.anthropic.com/v1" },
};

// Resolve credentials: DB settings win over env; return {} when absent.
function resolveKeys(settings) {
  const s = settings || {};
  return {
    openai: { key: s.ai_openai_key || process.env.OPENAI_API_KEY || "", model: s.ai_openai_model || DEFAULTS.openai.model },
    gemini: { key: s.ai_gemini_key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "", model: s.ai_gemini_model || DEFAULTS.gemini.model },
    claude: { key: s.ai_claude_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "", model: s.ai_claude_model || DEFAULTS.claude.model },
  };
}

function withTimeout(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(2000, ms || 20000));
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

// Basic prompt sanitation: strip control chars, cap length (anti-abuse / injection surface).
function sanitize(text, max = 4000) {
  return String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

// Map raw provider status/errors to safe, user-facing categories (never leak details).
function friendlyFromStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status >= 500) return "server";
  return "unknown";
}

// ————————————————————— OpenAI —————————————————————
async function openaiComplete({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`${DEFAULTS.openai.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model || DEFAULTS.openai.model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature, max_tokens: maxTokens,
      }),
      signal: t.signal,
    });
    if (!r.ok) { const e = new Error(`openai_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const j = await r.json();
    return { text: j.choices?.[0]?.message?.content?.trim() || "", usage: j.usage || null };
  } finally { t.clear(); }
}

async function* openaiStream({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`${DEFAULTS.openai.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || DEFAULTS.openai.model, messages: [{ role: "system", content: system }, ...messages], temperature, max_tokens: maxTokens, stream: true }),
      signal: t.signal,
    });
    if (!r.ok || !r.body) { const e = new Error(`openai_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (data === "[DONE]") return;
        try { const j = JSON.parse(data); const d = j.choices?.[0]?.delta?.content; if (d) yield d; } catch { /* ignore partial */ }
      }
    }
  } finally { t.clear(); }
}

// ————————————————————— Gemini —————————————————————
function geminiBody(system, messages, temperature, maxTokens) {
  // Gemini uses "contents" with roles user/model; system goes in systemInstruction.
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
}

async function geminiComplete({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const m = model || DEFAULTS.gemini.model;
    const r = await fetch(`${DEFAULTS.gemini.base}/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(system, messages, temperature, maxTokens)),
      signal: t.signal,
    });
    if (!r.ok) { const e = new Error(`gemini_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const j = await r.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return { text, usage: j.usageMetadata ? { total_tokens: j.usageMetadata.totalTokenCount } : null };
  } finally { t.clear(); }
}

async function* geminiStream({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const m = model || DEFAULTS.gemini.model;
    const r = await fetch(`${DEFAULTS.gemini.base}/models/${m}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(system, messages, temperature, maxTokens)),
      signal: t.signal,
    });
    if (!r.ok || !r.body) { const e = new Error(`gemini_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const d = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
          if (d) yield d;
        } catch { /* ignore partial */ }
      }
    }
  } finally { t.clear(); }
}

// ————————————————————— Claude —————————————————————
async function claudeComplete({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`${DEFAULTS.claude.base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model || DEFAULTS.claude.model,
        system,
        max_tokens: maxTokens,
        temperature,
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      }),
      signal: t.signal,
    });
    if (!r.ok) { const e = new Error(`claude_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || "").join("").trim();
    return { text, usage: j.usage ? { total_tokens: (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) } : null };
  } finally { t.clear(); }
}

async function* claudeStream({ key, model, system, messages, temperature, maxTokens, timeoutMs }) {
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`${DEFAULTS.claude.base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || DEFAULTS.claude.model, system, max_tokens: maxTokens, temperature, stream: true, messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) }),
      signal: t.signal,
    });
    if (!r.ok || !r.body) { const e = new Error(`claude_${r.status}`); e.category = friendlyFromStatus(r.status); throw e; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        try { const j = JSON.parse(data); if (j.type === "content_block_delta" && j.delta?.text) yield j.delta.text; } catch { /* ignore */ }
      }
    }
  } finally { t.clear(); }
}

// ————————————————————— Dispatch —————————————————————
const ADAPTERS = {
  openai: { complete: openaiComplete, stream: openaiStream },
  gemini: { complete: geminiComplete, stream: geminiStream },
  claude: { complete: claudeComplete, stream: claudeStream },
};

function providerConfigured(providerId, keys) {
  const k = keys[providerId];
  return !!(k && k.key);
}

// Resolve the ordered provider chain for "auto"/fallback behavior.
function resolveChain(requested, settings, keys) {
  const preferred = requested && requested !== "auto" ? requested : (settings.ai_provider || "auto");
  const chain = [];
  if (preferred && preferred !== "auto" && preferred !== "local") chain.push(preferred);
  // Auto / fallback: append any other configured external providers.
  for (const id of ["gemini", "openai", "claude"]) {
    if (!chain.includes(id) && providerConfigured(id, keys)) chain.push(id);
  }
  return chain.filter((id) => providerConfigured(id, keys));
}

/**
 * Non-streaming completion with automatic provider fallback.
 * Returns { text, provider, usage } or throws { category } after all fail.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Transient categories are safe to retry once with a short backoff.
const isTransient = (cat) => cat === "server" || cat === "quota";

async function generate({ settings, provider, system, messages, temperature, maxTokens, timeoutMs }) {
  const keys = resolveKeys(settings);
  const chain = resolveChain(provider, settings, keys);
  const cleanMsgs = messages.map((m) => ({ role: m.role, content: sanitize(m.content) }));
  let lastCategory = "unknown";
  for (const id of chain) {
    const k = keys[id];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await ADAPTERS[id].complete({ key: k.key, model: k.model, system: sanitize(system, 8000), messages: cleanMsgs, temperature, maxTokens, timeoutMs });
        if (out.text) return { text: out.text, provider: id, usage: out.usage };
        break; // empty text — move to next provider
      } catch (e) {
        lastCategory = e.category || "unknown";
        console.warn(`[AI] provider ${id} attempt ${attempt} failed: ${e.message}`);
        if (attempt < 2 && isTransient(lastCategory)) { await sleep(900); continue; }
        break; // non-transient or out of attempts — next provider
      }
    }
  }
  const err = new Error("all_providers_failed");
  err.category = chain.length ? lastCategory : "not_configured";
  throw err;
}

/**
 * Streaming completion. Calls onDelta(text) for each chunk. Falls back across the
 * chain; if a provider's stream fails before any delta, tries the next.
 * Returns { text, provider }.
 */
async function generateStream({ settings, provider, system, messages, temperature, maxTokens, timeoutMs, onDelta }) {
  const keys = resolveKeys(settings);
  const chain = resolveChain(provider, settings, keys);
  const cleanMsgs = messages.map((m) => ({ role: m.role, content: sanitize(m.content) }));
  let lastCategory = "unknown";
  for (const id of chain) {
    const k = keys[id];
    let acc = "";
    try {
      for await (const delta of ADAPTERS[id].stream({ key: k.key, model: k.model, system: sanitize(system, 8000), messages: cleanMsgs, temperature, maxTokens, timeoutMs })) {
        acc += delta;
        onDelta(delta);
      }
      if (acc) return { text: acc, provider: id };
      // empty stream — fall through to next provider
    } catch (e) {
      lastCategory = e.category || "unknown";
      console.warn(`[AI] stream provider ${id} failed: ${e.message}`);
      if (acc) return { text: acc, provider: id }; // partial is still useful
    }
  }
  const err = new Error("all_providers_failed");
  err.category = chain.length ? lastCategory : "not_configured";
  throw err;
}

// Connectivity test used by the admin "Test provider" button.
async function testProvider({ settings, provider, timeoutMs }) {
  const keys = resolveKeys(settings);
  if (!providerConfigured(provider, keys)) return { ok: false, category: "not_configured" };
  try {
    const out = await ADAPTERS[provider].complete({
      key: keys[provider].key, model: keys[provider].model,
      system: "You are a connection test.", messages: [{ role: "user", content: "Reply with exactly: OK" }],
      temperature: 0, maxTokens: 10, timeoutMs: timeoutMs || 15000,
    });
    return { ok: true, model: keys[provider].model, sample: out.text, usage: out.usage };
  } catch (e) {
    return { ok: false, category: e.category || "unknown", model: keys[provider].model };
  }
}

function providerStatus(settings) {
  const keys = resolveKeys(settings);
  return {
    openai: { configured: providerConfigured("openai", keys), model: keys.openai.model },
    gemini: { configured: providerConfigured("gemini", keys), model: keys.gemini.model },
    claude: { configured: providerConfigured("claude", keys), model: keys.claude.model },
  };
}

export { generate, generateStream, testProvider, providerStatus, resolveKeys, sanitize };
