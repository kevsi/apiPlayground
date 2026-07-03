import { describe, it, expect, beforeEach } from "vitest"
import type { MockRoute } from "@/lib/mock-types"
import {
  convertMockRoutesToEnvironment,
  environmentToJson,
  resetUuidCounter,
} from "@/lib/mockoon/adapter"

describe("convertMockRoutesToEnvironment", () => {
  beforeEach(() => {
    resetUuidCounter()
  })

  it("converts a simple GET route", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Get user",
        method: "GET",
        pathPattern: "/users/:id",
        responseStatus: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: JSON.stringify({ id: "1", name: "Alice" }),
        contentType: "application/json",
        delay: 0,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })

    expect(env.name).toBe("test")
    expect(env.port).toBe(9001)
    expect(env.routes).toHaveLength(1)
    expect(env.routes[0].method).toBe("GET")
    expect(env.routes[0].endpoint).toBe("/users/:id")
    expect(env.routes[0].responses[0].statusCode).toBe(200)
  })

  it("ignores disabled routes", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Disabled route",
        method: "GET",
        pathPattern: "/disabled",
        responseStatus: 200,
        responseHeaders: {},
        responseBody: "",
        contentType: "text/plain",
        delay: 0,
        enabled: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })
    expect(env.routes).toHaveLength(0)
  })

  it("converts variants to additional responses", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Varianted route",
        method: "GET",
        pathPattern: "/lottery",
        responseStatus: 200,
        responseHeaders: {},
        responseBody: "{ \"result\": \"base\" }",
        contentType: "application/json",
        delay: 10,
        enabled: true,
        variants: [
          {
            id: "v1",
            name: "win",
            weight: 1,
            responseStatus: 200,
            responseHeaders: {},
            responseBody: "{ \"result\": \"win\" }",
            contentType: "application/json",
            delay: 0,
          },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })
    expect(env.routes[0].responses).toHaveLength(2)
  })
})

describe("environmentToJson", () => {
  it("serializes environment to JSON", () => {
    const env = convertMockRoutesToEnvironment([], { name: "empty", port: 9001 })
    const json = environmentToJson(env)
    expect(json).toContain('"name": "empty"')
    expect(JSON.parse(json).port).toBe(9001)
  })
})
