"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client on the signed-in person's session cookies, so storage
// uploads run under their own row-level security. Only the design editor uses
// it (plan PDFs go straight to storage instead of through a server action).
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
