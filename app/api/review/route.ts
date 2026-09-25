export const runtime = "nodejs";

interface ReviewItem {
  id: string;
  txn_date: string;
  amount: number;
  txn_type: string;
  status: string;
  confidence: number | null;
  merchant: string | null;
  description: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
}

/** Escape regex specials so learned patterns match literally — the
 *  pipeline compiles these with `new RegExp`. */
function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The review queue: low-confidence transactions (pending_review) plus
 * transfer-like rows with no counterpart (unmatched), with the user's
 * categories alongside for the pickers. Empty when the database is
 * unreachable or not signed in.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const [txnsRes, catsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id,txn_date,txn_time,amount,txn_type,status,direction,confidence,merchant,description,category:categories(id,name),account:accounts(name)"
        )
        // pending_review + unmatched, plus any expense that ended up with
        // no category at all (an interrupted AI pass, or a later category
        // delete nulling category_id) — those need the user too, and a
        // re-import can't fix them (dedupe skips already-imported rows).
        // Excluded rows leave all totals and are configured on the ledger,
        // so they never queue back in.
        .or("status.in.(pending_review,unmatched),and(txn_type.eq.expense,category_id.is.null,status.ne.excluded)")
        .order("txn_date", { ascending: false })
        .order("txn_time", { ascending: false, nullsFirst: false }),
      supabase.from("categories").select("id,name,color").order("sort_order"),
    ]);
    if (txnsRes.error || catsRes.error) throw txnsRes.error ?? catsRes.error;

    return Response.json({
      items: (txnsRes.data ?? []) as unknown as ReviewItem[],
      categories: catsRes.data ?? [],
    });
  } catch {
    return Response.json({ items: [], categories: [] });
  }
}

/**
 * Apply a review decision. `categorize` stands the user's pick up as the
 * transaction's category and learns it (pattern from the merchant) so
 * future imports need less review; `transfer` marks an unmatched row as a
 * reconciled internal transfer; `exclude` removes the row from all totals
 * until restored (restoring happens on the ledger's edit dialog). Updates
 * are scoped by user_id as well as id.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      categoryId?: string | null;
      action?: "categorize" | "transfer" | "exclude";
    };
    if (!body.id) {
      return Response.json({ error: "Missing transaction id" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const { getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    if (body.action === "transfer") {
      const { error } = await supabase
        .from("transactions")
        .update({ txn_type: "transfer", status: "categorized", confidence: null })
        .eq("id", body.id)
        .eq("user_id", userId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "exclude") {
      const { error } = await supabase
        .from("transactions")
        .update({ status: "excluded" })
        .eq("id", body.id)
        .eq("user_id", userId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const { data: updated, error } = await supabase
      .from("transactions")
      .update({ category_id: body.categoryId ?? null, status: "categorized", confidence: 1 })
      .eq("id", body.id)
      .eq("user_id", userId)
      .select("merchant")
      .single();
    if (error) throw error;

    // Learn the correction: a rule matching the merchant, so the same
    // description is auto-categorized next import. Skipped without a
    // category or a usable merchant.
    if (body.categoryId) {
      const merchant = (updated?.merchant ?? "").trim();
      if (merchant && merchant !== "Unknown" && merchant !== "Transfer fee" && merchant !== "Manual entry") {
        const pattern = escapePattern(merchant);
        const { data: existing } = await supabase
          .from("categorization_rules")
          .select("id")
          .eq("pattern", pattern)
          .eq("category_id", body.categoryId)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase
            .from("categorization_rules")
            .insert({ user_id: userId, pattern, category_id: body.categoryId });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}
