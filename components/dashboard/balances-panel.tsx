"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel, PanelHead } from "@/components/ui";
import { useAppData } from "@/lib/app-data";
import { peso2 } from "@/lib/format";
import { DAY_YEAR, todayIso } from "@/lib/dashboard";
import type { AccountBalance } from "@/lib/balances";

/**
 * Dashboard "Balances" panel — the total across tracked accounts plus the
 * per-account breakdown. The math never happens here: /api/balances owns
 * it (lib/balances is the single source of truth) and this panel reads
 * what it returns. Account names come from the shared store. An edit or a
 * new transaction refreshes it through the same expenses:changed signal
 * the other panels listen to.
 */
export function BalancesPanel() {
  const accounts = useAppData().accounts;
  const [rows, setRows] = useState<AccountBalance[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/balances")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!alive) return;
          setRows((json?.balances ?? []) as AccountBalance[]);
          setTotal(typeof json?.total === "number" ? json.total : null);
          setFailed(false);
        })
        .catch(() => {
          if (!alive) return;
          setFailed(true);
        });
    };
    load();
    const onChanged = () => load();
    window.addEventListener("expenses:changed", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("expenses:changed", onChanged);
    };
  }, []);

  const nameOf = (accountId: string) =>
    accounts.find((a) => a.id === accountId)?.name ?? "Unknown account";

  return (
    <Panel>
      <PanelHead
        title="Balances"
        hint={`as of ${DAY_YEAR.format(new Date(`${todayIso()}T00:00:00Z`))}`}
        action={
          <Link
            href="/accounts"
            aria-label="Edit balances on the accounts screen"
            title="Edit balances"
            className="text-[13px] text-text-faint hover:text-text"
          >
            ✎
          </Link>
        }
      />
      {failed ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          Couldn't load balances — check you're signed in.
        </div>
      ) : rows === null ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">Loading…</div>
      ) : (
        <>
          <div className="flex justify-between items-baseline mb-3 pb-3 border-b border-border-soft">
            <span className="text-[13px]">Total</span>
            <span className="font-mono text-[20px] font-medium tracking-[-0.01em]">
              {total === null ? "—" : peso2(total)}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="text-[12.5px] text-text-faint pt-1 pb-0.5">
              No active accounts — add one on the accounts screen.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const name = nameOf(row.accountId);
                return (
                  <div key={row.accountId} className="flex justify-between items-baseline gap-3">
                    <span className="text-[13px] text-text-dim truncate" title={name}>
                      {name}
                    </span>
                    <span
                      className={`font-mono text-[12.5px] shrink-0 ${
                        row.balance < 0 ? "text-expense" : ""
                      }`}
                    >
                      {peso2(row.balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
