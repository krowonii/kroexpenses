"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Account } from "@/lib/types";
import { todayIso } from "@/lib/dashboard";
import { chipClass } from "@/components/ui";
import { evaluateAmount, NumberPad } from "./number-pad";
import { CategoryEditor, type CategoryRow } from "./category-editor";

/** Last-picked category, remembered per account — picking Food on GCash
 *  doesn't change the default for BDO. Per-device (localStorage). */
const inputClass =
  "bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net flex-1 min-w-0";

const DEFAULTS_KEY = "expense-default-category";

function readDefaults(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDefaults(defaults: Record<string, string>) {
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
  } catch {
    // Private mode / storage blocked — defaults just don't persist.
  }
}

/**
 * The floating plus button: manual expense entry from any screen. Opens a
 * sheet — a centered dialog on PC, a bottom sheet with a calculator-style
 * amount pad on mobile.
 */
export function FloatingAdd() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <>
      {open && <AddExpenseModal onClose={() => setOpen(false)} />}
      <button
        type="button"
        aria-label="Add expense"
        onClick={() => setOpen(true)}
        className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-net text-[26px] leading-none text-bg shadow-lg hover:opacity-90 transition-opacity bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))]"
      >
        +
      </button>
    </>
  );
}

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [expr, setExpr] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/categories").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/accounts").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([catsJson, acctsJson]) => {
        if (!alive) return;
        const categories = (catsJson?.categories ?? []) as CategoryRow[];
        const accounts = (acctsJson?.accounts ?? []) as Account[];
        setCategories(categories);
        setAccounts(accounts);
        // Account defaults to Cash — the account named Cash when it
        // exists, else the first one.
        const cash = accounts.find((a) => a.name.toLowerCase() === "cash");
        setAccountId(cash?.id ?? accounts[0]?.id ?? null);
        setFailed(!catsJson || !acctsJson);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Per-account default category: switching accounts swaps in that
  // account's own last-picked category, never another account's.
  useEffect(() => {
    if (!accountId) return;
    const saved = readDefaults()[accountId];
    setCategoryId(saved && categories.some((c) => c.id === saved) ? saved : null);
  }, [accountId, categories]);

  // Esc closes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pickCategory(id: string) {
    setCategoryId(id);
    if (!accountId) return;
    const defaults = readDefaults();
    if (defaults[accountId] === id) return;
    defaults[accountId] = id;
    writeDefaults(defaults);
  }

  /** Opening the editor also closes the inline add row. */
  function toggleEditing() {
    setEditing((current) => !current);
    setAdding(false);
    setNewName("");
    setAddError(null);
  }

  /** Inline add from the picker chips: creates the category, joins the
   *  chips and picks it for this expense. */
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
      const category = body.category as CategoryRow | undefined;
      if (category) {
        setCategories((current) =>
          current.some((c) => c.id === category.id) ? current : [...current, category]
        );
        pickCategory(category.id);
      }
      setNewName("");
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setAddBusy(false);
    }
  }

  const amount = evaluateAmount(expr);
  const showEvaluated = /[+\-×/]/.test(expr) && amount !== null;
  const evaluatedText = amount?.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  async function submit() {
    if (busy) return;
    if (amount === null || amount <= 0) {
      setError("Enter an amount — digits, or an expression like 85+32.50");
      return;
    }
    if (!accountId) {
      setError("Pick an account");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount, categoryId, accountId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to save");
      router.refresh();
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
        aria-label="Add expense"
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-md p-[18px] max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-auto max-sm:max-w-none max-sm:rounded-t-md max-sm:rounded-b-none max-sm:p-4 max-sm:flex max-sm:flex-col max-sm:max-h-[92dvh]"
      >
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[13.5px] font-semibold">Add expense</h2>
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
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div>
              <label htmlFor="add-date" className="block text-[11.5px] text-text-dim mb-1">
                Date
              </label>
              <input
                id="add-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text focus:outline-none focus:border-net"
              />
            </div>
            <div>
              <label htmlFor="add-amount" className="block text-[11.5px] text-text-dim mb-1">
                Amount
              </label>
              <input
                id="add-amount"
                type="text"
                inputMode="decimal"
                value={expr}
                onChange={(event) => setExpr(event.target.value)}
                placeholder="0.00"
                className="hidden sm:block w-full bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] font-mono text-text placeholder:text-text-faint focus:outline-none focus:border-net"
              />
              {/* Mobile: the pad below is the input; the display mirrors it. */}
              <div className="sm:hidden bg-surface-2 border border-border-soft rounded-sm px-3 py-2 font-mono text-[20px] text-right text-text">
                {expr || "0"}
              </div>
              {showEvaluated && (
                <div className="mt-1 font-mono text-[12px] text-text-faint">
                  = ₱{evaluatedText}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] text-text-dim">Category</span>
              <button
                type="button"
                onClick={toggleEditing}
                className="text-[12px] text-text-dim hover:text-text"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>
            {editing ? (
              <CategoryEditor
                categories={categories}
                onChanged={setCategories}
                onBack={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => pickCategory(category.id)}
                      className={chipClass(categoryId === category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                  {categories.length === 0 && (
                    <span className="text-[12.5px] text-text-faint py-1">
                      No categories yet — add one:
                    </span>
                  )}
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
                      className={inputClass}
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
                      onClick={() => {
                        setAdding(false);
                        setNewName("");
                      }}
                      aria-label="Cancel"
                      className="text-[15px] leading-none text-text-faint hover:text-text px-1"
                    >
                      ×
                    </button>
                  </div>
                )}
                {addError && <p className="mt-1 text-[12px] text-expense">{addError}</p>}
              </>
            )}
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
            {loaded && !failed && accounts.length === 0 && (
              <p className="text-[12px] text-text-faint mt-1.5">
                No accounts yet — run supabase/seed-trigger.sql to seed them.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-sm bg-net px-3 py-2.5 text-[13px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add expense"}
          </button>
          {error && <p className="text-[12px] text-expense">{error}</p>}
          {failed && !error && (
            <p className="text-[12px] text-expense">
              Couldn't reach the database — check Supabase is configured and
              you're signed in.
            </p>
          )}
        </div>

        {/* Mobile numpad: pinned at the bottom of the sheet. */}
        <div className="hidden max-sm:block mt-3.5 max-sm:shrink-0">
          <NumberPad expr={expr} onChange={setExpr} />
        </div>
      </div>
    </>
  );
}
