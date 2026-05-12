"use client"

import { useState, useEffect, useCallback } from "react"

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

export interface Environment {
  id: string
  name: string
  variables: Record<string, string>
  isActive: boolean
  createdAt: number
  updatedAt: number
}

interface RequestStore {
  history: HistoryItem[]
  collections: Collection[]
  environments: Environment[]
}

const STORAGE_KEY = "zendeeps-request-store"

const defaultCollections: Collection[] = [
  {
    id: "auth",
    name: "Authentication",
    description: "User authentication endpoints",
    color: "emerald",
    icon: "lock",
    requests: [
      {
        id: "auth-login",
        name: "Login",
        method: "POST",
        url: "https://api.example.com/api/v1/auth/login",
        endpoint: "/api/v1/auth/login",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "auth-register",
        name: "Register",
        method: "POST",
        url: "https://api.example.com/api/v1/auth/register",
        endpoint: "/api/v1/auth/register",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "auth-logout",
        name: "Logout",
        method: "POST",
        url: "https://api.example.com/api/v1/auth/logout",
        endpoint: "/api/v1/auth/logout",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "users",
    name: "Users",
    description: "User management endpoints",
    color: "blue",
    icon: "users",
    requests: [
      {
        id: "users-list",
        name: "List Users",
        method: "GET",
        url: "https://api.example.com/api/v1/users",
        endpoint: "/api/v1/users",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "users-get",
        name: "Get User",
        method: "GET",
        url: "https://api.example.com/api/v1/users/:id",
        endpoint: "/api/v1/users/:id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "users-update",
        name: "Update User",
        method: "PUT",
        url: "https://api.example.com/api/v1/users/:id",
        endpoint: "/api/v1/users/:id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "users-delete",
        name: "Delete User",
        method: "DELETE",
        url: "https://api.example.com/api/v1/users/:id",
        endpoint: "/api/v1/users/:id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "products",
    name: "Products",
    description: "Product catalog endpoints",
    color: "amber",
    icon: "package",
    requests: [
      {
        id: "products-list",
        name: "List Products",
        method: "GET",
        url: "https://api.example.com/api/v1/products",
        endpoint: "/api/v1/products",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "products-create",
        name: "Create Product",
        method: "POST",
        url: "https://api.example.com/api/v1/products",
        endpoint: "/api/v1/products",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const defaultEnvironments: Environment[] = [
  {
    id: "dev",
    name: "Development",
    variables: {
      baseUrl: "https://api-dev.example.com",
      token: "dev_token_123",
      apiKey: "dev_key_456",
    },
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "staging",
    name: "Staging",
    variables: {
      baseUrl: "https://api-staging.example.com",
      token: "staging_token_123",
      apiKey: "staging_key_456",
    },
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prod",
    name: "Production",
    variables: {
      baseUrl: "https://api.example.com",
      token: "prod_token_123",
      apiKey: "prod_key_456",
    },
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const defaultHistory: HistoryItem[] = [
  {
    id: "hist-1",
    name: "Login",
    method: "POST",
    url: "https://api.example.com/api/v1/auth/login",
    endpoint: "/api/v1/auth/login",
    responseStatus: 200,
    responseTime: 124,
    responseSize: "2.3 KB",
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
    executedAt: Date.now() - 3600000,
  },
  {
    id: "hist-2",
    name: "List Users",
    method: "GET",
    url: "https://api.example.com/api/v1/users",
    endpoint: "/api/v1/users",
    responseStatus: 200,
    responseTime: 89,
    responseSize: "15.7 KB",
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
    executedAt: Date.now() - 7200000,
  },
  {
    id: "hist-3",
    name: "Create Product",
    method: "POST",
    url: "https://api.example.com/api/v1/products",
    endpoint: "/api/v1/products",
    responseStatus: 201,
    responseTime: 234,
    responseSize: "1.1 KB",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    executedAt: Date.now() - 86400000,
  },
  {
    id: "hist-4",
    name: "Delete User",
    method: "DELETE",
    url: "https://api.example.com/api/v1/users/123",
    endpoint: "/api/v1/users/123",
    responseStatus: 404,
    responseTime: 45,
    responseSize: "0.2 KB",
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    executedAt: Date.now() - 172800000,
  },
]

export function useRequestStore() {
  const [store, setStore] = useState<RequestStore>({
    history: [],
    collections: [],
    environments: [],
  })
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setStore(JSON.parse(stored))
      } catch {
        setStore({ history: defaultHistory, collections: defaultCollections, environments: defaultEnvironments })
      }
    } else {
      setStore({ history: defaultHistory, collections: defaultCollections, environments: defaultEnvironments })
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  }, [store, isLoaded])

  const addToHistory = useCallback((item: Omit<HistoryItem, "id" | "executedAt" | "createdAt" | "updatedAt">) => {
    const newItem: HistoryItem = {
      ...item,
      id: `hist-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      executedAt: Date.now(),
    }
    setStore((prev) => ({
      ...prev,
      history: [newItem, ...prev.history].slice(0, 100), // Keep last 100
    }))
  }, [])

  const clearHistory = useCallback(() => {
    setStore((prev) => ({ ...prev, history: [] }))
  }, [])

  const removeFromHistory = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== id),
    }))
  }, [])

  const addCollection = useCallback((collection: Omit<Collection, "id" | "createdAt" | "updatedAt" | "requests">) => {
    const newCollection: Collection = {
      ...collection,
      id: `col-${Date.now()}`,
      requests: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setStore((prev) => ({
      ...prev,
      collections: [...prev.collections, newCollection],
    }))
    return newCollection.id
  }, [])

  const updateCollection = useCallback((id: string, updates: Partial<Collection>) => {
    setStore((prev) => ({
      ...prev,
      collections: prev.collections.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
      ),
    }))
  }, [])

  const deleteCollection = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      collections: prev.collections.filter((c) => c.id !== id),
    }))
  }, [])

  const addRequestToCollection = useCallback(
    (collectionId: string, request: Omit<RequestItem, "id" | "createdAt" | "updatedAt">) => {
      const newRequest: RequestItem = {
        ...request,
        id: `req-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setStore((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? { ...c, requests: [...c.requests, newRequest], updatedAt: Date.now() }
            : c
        ),
      }))
    },
    []
  )

  const removeRequestFromCollection = useCallback((collectionId: string, requestId: string) => {
    setStore((prev) => ({
      ...prev,
      collections: prev.collections.map((c) =>
        c.id === collectionId
          ? { ...c, requests: c.requests.filter((r) => r.id !== requestId), updatedAt: Date.now() }
          : c
      ),
    }))
  }, [])

  const addEnvironment = useCallback((environment: Omit<Environment, "id" | "createdAt" | "updatedAt">) => {
    const newEnvironment: Environment = {
      ...environment,
      id: `env-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setStore((prev) => ({
      ...prev,
      environments: [...prev.environments, newEnvironment],
    }))
    return newEnvironment.id
  }, [])

  const updateEnvironment = useCallback((id: string, updates: Partial<Environment>) => {
    setStore((prev) => ({
      ...prev,
      environments: prev.environments.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
      ),
    }))
  }, [])

  const deleteEnvironment = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      environments: prev.environments.filter((e) => e.id !== id),
    }))
  }, [])

  const setActiveEnvironment = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      environments: prev.environments.map((e) => ({
        ...e,
        isActive: e.id === id,
      })),
    }))
  }, [])

  const getActiveEnvironment = useCallback(() => {
    return store.environments.find((e) => e.isActive)
  }, [store.environments])

  return {
    history: store.history,
    collections: store.collections,
    environments: store.environments,
    isLoaded,
    addToHistory,
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
    getActiveEnvironment,
  }
}
