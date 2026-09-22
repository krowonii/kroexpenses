import type { NormalizedTxn, ParsedFile, SourceKind } from "./types";
import {
  dedupeKey,
  findColumn,
  findHeaderIndex,
  parseAmount,
  toIsoDate,
} from "./columns";

export interface NormalizeOptions {
  source: SourceKind;
  accountId: string | null;
  accountName: string;
}

/** Cut the statement text down to a merchant name: "JOLLIBEE #0451" → "JOLLIBEE". */
function merchantFrom(description: string): string {
  const s = description.replace(/\s+/g, " ").trim();
  const cut = s.search(/[#*,\d]/);
  const name = cut > 2 ? s.slice(0, cut) : s;
  return (name.trim() || s).slice(0, 60);
}

/**
 * BDO statement wording. Transfers carry a raw description that is pure
 * bank jargon ("POB IBFT BN-2026… IBTW") while the counter-party column
 * names the channel — the counter party is the readable one. POS purchases
 * read "POS W/D SV YARDSTICK MAKATI CITY MLIC": strip the prefix and the
 * trailing channel code and the merchant + location remain.
 */
const BDO_JARGON = /(ibft|instapay|pesonet)/i;

function bdoDescription(raw: string, counterParty: string): string {
  if (BDO_JARGON.test(raw) && counterParty.trim()) return counterParty.trim();
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^pos\s+w\/d(\s+sv)?\s+/i, ""); // POS debit prefix
  s = s.replace(/\s+(mlic|mc|ml|pos|ltref|mcref)$/i, ""); // trailing channel code
  return s.trim() || raw.trim();
}

/**
 * Map a parsed statement onto the app's standard transaction shape.
 * Income rows are inherently classified by direction (no review needed);
 * expenses start pending_review until rules or the LLM categorize them.
 * Rows without a readable date or amount are skipped — totals lines,
 * blanks, and notes never become transactions.
 */
export function normalizeFile(
  parsed: ParsedFile,
  opts: NormalizeOptions
): NormalizedTxn[] {
  const headerIndex = findHeaderIndex(parsed.rows);
  const headers = headerIndex >= 0 ? parsed.rows[headerIndex] : [];
  const dateCol = findColumn(headers, /(date|posted)/i);
  const descCol = findColumn(
    headers,
    /(description|remarks|details|particulars|merchant)/i
  );
  const amountCol = findColumn(headers, /^amount/i);
  const counterPartyCol = findColumn(headers, /counter party name/i);
  const typeCol = findColumn(headers, /(transaction type|^type$)/i);

  // BDO carries the direction in a "Credit/debit indicator" column with an
  // unsigned Amount. That header would otherwise match both the debit and
  // credit column searches — the indicator supersedes them.
  const indicatorCol = findColumn(headers, /credit\/debit|debit\/credit/i);
  const hasIndicator = indicatorCol >= 0;
  const debitCol = hasIndicator
    ? -1
    : findColumn(headers, /(debit|withdrawal|money out|send)/i);
  const creditCol = hasIndicator
    ? -1
    : findColumn(headers, /(credit|deposit|money in|receive)/i);

  const txns: NormalizedTxn[] = [];

  for (let i = headerIndex + 1; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    if (row.every((cell) => !cell.trim())) continue;

    const date = toIsoDate(dateCol >= 0 ? (row[dateCol] ?? "") : "");
    if (!date) continue;

    // Amount: the indicator column gives the direction with an unsigned
    // magnitude; otherwise prefer explicit debit/credit columns, then a
    // signed amount.
    let amount: number | null = null;
    let indicatorDirection: "in" | "out" | null = null;
    if (hasIndicator) {
      const indicator = (row[indicatorCol] ?? "").trim().toLowerCase();
      const magnitude =
        amountCol >= 0 ? parseAmount(row[amountCol] ?? "") : null;
      if (magnitude && magnitude !== 0) {
        if (indicator.startsWith("d")) {
          amount = -Math.abs(magnitude);
          indicatorDirection = "out";
        } else if (indicator.startsWith("c")) {
          amount = Math.abs(magnitude);
          indicatorDirection = "in";
        }
      }
    }
    if (amount === null && debitCol >= 0) {
      const debit = parseAmount(row[debitCol] ?? "");
      if (debit && debit !== 0) amount = -Math.abs(debit);
    }
    if (amount === null && creditCol >= 0) {
      const credit = parseAmount(row[creditCol] ?? "");
      if (credit && credit !== 0) amount = Math.abs(credit);
    }
    if (amount === null && amountCol >= 0) {
      amount = parseAmount(row[amountCol] ?? "");
    }
    if (amount === null || amount === 0) continue;

    const rawDescription =
      (descCol >= 0 ? row[descCol] : "") ||
      (typeCol >= 0 ? row[typeCol] : "") ||
      "Unknown";
    const description = hasIndicator
      ? bdoDescription(
          rawDescription,
          counterPartyCol >= 0 ? (row[counterPartyCol] ?? "") : ""
        )
      : rawDescription;

    const direction = indicatorDirection ?? (amount < 0 ? "out" : "in");

    txns.push({
      account_id: opts.accountId,
      account_name: opts.accountName,
      txn_date: date,
      amount,
      direction,
      merchant: merchantFrom(description),
      description: description.trim(),
      txn_type: direction === "out" ? "expense" : "income",
      // Expenses stay pending_review until categorized; income is
      // classified by direction itself.
      status: direction === "in" ? "categorized" : "pending_review",
      confidence: direction === "in" ? 1 : 0,
      category_id: null,
      category_name: null,
      dedupe_key: dedupeKey(opts.accountName, date, amount, description),
      related_index: null,
      source: opts.source,
    });
  }

  return txns;
}
