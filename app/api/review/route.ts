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
          "id,txn_date,amount,txn_type,status,confidence,merchant,description,category:categories(id,name),account:accounts(name)"
        )
        .in("status", ["pending_review", "unmatched"])
        .order("txn_date", { ascending: false }),
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
 * reconciled internal transfer, which excludes it from spending totals.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      categoryId?: string | null;
      action?: "categorize" | "transfer";
    };
    if (!body.id) {
      return Response.json({ error: "Missing transaction id" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (body.action === "transfer") {
      const { error } = await supabase
        .from("transactions")
        .update({ txn_type: "transfer", status: "categorized", confidence: null })
        .eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const { data: updated, error } = await supabase
      .from("transactions")
      .update({ category_id: body.categoryId ?? null, status: "categorized", confidence: 1 })
      .eq("id", body.id)
      .select("merchant")
      .single();
    if (error) throw error;

    // Learn the correction: a rule matching the merchant, so the same
    // description is auto-categorized next import. Skipped without a
    // category or a usable merchant.
    if (body.categoryId) {
      const merchant = (updated?.merchant ?? "").trim();
      if (merchant && merchant !== "Unknown" && merchant !== "Transfer fee") {
        const pattern = escapePattern(merchant);
        const { data: existing } = await supabase
          .from("categorization_rules")
          .select("id")
          .eq("pattern", pattern)
          .eq("category_id", body.categoryId)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("categorization_rules").insert({ pattern, category_id: body.categoryId });
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
