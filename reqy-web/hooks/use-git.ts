"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { init, add, commit, log, statusMatrix, readCommit, readBlob, resolveRef, getConfig, setConfig } from "isomorphic-git"
import { getGitFs, getGitDir, syncCollectionsToFs } from "@/lib/git-fs"
import type { Collection } from "@/hooks/use-request-store"

export interface GitCommit {
  oid: string
  message: string
  author: { name: string; email: string; timestamp: number }
  committer: { name: string; email: string; timestamp: number }
}

export interface FileStatus {
  filepath: string
  head: 0 | 1
  workdir: 0 | 1 | 2
  stage: 0 | 1 | 2 | 3
}

export interface DiffEntry {
  filepath: string
  lines: Array<{ type: "add" | "remove" | "context"; text: string }>
}

export interface GitState {
  isInitialized: boolean
  currentBranch: string
  commits: GitCommit[]
  status: FileStatus[]
  error: string | null
}

const DEFAULT_AUTHOR_NAME = "Reqly User"
const DEFAULT_AUTHOR_EMAIL = "user@reqly.local"

export function useGit(collections: Collection[]) {
  const [state, setState] = useState<GitState>({
    isInitialized: false,
    currentBranch: "main",
    commits: [],
    status: [],
    error: null,
  })
  const loadingRef = useRef(false)
  const collectionsRef = useRef(collections)

  useEffect(() => {
    collectionsRef.current = collections
  }, [collections])

  const updateState = useCallback((partial: Partial<GitState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const checkInitialized = useCallback(async (): Promise<boolean> => {
    try {
      const fs = getGitFs()
      const dir = getGitDir()
      await fs.readdir(`${dir}/.git`)
      return true
    } catch {
      return false
    }
  }, [])

  const refreshLog = useCallback(async () => {
    const dir = getGitDir()
    const fs = getGitFs()
    try {
      const commits = await log({ fs, dir, depth: 50 })
      updateState({
        commits: commits.map((c) => ({
          oid: c.oid,
          message: c.commit.message,
          author: c.commit.author,
          committer: c.commit.committer,
        })),
      })
    } catch {
      updateState({ commits: [] })
    }
  }, [updateState])

  const refreshStatus = useCallback(async () => {
    const dir = getGitDir()
    const fs = getGitFs()
    try {
      const matrix = await statusMatrix({ fs, dir })
      updateState({
        status: matrix.map((row) => ({
          filepath: row[0] as string,
          head: row[1] as 0 | 1,
          workdir: row[2] as 0 | 1 | 2,
          stage: row[3] as 0 | 1 | 2 | 3,
        })),
      })
    } catch {
      updateState({ status: [] })
    }
  }, [updateState])

  const refreshBranch = useCallback(async () => {
    const dir = getGitDir()
    const fs = getGitFs()
    try {
      const branch = await resolveRef({ fs, dir, ref: "HEAD", depth: 1 })
      // HEAD may be detached; in that case keep 'main' as fallback
      const configBranch = await getConfig({ fs, dir, path: "init.defaultBranch" })
      updateState({ currentBranch: (configBranch as string | undefined) || "main" })
    } catch {
      updateState({ currentBranch: "main" })
    }
  }, [updateState])

  const initRepo = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    updateState({ error: null })
    try {
      const fs = getGitFs()
      const dir = getGitDir()
      await init({ fs, dir, defaultBranch: "main" })
      await setConfig({ fs, dir, path: "user.name", value: DEFAULT_AUTHOR_NAME })
      await setConfig({ fs, dir, path: "user.email", value: DEFAULT_AUTHOR_EMAIL })
      updateState({ isInitialized: true })
      await refreshLog()
      await refreshStatus()
      await refreshBranch()
    } catch (err: unknown) {
      updateState({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      loadingRef.current = false
    }
  }, [updateState, refreshLog, refreshStatus, refreshBranch])

  const doCommit = useCallback(
    async (message: string) => {
      if (loadingRef.current) return
      loadingRef.current = true
      updateState({ error: null })
      try {
        const fs = getGitFs()
        const dir = getGitDir()

        // Sync current collections to virtual FS
        await syncCollectionsToFs(collectionsRef.current as any)

        // Stage all changes
        await add({ fs, dir, filepath: "." })

        // Commit
        const sha = await commit({
          fs,
          dir,
          message,
          author: {
            name: DEFAULT_AUTHOR_NAME,
            email: DEFAULT_AUTHOR_EMAIL,
          },
        })

        if (!sha) {
          throw new Error("Nothing to commit")
        }

        await refreshLog()
        await refreshStatus()
      } catch (err: unknown) {
        updateState({ error: err instanceof Error ? err.message : String(err) })
      } finally {
        loadingRef.current = false
      }
    },
    [updateState, refreshLog, refreshStatus]
  )

  const diffCommits = useCallback(
    async (oidA: string, oidB: string): Promise<DiffEntry[]> => {
      const fs = getGitFs()
      const dir = getGitDir()

      const readTree = async (oid: string): Promise<Record<string, Uint8Array>> => {
        const commitObj = await readCommit({ fs, dir, oid })
        const tree = commitObj.commit.tree
        const { readTree: gitReadTree } = await import("isomorphic-git")
        const treeObj = await gitReadTree({ fs, dir, oid: tree })
        const files: Record<string, Uint8Array> = {}
        for (const entry of treeObj.tree) {
          if (entry.type === "blob") {
            const blob = await readBlob({ fs, dir, oid: entry.oid })
            files[entry.path] = blob.blob as Uint8Array
          }
        }
        return files
      }

      const [filesA, filesB] = await Promise.all([readTree(oidA), readTree(oidB)])
      const allPaths = new Set([...Object.keys(filesA), ...Object.keys(filesB)])
      const entries: DiffEntry[] = []

      for (const path of allPaths) {
        const aText = filesA[path] ? new TextDecoder().decode(filesA[path]) : ""
        const bText = filesB[path] ? new TextDecoder().decode(filesB[path]) : ""
        if (aText === bText) continue

        const aLines = aText.split("\n")
        const bLines = bText.split("\n")
        const lines: DiffEntry["lines"] = []

        // Simple LCS-based diff
        const lcs = computeLcs(aLines, bLines)
        let i = 0
        let j = 0
        for (const [ai, bj] of lcs) {
          while (i < ai) {
            lines.push({ type: "remove", text: aLines[i] })
            i++
          }
          while (j < bj) {
            lines.push({ type: "add", text: bLines[j] })
            j++
          }
          if (ai < aLines.length && bj < bLines.length) {
            lines.push({ type: "context", text: aLines[ai] })
          }
          i = ai + 1
          j = bj + 1
        }
        while (i < aLines.length) {
          lines.push({ type: "remove", text: aLines[i] })
          i++
        }
        while (j < bLines.length) {
          lines.push({ type: "add", text: bLines[j] })
          j++
        }

        entries.push({ filepath: path, lines })
      }

      return entries
    },
    []
  )

  // Auto-detect initialized repo on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const initialized = await checkInitialized()
      if (!cancelled) {
        updateState({ isInitialized: initialized })
        if (initialized) {
          await refreshLog()
          await refreshStatus()
          await refreshBranch()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [checkInitialized, refreshLog, refreshStatus, refreshBranch, updateState])

  return {
    ...state,
    init: initRepo,
    commit: doCommit,
    log: refreshLog,
    refreshStatus,
    diff: diffCommits,
  }
}

function computeLcs(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length
  const n = b.length
  // To keep memory bounded, use a 2-column DP
  const prev = new Array(n + 1).fill(0)
  const curr = new Array(n + 1).fill(0)
  let maxLen = 0
  let maxI = 0

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1])
      }
      if (curr[j] > maxLen) {
        maxLen = curr[j]
        maxI = i
      }
    }
    for (let k = 0; k <= n; k++) {
      prev[k] = curr[k]
    }
    curr.fill(0)
  }

  // If sequences are small enough, reconstruct exact LCS; otherwise greedy fallback
  if (m * n < 1_000_000) {
    return reconstructLcs(a, b)
  }

  // Greedy fallback for large files: return matches starting from maxI
  const result: Array<[number, number]> = []
  let i = maxI - maxLen
  let j = 0
  while (i < maxI) {
    const idx = b.indexOf(a[i], j)
    if (idx !== -1) {
      result.push([i, idx])
      j = idx + 1
    }
    i++
  }
  return result
}

function reconstructLcs(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  const result: Array<[number, number]> = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return result
}
