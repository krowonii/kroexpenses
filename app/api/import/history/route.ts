export const runtime = "nodejs";

/**
 * Recent imports from the database, powering the import-history section.
 * Empty when the database is unreachable or not signed in — the UI shows
 * its empty state rather than an error.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("imports")
      .select(
        "id,file_name,new_count,duplicate_count,transfer_count,review_count,error_count,status,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    return Response.json({ imports: data ?? [] });
  } catch {
    return Response.json({ imports: [] });
  }
}
