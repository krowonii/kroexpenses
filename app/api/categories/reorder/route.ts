export const runtime = "nodejs";

/**
 * Persist a drag-and-drop order: each id gets sort_order = its position.
 * Updates are RLS-scoped, so ids outside the user's set match nothing.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (
      !Array.isArray(body.ids) ||
      body.ids.length === 0 ||
      !body.ids.every((id) => typeof id === "string")
    ) {
      return Response.json({ error: "Missing ids" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const updates = (body.ids as string[]).map((id, index) =>
      supabase.from("categories").update({ sort_order: index + 1 }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const error = results.find((r) => r.error)?.error;
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}
