// ============================================================================
//  Loss-Prevention Purchase Guard (§7).
//  Enforces the mandatory purchase invariant so the business can never lose money:
//
//    1. Atomically debit the wallet (guarded UPDATE — fails if insufficient funds).
//    2. Create the local order row FIRST (with idempotency key).
//    3. Buy from the provider.
//    4a. Provider OK  -> commit (order stays, txn recorded).
//    4b. Provider FAIL -> COMPENSATE: refund the exact debited amount + delete the pending row.
//
//  - If wallet debit fails: the provider is NEVER contacted (no spend).
//  - Duplicate purchases are prevented by a unique idempotency key + an in-flight guard.
//  - Every step is audit-logged.
//
//  This module is pure orchestration; it takes injected DB + provider + log helpers so it stays
//  testable and provider-independent.
// ============================================================================

// In-process guard against rapid double-submits (belt-and-braces on top of the DB unique index).
const _inFlight = new Set();

// Atomically debit `amountNgn` from a user's wallet. Returns { ok, newBalance } | { ok:false }.
// The WHERE clause guarantees we never debit below zero (no race can double-spend).
export async function atomicDebit(dbRun, dbGet, userId, amountNgn) {
  const upd = await dbRun(
    "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?",
    [amountNgn, userId, amountNgn]
  );
  if (!upd || upd.changes === 0) return { ok: false };
  const row = await dbGet("SELECT wallet_balance FROM users WHERE id = ?", [userId]);
  return { ok: true, newBalance: row ? row.wallet_balance : null };
}

// Compensating refund (credits the wallet back). Used when the provider purchase fails AFTER
// we've already debited. Idempotent-safe to call once per failed attempt.
export async function refund(dbRun, userId, amountNgn) {
  await dbRun("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", [amountNgn, userId]);
}

/**
 * Run a transaction-safe purchase.
 * @param deps { dbRun, dbGet, audit }  audit({event,detail,status})
 * @param opts {
 *   userId, amountNgn, idempotencyKey,
 *   createLocalOrder(): Promise<void>      // insert the 'active' virtual_numbers + orders rows
 *   buyFromProvider(): Promise<result>     // returns provider purchase result (throws on failure)
 *   removeLocalOrder(): Promise<void>      // delete the pending rows on provider failure
 *   recordTxn(costCtx): Promise<void>      // record the ledger txn on success
 * }
 * @returns { ok:true, result, newBalance } | { ok:false, error, code }
 */
export async function safePurchase(deps, opts) {
  const { dbRun, dbGet, audit } = deps;
  const { userId, amountNgn, idempotencyKey } = opts;

  // (0) Duplicate-purchase guard (in-process). DB unique index is the authoritative backstop.
  if (idempotencyKey && _inFlight.has(idempotencyKey)) {
    return { ok: false, code: "DUPLICATE", error: "A matching purchase is already in progress." };
  }
  if (idempotencyKey) _inFlight.add(idempotencyKey);

  let debited = false;
  let localCreated = false;
  try {
    // (1) Atomic wallet debit — provider is NEVER contacted if this fails.
    const deb = await atomicDebit(dbRun, dbGet, userId, amountNgn);
    if (!deb.ok) { await audit({ event: "purchase_blocked", detail: `insufficient funds user=${userId} need=${amountNgn}`, status: "fail" }); return { ok: false, code: "INSUFFICIENT_FUNDS", error: "Insufficient wallet balance." }; }
    debited = true;
    await audit({ event: "wallet_debited", detail: `user=${userId} amount=${amountNgn} newBal=${deb.newBalance}` });

    // (2) Create the local order row FIRST (idempotency key enforced by DB unique index).
    try {
      await opts.createLocalOrder();
      localCreated = true;
    } catch (e) {
      // A unique-constraint violation here means a concurrent identical purchase already exists.
      if (/UNIQUE|constraint/i.test(e.message || "")) {
        await refund(dbRun, userId, amountNgn); debited = false;
        await audit({ event: "purchase_deduped", detail: `idempotency=${idempotencyKey}`, status: "fail" });
        return { ok: false, code: "DUPLICATE", error: "Duplicate purchase prevented." };
      }
      throw e;
    }

    // (3) Buy from the provider.
    let result;
    try {
      result = await opts.buyFromProvider();
    } catch (e) {
      // (4b) Provider failed -> COMPENSATE: remove local order + refund the exact amount.
      try { if (localCreated) await opts.removeLocalOrder(); } catch (_) {}
      await refund(dbRun, userId, amountNgn); debited = false;
      await audit({ event: "purchase_provider_failed_refunded", detail: `user=${userId} refunded=${amountNgn} err=${(e.message || "").slice(0, 120)}`, status: "fail" });
      return { ok: false, code: "PROVIDER_FAILED", error: e.message || "Provider purchase failed. You were fully refunded." };
    }

    // (4a) Success — record the ledger transaction.
    try { await opts.recordTxn(result); } catch (e) { /* ledger write failure is non-fatal to the order */ }
    const bal = await dbGet("SELECT wallet_balance FROM users WHERE id = ?", [userId]);
    await audit({ event: "purchase_committed", detail: `user=${userId} amount=${amountNgn} provider_order=${result.providerOrderId || result.providerSessionId || "?"}` });
    return { ok: true, result, newBalance: bal ? bal.wallet_balance : deb.newBalance };
  } catch (e) {
    // Unexpected error: best-effort compensation so we never leave money debited without an order.
    try { if (localCreated) await opts.removeLocalOrder(); } catch (_) {}
    if (debited) { try { await refund(dbRun, userId, amountNgn); } catch (_) {} }
    await audit({ event: "purchase_error_refunded", detail: `user=${userId} err=${(e.message || "").slice(0, 150)}`, status: "fail" });
    return { ok: false, code: "ERROR", error: "Purchase failed and was safely rolled back." };
  } finally {
    if (idempotencyKey) _inFlight.delete(idempotencyKey);
  }
}
