// Real-time SMS notification service (Item 1).
// Scope: SMS verification screen ONLY. Provides OS-level notifications (Notification API)
// + a sound alert (<audio> / WebAudio). Browsers require a user gesture before playing
// sound / requesting notification permission, so call `enableSmsAlerts()` from a click.
//
// The status transport is abstracted behind SmsStatusTransport so the current polling
// implementation can later be swapped for WebSocket/SSE without touching callers.

export type SmsLineSnapshot = {
  id: string;
  status: string;           // "active" | "completed" | "cancelled" | "expired" | ...
  otpReceived?: string;
  number?: string;
  service?: string;
};

export interface SmsStatusTransport {
  // Begin receiving line snapshots. Returns a stop() function.
  start(onSnapshot: (lines: SmsLineSnapshot[]) => void): () => void;
}

// ————— Sound + OS notification primitives —————

let audioEl: HTMLAudioElement | null = null;
const PREF_KEY = "avs_sms_alerts_enabled";

// Alerts are ON by default; the user can disable them from the SMS panel.
function readPref(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === null ? true : v === "1";
  } catch { return true; }
}
let alertsEnabled = readPref();

// A short embedded beep (data URI) so no external asset/network is needed in-preview.
// Simple sine "ding" encoded as a tiny WAV.
const BEEP_DATA_URI =
  "data:audio/wav;base64,UklGRl9vAAAAAA=="; // placeholder; real tone generated via WebAudio below

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

// Attempt to (re)create + resume the audio context. Safe to call repeatedly.
function ensureAudioContext() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch (e) { /* ignore */ }
}

// Install a one-time global gesture listener so audio unlocks on the FIRST interaction
// anywhere on the site — this lets "default on" work without an explicit enable click.
export function installAudioUnlock() {
  if (audioUnlocked || typeof window === "undefined") return;
  const unlock = () => {
    audioUnlocked = true;
    ensureAudioContext();
    // Also proactively request notification permission on first gesture if allowed.
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) {}
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
  window.addEventListener("touchstart", unlock, { once: false });
}

// Play a single loud tone burst on the shared AudioContext.
// Uses a master gain near maximum plus a mild compressor to keep it loud but clean.
function playTone(ctx: AudioContext, startAt: number, freq: number, durationMs: number, peak = 0.9) {
  const dur = durationMs / 1000;
  // Master limiter so stacked tones stay loud without clipping harshly.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-10, startAt);
  comp.ratio.setValueAtTime(12, startAt);
  comp.connect(ctx.destination);

  const gain = ctx.createGain();
  gain.connect(comp);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.setValueAtTime(peak, startAt + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

  // Two detuned oscillators (square + sawtooth) make the alert much louder & attention-grabbing.
  const osc1 = ctx.createOscillator();
  osc1.type = "square";
  osc1.frequency.setValueAtTime(freq, startAt);
  osc1.connect(gain);

  const osc2 = ctx.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.setValueAtTime(freq * 1.005, startAt);
  osc2.connect(gain);

  osc1.start(startAt); osc2.start(startAt);
  osc1.stop(startAt + dur); osc2.stop(startAt + dur);
}

function playBeep(kind: "waiting" | "code") {
  // Prefer WebAudio (works without an asset). Fall back to <audio> element.
  try {
    ensureAudioContext();
    if (audioCtx) {
      const now = audioCtx.currentTime;
      if (kind === "code") {
        // Loud, urgent triple-rising chime that clearly grabs attention.
        playTone(audioCtx, now,        988, 160, 0.95); // B5
        playTone(audioCtx, now + 0.18, 1319, 160, 0.95); // E6
        playTone(audioCtx, now + 0.36, 1568, 260, 0.98); // G6 (held)
      } else {
        // "Number waiting / assigned": strong double beep.
        playTone(audioCtx, now,        784, 150, 0.9); // G5
        playTone(audioCtx, now + 0.19, 988, 220, 0.9); // B5
      }
      return;
    }
  } catch (e) { /* fall through */ }

  // Fallback: HTML audio element at maximum volume.
  try {
    if (!audioEl) { audioEl = new Audio(BEEP_DATA_URI); }
    audioEl.volume = 1.0;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

// Must be called from a user gesture (click) to unlock audio + request permission.
export async function enableSmsAlerts(): Promise<boolean> {
  alertsEnabled = true;
  try { localStorage.setItem(PREF_KEY, "1"); } catch {}
  audioUnlocked = true;
  ensureAudioContext();
  // Request OS notification permission
  try {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch (e) { /* ignore */ }
  return alertsEnabled;
}

// Manually disable (user preference), persisted.
export function disableSmsAlerts() {
  alertsEnabled = false;
  try { localStorage.setItem(PREF_KEY, "0"); } catch {}
}

export function areSmsAlertsEnabled() {
  return alertsEnabled;
}

function osNotify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body, tag: "avs-sms", renotify: true } as any);
      setTimeout(() => n.close(), 8000);
    }
  } catch (e) { /* ignore */ }
}

// Fire the "number is now waiting for a code" alert.
export function notifyWaiting(line: SmsLineSnapshot) {
  if (!alertsEnabled) return;
  playBeep("waiting");
  osNotify("SMS number active", `${line.service || "Your number"} is now waiting for a verification code.`);
}

// Fire the "code arrived" alert.
export function notifyCodeReceived(line: SmsLineSnapshot) {
  if (!alertsEnabled) return;
  playBeep("code");
  osNotify("Verification code received", `${line.service || "Your number"}: ${line.otpReceived || "code received"}`);
}

// Fire an alert for a newly assigned virtual number.
export function notifyNumberAssigned(line: SmsLineSnapshot) {
  if (!alertsEnabled) return;
  playBeep("waiting");
  osNotify("New virtual number assigned", `${line.service || "A new number"} ${line.number ? `(${line.number}) ` : ""}is ready to receive codes.`);
}

// Fire an alert for an important system notification (loud "code" pattern + OS notification).
export function notifySystem(title: string, body: string) {
  if (!alertsEnabled) return;
  playBeep("code");
  osNotify(title, body);
}

// ————— Polling transport (default) —————

export function createPollingTransport(fetchLines: () => Promise<SmsLineSnapshot[]>, intervalMs = 4000): SmsStatusTransport {
  return {
    start(onSnapshot) {
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const lines = await fetchLines();
          if (!stopped) onSnapshot(lines);
        } catch (e) { /* ignore transient errors */ }
      };
      tick();
      const timer = setInterval(tick, intervalMs);
      return () => { stopped = true; clearInterval(timer); };
    }
  };
}

// ————— Diff helper: detect the two trigger moments —————
// Compares previous vs current snapshots and fires the right alerts.
export function detectSmsTransitions(
  prev: Map<string, SmsLineSnapshot>,
  current: SmsLineSnapshot[]
): { waiting: SmsLineSnapshot[]; codeReceived: SmsLineSnapshot[] } {
  const waiting: SmsLineSnapshot[] = [];
  const codeReceived: SmsLineSnapshot[] = [];
  for (const line of current) {
    const before = prev.get(line.id);
    // "Number enters waiting state": newly seen active line without a code yet.
    if (!before && line.status === "active" && !line.otpReceived) {
      waiting.push(line);
    }
    // "Code arrives": line now has an OTP it didn't have before.
    if (line.otpReceived && (!before || !before.otpReceived)) {
      codeReceived.push(line);
    }
  }
  return { waiting, codeReceived };
}
