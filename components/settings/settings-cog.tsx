"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { chipClass } from "@/components/ui";

interface Option {
  id: string;
  name: string;
}

/** Gear icon — inline so it takes the button's current color. */
function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * The settings cog for the dashboard header: a gear that opens a modal
 * with the usual settings — sign out — plus a danger zone that clears
 * the transaction data of one account or of everything. Renders nothing
 * until there is a session, like the sign-out control it replaces.
 */
export function SettingsCog() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [target, setTarget] = useState<string>("all"); // "all" or an account id
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        setSignedIn(Boolean(data.user));
        setEmail(data.user?.email ?? "");
      })
      .catch(() => {}); // unreachable session — stay hidden
  }, []);

  // When the modal opens: load the accounts, and whenever the target
  // changes, the row count that would be deleted.
  useEffect(() => {
    if (!open || !signedIn) return;
    setError(null);
    setConfirming(false);
    const params = new URLSearchParams({ per_page: "1" });
    if (target !== "all") params.set("account", target);
    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCount(typeof json?.total === "number" ? json.total : null))
      .catch(() => setCount(null));
  }, [open, signedIn, target]);

  useEffect(() => {
    if (!open || !signedIn) return;
    fetch("/api/accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setAccounts((json?.accounts ?? []) as Option[]))
      .catch(() => {});
  }, [open, signedIn]);

  async function signOut() {
    await createClient().auth.signOut();
    // Full navigation so the proxy sees the cleared session.
    window.location.assign("/login");
  }

  async function clearData() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const params =
        target !== "all" ? `?account=${encodeURIComponent(target)}` : "";
      const res = await fetch(`/api/transactions${params}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to clear");
      // The dashboard (and any open ledger) refreshes itself live.
      window.dispatchEvent(new Event("expenses:changed"));
      setConfirming(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setOpen(true)}
        className="flex items-center px-1.5 py-1 text-text-faint hover:text-text cursor-pointer"
      >
        <GearIcon />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-bg/75" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-[18px] max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-auto max-sm:max-w-none max-sm:rounded-t-md max-sm:rounded-b-none max-sm:p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13.5px] font-semibold">Settings</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
                className="text-[15px] leading-none text-text-faint hover:text-text px-1"
              >
                ×
              </button>
            </div>

            <div className="text-[12.5px] text-text-dim mb-4 break-all">
              {email || "Signed in"}
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-sm border border-border px-3 py-2 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint"
            >
              Sign out
            </button>

            <div className="border-t border-border-soft my-4" />

            <div className="text-[11.5px] text-text-faint mb-1.5">Danger zone</div>
            <div className="text-[13px] font-medium mb-2.5">Clear transaction data</div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setTarget("all")}
                className={chipClass(target === "all")}
              >
                All accounts
              </button>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setTarget(account.id)}
                  className={chipClass(target === account.id)}
                >
                  {account.name}
                </button>
              ))}
            </div>
            <div className="font-mono text-[11.5px] text-text-faint mb-3">
              {count === null
                ? "Counting…"
                : `${count} transaction${count === 1 ? "" : "s"} will be deleted`}
            </div>
            {confirming ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={clearData}
                  disabled={busy}
                  className="rounded-sm bg-expense px-3 py-2 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="text-[12.5px] text-text-faint hover:text-text"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={count === 0 || busy}
                className="rounded-sm border border-expense/50 px-3 py-2 text-[12.5px] text-expense hover:bg-expense/10 disabled:opacity-50"
              >
                Clear data
              </button>
            )}
            {error && <p className="mt-3 text-[12px] text-expense">{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
