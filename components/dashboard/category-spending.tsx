import { Panel, PanelHead } from "@/components/ui";
import { peso } from "@/lib/format";

export interface CategorySpend {
  name: string;
  amount: number;
  pct: number;
  /** Optional CSS color (e.g. from the categories table); falls back to the default palette. */
  color?: string | null;
}

/* Tailwind utility classes for the default category palette. */
const defaultColors: Record<string, string> = {
  Food: "bg-cat-food",
  Shopping: "bg-cat-shopping",
  Bills: "bg-cat-bills",
  Transportation: "bg-cat-transport",
  Entertainment: "bg-cat-entertainment",
  Other: "bg-cat-other",
};

export function CategorySpending({
  categories,
  total,
}: {
  categories: CategorySpend[];
  total: number;
}) {
  return (
    <Panel>
      <PanelHead title="Spending by category" hint={`of ${peso(total)}`} />
      {categories.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          No spending in this period yet.
        </div>
      ) : (
        <div>
          {categories.map((c) => (
            <div
              key={c.name}
              className="grid grid-cols-[100px_1fr_78px] items-center gap-2.5 py-[7px] max-[520px]:grid-cols-[78px_1fr_66px]"
            >
              <div className="text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                {c.name}
              </div>
              <div className="h-2 bg-surface-2 rounded-[3px] overflow-hidden">
                <div
                  className={`h-full rounded-[3px] ${
                    c.color ? "" : (defaultColors[c.name] ?? "bg-cat-other")
                  }`}
                  style={{ background: c.color ?? undefined, width: `${c.pct}%` }}
                />
              </div>
              <div className="font-mono text-[12.5px] text-text-dim text-right whitespace-nowrap">
                {peso(c.amount)} · {c.pct.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
