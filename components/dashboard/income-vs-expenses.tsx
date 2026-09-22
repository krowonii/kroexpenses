import { Panel, PanelHead } from "@/components/ui";

export interface WeekPoint {
  label: string;
  income: number;
  expense: number;
}

export function IncomeVsExpenses({ weeks }: { weeks: WeekPoint[] }) {
  const maxWeek = Math.max(...weeks.flatMap((w) => [w.income, w.expense]), 1);

  return (
    <Panel>
      <PanelHead title="Income vs expenses" hint="by week" />
      {weeks.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          No activity in this period yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {weeks.map((w) => (
            <div key={w.label}>
              <div className="text-xs text-text-dim mb-[5px] font-mono">
                {w.label}
              </div>
              <div className="flex flex-col gap-[3px]">
                <div className="h-[7px] bg-surface-2 rounded-[3px] overflow-hidden">
                  <div
                    className="h-full rounded-[3px] bg-income"
                    style={{ width: `${(w.income / maxWeek) * 100}%` }}
                  />
                </div>
                <div className="h-[7px] bg-surface-2 rounded-[3px] overflow-hidden">
                  <div
                    className="h-full rounded-[3px] bg-expense"
                    style={{ width: `${(w.expense / maxWeek) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 mt-1 text-[11.5px] text-text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px] inline-block bg-income" />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px] inline-block bg-expense" />
          Expenses
        </span>
      </div>
    </Panel>
  );
}
