import { createHash } from "node:crypto";

/**
 * Shared statement-column helpers used by detect + normalize. Bank exports
 * vary in column names and formats, so matching is pattern-based.
 */

/** A row counts as a header when any cell matches a known column name. */
const HEADER_HINT =
  /(date|posted|description|remarks|details|particulars|merchant|amount|debit|credit|withdrawal|deposit|balance|type|category|reference|ref)/i;

export function findHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 12);
  for (let i = 0; i < limit; i++) {
    if (rows[i].some((cell) => HEADER_HINT.test(cell))) return i;
  }
  return -1;
}

export function findColumn(headers: string[], pattern: RegExp): number {
  return headers.findIndex((cell) => pattern.test(cell.trim()));
}

/**
 * Parse a money string into a number: handles "₱1,234.56", "(500.00)",
 * "-1,000", "1 000", and comma-as-decimal ("12,50"). Returns null for
 * anything that isn't a number.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const neg = /\(.*\)/.test(s) || s.startsWith("-") || s.endsWith("-");
  let body = s.replace(/[()]/g, "").replace(/[^\d.,]/g, "");
  if (body.includes(",") && body.includes(".")) {
    body = body.replace(/,/g, "");
  } else if (body.includes(",")) {
    body = /,\d{2}$/.test(body) ? body.replace(",", ".") : body.replace(/,/g, "");
  }
  const n = Number(body);
  if (!Number.isFinite(n) || body === "") return null;
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNameDate(day: number, name: string, year: number): string | null {
  const month = MONTHS[name.slice(0, 3).toLowerCase()];
  return month ? isoDate(year, month, day) : null;
}

/**
 * Convert a statement date string to ISO YYYY-MM-DD. Handles ISO, both
 * slash orders (two-digit-first is read as mm/dd), and "1 Sep 2025" forms.
 * A trailing time ("2026-07-26 03:20 AM" — GCash stamps every date) is
 * stripped before matching, since the patterns anchor to end-of-string.
 */
export function toIsoDate(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?\s*$/i, "");
  if (!s) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isoDate(year, +m[1], +m[2]);
  }

  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(s);
  if (m) return monthNameDate(+m[1], m[2], +m[3]);

  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) return monthNameDate(+m[2], m[1], +m[3]);

  return null;
}

/**
 * Extract the time-of-day from a statement date string, normalized to
 * "HH:MM" 24h — lexicographic order is chronological. Handles the same
 * trailing shapes toIsoDate strips: "03:20 AM" (GCash stamps every date),
 * "14:05", "14:05:30", ISO "T14:05:00". Null when the date carries no time
 * (e.g. BDO's date-only rows) — those sort after timed rows within a day.
 */
export function toTimeOfDay(raw: string): string | null {
  const m = /[T\s](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?\s*(am|pm)?\s*$/i.exec(
    raw.trim()
  );
  if (!m) return null;
  let hours = +m[1];
  const half = m[3]?.toLowerCase();
  if (half === "pm" && hours < 12) hours += 12;
  if (half === "am" && hours === 12) hours = 0;
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${m[2]}`;
}

/** Deterministic duplicate key: account + date + amount + normalized description. */
export function dedupeKey(
  accountName: string,
  date: string,
  amount: number,
  description: string
): string {
  const norm = description.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256")
    .update(`${accountName.toLowerCase()}|${date}|${amount.toFixed(2)}|${norm}`)
    .digest("hex");
}
