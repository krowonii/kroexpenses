import {
  buildRange,
  DAY_SHORT,
  delta,
  emptyDashboard,
  MONTH_SHORT,
  type DailyPoint,
  type DashboardData,
  type PeriodKey,
} from "@/lib/dashboard";
import { timeLabel } from "@/lib/format";

export const runtime = "nodejs";

interface Row {
  txn_date: string;
  txn_time: string | null;
  amount: number;
  txn_type: string;
  status: string;
  merchant: string | null;
  description: string | null;
  category: { name: string; color: string | null } | null;
  account: { name: string } | null;
}

function parsePeriod(request: Request): PeriodKey {
  const value = new URL(request.url).searchParams.get("period");
  return value === "lastMonth" || value === "custom" ? value : "thisMonth";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aggregate rows into the dashboard numbers. Reconciled transfers are
 * excluded from spending totals; so are user-excluded rows (status
 * excluded — they leave every number until restored); unmatched ones
 * stay counted (masterdoc).
 */
function aggregate(rows: Row[]) {
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, { name: string; color: string | null; amount: number }>();
  const byDayOut = new Map<string, number>();
  const byDayIn = new Map<string, number>();

  for (const row of rows) {
    if (row.txn_type === "transfer") continue;
    if (row.status === "excluded") continue;
    if (row.amount > 0) {
      income += row.amount;
      byDayIn.set(row.txn_date, (byDayIn.get(row.txn_date) ?? 0) + row.amount);
    } else {
      const out = -row.amount;
      expense += out;
      const name = row.category?.name ?? "Uncategorized";
      const entry = byCategory.get(name) ?? { name, color: row.category?.color ?? null, amount: 0 };
      entry.amount += out;
      byCategory.set(name, entry);
      byDayOut.set(row.txn_date, (byDayOut.get(row.txn_date) ?? 0) + out);
    }
  }
  return { income, expense, byCategory, byDayOut, byDayIn };
}

/**
 * The dashboard's numbers for a period. dbReady is true only when the
 * query ran against a reachable database — an unauthenticated request is
 * 401'd by the proxy, so reaching this route means signed in.
 */
export async function GET(request: Request) {
  const period = parsePeriod(request);
  const range = buildRange(period);

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const [txnsRes, reviewRes, budgetsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          "txn_date,txn_time,amount,txn_type,status,merchant,description,category:categories(name,color),account:accounts(name)"
        )
        .gte("txn_date", range.from)
        .lte("txn_date", range.to)
        .order("txn_date", { ascending: false }),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase.from("budgets").select("monthly_limit,category:categories(name)"),
    ]);
    if (txnsRes.error || reviewRes.error || budgetsRes.error) {
      throw txnsRes.error ?? reviewRes.error ?? budgetsRes.error;
    }

    // Previous-period totals feed the summary deltas.
    let prevTotals: { income: number; expense: number } | null = null;
    if (range.prev) {
      const { data: prevData, error: prevError } = await supabase
        .from("transactions")
        .select("amount,txn_type")
        .gte("txn_date", range.prev.from)
        .lte("txn_date", range.prev.to);
      if (prevError) throw prevError;
      prevTotals = { income: 0, expense: 0 };
      for (const row of (prevData ?? []) as { amount: number; txn_type: string; status: string }[]) {
        if (row.txn_type === "transfer" || row.status === "excluded") continue;
        if (row.amount > 0) prevTotals.income += row.amount;
        else prevTotals.expense += -row.amount;
      }
    }

    const rows = (txnsRes.data ?? []) as unknown as Row[];
    const { income, expense, byCategory, byDayOut, byDayIn } = aggregate(rows);

    // Every day in the range, ascending — zeros included, so the daily
    // bars line up with real dates.
    const startMs = Date.parse(`${range.from}T00:00:00Z`);
    const endMs = Date.parse(`${range.to}T00:00:00Z`);
    const days = Math.round((endMs - startMs) / 86_400_000) + 1;
    const dateList: string[] = [];
    for (let i = 0; i < days; i++) {
      dateList.push(new Date(startMs + i * 86_400_000).toISOString().slice(0, 10));
    }

    const daily: DailyPoint[] = dateList.map((d) => ({
      date: d,
      amount: round2(byDayOut.get(d) ?? 0),
    }));
    const n = daily.length;
    const axisLabels = [
      ...new Set(
        [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1].filter((i) => i >= 0 && i < n)
      ),
    ]
      .sort((a, b) => a - b)
      .map((i) => DAY_SHORT.format(new Date(`${dateList[i]}T00:00:00Z`)));

    // Months get four "Week N" slices; a custom range gets honest 7-day
    // weeks labeled by start date.
    const weeks: { label: string; income: number; expense: number }[] = [];
    const weekCount = period === "custom" ? Math.ceil(days / 7) : 4;
    const sliceLen = period === "custom" ? 7 : Math.ceil(days / weekCount);
    for (let w = 0; w < weekCount; w++) {
      const startIdx = w * sliceLen;
      if (startIdx >= days) break;
      const endIdx = Math.min(startIdx + sliceLen, days);
      let wIncome = 0;
      let wExpense = 0;
      for (let i = startIdx; i < endIdx; i++) {
        wIncome += byDayIn.get(dateList[i]) ?? 0;
        wExpense += byDayOut.get(dateList[i]) ?? 0;
      }
      weeks.push({
        label: period === "custom" ? DAY_SHORT.format(new Date(`${dateList[startIdx]}T00:00:00Z`)) : `Week ${w + 1}`,
        income: round2(wIncome),
        expense: round2(wExpense),
      });
    }

    const categories = [...byCategory.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((c) => ({
        name: c.name,
        amount: round2(c.amount),
        pct: expense > 0 ? (c.amount / expense) * 100 : 0,
        color: c.color,
      }));

    const budgets = (
      (budgetsRes.data ?? []) as unknown as { monthly_limit: number; category: { name: string } | null }[]
    ).map((b) => ({
      name: b.category?.name ?? "Uncategorized",
      spent: byCategory.get(b.category?.name ?? "")?.amount ?? 0,
      limit: b.monthly_limit,
    }));

    const vsLabel =
      period === "lastMonth" && range.prev
        ? MONTH_SHORT.format(new Date(`${range.prev.from}T00:00:00Z`))
        : "last month";

    const statusLabel: Record<string, string> = {
      pending_review: "Needs review",
      unmatched: "Unmatched",
      excluded: "Excluded",
    };

    const data: DashboardData = {
      rangeLabel: range.label,
      income: round2(income),
      expense: round2(expense),
      net: round2(income - expense),
      incomeDelta: prevTotals ? delta(income, prevTotals.income, vsLabel) : "— custom range",
      expenseDelta: prevTotals ? delta(expense, prevTotals.expense, vsLabel) : "— custom range",
      netDelta: prevTotals
        ? delta(income - expense, prevTotals.income - prevTotals.expense, vsLabel)
        : "— custom range",
      reviewCount: reviewRes.count ?? 0,
      categories,
      daily,
      axisLabels,
      weeks,
      budgets,
      txns: rows.slice(0, 8).map((row) => ({
        date: DAY_SHORT.format(new Date(`${row.txn_date}T00:00:00Z`)),
        time: timeLabel(row.txn_time),
        merchant: row.merchant || row.description || "—",
        category: row.category?.name ?? statusLabel[row.status] ?? "Uncategorized",
        amount: row.amount,
        account: row.account?.name ?? "—",
      })),

    };

    return Response.json({ dbReady: true, data });
  } catch {
    return Response.json({ dbReady: false, data: emptyDashboard(range.label) });
  }
}
