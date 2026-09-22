/**
 * Dashboard view model — the shape the dashboard page and /api/summary
 * work with, plus period-range computation (Asia/Manila, the app's home
 * timezone) and delta formatting.
 */

export type PeriodKey = "thisMonth" | "lastMonth" | "custom";

export interface DashboardData {
  rangeLabel: string;
  income: number;
  expense: number;
  net: number;
  incomeDelta: string;
  expenseDelta: string;
  netDelta: string;
  reviewCount: number;
  categories: { name: string; amount: number; pct: number; color?: string | null }[];
  daily: number[];
  axisLabels: string[];
  weeks: { label: string; income: number; expense: number }[];
  budgets: { name: string; spent: number; limit: number }[];
  txns: {
    date: string;
    merchant: string;
    category: string;
    amount: number;
    account: string;
  }[];
}

/** Zeroed shape for the not-ready / no-data state. */
export function emptyDashboard(label: string): DashboardData {
  return {
    rangeLabel: label,
    income: 0,
    expense: 0,
    net: 0,
    incomeDelta: "—",
    expenseDelta: "—",
    netDelta: "—",
    reviewCount: 0,
    categories: [],
    daily: [],
    axisLabels: [],
    weeks: [],
    budgets: [],
    txns: [],
  };
}

/** Date formatters pinned to UTC — the date strings are date-only. */
export const MONTH_SHORT = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
export const DAY_SHORT = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function rangeLabel(from: Date, to: Date): string {
  const sameMonth =
    from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  return sameMonth
    ? `${MONTH_SHORT.format(from)} ${from.getUTCDate()} – ${DAY_YEAR.format(to)}`
    : `${DAY_YEAR.format(from)} – ${DAY_YEAR.format(to)}`;
}

/** Today in Asia/Manila as an ISO date string (en-CA renders YYYY-MM-DD). */
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Range for a dashboard period. `prev` is the comparable previous period
 * (null for a custom range — no delta baseline).
 */
export function buildRange(period: PeriodKey): {
  from: string;
  to: string;
  label: string;
  prev: { from: string; to: string } | null;
} {
  const [y, m, d] = todayIso().split("-").map(Number);

  if (period === "thisMonth") {
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    return {
      from: toIso(from),
      to: toIso(to),
      label: rangeLabel(from, to),
      prev: { from: toIso(new Date(Date.UTC(y, m - 2, 1))), to: toIso(new Date(Date.UTC(y, m - 1, 0))) },
    };
  }

  if (period === "lastMonth") {
    const from = new Date(Date.UTC(y, m - 2, 1));
    const to = new Date(Date.UTC(y, m - 1, 0));
    return {
      from: toIso(from),
      to: toIso(to),
      label: rangeLabel(from, to),
      prev: { from: toIso(new Date(Date.UTC(y, m - 3, 1))), to: toIso(new Date(Date.UTC(y, m - 2, 0))) },
    };
  }

  // Custom: a trailing 90-day window (no date picker yet).
  const to = new Date(Date.UTC(y, m - 1, d));
  const from = new Date(to.getTime() - 89 * 86_400_000);
  return { from: toIso(from), to: toIso(to), label: rangeLabel(from, to), prev: null };
}

/** "↑ 4% vs last month" — a dash when there's no baseline to compare against. */
export function delta(cur: number, prev: number, vs: string): string {
  if (prev <= 0) return "—";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `— even vs ${vs}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${vs}`;
}
