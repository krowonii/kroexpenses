import { computeBalances } from "../lib/balances.ts";
import type { Account } from "../lib/types.ts";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

const accounts: Account[] = [
  { id: "bank", name: "BDO", type: "bank", opening_balance: 1000, opening_balance_date: "2026-01-01" },
  { id: "cash", name: "Cash", type: "cash" },
  { id: "card", name: "Card", type: "credit_card", opening_balance: -500, opening_balance_date: "2026-01-01" },
];

const txns = [
  // expense reduces bank
  { account_id: "bank", amount: -85, txn_date: "2026-02-01", status: "matched" },
  // income increases bank
  { account_id: "bank", amount: 20000, txn_date: "2026-02-05", status: "matched" },
  // excluded row — leaves every total
  { account_id: "bank", amount: -999, txn_date: "2026-02-06", status: "excluded" },
  // pre-opening-date row on bank — NOT applied (before 2026-01-01)
  { account_id: "bank", amount: -777, txn_date: "2025-12-31", status: "matched" },
  // cash has no opening — every row counts
  { account_id: "cash", amount: -50, txn_date: "2026-02-01", status: "unmatched" },
  // reconciled internal transfer: -300 out of bank, +300 into cash
  { account_id: "bank", amount: -300, txn_date: "2026-02-10", status: "reconciled", txn_type: "transfer" },
  { account_id: "cash", amount: 300, txn_date: "2026-02-10", status: "reconciled", txn_type: "transfer" },
  // transfer fee on bank — reduces
  { account_id: "bank", amount: -15, txn_date: "2026-02-10", status: "matched", txn_type: "transfer_fee" },
  // card: starts owing -500, a payment reduces the debt
  { account_id: "card", amount: 500, txn_date: "2026-02-15", status: "matched" },
  // row on an unknown account — ignored
  { account_id: "ghost", amount: 1000000, txn_date: "2026-02-01", status: "matched" },
];

const result = computeBalances(accounts, txns as never);

// bank: 1000 - 85 + 20000 - 300 - 15 = 20600 (excluded + pre-opening skipped)
check("bank balance", result.balances.find((b) => b.accountId === "bank")?.balance, 20600);
// cash: 0 - 50 + 300 = 250
check("cash balance", result.balances.find((b) => b.accountId === "cash")?.balance, 250);
// card: -500 + 500 = 0 (signed opening, payment reduces debt)
check("card balance", result.balances.find((b) => b.accountId === "card")?.balance, 0);
// total: transfers cancel (−300 bank, +300 cash) → 20600 + 250 + 0
check("total", result.total, 20850);

// No opening balance anywhere → plain sums
const noOpening = computeBalances(
  [{ id: "a", name: "A", type: "bank" }],
  [
    { account_id: "a", amount: -10.005, txn_date: "2026-01-01", status: "matched" },
    { account_id: "a", amount: 20, txn_date: "2026-01-02", status: "matched" },
  ] as never
);
check("no opening + rounding", noOpening.balances[0]?.balance, 9.99);
check("no opening total", noOpening.total, 9.99);

// Opening without a date → every row counts
const noDate = computeBalances(
  [{ id: "a", name: "A", type: "bank", opening_balance: 100 }],
  [{ account_id: "a", amount: -40, txn_date: "2020-01-01", status: "matched" }] as never
);
check("opening no date", noOpening === noDate ? "bug" : noDate.balances[0]?.balance, 60);

// Empty everything
const empty = computeBalances([], []);
check("empty", empty, { balances: [], total: 0 });

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
