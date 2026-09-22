import type { Account } from "@/lib/types";
import type { DetectedFile, SourceKind } from "@/lib/import/types";
import { matchAccount, detectFile } from "@/lib/import/detect";
import { parseStatement } from "@/lib/import/parse";
import { loadDbContext } from "@/lib/import/db-context";

export const runtime = "nodejs";

function failed(
  fileName: string,
  source: SourceKind,
  message: string
): DetectedFile {
  return {
    fileName,
    source,
    suggestedAccountName: null,
    rowCount: 0,
    dateRange: null,
    parseError: message,
  };
}

/**
 * Inspect uploaded files: parse (server-side), detect the source, count
 * rows, and resolve the date range. The suggested account is resolved
 * against the user's accounts so reliable detections are preselected —
 * only ambiguous or unreadable files ask the user for input.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const entries = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  const files: DetectedFile[] = [];
  for (const entry of entries) {
    if (!/\.(csv|xlsx)$/i.test(entry.name)) {
      files.push(
        failed(
          entry.name,
          "other",
          "Unsupported file type — upload .csv or .xlsx"
        )
      );
      continue;
    }
    try {
      const parsed = await parseStatement(entry.name, await entry.arrayBuffer());
      files.push(detectFile(parsed));
    } catch (error) {
      files.push(
        failed(
          entry.name,
          "other",
          `Could not read this file: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  const db = await loadDbContext();
  const resolved = files.map((file) =>
    file.source === "other" || file.parseError
      ? file
      : { ...file, suggestedAccountName: matchAccount(db.accounts, file.source) }
  );

  return Response.json({ files: resolved });
}
