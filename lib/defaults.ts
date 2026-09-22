import type { Account, Category } from "@/lib/types";

/**
 * Starter account list used while Supabase is not connected. Once the
 * database is live, accounts come from the `accounts` table and this list
 * only seeds it (see the /accounts screen).
 */
export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acct-bdo", name: "BDO Savings", type: "bank", institution: "BDO", is_active: true },
  { id: "acct-gcash", name: "GCash", type: "ewallet", institution: "GCash", is_active: true },
  { id: "acct-cash", name: "Cash", type: "cash", institution: null, is_active: true },
  { id: "acct-cc", name: "Credit Card", type: "credit_card", institution: null, is_active: true },
  { id: "acct-other", name: "Other Bank", type: "other", institution: null, is_active: true },
];

/**
 * Fallback taxonomy for the categorization pipeline while Supabase is not
 * connected. With the database live, the user's own categories take over
 * (AI categorization always works against that set).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-food", name: "Food" },
  { id: "cat-shopping", name: "Shopping" },
  { id: "cat-bills", name: "Bills" },
  { id: "cat-transport", name: "Transportation" },
  { id: "cat-entertainment", name: "Entertainment" },
  { id: "cat-other", name: "Other" },
];
