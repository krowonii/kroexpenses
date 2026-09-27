import type { Account } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_TYPES = ["bank", "ewallet", "cash", "credit_card", "other"];

/**
 * Active user accounts from the database. Empty when the database is
 * unreachable or not signed in — the client falls back to the starter
 * list. Balances are NOT computed here — /api/balances owns that
 * (lib/balances is the single source of truth); this returns the
 * accounts with their opening-balance fields.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,type,institution,is_active,opening_balance,opening_balance_date")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;

    return Response.json({ accounts: (data ?? []) as Account[] });
  } catch {
    return Response.json({ accounts: [] });
  }
}

/**
 * Create an account: name + type, plus an optional opening balance and
 * the date it applies from. The opening balance is a signed account-level
 * value (a credit card can start owing money) — never an expense
 * transaction. The date is required when a balance is entered.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      institution?: string | null;
      openingBalance?: number | null;
      openingBalanceDate?: string | null;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ error: "A name is required" }, { status: 400 });
    }
    if (name.length > 60) {
      return Response.json({ error: "Name is too long (max 60)" }, { status: 400 });
    }
    if (!ACCOUNT_TYPES.includes(body.type ?? "")) {
      return Response.json({ error: "Pick an account type" }, { status: 400 });
    }
    const opening = parseOpening(body.openingBalance, body.openingBalanceDate);
    if (opening.error) {
      return Response.json({ error: opening.error }, { status: 400 });
    }

    const { createClient, getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    const insert: Record<string, unknown> = { user_id: userId, name, type: body.type };
    if (body.institution) insert.institution = body.institution;
    if (opening.balance !== null) {
      insert.opening_balance = opening.balance;
      insert.opening_balance_date = opening.date;
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert(insert)
      .select("id,name,type,institution,is_active,opening_balance,opening_balance_date")
      .limit(1);
    if (error) throw error;
    return Response.json({ account: (data?.[0] as Account) ?? null });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * Edit an account: `?id=<uuid>` with any of name, type, institution,
 * openingBalance, or openingBalanceDate. Only the fields sent change. An
 * opening balance of null clears it (the date goes with it — a date
 * alone means nothing); a number sets it, keeping the existing date when
 * none is sent; a date without a balance edits just the date of an
 * existing opening balance (400 when the account has none).
 */
export async function PATCH(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      institution?: string | null;
      openingBalance?: number | null;
      openingBalanceDate?: string | null;
    };
    if (!id) {
      return Response.json({ error: "Missing account id" }, { status: 400 });
    }

    const { createClient, getUserId } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const userId = await getUserId();

    // Read first — the existence check, and the opening date a
    // balance-only edit keeps.
    const { data: existing, error: readError } = await supabase
      .from("accounts")
      .select("id,opening_balance,opening_balance_date")
      .eq("id", id)
      .limit(1);
    if (readError) throw readError;
    if (!existing || existing.length === 0) {
      return Response.json({ error: "Unknown account" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return Response.json({ error: "A name is required" }, { status: 400 });
      }
      if (name.length > 60) {
        return Response.json({ error: "Name is too long (max 60)" }, { status: 400 });
      }
      updates.name = name;
    }
    if (body.type !== undefined) {
      if (!ACCOUNT_TYPES.includes(body.type)) {
        return Response.json({ error: "Unknown account type" }, { status: 400 });
      }
      updates.type = body.type;
    }
    if (body.institution !== undefined) updates.institution = body.institution;

    if (body.openingBalance !== undefined) {
      if (body.openingBalance === null) {
        // Explicit clear — the date goes with it.
        updates.opening_balance = null;
        updates.opening_balance_date = null;
      } else if (typeof body.openingBalance === "number" && Number.isFinite(body.openingBalance)) {
        updates.opening_balance = Math.round(body.openingBalance * 100) / 100;
        if (typeof body.openingBalanceDate === "string" && ISO_DATE.test(body.openingBalanceDate)) {
          updates.opening_balance_date = body.openingBalanceDate;
        } else if (!existing[0].opening_balance_date) {
          return Response.json(
            { error: "An opening-balance date is required with a balance" },
            { status: 400 }
          );
        }
        // else: the existing date stays.
      } else {
        return Response.json({ error: "Opening balance must be a valid amount" }, { status: 400 });
      }
    } else if (body.openingBalanceDate !== undefined) {
      // A date alone only applies to an existing opening balance.
      if (existing[0].opening_balance === null || existing[0].opening_balance === undefined) {
        return Response.json(
          { error: "Set an opening balance first — a date alone doesn't apply" },
          { status: 400 }
        );
      }
      if (typeof body.openingBalanceDate !== "string" || !ISO_DATE.test(body.openingBalanceDate)) {
        return Response.json({ error: "Invalid opening-balance date" }, { status: 400 });
      }
      updates.opening_balance_date = body.openingBalanceDate;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id,name,type,institution,is_active,opening_balance,opening_balance_date")
      .limit(1);
    if (error) throw error;
    return Response.json({ account: (data?.[0] as Account) ?? null });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/** Validate an optional opening balance + its date. Returns the parsed
 *  pair (balance null = not set) or an error message. Decimal-safe: the
 *  value rounds to 2 decimals, NaN/Infinity rejected. */
function parseOpening(
  balance: number | null | undefined,
  date: string | null | undefined
): { balance: number | null; date: string | null; error: string | null } {
  if (balance === undefined || balance === null) {
    return { balance: null, date: null, error: null };
  }
  if (typeof balance !== "number" || !Number.isFinite(balance)) {
    return { balance: null, date: null, error: "Opening balance must be a valid amount" };
  }
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    return {
      balance: null,
      date: null,
      error: "An opening-balance date is required with a balance",
    };
  }
  return { balance: Math.round(balance * 100) / 100, date, error: null };
}

/** Unwrap an error into a readable message — Supabase returns PostgREST
 *  error objects (not Error instances), so instanceof misses them. */
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
