"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type AIProvider = "anthropic" | "openai" | "gemini" | "ollama"
export type AnalysisMode = "static" | "ai"

export interface DetectedRoute {
  name: string
  method: HttpMethod
  path: string
  headers: { key: string; value: string }[]
  body: string
  bodyType: "json" | "form" | "none"
  authRequired: boolean
  description: string
  sourceFile: string
}

export interface SavedProject {
  id: string
  name: string
  framework: string
  folderPath: string
  port?: number
  routes: DetectedRoute[]
  analyzedAt: string
  mode: AnalysisMode
}

const STORAGE_KEY = "probe_projects"
const API_KEYS_KEY = "probe_api_keys"

function load(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedProject[]) : []
  } catch {
    return []
  }
}

function save(projects: SavedProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch {}
}

export function loadApiKey(provider: AIProvider): string {
  try {
    const raw = localStorage.getItem(API_KEYS_KEY)
    if (!raw) return ""
    const keys = JSON.parse(raw) as Record<string, string>
    return keys[provider] ?? ""
  } catch {
    return ""
  }
}

export function saveApiKey(provider: AIProvider, key: string) {
  try {
    const raw = localStorage.getItem(API_KEYS_KEY)
    const keys: Record<string, string> = raw ? JSON.parse(raw) : {}
    keys[provider] = key
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys))
  } catch {}
}

export function useProjectsStore() {
  const [projects, setProjects] = useState<SavedProject[]>([])
  const ref = useRef<SavedProject[]>([])

  useEffect(() => {
    const loaded = load()
    ref.current = loaded
    setProjects(loaded)
  }, [])

  const commit = useCallback((next: SavedProject[]) => {
    ref.current = next
    save(next)
    setProjects(next)
  }, [])

  const addProject = useCallback(
    (p: SavedProject) => commit([...ref.current, p]),
    [commit]
  )

  const updateProject = useCallback(
    (id: string, updates: Partial<SavedProject>) =>
      commit(ref.current.map((p) => (p.id === id ? { ...p, ...updates } : p))),
    [commit]
  )

  const deleteProject = useCallback(
    (id: string) => commit(ref.current.filter((p) => p.id !== id)),
    [commit]
  )

  return { projects, addProject, updateProject, deleteProject }
}
