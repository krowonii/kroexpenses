"use client";

import { useEffect, useState } from "react";
import { PageShell, Panel, PanelHead } from "@/components/ui";
import { signedPeso } from "@/lib/format";

interface ReviewItem {
  id: string;
  txn_date: string;
  amount: number;
  txn_type: string;
  status: string;
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

const selectClass =
  "bg-surface border border-border rounded-sm px-2 py-1 text-[12.5px] cursor-pointer";

function TxnMeta({ item }: { item: ReviewItem }) {
  const suggestion = item.category?.name
    ? ` · AI suggests ${item.category.name}${
        item.confidence != null ? ` (${Math.round(item.confidence * 100)}%)` : ""
      }`
    : "";
  return (
    <div className="mt-1 font-mono text-[11.5px] text-text-dim">
      {DATE_FMT.format(new Date(`${item.txn_date}T00:00:00`))} ·{" "}
      {item.account?.name ?? "—"}
      {suggestion}
    </div>
  );
}

/**
 * The review queue: one card per transaction that needs the user —
 * low-confidence AI suggestions to confirm or correct, and transfer-like
 * rows with no counterpart. Confidently categorized transactions never
 * land here.
 */
export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const pending = items.filter((t) => t.status === "pending_review");
  const unmatched = items.filter((t) => t.status === "unmatched");

  async function act(item: ReviewItem, action: "categorize" | "transfer") {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    const pick = picks[item.id] ?? item.category?.id ?? "";
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
      setItems((current) => current.filter((t) => t.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusyId(null);
    }
  }

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
              <PanelHead title="Needs review" hint={`${pending.length} low-confidence`} />
              <div className="flex flex-col gap-2.5">
                {pending.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-2 border border-border-soft rounded-md px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex-1 truncate text-[12.5px] font-medium">
                        {item.merchant || item.description || "Unknown"}
                      </span>
                      <span className="font-mono text-[12.5px] text-expense whitespace-nowrap">
                        {signedPeso(item.amount)}
                      </span>
                    </div>
                    <TxnMeta item={item} />
                    {item.description && item.merchant && item.description !== item.merchant && (
                      <div className="mt-1 text-[12px] text-text-faint truncate">
                        {item.description}
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <label htmlFor={`cat-${item.id}`} className="text-[11.5px] text-text-dim">
                        Category
                      </label>
                      <select
                        id={`cat-${item.id}`}
                        value={picks[item.id] ?? item.category?.id ?? ""}
                        onChange={(event) =>
                          setPicks((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        className={selectClass}
                      >
                        <option value="">Uncategorized…</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => act(item, "categorize")}
                        className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
                      >
                        {busyId === item.id ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {unmatched.length > 0 && (
            <Panel>
              <PanelHead title="Unmatched transfers" hint="count as expenses until identified" />
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
                    <div className="flex items-center gap-2.5">
                      <span className="flex-1 truncate text-[12.5px] font-medium">
                        {item.merchant || item.description || "Unknown"}
                      </span>
                      <span className="font-mono text-[12.5px] text-expense whitespace-nowrap">
                        {signedPeso(item.amount)}
                      </span>
                    </div>
                    <TxnMeta item={item} />
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <label htmlFor={`ucat-${item.id}`} className="text-[11.5px] text-text-dim">
                        Category
                      </label>
                      <select
                        id={`ucat-${item.id}`}
                        value={picks[item.id] ?? ""}
                        onChange={(event) =>
                          setPicks((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        className={selectClass}
                      >
                        <option value="">Uncategorized…</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => act(item, "categorize")}
                        className="rounded-sm bg-net px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
                      >
                        {busyId === item.id ? "Saving…" : "Keep as expense"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => act(item, "transfer")}
                        className="rounded-sm border border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text hover:border-text-faint disabled:opacity-60"
                      >
                        Mark as transfer
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
