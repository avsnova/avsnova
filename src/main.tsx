import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import NetworkStatusBanner from "./components/NetworkStatusBanner";
import InstallAppPrompt from "./components/InstallAppPrompt";
import { initPwa } from "./pwa";

// ——— Rendering-engine detection for the scroll-performance CSS layer ———
// backdrop-filter (Tailwind `backdrop-blur-*`) is cheap on WebKit/Safari but very
// expensive to repaint per-frame on Chromium & Firefox, which caused the "smooth on
// iPhone, laggy on Android/desktop" symptom. We tag <html> so index.css can disable
// the costly blur on Blink/Gecko only, leaving Safari/iOS visually untouched.
(function detectEngine() {
  try {
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    // iOS browsers all use WebKit under the hood — treat them as Safari (keep blur).
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
    if (isSafari || isIOS) return; // WebKit: leave real backdrop blur intact
    let engine = "";
    if (/firefox|fxios/i.test(ua)) engine = "gecko";
    else engine = "blink"; // Chrome, Edge, Chromium, Android WebView, Opera, etc.
    document.documentElement.setAttribute("data-engine", engine);
  } catch { /* if detection fails, fall back to keeping blur (safe) */ }
})();

// PWA: register the service worker (prod only) + capture the install prompt.
initPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <NetworkStatusBanner />
          <InstallAppPrompt />
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
