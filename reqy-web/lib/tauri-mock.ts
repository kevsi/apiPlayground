import { isTauriAvailable } from "./tauri"
import type { MockRoute } from "./mock-types"

export async function reloadMockoonServer(
  routes: MockRoute[],
  port?: number,
): Promise<{ ok: true; baseUrl: string; pid: number } | { ok: false; error: string }> {
  const response = await fetch("/api/mockoon/reload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes, port }),
  })

  const data = (await response.json()) as { ok: boolean; baseUrl?: string; pid?: number; error?: string }
  if (response.ok && data.ok) {
    return { ok: true, baseUrl: data.baseUrl!, pid: data.pid! }
  }
  return { ok: false, error: data.error ?? "Unknown error" }
}

export async function getMockRoutes(): Promise<MockRoute[]> {
  if (!isTauriAvailable()) return []
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<MockRoute[]>("get_mock_routes")
}

export async function setMockRoutes(routes: MockRoute[]): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("set_mock_routes", { routes })
}

export async function addMockRoute(route: MockRoute): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("add_mock_route", { route })
}

export async function updateMockRoute(id: string, route: MockRoute): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("update_mock_route", { id, route })
}

export async function deleteMockRoute(id: string): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("delete_mock_route", { id })
}

export async function toggleMockEnabled(id: string): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("toggle_mock_enabled", { id })
}

export async function isMockEnabledGlobally(): Promise<boolean> {
  if (!isTauriAvailable()) return false
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<boolean>("is_mock_enabled_globally")
}

export async function setMockEnabledGlobally(enabled: boolean): Promise<void> {
  if (!isTauriAvailable()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("set_mock_enabled_globally", { enabled })
}
