// DB-backed virtual Lightning ledger.
// Replaces the in-memory globalThis Map stub with hold_invoices + wallets tables.
// All multi-row mutations use better-sqlite3 db.transaction() (synchronous).
// Auto-transitions CREATED → ACCEPTED after 2000ms to preserve stub-mode UX.
import type { HoldInvoice, LightningClient } from "./types";
import { randomHex } from "./hash";
import { randomUUID } from "crypto";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Seed amounts by pubkey pattern (applied only when wallet row is freshly created).
// ---------------------------------------------------------------------------
function defaultSeedSats(pubkey: string): number {
  if (pubkey === "02demo_poster_pubkey") return 100_000;
  if (pubkey === "02platform_pubkey") return 0;
  if (pubkey.startsWith("02")) return 10_000;
  return 5_000;
}

// ---------------------------------------------------------------------------
// ensureWallet — idempotent. Creates wallet row if not present, logs SEED tx.
// ---------------------------------------------------------------------------
async function ensureWallet(
  pubkey: string,
  label?: string,
  seedSats?: number
): Promise<void> {
  const db = getDb();
  const seed = seedSats !== undefined ? seedSats : defaultSeedSats(pubkey);

  // INSERT OR IGNORE — no-op if pubkey already exists.
  const result = await Promise.resolve(
    db
      .prepare(
        `INSERT OR IGNORE INTO wallets (pubkey, balance_sats, locked_sats, label)
         VALUES (?, ?, 0, ?)`
      )
      .run(pubkey, seed, label ?? null)
  );

  // Only insert SEED tx when a fresh row was actually created and seed > 0.
  if (result.changes > 0 && seed > 0) {
    db.prepare(
      `INSERT INTO wallet_transactions
         (id, pubkey, amount_sats, type, reason)
       VALUES (?, ?, ?, 'SEED', 'initial seed')`
    ).run(`wtx_${randomUUID().replace(/-/g, "").slice(0, 16)}`, pubkey, seed);

    console.log(
      `[lightning][ensureWallet] created wallet for ${pubkey} with ${seed} sat seed`
    );
  }
}

// ---------------------------------------------------------------------------
// createHoldInvoice
// ---------------------------------------------------------------------------
async function createHoldInvoice(
  amountSats: number,
  description: string,
  payerPubkey?: string
): Promise<HoldInvoice> {
  const db = getDb();
  const payer = payerPubkey ?? "02demo_poster_pubkey";

  // Lazy wallet creation for the payer.
  await ensureWallet(payer);

  const paymentHash = randomHex(32);
  const paymentRequest = `lnbcledger_${paymentHash}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO hold_invoices
       (payment_hash, payment_request, amount_sats, description, payer_pubkey, status)
     VALUES (?, ?, ?, ?, ?, 'CREATED')`
  ).run(paymentHash, paymentRequest, amountSats, description, payer);

  const invoice: HoldInvoice = {
    paymentRequest,
    paymentHash,
    amountSats,
    description,
    status: "CREATED",
    createdAt,
  };

  // Simulate wallet payment — auto-accept after 2 seconds.
  setTimeout(() => {
    try {
      _acceptInvoice(paymentHash, payer, amountSats);
    } catch (err) {
      console.error(
        `[lightning][createHoldInvoice] auto-accept failed for ${paymentHash}:`,
        err
      );
    }
  }, 2000);

  return invoice;
}

// ---------------------------------------------------------------------------
// _acceptInvoice — internal: transitions CREATED → ACCEPTED and locks funds.
// Called from the setTimeout. Wrapped in a DB transaction.
// ---------------------------------------------------------------------------
function _acceptInvoice(
  paymentHash: string,
  payerPubkey: string,
  amountSats: number
): void {
  const db = getDb();

  // Check current status — only move from CREATED.
  const row = db
    .prepare("SELECT status FROM hold_invoices WHERE payment_hash = ?")
    .get(paymentHash) as { status: string } | undefined;

  if (!row || row.status !== "CREATED") return;

  // Check payer balance.
  const wallet = db
    .prepare("SELECT balance_sats FROM wallets WHERE pubkey = ?")
    .get(payerPubkey) as { balance_sats: number } | undefined;

  const available = wallet?.balance_sats ?? 0;

  if (available < amountSats) {
    // Insufficient funds — cancel instead of locking.
    db.prepare(
      "UPDATE hold_invoices SET status = 'CANCELED' WHERE payment_hash = ?"
    ).run(paymentHash);
    console.warn(
      `[lightning][accept] insufficient balance for ${payerPubkey}: ` +
        `need ${amountSats} sat, have ${available} — invoice ${paymentHash} CANCELED`
    );
    return;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE hold_invoices
       SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP
       WHERE payment_hash = ?`
    ).run(paymentHash);

    db.prepare(
      `UPDATE wallets
       SET balance_sats = balance_sats - ?,
           locked_sats  = locked_sats  + ?
       WHERE pubkey = ?`
    ).run(amountSats, amountSats, payerPubkey);

    db.prepare(
      `INSERT INTO wallet_transactions
         (id, pubkey, amount_sats, type, reason, related_invoice_hash)
       VALUES (?, ?, ?, 'HOLD', ?, ?)`
    ).run(
      `wtx_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      payerPubkey,
      -amountSats,
      `hold for invoice ${paymentHash}`,
      paymentHash
    );
  })();

  console.log(
    `[lightning][accept] invoice ${paymentHash}: ${amountSats} sat locked from ${payerPubkey}`
  );
}

// ---------------------------------------------------------------------------
// getInvoice
// ---------------------------------------------------------------------------
async function getInvoice(paymentHash: string): Promise<HoldInvoice | null> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT payment_hash, payment_request, amount_sats, description, status, created_at
       FROM hold_invoices WHERE payment_hash = ?`
    )
    .get(paymentHash) as
    | {
        payment_hash: string;
        payment_request: string;
        amount_sats: number;
        description: string;
        status: "CREATED" | "ACCEPTED" | "SETTLED" | "CANCELED";
        created_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    paymentRequest: row.payment_request,
    paymentHash: row.payment_hash,
    amountSats: row.amount_sats,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// settleHoldInvoice
// Settles the invoice: recipient gets settleAmountSats, remainder refunded to payer.
// recipientPubkey defaults to "02platform_pubkey" (effective burn).
// settleAmountSats defaults to invoice.amount_sats (full settle).
// ---------------------------------------------------------------------------
async function settleHoldInvoice(
  paymentHash: string,
  recipientPubkey?: string,
  settleAmountSats?: number
): Promise<void> {
  const db = getDb();

  const invoice = db
    .prepare(
      `SELECT payment_hash, amount_sats, payer_pubkey, status
       FROM hold_invoices WHERE payment_hash = ?`
    )
    .get(paymentHash) as
    | {
        payment_hash: string;
        amount_sats: number;
        payer_pubkey: string;
        status: string;
      }
    | undefined;

  if (!invoice) {
    throw new Error(
      `[lightning][settle] invoice not found: ${paymentHash}`
    );
  }

  if (invoice.status !== "ACCEPTED") {
    // Graceful no-op: already settled, canceled, or still CREATED.
    console.warn(
      `[lightning][settle] invoice ${paymentHash} is ${invoice.status}, expected ACCEPTED — skipping`
    );
    return;
  }

  const recipient = recipientPubkey ?? "02platform_pubkey";
  const settleAmount =
    settleAmountSats !== undefined ? settleAmountSats : invoice.amount_sats;
  const refundAmount = invoice.amount_sats - settleAmount;

  // Ensure recipient wallet exists (creates with 0 seed for platform pubkey).
  await ensureWallet(
    recipient,
    recipient === "02platform_pubkey" ? "platform" : undefined
  );

  db.transaction(() => {
    // Mark invoice as SETTLED.
    db.prepare(
      `UPDATE hold_invoices
       SET status = 'SETTLED',
           settled_at = CURRENT_TIMESTAMP,
           recipient_pubkey = ?,
           settled_amount_sats = ?
       WHERE payment_hash = ?`
    ).run(recipient, settleAmount, paymentHash);

    // Release payer's locked sats. If there's a refund, credit it back to balance.
    db.prepare(
      `UPDATE wallets
       SET locked_sats  = locked_sats  - ?,
           balance_sats = balance_sats + ?
       WHERE pubkey = ?`
    ).run(invoice.amount_sats, refundAmount, invoice.payer_pubkey);

    // Credit recipient.
    db.prepare(
      `UPDATE wallets SET balance_sats = balance_sats + ? WHERE pubkey = ?`
    ).run(settleAmount, recipient);

    const txBase = `wtx_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

    // Payer settle tx (negative settle amount; refund already handled above via balance credit).
    db.prepare(
      `INSERT INTO wallet_transactions
         (id, pubkey, amount_sats, type, reason, related_invoice_hash)
       VALUES (?, ?, ?, 'SETTLE', ?, ?)`
    ).run(
      `${txBase}_p`,
      invoice.payer_pubkey,
      -settleAmount,
      `settle invoice ${paymentHash}` + (refundAmount > 0 ? ` (refund ${refundAmount} sat)` : ""),
      paymentHash
    );

    // Recipient credit tx.
    db.prepare(
      `INSERT INTO wallet_transactions
         (id, pubkey, amount_sats, type, reason, related_invoice_hash)
       VALUES (?, ?, ?, 'SETTLE', ?, ?)`
    ).run(
      `${txBase}_r`,
      recipient,
      settleAmount,
      `receive settle for invoice ${paymentHash}`,
      paymentHash
    );
  })();

  console.log(
    `[lightning][settle] invoice ${paymentHash}: ` +
      `${settleAmount} sat → ${recipient}, refund ${refundAmount} sat → ${invoice.payer_pubkey}`
  );
}

// ---------------------------------------------------------------------------
// cancelHoldInvoice — full refund to payer. Idempotent.
// ---------------------------------------------------------------------------
async function cancelHoldInvoice(paymentHash: string): Promise<void> {
  const db = getDb();

  const invoice = db
    .prepare(
      "SELECT payment_hash, amount_sats, payer_pubkey, status FROM hold_invoices WHERE payment_hash = ?"
    )
    .get(paymentHash) as
    | {
        payment_hash: string;
        amount_sats: number;
        payer_pubkey: string;
        status: string;
      }
    | undefined;

  if (!invoice) {
    // Already gone — idempotent.
    return;
  }

  if (invoice.status !== "ACCEPTED") {
    // Already settled, already canceled, or still CREATED (funds never locked) — no-op.
    if (invoice.status !== "CANCELED") {
      // Mark CREATED invoices as CANCELED so they don't auto-accept later.
      db.prepare(
        "UPDATE hold_invoices SET status = 'CANCELED' WHERE payment_hash = ? AND status = 'CREATED'"
      ).run(paymentHash);
    }
    return;
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE hold_invoices SET status = 'CANCELED' WHERE payment_hash = ?"
    ).run(paymentHash);

    // Unlock: move from locked_sats back to balance_sats.
    db.prepare(
      `UPDATE wallets
       SET locked_sats  = locked_sats  - ?,
           balance_sats = balance_sats + ?
       WHERE pubkey = ?`
    ).run(invoice.amount_sats, invoice.amount_sats, invoice.payer_pubkey);

    db.prepare(
      `INSERT INTO wallet_transactions
         (id, pubkey, amount_sats, type, reason, related_invoice_hash)
       VALUES (?, ?, ?, 'CANCEL', ?, ?)`
    ).run(
      `wtx_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      invoice.payer_pubkey,
      invoice.amount_sats,
      `cancel refund for invoice ${paymentHash}`,
      paymentHash
    );
  })();

  console.log(
    `[lightning][cancel] invoice ${paymentHash}: ${invoice.amount_sats} sat refunded to ${invoice.payer_pubkey}`
  );
}

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------
async function getBalance(
  pubkey: string
): Promise<{ available_sats: number; locked_sats: number }> {
  const db = getDb();
  const row = db
    .prepare("SELECT balance_sats, locked_sats FROM wallets WHERE pubkey = ?")
    .get(pubkey) as
    | { balance_sats: number; locked_sats: number }
    | undefined;

  return {
    available_sats: row?.balance_sats ?? 0,
    locked_sats: row?.locked_sats ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
class LedgerLightningClient implements LightningClient {
  createHoldInvoice = createHoldInvoice;
  getInvoice = getInvoice;
  settleHoldInvoice = settleHoldInvoice;
  cancelHoldInvoice = cancelHoldInvoice;
  getBalance = getBalance;
  ensureWallet = ensureWallet;
}

let _client: LedgerLightningClient | null = null;

export function getLightningClient(): LightningClient {
  if (!_client) _client = new LedgerLightningClient();
  return _client;
}
