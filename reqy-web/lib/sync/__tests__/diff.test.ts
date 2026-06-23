import { describe, it, expect } from "vitest"
import { diffSyncEntities } from "@/lib/sync/diff"

describe("diffSyncEntities", () => {
  it("remote newer — upsert remote locally", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote = [{ id: "1", data: { x: 1 }, updatedAt: 200, version: 2 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertRemote).toHaveLength(1)
    expect(r.toUpsertLocal).toHaveLength(0)
  })

  it("local newer — push local", () => {
    const local = [{ id: "1", data: { x: 2 }, updatedAt: 200, version: 2 }]
    const remote = [{ id: "1", data: { x: 1 }, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertLocal).toHaveLength(1)
    expect(r.toUpsertRemote).toHaveLength(0)
  })

  it("equal timestamps — unchanged", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.unchanged).toHaveLength(1)
  })

  it("remote-only entity — upsert remote", () => {
    const local: any[] = []
    const remote = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertRemote).toHaveLength(1)
  })

  it("local-only entity — push local", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote: any[] = []
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertLocal).toHaveLength(1)
  })

  it("remote delete — delete locally", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote = [{ id: "1", data: {}, updatedAt: 200, version: 2, deleted: true }]
    const r = diffSyncEntities(local, remote)
    expect(r.toDeleteRemote).toHaveLength(1)
  })
})
