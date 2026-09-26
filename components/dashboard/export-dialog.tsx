"use client";

import { useEffect, useState } from "react";
import { buildRange, todayIso, type PeriodKey } from "@/lib/dashboard";
import { useAppData } from "@/lib/app-data";
import { chipClass } from "@/components/ui";

const dateInputClass =
  "w-full bg-surface-2 border border-border-soft rounded-sm px-2.5 py-1.5 text-[12.5px] text-text focus:outline-none focus:border-net";

const TYPES = [
  { key: "all", label: "All" },
  { key: "expense", label: "Expenses" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfers" },
] as const;

const FORMATS = [
  { key: "csv", label: "CSV" },
  { key: "xlsx", label: "Excel (.xlsx)" },
] as const;

/**
 * The dashboard's Export button + dialog: pick a date range (pre-filled
 * from the active period), type, account, categories (none picked = all),
 * and format, see the matching transaction count, and download the file.
 * The count preview runs the ledger's query — the /api/export route
 * applies the same filters, so the number matches the file.
 */
export function ExportDialog({
  period,
  customRange,
}: {
  period: PeriodKey;
  customRange: { from: string; to: string } | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-sm border border-border bg-surface-2 px-3 py-1.5 text-[13px] whitespace-nowrap hover:border-text-faint"
      >
        Export
      </button>
      {open && (
        <ExportModal
          period={period}
          customRange={customRange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ExportModal({
  period,
  customRange,
  onClose,
}: {
  period: PeriodKey;
  customRange: { from: string; to: string } | null;
  onClose: () => void;
}) {
  const { categories, accounts } = useAppData();
  // Pre-fill from the active period: the picked custom range when one is
  // set, else that period's own range (this month, last month, trailing
  // 90 days).
  const [from, setFrom] = useState(() => customRange?.from ?? buildRange(period).from);
  const [to, setTo] = useState(() => customRange?.to ?? buildRange(period).to);
  const [type, setType] = useState<string>("all");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [format, setFormat] = useState<string>("csv");
  const [count, setCount] = useState<number | null>(null);
  const [countFailed, setCountFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to;

  // Esc closes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Count preview — the ledger's query (per_page=1 → total) with the same
  // filters the export will send. Re-runs on every filter change; the
  // cancelled flag drops stale responses.
  useEffect(() => {
    if (!open || !valid) return;
    let cancelled = false;
    setCountFailed(false);
    const params = new URLSearchParams();
    params.set("per_page", "1");
    params.set("from", from);
    params.set("to", to);
    if (type !== "all") params.set("type", type);
    if (accountId) params.set("account", accountId);
    if (categoryIds.length > 0) params.set("category", categoryIds.join(","));
    fetch(`/api/transactions?${params}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setCount(typeof body?.total === "number" ? body.total : null);
      })
      .catch(() => {
        if (!cancelled) setCountFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, valid, from, to, type, accountId, categoryIds]);

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  async function exportData() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      if (type !== "all") params.set("type", type);
      if (accountId) params.set("account", accountId);
      if (categoryIds.length > 0) params.set("category", categoryIds.join(","));
      params.set("format", format);
      const res = await fetch(`/api/export?${params}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Export failed");
      // Blob download — errors surface here, unlike a direct navigation.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${from}_to_${to}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-bg/75" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export transactions"
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-[18px] max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-auto max-sm:max-w-none max-sm:rounded-t-md max-sm:rounded-b-none max-sm:p-4 max-sm:flex max-sm:flex-col max-sm:max-h-[92dvh]"
      >
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[13.5px] font-semibold">Export transactions</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="export-from" className="block text-[11.5px] text-text-dim mb-1">
                From
              </label>
              <input
                id="export-from"
                type="date"
                value={from}
                max={todayIso()}
                onChange={(event) => setFrom(event.target.value)}
                className={dateInputClass}
              />
            </div>
            <div>
              <label htmlFor="export-to" className="block text-[11.5px] text-text-dim mb-1">
                To
              </label>
              <input
                id="export-to"
                type="date"
                value={to}
                max={todayIso()}
                onChange={(event) => setTo(event.target.value)}
                className={dateInputClass}
              />
            </div>
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Type</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={chipClass(type === t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Account</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAccountId("")}
                className={chipClass(accountId === "")}
              >
                All
              </button>
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

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11.5px] text-text-dim">Categories</span>
              {categoryIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategoryIds([])}
                  className="text-[11.5px] text-text-faint hover:text-text"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className={chipClass(categoryIds.includes(category.id))}
                >
                  {category.name}
                </button>
              ))}
            </div>
            {categoryIds.length === 0 && (
              <p className="text-[11.5px] text-text-faint mt-1.5">
                None selected — every category is exported.
              </p>
            )}
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Format</div>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  className={chipClass(format === f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="font-mono text-[11.5px] text-text-faint">
            {countFailed
              ? "Couldn't count transactions."
              : count === null
                ? "Counting…"
                : `${count.toLocaleString("en-PH")} transaction${count === 1 ? "" : "s"} will be exported`}
          </div>

          <button
            type="button"
            onClick={exportData}
            disabled={busy || !valid}
            className="rounded-sm bg-net px-3 py-2.5 text-[13px] font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
          </button>
          {error && <p className="text-[12px] text-expense">{error}</p>}
        </div>
      </div>
    </>
  );
}
