export const runtime = "nodejs";

import { buildRange } from "@/lib/dashboard";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const HEADER = [
  "Date",
  "Time",
  "Merchant",
  "Description",
  "Category",
  "Account",
  "Type",
  "Status",
  "Amount",
];

/** Column widths for the xlsx sheet (wch ≈ characters). */
const COL_WIDTHS = [
  { wch: 11 },
  { wch: 7 },
  { wch: 24 },
  { wch: 34 },
  { wch: 15 },
  { wch: 12 },
  { wch: 16 },
  { wch: 14 },
  { wch: 10 },
];

/**
 * Export transactions as CSV or xlsx, honoring the same filters as the
 * ledger API (from/to date range, account, comma-separated category ids,
 * type) so the export dialog's count preview matches the file exactly.
 * No pagination — the full filtered set goes into the file. A missing or
 * invalid date falls back to the dashboard's current-month range; an
 * inverted pair passes through as-is (the same query the preview ran, so
 * both show the same — empty — result).
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const fallback = buildRange("thisMonth");
    const fromParam = params.get("from") ?? "";
    const toParam = params.get("to") ?? "";
    const from = ISO_DATE.test(fromParam) ? fromParam : fallback.from;
    const to = ISO_DATE.test(toParam) ? toParam : fallback.to;
    const type = params.get("type") ?? "";
    const account = params.get("account") ?? "";
    const category = params.get("category") ?? "";
    const format = params.get("format") === "xlsx" ? "xlsx" : "csv";

    const { createClient, getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();
    let query = supabase
      .from("transactions")
      .select(
        "txn_date,txn_time,amount,txn_type,status,merchant,description,category:categories(name),account:accounts(name)"
      )
      .order("txn_date", { ascending: false })
      .order("txn_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .gte("txn_date", from)
      .lte("txn_date", to)
      .eq("user_id", userId);
    if (account) query = query.eq("account_id", account);
    if (category) {
      const ids = category.split(",").map((id) => id.trim()).filter(Boolean);
      if (ids.length > 0) query = query.in("category_id", ids);
    }
    if (type === "expense" || type === "income") {
      query = query.eq("txn_type", type);
    } else if (type === "transfer") {
      query = query.in("txn_type", ["transfer", "external_transfer"]);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Amount stays a raw signed number (negative = outflow) so sums work
    // in the spreadsheet; every other null renders empty. The cast goes
    // through unknown — the generated types infer an array for the
    // embedded category/account, but PostgREST returns objects here
    // (one-to-one FK relationships), as the ledger UI renders them.
    const rows = (data ?? []).map((t) => {
      const txn = t as unknown as {
        txn_date: string;
        txn_time: string | null;
        amount: number;
        txn_type: string;
        status: string;
        merchant: string | null;
        description: string | null;
        category: { name: string } | null;
        account: { name: string } | null;
      };
      return [
        txn.txn_date,
        txn.txn_time ?? "",
        txn.merchant ?? "",
        txn.description ?? "",
        txn.category?.name ?? "Uncategorized",
        txn.account?.name ?? "",
        txn.txn_type,
        txn.status,
        txn.amount,
      ];
    });

    if (format === "csv") {
      const csv = [HEADER, ...rows]
        .map((row) =>
          row
            .map((cell, i) => csvCell(String(cell), i === row.length - 1))
            .join(",")
        )
        .join("\r\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="expenses-${from}_to_${to}.csv"`,
        },
      });
    }

    // xlsx via the SheetJS dependency already used for statement parsing —
    // no new library. Cells are typed (Amount numeric), so the sheet sums.
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
    worksheet["!cols"] = COL_WIDTHS;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="expenses-${from}_to_${to}.xlsx"`,
      },
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/** One CSV cell: text starting with = + - @ would execute or parse as a
 *  formula in Excel/Sheets (OWASP CSV injection) — prefix it so it stays
 *  text. The Amount column passes numeric=true: it's a controlled number
 *  from the DB (always a valid numeric literal — no injection risk), and
 *  the guard would turn "-85" into text that can't sum. Quotes double up;
 *  a field with a quote, comma, or newline gets wrapped. */
function csvCell(value: string, numeric = false): string {
  if (!numeric && /^[=+\-@]/.test(value)) value = `'${value}`;
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Unwrap an error into a readable message — Supabase returns PostgREST
 *  error objects (not Error instances), so instanceof misses them. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.message, e.details, e.hint].filter(
      (p) => typeof p === "string" && p
    );
    if (parts.length > 0) return parts.join(" — ");
  }
  return String(error);
}
