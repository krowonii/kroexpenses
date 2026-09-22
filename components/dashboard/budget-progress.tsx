import { Panel, PanelHead } from "@/components/ui";
import { peso } from "@/lib/format";

export interface BudgetRow {
  name: string;
  spent: number;
  limit: number;
}

export function BudgetProgress({ budgets }: { budgets: BudgetRow[] }) {
  return (
    <Panel>
      <PanelHead title="Budget progress" />
      {budgets.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          No budgets set for this period.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {budgets.map((b) => {
            const pct = (b.spent / b.limit) * 100;
            const state = pct > 100 ? "over" : pct > 85 ? "warn" : "ok";
            const fill =
              state === "over"
                ? "bg-expense"
                : state === "warn"
                  ? "bg-warn"
                  : "bg-income";
            const statusText =
              pct > 100
                ? `${peso(b.spent - b.limit)} over budget`
                : `${(100 - pct).toFixed(0)}% left`;

            return (
              <div key={b.name}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-[13px]">{b.name}</span>
                  <span className="font-mono text-[11.5px] text-text-dim">
                    {peso(b.spent)} / {peso(b.limit)}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-[3px] overflow-hidden">
                  <div
                    className={`h-full ${fill}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div
                  className={`text-[10.5px] mt-1 font-mono ${
                    state === "over" ? "text-expense" : "text-text-faint"
                  }`}
                >
                  {statusText}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
