"use client"

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient must only be called on the client")
  }
  if (!browserClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required")
    }
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  }
  return browserClient
}
