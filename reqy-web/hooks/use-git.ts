"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { Collection } from "@/hooks/use-request-store";

// ── Re-export des types pour les consommateurs (rétrocompatibilité) ─────

export type {
  GitCommit,
  FileStatus,
  DiffHunk,
  DiffFile,
  BranchInfo,
  RemoteInfo,
  GitState,
} from "@/lib/git/types";

// ── Hook — fine couche d'adaptation React autour de GitService ──────────

import { GitService } from "@/lib/git/git-service";
import { TauriGitBackend } from "@/lib/git/git-backend";
import type {
  GitCommit,
  FileStatus,
  BranchInfo,
  RemoteInfo,
  DiffFile,
  GitState,
} from "@/lib/git/types";

export function useGit(collections: Collection[]) {
  // Instance stable du service (créée une fois)
  const serviceRef = useRef<GitService | null>(null);
  if (!serviceRef.current) {
    serviceRef.current = new GitService(new TauriGitBackend());
  }
  const service = serviceRef.current;

  const [state, setState] = useState<GitState>(service.getState());

  // S'abonner aux changements d'état du service
  useEffect(() => {
    const unsub = service.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, [service]);

  // ── Auto-detect on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialized = await service.checkInitialized();
        if (!cancelled && initialized) {
          await service.refreshAll();
        }
      } catch {
        // Pas de repo
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  // ── Auto-sync collections to disk (debounced) ──────────────────────
  useEffect(() => {
    if (state.isInitialized && state.repoPath) {
      service.startAutoSync(collections, state.repoPath);
    }
    return () => service.stopAutoSync();
  }, [collections, state.isInitialized, state.repoPath, service]);

  // ── Callbacks stabilisés (délèguent au service) ────────────────────

  const initRepo = useCallback(
    async (repoPath: string) => {
      await service.init(repoPath);
      // Sync collections immediately after init
      await service.syncCollections(collections, repoPath);
    },
    [service, collections],
  );

  const openRepo = useCallback(
    async (repoPath: string) => {
      await service.open(repoPath);
      await service.syncCollections(collections, repoPath);
    },
    [service, collections],
  );

  const doCommit = useCallback(
    async (message: string, authorName?: string, authorEmail?: string) => {
      // Safeguard: sync one last time before commit
      const path = state.repoPath;
      if (path) await service.syncCollections(collections, path);
      return await service.commit(message, authorName, authorEmail);
    },
    [service, collections, state.repoPath],
  );

  const doStage = useCallback(async (filepath: string) => service.stage(filepath), [service]);

  const doStageAll = useCallback(async () => service.stageAll(), [service]);

  const doUnstage = useCallback(async (filepath: string) => service.unstage(filepath), [service]);

  const doBranchCreate = useCallback(
    async (name: string, fromOid?: string) => service.branchCreate(name, fromOid),
    [service],
  );

  const doBranchDelete = useCallback(async (name: string) => service.branchDelete(name), [service]);

  const doBranchSwitch = useCallback(async (name: string) => service.branchSwitch(name), [service]);

  const doRemoteAdd = useCallback(
    async (name: string, url: string) => service.remoteAdd(name, url),
    [service],
  );

  const doRemoteRemove = useCallback(async (name: string) => service.remoteRemove(name), [service]);

  const doLsRemote = useCallback(
    async (url: string): Promise<string[]> => service.lsRemote(url),
    [service],
  );

  const doPush = useCallback(
    async (remote: string, branch: string) => service.push(remote, branch),
    [service],
  );

  const doForcePush = useCallback(
    async (remote: string, branch: string) => service.forcePush(remote, branch),
    [service],
  );

  const doPull = useCallback(
    async (remote: string, branch: string) => service.pull(remote, branch),
    [service],
  );

  const doFetch = useCallback(async (remote: string) => service.fetch(remote), [service]);

  const doClone = useCallback(
    async (url: string, destPath: string): Promise<void> => {
      await service.clone(url, destPath);
      await service.syncCollections(collections, destPath);
    },
    [service, collections],
  );

  const doDiff = useCallback(
    async (oidA: string, oidB: string): Promise<DiffFile[]> => service.diff(oidA, oidB),
    [service],
  );

  const doRefresh = useCallback(async () => service.refreshAll(), [service]);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    ...state,
    init: initRepo,
    open: openRepo,
    commit: doCommit,
    log: doRefresh,
    refreshStatus: doRefresh,
    diff: doDiff,
    stage: doStage,
    stageAll: doStageAll,
    unstage: doUnstage,
    branchCreate: doBranchCreate,
    branchDelete: doBranchDelete,
    branchSwitch: doBranchSwitch,
    remoteAdd: doRemoteAdd,
    remoteRemove: doRemoteRemove,
    lsRemote: doLsRemote,
    push: doPush,
    forcePush: doForcePush,
    fetch: doFetch,
    pull: doPull,
    clone: doClone,
  };
}
