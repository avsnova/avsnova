// Optional subtle UI sounds for premium feedback (success, error, info).
// Enabled by DEFAULT; users can turn them off (persisted). Uses WebAudio (no assets/network).
// Audio must be unlocked by a user gesture first (installNotifyAudioUnlock).

const PREF_KEY = "avs_ui_sounds_enabled";
let ctx: AudioContext | null = null;
let unlocked = false;

function readPref(): boolean {
  try { const v = localStorage.getItem(PREF_KEY); return v === null ? true : v === "1"; } catch { return true; }
}
let enabled = readPref();

export function areUiSoundsEnabled() { return enabled; }
export function setUiSoundsEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch {}
}

function ensureCtx() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch {}
}

// Attach once so the first interaction unlocks audio (default-on works without an explicit toggle).
export function installNotifyAudioUnlock() {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    unlocked = true; ensureCtx();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

function tone(freq: number, startAt: number, durMs: number, peak = 0.16, type: OscillatorType = "sine") {
  if (!ctx) return;
  const dur = durMs / 1000;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  osc.connect(gain);
  osc.start(startAt);
  osc.stop(startAt + dur);
}

// Play a short, tasteful cue for a given notification kind.
export function playUiSound(kind: "success" | "error" | "info" | "celebrate") {
  if (!enabled) return;
  try {
    ensureCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === "success") { tone(660, t, 90); tone(880, t + 0.09, 130); }
    else if (kind === "celebrate") { tone(659, t, 90); tone(784, t + 0.09, 90); tone(1047, t + 0.18, 200); }
    else if (kind === "error") { tone(320, t, 140, 0.18, "square"); tone(240, t + 0.13, 180, 0.16, "square"); }
    else { tone(560, t, 70, 0.10); } // info: soft single blip
  } catch {}
}
