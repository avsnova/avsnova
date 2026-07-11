// Monnify checkout + reserved-account helper.
// Reserved (dedicated) virtual account funding is the primary flow: the user transfers to their
// permanent account and the webhook credits the wallet. A hosted checkout is also supported.
// Every credit is verified server-side; the frontend response is never trusted.

import { apiFetch } from "./api";

export interface MonnifyReservedAccount {
  accountNumber: string | null;
  bankName?: string;
  accountName?: string;
  reference?: string;
}

// Fetch the user's existing reserved account (may be null if not yet created).
export async function getMonnifyReservedAccount(): Promise<MonnifyReservedAccount> {
  try {
    const res = await apiFetch("/api/monnify/reserved-account");
    if (res && res.success) return { accountNumber: res.accountNumber, bankName: res.bankName, accountName: res.accountName, reference: res.reference };
  } catch { /* ignore */ }
  return { accountNumber: null };
}

// Create the reserved account on demand (idempotent server-side).
export async function setupMonnifyReservedAccount(): Promise<MonnifyReservedAccount> {
  const res = await apiFetch("/api/monnify/reserved-account/setup", { method: "POST", body: JSON.stringify({}) });
  if (!res || !res.success) throw new Error((res && res.error) || "Could not create Monnify account.");
  return { accountNumber: res.accountNumber, bankName: res.bankName, accountName: res.accountName, reference: res.reference };
}

// Safety-net reconciliation for pending Monnify payments (redirect / missed webhook).
export async function reconcileMonnifyPayments(): Promise<{ credited: number; balance?: number }> {
  try {
    const res = await apiFetch("/api/monnify/reconcile", { method: "POST", body: JSON.stringify({}) });
    return { credited: (res && res.credited) || 0, balance: res && res.balance };
  } catch { return { credited: 0 }; }
}

export interface MonnifyResult {
  success: boolean;
  status: "successful" | "failed" | "cancelled" | "pending";
  balance?: number;
  error?: string;
}

const PENDING_KEY = "avs_monnify_pending_ref";

// After a full-page redirect back from Monnify, verify the stored/return reference (if any).
// Returns credited result or null when there's nothing to verify. Safe to call on app load.
export async function verifyMonnifyReturn(): Promise<MonnifyResult | null> {
  let ref = "";
  try {
    const url = new URL(window.location.href);
    ref = url.searchParams.get("paymentReference") || url.searchParams.get("monnify_ref") || "";
    if (ref) {
      // Clean the query string so a refresh doesn't re-trigger.
      url.searchParams.delete("paymentReference"); url.searchParams.delete("monnify_ref");
      window.history.replaceState({}, "", url.toString());
    }
  } catch { /* ignore */ }
  if (!ref) { try { ref = localStorage.getItem(PENDING_KEY) || ""; } catch {} }
  if (!ref) return null;
  try { localStorage.removeItem(PENDING_KEY); } catch {}
  try {
    const v = await apiFetch("/api/monnify/verify", { method: "POST", body: JSON.stringify({ paymentReference: ref }) });
    if (v && v.success) return { success: true, status: "successful", balance: v.balance };
    return { success: false, status: "pending", error: (v && v.error) || "Payment not confirmed yet." };
  } catch { return { success: false, status: "pending" }; }
}

// Hosted checkout flow: initialize (server) -> open Monnify checkout in a popup/redirect ->
// poll verify (server) until the transaction is confirmed or the window closes.
export async function startMonnifyCheckout(amount: number): Promise<MonnifyResult> {
  let init: any;
  try {
    // Redirect back to the Wallet with the reference so a full-page redirect can be reconciled.
    const redirectUrl = `${window.location.origin}${window.location.pathname}#Wallet`;
    init = await apiFetch("/api/monnify/initialize", { method: "POST", body: JSON.stringify({ amount, redirectUrl }) });
  } catch (e: any) {
    return { success: false, status: "failed", error: e.message || "Could not initialize payment." };
  }
  if (!init || !init.success || !init.checkoutUrl) {
    return { success: false, status: "failed", error: (init && init.error) || "Could not initialize payment." };
  }

  const paymentReference = init.paymentReference;
  try { localStorage.setItem(PENDING_KEY, paymentReference); } catch {}
  const popup = window.open(init.checkoutUrl, "monnify_checkout", "width=480,height=720");
  if (!popup) {
    // Popup blocked — fall back to full redirect (return handled by verifyMonnifyReturn on load).
    window.location.href = init.checkoutUrl;
    return { success: false, status: "pending", error: "Redirecting to Monnify to complete payment..." };
  }

  // Poll for completion: verify server-side every few seconds until success or the popup closes.
  return new Promise<MonnifyResult>((resolve) => {
    let done = false;
    const finish = (r: MonnifyResult) => { if (!done) { done = true; clearInterval(timer); resolve(r); } };
    const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch {} };
    const timer = setInterval(async () => {
      try {
        const v = await apiFetch("/api/monnify/verify", { method: "POST", body: JSON.stringify({ paymentReference }) });
        if (v && v.success) { clearPending(); try { popup.close(); } catch {} finish({ success: true, status: "successful", balance: v.balance }); return; }
      } catch { /* keep polling */ }
      if (popup.closed) {
        // One last verify attempt after the window closes, then reconcile.
        try {
          const v = await apiFetch("/api/monnify/verify", { method: "POST", body: JSON.stringify({ paymentReference }) });
          if (v && v.success) { clearPending(); finish({ success: true, status: "successful", balance: v.balance }); return; }
        } catch { /* ignore */ }
        finish({ success: false, status: "pending", error: "Payment window closed. If you paid, your wallet will update shortly." });
      }
    }, 4000);
    // Hard timeout after 6 minutes.
    setTimeout(() => finish({ success: false, status: "pending", error: "Verification timed out. If you paid, your wallet will update shortly." }), 360000);
  });
}
