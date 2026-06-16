import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { EnvironmentVariable } from '@/hooks/use-request-store'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function interpolate(text: string, variables: EnvironmentVariable[]): string {
  if (!text) return text
  let result = text
  const enabledVars = variables.filter(v => v.enabled && v.key.trim() !== '')

  // Replace each {{KEY}} with the variable value
  enabledVars.forEach(v => {
    const regex = new RegExp(`\\{\\{\\s*${v.key}\\s*\\}\\}`, 'g')
    result = result.replace(regex, v.value)
  })

  return result
}

export function hasUnresolvedPlaceholders(text: string): boolean {
  return /\{\{\s*[^}]+\s*\}\}/.test(text)
}

export async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    const text = await response.text().catch(() => "")
    return {
      error: text || `Invalid JSON response from ${response.url || 'proxy'}`,
      status: response.status,
      statusText: response.statusText,
    }
  }
}

export function replaceLocalhostPort(url: string, port: number): string {
  if (!url) return url
  return url.replace(/\/\/localhost:\d+/, `//localhost:${port}`)
}

const COLLECTION_LOAD_KEY = "reqly-load-collection-request"

export interface PendingCollectionRequest {
  id?: string
  name: string
  method: string
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  queryParams?: Array<{ key: string; value: string }>
  sendImmediately?: boolean
  collectionId?: string
  background?: boolean
  requestIds?: string[]
}

export function setPendingCollectionRequest(request: PendingCollectionRequest) {
  try {
    localStorage.setItem(COLLECTION_LOAD_KEY, JSON.stringify(request))
  } catch {}
}

export function peekPendingCollectionRequest(): PendingCollectionRequest | null {
  try {
    const raw = localStorage.getItem(COLLECTION_LOAD_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function clearPendingCollectionRequest() {
  try {
    localStorage.removeItem(COLLECTION_LOAD_KEY)
  } catch {}
}

export function getAndClearPendingCollectionRequest(): PendingCollectionRequest | null {
  try {
    const raw = localStorage.getItem(COLLECTION_LOAD_KEY)
    if (raw) {
      localStorage.removeItem(COLLECTION_LOAD_KEY)
      return JSON.parse(raw)
    }
  } catch {}
  return null
}

export async function downloadJson(data: any, filename: string) {
  const content = JSON.stringify(data, null, 2)
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__

  if (isTauri) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      
      const filePath = await save({
        defaultPath: filename.endsWith('.json') ? filename : `${filename}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      
      if (filePath) {
        await writeTextFile(filePath, content)
      }
      return
    } catch (err) {
      console.error('Failed to save file using Tauri dialog', err)
      // fallback to browser approach if it fails
    }
  }

  const blob = new Blob([content], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
