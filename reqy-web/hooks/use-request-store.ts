"use client";

import { workspaceFetch } from "@/lib/workspace-api";
import { getPublicEnv } from "@/lib/env";
import {
  mergeChangesIntoStore,
  pullAndMerge,
  computePushChanges,
  type SyncChange,
} from "@/lib/sync/store-sync";
import { pushChanges } from "@/lib/sync-client";
import { connectSyncWs, type SyncWsController } from "@/lib/sync/sync-ws";

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
} from "./request-types";
export type { RequestStore } from "./request-types";

import type {
  Collection,
  CollectionFolder,
  Environment,
  HistoryItem,
  HttpMethod,
  RequestItem,
  RequestStore,
  VariableMapping,
  Workspace,
} from "./request-types";

import type { CurrentRequest, LastResponse } from "@/lib/ai-engine";
import type { SavedProject } from "@/lib/types";
import { create } from "zustand";
import { toast } from "@/hooks/use-toast";
import { downloadJson } from "@/lib/utils";

import { runProactiveAnalysis } from "./store-analysis";
import { withCrossTabSync } from "@/hooks/store/middleware/with-cross-tab-sync";
import { storageAdapter } from "@/lib/storage-adapter";
import { WORKSPACE_PERSONAL_ID } from "./store/types";
import { createNotificationsMutations } from "./store/notifications";
import { createHistoryMutations } from "./store/history";
import { createCollectionsMutations } from "./store/collections";
import { createFoldersMutations } from "./store/folders";
import { createVariableMappingsMutations } from "./store/variable-mappings";
import { createProjectsMutations } from "./store/projects";
import { createEnvironmentsMutations } from "./store/environments";
import { createWorkspacesMutations } from "./store/workspaces";
import { createDatasetsMutations } from "./store/datasets";
import { createAiActionsMutations } from "./store/ai-actions";

const STORAGE_KEY = "reqly-request-store";

// Per-workspace "since" cursors so a reload only pulls the delta since last sync.
const SYNC_CURSOR_KEY = "reqly-sync-cursors";
function loadSyncCursors(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SYNC_CURSOR_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function saveSyncCursor(ws: string, ts: number) {
  if (typeof localStorage === "undefined") return;
  try {
    const c = loadSyncCursors();
    c[ws] = ts;
    localStorage.setItem(SYNC_CURSOR_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Lit la permission système de notification directement depuis le navigateur. */
function getBrowserNotificationPermission(): string {
  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission;
  }
  return "unsupported";
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
];

const defaultWorkspace: Workspace = {
  id: WORKSPACE_PERSONAL_ID,
  name: "Personal",
  description: "Your personal workspace",
  color: "slate",
  icon: "folder",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function migrateWorkspaceIds(store: RequestStore): RequestStore {
  const hasWorkspaces = store.workspaces && store.workspaces.length > 0;
  if (!hasWorkspaces) {
    store = {
      ...store,
      workspaces: [defaultWorkspace],
      activeWorkspaceId: store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
    };
  }

  const wsId = store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID;

  store.collections = store.collections.map((c) => ({
    ...c,
    workspaceId: c.workspaceId || wsId,
  }));

  store.environments = store.environments.map((e) => ({
    ...e,
    workspaceId: e.workspaceId || wsId,
  }));

  store.history = store.history.map((h) => ({
    ...h,
    workspaceId: h.workspaceId || wsId,
  }));

  store.variableMappings = store.variableMappings.map((vm) => ({
    ...vm,
    workspaceId: vm.workspaceId || wsId,
  }));

  return store;
}

function buildInitialStore(overrides?: Partial<RequestStore>): RequestStore {
  return {
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
    ...overrides,
  };
}

async function loadFromStorageAsync(): Promise<RequestStore> {
  try {
    const stored = await storageAdapter.load(STORAGE_KEY);
    if (!stored) return await loadFallback();
    const parsed = JSON.parse(stored);
    return migrateWorkspaceIds({
      history: parsed.history || [],
      collections: parsed.collections || [],
      environments: parsed.environments || defaultEnvironments,
      notifications: parsed.notifications || [],
      variableMappings: parsed.variableMappings || [],
      systemNotificationPermission: getBrowserNotificationPermission(),
      activeEnvironmentId:
        parsed.activeEnvironmentId !== undefined ? parsed.activeEnvironmentId : "env-global",
      projects: parsed.projects || [],
      selectedProjectId: parsed.selectedProjectId ?? null,
      currentRequest: parsed.currentRequest ?? null,
      lastResponse: parsed.lastResponse ?? null,
      environmentVariables: parsed.environmentVariables ?? {},
      collectionHistory: Array.isArray(parsed.collectionHistory) ? parsed.collectionHistory : [],
      activeCollection: parsed.activeCollection ?? null,
      aiAutoApply: typeof parsed.aiAutoApply === "boolean" ? parsed.aiAutoApply : false,
      aiAudit: Array.isArray(parsed.aiAudit) ? parsed.aiAudit : [],
      workspaces:
        Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0
          ? parsed.workspaces
          : [defaultWorkspace],
      activeWorkspaceId: parsed.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
      datasets: parsed.datasets || [],
    });
  } catch (e) {
    console.warn("Migration failed:", e);
    return await loadFallback();
  }
}

/** Fallback: if the main key does not exist, try migration from old key */
async function loadFallback(): Promise<RequestStore> {
  try {
    const { persistence } = await import("@/lib/persistence");
    const legacy = persistence.getItem<string>("probe_projects");
    const fallbackProjects: SavedProject[] = legacy ? JSON.parse(legacy) : [];
    return buildInitialStore({
      projects: fallbackProjects,
    });
  } catch {
    return buildInitialStore();
  }
}

type RequestStoreState = RequestStore & {
  isLoaded: boolean;
  __renderCount?: number;
  set: (partial: Partial<RequestStore> | ((prev: RequestStore) => Partial<RequestStore>)) => void;
  get: () => RequestStore;
  commit: (updater: (prev: RequestStore) => RequestStore) => void;
  reset: () => void;
  initStore: () => Promise<void>;
  fetchWorkspacesFromApi: () => Promise<void>;
  mergeRemote: (changes: SyncChange[]) => void;
  pullWorkspace: (workspaceId?: string | null) => Promise<{ applied: number }>;
  notify?: (message: string) => void;
  exportActiveRequest: (data: {
    method: string;
    url: string;
    requestHeaders: unknown;
    body: string;
    bodyType: string;
    authType: string;
    authToken: string;
    assertions: unknown;
  }) => Promise<void>;
  addCapturedRequest: (captured: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  }) => void;
} & MutationMethods;

type MergedState = ReturnType<typeof computeMergedState>;

function computeMergedState(store: RequestStore) {
  const activeWorkspaceId = store.activeWorkspaceId;

  const workspaceCollections = activeWorkspaceId
    ? store.collections.filter((c) => c.workspaceId === activeWorkspaceId)
    : store.collections;

  const workspaceEnvironments = activeWorkspaceId
    ? store.environments.filter((e) => e.workspaceId === activeWorkspaceId)
    : store.environments;

  const workspaceHistory = activeWorkspaceId
    ? store.history.filter((h) => h.workspaceId === activeWorkspaceId)
    : store.history;

  const workspaceVariableMappings = activeWorkspaceId
    ? store.variableMappings.filter((vm) => vm.workspaceId === activeWorkspaceId)
    : store.variableMappings;

  const workspaceProjects = activeWorkspaceId
    ? store.projects.filter((p) => p.workspaceId === activeWorkspaceId)
    : store.projects;

  const workspaceDatasets = activeWorkspaceId
    ? (store.datasets ?? []).filter((d) => d.workspaceId === activeWorkspaceId)
    : (store.datasets ?? []);

  const computedEnvironmentVariables =
    workspaceEnvironments
      .find((env) => env.id === store.activeEnvironmentId)
      ?.variables.filter((v) => v.enabled)
      .reduce<Record<string, string>>((acc, variable) => {
        acc[variable.key] = variable.value;
        return acc;
      }, {}) || {};

  const computedCollectionHistory = workspaceHistory.slice(0, 10).map((item) => ({
    method: item.method,
    url: item.url,
    headers: item.headers || {},
    params: Array.isArray(item.queryParams)
      ? Object.fromEntries(item.queryParams.map(({ key, value }) => [key, value]))
      : {},
    body: item.body,
    auth: undefined,
  }));

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
  };
}

type MutationMethods = ReturnType<typeof createNotificationsMutations> &
  ReturnType<typeof createHistoryMutations> &
  ReturnType<typeof createCollectionsMutations> &
  ReturnType<typeof createFoldersMutations> &
  ReturnType<typeof createVariableMappingsMutations> &
  ReturnType<typeof createProjectsMutations> &
  ReturnType<typeof createEnvironmentsMutations> &
  ReturnType<typeof createWorkspacesMutations> &
  ReturnType<typeof createDatasetsMutations> &
  ReturnType<typeof createAiActionsMutations>;

type FullStore = MergedState & MutationMethods & { isLoaded: boolean };

const syncMiddleware = withCrossTabSync("reqly-store-sync");

export const requestStore = create<RequestStoreState>()((set, get) => {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingStore: RequestStore | null = null;
  let saveAttempts = 0;
  const MAX_SAVE_RETRIES = 3;
  const SAVE_DEBOUNCE_MS = 300;
  let storeGen = 0;
  let lastSyncGen = 0;

  async function flushSave() {
    const store = pendingStore;
    if (!store) return;
    pendingStore = null;
    for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
      try {
        await storageAdapter.save(STORAGE_KEY, JSON.stringify(store));
        saveAttempts = 0;
        return;
      } catch (e) {
        saveAttempts++;
        console.warn(
          `[storage-adapter] save failed (attempt ${attempt + 1}/${MAX_SAVE_RETRIES}):`,
          e,
        );
        if (attempt < MAX_SAVE_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200));
        }
      }
    }
  }

  async function saveToStorageAsync(storeData: RequestStore) {
    pendingStore = storeData;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }

  /** Apply server changes into local state and persist — does NOT trigger a push. */
  const mergeRemote = (changes: SyncChange[]) => {
    const current = get();
    const next = mergeChangesIntoStore(current, changes);
    set(next);
    saveToStorageAsync(next);
  };

  /** Pull all changes since the last sync cursor and merge them. */
  const pullWorkspace = async (
    workspaceId: string | null = get().activeWorkspaceId,
  ): Promise<{ applied: number }> => {
    if (!workspaceId || workspaceId === WORKSPACE_PERSONAL_ID) return { applied: 0 };
    const syncUrl = getPublicEnv().NEXT_PUBLIC_SYNC_URL;
    if (!syncUrl) return { applied: 0 };
    const since = loadSyncCursors()[workspaceId] ?? 0;
    const res = await pullAndMerge(workspaceId, since, { apply: mergeRemote });
    // Always bump the cursor so subsequent loads use the latest timestamp,
    // even when no changes were returned.
    saveSyncCursor(workspaceId, Date.now());
    return res;
  };

  // Debounced push of local changes to the server. Tracks the last pushed
  // snapshot per workspace so only the delta is sent.
  const lastPushed: Record<string, Pick<RequestStore, "collections" | "environments">> = {};
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePush = (workspaceId: string) => {
    if (workspaceId === WORKSPACE_PERSONAL_ID) return;
    const syncUrl = getPublicEnv().NEXT_PUBLIC_SYNC_URL;
    if (!syncUrl) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      const current = get();
      const snapshot = { collections: current.collections, environments: current.environments };
      const base = lastPushed[workspaceId] ?? { collections: [], environments: [] };
      const changes = computePushChanges(base, snapshot);
      if (changes.length === 0) return;
      pushChanges(workspaceId, changes)
        .then((res) => {
          if (res.conflicts.length === 0) {
            lastPushed[workspaceId] = snapshot;
          } else {
            // A conflict means the server has a newer version; reconcile.
            const store = get();
            store.addNotification?.({
              title: "Sync Conflict",
              body: `${res.conflicts.length} change(s) conflicted with the server. Server version applied.`,
              type: "warning",
            });
            void pullWorkspace(workspaceId);
          }
        })
        .catch((e) => console.warn("[sync] push failed:", e));
    }, 500);
  };

  async function initStore() {
    let loaded = await loadFromStorageAsync();

    const hasDraftsCollection = loaded.collections.some((c) => c.name === "Drafts");
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
      await saveToStorageAsync(loaded);
    }

    // Capture the active workspace before the load overwrites it (storage may
    // reset it to the personal default when empty).
    const ws = get().activeWorkspaceId ?? WORKSPACE_PERSONAL_ID;
    const currentState = get();
    set({
      ...loaded,
      isLoaded: true,
    } satisfies Partial<RequestStoreState>);

    // Pull remote changes for the workspace that was active before load.
    if (ws !== WORKSPACE_PERSONAL_ID && getPublicEnv().NEXT_PUBLIC_SYNC_URL) {
      try {
        await pullWorkspace(ws);
      } catch (e) {
        console.warn("[sync] initial pull failed:", e);
      }
    }

    // Subscribe to live changes via WebSocket.
    startSyncWs(ws);
  }

  const commit = (updater: (prev: RequestStore) => RequestStore) => {
    set((prev) => {
      const next = updater(prev);
      storeGen++;
      saveToStorageAsync(next);
      syncMiddleware.broadcast({ type: "update", gen: storeGen });
      const ws = prev.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID;
      if (ws !== WORKSPACE_PERSONAL_ID) schedulePush(ws);
      return next;
    });
  };

  syncMiddleware.onMessage(async (payload) => {
    if (payload?.type === "update" && (payload.gen || 0) > lastSyncGen) {
      lastSyncGen = payload.gen;
      const loaded = await loadFromStorageAsync();
      set(loaded);
    }
  });

  /** Fetch workspaces from the sync server API and merge with local metadata */
  const fetchWorkspacesFromApi = async () => {
    try {
      const res = await workspaceFetch("/api/workspaces");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = (await res.json()) as {
        workspaces: Array<{
          id: string;
          name: string;
          ownerId: string;
          role: string;
          createdAt: number;
          updatedAt: number;
        }>;
      };
      const serverWorkspaces: Workspace[] = (data.workspaces ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        ownerId: w.ownerId,
        role: w.role,
        color: "slate",
        icon: "folder",
        description: "",
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      }));

      const current = get();
      // Preserve local UI metadata (color, icon) for workspaces that already exist
      const localMeta = new Map(
        current.workspaces.map((w) => [
          w.id,
          { color: w.color, icon: w.icon, description: w.description },
        ]),
      );
      const merged = serverWorkspaces.map((ws) => {
        const meta = localMeta.get(ws.id);
        return meta ? { ...ws, ...meta } : ws;
      });

      // Keep the Personal workspace (local-only concept)
      const personalWs = current.workspaces.find((w) => w.id === WORKSPACE_PERSONAL_ID);
      const allWorkspaces = personalWs ? [personalWs, ...merged] : merged;

      const activeId = current.activeWorkspaceId;
      const stillExists = allWorkspaces.some((w) => w.id === activeId);

      commit((prev) => ({
        ...prev,
        workspaces: allWorkspaces,
        activeWorkspaceId: stillExists
          ? activeId!
          : (allWorkspaces[0]?.id ?? WORKSPACE_PERSONAL_ID),
      }));
    } catch (e) {
      console.warn("[workspaces] API fetch failed, using local workspaces:", e);
    }
  };

  const mutations = {
    ...createNotificationsMutations(commit),
    ...createHistoryMutations(commit),
    ...createCollectionsMutations(commit),
    addFolder: createFoldersMutations(commit).addFolder,
    renameFolder: createFoldersMutations(commit).renameFolder,
    deleteFolder: createFoldersMutations(commit).deleteFolder,
    moveRequestToFolder: createFoldersMutations(commit).moveRequestToFolder,
    moveFolder: createFoldersMutations(commit).moveFolder,
    reorderRequestsInCollection: createFoldersMutations(commit).reorderRequestsInCollection,
    reorderFolders: createFoldersMutations(commit).reorderFolders,
    ...createVariableMappingsMutations(commit),
    ...createProjectsMutations(commit),
    ...createEnvironmentsMutations(commit),
    ...createWorkspacesMutations(commit),
    ...createDatasetsMutations(commit),
    ...createAiActionsMutations(commit),
  };

  const initial = buildInitialStore({
    systemNotificationPermission: getBrowserNotificationPermission(),
  });

  const getFoldersForCollection = (collectionId: string): CollectionFolder[] => {
    const col = get().collections?.find((c) => c.id === collectionId);
    return col?.folders ?? [];
  };

  const storeApi: RequestStoreState = {
    ...initial,
    isLoaded: false,
    get,
    set,
    commit,
    reset: () => {
      set(
        buildInitialStore({
          systemNotificationPermission: getBrowserNotificationPermission(),
        }),
      );
    },
    initStore,
    fetchWorkspacesFromApi,
    mergeRemote,
    pullWorkspace,
    ...mutations,
    getFoldersForCollection,
    notify: (message: string) =>
      storeApi.addNotification?.({ title: "Notification", body: String(message), type: "info" }),
    addCapturedRequest: (captured) => {
      const safeMethod = (
        ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "GRAPHQL"].includes(
          captured.method?.toUpperCase(),
        )
          ? captured.method.toUpperCase()
          : "GET"
      ) as HttpMethod;

      let pathname = "";
      try {
        pathname = new URL(captured.url).pathname;
      } catch {
        pathname = captured.url;
      }

      const now = Date.now();
      const id = `req-${crypto.randomUUID()}`;

      commit((prev) => {
        const wsId = prev.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID;
        const drafts = prev.collections.find((c) => c.name === "Drafts");

        if (!drafts) {
          const newColId = `col-${crypto.randomUUID()}`;
          return {
            ...prev,
            collections: [
              ...prev.collections,
              {
                id: newColId,
                name: "Drafts",
                description: "Your drafts and uncategorized requests",
                color: "slate",
                icon: "folder",
                workspaceId: wsId,
                requests: [
                  {
                    id,
                    name: `Captured ${safeMethod} ${pathname}`,
                    method: safeMethod,
                    url: captured.url,
                    endpoint: captured.url,
                    headers: captured.headers,
                    body: captured.body,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
                folders: [],
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        }

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === drafts.id
              ? {
                  ...c,
                  updatedAt: now,
                  requests: [
                    ...c.requests,
                    {
                      id,
                      name: `Captured ${safeMethod} ${pathname}`,
                      method: safeMethod,
                      url: captured.url,
                      endpoint: captured.url,
                      headers: captured.headers,
                      body: captured.body,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ],
                }
              : c,
          ),
        };
      });
    },
    exportActiveRequest: async (requestData) => {
      const isTauri =
        !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
        !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;

      const jsonContent = JSON.stringify(requestData, null, 2);

      if (isTauri) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const savedPath = await invoke<string>("export_json", {
            content: jsonContent,
            defaultName: "request.json",
          });
          toast({ title: `File saved: ${savedPath}` });
        } catch (error: unknown) {
          if (error === "cancelled") return;
          toast({ title: `Export error: ${String(error)}`, variant: "destructive" });
          downloadJson(requestData, "request.json");
        }
      } else {
        downloadJson(requestData, "request.json");
        toast({ title: "Download started" });
      }
    },
  };

  return storeApi;
});

export const getStore = () => requestStore.getState();

export const useRequestStore = requestStore;

// --- WebSocket sync (module-level, one connection at a time) ---
let syncWsController: SyncWsController | null = null;

/** Start (or restart) a WS sync subscription for the given workspace. */
function startSyncWs(workspaceId: string | null) {
  // Disconnect any previous connection
  if (syncWsController) {
    syncWsController.disconnect();
    syncWsController = null;
  }
  if (!workspaceId || workspaceId === WORKSPACE_PERSONAL_ID) return;
  const syncUrl = getPublicEnv().NEXT_PUBLIC_SYNC_URL;
  if (!syncUrl) return;

  syncWsController = connectSyncWs({
    workspaceId,
    syncUrl,
    onChange: () => {
      // Broadcast hint: pull the latest changes
      const store = requestStore.getState();
      void store.pullWorkspace(workspaceId);
    },
    onError: (err) => {
      console.warn("[sync] WS error:", err.message);
    },
  });
}

// When the active workspace changes, pull its latest server state
// and switch the WebSocket subscription.
requestStore.subscribe((state, prev) => {
  if (state.activeWorkspaceId && state.activeWorkspaceId !== prev.activeWorkspaceId) {
    void state.pullWorkspace(state.activeWorkspaceId);
    // Restart WS for the new workspace
    const store = requestStore.getState();
    startSyncWs(state.activeWorkspaceId);
  }
});

export function moduleLevelCommit(updater: (prev: RequestStore) => RequestStore) {
  requestStore.getState().commit(updater);
}

export const globalStore = requestStore.getState() as RequestStore;
