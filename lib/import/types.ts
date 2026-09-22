import type { TxnStatus, TxnType } from "@/lib/types";

/** Which statement source a file came from. */
export type SourceKind = "bdo" | "gcash" | "credit_card" | "other";

/** A statement parsed into a grid of cell strings — unified across CSV and XLSX. */
export interface ParsedFile {
  fileName: string;
  kind: "csv" | "xlsx";
  /** XLSX sheet names; CSV files report a single sheet. */
  sheets: string[];
  /** Cell grid, trimmed; includes the header row when one is present. */
  rows: string[][];
}

/** Per-file result of the detect step, shown on the import screen. */
export interface DetectedFile {
  fileName: string;
  source: SourceKind;
  /** Account preselected in the UI; null → the user picks one. */
  suggestedAccountName: string | null;
  rowCount: number;
  dateRange: { from: string; to: string } | null;
  parseError?: string;
}

/** A statement row mapped onto the app's standard transaction shape. */
export interface NormalizedTxn {
  account_name: string;
  /** DB account id when known; null until the database is connected. */
  account_id: string | null;
  /** ISO date (YYYY-MM-DD) */
  txn_date: string;
  /** Signed: negative = outflow, positive = inflow */
  amount: number;
  /** Matches the sign of `amount` */
  direction: "in" | "out";
  merchant: string;
  /** Original statement text, preserved verbatim. */
  description: string;
  txn_type: TxnType;
  status: TxnStatus;
  confidence: number;
  category_id: string | null;
  category_name: string | null;
  /** Deterministic hash used for duplicate detection. */
  dedupe_key: string;
  /**
   * Index of the linked counterpart within the same import batch —
   * resolved to a real transaction id when the batch is saved.
   */
  related_index: number | null;
  source: SourceKind;
}

/** Something that went wrong, naming the file and pipeline stage. */
export interface ImportIssue {
  fileName: string;
  stage: string;
  message: string;
}

export interface CategorizationOutcome {
  /** Categorized without the user (rules + high-confidence AI). */
  auto: number;
  /** Below the confidence gate — sent to the review workflow. */
  needReview: number;
}

/** Counts reported to the import screen. Skipped/rejected items are never
 *  counted as imported — `newCount` is new rows only. */
export interface ImportSummary {
  newCount: number;
  duplicateCount: number;
  /** Pairs of legs reconciled as internal transfers. */
  transferCount: number;
  /** Fee expenses created by reconciliation. */
  feeCount: number;
  /** Transfer-like rows with no counterpart (counted as expenses). */
  unmatchedCount: number;
  errorCount: number;
  issues: ImportIssue[];
  categorization: CategorizationOutcome;
  /** Whether the batch was persisted to the database. */
  saved: boolean;
  saveNote?: string;
}
