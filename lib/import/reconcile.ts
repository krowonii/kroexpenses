import type { NormalizedTxn } from "./types";

/** Maximum fee (outgoing − incoming) tolerated for a matched transfer, in pesos. */
const MAX_FEE = 100;
/** Days two legs of one transfer may drift apart across statements. */
const DATE_WINDOW_DAYS = 3;

/** Transfer-like wording that, WITHOUT a counterpart, means external transfer.
 *  Includes BDO's jargon (POB IBFT sends, W/D FR SAV savings/ATM withdrawals)
 *  and GCash's bank cash-in/out phrasings. */
const TRANSFER_WORDS =
  /(transfer|instapay|pesonet|send money|cash[-\s]?in|cash[-\s]?out|ibft|fr\s+sav|received\s+gcash\s+from|sent\s+gcash\s+to)/i;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export interface ReconcileResult {
  /** Pairs of legs reconciled as internal transfers. */
  transferCount: number;
  /** Fee expenses created by reconciliation. */
  feeCount: number;
  /** Transfer-like rows with no counterpart (stay counted by direction). */
  unmatchedCount: number;
}

/**
 * Match outgoing transactions against incoming ones from a different
 * account. A match requires the amounts to line up within the fee
 * tolerance AND the dates to sit inside the window — a transfer-like
 * description alone never reconciles.
 *
 * Matched legs become `transfer` (excluded from spending totals) and are
 * linked; the fee becomes its own linked expense. A transfer-like row
 * with no counterpart — in either direction — is marked
 * `external_transfer`/`unmatched` and stays counted (by the sign of its
 * amount) until the user says otherwise.
 */
export function reconcile(txns: NormalizedTxn[]): ReconcileResult {
  const incoming = txns.filter((t) => t.direction === "in");
  const used = new Set<number>();
  const fees: NormalizedTxn[] = [];
  let transferCount = 0;
  let unmatchedCount = 0;

  for (let i = 0; i < txns.length; i++) {
    const out = txns[i];
    if (out.direction !== "out" || out.txn_type === "transfer") continue;

    let match: number | null = null;
    for (let j = 0; j < incoming.length; j++) {
      const inc = incoming[j];
      if (used.has(j) || inc.txn_type === "transfer") continue;
      if (inc.account_name === out.account_name) continue;
      // out.amount is negative, so the fee is what the incoming leg is short.
      const fee = Math.abs(out.amount) - inc.amount;
      if (fee < 0 || fee > MAX_FEE) continue;
      if (daysBetween(out.txn_date, inc.txn_date) > DATE_WINDOW_DAYS) continue;
      match = j;
      break;
    }

    if (match === null) {
      if (TRANSFER_WORDS.test(out.description)) {
        out.txn_type = "external_transfer";
        out.status = "unmatched";
        unmatchedCount++;
      }
      continue;
    }

    const inc = incoming[match];
    used.add(match);
    out.txn_type = "transfer";
    out.status = "categorized";
    inc.txn_type = "transfer";
    inc.status = "categorized";
    out.related_index = match;
    inc.related_index = i;
    transferCount++;

    const fee = Math.abs(out.amount) - inc.amount;
    if (fee > 0) {
      fees.push({
        account_id: out.account_id,
        account_name: out.account_name,
        txn_date: out.txn_date,
        amount: -Math.round(fee * 100) / 100,
        direction: "out",
        merchant: "Transfer fee",
        description: `Transfer fee for ${out.merchant || out.description}`,
        txn_type: "expense",
        status: "categorized",
        confidence: 1,
        category_id: null,
        category_name: null,
        dedupe_key: `${out.dedupe_key}:fee`,
        related_index: i,
        source: out.source,
      });
    }
  }

  // Incoming legs the same way: a transfer-like cash-in with no counterpart
  // (e.g. "Received GCash from BDO…") shouldn't silently count as income
  // either — mark it for the user. Genuine receipts (salary, deposits)
  // don't match the wording and stay income.
  incoming.forEach((inc, j) => {
    if (used.has(j) || inc.txn_type === "transfer") return;
    if (TRANSFER_WORDS.test(inc.description)) {
      inc.txn_type = "external_transfer";
      inc.status = "unmatched";
      unmatchedCount++;
    }
  });

  txns.push(...fees);
  return { transferCount, feeCount: fees.length, unmatchedCount };
}
