export const runtime = "nodejs";

/**
 * The full ledger — newest first (same-day rows by newest created), with
 * pagination (up to 100 per page) and filters: account, category, type,
 * and a merchant/description search.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const perPage = Math.min(100, Math.max(1, Number(params.get("per_page")) || 50));
    const page = Math.max(1, Number(params.get("page")) || 1);
    const type = params.get("type") ?? "";
    const account = params.get("account") ?? "";
    const category = params.get("category") ?? "";
    // Commas/parens break PostgREST's `.or()` — strip them from the search.
    const q = (params.get("q") ?? "").replace(/[,()]/g, "").trim();

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    let query = supabase
      .from("transactions")
      .select(
        "id,txn_date,amount,txn_type,status,merchant,description,category:categories(id,name,color),account:accounts(name)",
        { count: "exact" }
      )
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (account) query = query.eq("account_id", account);
    if (category) query = query.eq("category_id", category);
    if (type === "expense" || type === "income") {
      query = query.eq("txn_type", type);
    } else if (type === "transfer") {
      query = query.in("txn_type", ["transfer", "external_transfer"]);
    }
    if (q) query = query.or(`merchant.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, count, error } = await query.range(
      (page - 1) * perPage,
      page * perPage - 1
    );
    if (error) throw error;
    return Response.json({
      transactions: data ?? [],
      total: count ?? 0,
      page,
      perPage,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * Manual expense entry — the floating plus button. Inserts a single
 * transaction with the picked category and account. An explicitly picked
 * category is the user's own categorization (confidence null, status
 * categorized); no category lands it in the review queue.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      date?: string;
      amount?: number;
      categoryId?: string | null;
      accountId?: string;
    };

    const date =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : null;
    const amount =
      typeof body.amount === "number" &&
      Number.isFinite(body.amount) &&
      body.amount > 0
        ? Math.round(body.amount * 100) / 100
        : null;
    if (!date || amount === null) {
      return Response.json(
        { error: "A date and a positive amount are required" },
        { status: 400 }
      );
    }
    if (!body.accountId) {
      return Response.json({ error: "Pick an account" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const { getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    // Verify the account belongs to the user first (RLS scopes the select;
    // a foreign id would fail the FK mid-insert otherwise).
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", body.accountId)
      .limit(1);
    if (accountError) throw accountError;
    if (!account || account.length === 0) {
      return Response.json({ error: "Unknown account" }, { status: 400 });
    }

    // Category is optional; ignore ids outside the user's set.
    let categoryId: string | null = null;
    if (body.categoryId) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("id", body.categoryId)
        .limit(1);
      if (categoryError) throw categoryError;
      if (category && category.length > 0) categoryId = body.categoryId;
    }

    // No dedupe_key — a genuine second identical expense (two jeepney
    // rides, same day) must survive a later statement import.
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      account_id: body.accountId,
      txn_date: date,
      amount: -amount, // signed: negative = outflow
      direction: "out",
      merchant: "Manual entry",
      txn_type: "expense",
      category_id: categoryId,
      status: categoryId ? "categorized" : "pending_review",
      source: "manual",
    });
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * Clear transaction data: `?account=<id>` wipes one account's rows; no
 * param wipes everything the signed-in user owns. Both statements are
 * scoped by user_id — PostgREST rejects UPDATE/DELETE with no WHERE
 * clause (21000), and RLS applies the same restriction anyway. The
 * transfer links are cleared first: every row is going away, so they
 * carry nothing worth keeping, and the FK never has to fire while the
 * delete removes the rows they point at. Best-effort: if the link clear
 * fails the delete still runs and reports its own error.
 */
export async function DELETE(request: Request) {
  try {
    const account = new URL(request.url).searchParams.get("account");
    const { createClient, getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    const links = supabase
      .from("transactions")
      .update({ related_transaction_id: null })
      .eq("user_id", userId);
    await (account ? links.eq("account_id", account) : links);

    const query = supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId);
    const { error } = await (account ? query.eq("account_id", account) : query);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error);
    // Log so a rejected clear is diagnosable from the server log too.
    console.error("[clear-data]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Unwrap an error into a readable message — Supabase returns PostgREST
 *  error objects (not Error instances), so instanceof misses them and the
 *  catch's fallback would mask the real cause. */
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
