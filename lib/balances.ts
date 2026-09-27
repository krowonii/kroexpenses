import type { Account } from "@/lib/types";

/**
 * THE account-balance calculation — the single source of truth every
 * balance display shares (dashboard panel, accounts screen, any future
 * one). Nothing else recomputes balances; they read what this returns.
 *
 * balance = opening_balance + Σ signed transaction amounts
 *
 * - Signed amounts carry the classification: expenses (negative) reduce,
 *   income (positive) increases, a reconciled internal transfer moves
 *   money (−X on the source account, +X on the destination account), and
 *   transfer fees / external transfers reduce. No special-casing by type.
 * - Rows with status 'excluded' leave every total — balances included,
 *   matching the dashboard's aggregate.
 * - Rows dated before the account's opening_balance_date are NOT applied:
 *   the opening balance is the state as of that date, so only activity
 *   from that date onward is tracked. No date → every row counts.
 * - No opening balance → it's 0.
 * - Sums round to 2 decimals (the app's money convention; Postgres holds
 *   numeric(14,2)).
 */

/** Minimal transaction shape the balance math reads. */
export interface BalanceTxn {
  account_id: string;
  amount: number;
  txn_date: string;
  status: string;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
}

export interface BalanceResult {
  balances: AccountBalance[];
  /** Total across the given accounts — internal transfers cancel out. */
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeBalances(
  accounts: Account[],
  txns: BalanceTxn[]
): BalanceResult {
  // Opening state per account: the starting value and the date it
  // applies from, plus the running sum of tracked activity.
  const state = new Map<string, { opening: number; since: string | null; sum: number }>();
  for (const account of accounts) {
    state.set(account.id, {
      opening: typeof account.opening_balance === "number" ? account.opening_balance : 0,
      since: account.opening_balance_date ?? null,
      sum: 0,
    });
  }

  for (const txn of txns) {
    if (txn.status === "excluded") continue;
    const entry = state.get(txn.account_id);
    if (!entry) continue; // rows on inactive/untracked accounts don't count
    // Only activity from the opening-balance date onward — earlier rows
    // aren't applied (the opening balance is the state as of that date).
    if (entry.since && txn.txn_date < entry.since) continue;
    entry.sum += txn.amount;
  }

  const balances = accounts.map((account) => {
    const entry = state.get(account.id);
    return {
      accountId: account.id,
      balance: round2((entry?.opening ?? 0) + (entry?.sum ?? 0)),
    };
  });
  const total = round2(balances.reduce((acc, b) => acc + b.balance, 0));

  return { balances, total };
}
