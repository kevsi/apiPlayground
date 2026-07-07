import { describe, it, expect, vi } from "vitest"
import { CollectionStore } from "./store.js"
import type { RequestItem } from "./types.js"

describe("CollectionStore", () => {
  it("loads collections and environments from bundle", () => {
    const store = new CollectionStore()
    store.loadFromBundle({
      version: "1.0",
      collections: [
        {
          id: "col-1",
          name: "API",
          color: "blue",
          icon: "folder",
          requests: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      environments: [
        { id: "env-1", name: "dev", variables: [{ key: "base", value: "https://dev.example.com", enabled: true }] },
      ],
    })

    expect(store.getCollections()).toHaveLength(1)
    expect(store.getEnvironments()).toHaveLength(1)
    expect(store.getEnvironment("dev")?.variables[0]?.value).toBe("https://dev.example.com")
  })

  it("finds a request across collections", () => {
    const store = new CollectionStore()
    const request: RequestItem = {
      id: "req-1",
      name: "Get user",
      method: "GET",
      url: "https://example.com/users",
      endpoint: "https://example.com/users",
      createdAt: 1,
      updatedAt: 1,
    }
    const collection = store.addCollection("Test")
    store.addRequest(collection.id, request)

    const found = store.findRequestById(request.id)
    expect(found?.request.id).toBe(request.id)
    expect(found?.collection.id).toBe(collection.id)
  })

  it("calls persist callback on mutations", () => {
    const store = new CollectionStore()
    const persist = vi.fn()
    store.setPersistCallback(persist)

    const collection = store.addCollection("Test")
    expect(persist).toHaveBeenCalled()

    store.addRequest(collection.id, {
      id: "req-1",
      name: "X",
      method: "GET",
      url: "https://example.com",
      endpoint: "https://example.com",
      createdAt: 1,
      updatedAt: 1,
    })
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it("duplicates a collection with new IDs", () => {
    const store = new CollectionStore()
    const collection = store.addCollection("Original")
    store.addRequest(collection.id, {
      id: "req-1",
      name: "X",
      method: "GET",
      url: "https://example.com",
      endpoint: "https://example.com",
      createdAt: 1,
      updatedAt: 1,
    })

    const clone = store.duplicateCollection(collection.id)
    expect(clone.id).not.toBe(collection.id)
    expect(clone.name).toBe("Original (copy)")
    expect(clone.requests[0]?.id).not.toBe("req-1")
  })

  it("throws when collection not found", () => {
    const store = new CollectionStore()
    expect(store.getCollection("missing")).toBeUndefined()
    expect(() => store.updateCollection("missing", { name: "x" })).toThrow("Collection not found")
  })

  it("serializes a bundle", () => {
    const store = new CollectionStore()
    store.addCollection("C1")
    store.addEnvironment("prod")

    const bundle = store.serializeBundle()
    expect(bundle.collections).toHaveLength(1)
    expect(bundle.environments).toHaveLength(1)
    expect(bundle.version).toBe("1.0")
  })
})
