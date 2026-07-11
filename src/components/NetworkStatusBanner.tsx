import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * NetworkStatusBanner — global, non-intrusive offline indicator.
 * Uses the browser's online/offline events. Shows a fixed banner when the
 * connection drops so users understand why actions may fail, and disappears
 * automatically when connectivity returns. Mounted once at the app root.
 */
export default function NetworkStatusBanner() {
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-[300] flex items-center justify-center gap-2 bg-amber-500 text-black text-xs font-bold py-2 px-4 shadow-lg animate-[slideDown_0.25s_ease]"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>You're offline. Some actions may not work until your connection returns.</span>
    </div>
  );
}
