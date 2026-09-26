/**
 * Dashboard view model — the shape the dashboard page and /api/summary
 * work with, plus period-range computation (Asia/Manila, the app's home
 * timezone) and delta formatting.
 */

export type PeriodKey = "thisMonth" | "lastMonth" | "custom";

/** One day's spending for the "Spending over time" chart — the ISO date
 *  it falls on plus the summed amount (so each bar's hover can name it). */
export interface DailyPoint {
  date: string;
  amount: number;
}

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
  daily: DailyPoint[];
  axisLabels: string[];
  weeks: { label: string; income: number; expense: number }[];
  budgets: { name: string; spent: number; limit: number }[];
  txns: {
    date: string;
    /** "3:20 PM" when the statement stamped a time; "" otherwise. */
    time?: string;
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
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Range for a dashboard period. `prev` is the comparable previous period
 * (null for a custom range — no delta baseline). A custom range uses the
 * dates the picker picked when given, else falls back to a trailing
 * 90-day window.
 */
export function buildRange(
  period: PeriodKey,
  custom?: { from: string; to: string }
): {
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

  // Custom: the picked range when it's a valid date pair (the picker
  // always sends one), else a trailing 90-day window. No delta baseline.
  const fallbackTo = new Date(Date.UTC(y, m - 1, d));
  const fallbackFrom = new Date(fallbackTo.getTime() - 89 * 86_400_000);
  const fromStr =
    custom && ISO_DATE.test(custom.from) && ISO_DATE.test(custom.to) && custom.from <= custom.to
      ? custom.from
      : toIso(fallbackFrom);
  const toStr = custom && fromStr === custom.from ? custom.to : toIso(fallbackTo);
  return {
    from: fromStr,
    to: toStr,
    label: rangeLabel(new Date(`${fromStr}T00:00:00Z`), new Date(`${toStr}T00:00:00Z`)),
    prev: null,
  };
}

/** "↑ 4% vs last month" — a dash when there's no baseline to compare against. */
export function delta(cur: number, prev: number, vs: string): string {
  if (prev <= 0) return "—";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `— even vs ${vs}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${vs}`;
}
