"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface RequestItem {
  id: string
  name: string
  method: HttpMethod
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  queryParams?: Array<{ key: string; value: string }>
  createdAt: number
  updatedAt: number
}

export interface HistoryItem extends RequestItem {
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  executedAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  requests: RequestItem[]
  createdAt: number
  updatedAt: number
}

export interface EnvironmentVariable {
  key: string
  value: string
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  color: string
  variables: EnvironmentVariable[]
  createdAt: number
  updatedAt: number
}

import type { DetectedRoute, SavedProject } from '@/types'

interface RequestStore {
  history: HistoryItem[]
  collections: Collection[]
  environments: Environment[]
  activeEnvironmentId: string | null
  projects: SavedProject[]
  selectedProjectId: string | null
}

const STORAGE_KEY = "zendeeps-request-store"

const defaultEnvironments: Environment[] = [
  {
    id: "env-global",
    name: "Global",
    color: "slate",
    variables: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const initialStore: RequestStore = {
  history: [],
  collections: [],
  environments: defaultEnvironments,
  activeEnvironmentId: "env-global",
  projects: [],
  selectedProjectId: null,
}

function loadFromStorage(): RequestStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return loadFallback()
    const parsed = JSON.parse(stored)
    return {
      history: parsed.history || [],
      collections: parsed.collections || [],
      environments: parsed.environments || defaultEnvironments,
      activeEnvironmentId:
        parsed.activeEnvironmentId !== undefined
          ? parsed.activeEnvironmentId
          : "env-global",
      projects: parsed.projects || [],
      selectedProjectId: parsed.selectedProjectId ?? null,
    }
  } catch {
    return loadFallback()
  }
}

/** Fallback : si la clé principale n'existe pas, on tente la migration depuis l'ancienne clé */
function loadFallback(): RequestStore {
  try {
    const legacy = localStorage.getItem("probe_projects")
    const fallbackProjects: SavedProject[] = legacy ? JSON.parse(legacy) : []
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      activeEnvironmentId: "env-global",
      projects: fallbackProjects,
      selectedProjectId: null,
    }
  } catch {
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      activeEnvironmentId: "env-global",
      projects: [],
      selectedProjectId: null,
    }
  }
}

function saveToStorage(store: RequestStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

export function useRequestStore() {
  const [store, setStore] = useState<RequestStore>(initialStore)
  const [isLoaded, setIsLoaded] = useState(false)
  // Keep a ref always in sync so mutations can read latest state synchronously
  const storeRef = useRef<RequestStore>(initialStore)

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadFromStorage()
    storeRef.current = loaded
    setStore(loaded)
    setIsLoaded(true)
  }, [])

  // Helper: apply an update, save synchronously, and schedule a React re-render
  const commit = useCallback((updater: (prev: RequestStore) => RequestStore) => {
    const next = updater(storeRef.current)
    storeRef.current = next
    saveToStorage(next)   // ← synchronous write, survives immediate navigation
    setStore(next)        // ← triggers re-render
  }, [])

  // ── History ───────────────────────────────────────────────────────────────

  const addToHistory = useCallback(
    (item: Omit<HistoryItem, "id" | "executedAt" | "createdAt" | "updatedAt">) => {
      commit((prev) => ({
        ...prev,
        history: [
          {
            ...item,
            id: `hist-${Date.now()}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            executedAt: Date.now(),
          },
          ...prev.history,
        ].slice(0, 100),
      }))
    },
    [commit]
  )

  const clearHistory = useCallback(() => {
    commit((prev) => ({ ...prev, history: [] }))
  }, [commit])

  const removeFromHistory = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        history: prev.history.filter((h) => h.id !== id),
      }))
    },
    [commit]
  )

  // ── Collections ───────────────────────────────────────────────────────────

  const addCollection = useCallback(
    (collection: Omit<Collection, "id" | "createdAt" | "updatedAt" | "requests">) => {
      const newCollection: Collection = {
        ...collection,
        id: `col-${Date.now()}`,
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: [...prev.collections, newCollection],
      }))
      return newCollection.id
    },
    [commit]
  )

  const updateCollection = useCallback(
    (id: string, updates: Partial<Collection>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
        ),
      }))
    },
    [commit]
  )

  const deleteCollection = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.filter((c) => c.id !== id),
      }))
    },
    [commit]
  )

  const addRequestToCollection = useCallback(
    (
      collectionId: string,
      request: Omit<RequestItem, "id" | "createdAt" | "updatedAt">
    ) => {
      const newRequest: RequestItem = {
        ...request,
        id: `req-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? { ...c, requests: [...c.requests, newRequest], updatedAt: Date.now() }
            : c
        ),
      }))
    },
    [commit]
  )

  const removeRequestFromCollection = useCallback(
    (collectionId: string, requestId: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.filter((r) => r.id !== requestId),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const updateRequestInCollection = useCallback(
    (collectionId: string, requestId: string, updates: Partial<RequestItem>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.map((r) =>
                  r.id === requestId ? { ...r, ...updates, updatedAt: Date.now() } : r
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  // ── Projects ────────────────────────────────────────────────────────────

  const addProject = useCallback(
    (project: Omit<SavedProject, "id">) => {
      commit((prev) => ({
        ...prev,
        projects: [
          {
            ...project,
            id: `proj-${Date.now()}`,
          },
          ...prev.projects,
        ],
      }))
    },
    [commit]
  )

  const deleteProject = useCallback(
    (projectId: string) => {
      commit((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== projectId),
      }))
    },
    [commit]
  )

  const updateProject = useCallback(
    (projectId: string, updates: Partial<SavedProject>) => {
      commit((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      }))
    },
    [commit]
  )

  const setSelectedProject = useCallback(
    (projectId: string | null) => {
      commit((prev) => ({ ...prev, selectedProjectId: projectId }))
    },
    [commit]
  )

  // ── Environments ──────────────────────────────────────────────────────────

  const addEnvironment = useCallback(
    (env: Omit<Environment, "id" | "createdAt" | "updatedAt">) => {
      const newEnv: Environment = {
        ...env,
        id: `env-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        environments: [...prev.environments, newEnv],
      }))
      return newEnv.id
    },
    [commit]
  )

  const updateEnvironment = useCallback(
    (id: string, updates: Partial<Environment>) => {
      commit((prev) => ({
        ...prev,
        environments: prev.environments.map((e) =>
          e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
        ),
      }))
    },
    [commit]
  )

  const deleteEnvironment = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        environments: prev.environments.filter((e) => e.id !== id),
        activeEnvironmentId:
          prev.activeEnvironmentId === id ? null : prev.activeEnvironmentId,
      }))
    },
    [commit]
  )

  const setActiveEnvironment = useCallback(
    (id: string | null) => {
      commit((prev) => ({ ...prev, activeEnvironmentId: id }))
    },
    [commit]
  )

  return {
    history: store.history,
    collections: store.collections,
    environments: store.environments,
    activeEnvironmentId: store.activeEnvironmentId,
    projects: store.projects,
    selectedProjectId: store.selectedProjectId,
    isLoaded,
    addToHistory,
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestInCollection,
    addProject,
    updateProject,
    deleteProject,
    setSelectedProject,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
  }
}
