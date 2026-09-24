import { Panel, PanelHead } from "@/components/ui";
import { peso } from "@/lib/format";
import { DAY_SHORT, type DailyPoint } from "@/lib/dashboard";

export function SpendingOverTime({
  daily,
  axisLabels,
}: {
  daily: DailyPoint[];
  axisLabels: string[];
}) {
  const maxDay = Math.max(...daily.map((d) => d.amount), 1);

  return (
    <Panel>
      <PanelHead title="Spending over time" hint="daily" />
      {daily.length === 0 ? (
        <div className="text-[12.5px] text-text-faint pt-2 pb-0.5">
          No spending in this period yet.
        </div>
      ) : (
        <>
          <div className="flex items-end gap-[3px] h-[120px] pt-1.5">
            {daily.map((d, i) => (
              /* The wrapper is the hover target (full column height, like a
                 chart cursor) and anchors the tooltip. Edge bars align the
                 tooltip to the chart edge so it doesn't spill outside. */
              <div key={i} className="relative group flex-1 h-full flex items-end">
                <div
                  className="w-full bg-expense opacity-75 group-hover:opacity-100 transition-opacity duration-100 rounded-t-xs"
                  style={{ height: `${Math.max((d.amount / maxDay) * 100, 3)}%` }}
                />
                <div
                  className={`pointer-events-none absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center bg-bg border border-border rounded-sm px-2 py-1 z-10 whitespace-nowrap ${
                    i === 0
                      ? "left-0"
                      : i === daily.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  <span className="font-mono text-[11.5px] text-expense">
                    {peso(d.amount)}
                  </span>
                  <span className="font-mono text-[10px] text-text-faint">
                    {DAY_SHORT.format(new Date(`${d.date}T00:00:00Z`))}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 font-mono text-[10.5px] text-text-faint">
            {axisLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
