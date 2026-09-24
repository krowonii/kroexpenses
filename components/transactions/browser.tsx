"use client";

import { useEffect, useState } from "react";
import { PageShell, Panel, chipClass } from "@/components/ui";
import { TransactionsTable, type TxnRow } from "@/components/dashboard/transactions-table";
import { DAY_SHORT } from "@/lib/dashboard";

interface Option {
  id: string;
  name: string;
}

interface TxnApiRow {
  id: string;
  txn_date: string;
  amount: number;
  status: string;
  merchant: string | null;
  description: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
}

const selectClass =
  "bg-surface border border-border rounded-sm px-2 py-1 text-[12.5px] cursor-pointer";

const TYPES = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
];

const PER_PAGE = [25, 50, 100];

/* Same row fallbacks as the dashboard's recent-transactions panel. */
const statusLabel: Record<string, string> = {
  pending_review: "Needs review",
  unmatched: "Unmatched",
};

/**
 * The full transaction ledger — newest first, with search, type/account/
 * category filters, and pagination (up to 100 per page). Live-refreshes
 * when a manual add lands from the floating button.
 */
export function Browser() {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [type, setType] = useState("all");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Filter options (accounts + the user's categories).
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/accounts").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/categories").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([acctsJson, catsJson]) => {
        if (!alive) return;
        setAccounts((acctsJson?.accounts ?? []) as Option[]);
        setCategories((catsJson?.categories ?? []) as Option[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Debounce the search box so typing doesn't fire a request per key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function load() {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    if (type !== "all") params.set("type", type);
    if (accountId) params.set("account", accountId);
    if (categoryId) params.set("category", categoryId);
    if (query) params.set("q", query);
    try {
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const json = res.ok ? await res.json() : null;
      setRows(
        ((json?.transactions ?? []) as TxnApiRow[]).map((row) => ({
          date: DAY_SHORT.format(new Date(`${row.txn_date}T00:00:00Z`)),
          merchant: row.merchant || row.description || "—",
          category: row.category?.name ?? statusLabel[row.status] ?? "Uncategorized",
          amount: row.amount,
          account: row.account?.name ?? "—",
        }))
      );
      setTotal(json?.total ?? 0);
      setFailed(!json);
      setLoaded(true);
      // A shrunken result set can leave a now-empty page — clamp back.
      const max = Math.max(1, Math.ceil((json?.total ?? 0) / perPage));
      if (page > max) setPage(max);
    } catch {
      setFailed(true);
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, type, accountId, categoryId, query]);

  // Live refresh when a manual add lands from the floating button.
  useEffect(() => {
    const onLoad = () => void load();
    window.addEventListener("expenses:changed", onLoad);
    return () => window.removeEventListener("expenses:changed", onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, type, accountId, categoryId, query]);

  function changeType(value: string) {
    setType(value);
    setPage(1);
  }
  function changeAccount(value: string) {
    setAccountId(value);
    setPage(1);
  }
  function changeCategory(value: string) {
    setCategoryId(value);
    setPage(1);
  }
  function changeSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function changePerPage(value: number) {
    setPerPage(value);
    setPage(1);
  }

  const maxPage = Math.max(1, Math.ceil(total / perPage));
  const filtered =
    type !== "all" || accountId !== "" || categoryId !== "" || query !== "";

  return (
    <PageShell title="Transactions">
      <div className="flex flex-col gap-3">
      <Panel>
        <div className="flex flex-col gap-2.5">
          <input
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Search merchant or description…"
            className="w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => changeType(t.value)}
                className={chipClass(type === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeAccount("")}
              className={chipClass(accountId === "")}
            >
              All accounts
            </button>
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => changeAccount(account.id)}
                className={chipClass(accountId === account.id)}
              >
                {account.name}
              </button>
            ))}
            <select
              value={categoryId}
              onChange={(event) => changeCategory(event.target.value)}
              className={selectClass}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      <TransactionsTable
        txns={rows}
        showHeader={false}
        emptyHint={
          !loaded
            ? "Loading…"
            : filtered
              ? "No transactions match these filters."
              : "No transactions yet — import a statement to get started."
        }
        footer={
          <div className="mt-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-mono text-[11.5px] text-text-faint">
                {failed
                  ? "Couldn't reach the database — check Supabase and sign-in."
                  : `${total} transaction${total === 1 ? "" : "s"} · Page ${page} of ${maxPage}`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-text-faint">Per page</span>
                {PER_PAGE.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => changePerPage(n)}
                    className={chipClass(perPage === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint disabled:opacity-50"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(maxPage, current + 1))}
                disabled={page >= maxPage}
                className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </div>
        }
      />
      </div>
    </PageShell>
  );
}
