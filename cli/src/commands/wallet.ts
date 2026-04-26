/**
 * [cli/wallet] `lb wallet <subcommand>`
 *
 * Subcommands:
 *   lb wallet balance        — current available + locked sats
 *   lb wallet history        — last N transactions
 *   lb wallet receive <n>    — generate top-up invoice (stub: instant credit)
 *   lb wallet send <pubkey> <amount>  — peer transfer (within marketplace ledger)
 */
import { getApiBase, withAuth } from "../auth.js";

interface WalletInfo {
  pubkey: string;
  balance_sats: number;
  locked_sats: number;
  label: string | null;
  created_at: string;
}

interface TxInfo {
  id: string;
  pubkey: string;
  amount_sats: number;
  type: string;
  reason: string | null;
  related_bounty_id: string | null;
  related_bid_id: string | null;
  created_at: string;
}

interface WalletResponse {
  success: boolean;
  wallet: WalletInfo;
  transactions: TxInfo[];
  error?: string;
}

interface ReceiveResponse {
  success: boolean;
  invoice?: string;
  payment_hash?: string;
  amount_sats?: number;
  note?: string;
  balance_sats?: number;
  error?: string;
}

async function fetchWallet(apiBase: string): Promise<WalletResponse> {
  const res = await fetch(`${apiBase}/wallet`, { headers: withAuth() });
  const data = (await res.json()) as WalletResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function runWalletBalance(opts: { api?: string }): Promise<void> {
  const apiBase = opts.api ?? getApiBase();

  let data: WalletResponse;
  try {
    data = await fetchWallet(apiBase);
  } catch (err) {
    console.error(
      `[wallet balance] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const { wallet } = data;
  const total = wallet.balance_sats + wallet.locked_sats;

  console.log(`\nlb wallet balance`);
  console.log(`  Available    : ${wallet.balance_sats.toLocaleString()} sats`);
  console.log(`  Locked       : ${wallet.locked_sats.toLocaleString()} sats`);
  console.log(`  Total        : ${total.toLocaleString()} sats`);
  if (wallet.label) {
    console.log(`  Label        : ${wallet.label}`);
  }
  console.log(`  Pubkey       : ${wallet.pubkey}`);
  console.log(``);
}

export async function runWalletHistory(opts: { limit?: string; api?: string }): Promise<void> {
  const apiBase = opts.api ?? getApiBase();
  const limit = opts.limit ? Math.min(parseInt(opts.limit, 10), 100) : 20;

  let data: WalletResponse;
  try {
    data = await fetchWallet(apiBase);
  } catch (err) {
    console.error(
      `[wallet history] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const txns = data.transactions.slice(0, limit);

  if (txns.length === 0) {
    console.log("No transactions.");
    return;
  }

  console.log(`\n${"TYPE".padEnd(8)}  ${"AMOUNT".padEnd(12)}  ${"DATE".padEnd(19)}  REASON`);
  console.log(`${"-".repeat(8)}  ${"-".repeat(12)}  ${"-".repeat(19)}  ------`);

  for (const tx of txns) {
    const sign = tx.amount_sats >= 0 ? "+" : "";
    const amount = `${sign}${tx.amount_sats.toLocaleString()} sats`.padEnd(12);
    const type = tx.type.padEnd(8);
    const date = new Date(tx.created_at).toLocaleString().padEnd(19);
    const reason = tx.reason ?? "";
    console.log(`${type}  ${amount}  ${date}  ${reason}`);
  }

  console.log(``);
}

export async function runWalletReceive(amountSats: string, opts: { api?: string }): Promise<void> {
  const amount = parseInt(amountSats, 10);
  if (isNaN(amount) || amount <= 0) {
    console.error("[wallet receive] amount must be a positive integer (satoshis)");
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();

  let data: ReceiveResponse;
  try {
    const res = await fetch(`${apiBase}/wallet`, {
      method: "POST",
      headers: withAuth(),
      body: JSON.stringify({ amount_sats: amount }),
    });
    data = (await res.json()) as ReceiveResponse;
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(
      `[wallet receive] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  console.log(`\nlb wallet receive`);
  console.log(`  Amount     : ${amount.toLocaleString()} sats`);
  if (data.note) {
    console.log(`  Note       : ${data.note}`);
  }
  if (data.invoice) {
    console.log(`\n  Invoice:`);
    console.log(`  ${data.invoice}`);
  }
  if (data.balance_sats != null) {
    console.log(`\n  New balance: ${data.balance_sats.toLocaleString()} sats`);
  }
  console.log(``);
}

export async function runWalletSend(
  recipientPubkey: string,
  amountSats: string,
  opts: { api?: string }
): Promise<void> {
  if (!recipientPubkey?.trim()) {
    console.error("[wallet send] recipient pubkey is required");
    process.exit(1);
  }
  const amount = parseInt(amountSats, 10);
  if (isNaN(amount) || amount <= 0) {
    console.error("[wallet send] amount must be a positive integer (satoshis)");
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();

  // P2P transfer via the /api/wallet/send endpoint (future — not yet built by Team B)
  // For now, stub it out gracefully.
  try {
    const res = await fetch(`${apiBase}/wallet/send`, {
      method: "POST",
      headers: withAuth(),
      body: JSON.stringify({
        recipient_pubkey: recipientPubkey,
        amount_sats: amount,
      }),
    });

    if (res.status === 404) {
      console.log(`[wallet send] P2P transfer endpoint not yet available.`);
      console.log(`  Recipient  : ${recipientPubkey}`);
      console.log(`  Amount     : ${amount} sats`);
      console.log(`  Status     : pending Team B implementation`);
      return;
    }

    const data = (await res.json()) as { success?: boolean; error?: string; tx_id?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    console.log(`\nlb wallet send`);
    console.log(`  To         : ${recipientPubkey}`);
    console.log(`  Amount     : ${amount.toLocaleString()} sats`);
    if (data.tx_id) {
      console.log(`  Tx ID      : ${data.tx_id}`);
    }
    console.log(`  Status     : sent`);
    console.log(``);
  } catch (err) {
    console.error(
      `[wallet send] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
}
