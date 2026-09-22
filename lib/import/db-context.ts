import type { Account, Category } from "@/lib/types";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "@/lib/defaults";

export interface DbContext {
  /** True when real database rows are visible — gates persistence. */
  dbReady: boolean;
  accounts: Account[];
  categories: Category[];
  /** User-learned rules (from corrections), applied before built-in rules. */
  rules: { pattern: string; categoryName: string }[];
  /** dedupe_keys already in the database, so overlapping statements skip. */
  existingKeys: Set<string>;
}

/**
 * Load what the import pipeline works against — accounts, categories,
 * learned rules, existing dedupe keys — from the database when it is
 * reachable and showing rows, otherwise from the starter lists (which
 * makes the run preview-only). LLM keys are never part of this context;
 * they stay in server-side env vars.
 */
export async function loadDbContext(): Promise<DbContext> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const [accounts, categories, rules, keys] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,type,institution,is_active")
        .eq("is_active", true)
        .order("name"),
      supabase.from("categories").select("id,name,color").order("sort_order"),
      supabase.from("categorization_rules").select("pattern,category_id"),
      supabase.from("transactions").select("dedupe_key").not("dedupe_key", "is", null),
    ]);
    if (accounts.error) throw accounts.error;

    const dbAccounts = (accounts.data ?? []) as Account[];
    const dbCategories: Category[] = (categories.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    }));
    const dbRules = (rules.data ?? [])
      .map((r) => ({
        pattern: String(r.pattern),
        categoryName:
          dbCategories.find((c) => c.id === r.category_id)?.name ?? "",
      }))
      .filter((r) => r.categoryName !== "");
    const dbKeys = new Set<string>(
      (keys.data ?? []).map((r) => String(r.dedupe_key))
    );

    if (dbAccounts.length === 0) {
      // Reachable but nothing visible — not signed in, or no accounts yet.
      // Run on the starter lists; nothing can be persisted.
      return {
        dbReady: false,
        accounts: DEFAULT_ACCOUNTS,
        categories: dbCategories.length > 0 ? dbCategories : DEFAULT_CATEGORIES,
        rules: dbRules,
        existingKeys: dbKeys,
      };
    }

    return {
      dbReady: true,
      accounts: dbAccounts,
      categories: dbCategories.length > 0 ? dbCategories : DEFAULT_CATEGORIES,
      rules: dbRules,
      existingKeys: dbKeys,
    };
  } catch {
    // Unreachable — preview-only run on the starter lists.
    return {
      dbReady: false,
      accounts: DEFAULT_ACCOUNTS,
      categories: DEFAULT_CATEGORIES,
      rules: [],
      existingKeys: new Set<string>(),
    };
  }
}
