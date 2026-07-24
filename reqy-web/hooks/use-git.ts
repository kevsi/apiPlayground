"use client";

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "@/lib/tauri";
import type { Collection } from "@/hooks/use-request-store";

// ── Types (same shape as before, enriched) ──────────────────────────────

export interface GitCommit {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
  timestamp: number;
}

export interface FileStatus {
  filepath: string;
  head: 0 | 1;
  workdir: 0 | 1 | 2;
  staged: 0 | 1 | 2 | 3;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{
    origin: string;
    content: string;
    oldLineno: number | null;
    newLineno: number | null;
  }>;
}

export interface DiffFile {
  filepath: string;
  hunks: DiffHunk[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  oid: string;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface GitState {
  isInitialized: boolean;
  currentBranch: string;
  commits: GitCommit[];
  status: FileStatus[];
  branches: BranchInfo[];
  remotes: RemoteInfo[];
  error: string | null;
  repoPath: string | null;
}

const DEFAULT_REPO_PATH = "reqly-repo";

function getRepoDir(): string {
  // En environnement Tauri, utiliser appDataDir
  if (isTauriAvailable()) {
    return DEFAULT_REPO_PATH; // Le Rust utilisera app_data_dir
  }
  throw new Error("Git is only available in Tauri desktop mode");
}

async function saveCollectionsToFs(collections: Collection[]): Promise<void> {
  await invoke("git_sync_collections", {
    collectionsJson: JSON.stringify(collections),
    repoDir: getRepoDir(),
  });
}

export function useGit(collections: Collection[]) {
  const [state, setState] = useState<GitState>({
    isInitialized: false,
    currentBranch: "main",
    commits: [],
    status: [],
    branches: [],
    remotes: [],
    error: null,
    repoPath: null,
  });

  const updateState = useCallback((partial: Partial<GitState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const checkInitialized = useCallback(async (): Promise<boolean> => {
    try {
      const branches = await invoke<BranchInfo[]>("git_branch_list");
      return branches.length > 0;
    } catch {
      return false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [commits, status, branches, remotes] = await Promise.all([
        invoke<GitCommit[]>("git_log", { maxCount: 50 }).catch(() => []),
        invoke<FileStatus[]>("git_status").catch(() => []),
        invoke<BranchInfo[]>("git_branch_list").catch(() => []),
        invoke<RemoteInfo[]>("git_remote_list").catch(() => []),
      ]);
      const currentBranch = branches.find((b) => b.isCurrent)?.name ?? "main";
      updateState({ commits, status, branches, remotes, currentBranch });
    } catch (err: unknown) {
      updateState({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [updateState]);

  const initRepo = useCallback(
    async (repoPath?: string) => {
      updateState({ error: null });
      try {
        const path = repoPath || getRepoDir();
        await invoke("git_init", { path });
        updateState({ isInitialized: true, repoPath: path });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const openRepo = useCallback(
    async (repoPath: string) => {
      updateState({ error: null });
      try {
        await invoke("git_open", { path: repoPath });
        updateState({ isInitialized: true, repoPath });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const doCommit = useCallback(
    async (message: string, authorName?: string, authorEmail?: string) => {
      updateState({ error: null });
      try {
        await saveCollectionsToFs(collections);
        await invoke("git_stage_all");
        const oid = await invoke<string>("git_commit", {
          message,
          authorName: authorName || null,
          authorEmail: authorEmail || null,
        });
        await refreshAll();
        return oid;
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    [updateState, refreshAll, collections],
  );

  // ── Stage operations ──────────────────────────────────────────

  const stage = useCallback(
    async (filepath: string) => {
      try {
        await invoke("git_stage", { filepath });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const stageAll = useCallback(async () => {
    try {
      await invoke("git_stage_all");
      await refreshAll();
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : String(err) });
    }
  }, [updateState, refreshAll]);

  const unstage = useCallback(
    async (filepath: string) => {
      try {
        await invoke("git_unstage", { filepath });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  // ── Branch operations ─────────────────────────────────────────

  const branchCreate = useCallback(
    async (name: string, fromOid?: string) => {
      try {
        await invoke("git_branch_create", { name, fromOid: fromOid || null });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const branchDelete = useCallback(
    async (name: string) => {
      try {
        await invoke("git_branch_delete", { name });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const branchSwitch = useCallback(
    async (name: string) => {
      try {
        await invoke("git_branch_switch", { name });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  // ── Remote operations ─────────────────────────────────────────

  const remoteAdd = useCallback(
    async (name: string, url: string) => {
      try {
        await invoke("git_remote_add", { name, url });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const remoteRemove = useCallback(
    async (name: string) => {
      try {
        await invoke("git_remote_remove", { name });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const push = useCallback(
    async (remote: string, branch: string) => {
      updateState({ error: null });
      try {
        await invoke("git_push", { remote, branch });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const forcePush = useCallback(
    async (remote: string, branch: string) => {
      updateState({ error: null });
      try {
        await invoke("git_push_force", { remote, branch });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const fetch = useCallback(
    async (remote: string) => {
      try {
        await invoke("git_fetch", { remote });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const pull = useCallback(
    async (remote: string, branch: string) => {
      try {
        await invoke("git_pull", { remote, branchName: branch });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const clone = useCallback(
    async (url: string, destPath: string) => {
      updateState({ error: null });
      try {
        await invoke("git_clone", { url, destPath });
        updateState({ isInitialized: true, repoPath: destPath });
        await refreshAll();
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [updateState, refreshAll],
  );

  const diff = useCallback(async (oidA: string, oidB: string): Promise<DiffFile[]> => {
    try {
      return await invoke<DiffFile[]>("git_diff", { oldOid: oidA, newOid: oidB });
    } catch {
      return [];
    }
  }, []);

  // Auto-detect on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialized = await checkInitialized();
        if (!cancelled) {
          updateState({ isInitialized: initialized });
          if (initialized) {
            await refreshAll();
          }
        }
      } catch {
        // Pas de repo
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkInitialized, refreshAll, updateState]);

  return {
    ...state,
    init: initRepo,
    open: openRepo,
    commit: doCommit,
    log: refreshAll,
    refreshStatus: refreshAll,
    diff,
    stage,
    stageAll,
    unstage,
    branchCreate,
    branchDelete,
    branchSwitch,
    remoteAdd,
    remoteRemove,
    push,
    forcePush,
    fetch,
    pull,
    clone,
  };
}
