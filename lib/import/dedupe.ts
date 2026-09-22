import type { NormalizedTxn } from "./types";

/**
 * Deterministic duplicate detection — no LLM. A transaction is a duplicate
 * when its dedupe_key was already imported (existing database keys) or
 * already seen in this batch (overlapping statements), so re-uploading a
 * statement never double-counts. Skips are counted, not discarded silently.
 */
export function dedupe(
  txns: NormalizedTxn[],
  existingKeys: Set<string>
): { kept: NormalizedTxn[]; duplicateCount: number } {
  const seen = new Set(existingKeys);
  const kept: NormalizedTxn[] = [];
  let duplicateCount = 0;

  for (const txn of txns) {
    if (seen.has(txn.dedupe_key)) {
      duplicateCount++;
      continue;
    }
    seen.add(txn.dedupe_key);
    kept.push(txn);
  }

  return { kept, duplicateCount };
}
