import type { Account } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Active user accounts from the database. Empty when the database is
 * unreachable or not signed in — the client falls back to the starter list.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,type,institution,is_active")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;

    return Response.json({ accounts: (data ?? []) as Account[] });
  } catch {
    return Response.json({ accounts: [] });
  }
}
