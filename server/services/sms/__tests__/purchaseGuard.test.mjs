// Automated tests (§20) for the Loss-Prevention Purchase Guard.
// Pure Node — no external test framework. Uses an in-memory fake DB + fake provider to prove:
//   - insufficient funds never contacts the provider
//   - provider failure fully refunds and removes the local order
//   - success debits once, keeps the order, records the txn
//   - duplicate idempotency key is prevented
// Run: node server/services/sms/__tests__/purchaseGuard.test.mjs
import assert from "assert";
import { safePurchase } from "../purchaseGuard.js";

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS  ${name}`); passed++; } catch (e) { console.log(`FAIL  ${name}: ${e.message}`); failed++; } }

// Minimal fake DB emulating the exact SQL the guard uses.
function makeDb(startBalance) {
  const state = { balance: startBalance, orders: new Map(), keys: new Set() };
  const dbRun = async (sql, p) => {
    if (/UPDATE users SET wallet_balance = wallet_balance - \? WHERE id = \? AND wallet_balance >= \?/.test(sql)) {
      const [amt, , min] = p;
      if (state.balance >= min) { state.balance -= amt; return { changes: 1 }; }
      return { changes: 0 };
    }
    if (/UPDATE users SET wallet_balance = wallet_balance \+ \?/.test(sql)) { state.balance += p[0]; return { changes: 1 }; }
    return { changes: 0 };
  };
  const dbGet = async (sql, p) => {
    if (/SELECT wallet_balance FROM users/.test(sql)) return { wallet_balance: state.balance };
    return null;
  };
  return { state, dbRun, dbGet };
}
const noAudit = async () => {};

// 1. Insufficient funds -> provider NEVER called, balance unchanged.
await test("insufficient funds never contacts provider", async () => {
  const { state, dbRun, dbGet } = makeDb(50);
  let providerCalled = false;
  const r = await safePurchase({ dbRun, dbGet, audit: noAudit }, {
    userId: 1, amountNgn: 100, idempotencyKey: "k1",
    createLocalOrder: async () => { throw new Error("should not create"); },
    buyFromProvider: async () => { providerCalled = true; return {}; },
    removeLocalOrder: async () => {},
    recordTxn: async () => {},
  });
  assert.equal(r.ok, false); assert.equal(r.code, "INSUFFICIENT_FUNDS");
  assert.equal(providerCalled, false, "provider must not be called");
  assert.equal(state.balance, 50, "balance must be unchanged");
});

// 2. Provider failure -> full refund + local order removed.
await test("provider failure refunds fully and removes order", async () => {
  const { state, dbRun, dbGet } = makeDb(500);
  let removed = false;
  const r = await safePurchase({ dbRun, dbGet, audit: noAudit }, {
    userId: 1, amountNgn: 130, idempotencyKey: "k2",
    createLocalOrder: async () => {},
    buyFromProvider: async () => { throw new Error("no stock"); },
    removeLocalOrder: async () => { removed = true; },
    recordTxn: async () => {},
  });
  assert.equal(r.ok, false); assert.equal(r.code, "PROVIDER_FAILED");
  assert.equal(removed, true, "local order must be removed");
  assert.equal(state.balance, 500, "balance must be fully restored");
});

// 3. Success -> debited once, order kept, txn recorded.
await test("success debits once, keeps order, records txn", async () => {
  const { state, dbRun, dbGet } = makeDb(500);
  let txnRecorded = false, orderKept = true;
  const r = await safePurchase({ dbRun, dbGet, audit: noAudit }, {
    userId: 1, amountNgn: 130, idempotencyKey: "k3",
    createLocalOrder: async () => {},
    buyFromProvider: async () => ({ providerSessionId: "P123", number: "4915100000000" }),
    removeLocalOrder: async () => { orderKept = false; },
    recordTxn: async () => { txnRecorded = true; },
  });
  assert.equal(r.ok, true);
  assert.equal(state.balance, 370, "exactly one debit of 130");
  assert.equal(txnRecorded, true); assert.equal(orderKept, true);
  assert.equal(r.result.providerSessionId, "P123");
});

// 4. Duplicate idempotency key (concurrent) -> second is blocked, refunded, no double order.
await test("duplicate purchase prevented (unique-constraint path)", async () => {
  const { state, dbRun, dbGet } = makeDb(500);
  const r = await safePurchase({ dbRun, dbGet, audit: noAudit }, {
    userId: 1, amountNgn: 130, idempotencyKey: "k4",
    createLocalOrder: async () => { const e = new Error("UNIQUE constraint failed"); throw e; },
    buyFromProvider: async () => ({ providerSessionId: "X" }),
    removeLocalOrder: async () => {},
    recordTxn: async () => {},
  });
  assert.equal(r.ok, false); assert.equal(r.code, "DUPLICATE");
  assert.equal(state.balance, 500, "duplicate must be refunded (no charge)");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
