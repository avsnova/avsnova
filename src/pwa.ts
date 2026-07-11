/**
 * PWA bootstrap — registers the service worker (production only) and exposes the
 * "install app" prompt through a tiny event system the UI can subscribe to.
 *
 * Safe by design:
 *  - Only registers in production builds (never interferes with the Vite dev server).
 *  - Registration failures are swallowed — the app works exactly as before without a SW.
 *  - The SW itself never caches /api, so there is zero risk of stale/auth'd data.
 */

let deferredPrompt: any = null;

export function canInstall(): boolean {
  return !!deferredPrompt;
}

/** Trigger the native install prompt. Returns the user's choice ("accepted"/"dismissed"/"unavailable"). */
export async function promptInstall(): Promise<string> {
  if (!deferredPrompt) return "unavailable";
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent("pwa:installable", { detail: { canInstall: false } }));
    return (choice && choice.outcome) || "dismissed";
  } catch {
    return "dismissed";
  }
}

export function initPwa() {
  // Capture the install prompt so the UI can offer an "Install app" button.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent("pwa:installable", { detail: { canInstall: true } }));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent("pwa:installed"));
  });

  // Register the service worker only in production (never in the Vite dev server).
  // Access import.meta.env defensively so we don't depend on vite/client typings.
  const isProd = (import.meta as any).env?.PROD === true;
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && isProd) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/" })
        .catch(() => { /* SW is a progressive enhancement — ignore failures */ });
    });
  }
}
