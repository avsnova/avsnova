// Global Production-Only API Bridge
// Strictly communicates with your secure backend server
// No mock database fallbacks, fake profiles, or simulated data exist under any condition
// All requests are executed as real, live network requests.

// Safe Memory Storage Fallback to prevent browser SecurityError "The operation is insecure" inside sandboxed previews
class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

// Safe storage bridge
const safeLocalStorage = (() => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("__avs_test_write__", "1");
      window.localStorage.removeItem("__avs_test_write__");
      return window.localStorage;
    }
  } catch (e) {
    console.warn("[Aurevashop Storage Bridge] Browser sandbox blocked localStorage. Falling back to secure in-memory storage.");
  }
  return new MemoryStorage();
})();

export const getSessionToken = () => {
  return safeLocalStorage.getItem("avs_token");
};

export const setSessionToken = (token: string) => {
  safeLocalStorage.setItem("avs_token", token);
};

export const clearSessionToken = () => {
  safeLocalStorage.removeItem("avs_token");
};

export const getApiBaseUrl = () => {
  // Production-hardened relative base routing. Works seamlessly on localhost,
  // network IPs, sandboxed iframes, and compiled production servers.
  return "";
};

// ---------------------------------------------------------------------------
// Backend readiness gate.
// Polls GET /api/health with exponential backoff until the backend reports ready.
// The result is cached so pages/pollers only ever wait once per session. This
// prevents API-dependent code from firing ECONNREFUSED bursts during startup.
// ---------------------------------------------------------------------------
let backendReady = false;
let readinessPromise: Promise<boolean> | null = null;

export const isBackendReady = () => backendReady;

const checkHealthOnce = async (timeoutMs = 4000): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data && (data.ready === true || data.status === "ok");
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
};

/**
 * Resolve once the backend is healthy. Uses exponential backoff (capped) and
 * de-duplicates concurrent callers via a shared promise. `onWaiting` fires on the
 * first failed attempt so the UI can show a "Connecting to server..." state.
 */
export const waitForBackend = (onWaiting?: () => void): Promise<boolean> => {
  if (backendReady) return Promise.resolve(true);
  if (readinessPromise) return readinessPromise;

  readinessPromise = (async () => {
    let attempt = 0;
    let notifiedWaiting = false;
    // Backoff schedule: 0.5s, 1s, 2s, 4s, capped at 5s. Retries indefinitely
    // (the app is useless without the backend) but never in a tight loop.
    while (!backendReady) {
      const ok = await checkHealthOnce();
      if (ok) {
        backendReady = true;
        return true;
      }
      if (!notifiedWaiting) {
        notifiedWaiting = true;
        try { onWaiting?.(); } catch { /* ignore */ }
      }
      attempt++;
      const delay = Math.min(5000, 500 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
    return true;
  })();

  return readinessPromise;
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const baseUrl = getApiBaseUrl();
  const fullUrl = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const token = getSessionToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    console.error("[Aurevashop Production Channel] Network connection failed:", networkError.message);
    throw new Error("Service temporarily unavailable. Please verify your internet connection or try again.");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err: any = new Error(errorData.error || `HTTP error! Status: ${response.status}`);
    // Attach structured context so callers can react to specific conditions (e.g. the
    // Admin Authorization Code flow reads err.authCodeRequired / err.status).
    err.status = response.status;
    err.data = errorData;
    err.authCodeRequired = !!errorData.authCodeRequired;
    err.action = errorData.action;
    throw err;
  }

  return response.json();
};
