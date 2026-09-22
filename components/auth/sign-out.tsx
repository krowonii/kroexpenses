"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Sign-out control for the dashboard header. Renders nothing until there
 * is a session; signing out goes through Supabase and lands on /login.
 */
export function SignOut() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(Boolean(data.user)))
      .catch(() => {}); // unreachable session — stay hidden
  }, []);

  if (!signedIn) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        // Full navigation so the proxy sees the cleared session.
        window.location.assign("/login");
      }}
      className="text-[12.5px] text-text-faint hover:text-text whitespace-nowrap"
    >
      Sign out
    </button>
  );
}
