import { Panel, PanelHead } from "@/components/ui";

export function SpendingOverTime({
  daily,
  axisLabels,
}: {
  daily: number[];
  axisLabels: string[];
}) {
  const maxDay = Math.max(...daily, 1);

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
            {daily.map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-expense opacity-75 hover:opacity-100 transition-opacity duration-100 rounded-t-xs"
                style={{ height: `${Math.max((v / maxDay) * 100, 3)}%` }}
              />
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
