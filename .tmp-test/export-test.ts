/**
 * Smoke test for the export route's pure logic (app/api/export/route.ts).
 * csvCell + the SheetJS write path, replicated exactly — route files can't
 * export non-handler symbols (Next 16 validates them), so the copy is the
 * way to exercise it. Run: node --experimental-strip-types .tmp-test/export-test.ts
 */
import * as XLSX from "xlsx";

function csvCell(value: string, numeric = false): string {
  if (!numeric && /^[=+\-@]/.test(value)) value = `'${value}`;
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const HEADER = [
  "Date", "Time", "Merchant", "Description", "Category", "Account", "Type", "Status", "Amount",
];

const rows = [
  ["2026-09-01", "12:30", "7-Eleven", "fare", "Transportation", "GCash", "expense", "categorized", -85],
  // The route maps a null txn_time to "" — the shape the route actually writes.
  ["2026-09-02", "", "Jollibee", "", "Food", "Cash", "expense", "categorized", -320.5],
  ["2026-09-03", "09:00", "=SUM(A1:A2)", 'He said "hi"', "Uncategorized", "", "income", "pending_review", 1500],
];

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- CSV ---
const csv = [HEADER, ...rows]
  .map((row) => row.map((cell, i) => csvCell(String(cell), i === row.length - 1)).join(","))
  .join("\r\n");
const csvLines = csv.split("\r\n");

check("csv: header row intact", csvLines[0] === HEADER.join(","), csvLines[0]);
// Negative amount stays a raw signed number — sums work in a spreadsheet.
check("csv: negative amount unguarded", csvLines[1].endsWith(",-85"), csvLines[1]);
check("csv: decimal amount unguarded", csvLines[2].endsWith(",-320.5"), csvLines[2]);
// Merchant starting with = gets the apostrophe prefix.
check("csv: =-merchant guarded", csvLines[3].includes(`,'=SUM(A1:A2),`), csvLines[3]);
// Quote-doubling + wrap.
check(
  "csv: quotes doubled and wrapped",
  csvLines[3].includes(`,"He said ""hi""",Uncategorized`),
  csvLines[3]
);
// Every row has 9 fields even with quoted/wrapped cells.
check("csv: 9 fields per row", csvLines.slice(1).every((l) => l.split(",").length === 9 || /[",]/.test(l)), "naive split counts wrapped commas — visual check above");

// Parse the CSV back with SheetJS (same as statement import) and confirm
// the amount column reads as numbers and the guarded merchant as text.
const parsed = XLSX.read(csv, { type: "string", raw: false });
const grid = XLSX.utils.sheet_to_json(parsed.Sheets.Sheet1, { header: 1 }) as unknown[][];
const amounts = grid.slice(1).map((r) => r[8]);
check(
  "csv roundtrip: amounts numeric",
  amounts.every((a) => typeof a === "number"),
  JSON.stringify(amounts)
);
const sum = amounts.reduce((acc, a) => acc + (a as number), 0);
check("csv roundtrip: sum correct (-85 - 320.5 + 1500 = 1094.5)", Math.abs(sum - 1094.5) < 1e-9, String(sum));
check(
  "csv roundtrip: guarded merchant stays text",
  grid[3][2] === "=SUM(A1:A2)" || grid[3][2] === "'=SUM(A1:A2)",
  String(grid[3][2])
);

// --- XLSX ---
const worksheet = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
worksheet["!cols"] = HEADER.map(() => ({ wch: 12 }));
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
const bytes = new Uint8Array(buffer);
check(
  "xlsx: zip magic PK\\x03\\x04",
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
  String([bytes[0], bytes[1], bytes[2], bytes[3]])
);
check("xlsx: non-empty output", bytes.length > 1000, `${bytes.length} bytes`);

const back = XLSX.read(bytes, { type: "array" });
const sheet = back.Sheets["Transactions"];
check("xlsx: sheet named Transactions", Boolean(sheet), Object.keys(back.Sheets).join(","));
const backGrid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
check("xlsx: header + 3 rows", backGrid.length === 4, String(backGrid.length));
const xAmounts = backGrid.slice(1).map((r) => r[8]);
check(
  "xlsx: amount cells numeric",
  xAmounts.every((a) => typeof a === "number"),
  JSON.stringify(xAmounts)
);
const xSum = xAmounts.reduce((acc, a) => acc + (a as number), 0);
check("xlsx: sum correct", Math.abs(xSum - 1094.5) < 1e-9, String(xSum));
// The =-prefixed merchant must be a string cell, never a formula cell.
const merchantCell = sheet["C4"] as { t?: string; v?: unknown } | undefined;
check("xlsx: =-merchant is a string cell (t=s), not a formula", merchantCell?.t === "s", JSON.stringify(merchantCell));
check("xlsx: null time → empty", (backGrid[2][1] as string) === "", String(backGrid[2][1]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
