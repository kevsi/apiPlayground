"use client"

import { useState, useEffect, useCallback, useRef } from "react"

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
import type { SavedProject } from "@/types"
import { runProactiveAnalysis } from "./store-analysis"
import { withCrossTabSync } from "@/lib/store/middleware/with-cross-tab-sync"
import { setSyncState, setRetryHandler } from "@/hooks/use-sync-state"
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

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, boolean> = {
  requestComplete: true,
  collectionComplete: true,
  aiResponse: true,
  aiError: true,
  importExport: true,
}

const initialStore: RequestStore = {
  history: [],
  collections: [],
  environments: defaultEnvironments,
  notifications: [],
  variableMappings: [],
  systemNotificationPermission:
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default",
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
  notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
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
      systemNotificationPermission:
        parsed.systemNotificationPermission ??
        (typeof window !== "undefined" && "Notification" in window
          ? Notification.permission
          : "unsupported"),
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
      workspaces: parsed.workspaces || [defaultWorkspace],
      activeWorkspaceId: parsed.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
      notificationPreferences:
        parsed.notificationPreferences ?? { ...DEFAULT_NOTIFICATION_PREFERENCES },
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
      systemNotificationPermission:
        typeof window !== "undefined" && "Notification" in window
          ? Notification.permission
          : "unsupported",
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
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      datasets: [],
    }
  } catch {
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      notifications: [],
      systemNotificationPermission:
        typeof window !== "undefined" && "Notification" in window
          ? Notification.permission
          : "unsupported",
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
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      datasets: [],
    }
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingStore: RequestStore | null = null;
let saveAttempts = 0;
const MAX_SAVE_RETRIES = 3;
const SAVE_DEBOUNCE_MS = 300;

let lastStoreSnapshot: string | null = null;

async function flushSave() {
  const store = pendingStore;
  if (!store) return;
  pendingStore = null;
  setSyncState("syncing");
  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
    try {
      await storageAdapter.save(STORAGE_KEY, JSON.stringify(store))
      saveAttempts = 0;
      lastStoreSnapshot = JSON.stringify(store);
      setSyncState("synced");
      return
    } catch (e) {
      saveAttempts++
      console.warn(`[storage-adapter] save failed (attempt ${attempt + 1}/${MAX_SAVE_RETRIES}):`, e)
      if (attempt < MAX_SAVE_RETRIES - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 200))
      }
    }
  }
  setSyncState("error");
}

function saveToStorageAsync(store: RequestStore) {
  pendingStore = store
  lastStoreSnapshot = JSON.stringify(store)
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
}

setRetryHandler(() => {
  if (lastStoreSnapshot) {
    const store = JSON.parse(lastStoreSnapshot) as RequestStore;
    saveToStorageAsync(store);
  }
});

export let globalStore: RequestStore = initialStore;
let globalIsLoaded = false;
let initPromise: Promise<void> | null = null;
const storeListeners = new Set<() => void>();
const storeChangeListeners = new Set<(store: RequestStore) => void>();

/** Register a callback invoked after every store mutation. Used by cloud sync. */
export function addStoreChangeListener(fn: (store: RequestStore) => void): () => void {
  storeChangeListeners.add(fn);
  return () => {
    storeChangeListeners.delete(fn);
  };
}

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

function moduleLevelCommit(updater: (prev: RequestStore) => RequestStore) {
  globalStore = updater(globalStore);
  storeGen++;
  saveToStorageAsync(globalStore);
  notifyListeners();
  storeChangeListeners.forEach((fn) => fn(globalStore));
  syncMiddleware.broadcast({ type: "update", gen: storeGen });
}

export { moduleLevelCommit as forceCommit };

export function getGlobalStore(): RequestStore {
  return globalStore;
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

export function useRequestStore() {
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

  // ── commit: core mutation helper ────────────────────────────────────
  const commit = moduleLevelCommit;

  // ── Domain mutations (extracted to store/ files) ─────────────────────
  const notificationsMutations = createNotificationsMutations(commit)
  const historyMutations = createHistoryMutations(commit)
  const collectionsMutations = createCollectionsMutations(commit)
  const foldersMutations = createFoldersMutations(commit)
  const variableMappingsMutations = createVariableMappingsMutations(commit)
  const projectsMutations = createProjectsMutations(commit)
  const environmentsMutations = createEnvironmentsMutations(commit)
  const workspacesMutations = createWorkspacesMutations(commit)
  const datasetsMutations = createDatasetsMutations(commit)

  // ── Filtered getters ────────────────────────────────────────────────
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

  // ── Return merged API ───────────────────────────────────────────────
  return {
    // Raw state
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
    isLoaded,
    notifications: store.notifications,
    variableMappings: workspaceVariableMappings,
    systemNotificationPermission: store.systemNotificationPermission,
    notificationPreferences: store.notificationPreferences ?? {},
    aiAutoApply: store.aiAutoApply,
    aiAudit: store.aiAudit,
    workspaces: store.workspaces,
    activeWorkspaceId,
    datasets: workspaceDatasets,

    // Notifications
    ...notificationsMutations,

    // History
    ...historyMutations,

    // Collections
    ...collectionsMutations,

    // Folders
    addFolder: foldersMutations.addFolder,
    renameFolder: foldersMutations.renameFolder,
    deleteFolder: foldersMutations.deleteFolder,
    moveRequestToFolder: foldersMutations.moveRequestToFolder,
    moveFolder: foldersMutations.moveFolder,
    reorderRequestsInCollection: foldersMutations.reorderRequestsInCollection,
    reorderFolders: foldersMutations.reorderFolders,
    getFoldersForCollection,

    // Variable mappings
    ...variableMappingsMutations,

    // Projects
    ...projectsMutations,

    // Environments
    ...environmentsMutations,

    // Workspaces
    ...workspacesMutations,

    // Datasets
    ...datasetsMutations,
  }
}
