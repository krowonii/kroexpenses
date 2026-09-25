import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui";
import { signedPeso } from "@/lib/format";

export interface TxnRow {
  id?: string;
  date: string;
  /** "3:20 PM" when the statement stamped a time; ""/undefined otherwise. */
  time?: string | null;
  merchant: string;
  category: string;
  amount: number;
  account: string;
}

const th =
  "text-left font-medium text-[11px] text-text-faint pt-0 pb-2 pr-2.5 border-b border-border-soft whitespace-nowrap";
const tdBase = "pt-2.5 pb-2.5 pr-2.5 whitespace-nowrap";
/* The mockup drops the bottom border on the last row. */
const td = (isLast: boolean) =>
  isLast ? tdBase : `${tdBase} border-b border-border-soft`;

export function TransactionsTable({
  txns,
  showHeader = true,
  emptyHint = "No transactions yet — import a statement to get started.",
  footer,
  actions,
}: {
  txns: TxnRow[];
  /** False hides the "Recent transactions" + "View all →" head (the full
   *  ledger page renders its own filters instead). */
  showHeader?: boolean;
  emptyHint?: string;
  /** Rendered inside the panel below the table — pagination on the ledger. */
  footer?: ReactNode;
  /** Optional trailing column of per-row controls (edit/delete on the
   *  ledger). Omitted — the dashboard's recent list — hides the column. */
  actions?: (txn: TxnRow) => ReactNode;
}) {
  return (
    <Panel>
      {showHeader && (
        <div className="flex items-baseline justify-between mb-3.5">
          <h2 className="text-[13.5px] font-semibold">Recent transactions</h2>
          <Link
            href="/transactions"
            className="text-[12.5px] text-text-dim hover:text-text"
          >
            View all →
          </Link>
        </div>
      )}
      {txns.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-1 pb-0.5">
          {emptyHint}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Merchant</th>
                <th className={th}>Category</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Account</th>
                {actions && <th className={th} aria-label="Row actions" />}
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={t.id ?? i}>
                  <td className={`${td(i === txns.length - 1)} font-mono text-text-faint text-xs`}>
                    {t.time ? `${t.date} · ${t.time}` : t.date}
                  </td>
                  <td
                    className={`${td(i === txns.length - 1)} max-w-[220px] overflow-hidden text-ellipsis`}
                  >
                    {t.merchant}
                  </td>
                  <td className={td(i === txns.length - 1)}>
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-surface-2 text-text-dim">
                      {t.category}
                    </span>
                  </td>
                  <td className={`${td(i === txns.length - 1)} font-mono text-right`}>
                    <span
                      className={t.amount > 0 ? "text-income" : "text-text"}
                    >
                      {signedPeso(t.amount)}
                    </span>
                  </td>
                  <td className={`${td(i === txns.length - 1)} text-text-faint text-xs`}>{t.account}</td>
                  {actions && <td className={td(i === txns.length - 1)}>{actions(t)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </Panel>
  );
}
