// Flutterwave checkout helper.
// Loads the inline SDK, opens the hosted checkout, then verifies EVERY payment on the backend.
// The wallet/order is only ever updated server-side after verification — the frontend response
// is never trusted.

import { apiFetch } from "./api";

let sdkPromise: Promise<boolean> | null = null;

// Safety-net reconciliation: ask the server to re-verify the user's own recent PENDING payments
// directly with Flutterwave and credit any that actually succeeded. This covers redirect flows,
// closed tabs, mobile bank transfers and cases where the webhook isn't configured — the exact
// situations where the JS callback never fires and the wallet would otherwise never be credited.
// Returns the number of payments newly credited (0 is normal when there's nothing pending).
export async function reconcileFlutterwavePayments(): Promise<{ credited: number; balance?: number }> {
  try {
    const res = await apiFetch("/api/flutterwave/reconcile", { method: "POST", body: JSON.stringify({}) });
    return { credited: (res && res.credited) || 0, balance: res && res.balance };
  } catch {
    return { credited: 0 };
  }
}

// Lazily load the Flutterwave inline checkout SDK exactly once.
export function loadFlutterwaveSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).FlutterwaveCheckout) return Promise.resolve(true);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector('script[src="https://checkout.flutterwave.com/v3.js"]');
    if (existing) { existing.addEventListener("load", () => resolve(true)); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.flutterwave.com/v3.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { sdkPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

export type FlutterwavePurpose = "wallet" | "marketplace" | "gift";

export interface FlutterwaveResult {
  success: boolean;
  status: "successful" | "failed" | "cancelled";
  orderId?: string | null;
  balance?: number;
  error?: string;
}

export interface FlutterwaveStartOptions {
  purpose: FlutterwavePurpose;
  amount?: number;               // required for wallet funding
  productId?: string;            // required for marketplace/gift
  quantity?: number;
  shippingInfo?: any;            // gift/marketplace delivery details
  customerName?: string;
  customerEmail?: string;
  title?: string;
  description?: string;
}

// Full flow: initialize (server) → open checkout (client) → verify (server).
// Returns a resolved FlutterwaveResult; never throws for normal cancel/fail paths.
export async function startFlutterwavePayment(opts: FlutterwaveStartOptions): Promise<FlutterwaveResult> {
  const loaded = await loadFlutterwaveSdk();
  if (!loaded || !(window as any).FlutterwaveCheckout) {
    return { success: false, status: "failed", error: "Flutterwave checkout is still loading. Please try again in a moment." };
  }

  // 1) Server creates a pending record + returns tx_ref, public key, exact amount.
  let init: any;
  try {
    init = await apiFetch("/api/flutterwave/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: opts.amount,
        purpose: opts.purpose,
        productId: opts.productId,
        quantity: opts.quantity || 1,
        shippingInfo: opts.shippingInfo,
      }),
    });
  } catch (e: any) {
    return { success: false, status: "failed", error: e.message || "Could not initialize payment." };
  }
  if (!init || !init.success) {
    return { success: false, status: "failed", error: (init && init.error) || "Could not initialize payment." };
  }

  // 2) Open the hosted checkout and wait for the user to complete/cancel.
  return new Promise<FlutterwaveResult>((resolve) => {
    let settled = false;
    const finish = (r: FlutterwaveResult) => { if (!settled) { settled = true; resolve(r); } };

    try {
      (window as any).FlutterwaveCheckout({
        public_key: init.publicKey,
        tx_ref: init.tx_ref,
        amount: init.amount,
        currency: init.currency || "NGN",
        payment_options: "card,banktransfer,ussd",
        customer: {
          email: opts.customerEmail || init.customer?.email || "",
          name: opts.customerName || init.customer?.name || "AVS Customer",
        },
        customizations: {
          title: opts.title || "AVS Marketplace",
          description: opts.description || "Secure payment via Flutterwave",
        },
        callback: async (resp: any) => {
          // 3) ALWAYS verify server-side (never trust this response).
          try {
            const verifyRes = await apiFetch("/api/flutterwave/verify", {
              method: "POST",
              body: JSON.stringify({
                transaction_id: resp.transaction_id || resp.id,
                tx_ref: init.tx_ref,
                status: resp.status,
              }),
            });
            if (verifyRes && verifyRes.success) {
              finish({ success: true, status: "successful", orderId: verifyRes.orderId, balance: verifyRes.balance });
            } else {
              finish({ success: false, status: (verifyRes && verifyRes.status) || "failed", error: (verifyRes && verifyRes.error) || "Verification failed." });
            }
          } catch (e: any) {
            finish({ success: false, status: "failed", error: e.message || "Verification failed." });
          }
          try { (window as any).FlutterwaveCheckout && document.querySelectorAll(".flutterwave-checkout-iframe").forEach(el => el.remove()); } catch {}
        },
        onclose: async () => {
          // If we already settled via callback, ignore. Otherwise treat as cancellation and
          // notify the server so the pending record is marked cancelled.
          if (settled) return;
          try {
            await apiFetch("/api/flutterwave/verify", {
              method: "POST",
              body: JSON.stringify({ tx_ref: init.tx_ref, status: "cancelled" }),
            });
          } catch { /* ignore */ }
          finish({ success: false, status: "cancelled", error: "Payment was cancelled." });
        },
      });
    } catch (e: any) {
      finish({ success: false, status: "failed", error: e.message || "Could not open checkout." });
    }
  });
}
