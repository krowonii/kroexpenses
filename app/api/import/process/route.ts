import { z } from "zod";
import { runImport } from "@/lib/import/pipeline";
import { loadDbContext } from "@/lib/import/db-context";

export const runtime = "nodejs";

const Assignments = z.array(
  z.object({
    fileName: z.string().min(1),
    accountName: z.string().min(1),
  })
);

/**
 * Run the full import pipeline server-side: parse, normalize, deduplicate,
 * reconcile transfers, categorize (rules then LLM), and save. The pipeline
 * returns actual counts — skipped and rejected rows are never reported as
 * imported. LLM keys are read from server env vars only.
 *
 * The response is a Server-Sent Events stream: progress events (stage +
 * optional detail) as the pipeline runs, then either a final `summary` or
 * an `error`. Categorization is the long stage — without the stream the
 * client can't tell a working import from a hung one.
 */
export async function POST(request: Request) {
  let files: {
    fileName: string;
    data: ArrayBuffer;
    accountId: string | null;
    accountName: string;
  }[];
  let db: Awaited<ReturnType<typeof loadDbContext>>;

  try {
    const formData = await request.formData();
    const entries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    let assignments;
    try {
      assignments = Assignments.parse(
        JSON.parse(String(formData.get("assignments") ?? "[]"))
      );
    } catch {
      return Response.json({ error: "Invalid account assignments" }, { status: 400 });
    }

    if (entries.length === 0) {
      return Response.json({ error: "No files in this import" }, { status: 400 });
    }

    const missing = entries
      .filter(
        (entry) =>
          /\.(csv|xlsx)$/i.test(entry.name) &&
          !assignments.some((a) => a.fileName === entry.name)
      )
      .map((entry) => entry.name);
    if (missing.length > 0) {
      return Response.json(
        { error: `No account selected for: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    db = await loadDbContext();
    const byName = new Map(db.accounts.map((a) => [a.name.toLowerCase(), a]));

    files = [];
    for (const entry of entries) {
      if (!/\.(csv|xlsx)$/i.test(entry.name)) continue;
      const assignment = assignments.find((a) => a.fileName === entry.name);
      const account = byName.get(assignment!.accountName.toLowerCase());
      files.push({
        fileName: entry.name,
        data: await entry.arrayBuffer(),
        accountId: account?.id ?? null,
        accountName: account?.name ?? assignment!.accountName,
      });
    }
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const summary = await runImport(
          {
            files,
            accounts: db.accounts,
            categories: db.categories,
            rules: db.rules,
            existingKeys: db.existingKeys,
            dbReady: db.dbReady,
          },
          (progress) => send(progress)
        );
        send({ summary });
      } catch (error) {
        send({ error: errorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

/** Unwrap an error into a readable message — PostgREST/Supabase errors are
 *  plain objects, not Error instances. */
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
