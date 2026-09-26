"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { preloadAppData, refreshIfStale } from "@/lib/app-data";

/**
 * Preloads the shared app data (categories + accounts) once per page
 * load and background-refreshes it when stale on navigation — the small,
 * stable data every screen reads, so screens render from the store
 * instead of fetching their own. Renders nothing.
 */
export function AppDataInit() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/login") return;
    void preloadAppData();
    refreshIfStale();
  }, [pathname]);
  return null;
}
