import { isTauriAvailable } from "./tauri"
import type { MockRoute } from "./mock-types"

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
