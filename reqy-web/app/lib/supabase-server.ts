import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function missingEnvError() {
  return new Error("Les variables d'environnement Supabase sont requises : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

let _supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    } else {
      throw missingEnvError()
    }
  }
  return _supabaseClient
}

// Legacy export kept for backward compat — calls the lazy getter
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient]
  },
})

export function createSupabaseClientWithToken(accessToken?: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw missingEnvError()
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

export function createSupabaseServiceClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant")
  }
  if (!SUPABASE_URL) throw missingEnvError()

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
