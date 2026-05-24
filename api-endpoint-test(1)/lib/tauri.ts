export interface TauriFetchResponse {
  status: number
  body: string
  headers: Record<string, string>
  durationMs: number
  encoding: string
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
  }
}

export type TauriTabState = {
  id: string
  name: string
  method: string
  url: string
  endpoint: string
  headers?: Record<string, string>
  queryParams?: Array<{ key: string; value: string }>
  body?: string
  bodyType: string
  authType: string
  authToken: string
  hasResponse: boolean
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string
  responseHeaders?: Record<string, string>
}

export interface TauriStorageState {
  tabs: TauriTabState[]
  activeTabId: string
}

export async function loadTauriTabsState(): Promise<TauriStorageState | null> {
  if (!isTauriAvailable()) {
    return null
  }

  const { invoke } = await import("@tauri-apps/api/core")
  const result = await invoke<TauriStorageState | null>("load_tabs_state")
  return result
}

export async function saveTauriTabsState(state: TauriStorageState): Promise<void> {
  if (!isTauriAvailable()) {
    return
  }

  const { invoke } = await import("@tauri-apps/api/core")
  await invoke<void>("save_tabs_state", state as unknown as Record<string, unknown>)
}
