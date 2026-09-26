import { ApiError, GoogleGenAI } from "@google/genai";
import type { Category } from "@/lib/types";
import type { NormalizedTxn } from "./types";

/** Confidence at/above which an AI category is accepted without review. */
export const HIGH_CONFIDENCE = 0.85;

/**
 * Deterministic keyword rules, checked before the LLM. Ordered; first hit
 * wins. A rule only applies when its category name exists in the user's
 * category set — with custom categories the rules adapt to those names.
 */
const RULES: { pattern: RegExp; category: string }[] = [
  {
    // BDO truncates merchant names ("STARBU" for Starbucks, "MCDO" for
    // McDonald's) — the rules match the truncated forms its exports use.
    pattern:
      /(jollibee|mcdonald|mcdo|mang inasal|kfc|starbucks|starbu|coffee|yardstick|dunkin|krispy|tsujiri|sichu|gongfu|din tai|burger|7-eleven|restaurant|cafe|dining|food)/i,
    category: "Food",
  },
  {
    pattern:
      /(shopee|lazada|sm department|sm supermarket|sm hyperma|hypermarket|landers|grocery|supermarket|market|greenhills|mr[.\s]?diy|jins|store|shopping)/i,
    category: "Shopping",
  },
  {
    pattern:
      /(meralco|manila water|maynilad|pldt|globe at home|converge|electric|water bill|internet|billing|bill)/i,
    category: "Bills",
  },
  {
    pattern:
      /(grab|uber|jeepney|tricycle|taxi|mrt|lrt|bus|fuel|shell|petron|caltex|parking|toll|transport)/i,
    category: "Transportation",
  },
  {
    pattern:
      /(netflix|spotify|disney|cinema|game|steam|entertainment|movie)/i,
    category: "Entertainment",
  },
];

/** Categorize with deterministic rules. Returns the number of rows matched. */
export function categorizeWithRules(
  txns: NormalizedTxn[],
  categories: Category[],
  userRules: { pattern: string; categoryName: string }[] = []
): number {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  // User-learned rules (saved corrections) run before the built-in ones.
  const learned = userRules.flatMap((rule) => {
    try {
      return [{ pattern: new RegExp(rule.pattern, "i"), category: rule.categoryName }];
    } catch {
      return []; // skip malformed rules
    }
  });
  let hits = 0;

  for (const txn of txns) {
    if (txn.category_id || txn.direction !== "out") continue;
    for (const rule of [...learned, ...RULES]) {
      if (!rule.pattern.test(txn.description)) continue;
      const category = byName.get(rule.category.toLowerCase());
      if (!category) continue;
      txn.category_id = category.id;
      txn.category_name = category.name;
      txn.confidence = 0.95;
      txn.status = "categorized";
      hits++;
      break;
    }
  }

  return hits;
}

/** JSON Schema the model's reply must conform to (enforced server-side by
 *  the interactions API via `response_format`). */
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          category: { type: "string" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["index", "category", "confidence"],
      },
    },
  },
  required: ["results"],
};

interface ParsedResult {
  index: number;
  category: string;
  confidence: number;
}

/**
 * Parse and validate the model's structured reply. The interactions API
 * enforces the schema server-side; this guards the fields the app actually
 * reads before use.
 */
function parseResults(text: string): ParsedResult[] | null {
  try {
    const data = JSON.parse(text) as { results?: unknown };
    if (!data || !Array.isArray(data.results)) return null;
    const results: ParsedResult[] = [];
    for (const item of data.results) {
      const r = item as { index?: unknown; category?: unknown; confidence?: unknown };
      if (
        typeof r.index !== "number" ||
        typeof r.category !== "string" ||
        r.category.length === 0 ||
        typeof r.confidence !== "number"
      ) {
        return null;
      }
      results.push({
        index: r.index,
        category: r.category,
        confidence: Math.min(1, Math.max(0, r.confidence)),
      });
    }
    return results;
  } catch {
    return null;
  }
}

/** Server-side only — the API key is never exposed to the client. */
function apiKey(): string | undefined {
  return process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function llmConfigured(): boolean {
  return Boolean(apiKey());
}

/** Seconds to wait on a 429 — Google's message includes "Please retry in
 *  Xs"; 30s when it doesn't. */
function retrySeconds(message: string): number | null {
  const match = message.match(/retry in (\d+)\s*s/i);
  return match ? Number(match[1]) : null;
}

/** A daily-limit 429 ("20 requests per day on Free Tier") never resets in
 *  a retry window — it clears at midnight PT — so retrying just burns
 *  more of the quota. Per-minute limits still wait out fine. */
function isDailyLimit(message: string): boolean {
  return /per day|daily/i.test(message);
}

/** A 429 rate-limit rejection — the SDK may surface it as an ApiError, a
 *  subclass, or a plain object, so check status and message. */
function isRateLimitError(error: unknown): boolean {
  if ((error as { status?: unknown })?.status === 429) return true;
  return /rate limit/i.test(error instanceof Error ? error.message : String(error));
}

/** A transient failure — 5xx or a network drop — is worth one retry;
 *  4xx rejections are not (the same request fails the same way twice). */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 500) return true;
  return /fetch failed|network|econn|socket|timed?out/i.test(
    error instanceof Error ? error.message : String(error)
  );
}

/** Run a call, waiting out per-minute 429s instead of aborting the whole
 *  categorization pass. `onWait` reports the pause so the import screen
 *  can show it. Daily-limit rejections throw immediately; other errors
 *  get one retry (transients recover, 4xxs don't). */
async function withRateLimitRetry<T>(
  attempt: () => Promise<T>,
  onWait?: (seconds: number) => void
): Promise<T> {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitError(error) && !isDailyLimit(message)) {
        if (tries >= 2) throw error;
        const wait = retrySeconds(message) ?? 30;
        onWait?.(wait);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000 + 2_000));
        continue;
      }
      if (isTransient(error) && tries < 1) {
        onWait?.(2);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      throw error;
    }
  }
}

/** Transactions per LLM call. Bigger chunks mean fewer requests, which
 *  stretches free-tier quotas — gemini flash tiers cap at 20 requests per
 *  DAY, so one request per import is the difference between fitting and
 *  failing. 250 rows ≈ 10K output tokens, well inside the 16K cap; push
 *  LLM_CHUNK_SIZE higher via env for bigger imports. Remaining 429s are
 *  handled in withRateLimitRetry. */
const CHUNK_SIZE = Math.max(10, Number(process.env.LLM_CHUNK_SIZE) || 250);

export interface LlmCategorization {
  ok: boolean;
  message?: string;
  /** Rows the model categorized at or above the confidence gate. */
  auto: number;
}

/**
 * Categorize the remaining expenses with the LLM, against the user's
 * category list (never a fixed taxonomy). The app — not the model — decides
 * approval: at/above HIGH_CONFIDENCE auto-accepted, below goes to review.
 * Any failure falls back to rules-only results without failing the import.
 * `onProgress` reports per-chunk sub-progress and rate-limit waits so the
 * import screen can show real movement during the long final stage.
 */
export async function categorizeWithLlm(
  txns: NormalizedTxn[],
  categories: Category[],
  onProgress?: (detail: string) => void
): Promise<LlmCategorization> {
  const client = new GoogleGenAI({ apiKey: apiKey() });
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const pending = txns.filter(
    (t) => !t.category_id && t.direction === "out" && t.txn_type !== "transfer"
  );

  let auto = 0;
  const failures: string[] = [];

  for (let start = 0; start < pending.length; start += CHUNK_SIZE) {
    const chunk = pending.slice(start, start + CHUNK_SIZE);
    const lines = chunk.map(
      (t, i) =>
        `${i}: ${t.txn_date} ${t.merchant} — ${t.description} (₱${Math.abs(t.amount).toFixed(2)})`
    );

    try {
      const interaction = await withRateLimitRetry(
        () =>
          client.interactions.create({
            model: process.env.LLM_MODEL ?? "gemini-3.8-flash",
            input: `Categories: ${categories.map((c) => c.name).join(", ")}\n\nTransactions:\n${lines.join("\n")}`,
            system_instruction:
              "You categorize personal transactions for a Philippine expense tracker. " +
              "For each transaction, pick the single best category from the provided list. " +
              "If none fit, pick the closest one and lower the confidence. " +
              "Keep each result to its index, category, and confidence — omit the reason field. " +
              "Respond only with the structured output.",
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: RESULT_SCHEMA,
            },
            generation_config: { max_output_tokens: 16000 },
          }),
        (seconds) => onProgress?.(`rate-limited — waiting ${seconds}s`)
      );

      if (interaction.status !== "completed") {
        // One bad chunk costs only its own rows — the rest of the pass
        // still runs, so a mid-pass failure no longer drops everything.
        failures.push(`interaction ${interaction.status} — ${chunk.length} rows to review`);
        onProgress?.(`chunk failed — continuing with the rest`);
        continue;
      }

      const parsed = parseResults(interaction.output_text ?? "");
      if (!parsed) {
        failures.push(`no structured output — ${chunk.length} rows to review`);
        onProgress?.(`chunk failed — continuing with the rest`);
        continue;
      }

      for (const result of parsed) {
        const txn = chunk[result.index];
        if (!txn) continue;
        const category = byName.get(result.category.trim().toLowerCase());
        if (!category) continue; // not in the user's set — leave for review
        txn.category_id = category.id;
        txn.category_name = category.name;
        txn.confidence = result.confidence;
        txn.status =
          result.confidence >= HIGH_CONFIDENCE ? "categorized" : "pending_review";
        if (txn.status === "categorized") auto++;
      }
      onProgress?.(
        `${Math.min(start + CHUNK_SIZE, pending.length)} of ${pending.length} transactions`
      );
    } catch (error) {
      // Same isolation on a thrown error: this chunk's rows fall back to
      // review, the remaining chunks still run, and the import never
      // fails on categorization.
      failures.push(
        error instanceof ApiError
          ? `${error.status}: ${error.message} — ${chunk.length} rows to review`
          : `${String(error)} — ${chunk.length} rows to review`
      );
      onProgress?.(`chunk failed — continuing with the rest`);
    }
  }

  if (failures.length > 0) {
    return { ok: false, message: failures.join(" · "), auto };
  }

  return { ok: true, auto };
}
