/**
 * Unit tests for sync merge strategies.
 */

import { describe, it, expect } from "vitest"
import type { SyncPayload } from "@/lib/sync-types"
import { lastWriteWins, mergeCollections, mergeEnvironments, mergeHistory, mergeGeneric, mergePayloads } from "@/lib/sync-utils"

describe("lastWriteWins", () => {
  it("should pick local when local is newer", () => {
    const local: SyncPayload = { itemType: "workspace", itemId: "w1", data: { name: "A" }, updatedAt: 2 }
    const remote: SyncPayload = { itemType: "workspace", itemId: "w1", data: { name: "B" }, updatedAt: 1 }
    expect(lastWriteWins(local, remote)).toBe(local)
  })

  it("should pick remote when remote is newer", () => {
    const local: SyncPayload = { itemType: "workspace", itemId: "w1", data: { name: "A" }, updatedAt: 1 }
    const remote: SyncPayload = { itemType: "workspace", itemId: "w1", data: { name: "B" }, updatedAt: 2 }
    expect(lastWriteWins(local, remote)).toBe(remote)
  })
})

describe("mergeCollections", () => {
  it("should union requests from both collections", () => {
    const local: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: {
        id: "c1",
        name: "Local",
        requests: [{ id: "r1", name: "Req1", method: "GET", url: "http://a", endpoint: "/a", createdAt: 1, updatedAt: 1 }],
        color: "slate",
        icon: "folder",
        createdAt: 1,
        updatedAt: 1,
      },
      updatedAt: 1,
    }
    const remote: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: {
        id: "c1",
        name: "Remote",
        requests: [{ id: "r2", name: "Req2", method: "POST", url: "http://b", endpoint: "/b", createdAt: 2, updatedAt: 2 }],
        color: "red",
        icon: "box",
        createdAt: 1,
        updatedAt: 2,
      },
      updatedAt: 2,
    }
    const result = mergeCollections(local, remote)
    expect(result.itemType).toBe("collection")
    expect(result.itemId).toBe("c1")
    const mergedData = result.data as { requests: { id: string }[] }
    expect(mergedData.requests).toHaveLength(2)
    expect(mergedData.requests.map((r) => r.id)).toContain("r1")
    expect(mergedData.requests.map((r) => r.id)).toContain("r2")
  })

  it("should prefer newer request when same id", () => {
    const local: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: {
        id: "c1",
        name: "Local",
        requests: [{ id: "r1", name: "Req1-Local", method: "GET", url: "http://a", endpoint: "/a", createdAt: 1, updatedAt: 1 }],
        color: "slate",
        icon: "folder",
        createdAt: 1,
        updatedAt: 1,
      },
      updatedAt: 1,
    }
    const remote: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: {
        id: "c1",
        name: "Remote",
        requests: [{ id: "r1", name: "Req1-Remote", method: "GET", url: "http://a", endpoint: "/a", createdAt: 1, updatedAt: 3 }],
        color: "slate",
        icon: "folder",
        createdAt: 1,
        updatedAt: 2,
      },
      updatedAt: 2,
    }
    const result = mergeCollections(local, remote)
    const mergedData = result.data as { requests: { name: string }[] }
    expect(mergedData.requests).toHaveLength(1)
    expect(mergedData.requests[0].name).toBe("Req1-Remote")
  })
})

describe("mergeEnvironments", () => {
  it("should merge env variables by key (remote wins when newer)", () => {
    const local: SyncPayload = {
      itemType: "environment",
      itemId: "e1",
      data: {
        id: "e1",
        name: "Env",
        color: "slate",
        variables: [
          { key: "A", value: "local-a", enabled: true },
          { key: "B", value: "local-b", enabled: true },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      updatedAt: 1,
    }
    const remote: SyncPayload = {
      itemType: "environment",
      itemId: "e1",
      data: {
        id: "e1",
        name: "Env",
        color: "slate",
        variables: [
          { key: "B", value: "remote-b", enabled: true },
          { key: "C", value: "remote-c", enabled: true },
        ],
        createdAt: 1,
        updatedAt: 3,
      },
      updatedAt: 3,
    }
    const result = mergeEnvironments(local, remote)
    const mergedVars = (result.data as { variables: { key: string; value: string }[] }).variables
    expect(mergedVars).toHaveLength(3)
    expect(mergedVars.find((v) => v.key === "A")?.value).toBe("local-a")
    expect(mergedVars.find((v) => v.key === "B")?.value).toBe("remote-b")
    expect(mergedVars.find((v) => v.key === "C")?.value).toBe("remote-c")
  })
})

describe("mergeHistory", () => {
  it("should append unique history items", () => {
    const local: SyncPayload = {
      itemType: "history",
      itemId: "hist-batch",
      data: [
        { id: "h1", method: "GET", url: "a", endpoint: "/a", executedAt: 1, createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    }
    const remote: SyncPayload = {
      itemType: "history",
      itemId: "hist-batch",
      data: [
        { id: "h2", method: "POST", url: "b", endpoint: "/b", executedAt: 2, createdAt: 2, updatedAt: 2 },
      ],
      updatedAt: 2,
    }
    const result = mergeHistory(local, remote)
    const merged = result.data as { id: string }[]
    expect(merged).toHaveLength(2)
    expect(merged.map((h) => h.id)).toContain("h1")
    expect(merged.map((h) => h.id)).toContain("h2")
  })
})

describe("mergePayloads (dispatcher)", () => {
  it("should return last-write-wins for workspace", () => {
    const local: SyncPayload = { itemType: "workspace", itemId: "w1", data: {}, updatedAt: 2 }
    const remote: SyncPayload = { itemType: "workspace", itemId: "w1", data: {}, updatedAt: 1 }
    const { winner, needsManualResolution } = mergePayloads(local, remote, "dev1")
    expect(winner.updatedAt).toBe(2)
    expect(needsManualResolution).toBe(false)
  })

  it("should return collection merge with needsManualResolution when timestamps are equal", () => {
    const local: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: { id: "c1", name: "Local", requests: [], color: "slate", icon: "folder", createdAt: 1, updatedAt: 5 },
      updatedAt: 5,
    }
    const remote: SyncPayload = {
      itemType: "collection",
      itemId: "c1",
      data: { id: "c1", name: "Remote", requests: [], color: "slate", icon: "folder", createdAt: 1, updatedAt: 5 },
      updatedAt: 5,
    }
    const { winner, needsManualResolution } = mergePayloads(local, remote, "dev1")
    expect(winner.itemType).toBe("collection")
    expect(needsManualResolution).toBe(true)
  })
})
