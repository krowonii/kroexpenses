"use client";

import { useSyncExternalStore } from "react";
import type { Account, Category } from "@/lib/types";

/**
 * Shared client-side store for the small, frequently reused data every
 * screen needs — the user's categories and accounts. Preloaded once when
 * the app boots, cached in localStorage (stale-while-revalidate), and
 * updated in place on mutations; Supabase stays the source of truth.
 *
 * Transaction history is deliberately NOT here — it stays paginated and
 * query-based per screen (too large to preload).
 */

interface AppState {
  categories: Category[];
  accounts: Account[];
  /** At least one successful fetch from the API. */
  ready: boolean;
  /** The last fetch attempt failed (offline / not signed in). */
  failed: boolean;
  /** When the data was last fetched from the API (0 = never). */
  fetchedAt: number;
}

let state: AppState = {
  categories: [],
  accounts: [],
  ready: false,
  failed: false,
  fetchedAt: 0,
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => state;

/**
 * Components read the shared state through this hook and re-render when
 * it changes. The server snapshot matches the initial module state, so
 * SSR and hydration render together before any fetch lands.
 */
export function useAppData(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const CACHE_KEY = "app-data-cache-v1";

/** Read the localStorage cache into the store — runs before the first
 *  fetch so a repeat visit renders with data immediately. Private mode /
 *  blocked storage just skips it. */
function hydrate() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { categories?: Category[]; accounts?: Account[] };
    if (Array.isArray(parsed.categories) || Array.isArray(parsed.accounts)) {
      set({
        categories: parsed.categories ?? [],
        accounts: parsed.accounts ?? [],
      });
    }
  } catch {
    // Corrupt or blocked cache — the fetch below is the real source.
  }
}

function persist() {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ categories: state.categories, accounts: state.accounts })
    );
  } catch {
    // Private mode / storage blocked — the store still holds the data.
  }
}

async function fetchOnce() {
  try {
    const [catsRes, acctsRes] = await Promise.all([
      fetch("/api/categories").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/accounts").then((res) => (res.ok ? res.json() : null)),
    ]);
    if (!catsRes || !acctsRes) {
      set({ failed: true });
      return;
    }
    set({
      categories: (catsRes.categories ?? []) as Category[],
      accounts: (acctsRes.accounts ?? []) as Account[],
      ready: true,
      failed: false,
      fetchedAt: Date.now(),
    });
    persist();
  } catch {
    set({ failed: true });
  }
}

let inflight: Promise<void> | null = null;

function request() {
  if (!inflight) {
    inflight = fetchOnce().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Boot load: hydrate the cache, then fetch fresh data — but only when
 *  nothing has been fetched yet, so repeat calls (navigations) are free. */
export function preloadAppData() {
  if (state.fetchedAt > 0) return;
  hydrate();
  void request();
}

const STALE_MS = 60_000;

/** Background refresh when the cached data is older than a minute — a
 *  no-op while it's fresh, so navigating between screens costs nothing;
 *  covers staleness from another tab or device. */
export function refreshIfStale() {
  if (state.fetchedAt > 0 && Date.now() - state.fetchedAt >= STALE_MS) void request();
}

/** Mutations: the caller writes to Supabase, then hands the new list here
 *  so the shared store and the browser cache update in place. */
export function storeCategories(next: Category[]) {
  set({ categories: next, ready: true, failed: false });
  persist();
}

export function storeAccounts(next: Account[]) {
  set({ accounts: next, ready: true, failed: false });
  persist();
}

/** Clear the cache and the in-memory store — sign-out calls this so a
 *  shared browser never shows one user's categories to the next. */
export function clearAppData() {
  state = { categories: [], accounts: [], ready: false, failed: false, fetchedAt: 0 };
  for (const listener of listeners) listener();
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked — nothing to remove.
  }
}
