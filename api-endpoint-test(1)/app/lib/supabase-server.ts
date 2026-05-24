import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function missingEnvError() {
  return new Error("Les variables d'environnement Supabase sont requises : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase: any = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : new Proxy({}, { get() { throw missingEnvError() } })

export function createSupabaseClientWithToken(accessToken?: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw missingEnvError()
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  // Supabase JS v2 removed setAuth(); keep compatibility with a narrow cast.
  if (accessToken) (client as any).auth?.setAuth?.(accessToken)
  return client
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
