export interface TauriFetchResponse {
  status: number
  body: string
  headers: Record<string, string>
  durationMs: number
  encoding: string
  mocked?: boolean
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
}

export const isTauriAvailable = (): boolean => {
  if (typeof window === 'undefined') return false
  // Tauri v2 injecte __TAURI_INTERNALS__ (pas __TAURI__ par défaut)
  // On vérifie les deux pour être compatibles v1 et v2
  return !!window.__TAURI_INTERNALS__ || !!window.__TAURI__
}

export async function invokeTauriFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<TauriFetchResponse> {
  if (!isTauriAvailable()) {
    throw new Error("Tauri is not available in this environment")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  const result = await invoke<{
    status: number
    body: string
    headers: Array<[string, string]>
    durationMs: number
    encoding: string
    mocked?: boolean
  }>("fetch_proxy", {
    method,
    url,
    headers: Object.entries(headers),
    body,
  })

  return {
    status: result.status,
    body: result.body,
    headers: Object.fromEntries(result.headers ?? []),
    durationMs: result.durationMs,
    encoding: result.encoding ?? "utf8",
    mocked: result.mocked ?? false,
  }
}


