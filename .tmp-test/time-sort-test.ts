import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStatement } from "../lib/import/parse.ts";
import { normalizeFile } from "../lib/import/normalize.ts";
import { toTimeOfDay } from "../lib/import/columns.ts";

const csv = readFileSync(
  fileURLToPath(new URL("../gcash-transactions.csv", import.meta.url)),
  "utf8"
);
const buffer = new TextEncoder().encode(csv).buffer as ArrayBuffer;

// Unit checks on toTimeOfDay first.
const cases: [string, string | null][] = [
  ["2026-07-26 03:20 AM", "03:20"],
  ["2026-07-26 12:05 PM", "12:05"],
  ["2026-07-26 12:05 AM", "00:05"],
  ["2026-07-26 3:20 pm", "15:20"],
  ["2026-07-26 14:05", "14:05"],
  ["2026-07-26 14:05:30", "14:05"],
  ["2026-07-26T14:05:00", "14:05"],
  ["Sep 21, 2026", null],
  ["2026-07-26", null],
];
let unitFail = 0;
for (const [input, want] of cases) {
  const got = toTimeOfDay(input);
  if (got !== want) {
    unitFail++;
    console.log(`FAIL toTimeOfDay(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
console.log(unitFail === 0 ? `toTimeOfDay: all ${cases.length} unit cases pass` : `${unitFail} unit failures`);

const parsed = await parseStatement("gcash-transactions.csv", buffer);
const txns = normalizeFile(parsed, {
  source: "gcash",
  accountId: "00000000-0000-0000-0000-000000000000",
  accountName: "GCash",
});

console.log(`total normalized: ${txns.length}`);
const timed = txns.filter((t) => t.txn_time !== null);
console.log(`rows carrying a time: ${timed.length}`);

// Sample rows: date + time in statement order.
console.log("\nfirst 6 rows (statement order):");
for (const t of txns.slice(0, 6)) {
  console.log(`  ${t.txn_date} ${t.txn_time ?? "--:--"}  ${t.merchant}  ${t.amount}`);
}

// Same-day ordering check: sort the way SQL does (date desc, time desc nulls
// last) and confirm times descend within each day.
const sqlOrder = [...txns].sort((a, b) => {
  if (a.txn_date !== b.txn_date) return a.txn_date < b.txn_date ? 1 : -1;
  if ((a.txn_time ?? null) !== (b.txn_time ?? null)) {
    if (a.txn_time === null) return 1;
    if (b.txn_time === null) return -1;
    return a.txn_time < b.txn_time ? 1 : -1;
  }
  return 0;
});
let orderFail = 0;
const byDate = new Map<string, string[]>();
for (const t of sqlOrder) {
  const list = byDate.get(t.txn_date) ?? [];
  list.push(t.txn_time ?? "null");
  byDate.set(t.txn_date, list);
}
for (const [date, times] of byDate) {
  const timedOnly = times.filter((x) => x !== "null");
  for (let i = 1; i < timedOnly.length; i++) {
    if (timedOnly[i] > timedOnly[i - 1]) {
      orderFail++;
      console.log(`FAIL ${date}: time order not descending: ${timedOnly.join(", ")}`);
      break;
    }
  }
}
console.log(
  orderFail === 0
    ? `same-day ordering: ${byDate.size} days check out (times descend, nulls last)`
    : `${orderFail} days jumbled`
);

// Show one busy day under the SQL order.
const busiest = [...byDate.entries()].sort((a, b) => b[1].length - a[1].length)[0];
console.log(`\nbusiest day ${busiest[0]} (${busiest[1].length} rows), SQL order:`);
for (const t of sqlOrder.filter((x) => x.txn_date === busiest[0])) {
  console.log(`  ${t.txn_time ?? "--:--"}  ${t.merchant}  ${t.amount}`);
}
