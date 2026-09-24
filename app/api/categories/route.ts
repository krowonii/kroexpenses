export const runtime = "nodejs";

interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

const MAX_NAME = 40;
/** Postgres unique-violation code — (user_id, name) is unique. */
const UNIQUE_VIOLATION = "23505";

/** The user's categories — the manual-add picker and its editor read
 *  these live. Empty when the database is unreachable or not signed in. */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,color,sort_order")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return Response.json({ categories: (data ?? []) as CategoryRow[] });
  } catch {
    return Response.json({ categories: [] });
  }
}

/** Add a category. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? "").trim().slice(0, MAX_NAME);
    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const { getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    // Append at the end: without this a new category would default to
    // sort_order 0 and jump ahead of the user's drag-and-drop order.
    const { data: last } = await supabase
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const sortOrder = (last?.[0]?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, sort_order: sortOrder })
      .select("id,name,color,sort_order")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return Response.json(
          { error: "A category with that name already exists" },
          { status: 400 }
        );
      }
      throw error;
    }
    return Response.json({ category: data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}

/** Rename a category. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; name?: string };
    const name = (body.name ?? "").trim().slice(0, MAX_NAME);
    if (!body.id || !name) {
      return Response.json({ error: "Id and name are required" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .update({ name })
      .eq("id", body.id)
      .select("id,name,color,sort_order")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return Response.json(
          { error: "A category with that name already exists" },
          { status: 400 }
        );
      }
      throw error;
    }
    return Response.json({ category: data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}

/** Delete a category — its transactions go uncategorized and re-categorize
 *  on the next import; budgets and learned rules for it are removed. */
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json({ error: "Missing id" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}
