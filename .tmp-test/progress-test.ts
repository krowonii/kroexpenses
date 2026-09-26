import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runImport } from "../lib/import/pipeline.ts";
import { IMPORT_STAGES } from "../lib/import/types.ts";
import { parseStatement } from "../lib/import/parse.ts";

const csv = readFileSync(
  fileURLToPath(new URL("../gcash-transactions.csv", import.meta.url)),
  "utf8"
);

// dbReady false — the pipeline runs and reports but never persists, and the
// LLM key isn't in this env so categorization is rules-only (no quota burn).
const events: { stage: number; detail?: string }[] = [];
const summary = await runImport(
  {
    files: [
      {
        fileName: "gcash-transactions.csv",
        data: new TextEncoder().encode(csv).buffer as ArrayBuffer,
        accountId: "test-account-id",
        accountName: "GCash",
      },
    ],
    accounts: [{ id: "test-account-id", name: "GCash" }],
    categories: ["Food", "Shopping", "Bills", "Transportation", "Entertainment", "Other"].map(
      (name, i) => ({ id: `cat-${i}`, name })
    ),
    rules: [],
    existingKeys: new Set<string>(),
    dbReady: false,
  },
  (event) => events.push(event)
);

console.log("progress events (in order):");
for (const e of events) {
  const label = IMPORT_STAGES[e.stage] ?? `stage ${e.stage}`;
  console.log(`  [${e.stage}] ${label}${e.detail ? ` — ${e.detail}` : ""}`);
}

// Ordering check: stages must be non-decreasing.
let orderOk = true;
for (let i = 1; i < events.length; i++) {
  if (events[i].stage < events[i - 1].stage) {
    orderOk = false;
    console.log(`FAIL: stage went backwards at event ${i}`);
  }
}
console.log(orderOk ? "stage ordering: OK" : "stage ordering: FAIL");

console.log("\nsummary:", JSON.stringify(
  {
    newCount: summary.newCount,
    duplicateCount: summary.duplicateCount,
    transferCount: summary.transferCount,
    feeCount: summary.feeCount,
    unmatchedCount: summary.unmatchedCount,
    categorization: summary.categorization,
    saved: summary.saved,
  },
  null,
  2
));

// Also verify parseStatement still parses fine after the changes.
const parsed = await parseStatement(
  "gcash-transactions.csv",
  new TextEncoder().encode(csv).buffer as ArrayBuffer
);
console.log(`\nparse check: ${parsed.rows.length} rows parsed`);
