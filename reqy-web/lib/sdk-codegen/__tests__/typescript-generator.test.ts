import { describe, it, expect } from "vitest"
import { generateTypeScriptSdk } from "@/lib/sdk-codegen/typescript-generator"

describe("generateTypeScriptSdk", () => {
  it("returns 2 files (types.ts + client.ts)", () => {
    const spec = { info: { title: "Test API", version: "1.0.0" }, paths: {} }
    const files = generateTypeScriptSdk(spec as any)
    expect(files).toHaveLength(2)
    expect(files.map((f) => f.path)).toEqual(["types.ts", "client.ts"])
  })

  it("includes spec title and version in both files", () => {
    const spec = { info: { title: "My API", version: "2.0.0" }, paths: {} }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[0].content).toContain("My API")
    expect(files[0].content).toContain("2.0.0")
    expect(files[1].content).toContain("My API")
    expect(files[1].content).toContain("2.0.0")
  })

  it("generates TypeScript interfaces from components.schemas", () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          User: {
            type: "object",
            required: ["id", "email"],
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              age: { type: "number" },
            },
          },
        },
      },
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[0].content).toContain("export interface User")
    expect(files[0].content).toContain("id: string")
    expect(files[0].content).toContain("email: string")
    expect(files[0].content).toContain("age?: number")
  })

  it("generates fetch-based function for GET endpoints", () => {
    const spec = {
      paths: {
        "/users": {
          get: {
            operationId: "getUsers",
            responses: {},
          },
        },
      },
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[1].content).toContain("export async function getUsers")
    expect(files[1].content).toContain('method: "GET"')
    expect(files[1].content).toContain("fetch(url.toString()")
  })

  it("generates POST with body support", () => {
    const spec = {
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            responses: {},
          },
        },
      },
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[1].content).toContain("createUser")
    expect(files[1].content).toContain('method: "POST"')
    expect(files[1].content).toContain("JSON.stringify(options.body)")
  })

  it("handles path parameters", () => {
    const spec = {
      paths: {
        "/users/{id}": {
          get: {
            operationId: "getUserById",
            responses: {},
          },
        },
      },
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[1].content).toContain("getUserById(id: string")
    expect(files[1].content).toContain("${id}")
  })

  it("handles array types in schemas", () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          UserList: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
          User: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      },
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[0].content).toContain("User[]")
  })

  it("uses server URL from spec.servers", () => {
    const spec = {
      servers: [{ url: "https://api.example.com" }],
      paths: {},
    }
    const files = generateTypeScriptSdk(spec as any)
    expect(files[1].content).toContain('BASE_URL = "https://api.example.com"')
  })
})
