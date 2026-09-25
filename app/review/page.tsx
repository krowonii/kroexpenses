"use client";

import { useEffect, useState } from "react";
import { PageShell, Panel, PanelHead, chipClass } from "@/components/ui";
import { signedPeso, timeLabel } from "@/lib/format";

interface ReviewItem {
  id: string;
  txn_date: string;
  txn_time: string | null;
  amount: number;
  txn_type: string;
  status: string;
  direction: string;
  confidence: number | null;
  merchant: string | null;
  description: string | null;
  category: { id: string; name: string } | null;
  account: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
  color?: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });

const inputClass =
  "bg-surface border border-border rounded-sm px-3 py-1.5 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:border-net flex-1 min-w-0";

function TxnTitle({ item }: { item: ReviewItem }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-1 truncate text-[12.5px] font-medium">
        {item.merchant || item.description || "Unknown"}
      </span>
      <span className="font-mono text-[12.5px] text-expense whitespace-nowrap">
        {signedPeso(item.amount)}
      </span>
    </div>
  );
}

function TxnMeta({ item }: { item: ReviewItem }) {
  const suggestion = item.category?.name
    ? ` · AI suggests ${item.category.name}${
        item.confidence != null ? ` (${Math.round(item.confidence * 100)}%)` : ""
      }`
    : "";
  return (
    <div className="mt-1 font-mono text-[11.5px] text-text-dim">
      {DATE_FMT.format(new Date(`${item.txn_date}T00:00:00`))}
      {timeLabel(item.txn_time) ? ` · ${timeLabel(item.txn_time)}` : ""} ·{" "}
      {item.account?.name ?? "—"}
      {suggestion}
    </div>
  );
}

/** Category picker as buttons — one tap to select, with an add affordance
 *  at the end so a new category can be created alongside the pick. */
function CategoryChips({
  item,
  categories,
  picks,
  onPick,
  onAdd,
}: {
  item: ReviewItem;
  categories: Category[];
  picks: Record<string, string>;
  onPick: (itemId: string, categoryId: string) => void;
  onAdd: (itemId: string) => void;
}) {
  const selected = picks[item.id] ?? item.category?.id ?? "";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onPick(item.id, category.id)}
          className={chipClass(selected === category.id)}
        >
          {category.name}
        </button>
      ))}
      {categories.length === 0 && (
        <span className="text-[12px] text-text-faint">No categories yet — add one:</span>
      )}
      <button
        type="button"
        onClick={() => onAdd(item.id)}
        className={`${chipClass(false)} border-dashed`}
      >
        + Add category
      </button>
    </div>
  );
}

/** Inline input behind the "+ Add category" chip. */
function AddCategoryRow({
  itemId,
  name,
  busy,
  onNameChange,
  onAdd,
  onCancel,
}: {
  itemId: string;
  name: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onAdd: (itemId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onAdd(itemId);
          if (event.key === "Escape") onCancel();
        }}
        autoFocus
        placeholder="New category"
        maxLength={40}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => onAdd(itemId)}
        disabled={busy || !name.trim()}
        className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="text-[15px] leading-none text-text-faint hover:text-text px-1"
      >
        ×
      </button>
    </div>
  );
}

/**
 * The review queue: one card per transaction that needs the user —
 * low-confidence AI suggestions to confirm or correct, and transfer-like
 * rows with no counterpart. Confirms are optimistic (the row leaves
 * immediately, the save runs behind the scenes) and never lock each
 * other, so several can fire within a short window.
 */
export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/review")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive) return;
        setItems((json?.items ?? []) as ReviewItem[]);
        setCategories((json?.categories ?? []) as Category[]);
        setFailed(!json);
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

  // Everything in the queue that isn't an unmatched transfer needs a
  // category — pending_review, or an expense that lost its category.
  const pending = items.filter((t) => t.status !== "unmatched");
  const unmatched = items.filter((t) => t.status === "unmatched");
  const pickFor = (item: ReviewItem) => picks[item.id] ?? item.category?.id ?? "";
  // What Confirm all can apply: items with a category available.
  const confirmable = pending.filter((t) => pickFor(t));

  function onPick(itemId: string, categoryId: string) {
    setPicks((current) => ({ ...current, [itemId]: categoryId }));
  }

  function confirm(item: ReviewItem, action: "categorize" | "transfer" | "exclude") {
    setError(null);
    const pick = pickFor(item);
    const index = items.findIndex((t) => t.id === item.id);
    setItems((current) => current.filter((t) => t.id !== item.id));
    void (async () => {
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            categoryId: action === "categorize" ? pick || null : null,
            action,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to save");
        }
      } catch (err) {
        // Restore the row where it was and surface the failure.
        setItems((current) => {
          if (current.some((t) => t.id === item.id)) return current;
          const next = [...current];
          next.splice(index < 0 ? next.length : index, 0, item);
          return next;
        });
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    })();
  }

  /** Confirm every pending item that has a category to apply — items
   *  without one stay in the queue for a real pick. */
  function confirmAll() {
    for (const item of confirmable) confirm(item, "categorize");
  }

  async function addCategory(forItemId: string) {
    const name = addName.trim();
    if (addBusy || !name) return;
    setAddBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to save");
      const category = body.category as Category | undefined;
      if (category) {
        setCategories((current) =>
          current.some((c) => c.id === category.id) ? current : [...current, category]
        );
        // The new category is picked for the transaction being reviewed.
        setPicks((current) => ({ ...current, [forItemId]: category.id }));
      }
      setAddName("");
      setAddingFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setAddBusy(false);
    }
  }

  const addRowProps = {
    name: addName,
    busy: addBusy,
    onNameChange: setAddName,
    onAdd: addCategory,
    onCancel: () => {
      setAddingFor(null);
      setAddName("");
    },
  };

  return (
    <PageShell title="Review">
      {failed && (
        <p className="text-[12px] text-expense mb-3.5">
          Couldn't reach the database — check Supabase is configured and
          you're signed in.
        </p>
      )}
      {error && <p className="text-[12px] text-expense mb-3.5">{error}</p>}

      {loaded && !failed && pending.length === 0 && unmatched.length === 0 ? (
        <Panel>
          <p className="text-[13.5px] text-text-dim">
            Nothing to review — confidently categorized transactions never ask.
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.length > 0 && (
            <Panel>
              <PanelHead
                title="Needs review"
                hint={`${pending.length} low-confidence`}
                action={
                  <button
                    type="button"
                    onClick={confirmAll}
                    disabled={confirmable.length === 0}
                    className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint disabled:opacity-60"
                  >
                    Confirm all{confirmable.length > 0 ? ` (${confirmable.length})` : ""}
                  </button>
                }
              />
              <div className="flex flex-col gap-2.5">
                {pending.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-2 border border-border-soft rounded-md px-3.5 py-3"
                  >
                    <TxnTitle item={item} />
                    <TxnMeta item={item} />
                    {item.description && item.merchant && item.description !== item.merchant && (
                      <div className="mt-1 text-[12px] text-text-faint truncate">
                        {item.description}
                      </div>
                    )}
                    <div className="mt-2.5">
                      <CategoryChips
                        item={item}
                        categories={categories}
                        picks={picks}
                        onPick={onPick}
                        onAdd={setAddingFor}
                      />
                      {addingFor === item.id && (
                        <AddCategoryRow itemId={item.id} {...addRowProps} />
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={!pickFor(item)}
                        onClick={() => confirm(item, "categorize")}
                        className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(item, "transfer")}
                        className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint"
                      >
                        Mark as transfer
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(item, "exclude")}
                        className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-faint hover:text-expense hover:border-text-faint"
                      >
                        Exclude
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {unmatched.length > 0 && (
            <Panel>
              <PanelHead
                title="Unmatched transfers"
                hint="count toward your totals until identified"
              />
              <p className="text-[12.5px] text-text-dim mb-3">
                These look like transfers with no matching counterpart on file.
                Import the other account's statement and reconciliation
                pairs them automatically — only mark one as a transfer if the
                other side won't be imported.
              </p>
              <div className="flex flex-col gap-2.5">
                {unmatched.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-2 border border-border-soft rounded-md px-3.5 py-3"
                  >
                    <TxnTitle item={item} />
                    <TxnMeta item={item} />
                    <div className="mt-2.5">
                      <CategoryChips
                        item={item}
                        categories={categories}
                        picks={picks}
                        onPick={onPick}
                        onAdd={setAddingFor}
                      />
                      {addingFor === item.id && (
                        <AddCategoryRow itemId={item.id} {...addRowProps} />
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => confirm(item, "categorize")}
                        className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90"
                      >
                        {item.direction === "in" ? "Keep as income" : "Keep as expense"}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(item, "transfer")}
                        className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint"
                      >
                        Mark as transfer
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(item, "exclude")}
                        className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-faint hover:text-expense hover:border-text-faint"
                      >
                        Exclude
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </PageShell>
  );
}
