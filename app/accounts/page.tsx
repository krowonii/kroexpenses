"use client";

import { useEffect, useState } from "react";
import { PageShell, Panel, PanelHead, chipClass } from "@/components/ui";
import { useAppData, storeAccounts } from "@/lib/app-data";
import { peso2 } from "@/lib/format";
import { DAY_YEAR, todayIso } from "@/lib/dashboard";
import type { Account } from "@/lib/types";
import type { AccountBalance } from "@/lib/balances";

const TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Cash",
  credit_card: "Credit card",
  other: "Other",
};

const inputClass =
  "w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net";

/**
 * "· Opening ₱1,000.00 as of Jan 5, 2026" — the dim second line under the
 * name. Empty when the account has no opening balance.
 */
function openingLine(account: Account): string {
  if (typeof account.opening_balance !== "number") return "";
  const date = account.opening_balance_date
    ? DAY_YEAR.format(new Date(`${account.opening_balance_date}T00:00:00Z`))
    : "";
  return `Opening ${peso2(account.opening_balance)}${date ? ` as of ${date}` : ""}`;
}

/**
 * The accounts screen: each account with its type, current balance (from
 * /api/balances — the single source of truth; nothing is recomputed here)
 * and its opening-balance fields, editable in place.
 */
export default function AccountsPage() {
  const { accounts, ready, failed } = useAppData();
  // Balances keyed by account id — from /api/balances, refreshed on the
  // same signal the other screens listen to.
  const [balances, setBalances] = useState<Record<string, number> | null>(null);
  const [dialog, setDialog] = useState<"add" | Account | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/balances")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!alive) return;
          const list = (json?.balances ?? []) as AccountBalance[];
          setBalances(Object.fromEntries(list.map((b) => [b.accountId, b.balance])));
        })
        .catch(() => {
          if (!alive) return;
          setBalances(null);
        });
    };
    load();
    window.addEventListener("expenses:changed", load);
    return () => {
      alive = false;
      window.removeEventListener("expenses:changed", load);
    };
  }, []);

  return (
    <PageShell title="Accounts">
      <Panel>
        <PanelHead
          title="Your accounts"
          hint={ready && !failed ? `${accounts.length} tracked` : undefined}
          action={
            <button
              type="button"
              onClick={() => setDialog("add")}
              className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90"
            >
              Add account
            </button>
          }
        />
        {failed ? (
          <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
            Couldn't load accounts — check you're signed in.
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
            No accounts yet — add one, or run supabase/seed-trigger.sql to
            seed the starters.
          </div>
        ) : (
          <div className="flex flex-col">
            {accounts.map((account, i) => {
              const typeLabel = TYPE_LABELS[account.type] ?? account.type;
              const opening = openingLine(account);
              const balance = balances?.[account.id];
              return (
                <div
                  key={account.id}
                  className={`flex items-center justify-between gap-3 py-2.5 ${
                    i > 0 ? "border-t border-border-soft" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] truncate" title={account.name}>
                      {account.name}
                    </div>
                    <div className="text-[11.5px] text-text-faint truncate mt-0.5">
                      {typeLabel}
                      {opening ? ` · ${opening}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`font-mono text-[13px] ${
                        balance !== undefined && balance < 0 ? "text-expense" : ""
                      }`}
                    >
                      {balance === undefined ? "—" : peso2(balance)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Edit ${account.name}`}
                      onClick={() => setDialog(account)}
                      className="text-[13px] text-text-faint hover:text-text px-1"
                    >
                      ✎
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {dialog && (
        <AccountDialog
          account={dialog === "add" ? null : dialog}
          accounts={accounts}
          onClose={() => setDialog(null)}
        />
      )}
    </PageShell>
  );
}

/**
 * Add/edit dialog — account null means add. The opening balance is
 * optional and signed (a card can start owing money); entering one
 * auto-fills today's date, which the user can change — only transactions
 * on or after it count toward the balance. Saving writes through
 * /api/accounts, then updates the shared store and announces the change
 * so the balances panels refetch.
 */
function AccountDialog({
  account,
  accounts,
  onClose,
}: {
  account: Account | null;
  accounts: Account[];
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState(account?.type ?? "bank");
  const [opening, setOpening] = useState(
    typeof account?.opening_balance === "number" ? account.opening_balance.toFixed(2) : ""
  );
  const [openingDate, setOpeningDate] = useState(account?.opening_balance_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onOpeningChange(value: string) {
    setOpening(value);
    // First entry of a balance auto-fills today — the usual case (you're
    // starting to track now). Never overrides a date already picked.
    if (value.trim() && !openingDate) setOpeningDate(todayIso());
  }

  async function save() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A name is required");
      return;
    }
    let balance: number | null = null;
    let date: string | null = null;
    if (opening.trim()) {
      const parsed = Number(opening.trim());
      if (!Number.isFinite(parsed)) {
        setError("Opening balance must be a valid amount");
        return;
      }
      if (!openingDate) {
        setError("An opening-balance date is required with a balance");
        return;
      }
      balance = Math.round(parsed * 100) / 100;
      date = openingDate;
    }

    setBusy(true);
    setError(null);
    try {
      const payload =
        balance !== null
          ? { name: trimmed, type, openingBalance: balance, openingBalanceDate: date }
          : account
            ? // Empty balance on an existing account clears it (the date
              // goes with it — the API clears both).
              { name: trimmed, type, openingBalance: null }
            : { name: trimmed, type };
      const res = await fetch(
        account ? `/api/accounts?id=${encodeURIComponent(account.id)}` : "/api/accounts",
        {
          method: account ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to save");
      const saved = body?.account as Account | null;
      if (saved) {
        // The store (and the browser cache) update for every screen —
        // merged against the latest snapshot this render saw, appending
        // when it's a new account and replacing when it's an edit.
        storeAccounts(
          accounts.some((a) => a.id === saved.id)
            ? accounts.map((a) => (a.id === saved.id ? saved : a))
            : [...accounts, saved]
        );
      }
      // The balances panels refetch on this signal.
      window.dispatchEvent(new Event("expenses:changed"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
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
        aria-label={account ? "Edit account" : "Add account"}
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-[18px] max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-auto max-sm:max-w-none max-sm:rounded-t-md max-sm:rounded-b-none max-sm:p-4"
      >
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[13.5px] font-semibold">
            {account ? "Edit account" : "Add account"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[18px] leading-none text-text-faint hover:text-text px-1"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <label htmlFor="acct-name" className="block text-[11.5px] text-text-dim mb-1">
              Name
            </label>
            <input
              id="acct-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. BDO Savings"
              maxLength={60}
              autoFocus
              className={inputClass}
            />
          </div>

          <div>
            <div className="text-[11.5px] text-text-dim mb-1.5">Type</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={chipClass(type === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div>
              <label htmlFor="acct-opening" className="block text-[11.5px] text-text-dim mb-1">
                Opening balance
              </label>
              <input
                id="acct-opening"
                type="text"
                inputMode="decimal"
                value={opening}
                onChange={(event) => onOpeningChange(event.target.value)}
                placeholder="0.00"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="acct-opening-date" className="block text-[11.5px] text-text-dim mb-1">
                Opening balance date
              </label>
              <input
                id="acct-opening-date"
                type="date"
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-[11.5px] text-text-faint -mt-1.5">
            Enter the balance you had when you started tracking this account.
            Negative works too (e.g. a card that starts owing money) — only
            transactions on or after the date count toward the balance.
          </p>

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-sm bg-net px-3 py-2.5 text-[13px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : account ? "Save changes" : "Add account"}
          </button>
          {error && <p className="text-[12px] text-expense">{error}</p>}
        </div>
      </div>
    </>
  );
}
