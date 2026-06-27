# Postman Full Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Postman integration fully usable: DRY `postmanFetch()` helper, `PostmanManageModal` (list + import + disconnect), `PostmanImportModal` (preview + confirm), persistence to local store.

**Architecture:** New `lib/postman-api.ts` helper used by all Postman routes. New `PostmanManageModal` + `PostmanImportModal` UI components. New `/api/postman-import/save` endpoint for persistence.

**Tech Stack:** Next.js 15, React 19, TypeScript, shadcn/ui, native `fetch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-postman-full-integration-design.md`

---

## Task 1: `lib/postman-api.ts` helper + tests (TDD)

**Files:**
- Create: `reqy-web/lib/postman-api.ts`
- Create: `reqy-web/lib/__tests__/postman-api.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `reqy-web/lib/__tests__/postman-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { postmanFetch, postmanFetchJson, PostmanApiError } from "@/lib/postman-api"

describe("postmanFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("targets api.postman.com domain", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)
    global.fetch = fetchMock
    await postmanFetch("PMAK-test", "/me")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postman.com/me",
      expect.any(Object)
    )
  })

  it("adds X-API-Key, Accept v10, User-Agent headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)
    global.fetch = fetchMock
    await postmanFetch("PMAK-my-key", "/collections")
    const callArgs = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(callArgs.headers["X-API-Key"]).toBe("PMAK-my-key")
    expect(callArgs.headers["Accept"]).toBe("application/vnd.api.v10+json")
    expect(callArgs.headers["User-Agent"]).toBeDefined()
  })

  it("merges custom headers from options", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)
    global.fetch = fetchMock
    await postmanFetch("PMAK-x", "/x", {
      headers: { "Content-Type": "application/json" },
    })
    const callArgs = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(callArgs.headers["Content-Type"]).toBe("application/json")
    expect(callArgs.headers["X-API-Key"]).toBe("PMAK-x")
  })

  it("passes an AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)
    global.fetch = fetchMock
    await postmanFetch("PMAK-x", "/x")
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe("postmanFetchJson", () => {
  it("returns parsed JSON on 200", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { username: "alice" } }),
    } as Response)
    const data = await postmanFetchJson<any>("PMAK-x", "/me")
    expect(data).toEqual({ user: { username: "alice" } })
  })

  it("throws PostmanApiError with status on 401", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: "Invalid API Key" } }),
    } as Response)
    await expect(postmanFetchJson("PMAK-bad", "/me")).rejects.toThrow(PostmanApiError)
    await expect(postmanFetchJson("PMAK-bad", "/me")).rejects.toThrow(/Invalid API Key/)
  })

  it("throws PostmanApiError with status on 500 with generic message", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as Response)
    await expect(postmanFetchJson("PMAK-x", "/x")).rejects.toThrow(/HTTP 500/)
  })
})
```

- [ ] **Step 1.2: Run, verify failure**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/postman-api.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement `lib/postman-api.ts`**

Create `reqy-web/lib/postman-api.ts`:

```ts
const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export class PostmanApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "PostmanApiError"
  }
}

export async function postmanFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${POSTMAN_API_BASE}${path}`, {
      ...options,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/vnd.api.v10+json",
        "User-Agent": "Reqly/1.0",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function postmanFetchJson<T = unknown>(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await postmanFetch(apiKey, path, options)
  if (!res.ok) {
    let msg = ""
    try {
      const body = await res.json()
      msg = body?.error?.message ?? body?.message ?? ""
    } catch {
      /* body not JSON */
    }
    throw new PostmanApiError(res.status, msg || `Erreur Postman (HTTP ${res.status})`)
  }
  return res.json()
}
```

- [ ] **Step 1.4: Run, verify pass**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/postman-api.test.ts
```
Expected: PASS (7 cases).

- [ ] **Step 1.5: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/lib/postman-api.ts reqy-web/lib/__tests__/postman-api.test.ts && git -c commit.gpgsign=false commit -m "feat(postman): add postmanFetch() helper with v10+domain headers + tests"
```

---

## Task 2: Refactor `lib/postman.ts` to use `postmanFetch`

**Files:**
- Modify: `reqy-web/lib/postman.ts`

- [ ] **Step 2.1: Overwrite with refactored version**

Overwrite `reqy-web/lib/postman.ts`:

```ts
export { PostmanApiError } from "./postman-api"
import { postmanFetch, postmanFetchJson, PostmanApiError } from "./postman-api"

export interface PostmanUser {
  username: string
  email?: string
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser> {
  try {
    const data = await postmanFetchJson<any>(apiKey, "/me")
    return {
      username: data.user?.username ?? data.username ?? "unknown",
      email: data.user?.email ?? data.email,
    }
  } catch (err) {
    if (err instanceof PostmanApiError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new PostmanApiError(0, "Timeout : Postman n'a pas répondu en 10s")
    }
    throw new PostmanApiError(0, "Erreur réseau, réessayez")
  }
}

// Re-export for convenience
export { postmanFetch, postmanFetchJson }
```

- [ ] **Step 2.2: Run existing tests, verify they still pass**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/postman.test.ts
```
Expected: PASS (10 cases — same as before).

- [ ] **Step 2.3: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/lib/postman.ts && git -c commit.gpgsign=false commit -m "refactor(postman): validatePostmanApiKey uses postmanFetch() helper"
```

---

## Task 3: Refactor `/api/postman-auth/collections` to use `postmanFetch`

**Files:**
- Modify: `reqy-web/app/api/postman-auth/collections/route.ts`

- [ ] **Step 3.1: Read current file and identify lines to change**

Current file uses `api.getpostman.com` (old domain). Read and note the fetch lines.

- [ ] **Step 3.2: Edit the file**

Replace all occurrences of `fetch(...)` with calls to `postmanFetch(apiKey, ...)`. Replace `https://api.getpostman.com` references. Use `postmanFetchJson()` for endpoints that return JSON.

Replace the entire file content with:

```ts
import { NextRequest, NextResponse } from "next/server"
import { postmanFetchJson } from "@/lib/postman-api"

async function fetchCollectionDetails(apiKey: string, collectionId: string) {
  try {
    return await postmanFetchJson<any>(apiKey, `/collections/${collectionId}`)
  } catch {
    return null
  }
}

function countCollectionItems(collection: any): number {
  if (!collection) return 0
  const countItems = (items: any[]): number => {
    if (!Array.isArray(items)) return 0
    return items.reduce((total, item) => {
      if (item.request) return total + 1
      if (item.item) return total + countItems(item.item)
      return total
    }, 0)
  }
  if (Array.isArray(collection.item)) {
    const nestedCount = countItems(collection.item)
    if (nestedCount > 0) return nestedCount
    return collection.item.length
  }
  if (collection.summary?.totalRequests != null) return collection.summary.totalRequests
  if (collection.summary?.requestCount != null) return collection.summary.requestCount
  if (collection.requestCount != null) return collection.requestCount
  if (collection.totalRequests != null) return collection.totalRequests
  return 0
}

export async function GET(request: NextRequest) {
  const apiKey = request.cookies.get("postman_api_key")?.value
  if (!apiKey) {
    return NextResponse.json({ message: "Non connecté à Postman" }, { status: 401 })
  }

  try {
    const data = await postmanFetchJson<any>(apiKey, "/collections")
    const collections = await Promise.all(
      (data.collections || []).map(async (col: any) => {
        const id = col.uid || col.id
        let count = countCollectionItems(col)
        if (count === 0 && id) {
          const detailData = await fetchCollectionDetails(apiKey, id)
          count = countCollectionItems(detailData?.collection)
        }
        return { id, name: col.name, requests: count, items: count }
      })
    )
    return NextResponse.json({ collections })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erreur lors de la récupération des collections" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3.3: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-auth/collections/route.ts && git -c commit.gpgsign=false commit -m "refactor(postman): collections route uses postmanFetch() (v10 + correct domain)"
```

---

## Task 4: Refactor `/api/postman-import` to use `postmanFetch`

**Files:**
- Modify: `reqy-web/app/api/postman-import/route.ts`

- [ ] **Step 4.1: Edit the file**

Replace the `fetch(...)` call to use `postmanFetch(apiKey, ...)`. Find:

```ts
const response = await fetch(
  `${POSTMAN_API_BASE}/collections/${collectionId}`,
  {
    headers: {
      "X-Api-Key": apiKey,
    },
  }
)
```

Replace with:

```ts
const response = await postmanFetch(apiKey, `/collections/${collectionId}`)
```

Remove the now-unused `const POSTMAN_API_BASE = "https://api.getpostman.com"` constant.

Add at top:
```ts
import { postmanFetch } from "@/lib/postman-api"
```

- [ ] **Step 4.2: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep postman-import
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-import/route.ts && git -c commit.gpgsign=false commit -m "refactor(postman): import route uses postmanFetch()"
```

---

## Task 5: Explore `use-request-store.ts` for storage format

**Files:**
- Read: `reqy-web/hooks/use-request-store.ts` (just to inspect, no edit)

- [ ] **Step 5.1: Read the store**

```bash
grep -n "persist\|setItem\|localStorage\|workspace\|collection" /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/hooks/use-request-store.ts | head -30
```

Note the types/exports for collections and routes. Use this info in Task 6.

---

## Task 6: Create `/api/postman-import/save` route

**Files:**
- Create: `reqy-web/app/api/postman-import/save/route.ts`

- [ ] **Step 6.1: Create the route**

Create `reqy-web/app/api/postman-import/save/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { postmanFetch, PostmanApiError } from "@/lib/postman-api"
import { persistence } from "@/lib/persistence"
import { randomUUID } from "crypto"

interface ImportedRoute {
  method: string
  path: string
  name: string
  description?: string
  sourceFile?: string
}

interface SavedCollection {
  id: string
  name: string
  framework: string
  language: string
  routes: ImportedRoute[]
  metadata: Record<string, unknown>
  createdAt: string
}

const COLLECTIONS_KEY = "reqly_postman_imports"

function extractRequests(items: any[], parentPath = ""): ImportedRoute[] {
  if (!items) return []
  const out: ImportedRoute[] = []
  for (const item of items) {
    if (item.item) {
      const folder = item.name || "Folder"
      out.push(...extractRequests(item.item, parentPath ? `${parentPath}/${folder}` : folder))
    } else if (item.request) {
      const method = item.request.method || "GET"
      const url = typeof item.request.url === "string"
        ? item.request.url
        : item.request.url?.raw || ""
      let path = url
      try {
        const u = new URL(url)
        path = u.pathname || "/"
      } catch {
        if (!url.startsWith("/")) path = "/" + url
      }
      out.push({
        method: method.toUpperCase(),
        path,
        name: item.name || method,
        description: item.request.description || "",
        sourceFile: `postman:${item.name}`,
      })
    }
  }
  return out
}

export async function POST(request: NextRequest) {
  const apiKey = request.cookies.get("postman_api_key")?.value
  if (!apiKey) {
    return NextResponse.json({ message: "Non connecté à Postman" }, { status: 401 })
  }

  let body: { collectionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Body JSON invalide" }, { status: 400 })
  }

  const collectionId = body.collectionId?.trim()
  if (!collectionId) {
    return NextResponse.json({ message: "collectionId requis" }, { status: 400 })
  }

  try {
    const res = await postmanFetch(apiKey, `/collections/${collectionId}`)
    if (!res.ok) {
      return NextResponse.json({ message: "Collection Postman non trouvée" }, { status: res.status })
    }
    const data = await res.json()
    const collection = data.collection

    const routes = extractRequests(collection.item || [])
    const newCollection: SavedCollection = {
      id: randomUUID(),
      name: collection.info?.name || "Postman Collection",
      framework: "postman",
      language: "postman",
      routes,
      metadata: { postmanId: collectionId, description: collection.info?.description || "" },
      createdAt: new Date().toISOString(),
    }

    const existing = persistence.getItem<SavedCollection[]>(COLLECTIONS_KEY) ?? []
    persistence.setItem(COLLECTIONS_KEY, [...existing, newCollection])

    return NextResponse.json({
      reqlyCollectionId: newCollection.id,
      routeCount: routes.length,
      name: newCollection.name,
    })
  } catch (err) {
    if (err instanceof PostmanApiError) {
      return NextResponse.json({ message: err.message }, { status: 400 })
    }
    return NextResponse.json({ message: "Erreur lors de la sauvegarde" }, { status: 500 })
  }
}
```

- [ ] **Step 6.2: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep postman-import/save
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-import/save/route.ts && git -c commit.gpgsign=false commit -m "feat(postman): add /api/postman-import/save route (persistence to local store)"
```

---

## Task 7: `PostmanManageModal` component

**Files:**
- Create: `reqy-web/components/settings/sections/postman-manage-modal.tsx`

- [ ] **Step 7.1: Write component**

Create `reqy-web/components/settings/sections/postman-manage-modal.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import type { AuthUser } from "@/hooks/use-auth"

interface Collection {
  id: string
  name: string
  requests: number
  items: number
}

interface PostmanManageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser | null
  onDisconnected?: () => void
  onSelectCollection: (collection: Collection) => void
}

export function PostmanManageModal({ open, onOpenChange, user, onDisconnected, onSelectCollection }: PostmanManageModalProps) {
  const { toast } = useToast()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  async function fetchCollections() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/postman-auth/collections", { credentials: "include" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? "Erreur de chargement")
        return
      }
      setCollections(data.collections ?? [])
    } catch {
      setError("Erreur réseau")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void fetchCollections()
  }, [open])

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await fetch("/api/postman-auth", { method: "DELETE", credentials: "include" })
      toast({ title: "Déconnecté", description: "Postman a été déconnecté." })
      onDisconnected?.()
      onOpenChange(false)
    } catch {
      toast({ title: "Erreur", description: "Impossible de déconnecter", variant: "destructive" })
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleBulkImport() {
    setBulkImporting(true)
    setBulkProgress({ current: 0, total: collections.length })
    let success = 0
    let failed = 0
    for (let i = 0; i < collections.length; i++) {
      setBulkProgress({ current: i + 1, total: collections.length })
      try {
        const res = await fetch("/api/postman-import/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ collectionId: collections[i].id }),
        })
        if (res.ok) success++
        else failed++
      } catch {
        failed++
      }
    }
    setBulkImporting(false)
    setBulkProgress(null)
    toast({
      title: "Import terminé",
      description: `${success}/${collections.length} collections importées${failed ? `, ${failed} échouées` : ""}.`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Connecté à Postman</span>
            {user?.email && (
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {collections.length > 0
              ? `${collections.length} collection${collections.length > 1 ? "s" : ""} trouvée${collections.length > 1 ? "s" : ""} dans votre compte Postman.`
              : "Aucune collection Postman trouvée."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px]">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={fetchCollections}>
                Réessayer
              </Button>
            </div>
          ) : collections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune collection dans votre compte Postman.
            </p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {collections.map((col) => (
                <Card key={col.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{col.name}</p>
                    <p className="text-xs text-muted-foreground">{col.requests} requête{col.requests > 1 ? "s" : ""}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onSelectCollection(col)}>
                    Importer
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Déconnexion…" : "Déconnecter"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fermer</Button>
            {collections.length > 0 && (
              <Button onClick={handleBulkImport} disabled={bulkImporting}>
                {bulkImporting && bulkProgress
                  ? `[${bulkProgress.current}/${bulkProgress.total}] Importation…`
                  : `Importer toutes (${collections.length})`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7.2: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep postman-manage-modal
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/components/settings/sections/postman-manage-modal.tsx && git -c commit.gpgsign=false commit -m "feat(settings): add PostmanManageModal (list collections + bulk import + disconnect)"
```

---

## Task 8: `PostmanImportModal` component

**Files:**
- Create: `reqy-web/components/settings/sections/postman-import-modal.tsx`

- [ ] **Step 8.1: Write component**

Create `reqy-web/components/settings/sections/postman-import-modal.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface PreviewRoute {
  method: string
  path: string
  name: string
}

interface PostmanImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionId: string | null
  collectionName: string
  onImported?: () => void
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PATCH: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-300",
}

export function PostmanImportModal({ open, onOpenChange, collectionId, collectionName, onImported }: PostmanImportModalProps) {
  const { toast } = useToast()
  const [preview, setPreview] = useState<PreviewRoute[]>([])
  const [routeCount, setRouteCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !collectionId) {
      setPreview([])
      setRouteCount(0)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/postman-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ collectionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const routes = data.routes ?? []
        setPreview(routes.slice(0, 3))
        setRouteCount(routes.length)
      })
      .catch(() => {
        if (!cancelled) setError("Erreur de chargement de l'aperçu")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, collectionId])

  async function handleConfirm() {
    if (!collectionId) return
    setSaving(true)
    try {
      const res = await fetch("/api/postman-import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ collectionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message ?? "Import échoué", variant: "destructive" })
        return
      }
      toast({
        title: "Importé",
        description: `${data.routeCount} route${data.routeCount > 1 ? "s" : ""} ajoutée${data.routeCount > 1 ? "s" : ""} à votre bibliothèque.`,
      })
      onImported?.()
      onOpenChange(false)
    } catch {
      toast({ title: "Erreur réseau", description: "Import échoué", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importer "{collectionName}"</DialogTitle>
          <DialogDescription>
            {loading
              ? "Chargement de l'aperçu…"
              : routeCount > 0
              ? `${routeCount} route${routeCount > 1 ? "s" : ""} trouvée${routeCount > 1 ? "s" : ""}.`
              : error ?? "Aucune route à importer."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : preview.length > 0 ? (
          <div className="space-y-1">
            {preview.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded border bg-muted/20 p-2 text-sm">
                <Badge variant="secondary" className={`shrink-0 ${METHOD_COLORS[r.method] ?? ""}`}>
                  {r.method}
                </Badge>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{r.path}</code>
              </div>
            ))}
            {routeCount > 3 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                …et {routeCount - 3} autre{routeCount - 3 > 1 ? "s" : ""}
              </p>
            )}
          </div>
        ) : null}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={loading || saving || preview.length === 0}>
            {saving ? "Importation…" : "Confirmer l'import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 8.2: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep postman-import-modal
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/components/settings/sections/postman-import-modal.tsx && git -c commit.gpgsign=false commit -m "feat(settings): add PostmanImportModal (preview + confirm)"
```

---

## Task 9: Wire "Gérer" in `ToolsSection`

**Files:**
- Modify: `reqy-web/components/settings/sections/tools-section.tsx`

- [ ] **Step 9.1: Read current state**

Already in context from earlier exploration. The file has:
- `TOOLS` array with Postman tool
- `useToolStatus` hook with refreshKey
- `ToolCard` component
- `ToolsSection` component that opens `ToolAssociationModal`

- [ ] **Step 9.2: Add imports and state for manage modal**

Add to imports:
```tsx
import { PostmanManageModal } from "./postman-manage-modal"
import { PostmanImportModal } from "./postman-import-modal"
import { useAuth } from "@/hooks/use-auth"
```

- [ ] **Step 9.3: Modify `ToolsSection` component**

Find the current `ToolsSection` and add new state + modals. The current `onAssociate` callback always opens `ToolAssociationModal`. We need to differentiate: if the clicked tool is Postman AND we're connected, open the manage modal instead.

Replace the entire `ToolsSection` function with:

```tsx
export function ToolsSection() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null)
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<{ id: string; name: string } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const { user: authUser } = useAuth()

  function handleAssociate(tool: Tool) {
    if (tool.id === "postman" && status === "connected") {
      setManageOpen(true)
    } else {
      setActiveTool(tool)
      setOpen(true)
    }
  }

  // ... rest unchanged except the ToolCard onAssociate now passes handleAssociate
}
```

Wait — `status` is defined per-card via `useToolStatus(tool.id, refreshKey)`, not in the parent. To know if Postman is connected in the parent, we either:
- Compute it via a second `useToolStatus("postman", refreshKey)` in the parent
- Pass status via callback from the card

Simplest: do another `useToolStatus("postman", refreshKey)` in the parent.

Add at top of `ToolsSection`:
```tsx
const postmanStatus = useToolStatus("postman", refreshKey)
```

Then:
```tsx
function handleAssociate(tool: Tool) {
  if (tool.id === "postman" && postmanStatus === "connected") {
    setManageOpen(true)
  } else {
    setActiveTool(tool)
    setOpen(true)
  }
}
```

Pass `handleAssociate` to each ToolCard via `onAssociate={() => handleAssociate(tool)}`.

At the end of the JSX (after the existing ToolAssociationModal), add:
```tsx
<PostmanManageModal
  open={manageOpen}
  onOpenChange={setManageOpen}
  user={authUser}
  onDisconnected={() => setRefreshKey((k) => k + 1)}
  onSelectCollection={(col) => {
    setSelectedCollection({ id: col.id, name: col.name })
    setManageOpen(false)
    setImportOpen(true)
  }}
/>
<PostmanImportModal
  open={importOpen}
  onOpenChange={setImportOpen}
  collectionId={selectedCollection?.id ?? null}
  collectionName={selectedCollection?.name ?? ""}
  onImported={() => {
    // Optionnel : toast déjà géré par le modal
  }}
/>
```

- [ ] **Step 9.4: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep tools-section
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/components/settings/sections/tools-section.tsx && git -c commit.gpgsign=false commit -m "feat(settings): wire PostmanManageModal + PostmanImportModal on 'Gérer' button"
```

---

## Task 10: Final verification

- [ ] **Step 10.1: Run all tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run 2>&1 | tail -10
```
Expected: pass (existing + 7 new for postman-api.test.ts = ~616 tests).

- [ ] **Step 10.2: Type check**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 10.3: Verify no direct fetch in Postman routes**

```bash
grep -rn "fetch(" /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/app/api/postman* --include="*.ts" | grep -v "postmanFetch\|postmanFetchJson\|node_modules"
```
Expected: only `postman-api.ts` should NOT appear (since it's in `lib/`, not `app/api/`). The grep should return no matches in `app/api/postman*`.

- [ ] **Step 10.4: Create smoke checklist**

Create `.kimchi/docs/2026-06-27-postman-full-smoke.md`:

```markdown
# Postman full integration — Smoke checklist

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Connecter Postman avec vraie clé | Card passe à "Connecté" IMMÉDIATEMENT (pas besoin de naviguer) |
| M2 | Click "Gérer" sur la card Postman | Modal s'ouvre, liste les collections depuis Postman |
| M3 | Click "Importer" sur une collection | PostmanImportModal s'ouvre avec aperçu des routes |
| M4 | Click "Confirmer" dans PostmanImportModal | Toast "Importé (N routes)", modal ferme |
| M5 | /collections montre la nouvelle collection | Oui |
| M6 | Click "Importer toutes" dans PostmanManageModal | Progress visible, toast récap à la fin |
| M7 | Click "Déconnecter" dans PostmanManageModal | Modal ferme, card repasse à "Non connecté" |
| M8 | Vérifier que `/api/postman-auth/collections` utilise v10 | curl + headers dump montre Accept: application/vnd.api.v10+json |
```

- [ ] **Step 10.5: Final commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add .kimchi/docs/2026-06-27-postman-full-smoke.md && git -c commit.gpgsign=false commit -m "chore: smoke checklist for Postman full integration"
```

---

## Self-Review Notes

- **Spec coverage**: §3.1→T1, §3.2→T2, §3.3→T3, §3.4→T4, §3.5→T6, §3.6→T7, §3.7→T8, §3.8→T9
- **No placeholders**: Each step has exact code or commands.
- **Type consistency**: `PostmanApiError`, `postmanFetch`, `postmanFetchJson` defined once in T1, imported elsewhere.
- **TDD where applicable**: T1 has tests; T2-T4 are refactors (existing tests validate); T6-T8 are UI/API (manual smoke in T10).
