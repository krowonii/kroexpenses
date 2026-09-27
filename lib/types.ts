/**
 * Domain types — modeled on the transaction model in docs/expenses-masterdoc.pdf.
 * These are the shapes the whole app (imports, reconciliation, dashboard) works with.
 */

/** What a transaction fundamentally is. Transfer fees are expenses;
 *  reimbursements are money received for something someone else paid for
 *  — they offset the expense total (see app/api/summary/route.ts). */
export type TxnType =
  | "expense"
  | "income"
  | "transfer"
  | "external_transfer"
  | "reimbursement";

/**
 * Lifecycle status. `unmatched` = transfer with no counterpart found
 * (counted as an expense until identified otherwise); `pending_review`
 * = low AI confidence, needs the user; `excluded` = user-marked to leave
 * all totals until restored.
 */
export type TxnStatus = "categorized" | "pending_review" | "unmatched" | "excluded";

export interface Account {
  id: string;
  name: string;
  /** bank | ewallet | cash | credit_card | other */
  type: string;
  institution?: string | null;
  is_active: boolean;
  /**
   * Account-level starting value — what the account held when tracking
   * began. Never a transaction; signed (a credit card can start owing
   * money). Null = not set (counts as 0).
   */
  opening_balance?: number | null;
  /**
   * The date the opening balance applies from — only transactions on or
   * after it count toward the balance. Null = every transaction counts.
   */
  opening_balance_date?: string | null;
}

export interface Category {
  id: string;
  name: string;
  /** Optional CSS color; defaults to a fallback palette entry. */
  color?: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  /** ISO date (YYYY-MM-DD) */
  txn_date: string;
  /** Signed: negative = outflow, positive = inflow */
  amount: number;
  /** Matches the sign of `amount` */
  direction: "in" | "out";
  merchant?: string | null;
  description?: string | null;
  txn_type: TxnType;
  category_id?: string | null;
  category?: Category | null;
  /** 'manual' | 'import:<statement-id>' */
  source: string;
  status: TxnStatus;
  /** 0–1, from AI categorization; null when not AI-categorized */
  confidence?: number | null;
  /** Counterpart transaction for reconciled transfers */
  related_transaction_id?: string | null;
}
