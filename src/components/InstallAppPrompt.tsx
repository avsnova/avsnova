import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { canInstall, promptInstall } from "../pwa";

/**
 * InstallAppPrompt — a subtle, dismissible "Install app" banner that appears only when
 * the browser reports the PWA is installable (captured beforeinstallprompt). Fully
 * self-contained and mounted once at the app root. Dismissal is remembered for the
 * session so it never nags. Zero impact when not installable.
 */
export default function InstallAppPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Respect a prior dismissal this session.
    if (sessionStorage.getItem("avs_pwa_dismissed") === "1") return;
    if (canInstall()) setShow(true);
    const onInstallable = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.canInstall && sessionStorage.getItem("avs_pwa_dismissed") !== "1") setShow(true);
      else setShow(false);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("pwa:installable", onInstallable as EventListener);
    window.addEventListener("pwa:installed", onInstalled);
    return () => {
      window.removeEventListener("pwa:installable", onInstallable as EventListener);
      window.removeEventListener("pwa:installed", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    sessionStorage.setItem("avs_pwa_dismissed", "1");
    setShow(false);
  };

  const install = async () => {
    const result = await promptInstall();
    if (result !== "unavailable") setShow(false);
  };

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[280] flex justify-center px-3 pb-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-[#12082b] to-[#0a0418] px-4 py-3 shadow-2xl">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#22d3ee] flex items-center justify-center text-white font-black text-lg">A</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Install Aurevashop</div>
          <div className="text-[11px] text-purple-200/60 truncate">Add to your home screen for a faster, app-like experience.</div>
        </div>
        <button
          onClick={install}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#22d3ee] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" /> Install
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded-lg text-purple-200/40 hover:text-white cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
