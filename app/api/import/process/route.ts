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
 */
export async function POST(request: Request) {
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

  const db = await loadDbContext();
  const byName = new Map(db.accounts.map((a) => [a.name.toLowerCase(), a]));

  const files = [];
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

  const summary = await runImport({
    files,
    accounts: db.accounts,
    categories: db.categories,
    rules: db.rules,
    existingKeys: db.existingKeys,
    dbReady: db.dbReady,
  });

  return Response.json(summary);
}
