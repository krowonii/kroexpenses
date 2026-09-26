"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell, Panel, chipClass } from "@/components/ui";
import { TransactionsTable, type TxnRow } from "@/components/dashboard/transactions-table";
import { useAppData, storeCategories } from "@/lib/app-data";
import { DAY_SHORT } from "@/lib/dashboard";
import { timeLabel } from "@/lib/format";

interface Option {
  id: string;
  name: string;
}

interface TxnApiRow {
  id: string;
  txn_date: string;
  txn_time: string | null;
  amount: number;
  status: string;
  merchant: string | null;
  description: string | null;
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
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
  excluded: "Excluded",
};

/** Raw API row → the table's display shape. */
function mapRow(row: TxnApiRow): TxnRow {
  return {
    id: row.id,
    date: DAY_SHORT.format(new Date(`${row.txn_date}T00:00:00Z`)),
    time: timeLabel(row.txn_time),
    merchant: row.merchant || row.description || "—",
    category: row.category?.name ?? statusLabel[row.status] ?? "Uncategorized",
    amount: row.amount,
    account: row.account?.name ?? "—",
  };
}

/**
 * The full transaction ledger — newest first, with search, type/account/
 * category filters, and pagination (up to 100 per page). Live-refreshes
 * when a manual add lands from the floating button.
 */
export function Browser() {
  // Filter options come from the shared store — preloaded at app boot,
  // so the filters render immediately instead of fetching.
  const { categories, accounts } = useAppData();
  // Raw rows — the edit dialog reads the unformatted fields (ISO date,
  // signed amount, category/account ids) straight off these.
  const [raws, setRaws] = useState<TxnApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [type, setType] = useState("all");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The row being edited — its dialog state lives alongside.
  const [editing, setEditing] = useState<TxnApiRow | null>(null);

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
      setRaws((json?.transactions ?? []) as TxnApiRow[]);
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

  const rows = useMemo(() => raws.map(mapRow), [raws]);

  /** Apply an edit optimistically: the row updates in place, the PATCH
   *  runs behind the scenes, and a failure restores the old fields. */
  function saveEdit(
    target: TxnApiRow,
    fields: { date: string; amount: number; categoryId: string | null; accountId: string }
  ) {
    setError(null);
    const previous = target;
    setRaws((current) =>
      current.map((r) =>
        r.id === target.id
          ? {
              ...r,
              txn_date: fields.date,
              // The UI edits the magnitude; the stored sign follows the row.
              amount: (r.amount < 0 ? -1 : 1) * fields.amount,
              category: fields.categoryId
                ? {
                    id: fields.categoryId,
                    name: categories.find((c) => c.id === fields.categoryId)?.name ?? "…",
                  }
                : null,
              account: {
                id: fields.accountId,
                name: accounts.find((a) => a.id === fields.accountId)?.name ?? "…",
              },
            }
          : r
      )
    );
    setEditing(null);
    void (async () => {
      try {
        const res = await fetch(`/api/transactions?id=${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to save");
        }
        window.dispatchEvent(new Event("expenses:changed"));
      } catch (err) {
        setRaws((current) => current.map((r) => (r.id === previous.id ? previous : r)));
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    })();
  }

  /** Delete optimistically: the row leaves the table immediately and is
   *  restored at its old position when the delete fails. */
  function deleteRow(target: TxnApiRow) {
    const name = target.merchant || target.description || "this transaction";
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setError(null);
    const previous = target;
    const index = raws.findIndex((r) => r.id === target.id);
    setRaws((current) => current.filter((r) => r.id !== target.id));
    void (async () => {
      try {
        const res = await fetch(`/api/transactions?id=${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to delete");
        }
        window.dispatchEvent(new Event("expenses:changed"));
      } catch (err) {
        setRaws((current) => {
          if (current.some((r) => r.id === previous.id)) return current;
          const next = [...current];
          next.splice(index < 0 ? next.length : index, 0, previous);
          return next;
        });
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    })();
  }

  /** Un-exclude: an excluded row returns to the totals. */
  function restoreRow(target: TxnApiRow) {
    setError(null);
    const previous = target;
    const restoredStatus = target.category ? "categorized" : "pending_review";
    setRaws((current) =>
      current.map((r) => (r.id === target.id ? { ...r, status: restoredStatus } : r))
    );
    setEditing(null);
    void (async () => {
      try {
        const res = await fetch(`/api/transactions?id=${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restore: true }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to save");
        }
        window.dispatchEvent(new Event("expenses:changed"));
      } catch (err) {
        setRaws((current) => current.map((r) => (r.id === previous.id ? previous : r)));
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    })();
  }

  const maxPage = Math.max(1, Math.ceil(total / perPage));
  const filtered =
    type !== "all" || accountId !== "" || categoryId !== "" || query !== "";

  return (
    <PageShell title="Transactions">
      {error && <p className="text-[12px] text-expense mb-3.5">{error}</p>}
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
        actions={(display) => {
          const raw = raws.find((r) => r.id === display.id);
          if (!raw) return null;
          return (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setEditing(raw)}
                aria-label={`Edit ${display.merchant}`}
                className="text-text-faint hover:text-text px-1 py-1"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                  <path
                    d="M9.9 1.2a1.6 1.6 0 0 1 2.3 2.3L4.8 10.9l-3.1.8.8-3.1L9.9 1.2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => deleteRow(raw)}
                aria-label={`Delete ${display.merchant}`}
                className="text-[15px] leading-none text-text-faint hover:text-expense px-1 py-1"
              >
                ×
              </button>
            </div>
          );
        }}
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
      {editing && (
        <EditDialog
          row={editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          onRestore={restoreRow}
          onCategoryCreated={(category) =>
            storeCategories(
              categories.some((c) => c.id === category.id) ? categories : [...categories, category]
            )
          }
        />
      )}
      </div>
    </PageShell>
  );
}

const dialogClass =
  "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-[18px] max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-auto max-sm:max-w-none max-sm:rounded-t-md max-sm:rounded-b-none max-sm:p-4 max-sm:flex max-sm:flex-col max-sm:max-h-[92dvh]";
const editInputClass =
  "w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net";

/**
 * Edit an existing transaction — the same sheet shape as the add flow
 * (centered dialog on PC, bottom sheet on mobile) with the row's fields
 * prefilled. Saves via PATCH; an excluded row offers Restore to bring it
 * back into the totals.
 */
function EditDialog({
  row,
  categories,
  accounts,
  onClose,
  onSave,
  onRestore,
  onCategoryCreated,
}: {
  row: TxnApiRow;
  categories: Option[];
  accounts: Option[];
  onClose: () => void;
  onSave: (target: TxnApiRow, fields: {
    date: string;
    amount: number;
    categoryId: string | null;
    accountId: string;
  }) => void;
  onRestore: (row: TxnApiRow) => void;
  onCategoryCreated: (category: Option) => void;
}) {
  const [date, setDate] = useState(row.txn_date);
  const [amount, setAmount] = useState(Math.abs(row.amount).toFixed(2));
  const [categoryId, setCategoryId] = useState(row.category?.id ?? "");
  const [accountId, setAccountId] = useState(row.account?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Esc closes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function addCategory() {
    const name = newName.trim();
    if (addBusy || !name) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to save");
      const category = body.category as Option | undefined;
      if (category) {
        onCategoryCreated(category);
        setCategoryId(category.id);
      }
      setNewName("");
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setAddBusy(false);
    }
  }

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    if (!accountId) {
      setError("Pick an account");
      return;
    }
    setError(null);
    onSave(row, { date, amount: value, categoryId: categoryId || null, accountId });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-bg/75" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Edit transaction" className={dialogClass}>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[13.5px] font-semibold">Edit transaction</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[18px] leading-none text-text-faint hover:text-text px-1"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3.5 max-sm:overflow-y-auto max-sm:flex-1">
          <div className="font-mono text-[11.5px] text-text-faint truncate">
            {row.merchant || row.description || "—"}
          </div>
          {row.status === "excluded" && (
            <div className="flex items-center justify-between gap-2 bg-surface-2 border border-border-soft rounded-sm px-3 py-2">
              <span className="text-[12.5px] text-text-dim">Excluded from all totals</span>
              <button
                type="button"
                onClick={() => onRestore(row)}
                className="text-[12.5px] font-medium text-net hover:opacity-90 whitespace-nowrap"
              >
                Restore
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div>
              <label htmlFor="edit-date" className="block text-[11.5px] text-text-dim mb-1">
                Date
              </label>
              <input
                id="edit-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text focus:outline-none focus:border-net"
              />
            </div>
            <div>
              <label htmlFor="edit-amount" className="block text-[11.5px] text-text-dim mb-1">
                Amount
              </label>
              <input
                id="edit-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] font-mono text-text focus:outline-none focus:border-net"
              />
            </div>
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Category</div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  className={chipClass(categoryId === category.id)}
                >
                  {category.name}
                </button>
              ))}
              {!adding && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={`${chipClass(false)} border-dashed`}
                >
                  + Add category
                </button>
              )}
            </div>
            {adding && (
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addCategory();
                    if (event.key === "Escape") {
                      setAdding(false);
                      setNewName("");
                    }
                  }}
                  autoFocus
                  placeholder="New category"
                  maxLength={40}
                  className={editInputClass}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={addBusy || !newName.trim()}
                  className="rounded-sm bg-net px-3 py-2 text-[13px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
                >
                  Add
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                  className="text-[15px] leading-none text-text-faint hover:text-text px-1"
                >
                  ×
                </button>
              </div>
            )}
            {addError && <p className="mt-1 text-[12px] text-expense">{addError}</p>}
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Account</div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setAccountId(account.id)}
                  className={chipClass(accountId === account.id)}
                >
                  {account.name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            className="rounded-sm bg-net px-3 py-2.5 text-[13px] font-semibold text-bg hover:opacity-90"
          >
            Save changes
          </button>
          {error && <p className="text-[12px] text-expense">{error}</p>}
        </div>
      </div>
    </>
  );
}
