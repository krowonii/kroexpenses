import type { Account, Category } from "@/lib/types";
import type { ImportIssue, ImportSummary, NormalizedTxn } from "./types";
import { parseStatement } from "./parse";
import { detectFile } from "./detect";
import { normalizeFile } from "./normalize";
import { dedupe } from "./dedupe";
import { reconcile } from "./reconcile";
import { categorizeWithLlm, categorizeWithRules, llmConfigured } from "./categorize";

/** One uploaded file paired with the account the user assigned to it. */
export interface ImportFileInput {
  fileName: string;
  data: ArrayBuffer;
  accountId: string | null;
  accountName: string;
}

export interface ImportInput {
  files: ImportFileInput[];
  accounts: Account[];
  categories: Category[];
  /** User-learned rules, applied before built-in keyword rules. */
  rules: { pattern: string; categoryName: string }[];
  /** dedupe_keys already in the database, so overlapping statements skip. */
  existingKeys: Set<string>;
  /** When false the pipeline still runs and reports, but nothing is persisted. */
  dbReady: boolean;
}

/**
 * The import pipeline: parse → normalize → dedupe → transfer reconciliation
 * → categorize (rules, then LLM) → save. Pure business logic, separate from
 * the UI so it can later run asynchronously (queue/Lambda) without changes.
 */
export async function runImport(input: ImportInput): Promise<ImportSummary> {
  const issues: ImportIssue[] = [];
  const txns: NormalizedTxn[] = [];
  let saved = false;
  let saveNote: string | undefined;

  // 1. Validate + extract + normalize, per file.
  for (const file of input.files) {
    let parsed;
    try {
      parsed = await parseStatement(file.fileName, file.data);
    } catch (error) {
      issues.push({
        fileName: file.fileName,
        stage: "File validation",
        message: `Could not read this file: ${errorMessage(error)}`,
      });
      continue;
    }

    const detected = detectFile(parsed);
    if (detected.parseError) {
      issues.push({
        fileName: file.fileName,
        stage: "Transaction extraction",
        message: detected.parseError,
      });
    }

    const account = input.accounts.find((a) => a.id === file.accountId) ??
      input.accounts.find((a) => a.name === file.accountName);
    if (!account) {
      issues.push({
        fileName: file.fileName,
        stage: "Account detection",
        message: `No account selected for this file`,
      });
      continue;
    }

    const normalized = normalizeFile(parsed, {
      source: detected.source,
      accountId: account.id,
      accountName: account.name,
    });
    if (normalized.length === 0) {
      issues.push({
        fileName: file.fileName,
        stage: "Transaction extraction",
        message: "No transactions could be extracted from this file",
      });
    }
    txns.push(...normalized);
  }

  // 2. Deterministic duplicate detection (in-batch + against the database).
  const { kept, duplicateCount } = dedupe(txns, input.existingKeys);

  // 3. Internal transfer reconciliation (fee becomes an expense, legs are
  //    excluded from all totals).
  const reconciled = reconcile(kept);

  // 4. Categorize: learned rules, then built-in keyword rules…
  const ruleHits = categorizeWithRules(kept, input.categories, input.rules);

  // 5. …then the LLM for whatever the rules missed (only when configured).
  let llmAuto = 0;
  if (llmConfigured()) {
    const llm = await categorizeWithLlm(kept, input.categories);
    llmAuto = llm.auto;
    if (!llm.ok) {
      issues.push({
        fileName: "all files",
        stage: "AI categorization",
        message: llm.message ?? "AI categorization failed",
      });
    }
  }

  // 6. Summary. Anything still pending_review goes to the review workflow;
  //    skipped and errored rows are never counted as imported.
  const needReview = kept.filter((t) => t.status === "pending_review").length;

  // 7. Save the resulting transactions (only when the database is ready).
  if (input.dbReady) {
    const result = await saveBatch(kept, {
      fileNames: input.files.map((f) => f.fileName),
      duplicateCount,
      transferCount: reconciled.transferCount,
      reviewCount: needReview,
    });
    saved = result.saved;
    saveNote = result.note;
  } else {
    saveNote =
      "Not saved — the database is not connected yet, so these results are preview only.";
  }

  return {
    newCount: kept.length,
    duplicateCount,
    transferCount: reconciled.transferCount,
    feeCount: reconciled.feeCount,
    unmatchedCount: reconciled.unmatchedCount,
    errorCount: issues.length,
    issues,
    categorization: { auto: ruleHits + llmAuto, needReview },
    saved,
    saveNote,
  };
}

/** Persist one import batch: an imports record + its transactions, with
 *  batch indices resolved into real ids for transfer links. */
async function saveBatch(
  txns: NormalizedTxn[],
  meta: {
    fileNames: string[];
    duplicateCount: number;
    transferCount: number;
    reviewCount: number;
  }
): Promise<{ saved: boolean; note?: string }> {
  const { createClient } = await import("@/lib/supabase/server");
  const { getUserId } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const userId = await getUserId();

  try {
    const { data: importRow, error: importError } = await supabase
      .from("imports")
      .insert({
        user_id: userId,
        file_name: meta.fileNames.join(", "),
        new_count: txns.length,
        duplicate_count: meta.duplicateCount,
        transfer_count: meta.transferCount,
        review_count: meta.reviewCount,
        error_count: 0,
        status: "completed",
      })
      .select("id")
      .single();
    if (importError) throw importError;

    // Insert transactions first (without links), then patch the transfer pairs.
    const rows = txns.map((t) => ({
      user_id: userId,
      account_id: t.account_id,
      txn_date: t.txn_date,
      txn_time: t.txn_time,
      amount: t.amount,
      direction: t.direction,
      merchant: t.merchant,
      description: t.description,
      txn_type: t.txn_type,
      category_id: t.category_id,
      status: t.status,
      confidence: t.confidence,
      dedupe_key: t.dedupe_key,
      source: `import:${importRow.id}`,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .insert(rows)
      .select("id");
    if (insertError) throw insertError;

    // Resolve batch indices → real transaction ids for transfer links.
    const linkUpdates: PromiseLike<unknown>[] = [];
    for (let i = 0; i < txns.length; i++) {
      const related = txns[i].related_index;
      if (related === null || related === i) continue;
      linkUpdates.push(
        supabase
          .from("transactions")
          .update({ related_transaction_id: inserted[related].id })
          .eq("id", inserted[i].id)
      );
    }
    await Promise.all(linkUpdates);

    return { saved: true };
  } catch (error) {
    return {
      saved: false,
      note: `Not saved — the database rejected the import: ${errorMessage(error)}`,
    };
  }
}

/** Unwrap an error into a readable message — Supabase returns PostgREST
 *  error objects (not Error instances), so String() alone gives
 *  "[object Object]". */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.message, e.details, e.hint].filter((p) => typeof p === "string" && p);
    if (parts.length > 0) return parts.join(" — ");
  }
  return String(error);
}
