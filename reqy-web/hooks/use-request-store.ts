"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"

// Re-export all types for backward compatibility
export type {
  HttpMethod,
  CollectionFolder,
  RequestItem,
  HistoryItem,
  Collection,
  EnvironmentVariable,
  Environment,
  VariableMapping,
  Notification,
  Workspace,
} from "./request-types"
export type { RequestStore } from "./request-types"

import type {
  Collection,
  CollectionFolder,
  Environment,
  HistoryItem,
  Notification,
  RequestItem,
  RequestStore,
  VariableMapping,
  Workspace,
} from "./request-types"

import type { CurrentRequest, LastResponse } from "@/lib/ai-engine"
import type { SavedProject } from "@/lib/types"
import { runProactiveAnalysis } from "./store-analysis"
import { withCrossTabSync } from "@/hooks/store/middleware/with-cross-tab-sync"
import { storageAdapter } from "@/lib/storage-adapter"
import { WORKSPACE_PERSONAL_ID } from "./store/types"
import { createNotificationsMutations } from "./store/notifications"
import { createHistoryMutations } from "./store/history"
import { createCollectionsMutations } from "./store/collections"
import { createFoldersMutations } from "./store/folders"
import { createVariableMappingsMutations } from "./store/variable-mappings"
import { createProjectsMutations } from "./store/projects"
import { createEnvironmentsMutations } from "./store/environments"
import { createWorkspacesMutations } from "./store/workspaces"
import { createDatasetsMutations } from "./store/datasets"

const STORAGE_KEY = "reqly-request-store"

/** Lit la permission système de notification directement depuis le navigateur. */
function getBrowserNotificationPermission(): string {
  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission
  }
  return "unsupported"
}

const defaultEnvironments: Environment[] = [
  {
    id: "env-global",
    name: "Global",
    color: "slate",
    workspaceId: WORKSPACE_PERSONAL_ID,
    variables: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const defaultWorkspace: Workspace = {
  id: WORKSPACE_PERSONAL_ID,
  name: "Personal",
  description: "Your personal workspace",
  color: "slate",
  icon: "folder",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const initialStore: RequestStore = {
  history: [],
  collections: [],
  environments: defaultEnvironments,
  notifications: [],
  variableMappings: [],
  systemNotificationPermission: getBrowserNotificationPermission(),
  activeEnvironmentId: "env-global",
  projects: [],
  selectedProjectId: null,
  currentRequest: null,
  lastResponse: null,
  environmentVariables: {},
  collectionHistory: [],
  activeCollection: null,
  aiAutoApply: false,
  aiAudit: [],
  workspaces: [defaultWorkspace],
  activeWorkspaceId: WORKSPACE_PERSONAL_ID,
  datasets: [],
}

function migrateWorkspaceIds(store: RequestStore): RequestStore {
  const hasWorkspaces = store.workspaces && store.workspaces.length > 0
  if (!hasWorkspaces) {
    store = {
      ...store,
      workspaces: [defaultWorkspace],
      activeWorkspaceId: store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
    }
  }

  const wsId = store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID

  store.collections = store.collections.map((c) => ({
    ...c,
    workspaceId: c.workspaceId || wsId,
  }))

  store.environments = store.environments.map((e) => ({
    ...e,
    workspaceId: e.workspaceId || wsId,
  }))

  store.history = store.history.map((h) => ({
    ...h,
    workspaceId: h.workspaceId || wsId,
  }))

  store.variableMappings = store.variableMappings.map((vm) => ({
    ...vm,
    workspaceId: vm.workspaceId || wsId,
  }))

  return store
}

async function loadFromStorageAsync(): Promise<RequestStore> {
  try {
    const stored = await storageAdapter.load(STORAGE_KEY)
    if (!stored) return await loadFallback()
    const parsed = JSON.parse(stored)
    return migrateWorkspaceIds({
      history: parsed.history || [],
      collections: parsed.collections || [],
      environments: parsed.environments || defaultEnvironments,
      notifications: parsed.notifications || [],
      variableMappings: parsed.variableMappings || [],
      systemNotificationPermission: getBrowserNotificationPermission(),
      activeEnvironmentId:
        parsed.activeEnvironmentId !== undefined
          ? parsed.activeEnvironmentId
          : "env-global",
      projects: parsed.projects || [],
      selectedProjectId: parsed.selectedProjectId ?? null,
      currentRequest: parsed.currentRequest ?? null,
      lastResponse: parsed.lastResponse ?? null,
      environmentVariables: parsed.environmentVariables ?? {},
      collectionHistory: Array.isArray(parsed.collectionHistory)
        ? parsed.collectionHistory
        : [],
      activeCollection: parsed.activeCollection ?? null,
      aiAutoApply:
        typeof parsed.aiAutoApply === "boolean" ? parsed.aiAutoApply : false,
      aiAudit: Array.isArray(parsed.aiAudit) ? parsed.aiAudit : [],
      workspaces: Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0
        ? parsed.workspaces
        : [defaultWorkspace],
      activeWorkspaceId: parsed.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
      datasets: parsed.datasets || [],
    })
  } catch (e) {
    console.warn("Migration failed:", e)
    return await loadFallback()
  }
}

/** Fallback: if the main key does not exist, try migration from old key */
async function loadFallback(): Promise<RequestStore> {
  try {
    // Try reading legacy key via persistence cache (which populates from localStorage)
    const { persistence } = await import("@/lib/persistence")
    const legacy = persistence.getItem<string>("probe_projects")
    const fallbackProjects: SavedProject[] = legacy ? JSON.parse(legacy) : []
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      notifications: [],
      systemNotificationPermission: getBrowserNotificationPermission(),
      variableMappings: [],
      activeEnvironmentId: "env-global",
      projects: fallbackProjects,
      selectedProjectId: null,
      currentRequest: null,
      lastResponse: null,
      environmentVariables: {},
      collectionHistory: [],
      activeCollection: null,
      aiAutoApply: false,
      aiAudit: [],
      workspaces: [defaultWorkspace],
      activeWorkspaceId: WORKSPACE_PERSONAL_ID,
      datasets: [],
    }
  } catch {
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      notifications: [],
      systemNotificationPermission: getBrowserNotificationPermission(),
      variableMappings: [],
      activeEnvironmentId: "env-global",
      projects: [],
      selectedProjectId: null,
      currentRequest: null,
      lastResponse: null,
      environmentVariables: {},
      collectionHistory: [],
      activeCollection: null,
      aiAutoApply: false,
      aiAudit: [],
      workspaces: [defaultWorkspace],
      activeWorkspaceId: WORKSPACE_PERSONAL_ID,
      datasets: [],
    }
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingStore: RequestStore | null = null;
let saveAttempts = 0;
const MAX_SAVE_RETRIES = 3;
const SAVE_DEBOUNCE_MS = 300;

async function flushSave() {
  const store = pendingStore;
  if (!store) return;
  pendingStore = null;
  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
    try {
      await storageAdapter.save(STORAGE_KEY, JSON.stringify(store))
      saveAttempts = 0;
      return
    } catch (e) {
      saveAttempts++
      console.warn(`[storage-adapter] save failed (attempt ${attempt + 1}/${MAX_SAVE_RETRIES}):`, e)
      if (attempt < MAX_SAVE_RETRIES - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 200))
      }
    }
  }
}

function saveToStorageAsync(store: RequestStore) {
  pendingStore = store
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
}

export let globalStore: RequestStore = initialStore;
let globalIsLoaded = false;
let initPromise: Promise<void> | null = null;
const storeListeners = new Set<() => void>();


let storeGen = 0;
let lastSyncGen = 0;

const syncMiddleware = withCrossTabSync("reqly-store-sync");
syncMiddleware.onMessage(async (payload) => {
  if (payload?.type === "update" && (payload.gen || 0) > lastSyncGen) {
    lastSyncGen = payload.gen;
    const loaded = await loadFromStorageAsync();
    globalStore = loaded;
    notifyListeners();
  }
});

export function moduleLevelCommit(updater: (prev: RequestStore) => RequestStore) {
  globalStore = updater(globalStore);
  storeGen++;
  saveToStorageAsync(globalStore);
  notifyListeners();
  syncMiddleware.broadcast({ type: "update", gen: storeGen });
}

function notifyListeners() {
  storeListeners.forEach((listener) => listener());
}

async function initStore() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    let loaded = await loadFromStorageAsync();

    // Auto-create "Drafts" collection on first startup
    const hasDraftsCollection = loaded.collections.some(
      (c) => c.name === "Drafts"
    );
    if (!hasDraftsCollection) {
      const draftsCollection: Collection = {
        id: `col-drafts-${Date.now()}`,
        name: "Drafts",
        description: "Your drafts and uncategorized requests",
        color: "slate",
        icon: "folder",
        workspaceId: loaded.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      loaded = {
        ...loaded,
        collections: [draftsCollection, ...loaded.collections],
      };
      saveToStorageAsync(loaded);
    }

    globalStore = loaded;
    globalIsLoaded = true;
    notifyListeners();
    runProactiveAnalysis(loaded);
  })();
  
  return initPromise;
}

type MergedState = ReturnType<typeof computeMergedState>

function computeMergedState(store: RequestStore) {
  const activeWorkspaceId = store.activeWorkspaceId

  const workspaceCollections = activeWorkspaceId
    ? store.collections.filter((c) => c.workspaceId === activeWorkspaceId)
    : store.collections

  const workspaceEnvironments = activeWorkspaceId
    ? store.environments.filter((e) => e.workspaceId === activeWorkspaceId)
    : store.environments

  const workspaceHistory = activeWorkspaceId
    ? store.history.filter((h) => h.workspaceId === activeWorkspaceId)
    : store.history

  const workspaceVariableMappings = activeWorkspaceId
    ? store.variableMappings.filter(
        (vm) => vm.workspaceId === activeWorkspaceId
      )
    : store.variableMappings

  const workspaceProjects = activeWorkspaceId
    ? store.projects.filter((p) => p.workspaceId === activeWorkspaceId)
    : store.projects

  const workspaceDatasets = activeWorkspaceId
    ? (store.datasets ?? []).filter((d) => d.workspaceId === activeWorkspaceId)
    : (store.datasets ?? [])

  const computedEnvironmentVariables =
    workspaceEnvironments
      .find((env) => env.id === store.activeEnvironmentId)
      ?.variables.filter((v) => v.enabled)
      .reduce<Record<string, string>>((acc, variable) => {
        acc[variable.key] = variable.value
        return acc
      }, {}) || {}

  const computedCollectionHistory = workspaceHistory
    .slice(0, 10)
    .map((item) => ({
      method: item.method,
      url: item.url,
      headers: item.headers || {},
      params: Array.isArray(item.queryParams)
        ? Object.fromEntries(
            item.queryParams.map(({ key, value }) => [key, value])
          )
        : {},
      body: item.body,
      auth: undefined,
    }))

  return {
    history: workspaceHistory,
    collections: workspaceCollections,
    environments: workspaceEnvironments,
    activeEnvironmentId: store.activeEnvironmentId,
    projects: workspaceProjects,
    selectedProjectId: store.selectedProjectId,
    currentRequest: store.currentRequest ?? null,
    lastResponse: store.lastResponse ?? null,
    environmentVariables: {
      ...(store.environmentVariables || {}),
      ...computedEnvironmentVariables,
    },
    collectionHistory:
      store.collectionHistory && store.collectionHistory.length > 0
        ? store.collectionHistory
        : computedCollectionHistory,
    activeCollection: store.activeCollection ?? null,
    notifications: store.notifications,
    variableMappings: workspaceVariableMappings,
    systemNotificationPermission: store.systemNotificationPermission,
    aiAutoApply: store.aiAutoApply,
    aiAudit: store.aiAudit,
    workspaces: store.workspaces,
    activeWorkspaceId,
    datasets: workspaceDatasets,
  }
}

type MutationMethods = ReturnType<typeof createNotificationsMutations>
  & ReturnType<typeof createHistoryMutations>
  & ReturnType<typeof createCollectionsMutations>
  & ReturnType<typeof createFoldersMutations>
  & ReturnType<typeof createVariableMappingsMutations>
  & ReturnType<typeof createProjectsMutations>
  & ReturnType<typeof createEnvironmentsMutations>
  & ReturnType<typeof createWorkspacesMutations>
  & ReturnType<typeof createDatasetsMutations>

type FullStore = MergedState & MutationMethods & { isLoaded: boolean }

export function useRequestStore(): FullStore
export function useRequestStore<T>(selector: (state: FullStore) => T): T
export function useRequestStore<T = MergedState>(
  selector?: (state: FullStore) => T,
): T {
  const [store, setStore] = useState<RequestStore>(globalStore)
  const [isLoaded, setIsLoaded] = useState(globalIsLoaded)

  useEffect(() => {
    const listener = () => {
      setStore(globalStore);
      setIsLoaded(globalIsLoaded);
    };
    storeListeners.add(listener);

    const removeStorageListener = syncMiddleware.listenStorage(STORAGE_KEY, (value) => {
      const loaded = JSON.parse(value) as RequestStore;
      globalStore = loaded;
      notifyListeners();
    });

    if (!globalIsLoaded) {
      initStore();
    } else {
      listener();
    }

    return () => {
      storeListeners.delete(listener);
      removeStorageListener();
    };
  }, []);

  // ── commit: core mutation helper (stable module-level function) ───
  const commit = moduleLevelCommit;

  // ── Domain mutations memoized on `commit` (stable once per hook lifetime).
  //    The `commit` reference never changes, so deps are []. This prevents
  //    downstream useEffect / React.memo busting in consumers (audit 1.1).
  const mutations = useMemo(
    () => {
      const folders = createFoldersMutations(commit)
      return {
        ...createNotificationsMutations(commit),
        ...createHistoryMutations(commit),
        ...createCollectionsMutations(commit),
        addFolder: folders.addFolder,
        renameFolder: folders.renameFolder,
        deleteFolder: folders.deleteFolder,
        moveRequestToFolder: folders.moveRequestToFolder,
        moveFolder: folders.moveFolder,
        reorderRequestsInCollection: folders.reorderRequestsInCollection,
        reorderFolders: folders.reorderFolders,
        ...createVariableMappingsMutations(commit),
        ...createProjectsMutations(commit),
        ...createEnvironmentsMutations(commit),
        ...createWorkspacesMutations(commit),
        ...createDatasetsMutations(commit),
      }
    },
    [],
  )

  // ── Composite methods ───────────────────────────────────────────────
  const getFoldersForCollection = useCallback(
    (collectionId: string): CollectionFolder[] => {
      const col = globalStore.collections?.find(
        (c) => c.id === collectionId
      )
      return col?.folders ?? []
    },
    []
  )

  // ── Build merged state & apply optional selector ────────────────────
  //    `merged` identity only changes when `store` reference changes.
  const merged = useMemo(() => computeMergedState(store), [store])

  const full = useMemo(
    () => ({
      ...merged,
      isLoaded,
      ...mutations,
      getFoldersForCollection,
    }),
    [merged, isLoaded, mutations, getFoldersForCollection],
  )

  if (selector) {
    return selector(full)
  }

  return full as T
}
