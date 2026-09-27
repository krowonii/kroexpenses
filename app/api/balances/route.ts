export const runtime = "nodejs";

import type { Account } from "@/lib/types";
import type { BalanceTxn } from "@/lib/balances";

/**
 * Account balances for the balance displays (dashboard panel, accounts
 * screen). The math lives in lib/balances — the single source of truth —
 * this route just feeds it: the active accounts (matching /api/accounts)
 * plus the user's transaction rows, over which opening balances and
 * signed amounts are summed. Internal transfers cancel in the total;
 * 'excluded' rows and pre-opening-date rows don't count.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const [accountsRes, txnsRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,type,institution,is_active,opening_balance,opening_balance_date")
        .eq("is_active", true)
        .order("name"),
      supabase.from("transactions").select("account_id,amount,txn_date,status"),
    ]);
    if (accountsRes.error) throw accountsRes.error;
    if (txnsRes.error) throw txnsRes.error;

    const { computeBalances } = await import("@/lib/balances");
    const result = computeBalances(
      (accountsRes.data ?? []) as Account[],
      (txnsRes.data ?? []) as BalanceTxn[]
    );

    return Response.json({ balances: result.balances, total: result.total });
  } catch {
    // total: null tells the screens the load failed — they show a hint
    // instead of a misleading ₱0.
    return Response.json({ balances: [], total: null });
  }
}
