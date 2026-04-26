// GET  /api/wallet  — return current user's wallet + recent transactions (via x-api-key)
// POST /api/wallet/receive { amount_sats } — top-up (stub: ledger credit; real: hold invoice)
// Both endpoints use x-api-key to identify the caller.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLightningClient } from "@/lib/lightning";
import { randomUUID } from "crypto";

const DEMO_BIDDER_PUBKEY = "02demo_bidder_pubkey";

interface WalletRow {
  pubkey: string;
  balance_sats: number;
  locked_sats: number;
  label: string | null;
  created_at: string;
}

interface TxRow {
  id: string;
  pubkey: string;
  amount_sats: number;
  type: string;
  reason: string | null;
  related_invoice_hash: string | null;
  related_bounty_id: string | null;
  related_bid_id: string | null;
  created_at: string;
}

/** Resolve a pubkey from x-api-key or fall back to demo pubkey */
function resolveCallerPubkey(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return DEMO_BIDDER_PUBKEY;

  if (process.env.USE_SUPABASE !== "true") {
    // Stub mode: any stub key maps to demo pubkey; else use key as pubkey seed
    return DEMO_BIDDER_PUBKEY;
  }

  try {
    const db = getDb();
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();
    if (!tableExists) return DEMO_BIDDER_PUBKEY;

    const user = db.prepare(
      "SELECT lightning_pubkey FROM users WHERE api_key = ?"
    ).get(apiKey) as { lightning_pubkey: string | null } | undefined;

    return user?.lightning_pubkey ?? DEMO_BIDDER_PUBKEY;
  } catch {
    return DEMO_BIDDER_PUBKEY;
  }
}

export async function GET(req: NextRequest) {
  const pubkey = resolveCallerPubkey(req);

  try {
    const db = getDb();

    // Ensure wallet exists for this pubkey
    const lightning = getLightningClient();
    await lightning.ensureWallet?.(pubkey, undefined);

    const wallet = db.prepare(
      "SELECT pubkey, balance_sats, locked_sats, label, created_at FROM wallets WHERE pubkey = ?"
    ).get(pubkey) as WalletRow | undefined;

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "Wallet not found" },
        { status: 404 }
      );
    }

    const transactions = db.prepare(
      `SELECT id, pubkey, amount_sats, type, reason, related_invoice_hash,
              related_bounty_id, related_bid_id, created_at
       FROM wallet_transactions
       WHERE pubkey = ?
       ORDER BY created_at DESC
       LIMIT 50`
    ).all(pubkey) as TxRow[];

    return NextResponse.json({
      success: true,
      wallet: {
        pubkey: wallet.pubkey,
        balance_sats: wallet.balance_sats,
        locked_sats: wallet.locked_sats,
        label: wallet.label,
        created_at: wallet.created_at,
      },
      transactions,
    });
  } catch (err) {
    console.error("[GET /api/wallet] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch wallet" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const pubkey = resolveCallerPubkey(req);

  let body: { amount_sats?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const amount = Number(body.amount_sats);
  if (!amount || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json(
      { success: false, error: "amount_sats must be a positive integer" },
      { status: 400 }
    );
  }
  if (amount > 10_000_000) {
    return NextResponse.json(
      { success: false, error: "amount_sats exceeds maximum (10,000,000)" },
      { status: 400 }
    );
  }

  try {
    const lightning = getLightningClient();

    // Ensure wallet row exists
    await lightning.ensureWallet?.(pubkey, undefined);

    const db = getDb();
    const txId = `tx_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const invoice = await lightning.createHoldInvoice(amount, `top-up ${pubkey.slice(0, 12)}`, pubkey);

    // In stub mode, immediately credit the wallet (simulates instant payment)
    if (process.env.USE_STUBS === "true" || process.env.USE_SUPABASE !== "true") {
      db.prepare(
        "UPDATE wallets SET balance_sats = balance_sats + ? WHERE pubkey = ?"
      ).run(amount, pubkey);

      db.prepare(
        `INSERT INTO wallet_transactions (id, pubkey, amount_sats, type, reason, related_invoice_hash, created_at)
         VALUES (?, ?, ?, 'SEED', 'top-up via lb wallet receive', ?, datetime('now'))`
      ).run(txId, pubkey, amount, invoice.paymentHash);

      const updated = db.prepare(
        "SELECT balance_sats, locked_sats FROM wallets WHERE pubkey = ?"
      ).get(pubkey) as { balance_sats: number; locked_sats: number };

      return NextResponse.json({
        success: true,
        invoice: invoice.paymentRequest,
        payment_hash: invoice.paymentHash,
        amount_sats: amount,
        note: "stub mode: balance credited immediately",
        balance_sats: updated?.balance_sats ?? 0,
      });
    }

    // Real mode: return invoice to pay
    return NextResponse.json({
      success: true,
      invoice: invoice.paymentRequest,
      payment_hash: invoice.paymentHash,
      amount_sats: amount,
      note: "Pay this invoice to top up your balance",
    });
  } catch (err) {
    console.error("[POST /api/wallet] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create top-up invoice" },
      { status: 500 }
    );
  }
}
