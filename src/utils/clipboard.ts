// Enterprise clipboard utility — the single copy service used across the whole platform.
// Reliable on iOS Safari/Chrome/Edge/Firefox, iPad, Android (Chrome/WebView/Samsung),
// and all desktop browsers. Tries multiple strategies and falls back until one succeeds.
//
// iOS notes: the async Clipboard API can silently fail inside some in-app/embedded
// WebViews and older iOS versions, so we always keep the execCommand + Selection-Range
// fallback (with the iOS-specific contentEditable/setSelectionRange workaround).

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; detect touch to disambiguate.
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
}

// Legacy/selection fallback that works when the async Clipboard API is unavailable or blocked.
function legacyCopy(value: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    // Keep it in the viewport but invisible — iOS won't copy off-screen/hidden elements reliably.
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.boxShadow = "none";
    textarea.style.background = "transparent";
    textarea.style.fontSize = "16px"; // prevents iOS auto-zoom/focus scroll
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    if (isIOS()) {
      // iOS requires an editable element + an explicit selection range.
      textarea.contentEditable = "true";
      textarea.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textarea.setSelectionRange(0, value.length);
    } else {
      textarea.focus();
      textarea.select();
    }

    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text == null ? "" : String(text);
  if (!value) return false;

  // 1. Modern async Clipboard API. On iOS, only trust it in a genuine secure context;
  //    otherwise go straight to the legacy path which is more reliable in iOS WebViews.
  try {
    const secure = typeof window !== "undefined" && (window.isSecureContext ?? true);
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText && secure) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to legacy method
  }

  // 2. Legacy execCommand / Selection-Range fallback (iOS-aware).
  if (legacyCopy(value)) return true;

  // 3. Last resort: some iOS WebViews still succeed via the async API even when
  //    isSecureContext is falsy — try it unconditionally before giving up.
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* give up */
  }

  return false;
}

/** Strip the leading country dialing code from an international number → local number.
 *  e.g. "+447521123456" with dialCode "+44" → "7521123456". Falls back to digits only. */
export function toLocalNumber(fullNumber: string, dialCode?: string): string {
  let n = String(fullNumber || "").trim();
  if (!n) return "";
  const dial = (dialCode || "").replace(/[^0-9]/g, "");
  const digits = n.replace(/[^0-9]/g, "");
  if (dial && digits.startsWith(dial)) return digits.slice(dial.length);
  // No known dial code: best-effort — drop a leading + and return remaining digits.
  return digits;
}
