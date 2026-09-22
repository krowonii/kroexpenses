import type { Account } from "@/lib/types";
import type { DetectedFile, ParsedFile, SourceKind } from "./types";
import { findColumn, findHeaderIndex, toIsoDate } from "./columns";

/** Filename → source token match, checked in order. */
const SOURCE_RULES: { source: SourceKind; pattern: RegExp }[] = [
  { source: "gcash", pattern: /gcash|g[-\s]?cash/i },
  { source: "bdo", pattern: /bdo/i },
  { source: "credit_card", pattern: /credit|\bcc\b|\bcard\b/i },
];

/**
 * Detect the statement source from the file name. Content sniffing can
 * refine this later; the source is enough to preselect an account.
 */
export function detectSource(fileName: string): SourceKind {
  for (const rule of SOURCE_RULES) {
    if (rule.pattern.test(fileName)) return rule.source;
  }
  return "other";
}

/**
 * Resolve a detected source to one of the user's accounts, by name or
 * institution token (or account type, for credit_card). Returns null when
 * nothing matches — the UI then asks the user to pick.
 */
export function matchAccount(
  accounts: Account[],
  source: SourceKind
): string | null {
  const token = source.replace(/_/g, " "); // credit_card → "credit card"
  const hit = accounts.find(
    (account) =>
      account.name.toLowerCase().includes(token) ||
      (account.institution ?? "").toLowerCase().includes(token) ||
      account.type === source
  );
  return hit?.name ?? null;
}

/**
 * Inspect a parsed statement: source, row count, and date range. Runs on
 * the parsed grid so both CSV and XLSX behave identically.
 */
export function detectFile(parsed: ParsedFile): DetectedFile {
  let source = detectSource(parsed.fileName);
  const headerIndex = findHeaderIndex(parsed.rows);
  const headers = headerIndex >= 0 ? parsed.rows[headerIndex] : [];
  // Content sniff: BDO exports carry a credit/debit indicator column, so
  // an export whose name doesn't say BDO still resolves to it.
  if (source === "other" && findColumn(headers, /credit\/debit/i) >= 0) {
    source = "bdo";
  }
  const dateCol = findColumn(headers, /date|posted/i);

  let min: string | null = null;
  let max: string | null = null;
  let rowCount = 0;

  for (let i = headerIndex + 1; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    if (row.every((cell) => !cell.trim())) continue;
    rowCount++;
    const iso = dateCol >= 0 ? toIsoDate(row[dateCol] ?? "") : null;
    if (iso) {
      if (!min || iso < min) min = iso;
      if (!max || iso > max) max = iso;
    }
  }

  return {
    fileName: parsed.fileName,
    source,
    suggestedAccountName: null, // resolved against the user's accounts by the caller
    rowCount,
    dateRange: min && max ? { from: min, to: max } : null,
    parseError: rowCount === 0 ? "No transaction rows found in this file" : undefined,
  };
}
