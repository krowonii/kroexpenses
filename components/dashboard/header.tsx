import Link from "next/link";
import { SignOut } from "@/components/auth/sign-out";

const PERIODS = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom range" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export function DashboardHeader({
  period,
  rangeLabel,
  onPeriodChange,
}: {
  period: PeriodKey;
  rangeLabel: string;
  onPeriodChange: (p: PeriodKey) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap mb-[18px]">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-[17px] font-semibold tracking-[0.01em]">Expenses</h1>
        <span className="font-mono text-[12.5px] text-text-faint">
          {rangeLabel}
        </span>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Link
          href="/import"
          className="inline-flex rounded-sm bg-net px-3 py-1.5 text-[13px] font-semibold text-bg whitespace-nowrap hover:opacity-90"
        >
          Import
        </Link>
        <div
          className="inline-flex bg-surface border border-border rounded-md p-0.75 gap-0.5"
          role="tablist"
          aria-label="Period"
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`appearance-none border-0 text-[13px] px-3 py-1.5 rounded-sm cursor-pointer whitespace-nowrap transition-colors duration-100 ${
                period === p.key
                  ? "bg-surface-2 text-text"
                  : "bg-transparent text-text-dim hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
          <SignOut />
        </div>
      </div>
    </div>
  );
}
